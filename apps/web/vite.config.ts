import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // Görev 25 — PWA. `injectManifest`: SW'yi (`src/sw.ts`) biz yazarız (push + bildirim
    // tıklaması), eklenti yalnız önbellek listesini içine yerleştirir. Kayıt `src/pwa/registerSW.ts`
    // içinde elle yapılır (`injectRegister: false`) ve yalnız üretim derlemesinde çalışır;
    // geliştirme sunucusunda SW yoktur (`devOptions` kapalı) — eski önbellek geliştirmeyi bozmasın.
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'prompt',
      injectRegister: false,
      devOptions: { enabled: false },
      // İkonlar zaten `globPatterns` ile listede; ikinci kez eklenmesin.
      includeManifestIcons: false,
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2,webp}'],
        globIgnores: [
          // Uygulama TR/DE: Kiril ve Vietnam yazı alt kümeleri hiçbir ekranda kullanılmaz; tarayıcı
          // `unicode-range` gerektirirse ağdan yine alır, önbellekte yer kaplamasınlar.
          '**/montserrat-cyrillic*',
          '**/montserrat-vietnamese*',
          // Marka kaynak görseli (ikonlar ondan üretildi); hiçbir ekran bunu yüklemez.
          'brand/**',
        ],
      },
      manifest: {
        id: '/',
        name: "Ramo's Bestellung",
        short_name: "Ramo's",
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#0A0A0A',
        theme_color: '#0A0A0A',
        lang: 'de',
        icons: [
          { src: '/app-icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/app-icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/app-icons/maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
  server: { port: 5173, host: true },
  test: {
    environment: 'jsdom',
    setupFiles: ['src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
