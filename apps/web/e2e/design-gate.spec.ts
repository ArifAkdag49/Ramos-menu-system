import { mkdirSync, writeFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { sql } from '../../../supabase/tests/helpers/sql';
import { cleanupFixtureOrders, clientFor, ensureFixtures, ensureTestUsers } from './helpers';

/**
 * M3/M4 TASARIM KAPISI (BUILD-PROMPT §7, §10) — ekran görüntüleri + WCAG AA taraması.
 *
 * Bu dosya ÜRÜN KODU DEĞİL, denetim aracıdır: hiçbir şey düzeltmez, yalnız garson ve mutfak
 * ekranlarının DOLU hâlini belgeler ve `@axe-core/playwright` ile tarar. Kapı raporundaki
 * bulgular buradan çıkan görüntülere ve `axe-*.json` çıktısına dayanır.
 *
 * Neden kendi sahnesini kurar: `waiter.spec.ts`/`kitchen.spec.ts` tek siparişlik bir akışı
 * doğrular; kapı ise "12 masa, geç kalmış sipariş, 2. tur, iptal edilmiş kalem, tükendi çekmecesi"
 * gibi ekranın gerçekten zorlandığı durumları ister (plan-2 progress: "kapıda ekranlar BOŞ
 * değerlendirilmemeli").
 *
 * YAZICI: çalışan ajan YOK. Kurulan siparişlerin fiş işleri kuyrukta `pending` kalır ve kâğıda
 * gitmez. `settings.printer_host` OKUNMAZ ve YAZILMAZ; hiçbir test fişi kuyruğa alınmaz.
 *
 * Koşma biçimi — iki proje AYRI komutlarla çalıştırılır, çünkü ikisi de aynı fikstür verisini
 * kurup siliyor:
 *   npx playwright test design-gate --project=phone
 *   npx playwright test design-gate --project=tablet
 */

const PASSWORD = process.env.TEST_USER_PASSWORD ?? '';
const SHOT = (name: string) => `../../docs/screenshots/${name}`;
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21aa'];
const AXE_DIR = 'test-results/design-gate';

interface AxeSummary {
  screen: string;
  violations: { id: string; impact: string | null | undefined; nodes: string[] }[];
  incomplete: { id: string; nodes: string[] }[];
}

const summaries: AxeSummary[] = [];

/** Tek ekranın WCAG A/AA taraması. Sonuç toplanır; test hiçbir ihlalde KIRILMAZ — kapı raporlar. */
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

/**
 * 2. tur — düzeltmelerin yan etkisini ölçer. Eleştiri "daha kalabalık göründü" gibi bir izlenim
 * değil, sayı olmalı: ürün satırı kaç piksel, ekrana kaç satır sığıyor, KDS kartları hangi tonda.
 */
function logMetrics(label: string, data: Record<string, unknown>): void {
  console.log(`[ölçüm] ${label}: ${JSON.stringify(data)}`);
}

/**
 * Bir seçicinin tüm örneklerinin kutu ölçüleri. `page.evaluate` kullanılmaz: e2e tsconfig'i
 * `lib: ["ES2023"]` ile derleniyor, DOM globalleri yok (`tsconfig.node.json`).
 */
async function boxes(page: Page, selector: string): Promise<{ top: number; bottom: number; height: number }[]> {
  const items = page.locator(selector);
  const n = await items.count();
  const out: { top: number; bottom: number; height: number }[] = [];
  for (let i = 0; i < n; i++) {
    const box = await items.nth(i).boundingBox();
    if (box) out.push({ top: Math.round(box.y), bottom: Math.round(box.y + box.height), height: Math.round(box.height) });
  }
  return out;
}

/** Görünen alana TAM sığan öğe sayısı. */
const fullyVisible = (list: { bottom: number }[], viewportHeight: number) =>
  list.filter((b) => b.bottom <= viewportHeight).length;

function writeAxeReport(file: string): void {
  mkdirSync(AXE_DIR, { recursive: true });
  writeFileSync(`${AXE_DIR}/${file}`, JSON.stringify(summaries, null, 2), 'utf8');
  for (const s of summaries) {
    const ids = s.violations.map((v) => `${v.id}(${v.nodes.length})`).join(', ');
    console.log(`[axe] ${s.screen}: ${s.violations.length} ihlal${ids ? ` — ${ids}` : ''}`);
  }
}

// --------------------------------------------------------------------------------------------
// Sahne kurulumu
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

/** Kod listesine göre menüyü çeker: varyant, seçim grubu ve malzeme kimlikleriyle. */
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

/**
 * Geçerli bir sipariş kalemi kurar: varsayılan varyant (ya da `lastVariant` ile ikincisi), her
 * zorunlu gruptan ilk seçenek, `extraOptions` ile isteğe bağlı gruplardan da birer seçenek ve
 * `removed` kadar malzeme çıkarılmış. Kural motoru sunucuda (`submit_order`) — burada yalnız
 * kurala uyan bir seçim üretiliyor.
 */
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
  tableIds: Record<string, string>;
  fullSessionId: string;
  soldOutIds: string[];
}

/**
 * Gerçekçi bir servis anı kurar (hepsi `Test-Tisch%` / `test-%` fikstürleriyle, cleanup süzgeci
 * bunların hepsini kapsar):
 *  - Test-Tisch     — dolu masa: 5 kalemli 1. tur + 2 kalemli 2. tur (Nachbestellung) + iptal kalem
 *  - Test-Tisch-2   — HAZIR sipariş (altın)
 *  - Test-Tisch-3   — 38 dk bekleyen sipariş → KDS'te `late` (kırmızı süre)
 *  - Test-Tisch-4   — 14 dk bekleyen sipariş → `warn` (turuncu süre)
 *  - Test-Tisch-5   — yeni sipariş → `ok` (lime)
 *  - 4 ürün "tükendi" (KDS tükendi çekmecesi dolu görünsün)
 */
async function seedScene(): Promise<Scene> {
  await ensureTestUsers();
  await ensureFixtures();
  await cleanupFixtureOrders();

  await sql(`
    insert into public.dining_tables (name, sort) values
      ('Test-Tisch-3', 902), ('Test-Tisch-4', 903), ('Test-Tisch-5', 904)
    on conflict (name) do update set is_active = true;`);

  const tableRows = await sql<{ name: string; id: string }>(
    `select name, id from public.dining_tables where name like 'Test-Tisch%'`,
  );
  const tableIds = Object.fromEntries(tableRows.map((r) => [r.name, r.id]));

  // Uzun Almanca ad (M3, 34 karakter) + çok gruplu ürün (08) + çok malzemeli ürün (89) bilerek
  // seçildi: satır sarması ve OHNE listesi gerçek menü verisiyle görünsün.
  const menu = await loadMenu(['M3', '08', '89', '21', '01', '51', '19']);
  const drinkId = (await sql<{ id: string }>(`
    select p.id from public.products p join public.categories c on c.id = p.category_id
     where c.slug = 'c-kalte-getraenke' order by p.sort limit 1`))[0]!.id;
  const drink: SceneItem = {
    product_id: drinkId,
    variant_id: null,
    quantity: 2,
    option_ids: [],
    removed_ingredient_ids: [],
  };

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

  // 1) Dolu masa — 1. tur
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
  // 2. tur (Nachbestellung)
  await submit(tableIds['Test-Tisch']!, [buildItem(menu.get('21')!, { quantity: 1 }), buildItem(menu.get('51')!)]);

  // Bir kalem iptal edilir (STORNO izi): 1. turun çorbası
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

  // 2) HAZIR masa
  const readyOrderId = await submit(tableIds['Test-Tisch-2']!, [
    buildItem(menu.get('19')!, { quantity: 1, extraOptions: true }),
    drink,
  ]);
  const { error: readyError } = await kitchen.rpc('mark_order_ready', { p_order_id: readyOrderId });
  if (readyError) throw new Error(`mark_order_ready: ${readyError.message}`);

  // 3–5) Mutfakta bekleyen üç sipariş: geç · uyarı · yeni
  const lateId = await submit(tableIds['Test-Tisch-3']!, [
    buildItem(menu.get('08')!, { quantity: 1, lastVariant: true, extraOptions: true, removed: 2 }),
    buildItem(menu.get('M3')!, { quantity: 2 }),
  ]);
  const warnId = await submit(tableIds['Test-Tisch-4']!, [buildItem(menu.get('89')!, { quantity: 1, removed: 4 })]);
  await submit(tableIds['Test-Tisch-5']!, [buildItem(menu.get('21')!, { quantity: 4 })], 'schnell bitte');

  // Süre tonlarını görebilmek için zaman damgaları geriye alınır (service_role; yalnız test verisi).
  await sql(`
    update public.orders set created_at = now() - interval '38 minutes' where id = '${lateId}';
    update public.orders set created_at = now() - interval '14 minutes' where id = '${warnId}';
    update public.table_sessions ts set opened_at = now() - interval '52 minutes'
      from public.dining_tables t where t.id = ts.table_id and t.name = 'Test-Tisch';
    update public.table_sessions ts set opened_at = now() - interval '41 minutes'
      from public.dining_tables t where t.id = ts.table_id and t.name = 'Test-Tisch-3';`);

  // 6) Tükendi ürünler — KDS çekmecesi dolu görünsün. Hepsi sonda geri alınır.
  const soldOut = await sql<{ id: string }>(
    `select id from public.products where code in ('02', '45', '56', 'M1')`,
  );
  const soldOutIds = soldOut.map((r) => r.id);
  for (const id of soldOutIds) {
    const { error } = await kitchen.rpc('set_product_sold_out', { p_product_id: id, p_sold_out: true });
    if (error) throw new Error(`set_product_sold_out: ${error.message}`);
  }

  const fullSessionId = (await sql<{ id: string }>(`
    select ts.id from public.table_sessions ts join public.dining_tables t on t.id = ts.table_id
     where t.name = 'Test-Tisch' and ts.status = 'open' limit 1`))[0]!.id;

  return { tableIds, fullSessionId, soldOutIds };
}

/** Sahneyi geri alır: siparişler, oturumlar, fiş kuyruğu, eklenen masalar, tükendi bayrakları. */
async function teardownScene(scene: Scene | null): Promise<void> {
  if (scene) {
    for (const id of scene.soldOutIds) {
      await sql(`update public.products set is_sold_out = false where id = '${id}'`);
    }
  }
  await cleanupFixtureOrders();
  await sql(`
    delete from public.dining_tables where name in ('Test-Tisch-3', 'Test-Tisch-4', 'Test-Tisch-5');
    update public.profiles set locale = 'tr' where username like 'test-%' and locale <> 'tr';`);
}

async function loginAs(page: Page, username: string, url: RegExp): Promise<void> {
  await page.goto('/login');
  await page.getByLabel(/kullanıcı adı/i).fill(username);
  await page.getByLabel(/pin/i).fill(PASSWORD);
  await page.getByRole('button', { name: /giriş/i }).click();
  await expect(page).toHaveURL(url);
}

// --------------------------------------------------------------------------------------------
// M3 — garson (390×844)
// --------------------------------------------------------------------------------------------

test('M3 kapısı: garson ekranları dolu sahnede — görüntüler + WCAG AA', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'garson kapısı yalnız telefon görünümünde');
  test.setTimeout(300_000);

  let scene: Scene | null = null;
  try {
    scene = await seedScene();

    await page.goto('/login');
    await scan(page, 'm3-login');

    await loginAs(page, 'test-waiter', /\/waiter$/);
    const startDuty = page.getByRole('button', { name: /mesaiye başla/i });
    if (await startDuty.isVisible().catch(() => false)) await startDuty.click();

    // 1 — masa ızgarası (dolu, hazır ve boş masalar bir arada)
    await expect(page.locator('button[data-tone="ready"]').first()).toBeVisible();
    await expect(page.locator('button[data-tone="open"]').first()).toBeVisible();
    // O1: sıra artık durumdan geliyor — hazır → açık → boş.
    await expect(page.locator('main button[data-tone]').first()).toHaveAttribute('data-tone', 'ready');
    await page.screenshot({ path: SHOT('m3-tables-390.png') });
    await scan(page, 'm3-tables');

    // 2 — "Açık" süzgeci (sıralamanın yanındaki ikinci yol)
    await page.getByRole('button', { name: 'Açık', exact: true }).click();
    await expect(page.locator('button[data-tone="free"]')).toHaveCount(0);
    await page.screenshot({ path: SHOT('m3-tables-filter-390.png') });
    await page.getByRole('button', { name: 'Tümü', exact: true }).click();

    // 3 — dolu masanın detayı: iki tur, iptal edilmiş kalem, yazdırma rozeti
    await page.getByRole('button', { name: /^Test-Tisch \d/ }).first().click();
    await expect(page).toHaveURL(/\/waiter\/table\//);
    await expect(page.getByRole('listitem').filter({ hasText: /#\d{3}/ }).first()).toBeVisible();
    await page.screenshot({ path: SHOT('m3-table-detail-390.png') });
    await scan(page, 'm3-table-detail');

    // 4 — sipariş girişi (gerçek menü, uzun Almanca adlar)
    await page.getByRole('button', { name: /sipariş ekle/i }).click();
    await expect(page).toHaveURL(/\/order$/);
    await expect(page.getByLabel(/ara/i)).toBeVisible();
    // 4a — menü verisi gelmeden ekranın hâli (iskelet/boş durum var mı?) — kapı için kanıt
    await page.screenshot({ path: SHOT('m3-order-loading-390.png') });
    // 4b — menü yüklendikten sonra
    await expect(page.getByRole('button', { name: /^ekle$|^seç$/i }).first()).toBeVisible();
    await page.screenshot({ path: SHOT('m3-order-menu-390.png') });
    await scan(page, 'm3-order-menu');
    // R2: `line-clamp-2` + fiyat/düğme alt satırı ürün satırını büyüttü mü, ekrana kaç ürün sığıyor?
    const rowBoxes = await boxes(page, 'li:has([data-testid="product-row-actions"])');
    logMetrics('ürün satırı (TR)', {
      satırSayısı: rowBoxes.length,
      ilkSatırYüksekliği: rowBoxes[0]?.height ?? null,
      enYüksekSatır: Math.max(...rowBoxes.map((b) => b.height)),
      tamGörünenSatır: fullyVisible(rowBoxes, 844),
      listeninBaşlangıcı: rowBoxes[0]?.top ?? null,
    });

    // 5 — ürün paneli: 08 Drehspieß Teller (4 seçim grubu, 5 malzeme, 2 varyant)
    await page.getByLabel(/ara/i).fill('08');
    await page.getByRole('button', { name: /^seç$/i }).first().click();
    const sheet = page.getByRole('dialog');
    await expect(sheet).toBeVisible();
    // 5a — AÇILIŞ hâli: zorunlu "Sos" grubu henüz seçilmedi. Ana eylem pasif; kapı bu anın
    // kullanıcıya ne söylediğini (ya da söylemediğini) değerlendirir.
    const addToCart = sheet.getByRole('button', { name: /sepete ekle/i });
    await expect(addToCart).toBeDisabled();
    await page.screenshot({ path: SHOT('m3-product-required-390.png') });
    await scan(page, 'm3-product-sheet-initial');

    // 5b — zengin seçim: Dana · Sarımsaklı + Otlu · Acılı · Ekstra peynir · ÇIKAR Soğan, Domates
    await sheet.getByRole('button', { name: /^dana/i }).click();
    await sheet.getByRole('button', { name: 'Sarımsaklı', exact: true }).click();
    await sheet.getByRole('button', { name: 'Otlu', exact: true }).click();
    await sheet.getByRole('button', { name: /acılı \(pul biber\)/i }).click();
    await sheet.getByRole('button', { name: /ekstra beyaz peynir/i }).click();
    await sheet.getByRole('button', { name: 'Soğan', exact: true }).click();
    await sheet.getByRole('button', { name: 'Domates', exact: true }).click();
    await sheet.getByRole('button', { name: /adeti artır/i }).click();
    await expect(addToCart).toBeEnabled();
    await page.screenshot({ path: SHOT('m3-product-sheet-390.png') });
    await scan(page, 'm3-product-sheet');
    await addToCart.click();

    // 6 — uzun Almanca adlı menü ürünü (M3 "Lahmacun Menü mit Drehspießfleisch")
    await page.getByLabel(/ara/i).fill('M3');
    await page.getByRole('button', { name: /^seç$/i }).first().click();
    const sheet2 = page.getByRole('dialog');
    await expect(sheet2).toBeVisible();
    await sheet2.getByRole('button', { name: /^tavuk/i }).click();
    await sheet2.getByRole('button', { name: 'Sarımsaklı', exact: true }).click();
    await sheet2.getByRole('button', { name: 'Cola', exact: true }).click();
    await sheet2.getByRole('button', { name: /sepete ekle/i }).click();

    // 7 — sepet
    await page.getByRole('button', { name: /sepet/i }).click();
    const cart = page.getByRole('dialog');
    await expect(cart.getByRole('button', { name: /mutfağa gönder/i })).toBeVisible();
    await page.screenshot({ path: SHOT('m3-cart-full-390.png') });
    await scan(page, 'm3-cart');
    // Devredilen bulgu (a): toast panelin üst kenarına değmemeli.
    const toastBox = await boxes(page, '[data-testid="toast-bubble"]');
    const sheetBox = await boxes(page, '[role="dialog"]');
    logMetrics('toast ↔ panel', {
      toast: toastBox[0] ? [toastBox[0].top, toastBox[0].bottom] : null,
      panelÜstü: sheetBox[0]?.top ?? null,
      boşluk: toastBox[0] && sheetBox[0] ? sheetBox[0].top - toastBox[0].bottom : null,
    });

    // 8 — onay paneli
    await cart.getByRole('button', { name: /mutfağa gönder/i }).click();
    await expect(page.getByRole('dialog').getByRole('button', { name: /onayla ve gönder/i })).toBeVisible();
    await page.screenshot({ path: SHOT('m3-confirm-full-390.png') });
    await scan(page, 'm3-confirm');
    await page.keyboard.press('Escape');

    // 8 — "Hazır" sekmesi dolu
    await page.goto('/waiter/ready');
    await expect(page.getByRole('button', { name: /teslim edildi/i }).first()).toBeVisible();
    await page.screenshot({ path: SHOT('m3-ready-390.png') });
    await scan(page, 'm3-ready');

    // 9 — profil + Almanca'ya geçiş (DE metinleri TR'den uzundur: taşma kontrolü)
    await page.goto('/waiter/profile');
    await page.screenshot({ path: SHOT('m3-profile-390.png') });
    await scan(page, 'm3-profile');

    // Dil değişimi bir RPC gidiş-dönüşüdür; Almanca metin gerçekten gelene kadar beklenir,
    // yoksa görüntüler hâlâ Türkçe çıkar.
    await page.getByRole('button', { name: 'DE', exact: true }).click();
    await expect(page.getByRole('button', { name: /Dienst beenden|Dienst beginnen/ })).toBeVisible();
    await page.goto('/waiter');
    await expect(page.locator('button[data-tone="ready"]').first()).toBeVisible();
    await page.screenshot({ path: SHOT('m3-tables-de-390.png') });
    await scan(page, 'm3-tables-de');

    await page.getByRole('button', { name: /^Test-Tisch \d/ }).first().click();
    await expect(page.getByRole('listitem').filter({ hasText: /#\d{3}/ }).first()).toBeVisible();
    await page.screenshot({ path: SHOT('m3-table-detail-de-390.png') });
    await scan(page, 'm3-table-detail-de');

    // 10 — Almanca sipariş girişi: "Hinzufügen"/"Auswählen" düğmeleri "Ekle"/"Seç"ten çok daha
    //      geniş; ürün adına kalan yer (zaten `truncate`) daha da daralıyor.
    await page.getByRole('button', { name: /Bestellung hinzufügen/ }).click();
    await expect(page.getByRole('button', { name: /^Hinzufügen$|^Auswählen$/ }).first()).toBeVisible();
    await page.screenshot({ path: SHOT('m3-order-menu-de-390.png') });
    await scan(page, 'm3-order-menu-de');
  } finally {
    writeAxeReport('axe-m3.json');
    await teardownScene(scene);
  }
});

// --------------------------------------------------------------------------------------------
// M4 — mutfak / KDS (1280×800)
// --------------------------------------------------------------------------------------------

test('M4 kapısı: KDS dolu mutfak ekranı — görüntüler + WCAG AA', async ({ page }, info) => {
  test.skip(info.project.name !== 'tablet', 'KDS kapısı yalnız 1280×800 tablet görünümünde');
  test.setTimeout(300_000);

  let scene: Scene | null = null;
  try {
    scene = await seedScene();

    await loginAs(page, 'test-kitchen', /\/kitchen$/);
    await page.screenshot({ path: SHOT('m4-kds-start-1280.png') });
    await page.getByRole('button', { name: /başlat|starten/i }).click();

    // 1 — dolu mutfak: birden çok kart, geç kalmış kart (kırmızı kart tonu), HAZIR sütunu
    await expect(page.getByRole('button', { name: /^HAZIR$|^FERTIG$/ }).first()).toBeVisible();
    await expect(page.locator('section > ul > li[data-tone="late"]')).toHaveCount(1);
    await expect(page.locator('section > ul > li[data-tone="warn"]')).toHaveCount(1);
    await page.screenshot({ path: SHOT('m4-kds-1280.png') });
    await scan(page, 'm4-kitchen');
    // R2: renkli kart zeminleri kalabalık ekranda gürültü yapıyor mu — kaç kart renkli?
    const cardBoxes = await boxes(page, 'section > ul > li[data-tone]');
    logMetrics('KDS kartları', {
      aktifKart: cardBoxes.length,
      ok: await page.locator('section > ul > li[data-tone="ok"]').count(),
      warn: await page.locator('section > ul > li[data-tone="warn"]').count(),
      late: await page.locator('section > ul > li[data-tone="late"]').count(),
      ilkKartYüksekliği: cardBoxes[0]?.height ?? null,
      tamGörünenKart: fullyVisible(cardBoxes, 800),
    });

    // 2 — tükendi çekmecesi (dolu)
    await page.getByRole('button', { name: /tükendi|ausverkauft/i }).first().click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.screenshot({ path: SHOT('m4-kds-soldout-1280.png') });
    await scan(page, 'm4-soldout');
    await page.getByRole('dialog').getByRole('button', { name: /^kapat$/i }).click();

    // 3 — HAZIR → kart "Hazır" sütununa geçer, 30 sn'lik "Geri al" penceresi açılır
    const activeCards = page.locator('section > ul > li');
    const readyCards = page.locator('aside > ul > li');
    const activeBefore = await activeCards.count();
    const readyBefore = await readyCards.count();
    await page.getByRole('button', { name: /^HAZIR$|^FERTIG$/ }).first().click();
    await expect(activeCards).toHaveCount(activeBefore - 1);
    await expect(readyCards).toHaveCount(readyBefore + 1);
    await page.screenshot({ path: SHOT('m4-kds-ready-1280.png') });
    await scan(page, 'm4-ready');
    await page.getByRole('button', { name: /geri al|rückgängig/i }).first().click();
    await expect(activeCards).toHaveCount(activeBefore);
  } finally {
    writeAxeReport('axe-m4.json');
    await teardownScene(scene);
  }
});
