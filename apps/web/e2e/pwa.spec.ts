import { expect, test } from '@playwright/test';

const PASSWORD = process.env.TEST_USER_PASSWORD ?? '';

/** `tsconfig.node.json` DOM tiplerini içermez; tarayıcıda çalışan geri çağrılar için dar tip. */
type SwNavigator = { serviceWorker: { ready: Promise<unknown>; controller: unknown } };

/**
 * Görev 25 Adım 4: PWA temel denetimleri — `playwright.pwa.config.ts` ile üretim derlemesi
 * (`vite preview`, 4176) üzerinde koşar.
 *
 * Canlı veriye yazmaz: yalnız test garsonuyla giriş yapılır; mesai açılmaz, sipariş verilmez.
 * Bildirim izni istenmez (izin penceresi ancak kullanıcı dokunuşuyla açılır, testte dokunulmaz).
 */
test('manifest, service worker denetimi, çevrimdışı kabuk ve kurulum rehberi (390×844)', async ({
  page,
  context,
  request,
}) => {
  test.setTimeout(120_000);

  // 1 — Manifest: standalone, üç ikon (biri maskable), hepsi erişilebilir.
  const res = await request.get('/manifest.webmanifest');
  expect(res.ok()).toBe(true);
  const manifest = (await res.json()) as {
    name: string;
    short_name: string;
    id: string;
    start_url: string;
    scope: string;
    display: string;
    icons: { src: string; sizes: string; purpose?: string }[];
  };
  expect(manifest).toMatchObject({
    name: "Ramo's Bestellung",
    short_name: "Ramo's",
    id: '/',
    start_url: '/',
    scope: '/',
    display: 'standalone',
  });
  expect(manifest.icons).toHaveLength(3);
  expect(manifest.icons.filter((i) => i.purpose === 'maskable')).toHaveLength(1);
  for (const icon of manifest.icons) {
    const r = await request.get(icon.src);
    expect(r.ok(), icon.src).toBe(true);
    expect(r.headers()['content-type']).toContain('image/png');
  }

  // SW dosyası önbellek listesini taşır; Android uygulamasının dosyası SPA'ya düşmez.
  const sw = await (await request.get('/sw.js')).text();
  expect(sw).toContain('index.html');
  expect(sw).toMatch(/assets\/index-[\w-]+\.js/);
  const assetLinks = await request.get('/.well-known/assetlinks.json');
  expect(assetLinks.ok()).toBe(true);
  expect(await assetLinks.text()).toContain('com.arxdigital.ramos');

  // 2 — Service worker: ilk açılışta kurulur, yeniden yüklemeden sonra sayfayı denetler.
  await page.goto('/login');
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
    'href',
    '/manifest.webmanifest',
  );
  await page.evaluate(async () => {
    await (navigator as unknown as SwNavigator).serviceWorker.ready;
  });
  await page.reload();
  await expect
    .poll(() =>
      page.evaluate(() => !!(navigator as unknown as SwNavigator).serviceWorker.controller),
    )
    .toBe(true);

  // 3 — Garson girişi → ilk açılış kurulum rehberi.
  await page.getByLabel(/kullanıcı adı/i).fill('test-waiter');
  await page.getByLabel('PIN veya parola', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: /giriş/i }).click();
  await expect(page).toHaveURL(/\/waiter$/);

  const guide = page.getByRole('region', { name: "Ramo's uygulamasını kur" });
  await expect(guide).toBeVisible();
  await expect(guide.getByRole('button', { name: 'Bildirimleri aç' })).toBeVisible();
  // Masalar yüklensin: görüntü yükleyici değil, gerçek ilk açılış ekranını belgelesin.
  await expect(page.getByRole('button', { name: /^Masa /i }).first()).toBeVisible();
  await page.screenshot({ path: '../../docs/screenshots/m7-install-guide-390.png' });

  // 4 — Bağlantı kopunca "İnternet yok" şeridi.
  await context.setOffline(true);
  try {
    await expect(page.getByRole('alert').filter({ hasText: 'İnternet yok' })).toBeVisible();

    // 5 — Çevrimdışı yeniden açılış: sayfa SW önbelleğinden gelir, uygulama kabuğu çizilir.
    const reload = await page.reload();
    expect(reload?.fromServiceWorker()).toBe(true);
    await expect(page.getByText("RAMO'S", { exact: true })).toBeVisible();
    // Profil ağdan okunamadı: beyaz ekran yerine ne olduğu + tekrar dene.
    await expect(page.getByRole('alert')).toContainText('bağlantını kontrol et');
    await expect(page.getByRole('button', { name: 'Tekrar dene' })).toBeVisible();
  } finally {
    await context.setOffline(false);
  }
});
