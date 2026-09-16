import { readFileSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

/**
 * M1/R64: kök `.env` bütünüyle yüklenmez. `process.loadEnvFile` service_role anahtarını,
 * Supabase PAT'ini, veritabanı parolasını ve SSH anahtar yolunu bu sürece koyardı; `webServer`
 * de Vite dev sunucusunu bu ortamla doğurduğu için hepsi ona miras kalırdı. Testin ihtiyacı
 * olan tek değer test parolasıdır — yalnız onu okuyoruz.
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

export default defineConfig({
  testDir: 'e2e',
  // Her beklenti canlı Supabase'e gidip geliyor; 5 sn'lik varsayılan, iki kez giriş yapan testte
  // ağ yavaşladığında yetmiyordu. Sabit `sleep` yok — beklenti yine sert, yalnız süresi gerçekçi.
  expect: { timeout: 15_000 },
  use: { baseURL: 'http://localhost:5173', locale: 'tr-TR', timezoneId: 'Europe/Berlin' },
  webServer: { command: 'npm run dev', port: 5173, reuseExistingServer: true },
  projects: [
    { name: 'phone', use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } } },
    { name: 'tablet', use: { viewport: { width: 1280, height: 800 } } },
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
  ],
});
