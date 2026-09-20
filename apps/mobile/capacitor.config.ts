import type { CapacitorConfig } from '@capacitor/cli';

// Ramo's yerel uygulaması: uygulama canlı siteyi (server.url) WebView'da açar — site yayını uygulamayı
// da günceller. `www/` yalnız çevrimdışı yedek sayfadır (site açılamazsa gösterilir).
//
// RAMOS_BUNDLED=1 (build-apk.ps1 -Bundled): site APK'nın içine gömülür (apps/web/dist, yerel sunucudan
// açılır; canlı site adresi yok). Sunucuya yayın yapmadan telefonda deneme için — web değişikliği
// bu kipte yeni APK gerektirir. Bildirim bağlantıları yine canlı siteye gider (allowNavigation).
const bundled = process.env.RAMOS_BUNDLED === '1';

const config: CapacitorConfig = {
  appId: 'com.arxdigital.ramos', // TWA ile aynı paket adı + aynı imza → eski kurulumun üzerine güncelleme
  appName: "Ramo's",
  webDir: bundled ? '../web/dist' : 'www',
  backgroundColor: '#0A0A0A',
  server: {
    ...(bundled ? {} : { url: 'https://ramos.arxdigitalsevice.com' }),
    cleartext: false,
    // Yalnız kendi alan adımıza gezinme; başka adresler sistem tarayıcısında açılır.
    allowNavigation: ['ramos.arxdigitalsevice.com'],
    errorPath: 'index.html',
  },
  android: {
    allowMixedContent: false,
    // Android 15+ (targetSdk 35+) kenardan kenara zorunlu: WebView durum/gezinme çubuklarının altına girmesin.
    adjustMarginsForEdgeToEdge: 'auto',
    backgroundColor: '#0A0A0A',
    // webContentsDebuggingEnabled verilmez: Capacitor varsayılanı "yalnız debuggable (debug) derleme" → release APK'da kapalı.
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ['alert', 'sound', 'badge'],
    },
  },
};

export default config;
