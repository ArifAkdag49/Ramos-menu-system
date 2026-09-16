import { expect, test, type Page } from '@playwright/test';

const PASSWORD = process.env.TEST_USER_PASSWORD ?? '';

async function login(page: Page, username: string, secret: string) {
  await page.goto('/login');
  await page.getByLabel(/kullanıcı adı/i).fill(username);
  await page.getByLabel(/pin/i).fill(secret);
  await page.getByRole('button', { name: /giriş/i }).click();
}

test('garson girişi /waiter sayfasına yönlenir; yanlış PIN hata verir', async ({ page }, info) => {
  await login(page, 'test-waiter', '000000');
  await expect(page.getByRole('alert')).toBeVisible();
  await page.screenshot({ path: `../../docs/screenshots/m2-login-${info.project.name}.png` });
  await page.getByLabel(/pin/i).fill(PASSWORD);
  await page.getByRole('button', { name: /giriş/i }).click();
  await expect(page).toHaveURL(/\/waiter$/);
});

/**
 * Rol matrisi görünümden bağımsızdır (yönlendirme kararı, düzen değil), bu yüzden tek projede
 * koşar. Üç görünümde tekrarlamak her koşuda 21 giriş denemesi demekti; Supabase'in IP başına
 * giriş sınırı art arda koşularda buna takılır. Ekran görüntüleri yine üç görünümde alınıyor.
 */
const onlyOnce = (info: { project: { name: string } }) =>
  test.skip(info.project.name !== 'phone', 'görünümden bağımsız — tek projede koşar');

test('mutfak hesabı kendi ekranına iner', async ({ page }, info) => {
  onlyOnce(info);
  await login(page, 'test-kitchen', PASSWORD);
  await expect(page).toHaveURL(/\/kitchen$/);
});

test('admin hesabı kendi ekranına iner', async ({ page }, info) => {
  onlyOnce(info);
  await login(page, 'test-admin', PASSWORD);
  await expect(page).toHaveURL(/\/admin$/);
});

test('printer hesabı doğru parolayla bile uygulamaya giremez', async ({ page }, info) => {
  onlyOnce(info);
  await login(page, 'test-printer', PASSWORD);
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});

test('pasifleştirilmiş hesap uygulamaya giremez', async ({ page }, info) => {
  onlyOnce(info);
  await login(page, 'test-inactive', PASSWORD);
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});

test('oturum açmadan korunan adrese gidilemez', async ({ page }, info) => {
  onlyOnce(info);
  await page.goto('/waiter');
  await expect(page).toHaveURL(/\/login$/);
});
