import type { CapacitorConfig } from '@capacitor/cli';

// Ramo's yerel uygulaması: uygulama canlı siteyi (server.url) WebView'da açar — site yayını uygulamayı
// da günceller. `www/` yalnız çevrimdışı yedek sayfadır (site açılamazsa gösterilir).
const config: CapacitorConfig = {
  appId: 'com.arxdigital.ramos', // TWA ile aynı paket adı + aynı imza → eski kurulumun üzerine güncelleme
  appName: "Ramo's",
  webDir: 'www',
  backgroundColor: '#0A0A0A',
  server: {
    url: 'https://ramos.arxdigitalsevice.com',
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
