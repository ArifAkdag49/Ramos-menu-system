/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/vanillajs" />

interface ImportMetaEnv {
  /** Görev 26 — Web Push VAPID public anahtarı (raw, base64url). `scripts/gen-vapid.mjs` üretir. */
  readonly VITE_VAPID_PUBLIC_KEY: string;
}

/**
 * R94 — derleme kimliği; `vite.config.ts` içindeki `define` her derlemede yeniden yazar.
 * Kalıcı sorgu önbelleği bunu "buster" olarak kullanır (`lib/queryPersist.ts`).
 */
declare const __RAMOS_BUILD_ID__: string;
