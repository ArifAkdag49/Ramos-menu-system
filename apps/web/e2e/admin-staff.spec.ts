import { expect, test, type Locator, type Page } from '@playwright/test';

const PASSWORD = process.env.TEST_USER_PASSWORD ?? '';
const USERNAME = 'test-e2e-garson';
const PIN = '482915';

/**
 * Görev 23 Adım 3: personel yaşam döngüsü, uçtan uca ve **canlı** `admin-staff` fonksiyonuna karşı.
 *
 * 1. `test-admin` Personel ekranından `test-e2e-garson`'u ekler; kullanıcı önceki bir koşudan
 *    kalmışsa (ekleme ikinci kez `username_taken` verir) aktifleştirilir ve PIN'i sıfırlanır.
 * 2. Ayrı bir tarayıcı bağlamında garson o PIN ile girer → `/waiter`.
 * 3. Admin hesabı pasifleştirir → garson sayfayı yenileyince `/login`'e düşer. Kapı istemcide
 *    değil: profil okuması `is_active = false` döner (RLS) ve auth kullanıcısı yasaklanır (ban).
 * 4. Admin hesabı yeniden aktifleştirir; garson yine girebilir (yaşam döngüsü kapanır, hesap bir
 *    sonraki koşuya temiz kalır).
 *
 * Kullanıcı adı `test-` önekli: Personel ekranında "Test hesabı" rozetiyle görünür ve M8'de
 * diğer test hesaplarıyla birlikte pasifleştirilir. Kayıt silinmez (BUILD-PROMPT §5).
 *
 * Koşma biçimi (admin masaüstü önceliklidir):
 *   npx playwright test admin-staff --project=desktop
 */

async function login(page: Page, username: string, secret: string, home: RegExp): Promise<void> {
  await page.goto('/login');
  await page.getByLabel(/kullanıcı adı/i).fill(username);
  await page.getByLabel('PIN veya parola', { exact: true }).fill(secret);
  await page.getByRole('button', { name: /giriş/i }).click();
  await expect(page).toHaveURL(home);
}

const staffRow = (page: Page): Locator =>
  page.getByRole('listitem').filter({ hasText: `@${USERNAME} ·` });

async function saveSheet(page: Page): Promise<void> {
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Kaydet' }).click();
  await expect(dialog).toBeHidden();
}

test('admin personel ekler, PIN verir, pasifleştirir ve yeniden aktifleştirir', async ({
  browser,
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'admin masaüstü önceliklidir (1440×900)');
  test.setTimeout(180_000);

  await login(page, 'test-admin', PASSWORD, /\/admin$/);
  await page.goto('/admin/staff');
  await expect(page.getByRole('heading', { name: 'Personel', level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Personel ekle' })).toBeVisible();
  // Liste gelmeden "kullanıcı yok" kararı verilmesin: en az bir satır (test-admin'in kendisi) beklenir.
  await expect(page.getByRole('listitem').filter({ hasText: '@test-admin ·' })).toBeVisible();

  // --- 1. Ekle ya da (varsa) aktifleştir + PIN sıfırla ---
  if ((await staffRow(page).count()) === 0) {
    await page.getByRole('button', { name: 'Personel ekle' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Ad', { exact: true }).fill('E2E Garson');
    await dialog.getByLabel('Kullanıcı adı', { exact: true }).fill(USERNAME);
    await dialog.getByLabel('Rol', { exact: true }).selectOption('waiter');
    await dialog.getByLabel('PIN', { exact: true }).fill(PIN);
    await saveSheet(page);
    await expect(staffRow(page)).toBeVisible();
  } else {
    const activate = staffRow(page).getByRole('button', { name: 'Aktifleştir' });
    if (await activate.isVisible()) {
      await activate.click();
      await expect(staffRow(page).getByRole('button', { name: 'Pasifleştir' })).toBeVisible();
    }
    await staffRow(page).getByRole('button', { name: 'PIN sıfırla' }).click();
    await page.getByRole('dialog').getByLabel('Yeni PIN / parola').fill(PIN);
    await saveSheet(page);
  }
  await expect(staffRow(page).getByText('Test hesabı')).toBeVisible();
  await expect(staffRow(page).getByText('Aktif', { exact: true })).toBeVisible();

  // --- 2. Garson ayrı bağlamda girer ---
  const waiterContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: 'tr-TR',
    timezoneId: 'Europe/Berlin',
  });
  try {
    const waiter = await waiterContext.newPage();
    await login(waiter, USERNAME, PIN, /\/waiter$/);

    // --- 3. Pasifleştir → garson yenileyince girişe düşer ---
    page.once('dialog', (d) => void d.accept());
    await staffRow(page).getByRole('button', { name: 'Pasifleştir' }).click();
    await expect(staffRow(page).getByText('Pasif', { exact: true })).toBeVisible();

    await waiter.reload();
    await expect(waiter).toHaveURL(/\/login$/);

    // --- 4. Yeniden aktifleştir → garson tekrar girebilir ---
    await staffRow(page).getByRole('button', { name: 'Aktifleştir' }).click();
    await expect(staffRow(page).getByText('Aktif', { exact: true })).toBeVisible();

    await login(waiter, USERNAME, PIN, /\/waiter$/);
  } finally {
    await waiterContext.close();
  }
});
