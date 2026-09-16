import { expect, test } from '@playwright/test';
import { cleanupFixtureOrders, clientFor, ensureFixtures, ensureTestUsers, hideFixtures, submitKitchenTestOrder } from './helpers';

const PASSWORD = process.env.TEST_USER_PASSWORD ?? '';
const SHOT = (name: string) => `../../docs/screenshots/m3-flow-${name}-390.png`;

/**
 * Görev 15 Adım 3: garsonun uçtan uca günü (390×844, canlı Supabase).
 *
 * Tek testte akar çünkü her adım bir öncekinin bıraktığı duruma yaslanır (sepet → sipariş →
 * hesap → iptal → taşıma → kapatma) ve Supabase'in IP başına giriş sınırı birden çok girişte
 * riskli. Veri Plan 1 fikstürlerinden gelir (`Test-Tisch`, `T05 Test Drehspieß Sandwich`,
 * `Test Cola`) — hepsi `Test-%` desenli olduğu için `cleanupFixtureOrders()` süzgeci kapsar.
 *
 * I4 — kurulum ve temizlik **kancada değil, gövdede** (`kitchen.spec.ts` / `waiter.spec.ts` ile
 * aynı örüntü): Playwright kancaları `test.skip`'ten önce çalışır, yani `beforeAll`/`afterAll`
 * kullanılsaydı `desktop` ve `tablet` projeleri de canlı Supabase'e gidip aynı fikstürleri
 * kurar/silerdi — üstelik telefon testi koşarken. Burada `test.skip` gövdenin ilk satırı olduğu
 * için proje seçilmeden (`npm run e2e`) koşulduğunda diğer iki proje hiçbir şeye dokunmadan
 * atlanır; kurulum-temizlik çifti yalnız bir kez, `phone` projesinde çalışır.
 *
 * Arayüz dili TR'dir (test kullanıcılarının `locale` alanı 'tr'), ama malzeme/seçenek adları
 * `localName()` ile yerelleştiği için eşleştirmeler iki dilli tutulur. "İ" ile başlayan metinler
 * `exact` adla aranır: JS'in `/i` bayrağı U+0130'u "i" ile eşlemez (BUILD-PROMPT §6'daki büyük
 * harf tuzağının test tarafındaki yüzü).
 */
test('garson uçtan uca: sepet → gönder → hesap → iptal → taşı → kapat', async ({ page, context }, info) => {
  test.skip(info.project.name !== 'phone', 'akış yalnız telefon görünümünde koşar');
  test.setTimeout(240_000);

  await ensureTestUsers();
  const fixtures = await ensureFixtures();
  await cleanupFixtureOrders();

  try {
    // 1 — giriş
    await page.goto('/login');
    await page.getByLabel(/kullanıcı adı/i).fill('test-waiter');
    await page.getByLabel(/pin/i).fill(PASSWORD);
    await page.getByRole('button', { name: /giriş/i }).click();
    await expect(page).toHaveURL(/\/waiter$/);

    const startDuty = page.getByRole('button', { name: /mesaiye başla/i });
    if (await startDuty.isVisible().catch(() => false)) await startDuty.click();

    const testTable = page.getByRole('button', { name: 'Test-Tisch', exact: true });
    await expect(testTable).toBeVisible();
    await testTable.click();
    await expect(page).toHaveURL(/\/waiter\/table\//);
    await page.getByRole('button', { name: /sipariş al/i }).click();
    await expect(page).toHaveURL(/\/order$/);

    // 2 — T05: Kalb · ÇIKAR Soğan · Sarımsaklı + Otlu · +Ekstra peynir · adet 2 → 19,00 €
    await page.getByLabel(/ara/i).fill('T05');
    await page.getByRole('button', { name: /seç|auswählen/i }).first().click();
    const sheet = page.getByRole('dialog');
    await sheet.getByRole('button', { name: /kalb|dana/i }).click();
    await sheet.getByRole('button', { name: /zwiebeln|soğan/i }).click();
    await sheet.getByRole('button', { name: /knoblauch|sarımsak/i }).click();
    await sheet.getByRole('button', { name: /kräuter|otlu/i }).click();
    await sheet.getByRole('button', { name: /weichkäse|beyaz peynir/i }).click();
    await sheet.getByRole('button', { name: /adeti artır/i }).click();
    const addToCart = sheet.getByRole('button', { name: /sepete ekle/i });
    await expect(addToCart).toContainText('19,00');
    await addToCart.click();

    // 3 — Test Cola tek dokunuşla: sepet toplamı 21,50 €
    await page.getByLabel(/ara/i).fill('Test Cola');
    await page.getByRole('button', { name: /^ekle$/i }).first().click();
    const cartButton = page.getByRole('button', { name: /sepet/i });
    await expect(cartButton).toContainText('21,50');

    await cartButton.click();
    const cart = page.getByRole('dialog');
    const sendButton = cart.getByRole('button', { name: /mutfağa gönder/i });
    await expect(sendButton).toBeEnabled();
    await page.screenshot({ path: SHOT('cart') });

    // 7c — çevrimdışı: gönder pasif, şerit ne yapılacağını söyler (spec §13)
    await context.setOffline(true);
    await expect(sendButton).toBeDisabled();
    await expect(cart.getByText(/sepet saklandı/i)).toBeVisible();
    await page.screenshot({ path: SHOT('offline') });
    await context.setOffline(false);
    await expect(sendButton).toBeEnabled();

    // 4 — onay → gönder
    await sendButton.click();
    const confirm = page.getByRole('dialog');
    await expect(confirm.getByRole('button', { name: /onayla ve gönder/i })).toBeVisible();
    await expect(confirm).toContainText('2 kalem');
    await expect(confirm).toContainText('21,50');
    await page.screenshot({ path: SHOT('confirm') });
    await confirm.getByRole('button', { name: /onayla ve gönder/i }).click();

    await expect(page).toHaveURL(/\/waiter\/table\/[^/]+$/);
    await expect(page.getByText(/mutfağa gönderildi · #\d{3}/i)).toBeVisible();

    // 1. tur listelenir; yazdırma rozeti kuyrukta ya da basıldı olmalı — "basılamadı" geçmez.
    const orderCard = page.getByRole('listitem').filter({ hasText: /#\d{3}/ }).first();
    await expect(orderCard).toContainText('Test Drehspieß Sandwich');
    await expect(orderCard.getByText(/yazdırılıyor|basıldı/i).first()).toBeVisible();
    await page.screenshot({ path: SHOT('sent') });

    // 5 — hesap özeti: 21,50 €
    await page.getByRole('button', { name: /^hesap$/i }).click();
    const bill = page.getByRole('dialog');
    await expect(bill).toContainText('21,50');
    await page.screenshot({ path: SHOT('bill') });
    await bill.getByRole('button', { name: 'Kapat', exact: true }).click();

    // 7a — kalem iptali: sebep "Müşteri vazgeçti" → üstü çizili kalem, sebep TR okunur (M3)
    const colaItem = page.getByRole('listitem').filter({ hasText: 'Test Cola' }).last();
    await colaItem.getByRole('button', { name: 'İptal', exact: true }).click();
    const cancelSheet = page.getByRole('dialog');
    await cancelSheet.getByRole('button', { name: /müşteri vazgeçti|gast hat storniert/i }).click();
    await cancelSheet.getByRole('button', { name: 'İptal et', exact: true }).click();
    await expect(page.getByText(/storno/i)).toBeVisible();
    // Üstü çizgi kalemin tamamındadır; `× Test Cola` yalnız o satırın `<p>`'siyle eşleşir
    // (içteki `<span lang="de">` adet işaretini içermez).
    await expect(page.getByText(/× Test Cola/).first()).toHaveClass(/line-through/);
    await expect(colaItem).toContainText('Müşteri vazgeçti');
    await page.screenshot({ path: SHOT('cancelled') });

    // hesap iptalden sonra yalnız kalan kalemi sayar
    await page.getByRole('button', { name: /^hesap$/i }).click();
    await expect(page.getByRole('dialog')).toContainText('19,00');
    await page.getByRole('dialog').getByRole('button', { name: 'Kapat', exact: true }).click();

    // 7b — masa taşıma: Test-Tisch → Test-Tisch-2
    await page.getByRole('button', { name: /^taşı$/i }).click();
    const moveSheet = page.getByRole('dialog');
    const moveTarget = moveSheet.getByRole('button', { name: 'Test-Tisch-2', exact: true });
    await moveTarget.click();
    // Seçim görünür olmalı: onay düğmesi adı doğru olsa bile ızgarada hangi masanın seçildiği
    // belli değilse garson yanlış masaya taşıdığını ancak fiş çıkınca anlar.
    await expect(moveTarget).toHaveAttribute('aria-pressed', 'true');
    // Seçim görsel olarak da tamamlanmalı: `transition-colors` 150 ms sürüyor ve görüntü o
    // aradayken alınırsa hücre hâlâ seçilmemiş görünür (ilk çekimde tam bu olmuştu). Sabit
    // bekleme yok — beklenti rengin gerçekten lime olmasına bağlı ve kendiliğinden yeniden dener.
    await expect(moveTarget).toHaveCSS('border-color', 'rgb(136, 182, 0)');
    await page.screenshot({ path: SHOT('move') });
    await moveSheet.getByRole('button', { name: /masasına taşı/i }).click();
    await expect(page.getByRole('heading', { name: 'Test-Tisch-2' })).toBeVisible();

    // 6 — kapatma önce engellenir (mutfakta sipariş var), sonra teslim edilince geçer
    const closeTable = page.getByRole('button', { name: 'Masayı kapat', exact: true });
    await closeTable.click();
    const closeSheet = page.getByRole('dialog');
    await closeSheet.getByRole('button', { name: /evet, kapat/i }).click();
    await expect(closeSheet.getByText(/mutfakta hazırlanan sipariş var/i)).toBeVisible();
    await page.screenshot({ path: SHOT('close-blocked') });
    await closeSheet.getByRole('button', { name: 'Kapat', exact: true }).click();

    await page.getByRole('button', { name: /diğer işlemler/i }).click();
    await page.getByRole('dialog').getByRole('button', { name: /teslim edildi \(içecek\)/i }).click();

    await closeTable.click();
    await page.getByRole('dialog').getByRole('button', { name: /evet, kapat/i }).click();
    await expect(page).toHaveURL(/\/waiter$/);
    await expect(page.getByText(/masa kapatıldı/i)).toBeVisible();

    // masa yeniden boş
    await expect(page.getByRole('button', { name: 'Test-Tisch-2', exact: true })).toHaveAttribute('data-tone', 'free');
    await page.screenshot({ path: SHOT('tables') });

    /*
     * R76 — M3 tasarım kapısının referans görüntüleri gerçek veriyle alınır. Masa ızgarasında
     * hem HAZIR (altın) hem açık (lime) bir masa bulunsun diye iki sipariş API üzerinden
     * kurulur: bu görüntüler ekranın dolu hâlini belgelemeli, iskelet/boş hâlini değil.
     */
    const readyOrder = await submitKitchenTestOrder(fixtures);
    const kitchen = await clientFor('kitchen');
    const { error: readyError } = await kitchen.rpc('mark_order_ready', { p_order_id: readyOrder.orderId });
    if (readyError) throw readyError;

    const waiterApi = await clientFor('waiter');
    const { error: openError } = await waiterApi.rpc('submit_order', {
      p_order_id: crypto.randomUUID(),
      p_table_id: fixtures.table2Id,
      p_items: [{ product_id: fixtures.colaId, variant_id: null, quantity: 2, option_ids: [], removed_ingredient_ids: [] }],
    });
    if (openError) throw openError;

    await page.goto('/waiter');
    await expect(page.locator('button[data-tone="ready"]').first()).toBeVisible();
    await expect(page.locator('button[data-tone="open"]').first()).toBeVisible();
    await page.screenshot({ path: '../../docs/screenshots/m3-tables-390.png' });

    await page.getByRole('button', { name: /Test-Tisch-2/ }).click();
    await expect(page.getByRole('listitem').filter({ hasText: /#\d{3}/ }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /sipariş ekle/i })).toBeVisible();
    await page.screenshot({ path: '../../docs/screenshots/m3-table-detail-390.png' });
  } finally {
    await cleanupFixtureOrders();
    await hideFixtures();
  }
});
