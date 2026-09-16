import { defineConfig, devices } from '@playwright/test';

process.loadEnvFile('../../.env');

export default defineConfig({
  testDir: 'e2e',
  use: { baseURL: 'http://localhost:5173', locale: 'tr-TR', timezoneId: 'Europe/Berlin' },
  webServer: { command: 'npm run dev', port: 5173, reuseExistingServer: true },
  projects: [
    { name: 'phone', use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } } },
    { name: 'tablet', use: { viewport: { width: 1280, height: 800 } } },
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
  ],
});
