import { mkdirSync, writeFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { sql } from '../../../supabase/tests/helpers/sql';
import { cleanupFixtureOrders, clientFor, ensureFixtures, ensureTestUsers, hideFixtures } from './helpers';

/**
 * M6 TASARIM KAPISI — admin kabuğu + canlı durum (Görev 21, spec §8.4).
 *
 * Bu dosya ÜRÜN KODU DEĞİL, denetim aracıdır: hiçbir şey düzeltmez; panonun DOLU hâlini belgeler
 * ve `@axe-core/playwright` ile WCAG A/AA tarar. `design-gate.spec.ts` (M3/M4) ile aynı kalıbı
 * izler; sahnesini kendi kurar çünkü kapıda ekran BOŞ değerlendirilmemeli.
 *
 * YAZICI: çalışan ajan YOK. Kurulan siparişlerin fiş işleri kuyrukta kalır ve kâğıda gitmez.
 * `settings` OKUNMAZ ve YAZILMAZ; `enqueue_test_print` ÇAĞRILMAZ (buton yalnız görüntüde durur).
 * `printer_status.last_error` R79 uyarısını göstermek için kısa süre yazılır ve `finally`'de
 * ÖNCEKİ DEĞERİNE geri konur.
 *
 * Koşma biçimi (iki proje aynı fikstürü kurup sildiği için ayrı komutlar):
 *   npx playwright test m6-admin-gate --project=desktop
 *   npx playwright test m6-admin-gate --project=phone
 */

const PASSWORD = process.env.TEST_USER_PASSWORD ?? '';
const SHOT = (name: string) => `../../docs/screenshots/${name}`;
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21aa'];
const AXE_DIR = 'test-results/design-gate';
/** R79 uyarısını görünür kılmak için geçici olarak yazılan işaret; teardown bunu geri alır. */
const STUCK_MARKER = 'complete_stuck_92s;ECONNRESET';

interface AxeSummary {
  screen: string;
  violations: { id: string; impact: string | null | undefined; nodes: string[] }[];
  incomplete: { id: string; nodes: string[] }[];
}

const summaries: AxeSummary[] = [];

async function scan(page: Page, screen: string): Promise<void> {
  const result = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  summaries.push({
    screen,
    violations: result.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      nodes: v.nodes.map((n) => n.target.join(' ')),
    })),
    incomplete: result.incomplete.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target.join(' ')) })),
  });
}

function writeAxeReport(file: string): void {
  mkdirSync(AXE_DIR, { recursive: true });
  writeFileSync(`${AXE_DIR}/${file}`, JSON.stringify(summaries, null, 2), 'utf8');
  for (const s of summaries) {
    const ids = s.violations.map((v) => `${v.id}(${v.nodes.length})`).join(', ');
    console.log(`[axe] ${s.screen}: ${s.violations.length} ihlal${ids ? ` — ${ids}` : ''}`);
  }
}

function logMetrics(label: string, data: Record<string, unknown>): void {
  console.log(`[ölçüm] ${label}: ${JSON.stringify(data)}`);
}

/** Bir seçicinin tüm örneklerinin kutu ölçüleri (dokunma hedefi ve taşma ölçümü için). */
async function boxes(page: Page, selector: string): Promise<{ w: number; h: number }[]> {
  const items = page.locator(selector);
  const n = await items.count();
  const out: { w: number; h: number }[] = [];
  for (let i = 0; i < n; i++) {
    const box = await items.nth(i).boundingBox();
    if (box) out.push({ w: Math.round(box.width), h: Math.round(box.height) });
  }
  return out;
}

/** Yatay taşma: gövde kaydırma genişliği görünen alandan büyük mü (BUILD-PROMPT §10 / `horizontal-scroll`). */
async function horizontalOverflow(page: Page): Promise<{ scrollWidth: number; clientWidth: number }> {
  // İfade METİN olarak veriliyor: e2e tsconfig'i `lib: ["ES2023"]` ile derleniyor, DOM tipleri yok.
  return page.evaluate<{ scrollWidth: number; clientWidth: number }>(
    '({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth })',
  );
}

// --------------------------------------------------------------------------------------------
// Sahne
// --------------------------------------------------------------------------------------------

interface MenuRow {
  id: string;
  code: string | null;
  variants: { id: string; is_default: boolean }[] | null;
  groups: { gid: string; min: number; max: number; opts: string[] }[] | null;
  ingredients: string[] | null;
}

interface SceneItem {
  product_id: string;
  variant_id: string | null;
  quantity: number;
  option_ids: string[];
  removed_ingredient_ids: string[];
}

async function loadMenu(codes: string[]): Promise<Map<string, MenuRow>> {
  const list = codes.map((c) => `'${c}'`).join(',');
  const rows = await sql<MenuRow>(`
    select p.id, p.code,
      (select json_agg(json_build_object('id', v.id, 'is_default', v.is_default) order by v.sort)
         from public.product_variants v where v.product_id = p.id) variants,
      (select json_agg(json_build_object('gid', g.id, 'min', g.min_select, 'max', g.max_select,
                'opts', (select json_agg(o.id order by o.sort) from public.options o where o.group_id = g.id))
                order by pog.sort)
         from public.product_option_groups pog join public.option_groups g on g.id = pog.group_id
        where pog.product_id = p.id) groups,
      (select json_agg(pi.ingredient_id order by pi.sort)
         from public.product_ingredients pi where pi.product_id = p.id) ingredients
      from public.products p where p.code in (${list})`);
  return new Map(rows.map((r) => [r.code ?? r.id, r]));
}

function buildItem(
  row: MenuRow,
  opts: { quantity?: number; lastVariant?: boolean; extraOptions?: boolean; removed?: number } = {},
): SceneItem {
  const variants = row.variants ?? [];
  const variant = opts.lastVariant ? variants[variants.length - 1] : (variants.find((v) => v.is_default) ?? variants[0]);
  const optionIds: string[] = [];
  for (const g of row.groups ?? []) {
    const options = g.opts ?? [];
    if (g.min > 0) optionIds.push(...options.slice(0, Math.min(g.min, options.length)));
    else if (opts.extraOptions && options.length > 0) optionIds.push(options[0]!);
  }
  return {
    product_id: row.id,
    variant_id: variant?.id ?? null,
    quantity: opts.quantity ?? 1,
    option_ids: optionIds,
    removed_ingredient_ids: (row.ingredients ?? []).slice(0, opts.removed ?? 0),
  };
}

interface Scene {
  soldOutIds: string[];
  previousLastError: string | null;
}

/**
 * Gerçekçi bir servis anı (hepsi `Test-Tisch%` / `test-%` fikstürleriyle):
 *  - 4 açık masa: dolu masa (2 tur + iptal kalem), HAZIR masa, 47 dk'lık masa, yeni masa
 *  - denetim kaydı: session_open · order_submit · item_cancel · order_ready · product_sold_out
 *  - yazıcı kartı: gerçek `printer_status` satırı (ajan durmuş → "çevrimdışı") + 2 başarısız iş
 *    + R79 "onay takıldı" işareti
 */
async function seedScene(): Promise<Scene> {
  await ensureTestUsers();
  await ensureFixtures();
  await cleanupFixtureOrders();

  await sql(`
    insert into public.dining_tables (name, sort) values ('Test-Tisch-3', 902), ('Test-Tisch-4', 903)
    on conflict (name) do update set is_active = true;`);

  const tableRows = await sql<{ name: string; id: string }>(
    `select name, id from public.dining_tables where name like 'Test-Tisch%'`,
  );
  const tableIds = Object.fromEntries(tableRows.map((r) => [r.name, r.id]));

  const menu = await loadMenu(['M3', '08', '89', '21', '01', '51', '19']);
  const drinkId = (await sql<{ id: string }>(`
    select p.id from public.products p join public.categories c on c.id = p.category_id
     where c.slug = 'c-kalte-getraenke' order by p.sort limit 1`))[0]!.id;
  const drink: SceneItem = { product_id: drinkId, variant_id: null, quantity: 2, option_ids: [], removed_ingredient_ids: [] };

  const waiter = await clientFor('waiter');
  const kitchen = await clientFor('kitchen');

  const submit = async (tableId: string, items: SceneItem[], note?: string) => {
    const orderId = crypto.randomUUID();
    const { error } = await waiter.rpc('submit_order', {
      p_order_id: orderId,
      p_table_id: tableId,
      p_items: items,
      ...(note ? { p_note: note } : {}),
    });
    if (error) throw new Error(`submit_order: ${error.message}`);
    return orderId;
  };

  // 1) Dolu masa: 1. tur (5 kalem) + 2. tur (ek sipariş) + iptal edilmiş kalem
  await submit(
    tableIds['Test-Tisch']!,
    [
      buildItem(menu.get('08')!, { quantity: 2, lastVariant: true, extraOptions: true, removed: 2 }),
      buildItem(menu.get('M3')!, { quantity: 1, extraOptions: true, removed: 1 }),
      buildItem(menu.get('89')!, { quantity: 1, removed: 3 }),
      buildItem(menu.get('01')!, { quantity: 3 }),
      drink,
    ],
    'Tisch 1 zusammen abrechnen',
  );
  await submit(tableIds['Test-Tisch']!, [buildItem(menu.get('21')!, { quantity: 1 }), buildItem(menu.get('51')!)]);

  const soupItem = (await sql<{ id: string }>(`
    select oi.id from public.order_items oi
      join public.orders o on o.id = oi.order_id
      join public.table_sessions ts on ts.id = o.session_id
      join public.dining_tables t on t.id = ts.table_id
      join public.products p on p.id = oi.product_id
     where t.name = 'Test-Tisch' and p.code = '01' limit 1`))[0]!.id;
  const { error: cancelError } = await waiter.rpc('cancel_order_item', {
    p_item_id: soupItem,
    p_reason: 'Gast hat storniert',
  });
  if (cancelError) throw new Error(`cancel_order_item: ${cancelError.message}`);

  // 2) HAZIR masa (altın rozet)
  const readyOrderId = await submit(tableIds['Test-Tisch-2']!, [
    buildItem(menu.get('19')!, { quantity: 1, extraOptions: true }),
    drink,
  ]);
  const { error: readyError } = await kitchen.rpc('mark_order_ready', { p_order_id: readyOrderId });
  if (readyError) throw new Error(`mark_order_ready: ${readyError.message}`);

  // 3) Mutfakta bekleyen iki masa daha
  await submit(tableIds['Test-Tisch-3']!, [
    buildItem(menu.get('08')!, { quantity: 1, lastVariant: true, extraOptions: true, removed: 2 }),
    buildItem(menu.get('M3')!, { quantity: 2 }),
  ]);
  await submit(tableIds['Test-Tisch-4']!, [buildItem(menu.get('21')!, { quantity: 4 })], 'schnell bitte');

  // "Süre" sütunu anlamlı görünsün diye oturumlar geriye alınır (service_role, yalnız test verisi).
  await sql(`
    update public.table_sessions ts set opened_at = now() - interval '47 minutes'
      from public.dining_tables t where t.id = ts.table_id and t.name = 'Test-Tisch';
    update public.table_sessions ts set opened_at = now() - interval '23 minutes'
      from public.dining_tables t where t.id = ts.table_id and t.name = 'Test-Tisch-3';`);

  // 4) Denetim kaydı zenginleşsin (product_sold_out / product_available)
  const soldOut = await sql<{ id: string }>(`select id from public.products where code in ('02', '45')`);
  const soldOutIds = soldOut.map((r) => r.id);
  for (const id of soldOutIds) {
    const { error } = await kitchen.rpc('set_product_sold_out', { p_product_id: id, p_sold_out: true });
    if (error) throw new Error(`set_product_sold_out: ${error.message}`);
  }

  // 5) Yazıcı kartı: iki fiş işi "basılamadı" durumuna alınır (yalnız test masalarının işleri).
  await sql(`
    update public.print_jobs set status = 'failed', attempts = 6, last_error = 'ETIMEDOUT'
     where id in (
       select pj.id from public.print_jobs pj
         join public.orders o on o.id = pj.order_id
         join public.table_sessions ts on ts.id = o.session_id
         join public.dining_tables t on t.id = ts.table_id
        where t.name like 'Test-Tisch%' order by pj.created_at limit 2);`);

  // 6) R79 işareti — ÖNCEKİ değer saklanır, `finally`'de geri konur. Önceki koşu yarıda kaldıysa
  //    alanda ZATEN bu işaret durabilir; o hâlde "önceki değer" olarak kabul edilmez, yoksa işaret
  //    koşudan koşuya kalıcılaşır (cırcır etkisi).
  const current =
    (await sql<{ last_error: string | null }>(`select last_error from public.printer_status where id = 'main'`))[0]
      ?.last_error ?? null;
  const previousLastError = current === STUCK_MARKER ? null : current;
  await sql(`update public.printer_status set last_error = '${STUCK_MARKER}' where id = 'main'`);

  return { soldOutIds, previousLastError };
}

async function teardownScene(scene: Scene | null): Promise<void> {
  if (scene) {
    for (const id of scene.soldOutIds) await sql(`update public.products set is_sold_out = false where id = '${id}'`);
    const value = scene.previousLastError === null ? 'null' : `'${scene.previousLastError.replace(/'/g, "''")}'`;
    await sql(`update public.printer_status set last_error = ${value} where id = 'main'`);
  }
  await cleanupFixtureOrders();
  await sql(`
    delete from public.dining_tables where name in ('Test-Tisch-3', 'Test-Tisch-4');
    update public.profiles set locale = 'tr' where username like 'test-%' and locale <> 'tr';`);
  await hideFixtures();
}

async function loginAs(page: Page, username: string, url: RegExp): Promise<void> {
  await page.goto('/login');
  await page.getByLabel(/kullanıcı adı/i).fill(username);
  await page.getByLabel(/pin veya parola/i).fill(PASSWORD);
  await page.getByRole('button', { name: /giriş/i }).click();
  await expect(page).toHaveURL(url);
}

/** Pano verisinin gerçekten geldiğini bekler — boş ekranın görüntüsü alınmasın. */
async function waitForDashboard(page: Page): Promise<void> {
  // Veri geldiyse boş durum metinleri kaybolur — "yüklenirken boş ekran" tuzağına düşmeden beklenir.
  await expect(page.getByText(/Açık masa yok|Kein Tisch offen/)).toHaveCount(0);
  await expect(page.getByText(/Henüz hareket yok|Noch keine Aktivitäten/)).toHaveCount(0);
  await expect(page.getByTestId('printer-state')).toBeVisible();
  await expect(page.getByTestId('printer-stuck')).toBeVisible();
  await expect(page.getByRole('button', { name: /tekrar dene|nochmal versuchen/i }).first()).toBeVisible();
}

// --------------------------------------------------------------------------------------------
// M6 — masaüstü (1440×900)
// --------------------------------------------------------------------------------------------

test('M6 kapısı: admin canlı durum, masaüstü — görüntüler + WCAG AA', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'masaüstü kapısı yalnız 1440×900');
  test.setTimeout(300_000);

  let scene: Scene | null = null;
  try {
    scene = await seedScene();
    await loginAs(page, 'test-admin', /\/admin$/);

    // 0 — ilk yükleme anı: veri gelmeden ekran ne söylüyor? (M3/M4 kapısının (d) tuzağı)
    //     Ağ gerçek hayatta yavaş olabilir; burada bilerek geciktiriliyor, yoksa görüntü dolu çıkar.
    // Yalnız PANO sorguları geciktirilir; oturum/profil okuması geciktirilirse uygulama daha
    // açılış ekranında kalır ve ölçmek istediğimiz an hiç oluşmaz.
    const SLOW = /\/rest\/v1\/(audit_log|printer_status|print_jobs|rpc\/(table_overview|report_range))/;
    await page.route(SLOW, async (route) => {
      await new Promise((r) => setTimeout(r, 2500));
      // `unroute` bekleyen isteği iptal edebilir; gecikme bitince rota çoktan kapanmış olabilir.
      await route.continue().catch(() => undefined);
    });
    await page.reload();
    await expect(page.getByRole('heading', { name: /Canlı durum/ })).toBeVisible();
    await page.screenshot({ path: SHOT('m6-dashboard-loading-1440.png') });
    await page.unroute(SLOW);

    await waitForDashboard(page);
    await page.screenshot({ path: SHOT('m6-dashboard-1440.png'), fullPage: true });
    await scan(page, 'm6-dashboard-1440-tr');

    logMetrics('masaüstü (TR)', {
      yatay: await horizontalOverflow(page),
      açıkMasaSatırı: (await boxes(page, 'table tbody tr')).length,
      denetimSatırı: (await boxes(page, 'ol li')).length,
      başarısızİş: (await boxes(page, 'section li button')).length,
      menüBağlantısı: await boxes(page, 'nav a'),
    });

    // Almanca — DE metinleri TR'den uzun; taşma ve kesilme kontrolü
    await page.goto('/waiter/profile');
    await page.getByRole('button', { name: 'DE', exact: true }).click();
    await expect(page.getByRole('button', { name: /Dienst beenden|Dienst beginnen/ }).first()).toBeVisible();
    await page.goto('/admin');
    await waitForDashboard(page);
    await page.screenshot({ path: SHOT('m6-dashboard-de-1440.png'), fullPage: true });
    await scan(page, 'm6-dashboard-1440-de');
    logMetrics('masaüstü (DE)', {
      yatay: await horizontalOverflow(page),
      menüBağlantısı: await boxes(page, 'nav a'),
    });
  } finally {
    writeAxeReport('axe-m6-desktop.json');
    await teardownScene(scene);
  }
});

// --------------------------------------------------------------------------------------------
// M6 — telefon (390×844)
// --------------------------------------------------------------------------------------------

test('M6 kapısı: admin canlı durum, telefon — görüntüler + WCAG AA', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'telefon kapısı yalnız 390×844');
  test.setTimeout(300_000);

  let scene: Scene | null = null;
  try {
    scene = await seedScene();
    await loginAs(page, 'test-admin', /\/admin$/);
    await waitForDashboard(page);

    await page.screenshot({ path: SHOT('m6-dashboard-390.png'), fullPage: true });
    await scan(page, 'm6-dashboard-390-tr');
    logMetrics('telefon (TR)', {
      yatay: await horizontalOverflow(page),
      masaKartı: (await boxes(page, 'section ul li')).length,
      testFişiDüğmesi: await boxes(page, 'section button'),
    });

    // Çekmece açık — masaüstü sol menünün telefondaki karşılığı
    await page.getByRole('button', { name: 'Menüyü aç' }).click();
    const drawer = page.getByRole('dialog');
    await expect(drawer).toBeVisible();
    await page.screenshot({ path: SHOT('m6-dashboard-drawer-390.png') });
    await scan(page, 'm6-drawer-390-tr');
    logMetrics('çekmece (TR)', { bağlantı: await boxes(page, '[role="dialog"] nav a') });
    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();

    // Almanca telefon
    await page.goto('/waiter/profile');
    await page.getByRole('button', { name: 'DE', exact: true }).click();
    await expect(page.getByRole('button', { name: /Dienst beenden|Dienst beginnen/ }).first()).toBeVisible();
    await page.goto('/admin');
    await waitForDashboard(page);
    await page.screenshot({ path: SHOT('m6-dashboard-de-390.png'), fullPage: true });
    await scan(page, 'm6-dashboard-390-de');
    logMetrics('telefon (DE)', { yatay: await horizontalOverflow(page) });
  } finally {
    writeAxeReport('axe-m6-phone.json');
    await teardownScene(scene);
  }
});
