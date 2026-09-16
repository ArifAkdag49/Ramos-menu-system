import { expect, test } from '@playwright/test';

const PASSWORD = process.env.TEST_USER_PASSWORD ?? '';

/**
 * Görev 13 Adım 4: telefon görünümünde (390×844) garson iskeleti — masalar, masa detayı, Hazır
 * ve Profil. Tek bir girişle (Supabase'in IP başına giriş sınırına takılmamak için) dört ekranın
 * görüntüsü de alınır; yalnız `phone` projesinde koşar (login.spec.ts'teki örüntüyle aynı).
 */
test('garson iskeleti: masalar, masa detayı, hazır, profil (390×844)', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'ekran görüntüleri yalnız telefon görünümünde alınır');

  await page.goto('/login');
  await page.getByLabel(/kullanıcı adı/i).fill('test-waiter');
  await page.getByLabel(/pin/i).fill(PASSWORD);
  await page.getByRole('button', { name: /giriş/i }).click();
  await expect(page).toHaveURL(/\/waiter$/);

  await page.screenshot({ path: '../../docs/screenshots/m3-tables-390.png' });

  const firstTable = page.getByRole('button', { name: /^Masa /i }).first();
  await firstTable.click();
  await expect(page).toHaveURL(/\/waiter\/table\//);
  await page.screenshot({ path: '../../docs/screenshots/m3-table-detail-390.png' });

  await page.getByRole('link', { name: /hazır/i }).click();
  await expect(page).toHaveURL(/\/waiter\/ready$/);
  await page.screenshot({ path: '../../docs/screenshots/m3-ready-390.png' });

  await page.getByRole('link', { name: /profil/i }).click();
  await expect(page).toHaveURL(/\/waiter\/profile$/);
  await page.screenshot({ path: '../../docs/screenshots/m3-profile-390.png' });
});
