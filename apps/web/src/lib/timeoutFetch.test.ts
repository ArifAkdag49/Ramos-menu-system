import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createTimeoutFetch,
  REQUEST_TIMEOUT_MS,
  RequestTimeoutError,
  STORAGE_TIMEOUT_MS,
  timeoutForRequest,
} from './timeoutFetch';

/** Hiç cevap vermeyen ağ: yalnız iptal edilince reddeder — gerçek `fetch` gibi. */
const NEVER = (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> =>
  new Promise((_resolve, reject) => {
    const fail = () => reject(new DOMException('aborted', 'AbortError'));
    if (init?.signal?.aborted) fail();
    else init?.signal?.addEventListener('abort', fail, { once: true });
  });

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('createTimeoutFetch', () => {
  it('cevap gelirse onu olduğu gibi döndürür ve sayacı bırakır', async () => {
    const res = new Response('ok');
    const fetchFn = createTimeoutFetch(() => Promise.resolve(res));
    await expect(fetchFn('https://x.test/rest/v1/orders')).resolves.toBe(res);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('6 sn cevapsız kalan isteği keser', async () => {
    const fetchFn = createTimeoutFetch(NEVER);
    const pending = fetchFn('https://x.test/rest/v1/orders');
    const assertion = expect(pending).rejects.toBeInstanceOf(RequestTimeoutError);
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);
    await assertion;
  });

  it('kesilen istek `errors.network` olarak sunulabilir ve postgrest onu TEKRAR DENEMEZ', async () => {
    const fetchFn = createTimeoutFetch(NEVER);
    const pending = fetchFn('https://x.test/rest/v1/orders');
    // `name: 'AbortError'` olmazsa postgrest-js aynı GET'i 3 kez daha dener; 6 sn'lik sınır 30 sn
    // olur ve "çabuk pes et" amacı tersine döner. Mesaj ise `rpc.ts`'in ağ örüntüsüne uyar.
    const assertion = expect(pending).rejects.toMatchObject({
      name: 'AbortError',
      code: 'ABORT_ERR',
      message: expect.stringMatching(/failed to fetch/i),
    });
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);
    await assertion;
  });

  it('sınırın altında kesmez', async () => {
    const fetchFn = createTimeoutFetch(NEVER);
    const pending = fetchFn('https://x.test/rest/v1/orders');
    const settled = vi.fn();
    void pending.then(settled, settled);
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS - 1);
    expect(settled).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toHaveBeenCalled();
  });

  it('çağıranın kendi iptali zaman aşımı sayılmaz', async () => {
    const fetchFn = createTimeoutFetch(NEVER);
    const controller = new AbortController();
    const pending = fetchFn('https://x.test/rest/v1/orders', { signal: controller.signal });
    const assertion = expect(pending).rejects.not.toBeInstanceOf(RequestTimeoutError);
    controller.abort();
    await vi.advanceTimersByTimeAsync(0);
    await assertion;
  });

  it('zaten iptal edilmiş sinyalle istek hiç uçmaz', async () => {
    const fetchFn = createTimeoutFetch(NEVER);
    const controller = new AbortController();
    controller.abort();
    const pending = fetchFn('https://x.test/rest/v1/orders', { signal: controller.signal });
    const assertion = expect(pending).rejects.not.toBeInstanceOf(RequestTimeoutError);
    await vi.advanceTimersByTimeAsync(0);
    await assertion;
  });
});

describe('timeoutForRequest', () => {
  it('REST ve RPC istekleri sert sınırı paylaşır', () => {
    expect(timeoutForRequest('https://x.test/rest/v1/rpc/submit_order')).toBe(REQUEST_TIMEOUT_MS);
    expect(timeoutForRequest('https://x.test/auth/v1/token')).toBe(REQUEST_TIMEOUT_MS);
  });

  it('ürün görseli yüklemesi ayrı ve bol bütçe alır', () => {
    // Fotoğraf yüklemesi yavaş hatta meşru biçimde 6 sn'yi geçer; yarısında kesmek gönderilmiş
    // baytları çöpe atardı.
    expect(timeoutForRequest('https://x.test/storage/v1/object/product-images/a.webp')).toBe(
      STORAGE_TIMEOUT_MS,
    );
  });
});
