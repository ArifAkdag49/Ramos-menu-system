import { readFileSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

/**
 * Görev 25 Adım 4 — PWA denetimleri **üretim derlemesi** üzerinde koşar: geliştirme sunucusunda
 * service worker ve manifest yoktur (`devOptions` kapalı). Ana `playwright.config.ts` bu testi
 * yok sayar; çalıştırmak için `npm run e2e:pwa -w apps/web`.
 *
 * Kök `.env`'den yalnız test parolası okunur (ana yapılandırmadaki M1/R64 gerekçesi: preview
 * sunucusu bu süreçten ortam miras alır, sırlar ona geçmesin).
 */
function readTestPassword(): string {
  try {
    const match = /^TEST_USER_PASSWORD=(.*)$/m.exec(readFileSync('../../.env', 'utf8'));
    return match?.[1]?.trim() ?? '';
  } catch {
    return '';
  }
}

process.env.TEST_USER_PASSWORD ||= readTestPassword();

const PORT = 4176;

export default defineConfig({
  testDir: 'e2e',
  testMatch: 'pwa.spec.ts',
  expect: { timeout: 15_000 },
  use: { baseURL: `http://localhost:${PORT}`, locale: 'tr-TR', timezoneId: 'Europe/Berlin' },
  webServer: {
    command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
    port: PORT,
    // Her koşu taze derleme: eski bir `dist` ile SW/manifest denetlenmesin.
    reuseExistingServer: false,
    timeout: 300_000,
  },
  projects: [
    {
      name: 'pwa-phone',
      use: {
        ...devices['Pixel 7'],
        viewport: { width: 390, height: 844 },
        // Tam Chromium (yeni başsız kip): "headless shell" `Notification.permission`'ı her zaman
        // "denied" döndürür; telefonun ilk açılışındaki "default" durumu yalnız bununla görülür.
        channel: 'chromium',
      },
    },
  ],
});
