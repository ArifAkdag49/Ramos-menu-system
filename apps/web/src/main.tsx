import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { router } from './app/router';
import './i18n';
import { setupBackButton } from './native/backButton';
import { setupNativePush } from './native/nativePush';
import { listenForInstallPrompt } from './pwa/installPrompt';
import { setupServiceWorker } from './pwa/registerSW';
import './styles/tokens.css';

// Görev 25: yükleme olayı sayfa açılır açılmaz gelebilir — React'ten önce dinle.
listenForInstallPrompt();
// Yalnız üretim derlemesinde kayıt olur; bildirime dokununca uygulama içi yönlendirme yapılır.
setupServiceWorker((path) => void router.navigate(path));
// Yerel uygulama (FCM): bildirime dokununca aynı uygulama içi yönlendirme. Tarayıcıda hiçbir şey yapmaz.
setupNativePush((path) => void router.navigate(path));
// Yerel uygulama: Android geri tuşu açık paneli kapatır, yoksa yerel taraf geçmişte geri gider.
setupBackButton();

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
