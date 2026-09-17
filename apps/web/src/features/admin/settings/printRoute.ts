/**
 * Ayarlar > Baskı yolu: saf yardımcılar (Epson Server Direct Print, tablet yazıcı istasyonu).
 * Protokol ve kurulum: docs/epson-server-direct-print.md, docs/KURULUM.md.
 */

/**
 * `settings.print_route`. `station`: yerel Android uygulamasındaki tablet istasyonu fişleri aynı
 * Wi-Fi'daki yazıcıya basar (`features/station`, `station_*` RPC'leri).
 */
export type PrintRoute = 'agent' | 'epson_sdp' | 'station';

export const PRINT_ROUTES = [
  'agent',
  'epson_sdp',
  'station',
] as const satisfies readonly PrintRoute[];

/** Ekranda gösterilen ad ve açıklama anahtarları. */
export const ROUTE_TEXT = {
  agent: { label: 'admin.settings.printRoute.agent', hint: 'admin.settings.printRoute.agentHint' },
  epson_sdp: {
    label: 'admin.settings.printRoute.epson',
    hint: 'admin.settings.printRoute.epsonHint',
  },
  station: {
    label: 'admin.settings.printRoute.station',
    hint: 'admin.settings.printRoute.stationHint',
  },
} as const satisfies Record<PrintRoute, { label: string; hint: string }>;

/** Bilinmeyen/boş değer (eski satır) ajana düşer — sunucunun varsayılanıyla aynı. */
export function toPrintRoute(value: string | null | undefined): PrintRoute {
  return (PRINT_ROUTES as readonly string[]).includes(value ?? '')
    ? (value as PrintRoute)
    : 'agent';
}

/** Kayıtlı yolda ajan boşta kalır: hangi açıklama gösterilir (ajan yolunda yok). */
export function idleNoteKey(saved: PrintRoute) {
  if (saved === 'epson_sdp') return 'admin.settings.printRoute.agentIdleNote' as const;
  if (saved === 'station') return 'admin.settings.printRoute.stationIdleNote' as const;
  return null;
}

/**
 * Yazıcının Web Config'e girilecek adresi. Anahtar yalnız oluşturma/yenileme yanıtında bilinir; bu
 * adres ekranda bir kez gösterilir, sunucuda düz hâli saklanmaz.
 */
export function sdpPrinterUrl(supabaseUrl: string, token: string): string {
  return `${supabaseUrl.replace(/\/+$/, '')}/functions/v1/epson-sdp?t=${token}`;
}

/** `derivePrinterProblem` ile aynı eşik: yazıcı 90 sn'dir istek atmadıysa bağlantı yok sayılır. */
const SDP_OFFLINE_MS = 90_000;

export function sdpConnection(
  lastSeenAt: string | null,
  now: Date,
): 'never' | 'online' | 'offline' {
  if (!lastSeenAt) return 'never';
  return now.getTime() - new Date(lastSeenAt).getTime() > SDP_OFFLINE_MS ? 'offline' : 'online';
}
