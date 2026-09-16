import { expect, test } from '@playwright/test';
import { cleanupFixtureOrders, prepareKitchenFixtures, submitKitchenTestOrder } from './helpers';

const PASSWORD = process.env.TEST_USER_PASSWORD ?? '';

/**
 * Görev 16 Adım 5: KDS canlı akışı. Sipariş garson hesabıyla API üzerinden (UI değil) gönderilir
 * — burada mutfak EKRANI doğrulanır, sipariş girişi Görev 14/waiter.spec.ts'te. Yalnız `tablet`
 * projesinde koşar (KDS 1280×800 tablet-first; tekrarlı sekmelerde girişleri çoğaltmamak için
 * Görev 13'teki örüntüyle aynı — tek proje).
 */
test('KDS: yeni sipariş ≤2 sn içinde görünür, HAZIR ve geri al akışı çalışır', async ({ page }, info) => {
  test.skip(info.project.name !== 'tablet', 'KDS yalnız tablet görünümünde (1280×800) koşar');
  // Kurulum (`ensureTestUsers` + `ensureFixtures` + `submit_order`) canlı Supabase'e birden çok
  // gidiş-dönüş yapıyor; varsayılan 30 sn bazen bu yüzden yetmiyordu (playwright.config.ts'teki
  // 15 sn'lik expect uzatmasıyla aynı gerekçe).
  test.setTimeout(60_000);

  const fixtures = await prepareKitchenFixtures();
  await submitKitchenTestOrder(fixtures);

  try {
    await page.goto('/login');
    await page.getByLabel(/kullanıcı adı/i).fill('test-kitchen');
    await page.getByLabel(/pin/i).fill(PASSWORD);
    await page.getByRole('button', { name: /giriş/i }).click();
    await expect(page).toHaveURL(/\/kitchen$/);

    await page.getByRole('button', { name: /başlat|starten/i }).click();

    const removedLine = page.getByText(/ÇIKAR: Soğan|OHNE: Zwiebeln/);
    await expect(removedLine).toBeVisible({ timeout: 2_000 });

    const readyButton = page.getByRole('button', { name: /^HAZIR$|^FERTIG$/ });
    await expect(readyButton).toBeVisible();
    await page.screenshot({ path: '../../docs/screenshots/m4-kds-1280.png' });

    await readyButton.click();

    const undoButton = page.getByRole('button', { name: /geri al|rückgängig/i });
    await expect(undoButton).toBeVisible();
    await expect(page.getByRole('button', { name: /^HAZIR$|^FERTIG$/ })).toHaveCount(0);
    await page.screenshot({ path: '../../docs/screenshots/m4-kds-ready-1280.png' });

    await undoButton.click();
    await expect(page.getByRole('button', { name: /^HAZIR$|^FERTIG$/ })).toBeVisible();
  } finally {
    await cleanupFixtureOrders();
  }
});
