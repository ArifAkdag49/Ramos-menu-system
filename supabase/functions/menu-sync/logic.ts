// menu-sync — saf mantık: ikinci sistemin (arx-panel QR menüsü, kendi VPS'inde kendi Postgres'iyle)
// Ramo's menüsüyle İKİ YÖNLÜ eşitlenmesi. Deno'ya bağımlılığı yoktur; Node + Vitest ile test edilir
// (npm run fn:test).
//
// Karşı taraf kullanıcı oturumu taşıyamaz: her istemcinin kendi anahtarı vardır
// (`create_menu_sync_client`, 0016). Kimlik `x-sync-token` başlığındaki anahtarın sha256 özetiyle
// doğrulanır; düz anahtar DB'ye hiç gitmez. Pasifleştirilen (revoke) istemci anında 401 alır.
//
// Sözleşme (karşı taraf buna göre kodlanır — değiştirme):
//   POST, JSON gövde, başlık `x-sync-token: <64 küçük harf hex>`.
//
//   {"action":"pull","since":<ISO>|null,"limit":<1..2000>}
//     → 200 {"now":<ISO>,"categories":[…],"products":[…]}
//       categories: {id, slug, name_de, name_tr, name_en, name_ar, sort, is_active, is_beverage} — HEP tam liste.
//       products:   {id, code, category_id, name, description, price_cents, is_sold_out, is_active, archived,
//                    sort, allergens, image_path, variants:[{id,name_de,name_tr,price_cents,is_default,sort,
//                    is_active}], sync_updated_at} — `sync_updated_at > since` olanlar, damgaya göre sıralı.
//       Arşivlenen/pasif ürünler de döner (karşı taraf onları kendi tarafında kaldırsın).
//       İmleç: bir sonraki çağrıda `since` = alınan son ürünün `sync_updated_at` değeri. Aynı damgalı satırlar
//       bölünmez (limit aşılabilir); gelen sayı limit'e eşitse hemen yeniden çekilmelidir.
//
//   {"action":"push","items":[…]} → 200 {"now":<ISO>,"results":[…]}
//     item: {ramos_id:uuid|null, code:text|null, category_ramos_id:uuid|null, name, description,
//            price_cents:int, is_sold_out:bool, deleted:bool, variants:[{id,price_cents}],
//            updated_at:<ISO — KARŞI TARAFIN damgası>}
//     result: {index, ramos_id, status, variants?, reason?, current?}
//     status: "applied" | "created" | "rejected_older" | "not_found" | "invalid".
//     Son yazan kazanır: `updated_at` bizim `sync_updated_at`imizden büyük değilse "rejected_older" döner ve
//     `current` alanında BİZİM satırımız (pull ile aynı biçim) gelir — karşı taraf onu benimser.
//     Tek pakette en fazla MAX_ITEMS kalem; fazlası 400.
//
//   {"action":"ping","error":<metin>|null} → 200 {"result":"ok"} (son görülme / son hata yazılır)
//
//   401 {"error":"unauthorized"} · 400 {"error":"bad_request"} · 405 {"error":"method_not_allowed"}
//   · 500 {"error":"server_error"}
//
// Ramo's tarafındaki değişiklik karşı tarafa ANINDA haber verilir (0016: pg_net + Vault; gövde
// {"source":"ramos"}, başlık x-sync-secret). Bildirim 3 sn'de bire seyreltilir ve garanti DEĞİLDİR:
// karşı taraf ayrıca periyodik (ör. 60 sn) pull yapmalıdır.

/** `create_menu_sync_client` 32 rastgele baytı küçük harf hex yazar. */
export const TOKEN_RE = /^[0-9a-f]{64}$/;
/** Push paketleri büyük olabilir (500 ürün + varyantlar); fazlası kötü istek sayılır. */
export const MAX_BODY_BYTES = 1024 * 1024;
export const MAX_ITEMS = 500;
export const MAX_LIMIT = 2000;
export const DEFAULT_LIMIT = 500;

export interface PullResult {
  client: 'ok' | 'unknown';
  now: string;
  categories: unknown[];
  products: unknown[];
}

export interface PushItemResult {
  index: number;
  ramos_id: string | null;
  status: 'applied' | 'created' | 'rejected_older' | 'not_found' | 'invalid';
  variants?: number;
  reason?: string;
  current?: Record<string, unknown>;
}

export interface PushResult {
  client: 'ok' | 'unknown';
  now: string;
  results: PushItemResult[];
}

export interface SyncDeps {
  /** `public.menu_sync_pull` */
  pull(tokenHash: string, since: string | null, limit: number | null): Promise<PullResult>;
  /** `public.menu_sync_push` */
  push(tokenHash: string, items: unknown[]): Promise<PushResult>;
  /** `public.menu_sync_touch` → 'ok' | 'unknown' */
  touch(tokenHash: string, error: string | null): Promise<string>;
  log(level: 'info' | 'warn' | 'error', message: string, data?: Record<string, unknown>): void;
}

// ---------- küçük yardımcılar ----------

export async function sha256Hex(text: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  let out = '';
  for (const b of digest) out += b.toString(16).padStart(2, '0');
  return out;
}

/** `since`: yok/null = "her şeyi ver"; metin ise geçerli bir tarih olmalı (aksi hâlde 400). */
export function parseSince(v: unknown): { ok: true; value: string | null } | { ok: false } {
  if (v === undefined || v === null) return { ok: true, value: null };
  if (typeof v !== 'string') return { ok: false };
  const t = Date.parse(v);
  if (!Number.isFinite(t)) return { ok: false };
  return { ok: true, value: v };
}

/** `limit`: yok/null = DB varsayılanı (500); sayı ise 1..2000 tam sayı olmalı. */
export function parseLimit(v: unknown): { ok: true; value: number | null } | { ok: false } {
  if (v === undefined || v === null) return { ok: true, value: null };
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > MAX_LIMIT) return { ok: false };
  return { ok: true, value: v };
}

/** Sonuç sayaçları: log'a YALNIZ bunlar ve kimlikler yazılır, menü içeriği asla. */
export function countStatuses(results: PushItemResult[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of results) out[r.status] = (out[r.status] ?? 0) + 1;
  return out;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const errorCode = (e: unknown) => (e instanceof Error ? e.message : String(e));

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  });
const unauthorized = () => json(401, { error: 'unauthorized' });
const badRequest = () => json(400, { error: 'bad_request' });

// ---------- istek işleyici ----------

export async function handleSyncRequest(req: Request, deps: SyncDeps): Promise<Response> {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' }, { Allow: 'POST' });

  // Biçimi tutmayan anahtar DB'ye hiç gitmez.
  const token = req.headers.get('x-sync-token') ?? '';
  if (!TOKEN_RE.test(token)) return unauthorized();
  const tokenHash = await sha256Hex(token);

  const declared = Number(req.headers.get('Content-Length') ?? '0');
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return badRequest();
  let body: unknown;
  try {
    const raw = new Uint8Array(await req.arrayBuffer());
    if (raw.byteLength > MAX_BODY_BYTES) return badRequest();
    body = JSON.parse(new TextDecoder().decode(raw));
  } catch {
    return badRequest();
  }
  if (!isObject(body)) return badRequest();

  try {
    switch (body.action) {
      case 'pull':
        return await pull(tokenHash, body, deps);
      case 'push':
        return await push(tokenHash, body, deps);
      case 'ping':
        return await ping(tokenHash, body, deps);
      default:
        return badRequest();
    }
  } catch (e) {
    // Anahtar, özet ve menü içeriği asla loglanmaz; yalnız eylem ve RPC hata kodu.
    deps.log('error', 'menu_sync_failed', { action: String(body.action), error: errorCode(e) });
    return json(500, { error: 'server_error' });
  }
}

async function pull(tokenHash: string, body: Record<string, unknown>, deps: SyncDeps): Promise<Response> {
  const since = parseSince(body.since);
  const limit = parseLimit(body.limit);
  if (!since.ok || !limit.ok) return badRequest();

  const result = await deps.pull(tokenHash, since.value, limit.value);
  if (result.client !== 'ok') return unauthorized();
  const categories = result.categories ?? [];
  const products = result.products ?? [];
  deps.log('info', 'menu_sync_pull', {
    since: since.value, limit: limit.value ?? DEFAULT_LIMIT,
    categories: categories.length, products: products.length,
  });
  return json(200, { now: result.now, categories, products });
}

async function push(tokenHash: string, body: Record<string, unknown>, deps: SyncDeps): Promise<Response> {
  const items = body.items;
  if (!Array.isArray(items) || items.length > MAX_ITEMS) return badRequest();

  const result = await deps.push(tokenHash, items);
  if (result.client !== 'ok') return unauthorized();
  const results = result.results ?? [];
  // Yalnız sayaçlar ve kimlikler; ad/açıklama/fiyat loga yazılmaz.
  deps.log('info', 'menu_sync_push', { items: items.length, ...countStatuses(results) });
  return json(200, { now: result.now, results });
}

async function ping(tokenHash: string, body: Record<string, unknown>, deps: SyncDeps): Promise<Response> {
  const { error } = body;
  if (error !== undefined && error !== null && typeof error !== 'string') return badRequest();
  const result = await deps.touch(tokenHash, error ?? null);
  if (result !== 'ok') return unauthorized();
  return json(200, { result });
}
