import { expect, test } from '@playwright/test';

test('garson girişi /waiter sayfasına yönlenir; yanlış PIN hata verir', async ({ page }, info) => {
  await page.goto('/login');
  await page.getByLabel(/kullanıcı adı/i).fill('test-waiter');
  await page.getByLabel(/pin/i).fill('000000');
  await page.getByRole('button', { name: /giriş/i }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await page.screenshot({ path: `../../docs/screenshots/m2-login-${info.project.name}.png` });
  await page.getByLabel(/pin/i).fill(process.env.TEST_USER_PASSWORD!);
  await page.getByRole('button', { name: /giriş/i }).click();
  await expect(page).toHaveURL(/\/waiter$/);
});
