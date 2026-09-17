/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/vanillajs" />

interface ImportMetaEnv {
  /** Görev 26 — Web Push VAPID public anahtarı (raw, base64url). `scripts/gen-vapid.mjs` üretir. */
  readonly VITE_VAPID_PUBLIC_KEY: string;
}
