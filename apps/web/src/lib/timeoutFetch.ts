/**
 * R94 — Supabase isteklerine SERT zaman aşımı. Restoran telefonunda tek bir istek 10 sn boyunca
 * cevapsız asılı kalıyor, bu süre boyunca ekran "yükleniyor"da donuyordu. Donmak yerine çabuk pes
 * ederiz: hata eldeki önbellekli veriyi silmez, kullanıcı zaten bildiği "İnternet yok" mesajını
 * görür ve tekrar deneyebilir.
 */

/** Her Supabase HTTP isteğinin üst sınırı. */
export const REQUEST_TIMEOUT_MS = 6_000;

/**
 * Depolama (ürün görseli) isteklerinin sınırı. Bir fotoğrafın yüklenmesi yavaş hatta meşru biçimde
 * 6 sn'yi geçer; yarısında kesmek yalnızca gönderilmiş baytları çöpe atar. Bu yüzden ayrı ve
 * bol — ama yine sınırlı, sonsuza kadar asılı kalmaz.
 */
export const STORAGE_TIMEOUT_MS = 60_000;

/**
 * Zaman aşımı hatası.
 *
 * `name = 'AbortError'` BİLİNÇLİ bir seçimdir: postgrest-js, `AbortError` DIŞINDAKİ her fetch
 * reddini GET isteklerinde kendi içinde 3 kez daha dener (artan beklemeyle). 6 sn'lik sınır bu
 * durumda 30 sn'yi aşar, yani "çabuk pes et" amacı tam tersine dönerdi. `AbortError` ise
 * postgrest tarafından olduğu gibi yukarı verilir.
 *
 * Mesaj ise `lib/rpc.ts`'in taşıma katmanı örüntüsüne uyar ("failed to fetch"): hata UI'ya
 * `errors.network` olarak ulaşır — yeni bir hata yolu, yeni bir metin gerekmez. Tanı için ham
 * metin `RpcError.detail`'de durur (`AbortError: Failed to fetch (timeout 6000ms)`).
 */
export class RequestTimeoutError extends Error {
  override readonly name = 'AbortError';
  readonly code = 'ABORT_ERR';
  readonly timeoutMs: number;

  constructor(timeoutMs: number) {
    super(`Failed to fetch (timeout ${timeoutMs}ms)`);
    this.timeoutMs = timeoutMs;
  }
}

const urlOf = (input: RequestInfo | URL): string =>
  typeof input === 'string' ? input : input instanceof Request ? input.url : input.toString();

/** İsteğin bütçesi: depolama dışındaki her şey (okuma da yazma da) aynı sert sınırı paylaşır. */
export function timeoutForRequest(input: RequestInfo | URL): number {
  return urlOf(input).includes('/storage/v1/') ? STORAGE_TIMEOUT_MS : REQUEST_TIMEOUT_MS;
}

/**
 * `fetch`i zaman aşımlı bir sarmalayıcıya çevirir (`createClient` → `global.fetch`).
 *
 * Çağıranın kendi `AbortSignal`'i korunur: dışarıdan iptal edilen istek kendi hatasıyla reddedilir,
 * `RequestTimeoutError` ile karıştırılmaz (yoksa kullanıcı sayfadan çıktığında ekrana "İnternet
 * yok" düşerdi).
 */
export function createTimeoutFetch(
  baseFetch: typeof fetch = (...args) => fetch(...args),
  budget: (input: RequestInfo | URL) => number = timeoutForRequest,
): typeof fetch {
  return async (input, init) => {
    const ms = budget(input);
    const controller = new AbortController();
    const caller = init?.signal ?? (input instanceof Request ? input.signal : null);

    if (caller?.aborted) controller.abort(caller.reason);
    else caller?.addEventListener('abort', () => controller.abort(caller.reason), { once: true });

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, ms);

    try {
      return await baseFetch(input, { ...init, signal: controller.signal });
    } catch (e) {
      // Süre bizim yüzümüzden dolduysa hatayı ağ hatası olarak sunarız; başka her hata olduğu gibi.
      if (timedOut) throw new RequestTimeoutError(ms);
      throw e;
    } finally {
      clearTimeout(timer);
    }
  };
}
