/**
 * Ramo's service worker (Görev 25, `injectManifest`). Üç işi var:
 *
 * 1. **Uygulama kabuğu:** derlemenin JS/CSS/HTML/ikonları önbelleğe alınır; sayfa gezinmeleri
 *    (`/waiter`, `/kitchen`, …) önbellekteki `index.html`'e düşer, böylece bağlantı koptuğunda da
 *    uygulama açılır ve "İnternet yok" şeridini gösterebilir.
 * 2. **Push:** `notify-ready` Edge Function'ın gönderdiği `{ title, body, tag, url }` bildirimi.
 * 3. **Bildirime dokunma:** açık pencere varsa öne getirip uygulama içinde yönlendirir, yoksa açar.
 *
 * Supabase (REST, Auth, Realtime, Storage) istekleri **hiç** önbelleğe alınmaz: burada yalnız
 * önbellek listesindeki dosyalar ve aynı kökenli sayfa gezinmeleri için yol var, geri kalan her
 * istek SW'ye hiç uğramamış gibi ağa gider. Sipariş verisi asla bayat gösterilmez.
 */
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
  type PrecacheEntry,
} from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<PrecacheEntry | string>;
};

const DEFAULT_URL = '/waiter/ready';
const ICON = '/app-icons/icon-192.png';
const BADGE = '/app-icons/badge-72.png';

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

registerRoute(
  new NavigationRoute(createHandlerBoundToURL('/index.html'), {
    denylist: [
      // Android uygulamasının Digital Asset Links doğrulaması gerçek dosyayı görmeli.
      /^\/\.well-known\//,
      // Uzantılı adresler (ikon, manifest, görsel) SPA sayfası değildir.
      /\/[^/?]+\.[a-z0-9]+(?:\?.*)?$/i,
    ],
  }),
);

/** "Yeni sürüm hazır — Yenile": `workbox-window` `{ type: 'SKIP_WAITING' }` gönderir. */
self.addEventListener('message', (event) => {
  const data = event.data as unknown;
  const type = typeof data === 'object' && data !== null ? (data as { type?: unknown }).type : data;
  if (type === 'SKIP_WAITING') void self.skipWaiting();
});

interface ReadyPush {
  title?: string;
  body?: string;
  tag?: string;
  url?: string;
}

function readPayload(data: PushMessageData | null): ReadyPush {
  if (!data) return {};
  try {
    return data.json() as ReadyPush;
  } catch {
    return { body: data.text() };
  }
}

/** `lib.webworker` `renotify` ve `vibrate` alanlarını tanımıyor; tarayıcılar destekliyor. */
type ShowOptions = NotificationOptions & { renotify?: boolean; vibrate?: number[] };

self.addEventListener('push', (event) => {
  const payload = readPayload(event.data);
  const options: ShowOptions = {
    body: payload.body ?? '',
    icon: ICON,
    badge: BADGE,
    vibrate: [200, 100, 200],
    data: { url: payload.url ?? DEFAULT_URL },
  };
  // Aynı siparişin bildirimi öncekinin yerine geçer ama yine titreşir/ses çıkarır.
  // `renotify` etiketsiz verilirse Chrome bildirimi hiç göstermez (TypeError).
  if (payload.tag) {
    options.tag = payload.tag;
    options.renotify = true;
  }
  // `userVisibleOnly`: her push mutlaka görünür bir bildirimle sonuçlanmalı.
  event.waitUntil(self.registration.showNotification(payload.title || "Ramo's", options));
});

/** Yalnız aynı kökenli, `/` ile başlayan yol kabul edilir — bildirim verisi dış adrese yönlendiremez. */
function targetPath(data: unknown): string {
  const url = (data as { url?: unknown } | null)?.url;
  return typeof url === 'string' && url.startsWith('/') && !url.startsWith('//')
    ? url
    : DEFAULT_URL;
}

async function openOrFocus(path: string): Promise<void> {
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const ours = windows.filter((c) => new URL(c.url).origin === self.location.origin);
  const client = ours.find((c) => c.focused) ?? ours[0];
  if (!client) {
    await self.clients.openWindow(path);
    return;
  }
  // Uygulama içi yönlendirme (tam sayfa yenilemesi yok, açık sepet ve oturum korunur):
  // `src/pwa/registerSW.ts` bu mesajı dinler.
  client.postMessage({ type: 'NAVIGATE', url: path });
  await client.focus();
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(openOrFocus(targetPath(event.notification.data)));
});
