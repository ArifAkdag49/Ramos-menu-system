/**
 * Ayarlar > Baskı yolu: saf yardımcılar (Epson Server Direct Print). Protokol ve kurulum:
 * docs/epson-server-direct-print.md, docs/KURULUM.md.
 */

export type PrintRoute = 'agent' | 'epson_sdp';

/**
 * Yazıcının Web Config'e girilecek adresi. Anahtar yalnız oluşturma/yenileme yanıtında bilinir; bu
 * adres ekranda bir kez gösterilir, sunucuda düz hâli saklanmaz.
 */
export function sdpPrinterUrl(supabaseUrl: string, token: string): string {
  return `${supabaseUrl.replace(/\/+$/, '')}/functions/v1/epson-sdp?t=${token}`;
}

/** `derivePrinterProblem` ile aynı eşik: yazıcı 90 sn'dir istek atmadıysa bağlantı yok sayılır. */
const SDP_OFFLINE_MS = 90_000;

export function sdpConnection(lastSeenAt: string | null, now: Date): 'never' | 'online' | 'offline' {
  if (!lastSeenAt) return 'never';
  return now.getTime() - new Date(lastSeenAt).getTime() > SDP_OFFLINE_MS ? 'offline' : 'online';
}
