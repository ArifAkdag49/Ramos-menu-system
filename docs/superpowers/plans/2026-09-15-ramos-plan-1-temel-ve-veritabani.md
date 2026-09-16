# Ramo's Sipariş Sistemi — Plan 1: Temel ve Veritabanı (M0–M1, Görev 1–9)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Monorepo iskeletini, Supabase projesini ve sipariş sisteminin tüm veritabanı katmanını (şema, RLS, RPC'ler, broadcast trigger'ları, seed) test edilmiş olarak kurmak.

**Architecture:**
- npm workspaces monorepo.
- İş kuralları Postgres'te: `security definer` RPC'ler + RLS.
- İstemciler yalnızca okur ve RPC çağırır.
- Değişiklikler Realtime "Broadcast from Database" ile private kanallara "tazele" sinyali olarak yayılır.

**Tech Stack:** Node 24 · TypeScript strict · Vitest · Supabase (Postgres 17, RLS, plpgsql, Realtime, pg_net, Vault) · @supabase/supabase-js v2 · Supabase Management API.

**Spec:** `docs/superpowers/specs/2026-09-15-ramos-siparis-sistemi-design.md` (özellikle §3, §5, §6, §7, §11.1, §12) · Menü: `docs/menu/ramos-menu-data.md`

## Global Constraints
**Faz B kuralı (her görevde geçerli):**
- Bu plandaki "kullanıcıya sor", "onay al" ve "kullanıcıdan iste" ifadeleri Faz A'da karşılandı (BUILD-PROMPT §3). **Soru sormadan devam et.**
- Fiziksel doğrulamaları (fotoğraf, telefon) `docs/BUILD-PROGRESS.md` → "Kullanıcıya kalan kontroller" listesine yaz.
- Dış bir sebeple yapılamayan adımı ⏸ ertele.
- BUILD-PROMPT §10 (tasarım) ve §11 (ürün görselleri) de geçerlidir.

`docs/BUILD-PROMPT.md` §5'teki kısıtların **hepsi** bu plandaki her görev için geçerlidir. Bu planda özellikle önemli olanlar:
- **Para ve zaman:** Para kuruş (int). Saat dilimi `Europe/Berlin`, iş günü başlangıcı `05:00`.
- **Güvenlik:**
  - `anon` rolünün hiçbir tabloya ve fonksiyona erişimi olmaz.
  - Tüm RPC'ler `security definer` + `set search_path = ''` ile yazılır.
  - Sipariş, oturum ve fiş tablolarına istemci doğrudan yazamaz (yalnızca RPC ile).
- **Kayıtlar:** Sipariş, kalem ve iptal kayıtları uygulama tarafından silinmez. Test verisi, test betiğinin kendi temizliğiyle silinir.
- **Hata biçimi:** `raise exception using message = '<anahtar>', errcode = 'P0001'`.
- **Migration yolu:** Migration'lar yalnızca `npm run db:apply` (Management API) ile uygulanır. MCP'yi proje oluşturma, advisors ve tip üretimi için kullan. **İkisini karıştırma**; aynı migration iki kez uygulanır.

## Dosya haritası (bu plan)
```
package.json                      # workspaces + kök script'ler
tsconfig.base.json · eslint.config.js · .prettierrc.json · .editorconfig
.env.example                      # commit edilir, değersiz
.env                              # commit EDİLMEZ
scripts/db.mjs                    # Management API: apply / sql
packages/shared/
  package.json · tsconfig.json · vitest.config.ts
  src/index.ts
  src/money.ts (+ money.test.ts)               # € ve #047 biçimleri
  src/domain.ts                                # menü/sipariş tipleri (Görev 9)
  src/pricing.ts (+ pricing.test.ts)           # fiyat + seçim kuralları (Görev 9)
  src/cart.ts (+ cart.test.ts)                 # sepet satırı anahtarı / birleştirme (Görev 9)
  src/errors.ts                                # RPC hata anahtarları listesi (Görev 9)
  src/database.types.ts                        # üretilen Supabase tipleri (Görev 8)
supabase/
  migrations/0001_schema.sql
  migrations/0002_helpers_rls.sql
  migrations/0003_submit_order.sql          # Görev 5
  migrations/0004_order_lifecycle.sql       # Görev 6
  migrations/0005_print_queue_realtime.sql  # Görev 7
  seed/menu-source.ts             # ramos-menu-data.md'nin makine okunur hali (TS sabitleri)
  seed/build-seed.ts              # menu-source.ts → seed.sql üretir (idempotent upsert)
  seed/seed.sql                   # üretilen; commit edilir
  vitest.config.ts
  tests/helpers/sql.ts            # Management API ile SQL
  tests/helpers/users.ts          # test kullanıcıları + rol başına supabase istemcisi
  tests/helpers/fixtures.ts       # test masası, ürün id'leri, temizlik
  tests/schema · rls · orders · lifecycle · print · realtime · seed (.test.ts)
```

---

## Görev 1: Monorepo iskeleti ve araç zinciri

**Files:**
- Create: `package.json`, `tsconfig.base.json`, `eslint.config.js`, `.prettierrc.json`, `.editorconfig`
- Create: `packages/shared/package.json`, `packages/shared/tsconfig.json`, `packages/shared/vitest.config.ts`, `packages/shared/src/index.ts`, `packages/shared/src/money.ts`
- Test: `packages/shared/src/money.test.ts`

**Interfaces:**
- Produces:
  - `@ramos/shared` paketi. Kaynak (TS) doğrudan export edilir; web ve ajan tarafında Vite/esbuild derler.
  - `formatEuro(cents: number): string`, `formatOrderNo(n: number): string`.
  - Kök script'ler: `lint`, `typecheck`, `test`, `build`, `check`, `db:apply`, `db:sql`, `db:test`.

- [x] **Adım 1: Kök dosyaları oluştur**

`package.json`:
```json
{
  "name": "ramos-siparis",
  "private": true,
  "type": "module",
  "workspaces": ["packages/*", "apps/*"],
  "engines": { "node": ">=22" },
  "scripts": {
    "lint": "eslint .",
    "typecheck": "npm run typecheck --workspaces --if-present",
    "test": "npm run test --workspaces --if-present",
    "build": "npm run build --workspaces --if-present",
    "check": "npm run lint && npm run typecheck && npm run test && npm run build",
    "db:apply": "node --env-file=.env scripts/db.mjs apply",
    "db:sql": "node --env-file=.env scripts/db.mjs sql",
    "db:test": "vitest run --config supabase/vitest.config.ts"
  }
}
```

`tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "resolveJsonModule": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  }
}
```

`eslint.config.js`:
```js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/*.d.ts', 'supabase/functions/**', 'docs/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
);
```
`supabase/functions/**` Deno kodudur, Node lint'ine girmez; mantığı Node'da test edilen modüllere taşınır.

`.prettierrc.json`: `{ "singleQuote": true, "printWidth": 100, "trailingComma": "all" }`
`.editorconfig`: `root = true` / `[*]` / `charset = utf-8` / `end_of_line = lf` / `indent_style = space` / `indent_size = 2` / `insert_final_newline = true`

- [x] **Adım 2: Geliştirme bağımlılıklarını kur**

Run: `npm i -D typescript vitest eslint @eslint/js typescript-eslint eslint-config-prettier prettier @types/node vite @supabase/supabase-js`
Expected: `package-lock.json` oluşur, hata yok.

- [x] **Adım 3: `@ramos/shared` paketini oluştur**

`packages/shared/package.json`:
```json
{
  "name": "@ramos/shared",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": { "typecheck": "tsc --noEmit", "test": "vitest run" }
}
```
`packages/shared/tsconfig.json`: `{ "extends": "../../tsconfig.base.json", "compilerOptions": { "noEmit": true }, "include": ["src"] }`
`packages/shared/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { environment: 'node', include: ['src/**/*.test.ts'] } });
```

- [x] **Adım 4: İlk testi yaz (kırmızı)**

`packages/shared/src/money.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { formatEuro, formatOrderNo } from './money';

describe('money', () => {
  it('kuruşu Alman euro biçimine çevirir (Intl, € öncesi NBSP)', () => {
    expect(formatEuro(850)).toBe('8,50 €');
    expect(formatEuro(1150)).toBe('11,50 €');
    expect(formatEuro(0)).toBe('0,00 €');
  });
  it('sipariş numarasını 3 haneye tamamlar', () => {
    expect(formatOrderNo(7)).toBe('#007');
    expect(formatOrderNo(47)).toBe('#047');
    expect(formatOrderNo(1234)).toBe('#1234');
  });
});
```
Run: `npm test -w @ramos/shared`
Expected: FAIL — `Cannot find module './money'`

- [x] **Adım 5: Uygula**

`packages/shared/src/money.ts`:
```ts
const eur = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });

export const formatEuro = (cents: number): string => eur.format(cents / 100);

export const formatOrderNo = (n: number): string => `#${String(n).padStart(3, '0')}`;
```
`packages/shared/src/index.ts`: `export * from './money';`

Run: `npm test -w @ramos/shared` → Expected: PASS (2 test)

- [x] **Adım 6: Tüm kontrol zincirini çalıştır**

Run: `npm run check`
Expected: lint, typecheck, test ve build hatasız (build henüz boş, `--if-present` sayesinde atlanır).

- [x] **Adım 7: Commit**
```bash
git add package.json package-lock.json tsconfig.base.json eslint.config.js .prettierrc.json .editorconfig packages/shared
git commit -m "chore: monorepo iskeleti ve @ramos/shared (para biçimleri)"
```

---

## Görev 2: Supabase projesi, ortam dosyaları ve DB betiği

**Files:**
- Create: `.env.example`, `.env` (commit edilmez), `scripts/db.mjs`
- Create: `supabase/vitest.config.ts`, `supabase/tests/helpers/sql.ts`

**Interfaces:**
- Produces:
  - `.env` anahtarları: `SUPABASE_PROJECT_REF`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ACCESS_TOKEN`, `STAFF_EMAIL_DOMAIN`
  - `scripts/db.mjs` → `runSql(query: string): Promise<unknown[]>`, CLI komutları `apply` ve `sql <sorgu | --file yol>`
  - `supabase/tests/helpers/sql.ts` → `sql<T = Record<string, unknown>>(query: string): Promise<T[]>`

- [x] **Adım 1: Faz A girdilerini kontrol et (durma)**

> **Faz B'de:** Proje oluşturma onayı ve PAT Faz A'da alındı (BUILD-PROMPT §3). `.env` içinde `SUPABASE_ACCESS_TOKEN` dolu olmalı; doluysa aşağıdaki soru metnini **atla**. Bu metin yalnızca Faz A atlanmışsa geçerlidir.

Kullanıcıya sor: "Supabase'de **ramos-siparis** adında yeni bir ücretsiz proje (Cicekci org'u, Frankfurt) oluşturacağım, maliyeti 0 $. Onaylıyor musun?"

Ayrıca bir **Personal Access Token** iste (supabase.com → Account → Access Tokens). Migration, test ve fonksiyon yayını script'le yapılacak. Token'ı yalnızca `.env` dosyasına yaz.

- [x] **Adım 2: Projeyi oluştur**

Supabase MCP varsa sırasıyla: `list_organizations` (Cicekci = `mdsctajrlrckvwhkcfnd` doğrula) → `get_cost` (type `project`) → `confirm_cost` → `create_project` (`name: "ramos-siparis"`, `region: "eu-central-1"`, `organization_id: "mdsctajrlrckvwhkcfnd"`). Ardından `get_project` ile `ACTIVE_HEALTHY` olana kadar bekle.

**Tercih edilen yol Management API'dir:** `db_pass`'ı biz üretip `.env`'e yazarız, M8'deki gecelik yedek bu parolayla kurulur. Yukarıdaki MCP yolu yalnızca API çağrısı başarısız olursa kullanılır. Management API ile:
```bash
curl -s -X POST https://api.supabase.com/v1/projects \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"ramos-siparis","organization_id":"mdsctajrlrckvwhkcfnd","region":"eu-central-1","db_pass":"<güçlü rastgele>"}'
```
`db_pass` değerini şu komutla üret: `node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"`. Değeri `.env` içinde `SUPABASE_DB_PASSWORD` olarak sakla. M8'deki yedek için gerekir. MCP ile oluşturulduysa parola M8'de panelden sıfırlanır.

- [x] **Adım 3: Anahtarları al ve `.env` dosyasını doldur**
```bash
curl -s "https://api.supabase.com/v1/projects/<ref>/api-keys?reveal=true" -H "Authorization: Bearer <PAT>"
```
Yanıttan `anon` (ya da `publishable`) ve `service_role` (ya da `secret`) anahtarlarını al.

`.env` (kök, **commit etme**):
```
SUPABASE_PROJECT_REF=<ref>
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_ANON_KEY=<anon/publishable>
SUPABASE_SERVICE_ROLE_KEY=<service_role/secret>
SUPABASE_ACCESS_TOKEN=<PAT>
SUPABASE_DB_PASSWORD=<varsa>
STAFF_EMAIL_DOMAIN=staff.arxdigitalsevice.com
```
`.env.example` aynı anahtarları değersiz içerir ve commit edilir.

Run: `git check-ignore .env` → Expected: `.env` (dosya yok sayılıyor).

- [x] **Adım 4: `scripts/db.mjs` dosyasını yaz**
```js
// Supabase Management API ile SQL çalıştırır ve migration uygular.
// Kullanım: node --env-file=.env scripts/db.mjs apply
//           node --env-file=.env scripts/db.mjs sql "select 1"
//           node --env-file=.env scripts/db.mjs sql --file supabase/seed/seed.sql
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const ref = process.env.SUPABASE_PROJECT_REF;
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!ref || !token) {
  console.error('SUPABASE_PROJECT_REF ve SUPABASE_ACCESS_TOKEN .env içinde tanımlı olmalı');
  process.exit(1);
}

export async function runSql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`SQL hatası (${res.status}): ${text}`);
  return text ? JSON.parse(text) : [];
}

async function apply() {
  await runSql(`
    create schema if not exists internal;
    revoke all on schema internal from public, anon, authenticated;
    create table if not exists internal.migrations (
      name text primary key,
      applied_at timestamptz not null default now()
    );`);
  const done = new Set((await runSql('select name from internal.migrations')).map((r) => r.name));
  const dir = path.resolve('supabase/migrations');
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    if (done.has(file)) continue;
    const body = await readFile(path.join(dir, file), 'utf8');
    process.stdout.write(`→ ${file} … `);
    await runSql(`begin;\n${body}\ninsert into internal.migrations(name) values ('${file}');\ncommit;`);
    console.log('ok');
  }
  console.log('Migration durumu güncel.');
}

const [cmd, ...args] = process.argv.slice(2);
if (cmd === 'apply') {
  await apply();
} else if (cmd === 'sql') {
  const query = args[0] === '--file' ? await readFile(args[1], 'utf8') : args.join(' ');
  console.log(JSON.stringify(await runSql(query), null, 2));
} else {
  console.error('Komut: apply | sql "<sorgu>" | sql --file <yol>');
  process.exit(1);
}
```

- [x] **Adım 5: Test yardımcılarını ve DB test yapılandırmasını oluştur**

`supabase/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';

export default defineConfig(({ mode }) => ({
  test: {
    environment: 'node',
    include: ['supabase/tests/**/*.test.ts'],
    env: loadEnv(mode, process.cwd(), ''),
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false, // testler aynı canlı projeyi paylaşır
  },
}));
```
`supabase/tests/helpers/sql.ts`:
```ts
export async function sql<T = Record<string, unknown>>(query: string): Promise<T[]> {
  const ref = process.env.SUPABASE_PROJECT_REF;
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!ref || !token) throw new Error('.env: SUPABASE_PROJECT_REF / SUPABASE_ACCESS_TOKEN eksik');
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`SQL hatası (${res.status}): ${text}`);
  return (text ? JSON.parse(text) : []) as T[];
}
```

- [x] **Adım 6: Bağlantıyı doğrula**

Run: `npm run db:sql -- "select current_setting('server_version') as v"`
Expected: `[{ "v": "17.x" }]`

Run: `npm run db:apply`
Expected: `Migration durumu güncel.` (henüz dosya yok; `internal.migrations` tablosu oluştu)

- [x] **Adım 7: Commit**
```bash
git add .env.example scripts/db.mjs supabase/vitest.config.ts supabase/tests/helpers/sql.ts package.json
git commit -m "chore: Supabase projesi bağlantısı, migration/SQL betiği ve DB test altyapısı"
```

---

## Görev 3: Migration 0001 — şema (enum'lar, tablolar, kısıtlar, indeksler)

**Files:**
- Create: `supabase/migrations/0001_schema.sql`
- Test: `supabase/tests/schema.test.ts`

**Interfaces:**
- Consumes: `sql()` (Görev 2)
- Produces: Spec §5'teki tüm tablolar. Seed'in idempotent upsert'i için doğal anahtarlar da eklenir: `categories.slug`, `products.slug`, `ingredients.slug`, `option_groups.slug`. Tekil satırlar: `settings(id = 1)`, `printer_status(id = 'main')`. Tetikleyici fonksiyonu: `public.touch_updated_at()`.

- [x] **Adım 1: Testi yaz (kırmızı)**

`supabase/tests/schema.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { sql } from './helpers/sql';

const TABLES = [
  'audit_log', 'categories', 'daily_counters', 'dining_tables', 'ingredients', 'option_groups',
  'options', 'order_items', 'orders', 'print_jobs', 'printer_status', 'product_ingredients',
  'product_option_groups', 'product_variants', 'products', 'profiles', 'push_subscriptions',
  'settings', 'table_sessions',
];

describe('0001 şema', () => {
  it('19 tablo var ve hepsinde RLS açık', async () => {
    const rows = await sql<{ relname: string; relrowsecurity: boolean }>(`
      select c.relname, c.relrowsecurity
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
      order by c.relname collate "C"`);
    expect(rows.map((r) => r.relname)).toEqual(TABLES);
    expect(rows.filter((r) => !r.relrowsecurity)).toEqual([]);
  });

  it('tekil satırlar hazır', async () => {
    expect(await sql('select id from public.settings')).toEqual([{ id: 1 }]);
    expect(await sql('select id from public.printer_status')).toEqual([{ id: 'main' }]);
  });

  it('bir masada aynı anda tek açık oturum olabilir', async () => {
    const idx = await sql(`select 1 from pg_indexes where indexname = 'table_sessions_one_open'`);
    expect(idx).toHaveLength(1);
  });

  it('anon hiçbir tabloda yetkiye sahip değil', async () => {
    const grants = await sql(`
      select table_name from information_schema.role_table_grants
      where grantee = 'anon' and table_schema = 'public'`);
    expect(grants).toEqual([]);
  });
});
```
Run: `npm run db:test -- schema` → Expected: FAIL (tablolar yok)

- [x] **Adım 2: Migration'ı yaz**

`supabase/migrations/0001_schema.sql`:
```sql
-- 0001 — Ramo's sipariş sistemi şeması (spec §5)

create type public.staff_role       as enum ('admin', 'waiter', 'kitchen', 'printer');
create type public.session_status   as enum ('open', 'closed');
create type public.order_status     as enum ('in_kitchen', 'ready', 'served', 'cancelled');
create type public.item_status      as enum ('active', 'cancelled');
create type public.print_job_type   as enum ('order', 'addition', 'storno', 'table_move', 'reprint', 'test');
create type public.print_job_status as enum ('pending', 'printing', 'printed', 'failed');
create type public.ticket_format    as enum ('label_values', 'values_only', 'plus_each');

create table public.profiles (
  id            uuid primary key references auth.users (id) on delete restrict,
  username      text not null unique check (username ~ '^[a-z0-9._-]{3,32}$'),
  display_name  text not null check (length(display_name) between 1 and 60),
  role          public.staff_role not null,
  locale        text not null default 'tr' check (locale in ('tr', 'de')),
  is_active     boolean not null default true,
  on_duty_since timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name_de     text not null,
  name_tr     text,
  is_beverage boolean not null default false,
  sort        int not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.products (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null unique,
  category_id      uuid not null references public.categories (id),
  code             text,
  name             text not null,
  description      text,
  base_price_cents int check (base_price_cents >= 0),
  allergens        text,
  image_path       text,                          -- Storage yolu (product-images); boş = yer tutucu
  is_active        boolean not null default true,
  is_sold_out      boolean not null default false,
  sort             int not null default 0,
  archived_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create unique index products_code_unique on public.products (code)
  where archived_at is null and code is not null;
create index products_category_idx on public.products (category_id, sort);

create table public.product_variants (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products (id) on delete cascade,
  name_de     text not null,
  name_tr     text,
  price_cents int not null check (price_cents >= 0),
  is_default  boolean not null default false,
  sort        int not null default 0,
  is_active   boolean not null default true
);
create index product_variants_product_idx on public.product_variants (product_id, sort);

create table public.ingredients (
  id        uuid primary key default gen_random_uuid(),
  slug      text not null unique,
  name_de   text not null,
  name_tr   text,
  is_active boolean not null default true
);

create table public.product_ingredients (
  product_id    uuid not null references public.products (id) on delete cascade,
  ingredient_id uuid not null references public.ingredients (id) on delete restrict,
  sort          int not null default 0,
  primary key (product_id, ingredient_id)
);

create table public.option_groups (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique,
  admin_label   text not null,
  name_de       text not null,
  name_tr       text,
  min_select    int not null default 0 check (min_select >= 0),
  max_select    int not null default 1 check (max_select >= 1),
  ticket_format public.ticket_format not null default 'label_values',
  sort          int not null default 0,
  is_active     boolean not null default true,
  check (min_select <= max_select)
);

create table public.options (
  id                uuid primary key default gen_random_uuid(),
  group_id          uuid not null references public.option_groups (id) on delete cascade,
  name_de           text not null,
  name_tr           text,
  price_delta_cents int not null default 0,
  is_default        boolean not null default false,
  is_exclusive      boolean not null default false,
  sort              int not null default 0,
  is_active         boolean not null default true
);
create index options_group_idx on public.options (group_id, sort);

create table public.product_option_groups (
  product_id uuid not null references public.products (id) on delete cascade,
  group_id   uuid not null references public.option_groups (id) on delete restrict,
  sort       int not null default 0,
  primary key (product_id, group_id)
);

create table public.dining_tables (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  sort       int not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.table_sessions (
  id        uuid primary key default gen_random_uuid(),
  table_id  uuid not null references public.dining_tables (id),
  status    public.session_status not null default 'open',
  opened_by uuid not null references public.profiles (id),
  opened_at timestamptz not null default now(),
  closed_by uuid references public.profiles (id),
  closed_at timestamptz
);
create unique index table_sessions_one_open on public.table_sessions (table_id) where status = 'open';

create table public.orders (
  id            uuid primary key,                       -- istemci üretir (idempotency)
  session_id    uuid not null references public.table_sessions (id),
  waiter_id     uuid not null references public.profiles (id),
  business_date date not null,
  order_no      int not null,
  round_no      int not null,
  status        public.order_status not null default 'in_kitchen',
  note          text check (length(note) <= 500),
  created_at    timestamptz not null default now(),
  ready_at      timestamptz,
  ready_by      uuid references public.profiles (id),
  served_at     timestamptz,
  served_by     uuid references public.profiles (id),
  cancelled_at  timestamptz,
  unique (business_date, order_no)
);
create index orders_status_idx on public.orders (status, created_at);
create index orders_session_idx on public.orders (session_id);

create table public.order_items (
  id                  uuid primary key default gen_random_uuid(),
  order_id            uuid not null references public.orders (id),
  product_id          uuid not null references public.products (id),
  category_sort       int not null,
  is_beverage         boolean not null default false,
  product_code        text,
  product_name        text not null,
  variant_id          uuid references public.product_variants (id),
  variant_name_de     text,
  variant_name_tr     text,
  unit_price_cents    int not null check (unit_price_cents >= 0),
  quantity            int not null check (quantity between 1 and 99),
  removed_ingredients jsonb not null default '[]'::jsonb,
  selected_options    jsonb not null default '[]'::jsonb,
  note                text check (length(note) <= 200),
  status              public.item_status not null default 'active',
  cancel_reason       text,
  cancelled_by        uuid references public.profiles (id),
  cancelled_at        timestamptz,
  sort                int not null default 0
);
create index order_items_order_idx on public.order_items (order_id);

create table public.print_jobs (
  id              uuid primary key default gen_random_uuid(),
  type            public.print_job_type not null,
  order_id        uuid references public.orders (id),
  session_id      uuid references public.table_sessions (id),
  payload         jsonb not null,
  status          public.print_job_status not null default 'pending',
  attempts        int not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error      text,
  claimed_by      text,
  claimed_at      timestamptz,
  printed_at      timestamptz,
  created_by      uuid references public.profiles (id),
  created_at      timestamptz not null default now()
);
create index print_jobs_queue_idx on public.print_jobs (status, next_attempt_at);
create index print_jobs_order_idx on public.print_jobs (order_id);

create table public.printer_status (
  id                text primary key default 'main' check (id = 'main'),
  agent_id          text,
  agent_version     text,
  host              text,
  last_seen_at      timestamptz,
  printer_reachable boolean,
  printer_state     jsonb not null default '{}'::jsonb,
  last_error        text,
  last_printed_at   timestamptz
);
insert into public.printer_status (id) values ('main');

create table public.push_subscriptions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles (id) on delete cascade,
  endpoint        text not null unique,
  p256dh          text not null,
  auth            text not null,
  user_agent      text,
  created_at      timestamptz not null default now(),
  last_success_at timestamptz
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

create table public.settings (
  id                      int primary key default 1 check (id = 1),
  restaurant_name         text not null default 'Ramo''s Döner & Grill House',
  ticket_header           text not null default 'RAMO''S · KÜCHE',
  ticket_footer           text not null default '',
  business_day_start      time not null default '05:00',
  printer_host            text not null default '',
  printer_port            int not null default 9100 check (printer_port between 1 and 65535),
  printer_codepage        text not null default 'cp857',
  printer_codepage_number int not null default 61 check (printer_codepage_number between 0 and 255),
  printer_transliterate   boolean not null default false,
  quick_notes             jsonb not null default '[]'::jsonb,
  cancel_reasons          jsonb not null default '[]'::jsonb,
  allergen_legend         jsonb not null default '[]'::jsonb,
  updated_at              timestamptz not null default now(),
  updated_by              uuid references public.profiles (id)
);
insert into public.settings (id) values (1);

create table public.audit_log (
  id        bigint generated always as identity primary key,
  at        timestamptz not null default now(),
  actor_id  uuid,
  action    text not null,
  entity    text not null,
  entity_id text,
  details   jsonb not null default '{}'::jsonb
);
create index audit_log_at_idx on public.audit_log (at desc);

create table public.daily_counters (
  business_date date primary key,
  last_order_no int not null default 0
);

-- updated_at otomatik
create function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;
create trigger profiles_touch   before update on public.profiles   for each row execute function public.touch_updated_at();
create trigger categories_touch before update on public.categories for each row execute function public.touch_updated_at();
create trigger products_touch   before update on public.products   for each row execute function public.touch_updated_at();
create trigger settings_touch   before update on public.settings   for each row execute function public.touch_updated_at();

-- RLS her tabloda açık; politikalar 0002'de. anon'un hiçbir yetkisi yok.
do $$
declare t text;
begin
  foreach t in array array[
    'profiles','categories','products','product_variants','ingredients','product_ingredients',
    'option_groups','options','product_option_groups','dining_tables','table_sessions','orders',
    'order_items','print_jobs','printer_status','push_subscriptions','settings','audit_log',
    'daily_counters'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke execute on functions from anon, public;
```

- [x] **Adım 3: Uygula ve testi çalıştır**

Run: `npm run db:apply` → Expected: `→ 0001_schema.sql … ok`
Run: `npm run db:test -- schema` → Expected: PASS (4 test)

- [x] **Adım 4: Advisors**

MCP `get_advisors` (security) çalıştır. Beklenen: bu aşamada "RLS enabled, no policy" INFO uyarıları normal, politikalar 0002'de gelecek. Bunlar dışındaki bulguları düzelt.

- [x] **Adım 5: Commit**
```bash
git add supabase/migrations/0001_schema.sql supabase/tests/schema.test.ts
git commit -m "feat(db): 0001 şema — enum'lar, 19 tablo, kısıtlar, RLS açık, anon kapalı"
```

---

## Görev 4: Migration 0002 — yardımcı fonksiyonlar, RLS politikaları, test kullanıcıları

**Files:**
- Create: `supabase/migrations/0002_helpers_rls.sql`
- Create: `supabase/tests/helpers/users.ts`
- Modify: `.env` ve `.env.example` (`TEST_USER_PASSWORD` eklenir)
- Test: `supabase/tests/rls.test.ts`

**Interfaces:**
- Consumes: 0001 tabloları, `sql()`
- Produces:
  - Public (authenticated çağırabilir):
    - `public.is_active_staff() → boolean`
    - `public.has_role(variadic staff_role[]) → boolean`
    - `public.business_date(timestamptz default now()) → date`
    - `public.current_business_day_start() → timestamptz`
    - `public.is_on_duty(timestamptz) → boolean`
    - `public.staff_names() → table(id uuid, display_name text, role staff_role)` — printer hariç, aktif personel çağırabilir
  - Internal (yalnızca RPC'lerden çağrılır):
    - `internal.fail(p_key text, p_detail text default null)` — `P0001` hatası fırlatır
    - `internal.require_role(variadic staff_role[]) → public.profiles` — yetki yoksa `not_authorized`
    - `internal.audit(p_action, p_entity, p_entity_id, p_details jsonb)`
  - Test yardımcıları: `ensureTestUsers(): Promise<Record<TestUserKey, string>>`, `clientFor(key): Promise<SupabaseClient>`, `anonClient()`, `serviceClient()`. `TestUserKey` = `admin | waiter | waiter2 | kitchen | printer | inactive`

- [x] **Adım 1: Test parolasını üret ve `.env` dosyasına ekle**

Run: `node -e "console.log('T-' + require('crypto').randomBytes(12).toString('base64url'))"`
`.env` dosyasına ekle: `TEST_USER_PASSWORD=<çıktı>`. `.env.example` dosyasına değersiz `TEST_USER_PASSWORD=` satırını ekle.

Not: Test kullanıcıları gerçek projede durur. **M8'de (Görev 27) yayından önce pasifleştirilir.**

- [x] **Adım 2: Test kullanıcı yardımcısını yaz**

`supabase/tests/helpers/users.ts`:
```ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { sql } from './sql';

export const TEST_USERS = {
  admin: { username: 'test-admin', role: 'admin' },
  waiter: { username: 'test-waiter', role: 'waiter' },
  waiter2: { username: 'test-waiter2', role: 'waiter' },
  kitchen: { username: 'test-kitchen', role: 'kitchen' },
  printer: { username: 'test-printer', role: 'printer' },
  inactive: { username: 'test-inactive', role: 'waiter' },
} as const;
export type TestUserKey = keyof typeof TEST_USERS;

const env = (k: string): string => {
  const v = process.env[k];
  if (!v) throw new Error(`.env: ${k} eksik`);
  return v;
};
export const emailOf = (username: string) => `${username}@${env('STAFF_EMAIL_DOMAIN')}`;
const opts = { auth: { persistSession: false, autoRefreshToken: false } };

export const serviceClient = () => createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), opts);
export const anonClient = () => createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), opts);

export async function ensureTestUsers(): Promise<Record<TestUserKey, string>> {
  const admin = serviceClient();
  const password = env('TEST_USER_PASSWORD');
  const ids = {} as Record<TestUserKey, string>;
  for (const key of Object.keys(TEST_USERS) as TestUserKey[]) {
    const u = TEST_USERS[key];
    const email = emailOf(u.username);
    const found = await sql<{ id: string }>(`select id from auth.users where email = '${email}'`);
    let id = found[0]?.id;
    if (!id) {
      const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (error) throw error;
      id = data.user.id;
    } else {
      const { error } = await admin.auth.admin.updateUserById(id, { password, ban_duration: 'none' });
      if (error) throw error;
    }
    await sql(`
      insert into public.profiles (id, username, display_name, role, locale, is_active)
      values ('${id}', '${u.username}', '${u.username}', '${u.role}', 'tr', ${key !== 'inactive'})
      on conflict (id) do update set role = excluded.role, is_active = excluded.is_active`);
    ids[key] = id;
  }
  return ids;
}

export async function clientFor(key: TestUserKey): Promise<SupabaseClient> {
  const client = anonClient();
  const { error } = await client.auth.signInWithPassword({
    email: emailOf(TEST_USERS[key].username),
    password: env('TEST_USER_PASSWORD'),
  });
  if (error) throw error;
  return client;
}
```

- [x] **Adım 3: RLS testlerini yaz (kırmızı)**

`supabase/tests/rls.test.ts`:
```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';
import { sql } from './helpers/sql';
import { anonClient, clientFor, ensureTestUsers } from './helpers/users';

type K = 'admin' | 'waiter' | 'kitchen' | 'printer' | 'inactive';
let c: Record<K, SupabaseClient>;

beforeAll(async () => {
  await ensureTestUsers();
  await sql(`insert into public.categories (slug, name_de) values ('test-rls', 'RLS-Test')
             on conflict (slug) do nothing`);
  c = {
    admin: await clientFor('admin'),
    waiter: await clientFor('waiter'),
    kitchen: await clientFor('kitchen'),
    printer: await clientFor('printer'),
    inactive: await clientFor('inactive'),
  };
});

describe('RLS (0002)', () => {
  it('anon hiçbir tabloyu okuyamaz', async () => {
    const { error } = await anonClient().from('categories').select('id');
    expect(error?.code).toBe('42501');
  });

  it('garson ve mutfak menüyü okur; printer ve pasif kullanıcı okuyamaz', async () => {
    for (const k of ['waiter', 'kitchen'] as const) {
      const { data, error } = await c[k].from('categories').select('slug').eq('slug', 'test-rls');
      expect(error).toBeNull();
      expect(data).toHaveLength(1);
    }
    for (const k of ['printer', 'inactive'] as const) {
      const { data } = await c[k].from('categories').select('slug').eq('slug', 'test-rls');
      expect(data).toEqual([]);
    }
  });

  it('garson menüye yazamaz, admin yazabilir', async () => {
    const w = await c.waiter.from('categories').insert({ slug: 'test-rls-w', name_de: 'x' });
    expect(w.error?.code).toBe('42501');
    const a = await c.admin
      .from('categories').update({ name_tr: 'RLS testi' }).eq('slug', 'test-rls').select('name_tr');
    expect(a.error).toBeNull();
    expect(a.data?.[0]?.name_tr).toBe('RLS testi');
  });

  it('sayaç ve fiş tablolarına istemci doğrudan yazamaz', async () => {
    const d = await c.admin.from('daily_counters').insert({ business_date: '2000-01-01', last_order_no: 1 });
    expect(d.error?.code).toBe('42501');
    const p = await c.printer.from('print_jobs').insert({ type: 'test', payload: {} });
    expect(p.error?.code).toBe('42501');
  });

  it('audit_log yalnızca admin okur', async () => {
    const { data } = await c.waiter.from('audit_log').select('id').limit(1);
    expect(data).toEqual([]);
  });

  it('ayarları printer dahil tüm aktif personel okur, pasif okuyamaz', async () => {
    for (const k of ['admin', 'waiter', 'kitchen', 'printer'] as const) {
      const { data } = await c[k].from('settings').select('id');
      expect(data).toEqual([{ id: 1 }]);
    }
    const { data } = await c.inactive.from('settings').select('id');
    expect(data).toEqual([]);
  });

  it('staff_names printer hesabını listelemez', async () => {
    const { data, error } = await c.waiter.rpc('staff_names');
    expect(error).toBeNull();
    const rows = data as { role: string; display_name: string }[];
    expect(rows.some((r) => r.display_name === 'test-waiter')).toBe(true);
    expect(rows.some((r) => r.role === 'printer')).toBe(false);
  });

  it('ürün görselini yalnız admin yükler; herkese açık adresten okunur', async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const path = `test/rls-${Date.now()}.png`;
    const w = await c.waiter.storage.from('product-images').upload(path, png, { contentType: 'image/png' });
    expect(w.error).not.toBeNull();
    const a = await c.admin.storage.from('product-images').upload(path, png, { contentType: 'image/png' });
    expect(a.error).toBeNull();
    const url = c.admin.storage.from('product-images').getPublicUrl(path).data.publicUrl;
    expect((await fetch(url)).status).toBe(200);
    expect((await c.admin.storage.from('product-images').remove([path])).error).toBeNull();
  });

  it('iş günü 05:00 Berlin saatinde döner', async () => {
    const [row] = await sql<{ a: string; b: string }>(`
      select public.business_date('2026-09-15 04:59:00+02')::text as a,
             public.business_date('2026-09-15 05:00:00+02')::text as b`);
    expect(row).toEqual({ a: '2026-09-14', b: '2026-09-15' });
  });
});
```
Run: `npm run db:test -- rls` → Expected: FAIL (fonksiyonlar ve politikalar yok)

- [x] **Adım 4: Migration'ı yaz**

`supabase/migrations/0002_helpers_rls.sql`:
```sql
-- 0002 — yardımcı fonksiyonlar ve RLS politikaları (spec §5.3, §12)

-- ---------- internal yardımcılar (PostgREST'e açık değil) ----------
create function internal.fail(p_key text, p_detail text default null) returns void
language plpgsql as $$
begin
  raise exception using message = p_key, errcode = 'P0001', detail = coalesce(p_detail, '');
end $$;

create function internal.require_role(variadic p_roles public.staff_role[]) returns public.profiles
language plpgsql stable security definer set search_path = '' as $$
declare v public.profiles;
begin
  select * into v from public.profiles p
  where p.id = auth.uid() and p.is_active and p.role = any (p_roles);
  if not found then
    perform internal.fail('not_authorized');
  end if;
  return v;
end $$;

create function internal.audit(p_action text, p_entity text, p_entity_id text,
                               p_details jsonb default '{}'::jsonb) returns void
language sql security definer set search_path = '' as $$
  insert into public.audit_log (actor_id, action, entity, entity_id, details)
  values (auth.uid(), p_action, p_entity, p_entity_id, coalesce(p_details, '{}'::jsonb));
$$;

-- ---------- public yardımcılar ----------
create function public.is_active_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_active);
$$;

create function public.has_role(variadic p_roles public.staff_role[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_active and p.role = any (p_roles));
$$;

create function public.business_date(p_ts timestamptz default now()) returns date
language sql stable security definer set search_path = '' as $$
  select ((p_ts at time zone 'Europe/Berlin')
          - (select s.business_day_start from public.settings s where s.id = 1)::interval)::date;
$$;

create function public.current_business_day_start() returns timestamptz
language sql stable security definer set search_path = '' as $$
  select (public.business_date(now())::timestamp
          + (select s.business_day_start from public.settings s where s.id = 1)::interval)
         at time zone 'Europe/Berlin';
$$;

create function public.is_on_duty(p_since timestamptz) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_since is not null and p_since >= public.current_business_day_start();
$$;

create function public.staff_names()
returns table (id uuid, display_name text, role public.staff_role)
language sql stable security definer set search_path = '' as $$
  select p.id, p.display_name, p.role
  from public.profiles p
  where public.is_active_staff() and p.role <> 'printer'
  order by p.display_name;
$$;

-- ---------- RLS: menü + masalar (personel okur, admin yazar) ----------
do $$
declare t text;
begin
  foreach t in array array['categories','products','product_variants','ingredients','product_ingredients',
                           'option_groups','options','product_option_groups','dining_tables'] loop
    execute format($f$create policy %1$s_read on public.%1$I for select to authenticated
      using ((select public.has_role('admin','waiter','kitchen')))$f$, t);
    execute format($f$create policy %1$s_ins on public.%1$I for insert to authenticated
      with check ((select public.has_role('admin')))$f$, t);
    execute format($f$create policy %1$s_upd on public.%1$I for update to authenticated
      using ((select public.has_role('admin'))) with check ((select public.has_role('admin')))$f$, t);
    execute format($f$create policy %1$s_del on public.%1$I for delete to authenticated
      using ((select public.has_role('admin')))$f$, t);
  end loop;
end $$;

-- ---------- RLS: diğer tablolar ----------
create policy profiles_read on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.has_role('admin')));

create policy settings_read on public.settings for select to authenticated
  using ((select public.is_active_staff()));
create policy settings_upd on public.settings for update to authenticated
  using ((select public.has_role('admin'))) with check ((select public.has_role('admin')));

create policy table_sessions_read on public.table_sessions for select to authenticated
  using ((select public.has_role('admin','waiter','kitchen')));
create policy orders_read on public.orders for select to authenticated
  using ((select public.has_role('admin','waiter','kitchen')));
create policy order_items_read on public.order_items for select to authenticated
  using ((select public.has_role('admin','waiter','kitchen')));

create policy print_jobs_read on public.print_jobs for select to authenticated
  using ((select public.has_role('admin','waiter','kitchen','printer')));
create policy printer_status_read on public.printer_status for select to authenticated
  using ((select public.is_active_staff()));

create policy push_subscriptions_read on public.push_subscriptions for select to authenticated
  using (user_id = (select auth.uid()));
create policy push_subscriptions_del on public.push_subscriptions for delete to authenticated
  using (user_id = (select auth.uid()));

create policy audit_log_read on public.audit_log for select to authenticated
  using ((select public.has_role('admin')));
-- daily_counters: politika yok → yalnızca security definer RPC'ler kullanır.
-- orders / order_items / table_sessions / print_jobs: yazma politikası yok → yalnızca RPC.

-- ---------- Storage: ürün görselleri (herkese açık okuma, yalnız admin yazar/siler/listeler) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 5242880, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

create policy product_images_admin_select on storage.objects for select to authenticated
  using (bucket_id = 'product-images' and (select public.has_role('admin')));
create policy product_images_admin_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'product-images' and (select public.has_role('admin')));
create policy product_images_admin_update on storage.objects for update to authenticated
  using (bucket_id = 'product-images' and (select public.has_role('admin')))
  with check (bucket_id = 'product-images' and (select public.has_role('admin')));
create policy product_images_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'product-images' and (select public.has_role('admin')));

-- ---------- fonksiyon yetkileri ----------
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
revoke all on all functions in schema internal from public, anon, authenticated;
```

- [x] **Adım 5: Uygula ve testleri çalıştır**

Run: `npm run db:apply` → Expected: `→ 0002_helpers_rls.sql … ok`
Run: `npm run db:test -- rls` → Expected: PASS (9 test)
Run: `npm run db:test` → Expected: schema + rls PASS

- [x] **Adım 6: Advisors**

`get_advisors` (security + performance) çalıştır. "RLS enabled no policy" uyarısı yalnızca `daily_counters` için kalmalı (bilinçli). "auth_rls_initplan" uyarısı çıkmamalı; tüm çağrılar `(select …)` içinde. Başka bulgu varsa düzelt.

- [x] **Adım 7: Commit**
```bash
git add supabase/migrations/0002_helpers_rls.sql supabase/tests/helpers/users.ts supabase/tests/rls.test.ts .env.example
git commit -m "feat(db): 0002 yardımcılar ve RLS — rol bazlı okuma, admin yazma, anon kapalı"
```

---

## Görev 5: Migration 0003 — `submit_order` ve fiş payload'u

**Files:**
- Create: `supabase/migrations/0003_submit_order.sql`
- Create: `supabase/tests/helpers/fixtures.ts`
- Test: `supabase/tests/orders.test.ts`

**Interfaces:**
- Consumes: `internal.require_role`, `internal.fail`, `internal.audit`, `public.business_date` (Görev 4); `ensureTestUsers`, `clientFor` (Görev 4)
- Produces:
  - `public.submit_order(p_order_id uuid, p_table_id uuid, p_items jsonb, p_note text default null) → jsonb`
    - Dönüş: `{order_id, order_no, round_no, session_id, total_cents, duplicate}`
    - `p_items[]`: `{product_id, variant_id|null, quantity, option_ids[], removed_ingredient_ids[], note}`
  - `internal.build_order_payload(p_order_id uuid, p_kind text) → jsonb` (spec §6.2 şekli; `items` içecekler sonda, kategori sırasında)
  - `internal.option_groups_for_ticket(p_selected jsonb) → jsonb` → `[{label, format, values[]}]`
  - Fixtures:
    - `ensureFixtures(): Promise<Fixtures>`
    - `cleanupFixtureOrders(): Promise<void>`
    - `Fixtures` = `{ tableId, table2Id, doenerId, variantH, variantK, ingZwiebeln, ingTomaten, sauceA, sauceB, sauceOhne, extraCheese, colaId, soldOutId, sauceGroupId }`

- [x] **Adım 1: Fixture yardımcısını yaz**

`supabase/tests/helpers/fixtures.ts` — fixture'lar `sql()` ile (postgres yetkisiyle) oluşturulur. Tüm test verisinin slug'ı `test-` ile başlar, masa adları `Test-Tisch` / `Test-Tisch-2`'dir.
```ts
import { sql } from './sql';

export interface Fixtures {
  tableId: string; table2Id: string; doenerId: string; variantH: string; variantK: string;
  ingZwiebeln: string; ingTomaten: string; sauceGroupId: string; sauceA: string; sauceB: string;
  sauceOhne: string; extraCheese: string; colaId: string; soldOutId: string;
}

const one = async (q: string) => (await sql<{ id: string }>(q))[0]!.id;

export async function ensureFixtures(): Promise<Fixtures> {
  await sql(`
    insert into public.dining_tables (name, sort) values ('Test-Tisch', 900), ('Test-Tisch-2', 901)
      on conflict (name) do update set is_active = true;
    insert into public.categories (slug, name_de, name_tr, sort) values ('test-food', 'Test Essen', 'Test Yemek', 900)
      on conflict (slug) do nothing;
    insert into public.categories (slug, name_de, sort, is_beverage) values ('test-drinks', 'Test Getränke', 999, true)
      on conflict (slug) do nothing;
    insert into public.ingredients (slug, name_de, name_tr) values
      ('test-zwiebeln', 'Zwiebeln', 'Soğan'), ('test-tomaten', 'Tomaten', 'Domates')
      on conflict (slug) do nothing;
    insert into public.option_groups (slug, admin_label, name_de, name_tr, min_select, max_select, ticket_format, sort)
      values ('test-sosse', 'Test Soße', 'Soße', 'Sos', 1, 2, 'label_values', 1),
             ('test-extras', 'Test Extras', 'Extras', 'Ekstralar', 0, 2, 'plus_each', 2)
      on conflict (slug) do nothing;
  `);
  const sauceGroupId = await one(`select id from public.option_groups where slug = 'test-sosse'`);
  const extrasGroupId = await one(`select id from public.option_groups where slug = 'test-extras'`);
  if ((await sql(`select 1 from public.options where group_id = '${sauceGroupId}'`)).length === 0) {
    await sql(`
      insert into public.options (group_id, name_de, name_tr, sort, is_exclusive) values
        ('${sauceGroupId}', 'Knoblauch', 'Sarımsaklı', 1, false),
        ('${sauceGroupId}', 'Kräuter', 'Otlu', 2, false),
        ('${sauceGroupId}', 'ohne Soße', 'Sossuz', 3, true);
      insert into public.options (group_id, name_de, name_tr, price_delta_cents, sort) values
        ('${extrasGroupId}', 'Extra Weichkäse', 'Ekstra beyaz peynir', 100, 1);`);
  }
  await sql(`
    insert into public.products (slug, category_id, code, name, sort)
      select 'test-doener', id, 'T05', 'Test Drehspieß Sandwich', 1 from public.categories where slug = 'test-food'
      on conflict (slug) do nothing;
    insert into public.products (slug, category_id, code, name, base_price_cents, sort)
      select 'test-cola', id, null, 'Test Cola 0,33 l', 250, 1 from public.categories where slug = 'test-drinks'
      on conflict (slug) do nothing;
    insert into public.products (slug, category_id, code, name, base_price_cents, is_sold_out, sort)
      select 'test-soldout', id, 'T99', 'Test Ausverkauft', 500, true, 2 from public.categories where slug = 'test-food'
      on conflict (slug) do nothing;
  `);
  const doenerId = await one(`select id from public.products where slug = 'test-doener'`);
  if ((await sql(`select 1 from public.product_variants where product_id = '${doenerId}'`)).length === 0) {
    await sql(`
      insert into public.product_variants (product_id, name_de, name_tr, price_cents, is_default, sort) values
        ('${doenerId}', 'Hähnchen', 'Tavuk', 750, true, 1), ('${doenerId}', 'Kalb', 'Dana', 850, false, 2);
      insert into public.product_ingredients (product_id, ingredient_id, sort)
        select '${doenerId}', id, row_number() over (order by slug) from public.ingredients
        where slug in ('test-tomaten', 'test-zwiebeln');
      insert into public.product_option_groups (product_id, group_id, sort) values
        ('${doenerId}', '${sauceGroupId}', 1), ('${doenerId}', '${extrasGroupId}', 2);`);
  }
  return {
    tableId: await one(`select id from public.dining_tables where name = 'Test-Tisch'`),
    table2Id: await one(`select id from public.dining_tables where name = 'Test-Tisch-2'`),
    doenerId,
    variantH: await one(`select id from public.product_variants where product_id = '${doenerId}' and name_de = 'Hähnchen'`),
    variantK: await one(`select id from public.product_variants where product_id = '${doenerId}' and name_de = 'Kalb'`),
    ingZwiebeln: await one(`select id from public.ingredients where slug = 'test-zwiebeln'`),
    ingTomaten: await one(`select id from public.ingredients where slug = 'test-tomaten'`),
    sauceGroupId,
    sauceA: await one(`select id from public.options where group_id = '${sauceGroupId}' and name_de = 'Knoblauch'`),
    sauceB: await one(`select id from public.options where group_id = '${sauceGroupId}' and name_de = 'Kräuter'`),
    sauceOhne: await one(`select id from public.options where group_id = '${sauceGroupId}' and is_exclusive`),
    extraCheese: await one(`select id from public.options where group_id = '${extrasGroupId}'`),
    colaId: await one(`select id from public.products where slug = 'test-cola'`),
    soldOutId: await one(`select id from public.products where slug = 'test-soldout'`),
  };
}

/** Test masalarına ait sipariş/oturum/fiş verisini siler (yalnız testler için; uygulama asla silmez). */
export async function cleanupFixtureOrders(): Promise<void> {
  await sql(`
    with s as (select ts.id from public.table_sessions ts join public.dining_tables t on t.id = ts.table_id
               where t.name like 'Test-Tisch%')
    , o as (select id from public.orders where session_id in (select id from s))
    , pj as (delete from public.print_jobs where order_id in (select id from o) or session_id in (select id from s))
    , oi as (delete from public.order_items where order_id in (select id from o))
    select 1;
    delete from public.orders where session_id in (select ts.id from public.table_sessions ts
      join public.dining_tables t on t.id = ts.table_id where t.name like 'Test-Tisch%');
    delete from public.table_sessions where table_id in (select id from public.dining_tables where name like 'Test-Tisch%');
    delete from public.print_jobs where type = 'test' and created_by in (select id from public.profiles where username like 'test-%');
    update public.products set is_sold_out = false where slug = 'test-doener';
  `);
}
```

- [x] **Adım 2: `submit_order` testlerini yaz (kırmızı)**

`supabase/tests/orders.test.ts`:
```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cleanupFixtureOrders, ensureFixtures, type Fixtures } from './helpers/fixtures';
import { sql } from './helpers/sql';
import { clientFor, ensureTestUsers } from './helpers/users';

let f: Fixtures;
let waiter: SupabaseClient;
let kitchen: SupabaseClient;

beforeAll(async () => {
  await ensureTestUsers();
  f = await ensureFixtures();
  await cleanupFixtureOrders();
  waiter = await clientFor('waiter');
  kitchen = await clientFor('kitchen');
});
afterAll(cleanupFixtureOrders);

const doener = (over: Record<string, unknown> = {}) => ({
  product_id: f.doenerId, variant_id: f.variantK, quantity: 2,
  option_ids: [f.sauceA, f.sauceB, f.extraCheese], removed_ingredient_ids: [f.ingZwiebeln],
  note: 'Soße extra', ...over,
});
const submit = (client: SupabaseClient, items: unknown[], id = crypto.randomUUID(), table = f.tableId) =>
  client.rpc('submit_order', { p_order_id: id, p_table_id: table, p_items: items, p_note: 'Kinderstuhl' });

describe('submit_order', () => {
  it('siparişi fiyatlar, snapshot alır ve fiş işi oluşturur', async () => {
    const id = crypto.randomUUID();
    const { data, error } = await submit(waiter, [doener(), { product_id: f.colaId, quantity: 3 }], id);
    expect(error).toBeNull();
    expect(data).toMatchObject({ order_id: id, round_no: 1, total_cents: 2 * (850 + 100) + 3 * 250, duplicate: false });

    const items = await sql<{ product_name: string; unit_price_cents: number; variant_name_de: string | null;
      removed_ingredients: { name_de: string }[] }>(
      `select product_name, unit_price_cents, variant_name_de, removed_ingredients
       from public.order_items where order_id = '${id}' order by sort`);
    expect(items[0]).toMatchObject({ unit_price_cents: 950, variant_name_de: 'Kalb',
      removed_ingredients: [{ name_de: 'Zwiebeln' }] });

    const [job] = await sql<{ type: string; status: string; payload: any }>(
      `select type, status, payload from public.print_jobs where order_id = '${id}'`);
    expect(job).toMatchObject({ type: 'order', status: 'pending' });
    expect(job!.payload).toMatchObject({ kind: 'order', table: 'Test-Tisch', round: 1, note: 'Kinderstuhl' });
    expect(job!.payload.items[0]).toMatchObject({
      qty: 2, code: 'T05', name: 'Test Drehspieß Sandwich', variant: 'Kalb', without: ['Zwiebeln'],
      groups: [
        { label: 'Soße', format: 'label_values', values: ['Knoblauch', 'Kräuter'] },
        { label: 'Extras', format: 'plus_each', values: ['Extra Weichkäse'] },
      ],
      note: 'Soße extra',
    });
    expect(job!.payload.items.at(-1)).toMatchObject({ name: 'Test Cola 0,33 l', isBeverage: true });
  });

  it('aynı order_id ikinci kez gönderilince yeni kayıt açmaz (idempotent)', async () => {
    const id = crypto.randomUUID();
    const first = await submit(waiter, [doener()], id);
    const second = await submit(waiter, [doener()], id);
    expect(second.error).toBeNull();
    expect(second.data).toMatchObject({ order_id: id, order_no: first.data.order_no, duplicate: true });
    const jobs = await sql(`select 1 from public.print_jobs where order_id = '${id}'`);
    expect(jobs).toHaveLength(1);
  });

  it('aynı masadaki ikinci sipariş round 2 ve addition fişi olur', async () => {
    await cleanupFixtureOrders();
    await submit(waiter, [doener()]);
    const id2 = crypto.randomUUID();
    const r2 = await submit(waiter, [doener()], id2);
    expect(r2.data).toMatchObject({ round_no: 2 });
    const [job] = await sql<{ type: string }>(`select type from public.print_jobs where order_id = '${id2}'`);
    expect(job!.type).toBe('addition');
  });

  it('sipariş numarası gün içinde artar', async () => {
    const a = await submit(waiter, [doener()], crypto.randomUUID(), f.table2Id);
    const b = await submit(waiter, [doener()], crypto.randomUUID(), f.table2Id);
    expect(b.data.order_no).toBe(a.data.order_no + 1);
  });

  it.each([
    ['variant_required', () => doener({ variant_id: null })],
    ['option_group_min', () => doener({ option_ids: [] })],
    ['option_exclusive_conflict', () => doener({ option_ids: [f.sauceA, f.sauceOhne] })],
    ['ingredient_invalid', () => doener({ removed_ingredient_ids: [f.sauceA] })],
    ['quantity_invalid', () => doener({ quantity: 0 })],
    ['product_sold_out', () => ({ product_id: f.soldOutId, quantity: 1 })],
  ])('geçersiz kalem → %s', async (key, item) => {
    const { error } = await submit(waiter, [item()]);
    expect(error?.message).toBe(key);
  });

  it('mutfak rolü sipariş gönderemez', async () => {
    const { error } = await submit(kitchen, [doener()]);
    expect(error?.message).toBe('not_authorized');
  });

  it('hatalı kalem tüm siparişi geri alır (yarım sipariş kalmaz)', async () => {
    const id = crypto.randomUUID();
    await submit(waiter, [doener(), doener({ quantity: 0 })], id);
    expect(await sql(`select 1 from public.orders where id = '${id}'`)).toEqual([]);
  });
});
```
Run: `npm run db:test -- orders` → Expected: FAIL (`submit_order` yok)

- [x] **Adım 3: Migration'ı yaz**

`supabase/migrations/0003_submit_order.sql`:
```sql
-- 0003 — sipariş oluşturma ve fiş payload'u (spec §6.1, §6.2, §7)

create function internal.option_groups_for_ticket(p_selected jsonb) returns jsonb
language sql immutable as $$
  select coalesce(jsonb_agg(g.obj order by g.gsort), '[]'::jsonb)
  from (
    select min((e->>'group_sort')::int) as gsort,
           jsonb_build_object(
             'label',  min(e->>'group_name_de'),
             'format', min(e->>'ticket_format'),
             'values', jsonb_agg(e->>'name_de' order by x.ord)) as obj
    from jsonb_array_elements(p_selected) with ordinality as x(e, ord)
    group by e->>'group_id'
  ) g;
$$;

create function internal.build_order_payload(p_order_id uuid, p_kind text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'kind',      p_kind,
    'header',    s.ticket_header,
    'footer',    s.ticket_footer,
    'table',     t.name,
    'orderNo',   o.order_no,
    'round',     o.round_no,
    'createdAt', o.created_at,
    'waiter',    w.display_name,
    'note',      o.note,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'qty',        i.quantity,
               'code',       i.product_code,
               'name',       i.product_name,
               'isBeverage', i.is_beverage,
               'variant',    i.variant_name_de,
               'without',    (select coalesce(jsonb_agg(r->>'name_de'), '[]'::jsonb)
                              from jsonb_array_elements(i.removed_ingredients) r),
               'groups',     internal.option_groups_for_ticket(i.selected_options),
               'note',       i.note)
             order by i.is_beverage, i.category_sort, i.sort)
      from public.order_items i
      where i.order_id = o.id and i.status = 'active'), '[]'::jsonb))
  from public.orders o
  join public.table_sessions ts on ts.id = o.session_id
  join public.dining_tables t   on t.id = ts.table_id
  join public.profiles w        on w.id = o.waiter_id
  cross join public.settings s
  where o.id = p_order_id;
$$;

create function public.submit_order(p_order_id uuid, p_table_id uuid, p_items jsonb, p_note text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_me       public.profiles;
  v_existing public.orders;
  v_table    public.dining_tables;
  v_session  public.table_sessions;
  v_product  public.products;
  v_cat      public.categories;
  v_variant  public.product_variants;
  v_group    record;
  v_item     jsonb;
  v_bdate    date;
  v_order_no int;
  v_round    int;
  v_qty      int;
  v_unit     int;
  v_delta    int;
  v_cnt      int;
  v_excl     int;
  v_total    int := 0;
  v_sort     int := 0;
  v_opt_ids  uuid[];
  v_ing_ids  uuid[];
  v_options  jsonb;
  v_removed  jsonb;
  v_type     public.print_job_type;
begin
  v_me := internal.require_role('admin', 'waiter');

  -- idempotency: aynı id tekrar gelirse mevcut sonucu döndür
  select * into v_existing from public.orders o where o.id = p_order_id;
  if found then
    if v_existing.waiter_id <> v_me.id then perform internal.fail('order_id_conflict'); end if;
    return jsonb_build_object(
      'order_id', v_existing.id, 'order_no', v_existing.order_no, 'round_no', v_existing.round_no,
      'session_id', v_existing.session_id, 'duplicate', true,
      'total_cents', (select coalesce(sum(i.unit_price_cents * i.quantity), 0)
                      from public.order_items i where i.order_id = v_existing.id and i.status = 'active'));
  end if;

  select * into v_table from public.dining_tables t where t.id = p_table_id for update;
  if not found or not v_table.is_active then perform internal.fail('table_inactive'); end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    perform internal.fail('empty_order');
  end if;
  if jsonb_array_length(p_items) > 50 then perform internal.fail('too_many_items'); end if;
  if length(coalesce(p_note, '')) > 500 then perform internal.fail('note_too_long'); end if;

  -- masa satırı kilitli: oturum bul ya da aç
  select * into v_session from public.table_sessions s where s.table_id = p_table_id and s.status = 'open';
  if not found then
    insert into public.table_sessions (table_id, opened_by) values (p_table_id, v_me.id) returning * into v_session;
    perform internal.audit('session_open', 'table_session', v_session.id::text, jsonb_build_object('table', v_table.name));
  end if;
  select count(*) + 1 into v_round from public.orders o where o.session_id = v_session.id;

  v_bdate := public.business_date(now());
  insert into public.daily_counters as d (business_date, last_order_no) values (v_bdate, 1)
  on conflict (business_date) do update set last_order_no = d.last_order_no + 1
  returning d.last_order_no into v_order_no;

  insert into public.orders (id, session_id, waiter_id, business_date, order_no, round_no, note)
  values (p_order_id, v_session.id, v_me.id, v_bdate, v_order_no, v_round, nullif(btrim(p_note), ''));

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_sort := v_sort + 1;
    v_qty := coalesce((v_item->>'quantity')::int, 0);
    if v_qty < 1 or v_qty > 99 then perform internal.fail('quantity_invalid'); end if;

    select * into v_product from public.products p where p.id = (v_item->>'product_id')::uuid;
    if not found or not v_product.is_active or v_product.archived_at is not null then
      perform internal.fail('product_unavailable', v_item->>'product_id');
    end if;
    if v_product.is_sold_out then perform internal.fail('product_sold_out', v_product.id::text); end if;
    select * into v_cat from public.categories c where c.id = v_product.category_id;

    -- varyant → taban fiyat
    v_variant := null;
    if exists (select 1 from public.product_variants pv where pv.product_id = v_product.id and pv.is_active) then
      if nullif(v_item->>'variant_id', '') is null then perform internal.fail('variant_required', v_product.id::text); end if;
      select * into v_variant from public.product_variants pv
      where pv.id = (v_item->>'variant_id')::uuid and pv.product_id = v_product.id and pv.is_active;
      if not found then perform internal.fail('variant_invalid', v_product.id::text); end if;
      v_unit := v_variant.price_cents;
    else
      if nullif(v_item->>'variant_id', '') is not null then perform internal.fail('variant_invalid', v_product.id::text); end if;
      if v_product.base_price_cents is null then perform internal.fail('product_unavailable', v_product.id::text); end if;
      v_unit := v_product.base_price_cents;
    end if;

    -- seçenekler: ürüne bağlı aktif gruplara ait, tekrar etmeyen aktif seçenekler
    v_opt_ids := coalesce(array(select jsonb_array_elements_text(coalesce(v_item->'option_ids', '[]'::jsonb))::uuid), '{}');
    if cardinality(v_opt_ids) <> (select count(distinct x) from unnest(v_opt_ids) x)
       or exists (select 1 from unnest(v_opt_ids) as u(oid)
                  where not exists (
                    select 1 from public.options o
                    join public.option_groups g on g.id = o.group_id and g.is_active
                    join public.product_option_groups pog on pog.group_id = g.id and pog.product_id = v_product.id
                    where o.id = u.oid and o.is_active)) then
      perform internal.fail('option_invalid', v_product.id::text);
    end if;
    for v_group in
      select g.id, g.min_select, g.max_select
      from public.product_option_groups pog
      join public.option_groups g on g.id = pog.group_id and g.is_active
      where pog.product_id = v_product.id
    loop
      select count(*), count(*) filter (where o.is_exclusive) into v_cnt, v_excl
      from public.options o where o.group_id = v_group.id and o.id = any (v_opt_ids);
      if v_cnt < v_group.min_select then perform internal.fail('option_group_min', v_group.id::text); end if;
      if v_cnt > v_group.max_select then perform internal.fail('option_group_max', v_group.id::text); end if;
      if v_excl > 0 and v_cnt > 1 then perform internal.fail('option_exclusive_conflict', v_group.id::text); end if;
    end loop;
    select coalesce(jsonb_agg(jsonb_build_object(
             'group_id', g.id, 'group_name_de', g.name_de, 'group_name_tr', g.name_tr,
             'ticket_format', g.ticket_format, 'group_sort', pog.sort,
             'option_id', o.id, 'name_de', o.name_de, 'name_tr', o.name_tr,
             'price_delta_cents', o.price_delta_cents) order by pog.sort, o.sort), '[]'::jsonb),
           coalesce(sum(o.price_delta_cents), 0)
    into v_options, v_delta
    from public.options o
    join public.option_groups g on g.id = o.group_id
    join public.product_option_groups pog on pog.group_id = g.id and pog.product_id = v_product.id
    where o.id = any (v_opt_ids);
    v_unit := v_unit + v_delta;

    -- çıkarılan malzemeler (ürüne bağlı olmalı)
    v_ing_ids := coalesce(array(select jsonb_array_elements_text(
                   coalesce(v_item->'removed_ingredient_ids', '[]'::jsonb))::uuid), '{}');
    if exists (select 1 from unnest(v_ing_ids) as u(iid)
               where not exists (select 1 from public.product_ingredients pi
                                 where pi.product_id = v_product.id and pi.ingredient_id = u.iid)) then
      perform internal.fail('ingredient_invalid', v_product.id::text);
    end if;
    select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'name_de', i.name_de, 'name_tr', i.name_tr)
                              order by pi.sort), '[]'::jsonb)
    into v_removed
    from public.product_ingredients pi join public.ingredients i on i.id = pi.ingredient_id
    where pi.product_id = v_product.id and pi.ingredient_id = any (v_ing_ids);

    if length(coalesce(v_item->>'note', '')) > 200 then perform internal.fail('note_too_long'); end if;

    insert into public.order_items (
      order_id, product_id, category_sort, is_beverage, product_code, product_name,
      variant_id, variant_name_de, variant_name_tr, unit_price_cents, quantity,
      removed_ingredients, selected_options, note, sort)
    values (
      p_order_id, v_product.id, v_cat.sort, v_cat.is_beverage, v_product.code, v_product.name,
      v_variant.id, v_variant.name_de, v_variant.name_tr, v_unit, v_qty,
      v_removed, v_options, nullif(btrim(v_item->>'note'), ''), v_sort);
    v_total := v_total + v_unit * v_qty;
  end loop;

  v_type := case when v_round = 1 then 'order' else 'addition' end;
  insert into public.print_jobs (type, order_id, session_id, payload, created_by)
  values (v_type, p_order_id, v_session.id, internal.build_order_payload(p_order_id, v_type::text), v_me.id);

  perform internal.audit('order_submit', 'order', p_order_id::text, jsonb_build_object(
    'table', v_table.name, 'order_no', v_order_no, 'round', v_round, 'total_cents', v_total));

  return jsonb_build_object('order_id', p_order_id, 'order_no', v_order_no, 'round_no', v_round,
                            'session_id', v_session.id, 'total_cents', v_total, 'duplicate', false);
end $$;

revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
revoke all on all functions in schema internal from public, anon, authenticated;
```

- [x] **Adım 4: Uygula ve testleri çalıştır**

Run: `npm run db:apply` → Expected: `→ 0003_submit_order.sql … ok`
Run: `npm run db:test -- orders` → Expected: PASS (6 senaryo + 6 geçersiz kalem vakası)
Testlerden biri takılırsa `systematic-debugging` uygula. Özellikle `option_groups_for_ticket` sıralamasına ve `v_variant := null` davranışına bak.

- [x] **Adım 5: Advisors + commit**

`get_advisors` temiz olmalı.
```bash
git add supabase/migrations/0003_submit_order.sql supabase/tests/helpers/fixtures.ts supabase/tests/orders.test.ts
git commit -m "feat(db): 0003 submit_order — idempotent sipariş, sunucu fiyatı, snapshot, fiş payload'u"
```

---

## Görev 6: Migration 0004 — sipariş yaşam döngüsü, masa, mesai, push, rapor RPC'leri

**Files:**
- Create: `supabase/migrations/0004_order_lifecycle.sql`
- Test: `supabase/tests/lifecycle.test.ts`

**Interfaces:**
- Consumes: Görev 4–5 fonksiyonları; `ensureFixtures`, `cleanupFixtureOrders`, `clientFor`
- Produces (hepsi `public`, `authenticated` çağırır, rol kontrolü içeride):

| Fonksiyon | Rol | Dönüş / davranış |
|---|---|---|
| `cancel_order_item(p_item_id uuid, p_reason text) → jsonb` | admin, waiter | `{order_id, order_status}`. Sipariş `in_kitchen`/`ready` ise STORNO işi ekler. Kalan aktif kalem yoksa sipariş `cancelled` olur |
| `mark_order_ready(p_order_id uuid) → void` | admin, kitchen | `in_kitchen` → `ready` |
| `undo_order_ready(p_order_id uuid) → void` | admin, kitchen | `ready` → `in_kitchen`, yalnız `ready_at` ≥ now() − 30 sn ise |
| `mark_order_served(p_order_id uuid) → void` | admin, waiter | `in_kitchen` ya da `ready` → `served` (*) |
| `close_table_session(p_session_id uuid) → void` | admin, waiter | `in_kitchen` varsa `open_orders_in_kitchen` hatası; `ready` olanlar → `served`; oturum `closed` |
| `move_table_session(p_session_id uuid, p_target_table_id uuid) → void` | admin, waiter | Hedef dolu ise `target_table_busy`; `table_move` işi ekler |
| `set_product_sold_out(p_product_id uuid, p_sold_out boolean) → void` | admin, kitchen | Tükendi anahtarı |
| `get_session_bill(p_session_id uuid) → jsonb` | admin, waiter | `{session_id, table, opened_at, lines[{product_code, product_name, variant_name_de, variant_name_tr, extras[], unit_price_cents, quantity, line_total_cents}], total_cents}` |
| `table_overview() → table(table_id, name, sort, session_id, opened_at, opened_by_name, total_cents bigint, orders_in_kitchen int, orders_ready int, failed_prints int)` | admin, waiter, kitchen | Aktif masalar + açık oturum özeti |
| `set_on_duty(p_on boolean) → jsonb` | admin, waiter | `{on_duty}` |
| `set_my_locale(p_locale text) → void` | tüm aktif personel | `tr` / `de` |
| `save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_ua text) → void` | admin, waiter, kitchen | Endpoint'e göre upsert; endpoint başka kullanıcıdaysa bu kullanıcıya geçer |
| `delete_push_subscription(p_endpoint text) → void` | kendi aboneliği | |
| `report_range(p_from date, p_to date) → jsonb` | admin | `{orders, items, value_cents, cancelled_items, cancelled_value_cents, by_waiter[], top_products[], by_hour[]}` |

Yardımcılar: `internal.build_storno_payload(p_order_id uuid, p_item_ids uuid[], p_reason text) → jsonb`.

(*) **Spec netleştirmesi:** `in_kitchen → served` geçişi de serbest bırakıldı. Sebep: yalnız içecek içeren siparişlerde mutfak HAZIR'a basmaz; bu geçiş olmazsa sipariş KDS'de takılı kalır ve masa kapatılamaz. Arayüzde bu geçiş, siparişin menüsünde ikincil bir eylem olarak durur.

- [x] **Adım 1: Testleri yaz (kırmızı)**

`supabase/tests/lifecycle.test.ts`:
```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { cleanupFixtureOrders, ensureFixtures, type Fixtures } from './helpers/fixtures';
import { sql } from './helpers/sql';
import { clientFor, ensureTestUsers } from './helpers/users';

let f: Fixtures;
let ids: Awaited<ReturnType<typeof ensureTestUsers>>;
let waiter: SupabaseClient, waiter2: SupabaseClient, kitchen: SupabaseClient, admin: SupabaseClient;

beforeAll(async () => {
  ids = await ensureTestUsers();
  f = await ensureFixtures();
  [waiter, waiter2, kitchen, admin] = await Promise.all(
    (['waiter', 'waiter2', 'kitchen', 'admin'] as const).map(clientFor));
});
beforeEach(cleanupFixtureOrders);
afterAll(cleanupFixtureOrders);

const item = (over: Record<string, unknown> = {}) => ({
  product_id: f.doenerId, variant_id: f.variantK, quantity: 1,
  option_ids: [f.sauceA, f.extraCheese], removed_ingredient_ids: [], ...over,
});
async function order(items = [item()], table = f.tableId) {
  const id = crypto.randomUUID();
  const { data, error } = await waiter.rpc('submit_order', { p_order_id: id, p_table_id: table, p_items: items });
  if (error) throw error;
  return data as { order_id: string; session_id: string; order_no: number };
}
const itemIds = (orderId: string) =>
  sql<{ id: string }>(`select id from public.order_items where order_id = '${orderId}' order by sort`);
const statusOf = async (orderId: string) =>
  (await sql<{ status: string }>(`select status from public.orders where id = '${orderId}'`))[0]!.status;

describe('kalem iptali', () => {
  it('sebep zorunlu, STORNO fişi basılır, son kalem iptalinde sipariş iptal olur', async () => {
    const o = await order([item(), { product_id: f.colaId, quantity: 2 }]);
    const [a, b] = await itemIds(o.order_id);
    expect((await waiter.rpc('cancel_order_item', { p_item_id: a!.id, p_reason: ' ' })).error?.message)
      .toBe('reason_required');
    const r1 = await waiter.rpc('cancel_order_item', { p_item_id: a!.id, p_reason: 'Gast hat storniert' });
    expect(r1.data).toMatchObject({ order_status: 'in_kitchen' });
    const [storno] = await sql<{ payload: any }>(
      `select payload from public.print_jobs where order_id = '${o.order_id}' and type = 'storno'`);
    expect(storno!.payload).toMatchObject({ kind: 'storno', reason: 'Gast hat storniert',
      items: [{ name: 'Test Drehspieß Sandwich', variant: 'Kalb' }] });
    expect((await waiter.rpc('cancel_order_item', { p_item_id: a!.id, p_reason: 'x' })).error?.message)
      .toBe('item_already_cancelled');
    await waiter.rpc('cancel_order_item', { p_item_id: b!.id, p_reason: 'Falsch eingegeben' });
    expect(await statusOf(o.order_id)).toBe('cancelled');
  });

  it('mutfak iptal edemez', async () => {
    const o = await order();
    const [a] = await itemIds(o.order_id);
    expect((await kitchen.rpc('cancel_order_item', { p_item_id: a!.id, p_reason: 'x' })).error?.message)
      .toBe('not_authorized');
  });
});

describe('hazır / geri al / teslim', () => {
  it('mutfak hazırlar; garson hazırlayamaz; 30 sn içinde geri alınır, sonra alınamaz', async () => {
    const o = await order();
    expect((await waiter.rpc('mark_order_ready', { p_order_id: o.order_id })).error?.message).toBe('not_authorized');
    expect((await kitchen.rpc('mark_order_ready', { p_order_id: o.order_id })).error).toBeNull();
    expect(await statusOf(o.order_id)).toBe('ready');
    expect((await kitchen.rpc('undo_order_ready', { p_order_id: o.order_id })).error).toBeNull();
    expect(await statusOf(o.order_id)).toBe('in_kitchen');
    await kitchen.rpc('mark_order_ready', { p_order_id: o.order_id });
    await sql(`update public.orders set ready_at = now() - interval '31 seconds' where id = '${o.order_id}'`);
    expect((await kitchen.rpc('undo_order_ready', { p_order_id: o.order_id })).error?.message)
      .toBe('undo_window_expired');
  });

  it('garson hem hazır hem mutfaktaki siparişi teslim edebilir (içecek siparişi)', async () => {
    const a = await order();
    const b = await order([{ product_id: f.colaId, quantity: 1 }]);
    await kitchen.rpc('mark_order_ready', { p_order_id: a.order_id });
    expect((await waiter.rpc('mark_order_served', { p_order_id: a.order_id })).error).toBeNull();
    expect((await waiter2.rpc('mark_order_served', { p_order_id: b.order_id })).error).toBeNull();
    expect([await statusOf(a.order_id), await statusOf(b.order_id)]).toEqual(['served', 'served']);
  });
});

describe('masa kapatma ve taşıma', () => {
  it('mutfakta sipariş varken kapanmaz; hazır olanlar kapanışta teslim sayılır', async () => {
    const o = await order();
    expect((await waiter.rpc('close_table_session', { p_session_id: o.session_id })).error?.message)
      .toBe('open_orders_in_kitchen');
    await kitchen.rpc('mark_order_ready', { p_order_id: o.order_id });
    expect((await waiter.rpc('close_table_session', { p_session_id: o.session_id })).error).toBeNull();
    expect(await statusOf(o.order_id)).toBe('served');
    const { data } = await waiter.rpc('table_overview');
    const row = (data as { name: string; session_id: string | null }[]).find((r) => r.name === 'Test-Tisch');
    expect(row?.session_id).toBeNull();
  });

  it('oturum boş masaya taşınır ve TISCHWECHSEL fişi basılır; dolu masaya taşınamaz', async () => {
    const o = await order();
    expect((await waiter.rpc('move_table_session', { p_session_id: o.session_id, p_target_table_id: f.table2Id }))
      .error).toBeNull();
    const [job] = await sql<{ payload: any }>(
      `select payload from public.print_jobs where session_id = '${o.session_id}' and type = 'table_move'`);
    expect(job!.payload).toMatchObject({ kind: 'table_move', fromTable: 'Test-Tisch', toTable: 'Test-Tisch-2',
      openOrderNos: [o.order_no] });
    const other = await order([item()], f.tableId);
    expect((await waiter.rpc('move_table_session', { p_session_id: other.session_id, p_target_table_id: f.table2Id }))
      .error?.message).toBe('target_table_busy');
  });
});

describe('tükendi, hesap özeti, masa özeti', () => {
  it('mutfak tükendi işaretler, garson işaretleyemez; tükenen ürün sipariş edilemez', async () => {
    expect((await waiter.rpc('set_product_sold_out', { p_product_id: f.doenerId, p_sold_out: true })).error?.message)
      .toBe('not_authorized');
    await kitchen.rpc('set_product_sold_out', { p_product_id: f.doenerId, p_sold_out: true });
    const r = await waiter.rpc('submit_order', { p_order_id: crypto.randomUUID(), p_table_id: f.tableId, p_items: [item()] });
    expect(r.error?.message).toBe('product_sold_out');
    await kitchen.rpc('set_product_sold_out', { p_product_id: f.doenerId, p_sold_out: false });
  });

  it('hesap özeti aynı kalemleri gruplar, iptalleri dışarıda bırakır', async () => {
    const o1 = await order([item(), { product_id: f.colaId, quantity: 2 }]);
    await order([item({ removed_ingredient_ids: [f.ingZwiebeln] })]); // ikinci tur, aynı fiyat → aynı satır
    const [, cola] = await itemIds(o1.order_id);
    await waiter.rpc('cancel_order_item', { p_item_id: cola!.id, p_reason: 'x' });
    const { data } = await waiter.rpc('get_session_bill', { p_session_id: o1.session_id });
    expect(data).toMatchObject({
      table: 'Test-Tisch', total_cents: 2 * 950,
      lines: [{ product_name: 'Test Drehspieß Sandwich', variant_name_de: 'Kalb', extras: ['Extra Weichkäse'],
                unit_price_cents: 950, quantity: 2, line_total_cents: 1900 }],
    });
  });

  it('masa özeti açık masanın toplamını ve sayaçlarını verir', async () => {
    const o = await order();
    await kitchen.rpc('mark_order_ready', { p_order_id: o.order_id });
    const { data } = await kitchen.rpc('table_overview');
    const row = (data as any[]).find((r) => r.name === 'Test-Tisch');
    expect(row).toMatchObject({ session_id: o.session_id, total_cents: 950, orders_in_kitchen: 0, orders_ready: 1 });
  });
});

describe('mesai, dil, push, rapor', () => {
  it('mesai açılır ve kapanır', async () => {
    expect((await waiter.rpc('set_on_duty', { p_on: true })).data).toEqual({ on_duty: true });
    const [p] = await sql<{ d: boolean }>(
      `select public.is_on_duty(on_duty_since) as d from public.profiles where id = '${ids.waiter}'`);
    expect(p!.d).toBe(true);
    expect((await waiter.rpc('set_on_duty', { p_on: false })).data).toEqual({ on_duty: false });
  });

  it('dil tercihi yalnız tr/de olur', async () => {
    expect((await waiter.rpc('set_my_locale', { p_locale: 'de' })).error).toBeNull();
    expect((await waiter.rpc('set_my_locale', { p_locale: 'en' })).error?.message).toBe('locale_invalid');
    await waiter.rpc('set_my_locale', { p_locale: 'tr' });
  });

  it('push aboneliği kaydedilir, cihaz el değiştirince yeni kullanıcıya geçer, silinir', async () => {
    const ep = `https://push.example/${crypto.randomUUID()}`;
    await waiter.rpc('save_push_subscription', { p_endpoint: ep, p_p256dh: 'k', p_auth: 'a', p_ua: 'test' });
    await waiter2.rpc('save_push_subscription', { p_endpoint: ep, p_p256dh: 'k2', p_auth: 'a2', p_ua: 'test' });
    const [row] = await sql<{ user_id: string }>(`select user_id from public.push_subscriptions where endpoint = '${ep}'`);
    expect(row!.user_id).toBe(ids.waiter2);
    await waiter2.rpc('delete_push_subscription', { p_endpoint: ep });
    expect(await sql(`select 1 from public.push_subscriptions where endpoint = '${ep}'`)).toEqual([]);
  });

  it('rapor yalnız admin', async () => {
    await order();
    const today = (await sql<{ d: string }>(`select public.business_date()::text as d`))[0]!.d;
    expect((await waiter.rpc('report_range', { p_from: today, p_to: today })).error?.message).toBe('not_authorized');
    const { data, error } = await admin.rpc('report_range', { p_from: today, p_to: today });
    expect(error).toBeNull();
    expect(data.orders).toBeGreaterThanOrEqual(1);
    expect(data.top_products.length).toBeGreaterThanOrEqual(1);
  });
});
```
Run: `npm run db:test -- lifecycle` → Expected: FAIL (fonksiyonlar yok)

- [x] **Adım 2: Migration'ı yaz**

`supabase/migrations/0004_order_lifecycle.sql`:
```sql
-- 0004 — sipariş yaşam döngüsü, masa, mesai, push, rapor (spec §3.5, §6, §8, §11.4)

create function internal.build_storno_payload(p_order_id uuid, p_item_ids uuid[], p_reason text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'kind', 'storno', 'header', s.ticket_header, 'footer', s.ticket_footer,
    'table', t.name, 'orderNo', o.order_no, 'refOrderNo', o.order_no, 'round', o.round_no,
    'createdAt', now(), 'reason', p_reason, 'note', null,
    'waiter', (select p.display_name from public.profiles p where p.id = auth.uid()),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'qty', i.quantity, 'code', i.product_code, 'name', i.product_name,
               'isBeverage', i.is_beverage, 'variant', i.variant_name_de,
               'without', (select coalesce(jsonb_agg(r->>'name_de'), '[]'::jsonb)
                           from jsonb_array_elements(i.removed_ingredients) r),
               'groups', internal.option_groups_for_ticket(i.selected_options),
               'note', i.note)
             order by i.is_beverage, i.category_sort, i.sort)
      from public.order_items i where i.id = any (p_item_ids)), '[]'::jsonb))
  from public.orders o
  join public.table_sessions ts on ts.id = o.session_id
  join public.dining_tables t on t.id = ts.table_id
  cross join public.settings s
  where o.id = p_order_id;
$$;

create function public.cancel_order_item(p_item_id uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_me public.profiles; v_item public.order_items; v_order public.orders; v_session public.table_sessions;
  v_status public.order_status;
begin
  v_me := internal.require_role('admin', 'waiter');
  if nullif(btrim(coalesce(p_reason, '')), '') is null then perform internal.fail('reason_required'); end if;
  if length(p_reason) > 200 then perform internal.fail('reason_too_long'); end if;
  select * into v_item from public.order_items i where i.id = p_item_id for update;
  if not found then perform internal.fail('item_not_found'); end if;
  if v_item.status = 'cancelled' then perform internal.fail('item_already_cancelled'); end if;
  select * into v_order from public.orders o where o.id = v_item.order_id for update;
  select * into v_session from public.table_sessions s where s.id = v_order.session_id;
  if v_session.status <> 'open' then perform internal.fail('session_closed'); end if;

  update public.order_items
     set status = 'cancelled', cancel_reason = btrim(p_reason), cancelled_by = v_me.id, cancelled_at = now()
   where id = p_item_id;

  if v_order.status in ('in_kitchen', 'ready') then
    insert into public.print_jobs (type, order_id, session_id, payload, created_by)
    values ('storno', v_order.id, v_order.session_id,
            internal.build_storno_payload(v_order.id, array[p_item_id], btrim(p_reason)), v_me.id);
  end if;

  if not exists (select 1 from public.order_items i where i.order_id = v_order.id and i.status = 'active') then
    update public.orders set status = 'cancelled', cancelled_at = now() where id = v_order.id;
  end if;
  select o.status into v_status from public.orders o where o.id = v_order.id;

  perform internal.audit('item_cancel', 'order_item', p_item_id::text,
    jsonb_build_object('order_no', v_order.order_no, 'product', v_item.product_name,
                       'qty', v_item.quantity, 'reason', btrim(p_reason)));
  return jsonb_build_object('order_id', v_order.id, 'order_status', v_status);
end $$;

create function public.mark_order_ready(p_order_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_me public.profiles; v_order public.orders;
begin
  v_me := internal.require_role('admin', 'kitchen');
  select * into v_order from public.orders o where o.id = p_order_id for update;
  if not found or v_order.status <> 'in_kitchen' then perform internal.fail('order_not_in_kitchen'); end if;
  update public.orders set status = 'ready', ready_at = now(), ready_by = v_me.id where id = p_order_id;
  perform internal.audit('order_ready', 'order', p_order_id::text, jsonb_build_object('order_no', v_order.order_no));
end $$;

create function public.undo_order_ready(p_order_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_order public.orders;
begin
  perform internal.require_role('admin', 'kitchen');
  select * into v_order from public.orders o where o.id = p_order_id for update;
  if not found or v_order.status <> 'ready' then perform internal.fail('order_not_ready'); end if;
  if v_order.ready_at < now() - interval '30 seconds' then perform internal.fail('undo_window_expired'); end if;
  update public.orders set status = 'in_kitchen', ready_at = null, ready_by = null where id = p_order_id;
  perform internal.audit('order_ready_undo', 'order', p_order_id::text, jsonb_build_object('order_no', v_order.order_no));
end $$;

create function public.mark_order_served(p_order_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_me public.profiles; v_order public.orders;
begin
  v_me := internal.require_role('admin', 'waiter');
  select * into v_order from public.orders o where o.id = p_order_id for update;
  if not found or v_order.status not in ('in_kitchen', 'ready') then perform internal.fail('order_not_open'); end if;
  update public.orders set status = 'served', served_at = now(), served_by = v_me.id where id = p_order_id;
  perform internal.audit('order_served', 'order', p_order_id::text, jsonb_build_object('order_no', v_order.order_no));
end $$;

create function public.close_table_session(p_session_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_me public.profiles; v_session public.table_sessions;
begin
  v_me := internal.require_role('admin', 'waiter');
  select * into v_session from public.table_sessions s where s.id = p_session_id for update;
  if not found or v_session.status <> 'open' then perform internal.fail('session_closed'); end if;
  if exists (select 1 from public.orders o where o.session_id = p_session_id and o.status = 'in_kitchen') then
    perform internal.fail('open_orders_in_kitchen');
  end if;
  update public.orders set status = 'served', served_at = now(), served_by = v_me.id
   where session_id = p_session_id and status = 'ready';
  update public.table_sessions set status = 'closed', closed_at = now(), closed_by = v_me.id where id = p_session_id;
  perform internal.audit('session_close', 'table_session', p_session_id::text, '{}'::jsonb);
end $$;

create function public.move_table_session(p_session_id uuid, p_target_table_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_me public.profiles; v_session public.table_sessions;
  v_from public.dining_tables; v_to public.dining_tables;
begin
  v_me := internal.require_role('admin', 'waiter');
  select * into v_session from public.table_sessions s where s.id = p_session_id for update;
  if not found or v_session.status <> 'open' then perform internal.fail('session_closed'); end if;
  select * into v_to from public.dining_tables t where t.id = p_target_table_id for update;
  if not found or not v_to.is_active then perform internal.fail('table_inactive'); end if;
  if exists (select 1 from public.table_sessions s where s.table_id = p_target_table_id and s.status = 'open') then
    perform internal.fail('target_table_busy');
  end if;
  select * into v_from from public.dining_tables t where t.id = v_session.table_id;
  update public.table_sessions set table_id = p_target_table_id where id = p_session_id;
  insert into public.print_jobs (type, session_id, payload, created_by)
  select 'table_move', p_session_id, jsonb_build_object(
           'kind', 'table_move', 'header', s.ticket_header, 'footer', s.ticket_footer,
           'table', v_to.name, 'fromTable', v_from.name, 'toTable', v_to.name,
           'openOrderNos', (select coalesce(jsonb_agg(o.order_no order by o.order_no), '[]'::jsonb)
                            from public.orders o
                            where o.session_id = p_session_id and o.status in ('in_kitchen', 'ready')),
           'createdAt', now(), 'waiter', v_me.display_name, 'items', '[]'::jsonb),
         v_me.id
  from public.settings s;
  perform internal.audit('session_move', 'table_session', p_session_id::text,
    jsonb_build_object('from', v_from.name, 'to', v_to.name));
end $$;

create function public.set_product_sold_out(p_product_id uuid, p_sold_out boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform internal.require_role('admin', 'kitchen');
  update public.products set is_sold_out = p_sold_out where id = p_product_id;
  if not found then perform internal.fail('product_not_found'); end if;
  perform internal.audit(case when p_sold_out then 'product_sold_out' else 'product_available' end,
                         'product', p_product_id::text, '{}'::jsonb);
end $$;

create function public.get_session_bill(p_session_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v jsonb;
begin
  perform internal.require_role('admin', 'waiter');
  with l as (
    select i.product_code, i.product_name, i.variant_name_de, i.variant_name_tr, i.unit_price_cents,
           (select coalesce(jsonb_agg(e->>'name_de' order by e->>'name_de'), '[]'::jsonb)
            from jsonb_array_elements(i.selected_options) e
            where (e->>'price_delta_cents')::int > 0) as extras,
           i.quantity, i.category_sort, i.sort, o.round_no
    from public.order_items i join public.orders o on o.id = i.order_id
    where o.session_id = p_session_id and i.status = 'active'
  ), g as (
    select product_code, product_name, variant_name_de, variant_name_tr, extras, unit_price_cents,
           sum(quantity)::int as quantity, min(category_sort) as cs, min(round_no * 1000 + sort) as fs
    from l group by product_code, product_name, variant_name_de, variant_name_tr, extras, unit_price_cents
  )
  select jsonb_build_object(
    'session_id', ts.id, 'table', t.name, 'opened_at', ts.opened_at,
    'lines', coalesce((select jsonb_agg(jsonb_build_object(
                 'product_code', g.product_code, 'product_name', g.product_name,
                 'variant_name_de', g.variant_name_de, 'variant_name_tr', g.variant_name_tr,
                 'extras', g.extras, 'unit_price_cents', g.unit_price_cents, 'quantity', g.quantity,
                 'line_total_cents', g.unit_price_cents * g.quantity) order by g.cs, g.fs) from g), '[]'::jsonb),
    'total_cents', coalesce((select sum(g.unit_price_cents * g.quantity) from g), 0))
  into v
  from public.table_sessions ts join public.dining_tables t on t.id = ts.table_id
  where ts.id = p_session_id;
  if v is null then perform internal.fail('session_not_found'); end if;
  return v;
end $$;

create function public.table_overview()
returns table (table_id uuid, name text, sort int, session_id uuid, opened_at timestamptz,
               opened_by_name text, total_cents bigint, orders_in_kitchen int, orders_ready int, failed_prints int)
language sql stable security definer set search_path = '' as $$
  select t.id, t.name, t.sort, s.id, s.opened_at, p.display_name,
         coalesce((select sum(i.unit_price_cents * i.quantity) from public.order_items i
                   join public.orders o on o.id = i.order_id
                   where o.session_id = s.id and i.status = 'active'), 0)::bigint,
         (select count(*) from public.orders o where o.session_id = s.id and o.status = 'in_kitchen')::int,
         (select count(*) from public.orders o where o.session_id = s.id and o.status = 'ready')::int,
         (select count(*) from public.print_jobs j where j.session_id = s.id and j.status = 'failed')::int
  from public.dining_tables t
  left join public.table_sessions s on s.table_id = t.id and s.status = 'open'
  left join public.profiles p on p.id = s.opened_by
  where t.is_active and public.has_role('admin', 'waiter', 'kitchen')
  order by t.sort, t.name;
$$;

create function public.set_on_duty(p_on boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_me public.profiles;
begin
  v_me := internal.require_role('admin', 'waiter');
  update public.profiles set on_duty_since = case when p_on then now() end where id = v_me.id;
  perform internal.audit(case when p_on then 'duty_on' else 'duty_off' end, 'profile', v_me.id::text, '{}'::jsonb);
  return jsonb_build_object('on_duty', p_on);
end $$;

create function public.set_my_locale(p_locale text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_active_staff() then perform internal.fail('not_authorized'); end if;
  if p_locale not in ('tr', 'de') then perform internal.fail('locale_invalid'); end if;
  update public.profiles set locale = p_locale where id = auth.uid();
end $$;

create function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_ua text)
returns void
language plpgsql security definer set search_path = '' as $$
declare v_me public.profiles;
begin
  v_me := internal.require_role('admin', 'waiter', 'kitchen');
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values (v_me.id, p_endpoint, p_p256dh, p_auth, left(p_ua, 300))
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
        user_agent = excluded.user_agent, created_at = now();
end $$;

create function public.delete_push_subscription(p_endpoint text) returns void
language sql security definer set search_path = '' as $$
  delete from public.push_subscriptions where endpoint = p_endpoint and user_id = auth.uid();
$$;

create function public.report_range(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v jsonb;
begin
  perform internal.require_role('admin');
  with o as (select * from public.orders where business_date between p_from and p_to),
       i as (select i.*, o.waiter_id, o.created_at as order_created
             from public.order_items i join o on o.id = i.order_id)
  select jsonb_build_object(
    'from', p_from, 'to', p_to,
    'orders', (select count(*) from o where o.status <> 'cancelled'),
    'items', (select coalesce(sum(quantity), 0) from i where status = 'active'),
    'value_cents', (select coalesce(sum(unit_price_cents * quantity), 0) from i where status = 'active'),
    'cancelled_items', (select coalesce(sum(quantity), 0) from i where status = 'cancelled'),
    'cancelled_value_cents', (select coalesce(sum(unit_price_cents * quantity), 0) from i where status = 'cancelled'),
    'by_waiter', (select coalesce(jsonb_agg(x order by x.value_cents desc), '[]'::jsonb) from (
        select p.display_name, count(distinct i.order_id) as orders,
               sum(i.unit_price_cents * i.quantity) as value_cents
        from i join public.profiles p on p.id = i.waiter_id
        where i.status = 'active' group by p.display_name) x),
    'top_products', (select coalesce(jsonb_agg(x order by x.qty desc), '[]'::jsonb) from (
        select product_code, product_name, sum(quantity) as qty, sum(unit_price_cents * quantity) as value_cents
        from i where status = 'active' group by product_code, product_name
        order by 3 desc limit 10) x),
    'by_hour', (select coalesce(jsonb_agg(x order by x.hour), '[]'::jsonb) from (
        select extract(hour from (order_created at time zone 'Europe/Berlin'))::int as hour,
               count(distinct order_id) as orders
        from i group by 1) x))
  into v;
  return v;
end $$;

revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
revoke all on all functions in schema internal from public, anon, authenticated;
```

- [x] **Adım 3: Uygula, testleri çalıştır**

Run: `npm run db:apply` → Expected: `→ 0004_order_lifecycle.sql … ok`
Run: `npm run db:test` → Expected: schema + rls + orders + lifecycle PASS

- [x] **Adım 4: Advisors + commit**

`get_advisors` temiz.
```bash
git add supabase/migrations/0004_order_lifecycle.sql supabase/tests/lifecycle.test.ts
git commit -m "feat(db): 0004 sipariş yaşam döngüsü — iptal/STORNO, hazır/geri al, teslim, masa kapat/taşı, hesap özeti, mesai, push, rapor"
```

---

## Görev 7: Migration 0005 — fiş kuyruğu, Realtime broadcast, denetim trigger'ları

**Files:**
- Create: `supabase/migrations/0005_print_queue_realtime.sql`
- Modify: `supabase/vitest.config.ts` (canlı ortam koruması)
- Test: `supabase/tests/print.test.ts`, `supabase/tests/realtime.test.ts`

**Interfaces:**
- Consumes: Görev 4–6
- Produces:

| Fonksiyon | Rol | Davranış |
|---|---|---|
| `reprint_order(p_order_id uuid) → void` | admin, waiter, kitchen | Güncel durumdan `build_order_payload(id, 'reprint')` + `reprintOf` ile `reprint` işi. İptal edilen kalemler çıkmaz, taşınmışsa yeni masa yazılır |
| `retry_print_job(p_job_id uuid) → void` | admin, waiter, kitchen | `failed` → `pending`, `attempts = 0` |
| `enqueue_test_print() → void` | admin | `test` işi: ayar özeti + karakter satırı + örnek kalemler |
| `claim_print_job(p_agent_id text) → setof print_jobs` | printer | 0 ya da 1 satır. `pending` ve vakti gelmiş **veya** 60 sn'den uzun süredir `printing` olan en eski iş; `FOR UPDATE SKIP LOCKED` |
| `complete_print_job(p_job_id uuid, p_ok boolean, p_error text default null, p_agent_id text default null) → void` (R49/R52; iş `printing` değilse ya da `p_agent_id` verilip `claimed_by` ile eşleşmezse `job_not_printing`) | printer | Başarılı → `printed`. Başarısız → `attempts + 1`, yeniden deneme 5/15/30/60/120 sn; 6. hatada `failed` |
| `agent_heartbeat(p_agent_id text, p_version text, p_host text, p_reachable boolean, p_state jsonb, p_error text) → void` | printer | `printer_status` kaydını günceller |

- Broadcast konuları (private):
  - `orders` ← orders, order_items, table_sessions, print_jobs
  - `print-jobs` ← print_jobs
  - `menu` ← menü tabloları + dining_tables
  - `printer-status` ← yalnızca anlamlı değişikliklerde (`last_seen_at` tek başına yayın **yapmaz**; istemciler `printer_status`'u 60 sn'de bir okuyup "90 sn sinyal yok" kontrolünü kendi yapar)
  - `settings` ← settings
- `internal.audit_row()` trigger'ı: menü, masa ve ayar tablolarında **kullanıcı** değişikliklerini (`auth.uid()` dolu) `audit_log`'a yazar. Seed/migration gibi sistem işlemleri loglanmaz.

**Ajan için not (Plan 3):** Ajan, kuyrukta iş varken yazıcıya ulaşamıyorsa (ya da kağıt bitmiş/kapak açıksa) **işi sahiplenmez**. Böylece deneme hakları harcanmaz ve sorun giderilince fiş kendiliğinden basılır. `complete_print_job(false)` yalnızca sahiplenmeden sonra ortaya çıkan hatalar içindir.

- [x] **Adım 1: Canlı ortam korumasını ekle**

Tek bir Supabase projesi var; yayından sonra DB testleri mutfakta gerçek test fişi bastırır. `supabase/vitest.config.ts` içinde `test` bloğuna ekle:
```ts
    setupFiles: ['supabase/tests/helpers/guard.ts'],
```
`supabase/tests/helpers/guard.ts`:
```ts
if (process.env.DB_TESTS_ALLOWED !== '1') {
  throw new Error(
    'DB testleri kapalı. Geliştirmede .env içine DB_TESTS_ALLOWED=1 yaz. Yayından sonra (M8) bu değer 0 olur; ' +
      'testler canlı restorana test fişi bastırır.');
}
```
`.env` dosyasına `DB_TESTS_ALLOWED=1`, `.env.example` dosyasına `DB_TESTS_ALLOWED=` ekle.

- [x] **Adım 2: Fiş kuyruğu testlerini yaz (kırmızı)**

`supabase/tests/print.test.ts`:
```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { cleanupFixtureOrders, ensureFixtures, type Fixtures } from './helpers/fixtures';
import { sql } from './helpers/sql';
import { clientFor, ensureTestUsers } from './helpers/users';

let f: Fixtures;
let waiter: SupabaseClient, kitchen: SupabaseClient, admin: SupabaseClient, printer: SupabaseClient;
const TEST_JOBS = `created_by in (select id from public.profiles where username like 'test-%')`;

beforeAll(async () => {
  await ensureTestUsers();
  f = await ensureFixtures();
  [waiter, kitchen, admin, printer] = await Promise.all(
    (['waiter', 'kitchen', 'admin', 'printer'] as const).map(clientFor));
  const foreign = await sql(`select 1 from public.print_jobs
                             where status in ('pending','printing') and not (${TEST_JOBS})`);
  if (foreign.length) throw new Error('Kuyrukta test dışı iş var — ajanı durdur, kuyruğu kontrol et.');
});
beforeEach(async () => {
  await cleanupFixtureOrders();
  await sql(`delete from public.print_jobs where ${TEST_JOBS}`);
});
afterAll(async () => {
  await cleanupFixtureOrders();
  await sql(`delete from public.print_jobs where ${TEST_JOBS}`);
});

async function orderWithJob() {
  const id = crypto.randomUUID();
  const { error } = await waiter.rpc('submit_order', {
    p_order_id: id, p_table_id: f.tableId,
    p_items: [{ product_id: f.colaId, quantity: 1 }],
  });
  if (error) throw error;
  return id;
}
const claim = async () => {
  const { data, error } = await printer.rpc('claim_print_job', { p_agent_id: 'test-agent' });
  if (error) throw error;
  return data as { id: string; type: string; payload: any; attempts: number }[];
};

describe('fiş kuyruğu', () => {
  it('ajan işi sahiplenir, ikinci sahiplenme boş döner, başarıyla kapatır', async () => {
    const orderId = await orderWithJob();
    const [job] = await claim();
    expect(job).toMatchObject({ type: 'order' });
    expect(await claim()).toEqual([]);
    expect((await printer.rpc('complete_print_job', { p_job_id: job!.id, p_ok: true })).error).toBeNull();
    const [row] = await sql<{ status: string }>(`select status from public.print_jobs where order_id = '${orderId}'`);
    expect(row!.status).toBe('printed');
  });

  it('başarısız deneme geri çekilir; 6. hatada failed olur; tekrar dene kuyruğa alır', async () => {
    await orderWithJob();
    let [job] = await claim();
    for (let i = 1; i <= 6; i++) {
      await printer.rpc('complete_print_job', { p_job_id: job!.id, p_ok: false, p_error: `err ${i}` });
      const [r] = await sql<{ status: string; attempts: number; wait: number }>(`
        select status, attempts, extract(epoch from next_attempt_at - now())::int as wait
        from public.print_jobs where id = '${job!.id}'`);
      if (i < 6) {
        expect(r).toMatchObject({ status: 'pending', attempts: i });
        expect(r!.wait).toBeGreaterThan([5, 15, 30, 60, 120][i - 1]! - 3);
        await sql(`update public.print_jobs set next_attempt_at = now() where id = '${job!.id}'`);
        [job] = await claim();
      } else {
        expect(r).toMatchObject({ status: 'failed', attempts: 6 });
      }
    }
    expect((await kitchen.rpc('retry_print_job', { p_job_id: job!.id })).error).toBeNull();
    expect((await claim())[0]).toMatchObject({ id: job!.id, attempts: 0 });
  });

  it('60 sn takılı kalan printing işi yeniden sahiplenilir', async () => {
    await orderWithJob();
    const [job] = await claim();
    await sql(`update public.print_jobs set claimed_at = now() - interval '61 seconds' where id = '${job!.id}'`);
    expect((await claim())[0]?.id).toBe(job!.id);
  });

  it('yalnız printer sahiplenir; tekrar baskı güncel durumdan üretilir; test fişi yalnız admin', async () => {
    const orderId = await orderWithJob();
    expect((await waiter.rpc('claim_print_job', { p_agent_id: 'x' })).error?.message).toBe('not_authorized');
    expect((await waiter.rpc('reprint_order', { p_order_id: orderId })).error).toBeNull();
    const [re] = await sql<{ payload: any }>(
      `select payload from public.print_jobs where order_id = '${orderId}' and type = 'reprint'`);
    expect(re!.payload).toMatchObject({ kind: 'reprint', reprintOf: 'order', table: 'Test-Tisch' });
    expect((await waiter.rpc('enqueue_test_print')).error?.message).toBe('not_authorized');
    expect((await admin.rpc('enqueue_test_print')).error).toBeNull();
    const [t] = await sql<{ payload: any }>(`select payload from public.print_jobs where type = 'test' and ${TEST_JOBS}`);
    expect(t!.payload).toMatchObject({ kind: 'test' });
    expect(t!.payload.sampleLine).toContain('Şş Ğğ İı');
  });

  it('heartbeat printer_status kaydını günceller, personel okuyabilir', async () => {
    await printer.rpc('agent_heartbeat', { p_agent_id: 'test-agent', p_version: '0.0.0', p_host: 'test',
      p_reachable: true, p_state: { paper_end: false }, p_error: null });
    const { data } = await waiter.from('printer_status').select('agent_id, printer_reachable').single();
    expect(data).toEqual({ agent_id: 'test-agent', printer_reachable: true });
  });
});
```

- [x] **Adım 3: Realtime testlerini yaz (kırmızı)**

`supabase/tests/realtime.test.ts`:
```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cleanupFixtureOrders, ensureFixtures, type Fixtures } from './helpers/fixtures';
import { clientFor, ensureTestUsers } from './helpers/users';

let f: Fixtures;
let waiter: SupabaseClient, kitchen: SupabaseClient, printer: SupabaseClient;

beforeAll(async () => {
  await ensureTestUsers();
  f = await ensureFixtures();
  [waiter, kitchen, printer] = await Promise.all((['waiter', 'kitchen', 'printer'] as const).map(clientFor));
});
afterAll(async () => {
  await cleanupFixtureOrders();
  for (const c of [waiter, kitchen, printer]) await c.removeAllChannels();
});

async function subscribe(client: SupabaseClient, topic: string, sink: unknown[]): Promise<string> {
  await client.realtime.setAuth();
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve('TIMEOUT'), 10_000);
    client
      .channel(topic, { config: { private: true } })
      .on('broadcast', { event: '*' }, (msg) => sink.push(msg))
      .subscribe((status) => {
        if (status === 'SUBSCRIBED' || status === 'CHANNEL_ERROR') { clearTimeout(timer); resolve(status); }
      });
  });
}
const waitFor = async (cond: () => boolean, ms = 10_000) => {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > ms) throw new Error('olay gelmedi');
    await new Promise((r) => setTimeout(r, 100));
  }
};

describe('Realtime broadcast', () => {
  it('garson orders konusunda sipariş olayını alır', async () => {
    const events: unknown[] = [];
    expect(await subscribe(waiter, 'orders', events)).toBe('SUBSCRIBED');
    await waiter.rpc('submit_order', { p_order_id: crypto.randomUUID(), p_table_id: f.tableId,
      p_items: [{ product_id: f.colaId, quantity: 1 }] });
    await waitFor(() => events.some((e) => JSON.stringify(e).includes('"table":"orders"')));
  });

  it('mutfak menu konusunda tükendi değişikliğini alır', async () => {
    const events: unknown[] = [];
    expect(await subscribe(kitchen, 'menu', events)).toBe('SUBSCRIBED');
    await kitchen.rpc('set_product_sold_out', { p_product_id: f.colaId, p_sold_out: true });
    await kitchen.rpc('set_product_sold_out', { p_product_id: f.colaId, p_sold_out: false });
    await waitFor(() => events.some((e) => JSON.stringify(e).includes('"table":"products"')));
  });

  it('printer orders konusuna abone olamaz', async () => {
    expect(await subscribe(printer, 'orders', [])).toBe('CHANNEL_ERROR');
  });
});
```
Run: `npm run db:test -- print realtime` → Expected: FAIL (fonksiyonlar ve trigger'lar yok)

- [x] **Adım 4: Migration'ı yaz**

`supabase/migrations/0005_print_queue_realtime.sql`:
```sql
-- 0005 — fiş kuyruğu RPC'leri, Realtime broadcast, denetim trigger'ları (spec §6, §10, §11.1)

create function public.reprint_order(p_order_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_me public.profiles; v_first public.print_jobs;
begin
  v_me := internal.require_role('admin', 'waiter', 'kitchen');
  select * into v_first from public.print_jobs j
  where j.order_id = p_order_id and j.type in ('order', 'addition') order by j.created_at limit 1;
  if not found then perform internal.fail('order_not_found'); end if;
  insert into public.print_jobs (type, order_id, session_id, payload, created_by)
  values ('reprint', p_order_id, v_first.session_id,
          internal.build_order_payload(p_order_id, 'reprint') || jsonb_build_object('reprintOf', v_first.type),
          v_me.id);
  perform internal.audit('order_reprint', 'order', p_order_id::text, '{}'::jsonb);
end $$;

create function public.retry_print_job(p_job_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform internal.require_role('admin', 'waiter', 'kitchen');
  update public.print_jobs
     set status = 'pending', attempts = 0, next_attempt_at = now(), last_error = null, claimed_by = null
   where id = p_job_id and status = 'failed';
  if not found then perform internal.fail('job_not_failed'); end if;
end $$;

create function public.enqueue_test_print() returns void
language plpgsql security definer set search_path = '' as $$
declare v_me public.profiles;
begin
  v_me := internal.require_role('admin');
  insert into public.print_jobs (type, payload, created_by)
  select 'test', jsonb_build_object(
      'kind', 'test', 'header', s.ticket_header, 'footer', s.ticket_footer, 'table', 'Tisch 12',
      'orderNo', 0, 'round', 1, 'createdAt', now(), 'waiter', v_me.display_name, 'note', 'Testdruck',
      'settings', jsonb_build_object('host', s.printer_host, 'port', s.printer_port,
                                     'codepage', s.printer_codepage, 'codepageNumber', s.printer_codepage_number,
                                     'transliterate', s.printer_transliterate),
      'sampleLine', 'ÄÖÜ äöü ß · Şş Ğğ İı Çç · 0123456789 · #*-+',
      'items', jsonb_build_array(
        jsonb_build_object('qty', 2, 'code', '05', 'name', 'Drehspieß Sandwich', 'isBeverage', false,
          'variant', 'Kalb', 'without', jsonb_build_array('Zwiebeln', 'Tomaten'),
          'groups', jsonb_build_array(
            jsonb_build_object('label', 'Soße', 'format', 'label_values', 'values', jsonb_build_array('Knoblauch', 'Kräuter')),
            jsonb_build_object('label', 'Schärfe', 'format', 'values_only', 'values', jsonb_build_array('scharf (Chili)')),
            jsonb_build_object('label', 'Extras', 'format', 'plus_each', 'values', jsonb_build_array('Extra Weichkäse'))),
          'note', 'Soße extra'),
        jsonb_build_object('qty', 1, 'code', '59', 'name', 'Kuzu Şiş', 'isBeverage', false, 'variant', null,
          'without', '[]'::jsonb,
          'groups', jsonb_build_array(jsonb_build_object('label', 'Beilage', 'format', 'values_only',
                                                         'values', jsonb_build_array('Reis'))), 'note', null),
        jsonb_build_object('qty', 3, 'code', null, 'name', 'Cola 0,33 l', 'isBeverage', true, 'variant', null,
          'without', '[]'::jsonb, 'groups', '[]'::jsonb, 'note', null))),
    v_me.id
  from public.settings s;
end $$;

create function public.claim_print_job(p_agent_id text) returns setof public.print_jobs
language plpgsql security definer set search_path = '' as $$
begin
  perform internal.require_role('printer');
  return query
  with next_job as (
    select j.id from public.print_jobs j
    where (j.status = 'pending' and j.next_attempt_at <= now())
       or (j.status = 'printing' and j.claimed_at < now() - interval '60 seconds')
    order by j.created_at
    for update skip locked
    limit 1
  ), claimed as (
    update public.print_jobs j
       set status = 'printing', claimed_by = p_agent_id, claimed_at = now()
      from next_job
     where j.id = next_job.id
    returning j.*
  )
  select * from claimed;
end $$;

create function public.complete_print_job(p_job_id uuid, p_ok boolean, p_error text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare v public.print_jobs; v_backoff int[] := array[5, 15, 30, 60, 120];
begin
  perform internal.require_role('printer');
  select * into v from public.print_jobs j where j.id = p_job_id for update;
  if not found then perform internal.fail('job_not_found'); end if;
  if p_ok then
    update public.print_jobs set status = 'printed', printed_at = now(), last_error = null where id = p_job_id;
    update public.printer_status set last_printed_at = now() where id = 'main';
  elsif v.attempts + 1 >= 6 then
    update public.print_jobs set status = 'failed', attempts = v.attempts + 1, last_error = left(p_error, 500)
     where id = p_job_id;
  else
    update public.print_jobs
       set status = 'pending', attempts = v.attempts + 1, last_error = left(p_error, 500),
           next_attempt_at = now() + make_interval(secs => v_backoff[v.attempts + 1])
     where id = p_job_id;
  end if;
end $$;

create function public.agent_heartbeat(p_agent_id text, p_version text, p_host text,
                                       p_reachable boolean, p_state jsonb, p_error text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform internal.require_role('printer');
  update public.printer_status
     set agent_id = p_agent_id, agent_version = p_version, host = p_host, last_seen_at = now(),
         printer_reachable = p_reachable, printer_state = coalesce(p_state, '{}'::jsonb), last_error = p_error
   where id = 'main';
end $$;

-- ---------- Realtime: Broadcast from Database ----------
create function internal.broadcast_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform realtime.broadcast_changes(tg_argv[0], tg_op, tg_op, tg_table_name, tg_table_schema, new, old);
  return null;
end $$;

create trigger orders_bc         after insert or update or delete on public.orders
  for each row execute function internal.broadcast_change('orders');
create trigger order_items_bc    after insert or update or delete on public.order_items
  for each row execute function internal.broadcast_change('orders');
create trigger table_sessions_bc after insert or update or delete on public.table_sessions
  for each row execute function internal.broadcast_change('orders');
create trigger print_jobs_bc_orders after insert or update on public.print_jobs
  for each row execute function internal.broadcast_change('orders');
create trigger print_jobs_bc     after insert or update on public.print_jobs
  for each row execute function internal.broadcast_change('print-jobs');
create trigger settings_bc       after update on public.settings
  for each row execute function internal.broadcast_change('settings');
create trigger printer_status_bc after update on public.printer_status
  for each row when (
    old.printer_reachable is distinct from new.printer_reachable
    or old.printer_state  is distinct from new.printer_state
    or old.last_error     is distinct from new.last_error
    or old.agent_id       is distinct from new.agent_id
    or old.last_printed_at is distinct from new.last_printed_at)
  execute function internal.broadcast_change('printer-status');

do $$
declare t text;
begin
  foreach t in array array['categories','products','product_variants','ingredients','product_ingredients',
                           'option_groups','options','product_option_groups','dining_tables'] loop
    execute format('create trigger %1$s_bc after insert or update or delete on public.%1$I
                    for each row execute function internal.broadcast_change(''menu'')', t);
  end loop;
end $$;

create policy staff_receive_broadcasts on realtime.messages for select to authenticated
using (
  realtime.messages.extension = 'broadcast' and (
       ((select realtime.topic()) in ('orders', 'menu') and (select public.has_role('admin', 'waiter', 'kitchen')))
    or ((select realtime.topic()) = 'print-jobs'        and (select public.has_role('admin', 'printer')))
    or ((select realtime.topic()) in ('printer-status', 'settings') and (select public.is_active_staff()))
  )
);

-- ---------- denetim: kullanıcı kaynaklı menü/masa/ayar değişiklikleri ----------
create function internal.audit_row() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_row jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
begin
  if auth.uid() is null then return null; end if;   -- seed / migration loglanmaz
  insert into public.audit_log (actor_id, action, entity, entity_id, details)
  values (auth.uid(), lower(tg_op), tg_table_name, coalesce(v_row->>'id', v_row->>'product_id', ''),
          case tg_op when 'UPDATE' then jsonb_build_object('old', to_jsonb(old), 'new', to_jsonb(new))
                     when 'DELETE' then jsonb_build_object('old', to_jsonb(old))
                     else jsonb_build_object('new', to_jsonb(new)) end);
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['categories','products','product_variants','ingredients','product_ingredients',
                           'option_groups','options','product_option_groups','dining_tables','settings'] loop
    execute format('create trigger %1$s_audit after insert or update or delete on public.%1$I
                    for each row execute function internal.audit_row()', t);
  end loop;
end $$;

revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
revoke all on all functions in schema internal from public, anon, authenticated;
```

- [x] **Adım 5: Uygula ve tüm DB testlerini çalıştır**

Run: `npm run db:apply` → Expected: `→ 0005_print_queue_realtime.sql … ok`
Run: `npm run db:test` → Expected: schema, rls, orders, lifecycle, print, realtime PASS

Realtime testi `TIMEOUT` verirse:
1. Projede Realtime'ın açık olduğunu kontrol et.
2. `realtime.messages` politikasını kontrol et.
3. `setAuth()` çağrısının yapıldığını kontrol et.
4. Hâlâ çözülmediyse `supabase` skill'indeki "Broadcast from Database" bölümünü uygula.

- [x] **Adım 6: Advisors + commit**

`get_advisors` (security + performance) temiz olmalı.
```bash
git add supabase/migrations/0005_print_queue_realtime.sql supabase/tests/print.test.ts supabase/tests/realtime.test.ts supabase/tests/helpers/guard.ts supabase/vitest.config.ts .env.example
git commit -m "feat(db): 0005 fiş kuyruğu (claim/complete/retry/reprint/test), Realtime broadcast ve denetim trigger'ları"
```

---

## Görev 8: Menü seed'i (107 ürün), masalar, ayarlar + TypeScript tipleri

**Files:**
- Create: `supabase/migrations/0006_seed_keys.sql`
- Create: `supabase/seed/menu-source.ts`, `supabase/seed/build-seed.ts`
- Create (üretilir, commit edilir): `supabase/seed/seed.sql`, `packages/shared/src/database.types.ts`
- Modify: `package.json` (`db:seed`, `db:types` script'leri; `tsx` bağımlılığı)
- Test: `supabase/tests/seed.test.ts`

**Interfaces:**
- Consumes: 0001 tabloları (slug doğal anahtarları)
- Produces:
  - Seed slug kuralları:
    - Kategori: `c-<ad>` (ör. `c-drehspiess`)
    - Ürün: kodluysa `p-<kod küçük harf>` (`p-05`, `p-71a`, `p-m1`), kodsuzsa `p-<kebab ad>` (`p-cola-0-33-l`, `p-baklava`)
    - Malzeme: `docs/menu/ramos-menu-data.md` §2'deki anahtar (`zwiebeln`, `rotkohl` …)
    - Grup: `g-<anahtar>` (`g-sosse`, `g-pizza-mix` …)
  - `npm run db:seed` → idempotent. Admin'in sonradan yaptığı eklemeleri silmez, seed alanlarını günceller. `printer_host` alanına dokunmaz.
  - `npm run db:types` → `packages/shared/src/database.types.ts`
  - Seed **`image_path` alanına dokunmaz**: tüm ürünler görselsiz başlar. Görseller sonradan admin panelden eklenir ve seed tekrar çalışınca silinmez (upsert'in `do update set` listesinde `image_path` yoktur).

- [x] **Adım 1: Seed testini yaz (kırmızı)**

`supabase/tests/seed.test.ts`:
```ts
import { execSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { sql } from './helpers/sql';

const NOT_TEST = `slug not like 'test-%'`;
const count = async (q: string) => Number((await sql<{ n: number }>(q))[0]!.n);

describe('menü seed', () => {
  it('sayılar menüyle birebir', async () => {
    expect(await count(`select count(*) n from public.categories where ${NOT_TEST}`)).toBe(16);
    expect(await count(`select count(*) n from public.products where ${NOT_TEST}`)).toBe(107);
    expect(await count(`select count(*) n from public.ingredients where ${NOT_TEST}`)).toBe(31);
    expect(await count(`select count(*) n from public.option_groups where ${NOT_TEST}`)).toBe(9);
    expect(await count(`select count(*) n from public.options o join public.option_groups g on g.id = o.group_id
                        where g.${NOT_TEST}`)).toBe(50);
    expect(await count(`select count(*) n from public.dining_tables where name ~ '^Tisch [0-9]+$'`))
      .toBe(Number(process.env.SEED_TABLE_COUNT ?? 12));
  });

  it('fiyat sağlama toplamları (menüden hesaplandı)', async () => {
    const [base] = await sql<{ n: number; s: number }>(`
      select count(*) n, sum(base_price_cents) s from public.products
      where ${NOT_TEST} and base_price_cents is not null`);
    expect(base).toEqual({ n: 93, s: 95150 });
    const [variants] = await sql<{ n: number; s: number }>(`
      select count(*) n, sum(v.price_cents) s from public.product_variants v
      join public.products p on p.id = v.product_id where p.${NOT_TEST}`);
    expect(variants).toEqual({ n: 28, s: 25250 });
  });

  it('kritik ürünler doğru kurulmuş', async () => {
    const product = async (slug: string) => (await sql<any>(`
      select p.code, p.base_price_cents,
        (select jsonb_agg(jsonb_build_object('de', v.name_de, 'c', v.price_cents, 'd', v.is_default) order by v.sort)
           from public.product_variants v where v.product_id = p.id) variants,
        (select jsonb_agg(i.slug order by pi.sort) from public.product_ingredients pi
           join public.ingredients i on i.id = pi.ingredient_id where pi.product_id = p.id) ings,
        (select jsonb_agg(g.slug order by pog.sort) from public.product_option_groups pog
           join public.option_groups g on g.id = pog.group_id where pog.product_id = p.id) groups
      from public.products p where p.slug = '${slug}'`))[0];

    expect(await product('p-05')).toMatchObject({
      variants: [{ de: 'Hähnchen', c: 750, d: true }, { de: 'Kalb', c: 850, d: false }],
      ings: ['salat', 'tomaten', 'gurken', 'zwiebeln', 'rotkohl'],
      groups: ['g-sosse', 'g-scharf', 'g-extra-doener'],
    });
    expect((await product('p-08')).groups).toEqual(['g-beilage', 'g-sosse', 'g-scharf', 'g-extra-doener']);
    expect(await product('p-10')).toMatchObject({ base_price_cents: 1500, ings: ['tomatensosse', 'joghurt', 'butter'] });
    expect(await product('p-47')).toMatchObject({ base_price_cents: 1150, groups: ['g-pizza-extra', 'g-pizza-mix'] });
    expect((await product('p-m3')).variants).toMatchObject([{ c: 1200 }, { c: 1350 }]);
    expect((await product('p-m3')).groups).toContain('g-menu-getraenk');
    expect((await product('p-18')).variants).toMatchObject([{ de: 'klein', c: 350 }, { de: 'groß', c: 450 }]);
    expect((await product('p-77')).groups).toContain('g-lahmacun-rolle');
    const [mix] = await sql<any>(`select min_select, max_select from public.option_groups where slug = 'g-pizza-mix'`);
    expect(mix).toEqual({ min_select: 5, max_select: 5 });
    const [ohne] = await sql<any>(`select o.is_exclusive from public.options o join public.option_groups g
                                   on g.id = o.group_id where g.slug = 'g-sosse' and o.name_de = 'ohne Soße'`);
    expect(ohne.is_exclusive).toBe(true);
    const [bev] = await sql<any>(`select is_beverage from public.categories where slug = 'c-kalte-getraenke'`);
    expect(bev.is_beverage).toBe(true);
  });

  it('ayar listeleri dolu, yazıcı IP korunur', async () => {
    const [s] = await sql<any>(`select jsonb_array_length(quick_notes) q, jsonb_array_length(cancel_reasons) c,
                                       jsonb_array_length(allergen_legend) a from public.settings`);
    expect(s).toEqual({ q: 5, c: 4, a: 27 });
  });

  it('seed idempotent: ikinci çalıştırma sayıları değiştirmez', async () => {
    execSync('npm run db:seed', { stdio: 'ignore' });
    expect(await count(`select count(*) n from public.products where ${NOT_TEST}`)).toBe(107);
    expect(await count(`select count(*) n from public.product_variants`)).toBeGreaterThanOrEqual(28);
  });
});
```
Run: `npm run db:test -- seed` → Expected: FAIL (sayılar 0)

- [x] **Adım 2: Upsert anahtarları için migration**

`supabase/migrations/0006_seed_keys.sql`:
```sql
-- 0006 — seed upsert'leri için doğal anahtarlar
create unique index product_variants_product_name on public.product_variants (product_id, name_de);
create unique index options_group_name on public.options (group_id, name_de);
```
Run: `npm run db:apply`

- [x] **Adım 3: `menu-source.ts` dosyasını yaz**

Tipler, varyant yardımcıları, setler, gruplar, kategoriler ve malzemeler aşağıdaki gibi **tam** yazılır. Ürün listesi `docs/menu/ramos-menu-data.md` §4'teki 16 tablodan **birebir** aktarılır (107 satır). Aktarım kuralları:
- **Fiyat:** "7,50" → `750`.
- **Varyant:** "H 7,50 / K 8,50" → `variants: FLEISCH(750, 850)`, "klein 3,50 / groß 4,50" → `GROESSE(350, 450)`.
- **Malzemeler:** "S_DOENER + Gegrilltes Gemüse" → `[...S_DOENER, 'gegr_gemuese']`, "–" → alan yazılmaz.
- **Kategori geneli gruplar:** Pide'ye `g-extra-pide`, Pizza ve Calzone'ya `g-pizza-extra` eklenir; 47'ye ek olarak `g-pizza-mix`.
- **Alerjen:** Menüdeki kod dizesi olduğu gibi yazılır (`'a,c,g,4,7'`), boşsa alan yazılmaz.
- **⚠ işaretleri:** Veri olarak değil, tablodaki haliyle aktarılır; açıklamalardaki ⚠ notları **kopyalanmaz**.

`supabase/seed/menu-source.ts`:
```ts
export type Cents = number;
export interface CategorySeed { slug: string; name_de: string; name_tr: string; sort: number; is_beverage?: boolean }
export interface IngredientSeed { slug: string; name_de: string; name_tr: string }
export interface OptionSeed { name_de: string; name_tr: string; price_delta_cents?: Cents; is_default?: boolean; is_exclusive?: boolean }
export interface GroupSeed {
  slug: string; admin_label: string; name_de: string; name_tr: string;
  min: number; max: number; format: 'label_values' | 'values_only' | 'plus_each'; options: OptionSeed[];
}
export interface VariantSeed { name_de: string; name_tr: string; price_cents: Cents; is_default?: boolean }
export interface ProductSeed {
  slug: string; category: string; code: string | null; name: string; description?: string;
  price?: Cents; variants?: VariantSeed[]; ingredients?: string[]; groups?: string[]; allergens?: string;
}

export const FLEISCH = (h: Cents, k: Cents): VariantSeed[] => [
  { name_de: 'Hähnchen', name_tr: 'Tavuk', price_cents: h, is_default: true },
  { name_de: 'Kalb', name_tr: 'Dana', price_cents: k },
];
export const GROESSE = (klein: Cents, gross: Cents): VariantSeed[] => [
  { name_de: 'klein', name_tr: 'Küçük', price_cents: klein, is_default: true },
  { name_de: 'groß', name_tr: 'Büyük', price_cents: gross },
];

export const S_DOENER = ['salat', 'tomaten', 'gurken', 'zwiebeln', 'rotkohl'];
export const S_GRILL = ['salat', 'zwiebeln', 'gegr_tomate', 'gegr_peperoni'];
export const S_BURGER = ['salat', 'tomaten', 'gurken', 'zwiebeln', 'burgersosse'];
const DOENER_GROUPS = ['g-sosse', 'g-scharf', 'g-extra-doener'];

export const CATEGORIES: CategorySeed[] = [
  { slug: 'c-suppen', name_de: 'Suppen', name_tr: 'Çorbalar', sort: 10 },
  { slug: 'c-fruehstueck', name_de: 'Frühstück', name_tr: 'Kahvaltı', sort: 20 },
  { slug: 'c-drehspiess', name_de: 'Drehspieß', name_tr: 'Döner', sort: 30 },
  { slug: 'c-vegetarisch', name_de: 'Vegetarisch & Falafel', name_tr: 'Vejetaryen & Falafel', sort: 40 },
  { slug: 'c-beilagen', name_de: 'Beilagen', name_tr: 'Garnitürler', sort: 50 },
  { slug: 'c-lahmacun', name_de: 'Lahmacun', name_tr: 'Lahmacun', sort: 60 },
  { slug: 'c-pide', name_de: 'Pide', name_tr: 'Pide', sort: 70 },
  { slug: 'c-pizza', name_de: 'Pizza', name_tr: 'Pizza', sort: 80 },
  { slug: 'c-calzone', name_de: 'Calzone', name_tr: 'Calzone', sort: 90 },
  { slug: 'c-salate', name_de: 'Salate', name_tr: 'Salatalar', sort: 100 },
  { slug: 'c-grill', name_de: 'Grill Gerichte', name_tr: 'Izgaralar', sort: 110 },
  { slug: 'c-grill-duerum', name_de: 'Grill im Dürüm', name_tr: 'Dürüm Izgaralar', sort: 120 },
  { slug: 'c-burger', name_de: 'Burger', name_tr: 'Burger', sort: 130 },
  { slug: 'c-spar-menue', name_de: 'Spar Menü', name_tr: 'Ekonomik Menüler', sort: 140 },
  { slug: 'c-dessert', name_de: 'Dessert', name_tr: 'Tatlılar', sort: 150 },
  { slug: 'c-kalte-getraenke', name_de: 'Kalte Getränke', name_tr: 'Soğuk İçecekler', sort: 160, is_beverage: true },
];

export const INGREDIENTS: IngredientSeed[] = [
  { slug: 'salat', name_de: 'Salat', name_tr: 'Marul' },
  { slug: 'tomaten', name_de: 'Tomaten', name_tr: 'Domates' },
  { slug: 'gurken', name_de: 'Gurken', name_tr: 'Salatalık' },
  { slug: 'zwiebeln', name_de: 'Zwiebeln', name_tr: 'Soğan' },
  { slug: 'rotkohl', name_de: 'Rotkohl', name_tr: 'Kırmızı lahana' },
  { slug: 'weisskohl', name_de: 'Weißkohl', name_tr: 'Beyaz lahana' },
  { slug: 'gegr_gemuese', name_de: 'Gegrilltes Gemüse', name_tr: 'Izgara sebze' },
  { slug: 'weichkaese', name_de: 'Weichkäse', name_tr: 'Beyaz peynir' },
  { slug: 'gegr_tomate', name_de: 'Gegrillte Tomate', name_tr: 'Közlenmiş domates' },
  { slug: 'gegr_peperoni', name_de: 'Gegrillte Peperoni', name_tr: 'Közlenmiş biber' },
  { slug: 'joghurt', name_de: 'Joghurt', name_tr: 'Yoğurt' },
  { slug: 'tomatensosse', name_de: 'Tomatensoße', name_tr: 'Domates sosu' },
  { slug: 'butter', name_de: 'Butter', name_tr: 'Tereyağı' },
  { slug: 'knoblauch', name_de: 'Knoblauch', name_tr: 'Sarımsak' },
  { slug: 'burgersosse', name_de: 'Burgersoße', name_tr: 'Burger sosu' },
  { slug: 'rindersalami', name_de: 'Rindersalami', name_tr: 'Dana salam' },
  { slug: 'putenschinken', name_de: 'Putenschinken', name_tr: 'Hindi jambon' },
  { slug: 'sucuk', name_de: 'Sucuk', name_tr: 'Sucuk' },
  { slug: 'doenerfleisch', name_de: 'Drehspieß-Fleisch', name_tr: 'Döner eti' },
  { slug: 'haehnchen', name_de: 'Hähnchenfleisch', name_tr: 'Tavuk eti' },
  { slug: 'thunfisch', name_de: 'Thunfisch', name_tr: 'Ton balığı' },
  { slug: 'champignons', name_de: 'Champignons', name_tr: 'Mantar' },
  { slug: 'paprika', name_de: 'Paprika', name_tr: 'Biber' },
  { slug: 'mais', name_de: 'Mais', name_tr: 'Mısır' },
  { slug: 'oliven', name_de: 'Oliven', name_tr: 'Zeytin' },
  { slug: 'spinat', name_de: 'Spinat', name_tr: 'Ispanak' },
  { slug: 'ei', name_de: 'Ei', name_tr: 'Yumurta' },
  { slug: 'mozzarella', name_de: 'Mozzarella', name_tr: 'Mozzarella' },
  { slug: 'kaese', name_de: 'Käse', name_tr: 'Kaşar peyniri' },
  { slug: 'jalapenos', name_de: 'Jalapeños', name_tr: 'Jalapeño' },
  { slug: 'peperoni', name_de: 'Peperoni', name_tr: 'Peperoni biberi' },
];

const TOPPINGS: [string, string][] = [
  ['Rindersalami', 'Dana salam'], ['Putenschinken', 'Hindi jambon'], ['Sucuk', 'Sucuk'],
  ['Drehspieß-Fleisch', 'Döner eti'], ['Hähnchenfleisch', 'Tavuk eti'], ['Thunfisch', 'Ton balığı'],
  ['Champignons', 'Mantar'], ['Paprika', 'Biber'], ['Zwiebeln', 'Soğan'], ['Mais', 'Mısır'],
  ['Oliven', 'Zeytin'], ['Spinat', 'Ispanak'], ['Tomaten', 'Domates'], ['Jalapeños', 'Jalapeño'],
  ['Ei', 'Yumurta'], ['Mozzarella', 'Mozzarella'],
];

export const GROUPS: GroupSeed[] = [
  { slug: 'g-beilage', admin_label: 'Beilage (Pommes/Reis)', name_de: 'Beilage', name_tr: 'Garnitür', min: 1, max: 1,
    format: 'values_only', options: [
      { name_de: 'Pommes', name_tr: 'Patates kızartması', is_default: true }, { name_de: 'Reis', name_tr: 'Pilav' }] },
  { slug: 'g-sosse', admin_label: 'Soße (Döner)', name_de: 'Soße', name_tr: 'Sos', min: 1, max: 3,
    format: 'label_values', options: [
      { name_de: 'Knoblauch', name_tr: 'Sarımsaklı' }, { name_de: 'Kräuter', name_tr: 'Otlu' },
      { name_de: 'Scharfe Soße', name_tr: 'Acı sos' }, { name_de: 'ohne Soße', name_tr: 'Sossuz', is_exclusive: true }] },
  { slug: 'g-scharf', admin_label: 'scharf (Chili)', name_de: 'Schärfe', name_tr: 'Acı', min: 0, max: 1,
    format: 'values_only', options: [{ name_de: 'scharf (Chili)', name_tr: 'Acılı (pul biber)' }] },
  { slug: 'g-extra-doener', admin_label: 'Extras Döner/Lahmacun', name_de: 'Extras', name_tr: 'Ekstralar', min: 0, max: 2,
    format: 'plus_each', options: [
      { name_de: 'Extra Weichkäse', name_tr: 'Ekstra beyaz peynir', price_delta_cents: 100 },
      { name_de: 'Extra Fleisch', name_tr: 'Ekstra et', price_delta_cents: 200 }] },
  { slug: 'g-extra-pide', admin_label: 'Extras Pide', name_de: 'Extras', name_tr: 'Ekstralar', min: 0, max: 3,
    format: 'plus_each', options: [
      { name_de: 'Extra Ei', name_tr: 'Ekstra yumurta', price_delta_cents: 50 },
      { name_de: 'Extra Käse', name_tr: 'Ekstra peynir', price_delta_cents: 100 },
      { name_de: 'Extra Gemüse', name_tr: 'Ekstra sebze', price_delta_cents: 50 }] },
  { slug: 'g-pizza-extra', admin_label: 'Pizza: weiterer Belag (+0,70)', name_de: 'Extra Belag', name_tr: 'Ekstra malzeme',
    min: 0, max: 16, format: 'plus_each',
    options: TOPPINGS.map(([de, tr]) => ({ name_de: de, name_tr: tr, price_delta_cents: 70 })) },
  { slug: 'g-pizza-mix', admin_label: 'Pizza Mix: 5 Beläge', name_de: 'Beläge', name_tr: 'Malzemeler', min: 5, max: 5,
    format: 'label_values', options: TOPPINGS.map(([de, tr]) => ({ name_de: de, name_tr: tr })) },
  { slug: 'g-menu-getraenk', admin_label: 'Menü-Getränk 0,33 l', name_de: 'Getränk', name_tr: 'İçecek', min: 1, max: 1,
    format: 'label_values', options: ['Cola', 'Cola Light', 'Fanta', 'Sprite', 'Mezzo Mix'].map((n) => ({ name_de: n, name_tr: n })) },
  { slug: 'g-lahmacun-rolle', admin_label: 'Im Lahmacun gerollt (+1,00)', name_de: 'Im Lahmacun gerollt',
    name_tr: 'Lahmacuna sarılı', min: 0, max: 1, format: 'plus_each',
    options: [{ name_de: 'im Lahmacun gerollt', name_tr: 'Lahmacuna sarılı', price_delta_cents: 100 }] },
];

// 107 ürün — docs/menu/ramos-menu-data.md §4'ten birebir. Örnek ilk satırlar (kalıp):
export const PRODUCTS: ProductSeed[] = [
  { slug: 'p-01', category: 'c-suppen', code: '01', name: 'Linsensuppe / Mercimek Çorbası', price: 500 },
  { slug: 'p-02', category: 'c-suppen', code: '02', name: 'Kuttelsuppe / İşkembe Çorbası', price: 600 },
  { slug: 'p-03', category: 'c-suppen', code: '03', name: 'Fleischsuppe / Kelle Paça', price: 700 },
  { slug: 'p-04', category: 'c-fruehstueck', code: '04', name: 'Sucuk Toast', description: 'mit Knoblauchwurst & Goudakäse', price: 450 },
  { slug: 'p-05', category: 'c-drehspiess', code: '05', name: 'Drehspieß Sandwich', description: 'im Fladenbrot mit Salat & Soße',
    variants: FLEISCH(750, 850), ingredients: S_DOENER, groups: DOENER_GROUPS, allergens: 'a,c,g,4,7' },
  { slug: 'p-89', category: 'c-drehspiess', code: '89', name: 'Gemüse Drehspieß Sandwich',
    description: 'im Fladenbrot mit gegr. Gemüse, Salat & Soße', variants: FLEISCH(800, 900),
    ingredients: [...S_DOENER, 'gegr_gemuese'], groups: DOENER_GROUPS, allergens: 'a,c,g,4,7' },
  { slug: 'p-08', category: 'c-drehspiess', code: '08', name: 'Drehspieß Teller', description: 'mit Pommes oder Reis, Salat & Soße',
    variants: FLEISCH(1250, 1350), ingredients: S_DOENER, groups: ['g-beilage', ...DOENER_GROUPS], allergens: 'a,c,g,4,7' },
  { slug: 'p-10', category: 'c-drehspiess', code: '10', name: 'Iskender Drehspieß',
    description: 'auf Fladenbrotwürfeln mit Tomatensoße, Joghurt & zerlassener Butter', price: 1500,
    ingredients: ['tomatensosse', 'joghurt', 'butter'], groups: ['g-extra-doener'], allergens: 'a,c,g,4,7' },
  // … §4.3'ün kalanı (06, 07, 09, 11, 12), ardından §4.4–§4.16 aynı kalıpla:
  { slug: 'p-47', category: 'c-pizza', code: '47', name: 'Pizza Mix', description: 'mit 5 Belägen nach Wahl', price: 1150,
    groups: ['g-pizza-extra', 'g-pizza-mix'], allergens: 'a,c,g,4,7' },
  { slug: 'p-m3', category: 'c-spar-menue', code: 'M3', name: 'Lahmacun Menü mit Drehspießfleisch',
    description: 'mit Pommes & 1 Softgetränk 0,33 l', variants: FLEISCH(1200, 1350), ingredients: S_DOENER,
    groups: ['g-sosse', 'g-scharf', 'g-menu-getraenk'] },
  { slug: 'p-cola-0-33-l', category: 'c-kalte-getraenke', code: null, name: 'Cola 0,33 l', price: 250, allergens: '1,3,9' },
];

export const TABLE_COUNT = Number(process.env.SEED_TABLE_COUNT ?? 12);

export const SETTINGS = {
  restaurant_name: "Ramo's Döner & Grill House",
  ticket_header: "RAMO'S · KÜCHE",
  quick_notes: [
    { de: 'Soße separat', tr: 'Sos ayrı' }, { de: 'wenig Soße', tr: 'Az sos' }, { de: 'extra Soße', tr: 'Bol sos' },
    { de: 'gut durch', tr: 'İyi pişmiş' }, { de: 'extra knusprig', tr: 'Ekstra çıtır' },
  ],
  cancel_reasons: [
    { de: 'Gast hat storniert', tr: 'Müşteri vazgeçti' }, { de: 'Falsch eingegeben', tr: 'Yanlış giriş' },
    { de: 'Nicht lieferbar', tr: 'Ürün kalmadı' }, { de: 'Sonstiges', tr: 'Diğer', freeText: true },
  ],
  // docs/menu/ramos-menu-data.md §5.5 — 27 satır (a–n, 1–13), kalıp:
  allergen_legend: [
    { code: 'a', de: 'Glutenhaltiges Getreide', tr: 'Glutenli tahıl' },
    { code: 'c', de: 'Eier', tr: 'Yumurta' },
    // … §5.5'teki tüm satırlar sırayla
  ],
};
```
Dosyada "…" kalmamalı; bu yorumlar yalnızca plandaki kısaltmadır. Aktarım bitince `PRODUCTS.length === 107` ve `allergen_legend.length === 27` olmalıdır. Test bunu doğrular.

- [x] **Adım 4: `build-seed.ts` dosyasını yaz**
```ts
import { writeFileSync } from 'node:fs';
import { CATEGORIES, GROUPS, INGREDIENTS, PRODUCTS, SETTINGS, TABLE_COUNT } from './menu-source';

const q = (v: string | null | undefined) => (v == null ? 'null' : `'${v.replace(/'/g, "''")}'`);
const j = (v: unknown) => `${q(JSON.stringify(v))}::jsonb`;
const out: string[] = ['-- ÜRETİLDİ: supabase/seed/build-seed.ts — elle düzenleme', 'begin;'];

if (PRODUCTS.length !== 107) throw new Error(`PRODUCTS 107 olmalı, ${PRODUCTS.length}`);

for (const c of CATEGORIES) out.push(`insert into public.categories (slug, name_de, name_tr, sort, is_beverage)
  values (${q(c.slug)}, ${q(c.name_de)}, ${q(c.name_tr)}, ${c.sort}, ${c.is_beverage ?? false})
  on conflict (slug) do update set name_de = excluded.name_de, name_tr = excluded.name_tr,
    sort = excluded.sort, is_beverage = excluded.is_beverage;`);

for (const i of INGREDIENTS) out.push(`insert into public.ingredients (slug, name_de, name_tr)
  values (${q(i.slug)}, ${q(i.name_de)}, ${q(i.name_tr)})
  on conflict (slug) do update set name_de = excluded.name_de, name_tr = excluded.name_tr;`);

GROUPS.forEach((g, gi) => {
  out.push(`insert into public.option_groups (slug, admin_label, name_de, name_tr, min_select, max_select, ticket_format, sort)
    values (${q(g.slug)}, ${q(g.admin_label)}, ${q(g.name_de)}, ${q(g.name_tr)}, ${g.min}, ${g.max}, ${q(g.format)}, ${gi + 1})
    on conflict (slug) do update set admin_label = excluded.admin_label, name_de = excluded.name_de,
      name_tr = excluded.name_tr, min_select = excluded.min_select, max_select = excluded.max_select,
      ticket_format = excluded.ticket_format, sort = excluded.sort;`);
  g.options.forEach((o, oi) => out.push(`insert into public.options
      (group_id, name_de, name_tr, price_delta_cents, is_default, is_exclusive, sort)
    select id, ${q(o.name_de)}, ${q(o.name_tr)}, ${o.price_delta_cents ?? 0}, ${o.is_default ?? false},
      ${o.is_exclusive ?? false}, ${oi + 1} from public.option_groups where slug = ${q(g.slug)}
    on conflict (group_id, name_de) do update set name_tr = excluded.name_tr,
      price_delta_cents = excluded.price_delta_cents, is_default = excluded.is_default,
      is_exclusive = excluded.is_exclusive, sort = excluded.sort;`));
});

PRODUCTS.forEach((p, pi) => {
  out.push(`insert into public.products (slug, category_id, code, name, description, base_price_cents, allergens, sort)
    select ${q(p.slug)}, id, ${q(p.code)}, ${q(p.name)}, ${q(p.description)}, ${p.variants ? 'null' : p.price},
      ${q(p.allergens)}, ${pi + 1} from public.categories where slug = ${q(p.category)}
    on conflict (slug) do update set category_id = excluded.category_id, code = excluded.code, name = excluded.name,
      description = excluded.description, base_price_cents = excluded.base_price_cents,
      allergens = excluded.allergens, sort = excluded.sort;`);
  const pid = `(select id from public.products where slug = ${q(p.slug)})`;
  p.variants?.forEach((v, vi) => out.push(`insert into public.product_variants
      (product_id, name_de, name_tr, price_cents, is_default, sort)
    values (${pid}, ${q(v.name_de)}, ${q(v.name_tr)}, ${v.price_cents}, ${v.is_default ?? false}, ${vi + 1})
    on conflict (product_id, name_de) do update set name_tr = excluded.name_tr, price_cents = excluded.price_cents,
      is_default = excluded.is_default, sort = excluded.sort;`));
  p.ingredients?.forEach((slug, ii) => out.push(`insert into public.product_ingredients (product_id, ingredient_id, sort)
    select ${pid}, id, ${ii + 1} from public.ingredients where slug = ${q(slug)}
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;`));
  p.groups?.forEach((slug, gi) => out.push(`insert into public.product_option_groups (product_id, group_id, sort)
    select ${pid}, id, ${gi + 1} from public.option_groups where slug = ${q(slug)}
    on conflict (product_id, group_id) do update set sort = excluded.sort;`));
});

for (let n = 1; n <= TABLE_COUNT; n++)
  out.push(`insert into public.dining_tables (name, sort) values ('Tisch ${n}', ${n}) on conflict (name) do nothing;`);

out.push(`update public.settings set restaurant_name = ${q(SETTINGS.restaurant_name)},
  ticket_header = ${q(SETTINGS.ticket_header)}, quick_notes = ${j(SETTINGS.quick_notes)},
  cancel_reasons = ${j(SETTINGS.cancel_reasons)}, allergen_legend = ${j(SETTINGS.allergen_legend)} where id = 1;`);
out.push('commit;');
writeFileSync('supabase/seed/seed.sql', out.join('\n') + '\n', 'utf8');
console.log(`seed.sql yazıldı: ${PRODUCTS.length} ürün`);
```
`package.json` script'lerine ekle:
```json
"db:seed": "node --env-file=.env --import tsx supabase/seed/build-seed.ts && node --env-file=.env scripts/db.mjs sql --file supabase/seed/seed.sql",
"db:types": "node --env-file=.env scripts/db.mjs types"
```
Run: `npm i -D tsx`

`scripts/db.mjs` dosyasına `types` komutunu ekle:
```js
} else if (cmd === 'types') {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/types/typescript?included_schemas=public`,
    { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`types hatası ${res.status}: ${await res.text()}`);
  const { types } = await res.json();
  const { writeFile } = await import('node:fs/promises');
  await writeFile('packages/shared/src/database.types.ts', types, 'utf8');
  console.log('packages/shared/src/database.types.ts yazıldı');
```
MCP varsa `generate_typescript_types` aynı işi yapar.

- [x] **Adım 5: Seed'i çalıştır, testi doğrula, tipleri üret**

Run: `npm run db:seed` → Expected: `seed.sql yazıldı: 107 ürün`, ardından SQL `[]`
Run: `npm run db:test -- seed` → Expected: PASS (5 test). Sağlama toplamları tutmazsa aktarımı §4 ile satır satır karşılaştır.
Run: `npm run db:types` → `packages/shared/src/database.types.ts` oluşur.
Run: `npm run typecheck` → Expected: hatasız

- [x] **Adım 6: Commit**
```bash
git add supabase/migrations/0006_seed_keys.sql supabase/seed supabase/tests/seed.test.ts scripts/db.mjs package.json package-lock.json packages/shared/src/database.types.ts
git commit -m "feat(db): menü seed'i (107 ürün, 9 seçim grubu, 31 malzeme), 12 masa, ayar listeleri, TS tipleri"
```

---

## Görev 9: Ortak alan mantığı — fiyat, seçim kuralları, sepet, hata anahtarları

**Files:**
- Create: `packages/shared/src/domain.ts`, `packages/shared/src/pricing.ts`, `packages/shared/src/cart.ts`, `packages/shared/src/errors.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/src/pricing.test.ts`, `packages/shared/src/cart.test.ts`, `packages/shared/src/errors.test.ts`

**Interfaces:**
- Produces:
  - **Tipler (`domain.ts`):** `Locale`, `TicketFormat`, `MenuOption`, `MenuGroup`, `MenuVariant`, `MenuIngredient`, `MenuProduct`, `Selection`, `CartLine`, `SubmitItem`.
  - **Yardımcı:** `localName(x, locale)`.
  - **Fiyat ve seçim (`pricing.ts`):**
    - `unitPriceCents(p, s): number`
    - `validateSelection(p, s): SelectionError[]`
    - `defaultSelection(p): Selection`
    - `toggleOption(group, currentIds, optionId): string[]`
    - `needsSheet(p): boolean`
  - **Sepet (`cart.ts`):**
    - `lineKey(productId, s, note): string`
    - `addLine(lines, line): CartLine[]`
    - `cartTotalCents(lines, productsById): number`
    - `toSubmitItems(lines): SubmitItem[]`
  - **Hatalar (`errors.ts`):** `RPC_ERROR_KEYS`, `RpcErrorKey`, `isRpcErrorKey(s)`.
  - Kurallar sunucudakiyle (§6.1, `submit_order`) aynıdır. Arayüz bunları anlık geri bildirim için kullanır, son söz sunucunundur.

- [x] **Adım 1: Testleri yaz (kırmızı)**

`packages/shared/src/pricing.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import type { MenuGroup, MenuProduct } from './domain';
import { defaultSelection, needsSheet, toggleOption, unitPriceCents, validateSelection } from './pricing';

const sauce: MenuGroup = { id: 'g-s', name_de: 'Soße', name_tr: 'Sos', min_select: 1, max_select: 3,
  ticket_format: 'label_values', sort: 1, options: [
    { id: 'kn', name_de: 'Knoblauch', name_tr: null, price_delta_cents: 0, is_default: false, is_exclusive: false, sort: 1 },
    { id: 'kr', name_de: 'Kräuter', name_tr: null, price_delta_cents: 0, is_default: false, is_exclusive: false, sort: 2 },
    { id: 'sc', name_de: 'Scharfe Soße', name_tr: null, price_delta_cents: 0, is_default: false, is_exclusive: false, sort: 3 },
    { id: 'oh', name_de: 'ohne Soße', name_tr: null, price_delta_cents: 0, is_default: false, is_exclusive: true, sort: 4 }] };
const beilage: MenuGroup = { id: 'g-b', name_de: 'Beilage', name_tr: null, min_select: 1, max_select: 1,
  ticket_format: 'values_only', sort: 0, options: [
    { id: 'po', name_de: 'Pommes', name_tr: null, price_delta_cents: 0, is_default: true, is_exclusive: false, sort: 1 },
    { id: 're', name_de: 'Reis', name_tr: null, price_delta_cents: 0, is_default: false, is_exclusive: false, sort: 2 }] };
const extras: MenuGroup = { id: 'g-e', name_de: 'Extras', name_tr: null, min_select: 0, max_select: 2,
  ticket_format: 'plus_each', sort: 2, options: [
    { id: 'wk', name_de: 'Extra Weichkäse', name_tr: null, price_delta_cents: 100, is_default: false, is_exclusive: false, sort: 1 },
    { id: 'fl', name_de: 'Extra Fleisch', name_tr: null, price_delta_cents: 200, is_default: false, is_exclusive: false, sort: 2 }] };
const teller: MenuProduct = { id: 'p08', category_id: 'c', code: '08', name: 'Drehspieß Teller', description: null,
  base_price_cents: null, allergens: null, image_path: null, is_sold_out: false, sort: 1,
  variants: [
    { id: 'h', name_de: 'Hähnchen', name_tr: 'Tavuk', price_cents: 1250, is_default: true, sort: 1 },
    { id: 'k', name_de: 'Kalb', name_tr: 'Dana', price_cents: 1350, is_default: false, sort: 2 }],
  ingredients: [{ id: 'zw', name_de: 'Zwiebeln', name_tr: 'Soğan', sort: 1 }],
  groups: [beilage, sauce, extras] };
const cola: MenuProduct = { ...teller, id: 'cola', code: null, name: 'Cola 0,33 l', base_price_cents: 250,
  variants: [], ingredients: [], groups: [] };

describe('pricing', () => {
  it('varsayılan seçim: varsayılan varyant + varsayılan seçenekler', () => {
    expect(defaultSelection(teller)).toEqual({ variantId: 'h', optionIds: ['po'], removedIngredientIds: [] });
  });
  it('birim fiyat = varyant + seçenek farkları; varyantsızda taban fiyat', () => {
    expect(unitPriceCents(teller, { variantId: 'k', optionIds: ['po', 'kn', 'wk', 'fl'], removedIngredientIds: ['zw'] }))
      .toBe(1350 + 100 + 200);
    expect(unitPriceCents(cola, { variantId: null, optionIds: [], removedIngredientIds: [] })).toBe(250);
  });
  it('doğrulama sunucu anahtarlarını üretir', () => {
    expect(validateSelection(teller, { variantId: null, optionIds: ['po', 'kn'], removedIngredientIds: [] }))
      .toEqual([{ key: 'variant_required' }]);
    expect(validateSelection(teller, { variantId: 'h', optionIds: ['po'], removedIngredientIds: [] }))
      .toEqual([{ key: 'option_group_min', groupId: 'g-s' }]);
    expect(validateSelection(teller, { variantId: 'h', optionIds: ['po', 'kn', 'oh'], removedIngredientIds: [] }))
      .toEqual([{ key: 'option_exclusive_conflict', groupId: 'g-s' }]);
    expect(validateSelection(teller, { variantId: 'h', optionIds: ['po', 'kn'], removedIngredientIds: [] })).toEqual([]);
  });
  it('toggleOption: radyo, exclusive, max sınırı', () => {
    expect(toggleOption(beilage, ['po'], 're')).toEqual(['re']);            // tekli grup → değiştirir
    expect(toggleOption(beilage, ['po'], 'po')).toEqual(['po']);            // min=max=1 → seçili kalır
    expect(toggleOption(sauce, ['kn', 'kr'], 'oh')).toEqual(['oh']);        // exclusive → diğerlerini siler
    expect(toggleOption(sauce, ['oh'], 'kn')).toEqual(['kn']);              // normal seçim exclusive'i siler
    expect(toggleOption(sauce, ['kn', 'kr', 'sc'], 'kn')).toEqual(['kr', 'sc']);
    expect(toggleOption(extras, ['wk', 'fl'], 'wk')).toEqual(['fl']);
    expect(toggleOption({ ...extras, max_select: 1 }, ['wk'], 'fl')).toEqual(['fl']);
    expect(toggleOption({ ...sauce, max_select: 2 }, ['kn', 'kr'], 'sc')).toEqual(['kn', 'kr']); // max dolu → değişmez
  });
  it('panel gerekmeyen ürün tek dokunuşla eklenir', () => {
    expect(needsSheet(cola)).toBe(false);
    expect(needsSheet(teller)).toBe(true);
  });
});
```
`packages/shared/src/cart.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { addLine, cartTotalCents, lineKey, toSubmitItems } from './cart';
import type { CartLine, MenuProduct } from './domain';

const base = { productId: 'p05', variantId: 'k', optionIds: ['kr', 'kn'], removedIngredientIds: ['zw'], note: '', quantity: 1 };

describe('cart', () => {
  it('anahtar sıradan bağımsızdır, notu kırpar', () => {
    expect(lineKey('p05', { variantId: 'k', optionIds: ['kr', 'kn'], removedIngredientIds: [] }, ' x '))
      .toBe(lineKey('p05', { variantId: 'k', optionIds: ['kn', 'kr'], removedIngredientIds: [] }, 'x'));
  });
  it('aynı kombinasyon adet artırır (en fazla 99); farklı kombinasyon yeni satır', () => {
    let lines: CartLine[] = addLine([], base);
    lines = addLine(lines, { ...base, quantity: 2 });
    expect(lines).toHaveLength(1);
    expect(lines[0]!.quantity).toBe(3);
    lines = addLine(lines, { ...base, removedIngredientIds: [] });
    expect(lines).toHaveLength(2);
    expect(addLine([{ ...lines[0]!, quantity: 98 }], { ...base, quantity: 5 })[0]!.quantity).toBe(99);
  });
  it('toplam ve gönderim biçimi', () => {
    const p = { id: 'p05', base_price_cents: null, variants: [{ id: 'k', price_cents: 850 }],
      groups: [{ options: [{ id: 'kn', price_delta_cents: 0 }, { id: 'kr', price_delta_cents: 100 }] }] } as unknown as MenuProduct;
    const lines = addLine([], { ...base, quantity: 2 });
    expect(cartTotalCents(lines, new Map([['p05', p]]))).toBe(2 * 950);
    expect(toSubmitItems(lines)).toEqual([{ product_id: 'p05', variant_id: 'k', quantity: 2,
      option_ids: ['kr', 'kn'], removed_ingredient_ids: ['zw'], note: null }]);
  });
});
```
`packages/shared/src/errors.test.ts` — anahtar listesi migration'larla birebir aynı olmalı:
```ts
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { RPC_ERROR_KEYS } from './errors';

describe('RPC hata anahtarları', () => {
  it('migration’lardaki internal.fail anahtarlarıyla aynı küme', () => {
    const dir = path.resolve(__dirname, '../../../supabase/migrations');
    const keys = new Set<string>();
    for (const f of readdirSync(dir)) {
      for (const m of readFileSync(path.join(dir, f), 'utf8').matchAll(/internal\.fail\('([a-z_]+)'/g)) keys.add(m[1]!);
    }
    expect([...keys].sort()).toEqual([...RPC_ERROR_KEYS].sort());
  });
});
```
Run: `npm test -w @ramos/shared` → Expected: FAIL (modüller yok)

- [x] **Adım 2: Uygula**

`packages/shared/src/domain.ts`:
```ts
export type Locale = 'tr' | 'de';
export type TicketFormat = 'label_values' | 'values_only' | 'plus_each';
export interface Named { name_de: string; name_tr: string | null }
export interface MenuOption extends Named { id: string; price_delta_cents: number; is_default: boolean; is_exclusive: boolean; sort: number }
export interface MenuGroup extends Named { id: string; min_select: number; max_select: number; ticket_format: TicketFormat; sort: number; options: MenuOption[] }
export interface MenuVariant extends Named { id: string; price_cents: number; is_default: boolean; sort: number }
export interface MenuIngredient extends Named { id: string; sort: number }
export interface MenuProduct {
  id: string; category_id: string; code: string | null; name: string; description: string | null;
  base_price_cents: number | null; allergens: string | null; image_path: string | null; is_sold_out: boolean; sort: number;
  variants: MenuVariant[]; ingredients: MenuIngredient[]; groups: MenuGroup[];
}
export interface Selection { variantId: string | null; optionIds: string[]; removedIngredientIds: string[] }
export interface CartLine extends Selection { key: string; productId: string; quantity: number; note: string }
export interface SubmitItem {
  product_id: string; variant_id: string | null; quantity: number;
  option_ids: string[]; removed_ingredient_ids: string[]; note: string | null;
}
export const localName = (x: Named, locale: Locale): string => (locale === 'tr' && x.name_tr) || x.name_de;
```
`packages/shared/src/pricing.ts`:
```ts
import type { MenuGroup, MenuProduct, Selection } from './domain';

export type SelectionError =
  | { key: 'variant_required' }
  | { key: 'option_group_min' | 'option_group_max' | 'option_exclusive_conflict'; groupId: string };

export function unitPriceCents(p: MenuProduct, s: Selection): number {
  const base = p.variants.length
    ? (p.variants.find((v) => v.id === s.variantId)?.price_cents ?? 0)
    : (p.base_price_cents ?? 0);
  const deltas = p.groups
    .flatMap((g) => g.options)
    .filter((o) => s.optionIds.includes(o.id))
    .reduce((sum, o) => sum + o.price_delta_cents, 0);
  return base + deltas;
}

export function validateSelection(p: MenuProduct, s: Selection): SelectionError[] {
  const errors: SelectionError[] = [];
  if (p.variants.length && !p.variants.some((v) => v.id === s.variantId)) errors.push({ key: 'variant_required' });
  for (const g of p.groups) {
    const chosen = g.options.filter((o) => s.optionIds.includes(o.id));
    if (chosen.length < g.min_select) errors.push({ key: 'option_group_min', groupId: g.id });
    else if (chosen.length > g.max_select) errors.push({ key: 'option_group_max', groupId: g.id });
    else if (chosen.length > 1 && chosen.some((o) => o.is_exclusive))
      errors.push({ key: 'option_exclusive_conflict', groupId: g.id });
  }
  return errors;
}

export function defaultSelection(p: MenuProduct): Selection {
  return {
    variantId: p.variants.find((v) => v.is_default)?.id ?? p.variants[0]?.id ?? null,
    optionIds: p.groups.flatMap((g) => g.options.filter((o) => o.is_default).map((o) => o.id)),
    removedIngredientIds: [],
  };
}

/** Bir grubun seçimini değiştirir; diğer grupların id'lerine dokunmaz. */
export function toggleOption(group: MenuGroup, current: string[], optionId: string): string[] {
  const inGroup = new Set(group.options.map((o) => o.id));
  const others = current.filter((id) => !inGroup.has(id));
  const mine = current.filter((id) => inGroup.has(id));
  const option = group.options.find((o) => o.id === optionId);
  if (!option) return current;
  if (mine.includes(optionId)) {
    if (group.min_select === 1 && group.max_select === 1) return current;
    return [...others, ...mine.filter((id) => id !== optionId)];
  }
  if (option.is_exclusive) return [...others, optionId];
  const exclusive = new Set(group.options.filter((o) => o.is_exclusive).map((o) => o.id));
  const kept = mine.filter((id) => !exclusive.has(id));
  if (group.max_select === 1) return [...others, optionId];
  if (kept.length >= group.max_select) return current;
  return [...others, ...kept, optionId];
}

export const needsSheet = (p: MenuProduct): boolean =>
  p.variants.length > 0 || p.groups.length > 0 || p.ingredients.length > 0;
```
`packages/shared/src/cart.ts`:
```ts
import type { CartLine, MenuProduct, Selection, SubmitItem } from './domain';
import { unitPriceCents } from './pricing';

export const lineKey = (productId: string, s: Selection, note: string): string =>
  [productId, s.variantId ?? '-', [...s.optionIds].sort().join(','),
   [...s.removedIngredientIds].sort().join(','), note.trim()].join('|');

export function addLine(lines: CartLine[], line: Omit<CartLine, 'key'>): CartLine[] {
  const key = lineKey(line.productId, line, line.note);
  const hit = lines.find((l) => l.key === key);
  if (hit) return lines.map((l) => (l.key === key ? { ...l, quantity: Math.min(99, l.quantity + line.quantity) } : l));
  return [...lines, { ...line, note: line.note.trim(), key }];
}

export function cartTotalCents(lines: CartLine[], productsById: Map<string, MenuProduct>): number {
  return lines.reduce((sum, l) => {
    const p = productsById.get(l.productId);
    return p ? sum + unitPriceCents(p, l) * l.quantity : sum;
  }, 0);
}

export const toSubmitItems = (lines: CartLine[]): SubmitItem[] =>
  lines.map((l) => ({
    product_id: l.productId, variant_id: l.variantId, quantity: l.quantity,
    option_ids: l.optionIds, removed_ingredient_ids: l.removedIngredientIds, note: l.note.trim() || null,
  }));
```
`packages/shared/src/errors.ts`:
```ts
export const RPC_ERROR_KEYS = [
  'not_authorized', 'order_id_conflict', 'table_inactive', 'empty_order', 'too_many_items', 'note_too_long',
  'quantity_invalid', 'product_unavailable', 'product_sold_out', 'variant_required', 'variant_invalid',
  'option_invalid', 'option_group_min', 'option_group_max', 'option_exclusive_conflict', 'ingredient_invalid',
  'reason_required', 'reason_too_long', 'item_not_found', 'item_already_cancelled', 'session_closed',
  'order_not_in_kitchen', 'order_not_ready', 'undo_window_expired', 'order_not_open', 'open_orders_in_kitchen',
  'target_table_busy', 'product_not_found', 'session_not_found', 'locale_invalid', 'order_not_found',
  'job_not_failed', 'job_not_found',
] as const;
export type RpcErrorKey = (typeof RPC_ERROR_KEYS)[number];
export const isRpcErrorKey = (s: string): s is RpcErrorKey => (RPC_ERROR_KEYS as readonly string[]).includes(s);
```
`packages/shared/src/index.ts`:
```ts
export * from './money';
export * from './domain';
export * from './pricing';
export * from './cart';
export * from './errors';
```
Run: `npm test -w @ramos/shared` → Expected: PASS. `errors.test` başarısızsa eksik veya fazla anahtarı listeden düzelt; migration değiştirilmez.

- [x] **Adım 3: M1 kapanışı**

Run: `npm run check` ve `npm run db:test` → ikisi de yeşil olmalı. `get_advisors` temiz.
```bash
git add packages/shared
git commit -m "feat(shared): fiyat, seçim kuralları, sepet ve RPC hata anahtarları (sunucuyla aynı kurallar)"
```
Kullanıcıya **M0–M1 raporunu** ver (BUILD-PROMPT §8).

