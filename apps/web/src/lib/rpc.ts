import { isRpcErrorKey, type RpcErrorKey } from '@ramos/shared';
import { supabase } from './supabase';

export type ErrorKey = RpcErrorKey | 'network' | 'unknown';

export class RpcError extends Error {
  readonly key: ErrorKey;
  readonly detail?: string;

  constructor(key: ErrorKey, detail?: string) {
    super(key);
    this.name = 'RpcError';
    this.key = key;
    this.detail = detail;
  }
}

/**
 * Postgres/PostgREST kodlarının otoriter olduğu durumlar. Kod, mesaj metninden güvenilirdir.
 * `57014` (statement timeout) özellikle buradadır: mesajı "timeout" içerdiği için ağ hatası
 * sanılıp kullanıcıya "İnternet yok" demek yanlış yönlendirme olur — internet çalışıyor.
 */
const CODE_KEYS: Record<string, ErrorKey> = {
  '42501': 'not_authorized', // insufficient_privilege (RLS reddi)
  '57014': 'unknown', // query_canceled / statement timeout — sunucu tarafı
};

/** Yalnız taşıma katmanı hataları. Belirsiz olduğu için "timeout" sözcüğü kasıtlı olarak yok. */
const NETWORK_MESSAGE = /failed to fetch|fetch failed|networkerror|network error|load failed/i;

export async function callRpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn as never, args as never);
  if (error) {
    const msg = error.message ?? '';
    const { code, details } = error as { code?: string; details?: string };

    let key: ErrorKey;
    if (isRpcErrorKey(msg)) key = msg; // RPC'nin kendi anahtarı — en güvenilir kaynak
    else if (code && CODE_KEYS[code]) key = CODE_KEYS[code];
    else if (NETWORK_MESSAGE.test(msg)) key = 'network';
    else key = 'unknown';

    // Eşlenemeyen hata sessizce kaybolmasın: ham kod ve mesaj `detail`'de taşınır.
    const detail = details || [code, msg].filter(Boolean).join(': ') || undefined;
    throw new RpcError(key, detail);
  }
  return data as T;
}
