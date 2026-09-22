import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_LIMIT,
  MAX_BODY_BYTES,
  MAX_ITEMS,
  MAX_LIMIT,
  countStatuses,
  handleSyncRequest,
  parseLimit,
  parseSince,
  sha256Hex,
  type PullResult,
  type PushItemResult,
  type PushResult,
  type SyncDeps,
} from './logic';

const TOKEN = 'c'.repeat(64);
const HASH = createHash('sha256').update(TOKEN, 'utf8').digest('hex');
const URL_ = 'https://x.supabase.co/functions/v1/menu-sync';
const NOW = '2026-09-23T10:00:00.000+00:00';
const PRODUCT = {
  id: '6f1c2b1e-8d4a-4c1b-9a53-0d6c7f1e2a90',
  code: 'T05',
  category_id: '00000000-0000-4000-8000-000000000002',
  name: 'Test Drehspieß Sandwich',
  description: null,
  price_cents: 750,
  is_sold_out: false,
  is_active: true,
  archived: false,
  sort: 10,
  allergens: null,
  image_path: null,
  variants: [],
  sync_updated_at: NOW,
};
const CATEGORY = { id: PRODUCT.category_id, slug: 'test-food', name_de: 'Test Essen', sort: 900 };

const pullOk = (over: Partial<PullResult> = {}): PullResult => ({
  client: 'ok', now: NOW, categories: [CATEGORY], products: [PRODUCT], ...over,
});
const pushOk = (results: PushItemResult[]): PushResult => ({ client: 'ok', now: NOW, results });

function makeDeps() {
  const deps = {
    pull: vi.fn(async () => pullOk()),
    push: vi.fn(async () => pushOk([{ index: 1, ramos_id: PRODUCT.id, status: 'applied', variants: 0 }])),
    touch: vi.fn(async () => 'ok'),
    log: vi.fn(),
  } satisfies SyncDeps;
  return deps;
}

const post = (body: unknown, token: string | null = TOKEN) =>
  new Request(URL_, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token === null ? {} : { 'x-sync-token': token }) },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

describe('yardımcılar', () => {
  it('sha256Hex Node crypto ile aynı (DB: encode(sha256(convert_to(token, UTF8)), hex))', async () =>
    expect(await sha256Hex(TOKEN)).toBe(HASH));

  it('parseSince: yok/null = baştan; geçerli ISO geçer, çöp metin ve sayı düşer', () => {
    expect(parseSince(undefined)).toEqual({ ok: true, value: null });
    expect(parseSince(null)).toEqual({ ok: true, value: null });
    expect(parseSince(NOW)).toEqual({ ok: true, value: NOW });
    expect(parseSince('2026-09-23')).toEqual({ ok: true, value: '2026-09-23' });
    expect(parseSince('dün')).toEqual({ ok: false });
    expect(parseSince(1_700_000_000)).toEqual({ ok: false });
  });

  it('parseLimit: yok/null = DB varsayılanı; 1..2000 tam sayı', () => {
    expect(parseLimit(undefined)).toEqual({ ok: true, value: null });
    expect(parseLimit(100)).toEqual({ ok: true, value: 100 });
    expect(parseLimit(MAX_LIMIT)).toEqual({ ok: true, value: MAX_LIMIT });
    for (const v of [0, -1, 1.5, MAX_LIMIT + 1, '100']) expect(parseLimit(v), String(v)).toEqual({ ok: false });
  });

  it('countStatuses: durum sayaçları', () => {
    expect(countStatuses([
      { index: 1, ramos_id: null, status: 'created' },
      { index: 2, ramos_id: null, status: 'applied' },
      { index: 3, ramos_id: null, status: 'applied' },
    ])).toEqual({ created: 1, applied: 2 });
    expect(countStatuses([])).toEqual({});
  });
});

describe('kimlik ve istek biçimi', () => {
  it('POST dışı → 405', async () => {
    const deps = makeDeps();
    const res = await handleSyncRequest(new Request(URL_, { method: 'GET' }), deps);
    expect(res.status).toBe(405);
    expect(res.headers.get('Allow')).toBe('POST');
    expect(await res.json()).toEqual({ error: 'method_not_allowed' });
    expect(deps.pull).not.toHaveBeenCalled();
  });

  it('anahtar yok / bozuk → 401, DB\'ye gidilmez', async () => {
    const deps = makeDeps();
    for (const token of [null, '', 'C'.repeat(64), 'c'.repeat(63), `${'c'.repeat(64)}0`, 'z'.repeat(64)]) {
      const res = await handleSyncRequest(post({ action: 'pull' }, token), deps);
      expect(res.status, String(token)).toBe(401);
      expect(await res.json()).toEqual({ error: 'unauthorized' });
    }
    expect(deps.pull).not.toHaveBeenCalled();
  });

  it('tanınmayan / pasif istemci → 401 (pull, push, ping)', async () => {
    const deps = makeDeps();
    deps.pull.mockResolvedValue({ client: 'unknown', now: NOW, categories: [], products: [] });
    deps.push.mockResolvedValue({ client: 'unknown', now: NOW, results: [] });
    deps.touch.mockResolvedValue('unknown');
    for (const body of [{ action: 'pull' }, { action: 'push', items: [] }, { action: 'ping' }]) {
      const res = await handleSyncRequest(post(body), deps);
      expect(res.status, body.action).toBe(401);
      expect(await res.json()).toEqual({ error: 'unauthorized' });
    }
    expect(deps.pull).toHaveBeenCalledWith(HASH, null, null);
  });

  it('bozuk JSON, nesne olmayan gövde, bilinmeyen eylem, büyük gövde → 400', async () => {
    const deps = makeDeps();
    for (const body of ['{', '[]', '"pull"', 'null', JSON.stringify({ action: 'sync' }), JSON.stringify({})]) {
      const res = await handleSyncRequest(post(body), deps);
      expect(res.status, body).toBe(400);
      expect(await res.json()).toEqual({ error: 'bad_request' });
    }
    const big = JSON.stringify({ action: 'ping', error: 'x'.repeat(MAX_BODY_BYTES) });
    expect((await handleSyncRequest(post(big), deps)).status).toBe(400);
    expect(deps.pull).not.toHaveBeenCalled();
    expect(deps.touch).not.toHaveBeenCalled();
  });

  it('RPC hatası → 500 server_error; log anahtar/özet/menü içermez', async () => {
    const deps = makeDeps();
    deps.pull.mockRejectedValue(new Error('menu_sync_pull: 57014'));
    const res = await handleSyncRequest(post({ action: 'pull' }), deps);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'server_error' });
    const logged = JSON.stringify(deps.log.mock.calls);
    expect(logged).toContain('57014');
    expect(logged).not.toContain(TOKEN);
    expect(logged).not.toContain(HASH);
  });
});

describe('pull', () => {
  it('since/limit RPC\'ye aynen gider; yanıtta client alanı yok', async () => {
    const deps = makeDeps();
    const res = await handleSyncRequest(post({ action: 'pull', since: NOW, limit: 10 }), deps);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ now: NOW, categories: [CATEGORY], products: [PRODUCT] });
    expect(deps.pull).toHaveBeenCalledWith(HASH, NOW, 10);

    await handleSyncRequest(post({ action: 'pull', since: null }), deps);
    expect(deps.pull).toHaveBeenLastCalledWith(HASH, null, null);
  });

  it('bozuk since / limit → 400, RPC çağrılmaz', async () => {
    const deps = makeDeps();
    for (const body of [
      { action: 'pull', since: 'yarın' },
      { action: 'pull', since: 5 },
      { action: 'pull', limit: 0 },
      { action: 'pull', limit: MAX_LIMIT + 1 },
      { action: 'pull', limit: '10' },
    ]) {
      expect((await handleSyncRequest(post(body), deps)).status, JSON.stringify(body)).toBe(400);
    }
    expect(deps.pull).not.toHaveBeenCalled();
  });

  it('log yalnız sayaç ve imleç taşır, ürün adı taşımaz', async () => {
    const deps = makeDeps();
    await handleSyncRequest(post({ action: 'pull' }), deps);
    expect(deps.log).toHaveBeenCalledWith('info', 'menu_sync_pull',
      { since: null, limit: DEFAULT_LIMIT, categories: 1, products: 1 });
    expect(JSON.stringify(deps.log.mock.calls)).not.toContain('Drehspieß');
  });
});

describe('push', () => {
  it('kalemler RPC\'ye aynen gider; sonuçlar (current dâhil) aynen döner', async () => {
    const deps = makeDeps();
    const current = { ...PRODUCT, price_cents: 900 };
    deps.push.mockResolvedValue(pushOk([
      { index: 1, ramos_id: PRODUCT.id, status: 'rejected_older', current },
      { index: 2, ramos_id: null, status: 'created' },
    ]));
    const items = [
      { ramos_id: PRODUCT.id, price_cents: 800, updated_at: NOW },
      { ramos_id: null, code: 'T06', category_ramos_id: CATEGORY.id, name: 'Yeni', price_cents: 500, updated_at: NOW },
    ];
    const res = await handleSyncRequest(post({ action: 'push', items }), deps);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      now: NOW,
      results: [{ index: 1, ramos_id: PRODUCT.id, status: 'rejected_older', current },
                { index: 2, ramos_id: null, status: 'created' }],
    });
    expect(deps.push).toHaveBeenCalledWith(HASH, items);
    expect(deps.log).toHaveBeenCalledWith('info', 'menu_sync_push', { items: 2, rejected_older: 1, created: 1 });
    // Menü içeriği (ad/fiyat) loga yazılmaz.
    expect(JSON.stringify(deps.log.mock.calls)).not.toContain('Yeni');
  });

  it('items dizi değilse ya da MAX_ITEMS\'ı aşarsa → 400', async () => {
    const deps = makeDeps();
    for (const body of [
      { action: 'push' },
      { action: 'push', items: {} },
      { action: 'push', items: 'x' },
      { action: 'push', items: new Array(MAX_ITEMS + 1).fill({ updated_at: NOW }) },
    ]) {
      expect((await handleSyncRequest(post(body), deps)).status, JSON.stringify(body).slice(0, 40)).toBe(400);
    }
    expect(deps.push).not.toHaveBeenCalled();
    expect((await handleSyncRequest(post({ action: 'push', items: [] }), deps)).status).toBe(200);
  });
});

describe('ping', () => {
  it('hata metni RPC\'ye gider; yoksa null', async () => {
    const deps = makeDeps();
    let res = await handleSyncRequest(post({ action: 'ping', error: 'pull timeout' }), deps);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ result: 'ok' });
    expect(deps.touch).toHaveBeenLastCalledWith(HASH, 'pull timeout');

    res = await handleSyncRequest(post({ action: 'ping' }), deps);
    expect(await res.json()).toEqual({ result: 'ok' });
    expect(deps.touch).toHaveBeenLastCalledWith(HASH, null);
  });

  it('hata alanı metin değilse → 400', async () => {
    const deps = makeDeps();
    expect((await handleSyncRequest(post({ action: 'ping', error: 42 }), deps)).status).toBe(400);
    expect(deps.touch).not.toHaveBeenCalled();
  });
});
