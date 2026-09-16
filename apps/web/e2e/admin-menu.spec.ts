import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { sql } from '../../../supabase/tests/helpers/sql';
import { cleanupFixtureOrders, clientFor, ensureFixtures, ensureTestUsers } from './helpers';

const PASSWORD = process.env.TEST_USER_PASSWORD ?? '';
const BASE = 'http://localhost:5173';
const SHOT = (name: string) => `../../docs/screenshots/${name}`;
const TMP = 'test-results/admin-menu';

/**
 * Görev 22 Adım 3: admin menü yönetiminin **etkisini** doğrular — admin bir şey değiştirdiğinde
 * garson ekranı Realtime `menu` olayıyla tazeleniyor mu?
 *
 * Sahne canlıdır ama yalnız `Test-%` fikstürlerine dokunur (`T05 Test Drehspieß Sandwich`,
 * `test-schaerfe` grubu): gerçek 107 ürünlük menü seed'i korunur. Fiyat, grup bağlantısı ve
 * görsel `finally` içinde geri alınır; yüklenen deneme görselleri Storage'dan silinir.
 *
 * I4 örüntüsü (waiter-flow.spec.ts): kurulum ve temizlik kancada değil gövdededir, böylece
 * `test.skip` ilk satırda çalışır ve diğer projeler canlı veritabanına hiç gitmez.
 *
 * Koşma biçimi (admin masaüstü önceliklidir, görüntüler 1440×900):
 *   npx playwright test admin-menu --project=desktop
 */

/** 1×1 kırmızı PNG — gerçek bir görselin yerine geçer, Chromium'da WebP'ye kodlanabilir. */
const PNG_1PX =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function writePng(name: string): string {
  mkdirSync(TMP, { recursive: true });
  const path = `${TMP}/${name}`;
  writeFileSync(path, Buffer.from(PNG_1PX, 'base64'));
  return path;
}

async function login(page: Page, username: string, home: RegExp): Promise<void> {
  await page.goto(`${BASE}/login`);
  await page.getByLabel(/kullanıcı adı/i).fill(username);
  await page.getByLabel(/pin/i).fill(PASSWORD);
  await page.getByRole('button', { name: /giriş/i }).click();
  await expect(page).toHaveURL(home);
}

/** Garsonu T05'in ürün paneline getirir — fiyat ve seçim grupları orada görünür. */
async function openProductSheet(page: Page): Promise<void> {
  await page.goto(`${BASE}/waiter`);
  const startDuty = page.getByRole('button', { name: /mesaiye başla/i });
  if (await startDuty.isVisible().catch(() => false)) await startDuty.click();

  await page.getByRole('button', { name: 'Test-Tisch', exact: true }).click();
  await expect(page).toHaveURL(/\/waiter\/table\//);
  await page.getByRole('button', { name: /sipariş al|sipariş ekle/i }).click();
  await expect(page).toHaveURL(/\/order$/);
  await page.getByLabel(/ara/i).fill('T05');
  await page.getByRole('button', { name: /^seç$/i }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
}

/** Admin ürün editöründe T05'i açar. */
async function openEditor(page: Page): Promise<void> {
  await page.goto(`${BASE}/admin/menu`);
  await page.getByLabel(/ara/i).fill('T05');
  await page.getByRole('button', { name: /Test Drehspieß Sandwich/ }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
}

test('admin menü yönetimi: fiyat, toplu atama ve ürün görseli', async ({ browser }, info) => {
  test.skip(info.project.name !== 'desktop', 'admin masaüstü önceliklidir (1440×900)');
  test.setTimeout(300_000);

  await ensureTestUsers();
  const fixtures = await ensureFixtures();
  await cleanupFixtureOrders();

  // Toplu atama için henüz üründe OLMAYAN bir grup gerekir (test-sosse ve test-extras bağlı).
  await sql(`
    insert into public.option_groups (slug, admin_label, name_de, name_tr, min_select, max_select, ticket_format, sort)
      values ('test-schaerfe', 'Test Schärfe', 'Schärfe', 'Acılık', 0, 1, 'label_values', 902)
      on conflict (slug) do nothing;
    insert into public.options (group_id, name_de, name_tr, sort)
      select g.id, 'scharf', 'acı', 1 from public.option_groups g
      where g.slug = 'test-schaerfe' and not exists (select 1 from public.options o where o.group_id = g.id);
  `);

  const adminCtx = await browser.newContext({ baseURL: BASE, viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
  const waiterCtx = await browser.newContext({ baseURL: BASE, viewport: { width: 390, height: 844 }, locale: 'tr-TR' });
  const admin = await adminCtx.newPage();
  const waiter = await waiterCtx.newPage();

  try {
    await login(admin, 'test-admin', /\/admin$/);
    await login(waiter, 'test-waiter', /\/waiter$/);

    // 1 — ürün listesi: arama, "Görseli yok (N)" süzgeci
    await admin.goto(`${BASE}/admin/menu`);
    await expect(admin.getByRole('heading', { name: 'Menü' })).toBeVisible();
    await expect(admin.getByRole('button', { name: /Görseli yok \(\d+\)/ })).toBeVisible();
    await admin.screenshot({ path: SHOT('m6-menu-products-1440.png') });

    // 2 — Kalb 8,50 → 8,90
    await openEditor(admin);
    const editor = admin.getByRole('dialog');
    await admin.screenshot({ path: SHOT('m6-product-editor-1440.png') });

    // Varyantlar `sort`'a göre dizilir: 0 = Hähnchen (7,50), 1 = Kalb (8,50) — fikstür böyle kurar.
    const kalbPrice = editor.getByLabel('Fiyat').nth(1);
    await expect(kalbPrice).toHaveValue('8,50');
    await kalbPrice.fill('8,90');
    await editor.getByRole('button', { name: 'Kaydet' }).click();
    await expect(admin.getByText('Kaydedildi')).toBeVisible();

    // 3 — garson paneli Realtime `menu` olayıyla tazelenir: Dana 8,90 €
    await openProductSheet(waiter);
    await expect(waiter.getByRole('dialog').getByRole('button', { name: /8,90/ })).toBeVisible();

    // 4 — fiyatı geri al
    await openEditor(admin);
    const kalbAgain = admin.getByRole('dialog').getByLabel('Fiyat').nth(1);
    await expect(kalbAgain).toHaveValue('8,90');
    await kalbAgain.fill('8,50');
    await admin.getByRole('dialog').getByRole('button', { name: 'Kaydet' }).click();
    await expect(admin.getByText('Kaydedildi')).toBeVisible();

    // 5 — toplu atama: T05'e "Test Schärfe" grubunu ekle
    await admin.goto(`${BASE}/admin/menu/bulk`);
    await admin.getByText('Test Drehspieß Sandwich').click();
    await expect(admin.getByText('1 ürün seçili')).toBeVisible();
    await admin.getByRole('button', { name: 'Seçim grubu', exact: true }).click();
    await admin.getByLabel('Seçim grubu').selectOption({ label: 'Test Schärfe' });
    await admin.getByRole('button', { name: 'Uygula' }).click();
    await expect(admin.getByText(/1 ürün güncellendi/)).toBeVisible();

    await waiter.reload();
    await openProductSheet(waiter);
    await expect(waiter.getByRole('dialog').getByText(/Schärfe|Acılık/)).toBeVisible();

    await admin.getByRole('button', { name: /bağlantıyı kaldır/i }).click();
    await expect(admin.getByText(/1 ürün güncellendi/)).toBeVisible();

    // 6 — görsel: tek yükleme → garson listesinde küçük görsel
    await openEditor(admin);
    await admin.getByRole('dialog').getByLabel('Görsel seç').setInputFiles(writePng('tek.png'));
    await expect(admin.getByRole('dialog').getByRole('button', { name: 'Değiştir' })).toBeVisible({ timeout: 30_000 });
    await admin.getByRole('dialog').getByTestId('ticket-preview').scrollIntoViewIfNeeded();
    await admin.screenshot({ path: SHOT('m6-ticket-preview-1440.png') });

    await waiter.goto(`${BASE}/waiter`);
    await openProductSheet(waiter);
    await expect(waiter.getByRole('dialog').locator('img').first()).toBeVisible();

    // 6b — toplu yükleme: dosya adı ürün numarası (T05.png) → eşleşir
    await admin.getByRole('dialog').getByRole('button', { name: 'Kapat' }).click();
    await admin.goto(`${BASE}/admin/menu/images`);
    await admin.getByLabel('Dosyaları seç').setInputFiles(writePng('T05.png'));
    await expect(admin.getByText('Eşleşen (1)')).toBeVisible();
    await expect(admin.getByText('Üzerine yazılacak')).toBeVisible();
    await admin.getByRole('button', { name: 'Yükle' }).click();
    await expect(admin.getByText(/1 yüklendi, 0 yüklenemedi/)).toBeVisible({ timeout: 60_000 });

    // 6c — görseli kaldır → yer tutucu geri gelir
    await openEditor(admin);
    await admin.getByRole('dialog').getByRole('button', { name: 'Kaldır' }).click();
    await admin.getByRole('dialog').getByRole('button', { name: 'Kaldır' }).click();
    await expect(admin.getByRole('dialog').getByRole('button', { name: 'Görsel seç' })).toBeVisible({ timeout: 30_000 });
  } finally {
    // Fikstür ürününü olduğu gibi bırak: fiyat, grup bağlantısı ve görsel geri alınır.
    await sql(`
      update public.product_variants set price_cents = 850
        where name_de = 'Kalb' and product_id = (select id from public.products where slug = 'test-doener');
      delete from public.product_option_groups
        where product_id = (select id from public.products where slug = 'test-doener')
          and group_id = (select id from public.option_groups where slug = 'test-schaerfe');
      update public.products set image_path = null where slug = 'test-doener';
    `);
    // Deneme görselleri Storage'da kalmasın (görev raporu şartı).
    const adminApi = await clientFor('admin');
    const { data: files } = await adminApi.storage.from('product-images').list('products', { limit: 1000 });
    const leftovers = (files ?? [])
      .filter((f) => f.name.startsWith(fixtures.doenerId))
      .map((f) => `products/${f.name}`);
    if (leftovers.length > 0) await adminApi.storage.from('product-images').remove(leftovers);

    await cleanupFixtureOrders();
    await adminCtx.close();
    await waiterCtx.close();
  }
});
