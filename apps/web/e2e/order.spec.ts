import { expect, test } from '@playwright/test';

const PASSWORD = process.env.TEST_USER_PASSWORD ?? '';

/**
 * Görev 14 Adım 3: telefon görünümünde (390×844) sipariş girişi — menü/arama, ürün paneli
 * (Kalb + OHNE + sos seçili) ve Pizza Mix (min=max=5). Tek girişle üç görüntü alınır (Supabase'in
 * IP başına giriş sınırına takılmamak için); yalnız `phone` projesinde koşar (login.spec.ts'teki
 * örüntüyle aynı).
 */
test('sipariş girişi: menü/arama, ürün paneli, pizza mix (390×844)', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'ekran görüntüleri yalnız telefon görünümünde alınır');

  await page.goto('/login');
  await page.getByLabel(/kullanıcı adı/i).fill('test-waiter');
  await page.getByLabel(/pin/i).fill(PASSWORD);
  await page.getByRole('button', { name: /giriş/i }).click();
  await expect(page).toHaveURL(/\/waiter$/);

  const startDuty = page.getByRole('button', { name: /mesaiye başla/i });
  if (await startDuty.isVisible().catch(() => false)) await startDuty.click();

  // Boş bir masa bul (açık oturumu olmayan, `data-tone="free"`) ve sipariş girişine geç.
  const freeTable = page.locator('button[data-tone="free"]').first();
  await expect(freeTable).toBeVisible();
  await freeTable.click();
  await page.getByRole('button', { name: /sipariş al/i }).click();
  await expect(page).toHaveURL(/\/order$/);
  await expect(page.locator('[data-category-id]').first()).toBeVisible();
  await page.screenshot({ path: '../../docs/screenshots/m3-order-menu-390.png' });

  await page.getByLabel('Ara', { exact: true }).fill('08');
  await page.getByRole('button', { name: /seç|auswählen/i }).first().click();
  const sheet = page.getByRole('dialog');
  await sheet.getByRole('button', { name: /kalb|dana/i }).click();
  await sheet.getByRole('button', { name: /knoblauch|sarımsak/i }).click();
  await sheet.getByRole('button', { name: /zwiebeln|soğan/i }).click();
  await sheet.evaluate((el) => el.scrollTo({ top: 0 }));
  await page.screenshot({ path: '../../docs/screenshots/m3-product-sheet-390.png' });
  await sheet.getByRole('button', { name: /kapat|schließen/i }).click();

  await page.getByLabel('Ara', { exact: true }).fill('47');
  await page.getByRole('button', { name: /seç|auswählen/i }).first().click();
  const pizzaSheet = page.getByRole('dialog');
  const mixGroup = pizzaSheet.getByRole('group', { name: /beläge|malzemeler/i });
  const mixButtons = mixGroup.getByRole('button');
  const mixCount = await mixButtons.count();
  for (let i = 0; i < Math.min(5, mixCount); i++) await mixButtons.nth(i).click();
  await mixGroup.scrollIntoViewIfNeeded();
  await page.screenshot({ path: '../../docs/screenshots/m3-pizza-mix-390.png' });
});
