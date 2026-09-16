# Ramo's Sipariş Sistemi — Plan 2: Giriş, Personel ve Garson Uygulaması (M2–M3, Görev 10–15)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Personel hesap yönetimini (Edge Function) ve garsonun telefonundaki tüm sipariş akışını kurmak: giriş → masalar → sipariş girişi → sepet → mutfağa gönderme → masa detayı, iptal, hesap özeti, masa taşıma/kapatma.

**Architecture:**
- `apps/web`: tek bir Vite + React SPA. Rol bazlı rotalar (`/waiter`, `/kitchen`, `/admin`).
- Veri: sunucu verisi TanStack Query ile, sepet Zustand (persist) ile tutulur.
- Canlılık: Realtime broadcast olayları sorgu önbelleğini geçersiz kılar.
- Kurallar: iş kuralları `@ramos/shared` (anlık doğrulama) + sunucu RPC'leri (son söz).

**Tech Stack:** Vite · React 19 · TypeScript strict · Tailwind CSS v4 · React Router · TanStack Query · Zustand · react-i18next · Motion · @supabase/supabase-js v2 · Vitest + Testing Library · Playwright (webapp-testing) · Supabase Edge Functions (Deno)

**Spec:** `docs/superpowers/specs/2026-09-15-ramos-siparis-sistemi-design.md` (§4, §7, §8.1, §8.2, §8.5, §11.2, §12, §14, §15)

## Global Constraints
**Faz B kuralı (her görevde geçerli):**
- Bu plandaki "kullanıcıya sor", "onay al" ve "kullanıcıdan iste" ifadeleri Faz A'da karşılandı (BUILD-PROMPT §3). **Soru sormadan devam et.**
- Fiziksel doğrulamaları `docs/BUILD-PROGRESS.md` → "Kullanıcıya kalan kontroller" listesine yaz.
- **Tasarım:** BUILD-PROMPT §10'daki sadelik ilkeleri ve zorunlu tasarım skill'leri geçerlidir. M3 sonunda tasarım kapısı var.
- **Görseller:** BUILD-PROMPT §11 geçerlidir; ürün görselleri şimdilik boş, yer tutucu gösterilir.

`docs/BUILD-PROMPT.md` §5'teki kısıtların hepsi geçerlidir. Bu planda özellikle:
- **Ekran ve dokunma:** Telefon öncelikli (390×844), dokunma hedefleri ≥ 48 px, ana eylemler alt bölgede.
- **Tema ve tipografi:** Koyu tema, tokenlar `--bg #0A0A0A`, `--lime #88B600`, `--gold #C49736`, `--danger #E5484D`; Montserrat.
- **Dil ve biçim:**
  - TR/DE, dil personelin `locale` alanından gelir.
  - Ürün adı tek dil; kategori, malzeme ve seçenek adları `localName()` ile gösterilir.
  - Para `formatEuro()`, sipariş no `formatOrderNo()` ile biçimlenir.
- **Hatalar:** RPC hataları `error.message` → i18n anahtarı `errors.<key>`.
- **Kimlik doğrulama:**
  - Kayıt ekranı yok; `signUp` ve `resetPasswordForEmail` çağrılmaz.
  - Giriş e-postası `${username}@${VITE_STAFF_EMAIL_DOMAIN}`.
- **Almanca metin ve büyük harf:** Almanca metin kapsayıcılarına `lang="de"` verilir (büyük harfte "İ" hatası).

## Dosya haritası (bu plan)
```
supabase/functions/admin-staff/index.ts        # Deno giriş noktası (ince)
supabase/functions/admin-staff/logic.ts        # saf doğrulama/karar mantığı (Node'da test edilir)
supabase/functions/admin-staff/logic.test.ts
supabase/vitest.functions.config.ts
scripts/deploy-function.mjs                    # Management API multipart deploy
scripts/create-admin.mjs · scripts/create-printer-user.mjs
supabase/tests/staff.test.ts                   # canlı fonksiyon entegrasyon testi
apps/web/
  index.html · vite.config.ts · tsconfig.json · package.json · .env(.example)
  src/main.tsx · src/app/App.tsx · src/app/router.tsx · src/app/RoleGate.tsx
  src/styles/tokens.css · src/styles/global.css
  src/lib/supabase.ts · src/lib/auth.ts (useSession, signIn, signOut, profile)
  src/lib/rpc.ts (callRpc + RpcError) · src/lib/queryClient.ts
  src/lib/realtime.ts (useBroadcastInvalidation)
  src/i18n/index.ts · src/i18n/tr.json · src/i18n/de.json
  src/data/menu.ts (useMenu) · src/data/tables.ts (useTableOverview, useSession…) · src/data/orders.ts
  src/data/printer.ts (usePrinterStatus) · src/data/settings.ts
  src/ui/ (Button, Sheet, Chip, Stepper, Badge, Banner, Toast, EmptyState, Spinner …)
  src/features/auth/LoginPage.tsx
  src/features/waiter/WaiterLayout.tsx · TablesPage.tsx · TableDetailPage.tsx · OrderPage.tsx
  src/features/waiter/ProductSheet.tsx · CartDrawer.tsx · ReadyPage.tsx · ProfilePage.tsx
  src/features/waiter/cartStore.ts · BillSheet.tsx · MoveTableSheet.tsx · CancelItemSheet.tsx
  src/test/setup.ts · e2e/*.spec.ts (Playwright) · playwright.config.ts
```

---

## Görev 10: Personel yönetimi — `admin-staff` Edge Function ve hesap betikleri

**Files:**
- Create: `supabase/functions/admin-staff/logic.ts`, `supabase/functions/admin-staff/index.ts`
- Create: `supabase/vitest.functions.config.ts`, `scripts/deploy-function.mjs`, `scripts/create-admin.mjs`, `scripts/create-printer-user.mjs`
- Modify: `package.json` (`fn:test`, `fn:deploy` script'leri; `test` zincirine `fn:test`)
- Test: `supabase/functions/admin-staff/logic.test.ts`, `supabase/tests/staff.test.ts`

**Interfaces:**
- Consumes: `profiles`, `audit_log`; `ensureTestUsers`, `clientFor`, `emailOf` (Plan 1)
- Produces:
  - **İstek:** `POST {SUPABASE_URL}/functions/v1/admin-staff`, başlıklar `Authorization: Bearer <admin JWT>` ve `apikey`.
  - **Gövde (JSON):**
    - `{ action: 'create', username, display_name, role: 'waiter'|'kitchen'|'admin', pin, locale }` → `201 { user_id }`
    - `{ action: 'update', user_id, display_name?, role?, locale? }` → `200 {}`
    - `{ action: 'reset_pin', user_id, pin }` → `200 {}`
    - `{ action: 'set_active', user_id, active }` → `200 {}`
  - **Hata:** `{ error: <anahtar> }`, HTTP 400/403/409. Anahtarlar:
    - `not_authorized`, `invalid_request`, `username_invalid`, `username_taken`, `display_name_invalid`
    - `role_invalid`, `pin_invalid`, `password_too_short`, `locale_invalid`
    - `cannot_deactivate_self`, `last_admin`, `user_not_found`
  - **`logic.ts` (saf fonksiyonlar):**
    - `validateCreate(input): { ok: true, value } | { ok: false, error }`
    - `validateSecret(role, pin): string | null`
    - `emailFor(username, domain): string`
    - `guardDeactivate({ targetId, meId, targetRole, activeAdmins }): string | null`
  - **Betikler:**
    - `npm run fn:deploy -- admin-staff`
    - `node --env-file=.env scripts/create-admin.mjs <username> "<Ad Soyad>"` (parola `ADMIN_PASSWORD` ortam değişkeninden)
    - `node --env-file=.env scripts/create-printer-user.mjs` → `apps/print-agent/.env` dosyasını yazar

- [x] **Adım 1: Saf mantık testlerini yaz (kırmızı)**

`supabase/functions/admin-staff/logic.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { emailFor, guardDeactivate, validateCreate, validateSecret } from './logic';

describe('admin-staff mantığı', () => {
  it('PIN kuralları role göre', () => {
    expect(validateSecret('waiter', '123456')).toBeNull();
    expect(validateSecret('waiter', '12345')).toBe('pin_invalid');
    expect(validateSecret('kitchen', '12ab56')).toBe('pin_invalid');
    expect(validateSecret('admin', 'kısa')).toBe('password_too_short');
    expect(validateSecret('admin', 'uzun-parola-10')).toBeNull();
  });
  it('create doğrulaması: kullanıcı adı, rol, dil', () => {
    const ok = validateCreate({ username: 'Ahmet', display_name: 'Ahmet', role: 'waiter', pin: '482915', locale: 'tr' });
    expect(ok).toEqual({ ok: true, value: { username: 'ahmet', display_name: 'Ahmet', role: 'waiter', pin: '482915', locale: 'tr' } });
    expect(validateCreate({ username: 'a b', display_name: 'x', role: 'waiter', pin: '482915', locale: 'tr' }))
      .toEqual({ ok: false, error: 'username_invalid' });
    expect(validateCreate({ username: 'drucker', display_name: 'x', role: 'printer', pin: '482915', locale: 'tr' }))
      .toEqual({ ok: false, error: 'role_invalid' });
    expect(validateCreate({ username: 'mehmet', display_name: 'M', role: 'waiter', pin: '482915', locale: 'en' }))
      .toEqual({ ok: false, error: 'locale_invalid' });
  });
  it('e-posta eşlemesi', () => {
    expect(emailFor('ahmet', 'staff.arxdigitalsevice.com')).toBe('ahmet@staff.arxdigitalsevice.com');
  });
  it('pasifleştirme korumaları', () => {
    expect(guardDeactivate({ targetId: 'a', meId: 'a', targetRole: 'admin', activeAdmins: 2 })).toBe('cannot_deactivate_self');
    expect(guardDeactivate({ targetId: 'b', meId: 'a', targetRole: 'admin', activeAdmins: 1 })).toBe('last_admin');
    expect(guardDeactivate({ targetId: 'b', meId: 'a', targetRole: 'waiter', activeAdmins: 1 })).toBeNull();
  });
});
```
`supabase/vitest.functions.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { environment: 'node', include: ['supabase/functions/**/*.test.ts'] } });
```
`package.json` script'lerine ekle:
- `"fn:test": "vitest run --config supabase/vitest.functions.config.ts"`
- `"fn:deploy": "node --env-file=.env scripts/deploy-function.mjs"`
- `test` script'ini `"npm run test --workspaces --if-present && npm run fn:test"` yap.

Run: `npm run fn:test` → Expected: FAIL (`./logic` yok)

- [x] **Adım 2: `logic.ts` dosyasını yaz**
```ts
export type StaffRole = 'admin' | 'waiter' | 'kitchen';
export interface CreateInput { username: string; display_name: string; role: StaffRole; pin: string; locale: 'tr' | 'de' }
type Result<T> = { ok: true; value: T } | { ok: false; error: string };

const USERNAME = /^[a-z0-9._-]{3,32}$/;
const ROLES: readonly string[] = ['admin', 'waiter', 'kitchen'];

export function validateSecret(role: string, pin: string): string | null {
  if (role === 'admin') return typeof pin === 'string' && pin.length >= 10 ? null : 'password_too_short';
  return /^[0-9]{6,12}$/.test(pin ?? '') ? null : 'pin_invalid';
}

export function validateCreate(raw: Record<string, unknown>): Result<CreateInput> {
  const username = String(raw.username ?? '').trim().toLowerCase();
  const display_name = String(raw.display_name ?? '').trim();
  const role = String(raw.role ?? '');
  const pin = String(raw.pin ?? '');
  const locale = String(raw.locale ?? 'tr');
  if (!USERNAME.test(username)) return { ok: false, error: 'username_invalid' };
  if (display_name.length < 1 || display_name.length > 60) return { ok: false, error: 'display_name_invalid' };
  if (!ROLES.includes(role)) return { ok: false, error: 'role_invalid' };
  if (locale !== 'tr' && locale !== 'de') return { ok: false, error: 'locale_invalid' };
  const secretError = validateSecret(role, pin);
  if (secretError) return { ok: false, error: secretError };
  return { ok: true, value: { username, display_name, role: role as StaffRole, pin, locale } };
}

export const emailFor = (username: string, domain: string): string => `${username}@${domain}`;

export function guardDeactivate(a: { targetId: string; meId: string; targetRole: string; activeAdmins: number }): string | null {
  if (a.targetId === a.meId) return 'cannot_deactivate_self';
  if (a.targetRole === 'admin' && a.activeAdmins <= 1) return 'last_admin';
  return null;
}
```
Run: `npm run fn:test` → Expected: PASS

- [x] **Adım 3: Deno giriş noktasını yaz**

`supabase/functions/admin-staff/index.ts`:
```ts
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { emailFor, guardDeactivate, validateCreate, validateSecret } from './logic.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'invalid_request' });

  const url = Deno.env.get('SUPABASE_URL')!;
  const service = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const domain = Deno.env.get('STAFF_EMAIL_DOMAIN') ?? 'staff.arxdigitalsevice.com';

  const token = req.headers.get('Authorization')?.replace('Bearer ', '') ?? '';
  const { data: auth } = await service.auth.getUser(token);
  const meId = auth.user?.id;
  const { data: me } = meId
    ? await service.from('profiles').select('id, role, is_active').eq('id', meId).single()
    : { data: null };
  if (!me || me.role !== 'admin' || !me.is_active) return json(403, { error: 'not_authorized' });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json(400, { error: 'invalid_request' }); }
  const audit = (action: string, entityId: string, details: Record<string, unknown> = {}) =>
    service.from('audit_log').insert({ actor_id: me.id, action, entity: 'profile', entity_id: entityId, details });

  if (body.action === 'create') {
    const v = validateCreate(body);
    if (!v.ok) return json(400, { error: v.error });
    const { data: taken } = await service.from('profiles').select('id').eq('username', v.value.username).maybeSingle();
    if (taken) return json(409, { error: 'username_taken' });
    const { data: created, error } = await service.auth.admin.createUser({
      email: emailFor(v.value.username, domain), password: v.value.pin, email_confirm: true,
    });
    if (error || !created.user) return json(409, { error: 'username_taken' });
    const { error: pErr } = await service.from('profiles').insert({
      id: created.user.id, username: v.value.username, display_name: v.value.display_name,
      role: v.value.role, locale: v.value.locale,
    });
    if (pErr) return json(400, { error: 'invalid_request' });
    await audit('staff_create', created.user.id, { username: v.value.username, role: v.value.role });
    return json(201, { user_id: created.user.id });
  }

  const userId = String(body.user_id ?? '');
  const { data: target } = await service.from('profiles').select('id, role, is_active').eq('id', userId).maybeSingle();
  if (!target || target.role === 'printer') return json(404, { error: 'user_not_found' });
  const { count: activeAdmins } = await service.from('profiles')
    .select('id', { count: 'exact', head: true }).eq('role', 'admin').eq('is_active', true);

  if (body.action === 'update') {
    const patch: Record<string, unknown> = {};
    if (typeof body.display_name === 'string') {
      const dn = body.display_name.trim();
      if (dn.length < 1 || dn.length > 60) return json(400, { error: 'display_name_invalid' });
      patch.display_name = dn;
    }
    if (body.locale !== undefined) {
      if (body.locale !== 'tr' && body.locale !== 'de') return json(400, { error: 'locale_invalid' });
      patch.locale = body.locale;
    }
    if (body.role !== undefined) {
      if (!['admin', 'waiter', 'kitchen'].includes(String(body.role))) return json(400, { error: 'role_invalid' });
      if (target.role === 'admin' && body.role !== 'admin' && (activeAdmins ?? 0) <= 1) return json(400, { error: 'last_admin' });
      patch.role = body.role;
    }
    await service.from('profiles').update(patch).eq('id', userId);
    await audit('staff_update', userId, patch);
    return json(200, {});
  }

  if (body.action === 'reset_pin') {
    const err = validateSecret(target.role, String(body.pin ?? ''));
    if (err) return json(400, { error: err });
    const { error } = await service.auth.admin.updateUserById(userId, { password: String(body.pin) });
    if (error) return json(400, { error: 'invalid_request' });
    await audit('staff_reset_pin', userId);
    return json(200, {});
  }

  if (body.action === 'set_active') {
    const active = body.active === true;
    if (!active) {
      const guard = guardDeactivate({ targetId: userId, meId: me.id, targetRole: target.role, activeAdmins: activeAdmins ?? 0 });
      if (guard) return json(400, { error: guard });
    }
    await service.auth.admin.updateUserById(userId, { ban_duration: active ? 'none' : '876000h' });
    await service.from('profiles').update({ is_active: active, ...(active ? {} : { on_duty_since: null }) }).eq('id', userId);
    await audit(active ? 'staff_activate' : 'staff_deactivate', userId);
    return json(200, {});
  }

  return json(400, { error: 'invalid_request' });
});
```

- [x] **Adım 4: Yayın betiğini yaz ve fonksiyonu yayınla (kullanıcı onayıyla)**

`scripts/deploy-function.mjs`:
```js
// Kullanım: npm run fn:deploy -- admin-staff [--no-verify-jwt]
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const [name, flag] = process.argv.slice(2);
if (!name) { console.error('Fonksiyon adı gerekli'); process.exit(1); }
const dir = path.resolve('supabase/functions', name);
const form = new FormData();
form.append('metadata', JSON.stringify({ entrypoint_path: 'index.ts', name, verify_jwt: flag !== '--no-verify-jwt' }));
for (const f of await readdir(dir)) {
  if (f.endsWith('.test.ts')) continue;
  form.append('file', new Blob([await readFile(path.join(dir, f))], { type: 'application/typescript' }), f);
}
const res = await fetch(
  `https://api.supabase.com/v1/projects/${process.env.SUPABASE_PROJECT_REF}/functions/deploy?slug=${name}`,
  { method: 'POST', headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}` }, body: form });
console.log(res.status, await res.text());
if (!res.ok) process.exit(1);
```
Kullanıcıdan Edge Function yayını için onay al. Function secret'ını ekle (`SUPABASE_URL` ve `SUPABASE_SERVICE_ROLE_KEY` otomatik gelir):
```bash
curl -s -X POST "https://api.supabase.com/v1/projects/$SUPABASE_PROJECT_REF/secrets" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" \
  -d '[{"name":"STAFF_EMAIL_DOMAIN","value":"staff.arxdigitalsevice.com"}]'
```
Run: `npm run fn:deploy -- admin-staff` → Expected: `201` ya da `200` ve JSON. MCP varsa `deploy_edge_function` da kullanılabilir.

- [x] **Adım 5: Canlı entegrasyon testini yaz ve çalıştır**

`supabase/tests/staff.test.ts`:
```ts
import { beforeAll, describe, expect, it } from 'vitest';
import { anonClient, clientFor, emailOf, ensureTestUsers } from './helpers/users';

let ids: Awaited<ReturnType<typeof ensureTestUsers>>;
const call = async (who: 'admin' | 'waiter', body: unknown) => {
  const c = await clientFor(who);
  const { data: { session } } = await c.auth.getSession();
  const res = await fetch(`${process.env.SUPABASE_URL}/functions/v1/admin-staff`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${session!.access_token}`, apikey: process.env.SUPABASE_ANON_KEY!,
               'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
};

beforeAll(async () => { ids = await ensureTestUsers(); });

describe('admin-staff', () => {
  it('garson çağıramaz', async () => {
    expect(await call('waiter', { action: 'reset_pin', user_id: ids.waiter2, pin: '123456' }))
      .toEqual({ status: 403, body: { error: 'not_authorized' } });
  });
  it('geçersiz PIN reddedilir', async () => {
    expect((await call('admin', { action: 'create', username: 'test-x', display_name: 'X', role: 'waiter',
      pin: '12', locale: 'tr' })).body).toEqual({ error: 'pin_invalid' });
  });
  it('PIN sıfırlanır, pasifleştirilen kullanıcı giriş yapamaz, geri açılır', async () => {
    expect((await call('admin', { action: 'reset_pin', user_id: ids.waiter2, pin: '654321' })).status).toBe(200);
    const c = anonClient();
    expect((await c.auth.signInWithPassword({ email: emailOf('test-waiter2'), password: '654321' })).error).toBeNull();
    expect((await call('admin', { action: 'set_active', user_id: ids.waiter2, active: false })).status).toBe(200);
    expect((await anonClient().auth.signInWithPassword({ email: emailOf('test-waiter2'), password: '654321' })).error)
      .not.toBeNull();
    expect((await call('admin', { action: 'set_active', user_id: ids.waiter2, active: true })).status).toBe(200);
    await ensureTestUsers(); // parolayı TEST_USER_PASSWORD'e geri çeker
  });
  it('admin kendini pasifleştiremez', async () => {
    expect((await call('admin', { action: 'set_active', user_id: ids.admin, active: false })).body)
      .toEqual({ error: 'cannot_deactivate_self' });
  });
});
```
Run: `npm run db:test -- staff` → Expected: PASS (4 test)

- [x] **Adım 6: İlk admin ve yazıcı hesabı betikleri (Faz A girdileriyle — durma)**

> **Faz B'de:** Aşağıdaki "Kullanıcıdan şunları iste" cümlesini **atla**. Faz A'da toplanan değerleri kullan:
> - admin kullanıcı adı ve görünen ad (`BUILD-PROGRESS.md` başlığında)
> - `ADMIN_PASSWORD` (`.env`, kullanıcı yazdı)
> - `STAFF_EMAIL_DOMAIN` ve `SEED_TABLE_COUNT`
>
> Admin oluşturulduktan sonra `ADMIN_PASSWORD` satırını `.env`'den **sil**.

Kullanıcıdan şunları iste: ilk **admin kullanıcı adı**, **görünen ad**, **parola** (≥ 10 karakter), `STAFF_EMAIL_DOMAIN` teyidi ve **masa sayısı**. Masa sayısı 12'den farklıysa kök `.env`'e `SEED_TABLE_COUNT=<n>` yaz ve `npm run db:seed` çalıştır. Seed yalnızca eksik masaları ekler; fazla masalar admin panelden pasifleştirilir.

`scripts/create-admin.mjs`:
```js
// Kullanım (parola ortam değişkeninden, dosyaya yazılmaz):
//   $env:ADMIN_PASSWORD='…'; node --env-file=.env scripts/create-admin.mjs ramo "Ramo"
import { createClient } from '@supabase/supabase-js';
const [username, displayName] = process.argv.slice(2);
const password = process.env.ADMIN_PASSWORD;
if (!username || !displayName || !password || password.length < 10) {
  console.error('Kullanım: ADMIN_PASSWORD (≥10) + <username> "<Görünen ad>"'); process.exit(1);
}
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const email = `${username.toLowerCase()}@${process.env.STAFF_EMAIL_DOMAIN}`;
const { data, error } = await s.auth.admin.createUser({ email, password, email_confirm: true });
if (error) { console.error(error.message); process.exit(1); }
const { error: pErr } = await s.from('profiles').insert({
  id: data.user.id, username: username.toLowerCase(), display_name: displayName, role: 'admin', locale: 'tr' });
if (pErr) { console.error(pErr.message); process.exit(1); }
console.log(`Admin oluşturuldu: ${username}`);
```
`scripts/create-printer-user.mjs`:
```js
import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const email = `drucker@${process.env.STAFF_EMAIL_DOMAIN}`;
const password = randomBytes(24).toString('base64url');
const { data: list } = await s.auth.admin.listUsers({ perPage: 1000 });
let user = list.users.find((u) => u.email === email);
if (user) await s.auth.admin.updateUserById(user.id, { password });
else user = (await s.auth.admin.createUser({ email, password, email_confirm: true })).data.user;
await s.from('profiles').upsert({ id: user.id, username: 'drucker', display_name: 'Drucker', role: 'printer', locale: 'de' });
writeFileSync('apps/print-agent/.env', [
  `SUPABASE_URL=${process.env.SUPABASE_URL}`, `SUPABASE_ANON_KEY=${process.env.SUPABASE_ANON_KEY}`,
  `AGENT_EMAIL=${email}`, `AGENT_PASSWORD=${password}`, 'AGENT_ID=ramos-pc-1', 'LOG_DIR=',
].join('\n') + '\n', 'utf8');
console.log('Yazıcı hesabı hazır; apps/print-agent/.env yazıldı (commit ETME).');
```
`apps/print-agent/` klasörü yoksa önce oluştur (`mkdir`). Betikleri çalıştır. Parola asla ekrana ya da repoya yazılmaz; kullanıcıya yalnızca "oluşturuldu" bilgisi verilir.

- [x] **Adım 7: Commit**
```bash
git add supabase/functions/admin-staff supabase/vitest.functions.config.ts supabase/tests/staff.test.ts scripts/deploy-function.mjs scripts/create-admin.mjs scripts/create-printer-user.mjs package.json
git commit -m "feat(auth): admin-staff Edge Function (oluştur/güncelle/PIN/pasifleştir), admin ve yazıcı hesap betikleri"
```

---

## Görev 11: Web uygulaması iskeleti — tokenlar, giriş, rol yönlendirme, i18n, RPC sarmalayıcı

**Files:**
- Create: `apps/web/` (Vite react-ts şablonu, ardından aşağıdaki dosyalar)
- Create: `apps/web/src/styles/tokens.css`, `src/lib/supabase.ts`, `src/lib/auth.ts`, `src/lib/rpc.ts`, `src/i18n/index.ts`, `src/i18n/tr.json`, `src/i18n/de.json`, `src/app/router.tsx`, `src/app/RoleGate.tsx`, `src/app/App.tsx`, `src/features/auth/LoginPage.tsx`, `src/ui/Button.tsx`, `src/test/setup.ts`
- Create: `apps/web/playwright.config.ts`, `apps/web/e2e/login.spec.ts`
- Modify: `packages/shared/src/index.ts` → `export type { Database } from './database.types';`
- Test: `src/lib/rpc.test.ts`, `src/i18n/i18n.test.ts`, `src/features/auth/LoginPage.test.tsx`

**Interfaces:**
- Consumes: `@ramos/shared` (`isRpcErrorKey`, `RPC_ERROR_KEYS`, `Database`)
- Produces:
  - İstemci: `supabase` (tipli istemci; persist oturum, `realtime: { worker: true }`)
  - Oturum (`auth.ts`):
    - `useAuth()` → `{ ready, session, profile, init(), signIn(username, pin), signOut(), reloadProfile() }`
    - `Profile` = `{ id, username, display_name, role, locale, is_active, on_duty_since }`
    - `homeFor(role): string`
  - RPC (`rpc.ts`): `callRpc<T>(fn, args?): Promise<T>` başarısızlıkta `RpcError { key: RpcErrorKey | 'network' | 'unknown', detail?: string }` fırlatır
  - Dil (`i18n/index.ts`):
    - `setLanguage(locale)` → i18next dilini ve `<html lang>` değerini ayarlar
    - Çeviri anahtar kökleri: `common.*`, `login.*`, `waiter.*`, `kitchen.*`, `admin.*`, `status.*`, `errors.<rpcKey>` (+ `errors.login_failed`, `errors.network`, `errors.unknown`)
  - Yönlendirme: `<RoleGate roles={Role[]}>` · rotalar BUILD-PROMPT §5'teki gibi

- [ ] **Adım 1: Uygulamayı oluştur ve bağımlılıkları kur**
```bash
npm create vite@latest apps/web -- --template react-ts
npm i -w apps/web react-router @tanstack/react-query zustand i18next react-i18next @supabase/supabase-js motion @fontsource-variable/montserrat lucide-react clsx
npm i -D -w apps/web tailwindcss @tailwindcss/vite @testing-library/react @testing-library/user-event @testing-library/jest-dom jsdom @playwright/test
npx -w apps/web playwright install chromium
```
Ek ayarlar:
- `apps/web/package.json`: `"@ramos/shared": "*"` bağımlılığını ekle.
- `apps/web/package.json` script'leri: `"dev": "vite"`, `"build": "tsc --noEmit && vite build"`, `"typecheck": "tsc --noEmit"`, `"test": "vitest run"`, `"e2e": "playwright test"`.
- Şablondaki örnek dosyaları sil: `App.css`, `assets/`, sayaç örneği.
- `apps/web/.env` ve `.env.example`: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_STAFF_EMAIL_DOMAIN=staff.arxdigitalsevice.com`.

`apps/web/vite.config.ts`:
```ts
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5173, host: true },
  test: { environment: 'jsdom', setupFiles: ['src/test/setup.ts'], include: ['src/**/*.test.{ts,tsx}'] },
});
```
`src/test/setup.ts`: `import '@testing-library/jest-dom/vitest';`

- [ ] **Adım 2: Tasarım sistemi ve tokenlar (`ui-ux-pro-max` + `frontend-design`)**

`ui-ux-pro-max` design system çıktısını al:
```bash
python ~/.claude/skills/ui-ux-pro-max/scripts/search.py "restaurant POS waiter app dark mobile" --design-system
```
Betik bozuk symlink hatası verirse şu adımlarla düzelt:
1. `github.com/nextlevelbuilder/ui-ux-pro-max-skill` reposunu klonla.
2. `src/ui-ux-pro-max/{scripts,data}` klasörlerini skill klasörüne kopyala.

Çıktıdan boşluk, köşe yuvarlaklığı, gölge ve hareket değerlerini al. **Marka renkleri sabittir** (spec §14).

**Tasarım yönü: sade, şık, herkesin anlayacağı.** BUILD-PROMPT §10'daki sadelik ilkeleri bu projenin tasarım anayasasıdır.
- `frontend-design`: sanat yönünü netleştir.
- `design-system`: token katmanlarını kur (temel → anlamsal → bileşen).
- `ui-styling`: erişilebilir primitive'leri kur (Sheet, Dialog, Tabs).
- `design:ux-copy`: ilk TR/DE metin tonunu belirle (kısa, günlük dil).

Kararları `docs/design/DESIGN.md` dosyasına yaz: renk anlamları, tipografi ölçeği, boşluk ölçeği, bileşen örnekleri. Sonraki tüm UI görevleri buna uyar.

`apps/web/src/styles/tokens.css`:
```css
@import 'tailwindcss';
@import '@fontsource-variable/montserrat';

@theme {
  --color-bg: #0A0A0A;
  --color-surface: #141414;
  --color-surface-2: #1C1C1C;
  --color-border: #2A2A2A;
  --color-text: #F5F5F0;
  --color-muted: #A3A3A3;
  --color-lime: #88B600;
  --color-gold: #C49736;
  --color-danger: #E5484D;
  --color-warning: #F5A524;
  --color-info: #3E9BFF;
  --font-sans: 'Montserrat Variable', ui-sans-serif, system-ui, sans-serif;
  --radius-card: 14px;
}
html { background: var(--color-bg); color: var(--color-text); color-scheme: dark; }
body { font-family: var(--font-sans); -webkit-tap-highlight-color: transparent; overscroll-behavior-y: none; }
.tabular { font-variant-numeric: tabular-nums; }
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; } }
```
`src/ui/` altında temel bileşenleri oluştur: `Button`, `IconButton`, `Chip`, `Sheet` (alttan açılan panel, odak kapanı, Esc ile kapanır), `Stepper`, `Badge`, `Banner`, `Toast`, `Spinner`, `EmptyState`. Kurallar:
- Hepsi ≥ 48 px dokunma hedefi, görünür odak halkası (`focus-visible:ring-2 ring-lime`) ve `aria-*` etiketleriyle yazılır.
- `Button` varyantları: `primary` (lime zemin, `#0A0A0A` metin), `secondary` (surface-2), `danger`, `ghost`; `loading` durumunda spinner gösterir ve tıklanamaz.

- [ ] **Adım 3: Testleri yaz (kırmızı)**

`src/lib/rpc.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest';

vi.mock('./supabase', () => ({ supabase: { rpc: vi.fn() } }));
import { supabase } from './supabase';
import { callRpc, RpcError } from './rpc';

describe('callRpc', () => {
  it('bilinen anahtarı RpcError.key olarak taşır', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: null, error: { message: 'product_sold_out', details: 'p1' } } as never);
    await expect(callRpc('submit_order', {})).rejects.toMatchObject({ key: 'product_sold_out', detail: 'p1' });
  });
  it('ağ hatasını network, bilinmeyeni unknown yapar', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: null, error: { message: 'TypeError: Failed to fetch' } } as never);
    await expect(callRpc('x')).rejects.toBeInstanceOf(RpcError);
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: null, error: { message: 'weird' } } as never);
    await expect(callRpc('x')).rejects.toMatchObject({ key: 'unknown' });
  });
  it('başarıda veriyi döndürür', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: { ok: 1 }, error: null } as never);
    await expect(callRpc('x')).resolves.toEqual({ ok: 1 });
  });
});
```
`src/i18n/i18n.test.ts`:
```ts
import { RPC_ERROR_KEYS } from '@ramos/shared';
import { describe, expect, it } from 'vitest';
import de from './de.json';
import tr from './tr.json';

const flat = (o: Record<string, unknown>, p = ''): string[] =>
  Object.entries(o).flatMap(([k, v]) => (typeof v === 'object' && v ? flat(v as Record<string, unknown>, `${p}${k}.`) : [`${p}${k}`]));

describe('i18n', () => {
  it('tr ve de aynı anahtarlara sahip', () => expect(flat(tr).sort()).toEqual(flat(de).sort()));
  it('her RPC hata anahtarının çevirisi var', () => {
    for (const k of [...RPC_ERROR_KEYS, 'login_failed', 'network', 'unknown']) expect(flat(tr)).toContain(`errors.${k}`);
  });
});
```
`src/features/auth/LoginPage.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import '../../i18n';

const signIn = vi.fn();
vi.mock('../../lib/auth', () => ({
  useAuth: (sel: (s: unknown) => unknown) => sel({ signIn, profile: null, session: null, ready: true }),
  homeFor: () => '/waiter',
}));
import { LoginPage } from './LoginPage';

describe('LoginPage', () => {
  it('kullanıcı adı + PIN ile giriş dener, hatada genel mesaj gösterir', async () => {
    signIn.mockRejectedValueOnce(new Error('login_failed'));
    render(<MemoryRouter><LoginPage /></MemoryRouter>);
    await userEvent.type(screen.getByLabelText(/kullanıcı adı/i), 'ahmet');
    await userEvent.type(screen.getByLabelText(/pin/i), '123456');
    await userEvent.click(screen.getByRole('button', { name: /giriş/i }));
    expect(signIn).toHaveBeenCalledWith('ahmet', '123456');
    expect(await screen.findByRole('alert')).toHaveTextContent(/kullanıcı adı veya pin hatalı/i);
  });
});
```
Run: `npm test -w apps/web` → Expected: FAIL (modüller yok)

- [ ] **Adım 4: Uygula**

`src/lib/supabase.ts`:
```ts
import type { Database } from '@ramos/shared';
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient<Database>(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'ramos-auth' },
  realtime: {
    worker: true,
    heartbeatCallback: (status: string) => { if (status === 'disconnected') supabase.realtime.connect(); },
  },
});
supabase.auth.onAuthStateChange((_event, session) => { void supabase.realtime.setAuth(session?.access_token ?? null); });
```
`src/lib/rpc.ts`:
```ts
import { isRpcErrorKey, type RpcErrorKey } from '@ramos/shared';
import { supabase } from './supabase';

export type ErrorKey = RpcErrorKey | 'network' | 'unknown';
export class RpcError extends Error {
  constructor(public key: ErrorKey, public detail?: string) { super(key); }
}
export async function callRpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn as never, args as never);
  if (error) {
    const msg = error.message ?? '';
    const key: ErrorKey = isRpcErrorKey(msg) ? msg : /fetch|network|timeout/i.test(msg) ? 'network' : 'unknown';
    throw new RpcError(key, (error as { details?: string }).details || undefined);
  }
  return data as T;
}
```
`src/lib/auth.ts`:
```ts
import type { Session } from '@supabase/supabase-js';
import { create } from 'zustand';
import { setLanguage } from '../i18n';
import { supabase } from './supabase';

export type Role = 'admin' | 'waiter' | 'kitchen' | 'printer';
export interface Profile {
  id: string; username: string; display_name: string; role: Role;
  locale: 'tr' | 'de'; is_active: boolean; on_duty_since: string | null;
}
interface AuthStore {
  ready: boolean; session: Session | null; profile: Profile | null;
  init(): Promise<void>; signIn(username: string, pin: string): Promise<void>;
  signOut(): Promise<void>; reloadProfile(): Promise<void>;
}
const emailFor = (u: string) => `${u.trim().toLowerCase()}@${import.meta.env.VITE_STAFF_EMAIL_DOMAIN}`;
const usable = (p: Profile | null): p is Profile => !!p && p.is_active && p.role !== 'printer';

async function loadProfile(uid: string): Promise<Profile | null> {
  const { data } = await supabase.from('profiles')
    .select('id, username, display_name, role, locale, is_active, on_duty_since').eq('id', uid).maybeSingle();
  return (data as Profile | null) ?? null;
}

export const useAuth = create<AuthStore>((set, get) => ({
  ready: false, session: null, profile: null,
  async init() {
    const { data } = await supabase.auth.getSession();
    const profile = data.session ? await loadProfile(data.session.user.id) : null;
    if (data.session && !usable(profile)) { await supabase.auth.signOut(); set({ ready: true, session: null, profile: null }); return; }
    if (profile) setLanguage(profile.locale);
    set({ ready: true, session: data.session, profile });
    supabase.auth.onAuthStateChange((_e, s) => set(s ? { session: s } : { session: null, profile: null }));
  },
  async signIn(username, pin) {
    const { data, error } = await supabase.auth.signInWithPassword({ email: emailFor(username), password: pin });
    if (error || !data.session) throw new Error('login_failed');
    const profile = await loadProfile(data.session.user.id);
    if (!usable(profile)) { await supabase.auth.signOut(); throw new Error('login_failed'); }
    setLanguage(profile.locale);
    set({ session: data.session, profile });
  },
  async signOut() { await supabase.auth.signOut(); set({ session: null, profile: null }); },
  async reloadProfile() { const s = get().session; if (s) set({ profile: await loadProfile(s.user.id) }); },
}));

export const homeFor = (role: Role): string => (role === 'admin' ? '/admin' : role === 'kitchen' ? '/kitchen' : '/waiter');
```
`src/i18n/index.ts`:
```ts
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import de from './de.json';
import tr from './tr.json';

void i18n.use(initReactI18next).init({
  resources: { tr: { translation: tr }, de: { translation: de } },
  lng: localStorage.getItem('ramos-locale') ?? 'tr', fallbackLng: 'de', interpolation: { escapeValue: false },
});
export function setLanguage(locale: 'tr' | 'de') {
  void i18n.changeLanguage(locale);
  document.documentElement.lang = locale;
  try { localStorage.setItem('ramos-locale', locale); } catch { /* özel mod */ }
}
export default i18n;
```
`tr.json` / `de.json`: her ekranın metinleri bu görevlerde eklenir. Başlangıçta şunları içermeli:
- `common` (kaydet, iptal, geri, onayla, tamam, çıkış)
- `login.title`, `login.username` ("Kullanıcı adı" / "Benutzername"), `login.pin` ("PIN"), `login.submit` ("Giriş" / "Anmelden")
- `errors.*`: RPC anahtarlarının hepsi, ayrıca `login_failed` ("Kullanıcı adı veya PIN hatalı" / "Benutzername oder PIN falsch"), `network`, `unknown`
- `status.*`: `in_kitchen`, `ready`, `served`, `cancelled`, `pending`, `printing`, `printed`, `failed`

`src/app/RoleGate.tsx`:
```tsx
import type { ReactNode } from 'react';
import { Navigate } from 'react-router';
import { homeFor, useAuth, type Role } from '../lib/auth';

export function RoleGate({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const profile = useAuth((s) => s.profile);
  if (!profile) return <Navigate to="/login" replace />;
  if (!roles.includes(profile.role)) return <Navigate to={homeFor(profile.role)} replace />;
  return <>{children}</>;
}
```
`src/app/router.tsx`: `createBrowserRouter` ile BUILD-PROMPT §5'teki rotaları kur. `/waiter` altındakiler `<RoleGate roles={['waiter','admin']}>` içindedir; `/kitchen` için `['kitchen','admin']`; `/admin/*` için `['admin']`; `/` ve `*` rotaları `homeFor`'a ya da `/login`'e yönlenir.

Henüz yazılmamış sayfalar (Görev 13–16, 21) bu görevde tek satırlık bileşen olarak açılır (`<h1>{t('waiter.tables.title')}</h1>`). Kendi görevlerinde tamamen değiştirilir.

`src/app/App.tsx`:
- `QueryClientProvider` ve `RouterProvider` sarmalayıcılarını kurar.
- Açılışta `useAuth.getState().init()` çalıştırır; `ready` olana kadar tam ekran marka yükleyicisi gösterilir.
- `main.tsx`, `tokens.css` dosyasını import eder.

`src/features/auth/LoginPage.tsx`:
- Ekranın ortasında "RAMO'S" marka yazısı (Görev 25'te logo görseliyle değişir) ve iki alan:
  - Kullanıcı adı: `autoComplete="username"`, `autoCapitalize="none"`
  - PIN: `type="password"`, `inputMode="numeric"`, `autoComplete="current-password"`
- Gönderince `signIn` çağrılır; başarılıysa `navigate(homeFor(profile.role))`.
- Hatada `role="alert"` ile `t('errors.login_failed')` gösterilir.
- Buton `loading` iken tekrar gönderim engellenir.

Run: `npm test -w apps/web` → Expected: PASS

- [ ] **Adım 5: E2E giriş testi ve ekran görüntüsü (`webapp-testing`)**

`apps/web/playwright.config.ts`:
```ts
import { defineConfig, devices } from '@playwright/test';
process.loadEnvFile('../../.env');
export default defineConfig({
  testDir: 'e2e',
  use: { baseURL: 'http://localhost:5173', locale: 'tr-TR', timezoneId: 'Europe/Berlin' },
  webServer: { command: 'npm run dev', port: 5173, reuseExistingServer: true },
  projects: [
    { name: 'phone', use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } } },
    { name: 'tablet', use: { viewport: { width: 1280, height: 800 } } },
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
  ],
});
```
`apps/web/e2e/login.spec.ts`:
```ts
import { expect, test } from '@playwright/test';

test('garson girişi /waiter sayfasına yönlenir; yanlış PIN hata verir', async ({ page }, info) => {
  await page.goto('/login');
  await page.getByLabel(/kullanıcı adı/i).fill('test-waiter');
  await page.getByLabel(/pin/i).fill('000000');
  await page.getByRole('button', { name: /giriş/i }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await page.screenshot({ path: `../../docs/screenshots/m2-login-${info.project.name}.png` });
  await page.getByLabel(/pin/i).fill(process.env.TEST_USER_PASSWORD!);
  await page.getByRole('button', { name: /giriş/i }).click();
  await expect(page).toHaveURL(/\/waiter$/);
});
```
Run: `npm run e2e -w apps/web -- login` → Expected: PASS (3 görünüm). Ekran görüntülerini aç ve tasarımı gözle kontrol et: kontrast, hizalama, dokunma alanları.

- [ ] **Adım 6: Commit**
```bash
git add apps/web packages/shared/src/index.ts docs/screenshots package.json package-lock.json
git commit -m "feat(web): uygulama iskeleti — marka tokenları, giriş, rol yönlendirme, TR/DE, RPC hata eşleme"
```

---

## Görev 12: Veri katmanı ve Realtime tazeleme

**Files:**
- Create: `apps/web/src/lib/queryClient.ts`, `src/lib/realtime.ts`, `src/lib/online.ts`
- Create: `src/data/keys.ts`, `src/data/menu.ts`, `src/data/menuMapper.ts`, `src/data/tables.ts`, `src/data/orders.ts`, `src/data/orderMapper.ts`, `src/data/printer.ts`, `src/data/settings.ts`, `src/data/staff.ts`
- Test: `src/data/menuMapper.test.ts`, `src/data/orderMapper.test.ts`, `src/data/printer.test.ts`, `src/lib/realtime.test.ts`

**Interfaces:**
- Consumes: `supabase`, `callRpc` (Görev 11); `MenuProduct` ve diğer tipler (`@ramos/shared`)
- Produces:
  - **Sorgu anahtarları:** `qk.menu`, `qk.tables`, `qk.session(tableId)`, `qk.sessionOrders(sessionId)`, `qk.kitchen`, `qk.ready`, `qk.printer`, `qk.settings`, `qk.staff`, `qk.bill(sessionId)`
  - **Menü:**
    - `useMenu(): { categories: MenuCategory[]; products: MenuProduct[]; byId: Map<string, MenuProduct> }`
    - `MenuCategory` = `{ id, name_de, name_tr, is_beverage, sort }`
  - **Masalar ve oturumlar:**
    - `useTableOverview(): TableRow[]` (`table_overview` RPC satırları)
    - `useOpenSession(tableId): { id, table_id, opened_at, opened_by } | null`
    - `useSessionOrders(sessionId): OrderView[]`
  - **Mutfak ve hazır:** `useKitchenOrders(): OrderView[]` (`in_kitchen` + son 30 dk'daki `ready`), `useReadyOrders(): OrderView[]`
  - **`OrderView` alanları:** `{ id, order_no, round_no, status, created_at, ready_at, note, waiter_id, waiter_name, table_name, items: OrderItemView[], print: { status, last_error, job_id } | null }`
    - `print`: siparişin `order`/`addition`/`reprint` işlerinden en yenisi
    - `OrderItemView` = `order_items` satırı; jsonb alanları tiplidir
  - **Mutasyonlar (TanStack):** `useSubmitOrder`, `useCancelItem`, `useMarkReady`, `useUndoReady`, `useMarkServed`, `useCloseSession`, `useMoveSession`, `useSetSoldOut`, `useReprint`, `useRetryJob`, `useSetOnDuty`, `useSetLocale`, `useBill(sessionId)`. Hepsi `callRpc` üzerinden çalışır; başarıda ilgili anahtarlar geçersiz kılınır.
  - **Diğer veriler:**
    - `usePrinterStatus(): { status, problem: PrinterProblem | null }`
    - `derivePrinterProblem(row, now): 'agent_offline' | 'printer_unreachable' | 'paper_end' | 'cover_open' | 'jobs_failed' | null`
    - `useSettings()`, `useStaffNames(): Map<string, string>`
  - **Realtime ve bağlantı:**
    - `useBroadcastInvalidation(topics: Topic[]): 'connected' | 'connecting' | 'offline'`
    - `Topic` = `'orders' | 'menu' | 'print-jobs' | 'printer-status' | 'settings'`
    - `keysForTopic(topic): QueryKey[]`
    - `useOnline(): boolean`

- [ ] **Adım 1: Saf eşleyici testlerini yaz (kırmızı)**

`src/data/menuMapper.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { mapProducts } from './menuMapper';

const row = {
  id: 'p', category_id: 'c', code: '08', name: 'Drehspieß Teller', description: null, base_price_cents: null,
  allergens: null, is_sold_out: false, sort: 1,
  product_variants: [
    { id: 'k', name_de: 'Kalb', name_tr: 'Dana', price_cents: 1350, is_default: false, sort: 2, is_active: true },
    { id: 'h', name_de: 'Hähnchen', name_tr: 'Tavuk', price_cents: 1250, is_default: true, sort: 1, is_active: true },
    { id: 'x', name_de: 'Alt', name_tr: null, price_cents: 1, is_default: false, sort: 3, is_active: false }],
  product_ingredients: [{ sort: 2, ingredients: { id: 'z', name_de: 'Zwiebeln', name_tr: 'Soğan', is_active: true } },
                        { sort: 1, ingredients: { id: 't', name_de: 'Tomaten', name_tr: 'Domates', is_active: true } }],
  product_option_groups: [
    { sort: 2, option_groups: { id: 's', name_de: 'Soße', name_tr: 'Sos', min_select: 1, max_select: 3, ticket_format: 'label_values',
        sort: 9, is_active: true, options: [
          { id: 'b', name_de: 'Kräuter', name_tr: 'Otlu', price_delta_cents: 0, is_default: false, is_exclusive: false, sort: 2, is_active: true },
          { id: 'a', name_de: 'Knoblauch', name_tr: 'Sarımsaklı', price_delta_cents: 0, is_default: false, is_exclusive: false, sort: 1, is_active: true }] } },
    { sort: 1, option_groups: { id: 'g', name_de: 'Beilage', name_tr: 'Garnitür', min_select: 1, max_select: 1,
        ticket_format: 'values_only', sort: 1, is_active: false, options: [] } }],
};

describe('mapProducts', () => {
  it('pasifleri eler, her şeyi sort alanına göre dizer, grup sırasını ürün bağlantısından alır', () => {
    const [p] = mapProducts([row as never]);
    expect(p!.variants.map((v) => v.id)).toEqual(['h', 'k']);
    expect(p!.ingredients.map((i) => i.id)).toEqual(['t', 'z']);
    expect(p!.groups.map((g) => g.id)).toEqual(['s']);
    expect(p!.groups[0]!.options.map((o) => o.id)).toEqual(['a', 'b']);
  });
});
```
`src/data/orderMapper.test.ts` — `mapOrders(rows, staffNames)` için:
- `table_name` alanı `table_sessions.dining_tables.name`'den gelmeli.
- `waiter_name` alanı `staffNames` haritasından gelmeli.
- `items` alanı `is_beverage`, `category_sort`, `sort` sırasına göre dizilmeli.
- `print` alanı `order`/`addition`/`reprint` işleri arasından en yeni `created_at` olanı seçmeli.
- Durumu `cancelled` olan kalemler **korunmalı**, çünkü KDS bunları üstü çizili gösterir.

Beklenen değerleri açıkça yazan bir test hazırla.

`src/data/printer.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { derivePrinterProblem } from './printer';

const now = new Date('2026-09-15T18:00:00Z');
const base = { last_seen_at: '2026-09-15T17:59:30Z', printer_reachable: true, printer_state: {}, failed_jobs: 0 };

describe('derivePrinterProblem', () => {
  it('90 sn sinyal yoksa ajan çevrimdışı', () =>
    expect(derivePrinterProblem({ ...base, last_seen_at: '2026-09-15T17:58:29Z' }, now)).toBe('agent_offline'));
  it('öncelik: ajan > ulaşılamıyor > kağıt > kapak > başarısız iş', () => {
    expect(derivePrinterProblem({ ...base, printer_reachable: false }, now)).toBe('printer_unreachable');
    expect(derivePrinterProblem({ ...base, printer_state: { paper_end: true, cover_open: true } }, now)).toBe('paper_end');
    expect(derivePrinterProblem({ ...base, printer_state: { cover_open: true } }, now)).toBe('cover_open');
    expect(derivePrinterProblem({ ...base, failed_jobs: 2 }, now)).toBe('jobs_failed');
    expect(derivePrinterProblem(base, now)).toBeNull();
  });
});
```
`src/lib/realtime.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { keysForTopic } from './realtime';

describe('keysForTopic', () => {
  it('orders olayı masa, oturum, sipariş ve hesap önbelleğini tazeler', () =>
    expect(keysForTopic('orders')).toEqual([['tables'], ['session'], ['orders'], ['bill']]));
  it('menu olayı menüyü ve masaları tazeler', () => expect(keysForTopic('menu')).toEqual([['menu'], ['tables']]));
  it('printer-status ve settings kendi anahtarlarını', () => {
    expect(keysForTopic('printer-status')).toEqual([['printer-status']]);
    expect(keysForTopic('settings')).toEqual([['settings']]);
  });
});
```
Run: `npm test -w apps/web` → Expected: FAIL

- [ ] **Adım 2: Uygula**

`src/data/keys.ts`:
```ts
export const qk = {
  menu: ['menu'] as const, tables: ['tables'] as const,
  session: (tableId: string) => ['session', tableId] as const,
  sessionOrders: (sessionId: string) => ['orders', 'session', sessionId] as const,
  kitchen: ['orders', 'kitchen'] as const, ready: ['orders', 'ready'] as const,
  printer: ['printer-status'] as const, settings: ['settings'] as const, staff: ['staff'] as const,
  bill: (sessionId: string) => ['bill', sessionId] as const,
};
```
`src/lib/queryClient.ts`: `new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: true } } })`

`src/lib/realtime.ts`:
```ts
import { useQueryClient, type QueryKey } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { supabase } from './supabase';

export type Topic = 'orders' | 'menu' | 'print-jobs' | 'printer-status' | 'settings';
const MAP: Record<Topic, QueryKey[]> = {
  orders: [['tables'], ['session'], ['orders'], ['bill']],
  menu: [['menu'], ['tables']],
  'print-jobs': [['orders'], ['printer-status']],
  'printer-status': [['printer-status']],
  settings: [['settings']],
};
export const keysForTopic = (t: Topic): QueryKey[] => MAP[t];

export function useBroadcastInvalidation(topics: Topic[]): 'connected' | 'connecting' | 'offline' {
  const qc = useQueryClient();
  const [state, setState] = useState<'connected' | 'connecting' | 'offline'>('connecting');
  const topicKey = topics.join(',');
  useEffect(() => {
    let alive = true;
    const invalidateAll = () => topics.forEach((t) => keysForTopic(t).forEach((k) => qc.invalidateQueries({ queryKey: k })));
    const channels = topics.map((topic) =>
      supabase.channel(topic, { config: { private: true } })
        .on('broadcast', { event: '*' }, () => keysForTopic(topic).forEach((k) => qc.invalidateQueries({ queryKey: k })))
        .subscribe((status) => {
          if (!alive) return;
          if (status === 'SUBSCRIBED') { setState('connected'); invalidateAll(); }
          else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') setState('offline');
        }));
    const onVisible = () => { if (document.visibilityState === 'visible') invalidateAll(); };
    document.addEventListener('visibilitychange', onVisible);
    void supabase.realtime.setAuth();
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', onVisible);
      channels.forEach((c) => void supabase.removeChannel(c));
    };
  }, [qc, topicKey]); // eslint-disable-line react-hooks/exhaustive-deps
  return state;
}
```
`src/lib/online.ts`: `navigator.onLine` değerini ve `online`/`offline` olaylarını dinleyen bir `useOnline()` hook'u.

`src/data/menuMapper.ts`:
- Test kalıbındaki satırları `MenuProduct`'a çevirir.
- Pasif varyant, malzeme, grup ve seçenekleri eler.
- `sort` alanına göre dizer.
- Grup sırası `product_option_groups.sort`'tan gelir.

`src/data/menu.ts`:
- `useMenu()` iki sorgu yapar:
  - `categories`: `is_active = true`, `sort` sırasıyla.
  - `products`: iç içe select ile, `is_active = true` ve `archived_at is null`.
- Sorgu anahtarı `qk.menu`, `staleTime` 5 dk.
- İç içe select dizesi:
```ts
const PRODUCT_SELECT = `id, category_id, code, name, description, base_price_cents, allergens, image_path, is_sold_out, sort,
  product_variants(id, name_de, name_tr, price_cents, is_default, sort, is_active),
  product_ingredients(sort, ingredients(id, name_de, name_tr, is_active)),
  product_option_groups(sort, option_groups(id, name_de, name_tr, min_select, max_select, ticket_format, sort, is_active,
    options(id, name_de, name_tr, price_delta_cents, is_default, is_exclusive, sort, is_active)))`;
```
`src/data/orders.ts` — sipariş sorguları için ortak select:
```ts
export const ORDER_SELECT = `id, order_no, round_no, status, created_at, ready_at, note, waiter_id,
  table_sessions!inner(id, dining_tables!inner(name)),
  order_items(id, product_id, quantity, product_code, product_name, variant_name_de, variant_name_tr,
    removed_ingredients, selected_options, note, status, cancel_reason, sort, category_sort, is_beverage, unit_price_cents),
  print_jobs(id, type, status, last_error, created_at)`;
```
Sorgular:
- `useSessionOrders`: `.eq('session_id', id).order('created_at')`
- `useKitchenOrders`: `.in('status', ['in_kitchen', 'ready']).gte('created_at', <şimdi − 24 sa>).order('created_at')`. Ardından istemcide `ready` olup `ready_at`'ı 30 dk'dan eski olanlar elenir. `refetchInterval` 30 sn.
- `useReadyOrders`: `.eq('status', 'ready')`

Mutasyonlar, örnek:
```ts
export function useMarkReady() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (orderId: string) => callRpc<void>('mark_order_ready', { p_order_id: orderId }),
    onSettled: () => { void qc.invalidateQueries({ queryKey: ['orders'] }); void qc.invalidateQueries({ queryKey: ['tables'] }); },
  });
}
```
Diğer mutasyonlar aynı kalıpla yazılır; parametre adları Plan 1'deki RPC imzalarıyla birebir aynıdır:
- `useCancelItem` → `cancel_order_item({ p_item_id, p_reason })`
- `useUndoReady` → `undo_order_ready({ p_order_id })`
- `useMarkServed` → `mark_order_served({ p_order_id })`
- `useCloseSession` → `close_table_session({ p_session_id })`
- `useMoveSession` → `move_table_session({ p_session_id, p_target_table_id })`
- `useSetSoldOut` → `set_product_sold_out({ p_product_id, p_sold_out })`
- `useReprint` → `reprint_order({ p_order_id })`
- `useRetryJob` → `retry_print_job({ p_job_id })`
- `useSetOnDuty` → `set_on_duty({ p_on })`, ardından `useAuth.getState().reloadProfile()`
- `useSetLocale` → `set_my_locale({ p_locale })`, ardından `setLanguage` ve `reloadProfile`
- `useBill(sessionId)` → `get_session_bill` (query)

`useSubmitOrder` Görev 15'te yazılır.

`src/data/printer.ts`:
- `printer_status` 60 sn aralıkla okunur (`refetchInterval: 60_000`).
- Ek olarak `print_jobs` içinde `status = 'failed'` olan işler sayılır: `select('id', { count: 'exact', head: true })`.
- `derivePrinterProblem` saf fonksiyondur, sıralaması testteki önceliklerle aynıdır.

`src/data/settings.ts`: `settings` tek satırı okunur. `src/data/staff.ts`: `staff_names` RPC'si çağrılır ve `Map<id, display_name>` döner.

Run: `npm test -w apps/web` → Expected: PASS

- [ ] **Adım 3: Commit**
```bash
git add apps/web/src/lib apps/web/src/data
git commit -m "feat(web): veri katmanı (menü, masalar, siparişler, yazıcı durumu) ve Realtime tazeleme"
```

---

## Görev 13: Garson iskeleti — masalar, masa detayı, Hazır ve Profil sekmeleri

**Files:**
- Create: `apps/web/src/features/waiter/WaiterLayout.tsx`, `TablesPage.tsx`, `TableDetailPage.tsx`, `ReadyPage.tsx`, `ProfilePage.tsx`, `waiterLogic.ts`
- Create: `apps/web/src/features/common/itemLines.ts`, `ItemLines.tsx`, `Elapsed.tsx`, `ConnectionBanners.tsx`
- Modify: `src/app/router.tsx` (tek satırlık sayfa bileşenleri gerçekleriyle değişir), `src/i18n/*.json` (`waiter.*`)
- Test: `waiterLogic.test.ts`, `common/itemLines.test.ts`, `TablesPage.test.tsx`

**Interfaces:**
- Consumes (Görev 12): `useTableOverview`, `useOpenSession`, `useSessionOrders`, `useReadyOrders`, `useMarkServed`, `useReprint`, `useRetryJob`, `useSetOnDuty`, `useSetLocale`, `usePrinterStatus`, `useBroadcastInvalidation`, `useOnline`; ayrıca `useAuth`, `formatEuro`, `formatOrderNo`, `localName`
- Produces:
  - `itemLines(item: OrderItemView, locale: Locale): { variant?: string; without?: string; options: string[]; note?: string }`. TR'de "ÇIKAR: …", DE'de "OHNE: …" üretir; KDS de bunu kullanır (Görev 16).
  - `tableTone(row: TableRow): 'free' | 'open' | 'ready'`
  - `sortReady(orders: OrderView[], meId: string): OrderView[]` → önce garsonun kendi siparişleri, sonra `ready_at` sırasıyla
  - `printBadge(print: OrderView['print']): 'printed' | 'queued' | 'failed' | null`
  - `<ConnectionBanners topics={Topic[]} />`: realtime, internet ve yazıcı şeritleri (garson ve KDS birlikte kullanır)
  - `<ItemLines item locale />`: kalem ve alt satırları render eder; OHNE satırı `data-tone="danger"`

- [ ] **Adım 1: Testleri yaz (kırmızı)**

`common/itemLines.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { itemLines } from './itemLines';

const item = {
  variant_name_de: 'Kalb', variant_name_tr: 'Dana', note: 'Soße extra',
  removed_ingredients: [{ id: 'z', name_de: 'Zwiebeln', name_tr: 'Soğan' }],
  selected_options: [
    { group_id: 's', group_name_de: 'Soße', group_name_tr: 'Sos', ticket_format: 'label_values', group_sort: 1,
      option_id: 'a', name_de: 'Knoblauch', name_tr: 'Sarımsaklı', price_delta_cents: 0 },
    { group_id: 'b', group_name_de: 'Beilage', group_name_tr: 'Garnitür', ticket_format: 'values_only', group_sort: 0,
      option_id: 'r', name_de: 'Reis', name_tr: 'Pilav', price_delta_cents: 0 },
    { group_id: 'e', group_name_de: 'Extras', group_name_tr: 'Ekstralar', ticket_format: 'plus_each', group_sort: 2,
      option_id: 'w', name_de: 'Extra Weichkäse', name_tr: 'Ekstra beyaz peynir', price_delta_cents: 100 }],
} as never;

describe('itemLines', () => {
  it('Almanca', () => expect(itemLines(item, 'de')).toEqual({ variant: 'Kalb', without: 'OHNE: Zwiebeln',
    options: ['Reis', 'Soße: Knoblauch', '+ Extra Weichkäse'], note: 'Soße extra' }));
  it('Türkçe', () => expect(itemLines(item, 'tr')).toEqual({ variant: 'Dana', without: 'ÇIKAR: Soğan',
    options: ['Pilav', 'Sos: Sarımsaklı', '+ Ekstra beyaz peynir'], note: 'Soße extra' }));
});
```
`waiterLogic.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { printBadge, sortReady, tableTone } from './waiterLogic';

describe('waiterLogic', () => {
  it('masa tonu', () => {
    expect(tableTone({ session_id: null, orders_ready: 0 } as never)).toBe('free');
    expect(tableTone({ session_id: 's', orders_ready: 0 } as never)).toBe('open');
    expect(tableTone({ session_id: 's', orders_ready: 2 } as never)).toBe('ready');
  });
  it('hazır listesi: önce benimkiler, sonra hazır olma sırası', () => {
    const o = (id: string, waiter_id: string, ready_at: string) => ({ id, waiter_id, ready_at }) as never;
    expect(sortReady([o('a', 'x', '2026-09-15T18:01:00Z'), o('b', 'me', '2026-09-15T18:05:00Z'),
      o('c', 'x', '2026-09-15T18:00:00Z')], 'me').map((r: { id: string }) => r.id)).toEqual(['b', 'c', 'a']);
  });
  it('yazdırma rozeti', () => {
    expect(printBadge({ status: 'printed' } as never)).toBe('printed');
    expect(printBadge({ status: 'pending' } as never)).toBe('queued');
    expect(printBadge({ status: 'printing' } as never)).toBe('queued');
    expect(printBadge({ status: 'failed' } as never)).toBe('failed');
    expect(printBadge(null)).toBeNull();
  });
});
```
`TablesPage.test.tsx`:
- `useTableOverview` mock'lanır ve üç satır döner: boş, açık (1.950 kuruş, "Ahmet"), hazır (1 hazır).
- Beklentiler:
  1. Kartlar `data-tone` değerleri `free`/`open`/`ready` olarak render edilir.
  2. Açık kartta `19,50 €` ve "Ahmet" görünür.
  3. Hazır kartta "Hazır" rozeti görünür.
  4. Karta tıklayınca `/waiter/table/<id>` adresine gidilir (`MemoryRouter` + `Routes`).

Run: `npm test -w apps/web` → Expected: FAIL

- [ ] **Adım 2: Saf mantığı uygula**

`common/itemLines.ts`:
```ts
import type { Locale } from '@ramos/shared';
import type { OrderItemView } from '../../data/orders';

export function itemLines(item: Pick<OrderItemView, 'variant_name_de' | 'variant_name_tr' | 'note' |
  'removed_ingredients' | 'selected_options'>, locale: Locale) {
  const n = (de: string, tr: string | null) => (locale === 'tr' && tr ? tr : de);
  const groups = new Map<string, { label: string; format: string; values: string[]; sort: number }>();
  for (const o of item.selected_options) {
    const g = groups.get(o.group_id) ??
      { label: n(o.group_name_de, o.group_name_tr), format: o.ticket_format, values: [], sort: o.group_sort };
    g.values.push(n(o.name_de, o.name_tr));
    groups.set(o.group_id, g);
  }
  const options = [...groups.values()].sort((a, b) => a.sort - b.sort).flatMap((g) =>
    g.format === 'plus_each' ? g.values.map((v) => `+ ${v}`)
    : g.format === 'values_only' ? [g.values.join(', ')]
    : [`${g.label}: ${g.values.join(' + ')}`]);
  const removed = item.removed_ingredients.map((r) => n(r.name_de, r.name_tr));
  return {
    ...(item.variant_name_de ? { variant: n(item.variant_name_de, item.variant_name_tr) } : {}),
    ...(removed.length ? { without: `${locale === 'tr' ? 'ÇIKAR' : 'OHNE'}: ${removed.join(', ')}` } : {}),
    options,
    ...(item.note ? { note: item.note } : {}),
  };
}
```
`waiterLogic.ts`:
```ts
import type { OrderView } from '../../data/orders';
import type { TableRow } from '../../data/tables';

export const tableTone = (r: Pick<TableRow, 'session_id' | 'orders_ready'>): 'free' | 'open' | 'ready' =>
  !r.session_id ? 'free' : r.orders_ready > 0 ? 'ready' : 'open';
export const sortReady = (orders: OrderView[], meId: string): OrderView[] =>
  [...orders].sort((a, b) =>
    Number(b.waiter_id === meId) - Number(a.waiter_id === meId) || (a.ready_at ?? '').localeCompare(b.ready_at ?? ''));
export const printBadge = (p: OrderView['print']): 'printed' | 'queued' | 'failed' | null =>
  !p ? null : p.status === 'printed' ? 'printed' : p.status === 'failed' ? 'failed' : 'queued';
```

- [ ] **Adım 3: Ekranları uygula (`frontend-design` + `ui-styling`)**

- **`ConnectionBanners`:** Önceliğe göre tek şerit gösterir:
  1. İnternet yok (kırmızı, `waiter.banner.offline`)
  2. Realtime `offline` (turuncu, "Canlı bağlantı yeniden kuruluyor")
  3. `usePrinterStatus().problem` (`printer.<problem>` metni. Anahtarlar bu görevde tr/de'ye eklenir: `agent_offline`, `printer_unreachable`, `paper_end`, `cover_open`, `jobs_failed`; KDS de aynı anahtarları kullanır)
- **`WaiterLayout`:**
  - Üst bar: garsonun adı ve **mesai çipi** ("Mesai açık" lime / "Mesai kapalı" gri; dokununca `useSetOnDuty`).
  - Altında `ConnectionBanners topics={['orders','menu','printer-status','settings']}`.
  - İçerik alanı: `<Outlet />`.
  - Alt gezinme: **Masalar · Hazır (rozet = `useReadyOrders().length`) · Profil**, her öğe ≥ 56 px, `safe-area-inset-bottom` dikkate alınır.
  - Mesai kapalıyken üstte ince bir uyarı şeridi ve "Mesaiye başla" butonu görünür.
- **`TablesPage`:**
  - Filtre çipleri: Tümü / Açık / Hazır.
  - Telefonda 3 sütunlu kart ızgarası.
  - Kart içeriği: masa adı (büyük), tona göre kenar ve zemin, açık masada `formatEuro(total_cents)` + masayı açan kişi + `Elapsed` (açılıştan beri geçen dakika), hazır rozeti (altın, nabız animasyonu).
  - Yükleme sırasında iskelet kartlar gösterilir.
- **`TableDetailPage`:**
  - Oturum yoksa: boş durum + büyük **"Sipariş al"** butonu (`/waiter/table/:id/order`).
  - Oturum varsa siparişler tur tur listelenir. Başlık: `#047 · 19:42 · Ahmet · durum çipi · yazdırma rozeti`; `failed` rozetinde "Tekrar dene" (`useRetryJob`).
  - Kalemler `<ItemLines>` ile gösterilir; iptal edilenler üstü çizili + sebep.
  - Sipariş eylemleri:
    - `ready` ise birincil **"Teslim edildi"** butonu.
    - `in_kitchen` ise "⋯" menüsünde "Teslim edildi (içecek)".
    - Her siparişte "Tekrar bas".
  - Alt eylem çubuğu Görev 15'te eklenir.
- **`ReadyPage`:** `sortReady(useReadyOrders(), me.id)`. Kartta masa adı, `#no`, ilk 3 kalem ve **"Teslim edildi"** butonu. Liste boşsa: "Bekleyen hazır yemek yok".
- **`ProfilePage`:** Ad ve rol, dil seçimi (TR/DE segment → `useSetLocale`), mesai anahtarı, **Çıkış**. Bildirim bölümü Görev 25'te eklenir.

Tüm metinler `t()` ile yazılır; tr/de eşitlik testi yeşil kalmalı.

Run: `npm test -w apps/web` → Expected: PASS

- [ ] **Adım 4: Ekran görüntüleri (telefon 390×844)**

Playwright ile şu durumların görüntüsünü al: `test-waiter` girişi → masalar (bir açık, bir hazır masa; Plan 1 fixture'larıyla API'den hazırlanır) → masa detayı → Hazır sekmesi → Profil. Dosya adları: `docs/screenshots/m3-tables-390.png`, `m3-table-detail-390.png`, `m3-ready-390.png`, `m3-profile-390.png`.

Görüntüleri incele: başparmak erişimi, kontrast, 48 px hedefler, TR metin taşmaları.

- [ ] **Adım 5: Commit**
```bash
git add apps/web/src/features/waiter apps/web/src/features/common apps/web/src/app/router.tsx apps/web/src/i18n docs/screenshots
git commit -m "feat(waiter): masalar, masa detayı, hazır listesi, profil, mesai çipi ve bağlantı şeritleri"
```

---

## Görev 14: Sipariş girişi — menü, arama, ürün paneli, sepet deposu

**Files:**
- Create: `apps/web/src/features/waiter/OrderPage.tsx`, `ProductSheet.tsx`, `cartStore.ts`, `menuSearch.ts`
- Test: `menuSearch.test.ts`, `cartStore.test.ts`, `ProductSheet.test.tsx`

**Interfaces:**
- Consumes: `useMenu()`, `useSettings()` (hızlı notlar); `defaultSelection`, `toggleOption`, `validateSelection`, `unitPriceCents`, `needsSheet`, `addLine`, `lineKey` (`@ramos/shared`)
- Produces:
  - `normalize(s: string): string` → küçük harf, aksansız (ö→o, ü→u, ş→s, ı→i, ğ→g, ç→c, ä→a, ß→ss)
  - `searchProducts(products, query): MenuProduct[]`
    - Kod ön eki tam eşleşmesi önce gelir: "05", "71a", "m1".
    - Sonra ad içinde aksansız arama: "doner" → "Drehspieß…" gelmez, "Döner…" gelir; "sis" → "Kuzu Şiş".
  - `useCart` (Zustand persist, anahtar `ramos-cart-v1`):
    - Durum: `{ carts: Record<tableId, CartLine[]>, notes: Record<tableId, string>, pendingOrderId: Record<tableId, string | undefined> }`
    - Eylemler: `add(tableId, line)`, `update(tableId, key, line)`, `remove(tableId, key)`, `duplicate(tableId, key)`, `setQty(tableId, key, q)`, `setNote(tableId, note)`, `ensurePendingId(tableId): string`, `clear(tableId)`
  - `<ProductSheet product open onClose onSubmit(line) initial? />`: yeni ekleme ve düzenleme modu

- [ ] **Adım 1: Testleri yaz (kırmızı)**

`menuSearch.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { normalize, searchProducts } from './menuSearch';

const p = (code: string | null, name: string) => ({ id: name, code, name }) as never;
const menu = [p('05', 'Drehspieß Sandwich'), p('59', 'Kuzu Şiş'), p('71a', 'Köfte Sandwich'), p('M1', 'Drehspieß Sandwich Menü'),
  p(null, 'Cola 0,33 l'), p('20', 'Lahmacun')];

describe('menü arama', () => {
  it('normalize aksanları ve ß’yi açar', () => expect(normalize('Drehspieß ŞİŞ Kräuter')).toBe('drehspiess sis krauter'));
  it('kod önce: "05" ve "71a" ve "m1"', () => {
    expect(searchProducts(menu, '05').map((x: { code: string }) => x.code)).toEqual(['05']);
    expect(searchProducts(menu, '71A')[0]).toMatchObject({ code: '71a' });
    expect(searchProducts(menu, 'm1')[0]).toMatchObject({ code: 'M1' });
  });
  it('ad araması aksansız', () => {
    expect(searchProducts(menu, 'sis').map((x: { name: string }) => x.name)).toEqual(['Kuzu Şiş']);
    expect(searchProducts(menu, 'kofte').map((x: { name: string }) => x.name)).toEqual(['Köfte Sandwich']);
  });
  it('boş sorgu tüm listeyi döndürür', () => expect(searchProducts(menu, '  ')).toHaveLength(6));
});
```
`cartStore.test.ts`: `useCart.getState()` üzerinden:
1. İki masaya ayrı ekleme → sepetler izole kalır.
2. Aynı kombinasyonla ekleme → adet artar.
3. `duplicate` → aynı anahtar olduğu için adet +1.
4. `ensurePendingId` iki çağrıda aynı UUID'yi döndürür; `clear` sonrası yeni UUID üretilir.
5. `update` ile seçenek değişince satır anahtarı yenilenir; varsa aynı anahtarlı satırla birleşir.
6. `persist` adı `ramos-cart-v1`.

`ProductSheet.test.tsx`: Görev 9'daki `teller` benzeri ürün (Beilage + Soße + Extras + Zwiebeln) ve Pizza Mix (min = max = 5) ile:
1. Açılışta **Hähnchen** ve **Pommes** seçilidir; fiyat `12,50 €`.
2. **Kalb** seçilince fiyat `13,50 €`; **Extra Weichkäse** eklenince `14,50 €`.
3. Soße seçilmeden "Sepete ekle" pasiftir ve Soße grubu `aria-invalid="true"` taşır.
4. **Zwiebeln** çipine dokununca `aria-pressed="false"` olur ve üstü çizili "OHNE" görünür.
5. **ohne Soße** seçilince Knoblauch seçimi kalkar.
6. Pizza Mix'te 4 malzemeyle buton pasif, 5 malzemeyle aktif; 6. malzemeye dokunmak seçimi değiştirmez.
7. Adet 2 yapılıp "Sepete ekle"ye basınca `onSubmit` doğru `Selection`, `quantity` ve `note` ile çağrılır.

Run: FAIL

- [ ] **Adım 2: Uygula**

`menuSearch.ts`:
```ts
import type { MenuProduct } from '@ramos/shared';

const MAP: Record<string, string> = { ß: 'ss', ı: 'i', İ: 'i' };
export const normalize = (s: string): string =>
  s.replace(/[ßıİ]/g, (c) => MAP[c] ?? c).normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();

export function searchProducts<T extends Pick<MenuProduct, 'code' | 'name'>>(products: T[], query: string): T[] {
  const q = normalize(query);
  if (!q) return products;
  const byCode = products.filter((p) => p.code && normalize(p.code).startsWith(q));
  const byName = products.filter((p) => !byCode.includes(p) && normalize(p.name).includes(q));
  const exact = byCode.filter((p) => normalize(p.code ?? '') === q);
  return [...exact, ...byCode.filter((p) => !exact.includes(p)), ...byName];
}
```
`cartStore.ts`:
- Zustand `create(persist(...))`, `name: 'ramos-cart-v1'`, `version: 1`.
- Satır işlemleri `addLine`/`lineKey` ile yapılır.
- `ensurePendingId`: yoksa `crypto.randomUUID()` üretir, kaydeder ve döndürür. **Aynı sipariş denemesi boyunca sabit kalır** (idempotency).
- `clear`: sepeti, notu ve `pendingOrderId`'yi siler.
- Sepette değişiklik yapan her işlem (`add`, `update`, `remove`, `duplicate`, `setQty`) `pendingOrderId`'yi de temizler. Böylece değişmiş bir sepet eski kimlikle gönderilmez.

`ProductSheet.tsx`:
- Alttan açılan panel (`Sheet`), en fazla ekranın %92'si yüksekliğinde. Üstte ürün kodu + adı + açıklama + alerjen kodları (küçük, gri).
- Bölümler sırasıyla:
  1. **Varyant:** tam genişlikte segment düğmeleri, fiyatlı.
  2. **Seçim grupları:** `sort` sırasıyla. Başlıkta `localName(group)` ve kural ipucu ("1 seçin", "en fazla 3", "tam 5 seçin — 3/5"). Seçenekler çip olarak dizilir, `toggleOption` ile değişir, fiyat farkı "+1,00 €" şeklinde yazılır.
  3. **Malzemeler:** Başlık "Malzemeler — çıkarmak için dokun". Çiplerin hepsi başta seçilidir; dokunulan çip kırmızı, üstü çizili ve "OHNE"/"ÇIKAR" etiketli olur.
  4. **Not:** metin alanı (en fazla 200 karakter) ve `settings.quick_notes` çipleri (dokununca nota eklenir).
  5. **Alt çubuk (sabit):** Adet `Stepper` (1–99) ve **"Sepete ekle · 19,00 €"** butonu.
- Hata gösterimi: `validateSelection` hata döndürürse buton pasif kalır; ilk hatalı gruba kaydırılır ve grup `aria-invalid` olur.
- Düzenleme modu: `initial` verilince seçimler önceden doldurulur, buton "Güncelle" olur.

`OrderPage.tsx`:
- **Üst:** geri butonu + masa adı + sepet butonu. Sepet butonunda adet rozeti ve toplam (`cartTotalCents`) gösterilir.
- **Arama ve kategoriler:** Yapışkan arama kutusu (`inputMode="search"`, 16 px yazı; iOS'ta yakınlaştırma yapmasın diye). Altında yatay kaydırmalı kategori çipleri: dokununca ilgili bölüme kayar; görünür bölüm vurgulanır (IntersectionObserver).
- **Ürün satırı:** kod (tabular, soluk) · ad · fiyat ("ab 7,50 €" varyantlı ürünlerde). Tükenen ürün soluk görünür, "Tükendi" yazar ve seçilemez.
- **Ekleme davranışı:**
  - `needsSheet(p)` false ise satırda **+** vardır; dokununca doğrudan eklenir, kısa haptic/animasyon ve toast gösterilir.
  - Aksi hâlde `ProductSheet` açılır.

Run: `npm test -w apps/web` → Expected: PASS

- [ ] **Adım 2b: Ürün görselleri — şimdilik boş yer tutucu**

Her ürünün görsel alanı var; görseller sonradan admin panelinden eklenecek (Plan 4 · Görev 22). Bu adımda yalnızca gösterim ve yer tutucu yapılır. Menü eşleyicisi (`menuMapper`) `image_path: row.image_path ?? null` alanını taşır.

Files: `apps/web/src/lib/images.ts` (+ `images.test.ts`), `apps/web/src/ui/ProductImage.tsx` (+ `ProductImage.test.tsx`)

`src/lib/images.ts`:
```ts
export type ImageSize = 'thumb' | 'full';
export const PRODUCT_BUCKET = 'product-images';

export function productImageUrl(path: string | null | undefined, size: ImageSize = 'full'): string | null {
  if (!path) return null;
  const p = size === 'thumb' ? path.replace(/\.webp$/, '-thumb.webp') : path;
  return `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/${PRODUCT_BUCKET}/${p}`;
}
```
`src/lib/images.test.ts`:
```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { productImageUrl } from './images';

beforeEach(() => vi.stubEnv('VITE_SUPABASE_URL', 'https://x.supabase.co'));
describe('productImageUrl', () => {
  it('boş yol → null', () => expect(productImageUrl(null)).toBeNull());
  it('tam ve küçük sürüm', () => {
    expect(productImageUrl('products/p1-1700.webp')).toBe('https://x.supabase.co/storage/v1/object/public/product-images/products/p1-1700.webp');
    expect(productImageUrl('products/p1-1700.webp', 'thumb')).toBe('https://x.supabase.co/storage/v1/object/public/product-images/products/p1-1700-thumb.webp');
  });
});
```
`src/ui/ProductImage.tsx`:
- **Props:** `{ path: string | null; size: 'thumb' | 'full'; code: string | null; alt: string; className?: string }`.
- **Görsel varsa:** sabit en-boy oranlı kutu (`thumb` = 1:1, `full` = 4:3) içinde `<img src={productImageUrl(path, size)} alt={alt} loading="lazy" decoding="async" width height className="object-cover">`. `onError` → yer tutucuya düşer.
- **Yer tutucu:** `data-testid="product-image-placeholder"`, `aria-hidden`. Görünümü:
  - `--surface-2` zemin, ince `--border` çerçeve
  - ortada küçük alev (`public/brand/flame.png` varsa o, yoksa lucide `Flame`, `--gold` %70 opaklık)
  - altta ürün numarası (tabular, `--muted`)
  - Sade ve şık olmalı; görsel gelince düzen kaymaz.
- **Kullanım yerleri:**
  - `OrderPage` ürün satırında solda 56×56 `thumb`
  - `ProductSheet` üstünde `full` (en fazla 240 px yükseklik)
  - KDS'de kullanılmaz

`src/ui/ProductImage.test.tsx`:
1. `path = null` → yer tutucu ürün numarasını gösterir, `<img>` yok.
2. `path = 'products/p1-1700.webp'`, `size = 'thumb'` → `img` src'si `-thumb.webp` ile biter, `loading = "lazy"`.
3. `img`'de `fireEvent.error` → yer tutucu görünür.

Run: `npm test -w apps/web -- images ProductImage` → PASS

- [ ] **Adım 3: Ekran görüntüleri ve commit**

Görüntüler: `docs/screenshots/m3-order-menu-390.png`, `m3-product-sheet-390.png` (Kalb + OHNE + sos seçili), `m3-pizza-mix-390.png`.
```bash
git add apps/web/src/features/waiter docs/screenshots
git commit -m "feat(waiter): sipariş girişi — kod/ad araması, ürün paneli (varyant, seçim kuralları, OHNE), kalıcı sepet"
```

---

## Görev 15: Sepet, mutfağa gönderme ve masa işlemleri (+ garson E2E)

**Files:**
- Create: `apps/web/src/features/waiter/CartDrawer.tsx`, `SendConfirm.tsx`, `CancelItemSheet.tsx`, `BillSheet.tsx`, `MoveTableSheet.tsx`, `submitOrder.ts`
- Modify: `src/data/orders.ts` (`useSubmitOrder`), `TableDetailPage.tsx` (alt eylem çubuğu + kalem iptali)
- Test: `submitOrder.test.ts`, `apps/web/e2e/waiter-flow.spec.ts`

**Interfaces:**
- Consumes: `useCart`, `toSubmitItems`, `cartTotalCents`, `callRpc`, `RpcError`, `useCancelItem`, `useBill`, `useMoveSession`, `useCloseSession`, `useTableOverview`, `useSettings`
- Produces:
  - `submitWithRetry(send: (id: string) => Promise<SubmitResult>, orderId: string, opts?: { attempts?: number; delays?: number[] }): Promise<SubmitResult>`
    - Yalnızca `RpcError.key === 'network'` olduğunda aynı `orderId` ile tekrar dener (varsayılan 3 deneme, 1/2/4 sn bekleme).
    - Diğer hataları hemen fırlatır.
  - `SubmitResult` = `{ order_id: string; order_no: number; round_no: number; session_id: string; total_cents: number; duplicate: boolean }`
  - `useSubmitOrder(tableId)` → `{ send(): Promise<SubmitResult>, isPending }`
    - Şunları yapar: `ensurePendingId` → `submitWithRetry(callRpc('submit_order', …))` → başarıda `clear(tableId)`, `orders` ve `tables` sorgularını geçersiz kıl.

- [ ] **Adım 1: Yeniden deneme testini yaz (kırmızı)**

`submitOrder.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest';
import { RpcError } from '../../lib/rpc';
import { submitWithRetry } from './submitOrder';

const ok = { order_id: 'o', order_no: 47, round_no: 1, session_id: 's', total_cents: 950, duplicate: false };

describe('submitWithRetry', () => {
  it('ağ hatasında aynı id ile tekrar dener', async () => {
    const send = vi.fn().mockRejectedValueOnce(new RpcError('network')).mockResolvedValueOnce(ok);
    await expect(submitWithRetry(send, 'id-1', { delays: [0, 0, 0] })).resolves.toEqual(ok);
    expect(send).toHaveBeenNthCalledWith(1, 'id-1');
    expect(send).toHaveBeenNthCalledWith(2, 'id-1');
  });
  it('iş kuralı hatasında tekrar denemez', async () => {
    const send = vi.fn().mockRejectedValue(new RpcError('product_sold_out', 'p1'));
    await expect(submitWithRetry(send, 'id-2', { delays: [0, 0, 0] })).rejects.toMatchObject({ key: 'product_sold_out' });
    expect(send).toHaveBeenCalledTimes(1);
  });
  it('3 ağ hatasından sonra vazgeçer', async () => {
    const send = vi.fn().mockRejectedValue(new RpcError('network'));
    await expect(submitWithRetry(send, 'id-3', { delays: [0, 0, 0] })).rejects.toMatchObject({ key: 'network' });
    expect(send).toHaveBeenCalledTimes(3);
  });
});
```

- [ ] **Adım 2: Uygula**

`submitOrder.ts`:
```ts
import { RpcError } from '../../lib/rpc';

export interface SubmitResult {
  order_id: string; order_no: number; round_no: number; session_id: string; total_cents: number; duplicate: boolean;
}
export async function submitWithRetry(
  send: (id: string) => Promise<SubmitResult>, orderId: string,
  { attempts = 3, delays = [1000, 2000, 4000] }: { attempts?: number; delays?: number[] } = {},
): Promise<SubmitResult> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try { return await send(orderId); } catch (e) {
      last = e;
      if (!(e instanceof RpcError) || e.key !== 'network') throw e;
      await new Promise((r) => setTimeout(r, delays[i] ?? 4000));
    }
  }
  throw last;
}
```
`useSubmitOrder(tableId)` (`src/data/orders.ts`):
```ts
export function useSubmitOrder(tableId: string) {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: async () => {
      const cart = useCart.getState();
      const id = cart.ensurePendingId(tableId);
      const items = toSubmitItems(cart.carts[tableId] ?? []);
      const note = cart.notes[tableId]?.trim() || null;
      return submitWithRetry((orderId) => callRpc<SubmitResult>('submit_order',
        { p_order_id: orderId, p_table_id: tableId, p_items: items, p_note: note }), id);
    },
    onSuccess: () => { useCart.getState().clear(tableId); },
    onSettled: () => { void qc.invalidateQueries({ queryKey: ['orders'] }); void qc.invalidateQueries({ queryKey: ['tables'] }); },
  });
  return { send: () => m.mutateAsync(), isPending: m.isPending };
}
```
`CartDrawer.tsx`:
- Satırlar: `2x 05 Drehspieß Sandwich · 19,00 €`; altında `lineSummary` (varyant · OHNE … · seçimler · not).
- Satır eylemleri: adet `Stepper`, **Düzenle** (`ProductSheet` `initial` ile), **Çoğalt**, **Sil**.
- Siparişe genel not alanı ve toplam.
- **"Mutfağa gönder"** butonu: `useOnline()` false iken pasiftir ve "İnternet yok — sepet saklandı" yazar.

`SendConfirm.tsx`:
- Alttan açılan onay paneli: masa, kalem sayısı, toplam ve kısa liste; **"Onayla ve gönder"** butonu.
- Başarıda:
  - Toast: "Mutfağa gönderildi · #047" (`duplicate: true` ise "Zaten gönderilmişti · #047").
  - Masa detayına yönlendirilir.
- Hatada:
  - `product_sold_out` → ilgili satır kırmızı işaretlenir (detay = ürün id), menü tazelenir.
  - `variant_required`, `option_*` → ilgili satırda "Düzenle" önerilir.
  - `network` → sepet saklanır, **"Tekrar gönder"** butonu **aynı** id ile dener; bu, ağ yeniden denemesi için açıkça gereklidir.
  - Diğer hatalar → `t('errors.<key>')`.

`CancelItemSheet.tsx`:
- `settings.cancel_reasons` çiplerini listeler; "Sonstiges / Diğer" seçilince serbest metin zorunludur.
- `useCancelItem` ile iptal eder; başarıda toast "İptal edildi — mutfağa STORNO basılıyor".

`BillSheet.tsx`:
- `useBill(sessionId)` satırları: `2x 05 Drehspieß Sandwich (Kalb) +Extra Weichkäse — 9,50 € — 19,00 €`.
- Büyük punto **Toplam**; alt not: "Ödeme kasada alınır" (fiş basılmaz).

`MoveTableSheet.tsx`:
- `useTableOverview()` içinden `session_id === null` olan masaları ızgarada gösterir.
- Seçim + onay → `useMoveSession`; başarıda yeni masanın detayına gidilir.

`TableDetailPage` alt çubuğu: **+ Sipariş ekle** · **Hesap** · **Taşı** · **Kapat**.
- **Kapat:** Onay istenir. `open_orders_in_kitchen` hatasında açıklama gösterilir: "Mutfakta hazırlanan sipariş var: önce hazır/teslim edilmeli ya da iptal edilmeli".
- Başarıda masalar sayfasına dönülür ve toast "Masa kapatıldı" gösterilir.

- [ ] **Adım 3: Garson uçtan uca testi (telefon)**

`apps/web/e2e/waiter-flow.spec.ts` (Plan 1 fixture'ları: `Test-Tisch`, `T05 Test Drehspieß Sandwich`, `Test Cola`):
1. `test-waiter` ile giriş → **Test-Tisch** → "Sipariş al".
2. Arama "T05" → panel: **Kalb** seç, **Zwiebeln**'e dokun, **Knoblauch + Kräuter**, **Extra Weichkäse**, adet 2 → "Sepete ekle · 19,00 €".
3. "Test Cola" satırında **+** → sepet toplamı `21,50 €`.
4. Sepet → "Mutfağa gönder" → onay → toast `#…`. Masa detayında 1. tur listelenir, yazdırma rozeti `⏳` görünür.
5. **Hesap** → toplam `21,50 €`.
6. **Kapat** → hata açıklaması görünür (mutfakta). Siparişin "⋯" menüsünden "Teslim edildi (içecek)" → **Kapat** → masalar sayfası, Test-Tisch **boş**.
7. Ek senaryolar:
   - Kalem iptali: sebep "Müşteri vazgeçti" → üstü çizili kalem.
   - Masa taşıma: Test-Tisch → Test-Tisch-2.
   - Çevrimdışı: `context.setOffline(true)` → gönder butonu pasif, şerit görünür.
8. Her önemli adımda `docs/screenshots/m3-flow-<adım>-390.png`.
9. `afterAll`: test masası verisini temizle (Plan 1 `cleanupFixtureOrders` SQL'i).

Run: `npm run e2e -w apps/web -- waiter-flow --project=phone` → Expected: PASS

- [ ] **Adım 4: M3 kapanışı**

Run: `npm run check` → yeşil.
```bash
git add apps/web docs/screenshots
git commit -m "feat(waiter): sepet ve idempotent gönderim, kalem iptali, hesap özeti, masa taşıma/kapatma + garson E2E"
```
Kullanıcıya **M2–M3 raporu** ver. Ekran görüntüsü yollarını ekle.

