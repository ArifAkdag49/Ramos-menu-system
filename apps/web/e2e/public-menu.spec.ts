import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const PASSWORD = process.env.TEST_USER_PASSWORD ?? '';
/** Ekran görüntüleri yalnız bu değişken verilirse yazılır (tasarım incelemesi). */
const SHOT_DIR = process.env.QR_SHOT_DIR;

/** `tsconfig.node.json` DOM tiplerini içermez; tarayıcıda çalışan geri çağrılar için dar tip. */
type Doc = {
  documentElement: { scrollWidth: number; getAttribute(n: string): string | null; lang: string };
};
type Win = { innerWidth: number; document: Doc };

const noHorizontalScroll = (page: Page) =>
  page.evaluate(() => {
    const w = globalThis as unknown as Win;
    return w.document.documentElement.scrollWidth <= w.innerWidth;
  });

async function shot(page: Page, name: string) {
  if (!SHOT_DIR) return;
  // Görseller `loading="lazy"`: ekrandakiler inene kadar beklenir, yoksa görüntüde boş kutu kalır.
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.waitForTimeout(300); // renk geçişleri (150 ms) bitsin
  await page.screenshot({ path: `${SHOT_DIR}/${name}` });
}

/**
 * Müşteri QR menüsü: **girişsiz** açılır, yalnız okur (canlı veriye yazmaz). Telefon projesinde
 * koşar; `public_menu()` RPC'si canlıda olmalı.
 */
test.describe('QR menü (girişsiz)', () => {
  test.skip(({ isMobile }) => !isMobile, 'Müşteri menüsü telefon için');

  test.describe('telefon dili Almanca', () => {
    // Taze bağlam: kayıtlı seçim yok, dil telefonun dilinden (de-DE) gelir.
    test.use({ locale: 'de-DE' });

    test('menü açılır, ürün kartı büyük görselle açılır, AR sağdan sola, yatay kayma yok', async ({
      page,
    }) => {
      await page.goto('/menu');

      await expect(page).toHaveURL(/\/menu$/);
      const nav = page.getByRole('navigation', { name: 'Kategorien' });
      await expect(nav.getByRole('button').first()).toBeVisible();
      await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible();

      // Görselli en az bir ürün satırı.
      const withImage = page.locator('main li button:has(img)').first();
      await expect(withImage).toBeVisible();
      expect(await noHorizontalScroll(page)).toBe(true);
      await shot(page, 'menu-de-390.png');

      await withImage.click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      const big = dialog.locator('img').first();
      await expect(big).toBeVisible();
      await expect
        .poll(() => big.evaluate((el) => (el as unknown as { naturalWidth: number }).naturalWidth))
        .toBeGreaterThan(0);
      const box = await big.boundingBox();
      expect(box?.width ?? 0).toBeGreaterThan(300);
      await expect(dialog.getByRole('button')).toHaveCount(1); // yalnız "Schließen"
      await shot(page, 'menu-card-de-390.png');
      await dialog.getByRole('button', { name: 'Schließen' }).click();
      await expect(dialog).toBeHidden();

      await page.getByRole('button', { name: 'العربية' }).click();
      await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
      await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
      await expect(page.getByRole('navigation', { name: 'الفئات' })).toBeVisible();
      expect(await noHorizontalScroll(page)).toBe(true);
      await shot(page, 'menu-ar-390.png');

      // Kategori çipine dokununca bölüme kayar; sayfa yine yatay kaymaz.
      const chips = page.getByRole('navigation', { name: 'الفئات' }).getByRole('button');
      await chips.nth(Math.min(3, (await chips.count()) - 1)).click();
      await page.waitForTimeout(800);
      expect(await noHorizontalScroll(page)).toBe(true);
      await shot(page, 'menu-ar-scrolled-390.png');

      // Seçim kalıcı: yeniden yüklemede AR kalır.
      await page.reload();
      await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    });
  });

  test('admin Ayarlar: QR menü SVG 10 × 10 cm indirilir', async ({ page }) => {
    test.skip(!PASSWORD, 'TEST_USER_PASSWORD yok');
    await page.goto('/login');
    await page.getByLabel(/kullanıcı adı/i).fill('test-admin');
    await page.getByLabel('PIN veya parola', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: /giriş/i }).click();
    await expect(page).toHaveURL(/\/admin/);

    await page.goto('/admin/settings');
    const section = page.getByRole('region', { name: /QR menü|QR-Speisekarte/ });
    await expect(section).toBeVisible();
    await expect(section.getByRole('img')).toBeVisible();
    await section.scrollIntoViewIfNeeded();
    await shot(page, 'admin-qr-section-390.png');

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      section.getByRole('button', { name: /SVG/ }).click(),
    ]);
    expect(download.suggestedFilename()).toBe('ramos-qr-menu-10cm.svg');
    const path = await download.path();
    const svg = readFileSync(path, 'utf8');
    expect(svg).toContain('width="100mm"');
    expect(svg).toContain('height="100mm"');
    expect(svg).toMatch(/viewBox="0 0 \d+ \d+"/);
  });
});
