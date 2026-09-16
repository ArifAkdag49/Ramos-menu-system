# Ramo's Sipariş Sistemi — Plan 3: Mutfak Ekranı ve Yazdırma (M4–M5, Görev 16–20)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mutfak tableti ekranını (KDS) ve Xprinter XP-Q80A'ya ağ üzerinden Almanca fiş basan Node.js yazdırma ajanını kurmak. Hedef: sahte yazıcıda otomatik testlerin geçmesi, geliştirme PC'sindeki gerçek Xprinter'da fişin kullanıcı tarafından onaylanması.

**Architecture:**
- KDS, `apps/web` içinde `/kitchen` rotasıdır. Veriyi `useKitchenOrders` + Realtime'dan alır.
- Fiş satır modeli `packages/shared/src/ticket.ts` içindedir; payload'dan biçimli satırlara çevirir. Hem ajan hem admin önizlemesi bunu kullanır.
- Ajan (`apps/print-agent`) printer rolüyle Supabase'e bağlanır. Kuyruğu `claim_print_job` / `complete_print_job` ile işler. ESC/POS baytlarını `@point-of-sale/receipt-printer-encoder` ile üretir, TCP 9100 ile gönderir. Göndermeden önce ve sonra `DLE EOT` ile yazıcı durumunu sorgular.

**Tech Stack:** React 19 · Wake Lock API · Web Audio · Node.js ≥ 22 (TypeScript, tsx, esbuild) · @supabase/supabase-js · @point-of-sale/receipt-printer-encoder 3.x · node:net · Vitest

**Spec:** `docs/superpowers/specs/2026-09-15-ramos-siparis-sistemi-design.md` (§8.3, §9, §10, §11, §13)

## Global Constraints
**Faz B kuralı (her görevde geçerli):**
- Bu plandaki "kullanıcıya sor", "onay al" ve "kullanıcıdan iste" ifadeleri Faz A'da karşılandı (BUILD-PROMPT §3). **Soru sormadan devam et.**
- Yazıcıya ulaşılamazsa gerçek yazıcı adımları ⏸ ertelenir; fiş fotoğraf onayı "Kullanıcıya kalan kontroller" listesine yazılır.
- **Tasarım:** BUILD-PROMPT §10 geçerlidir. KDS için sadelik: büyük yazı, tek ana eylem (HAZIR). M4 sonunda tasarım kapısı var.

`docs/BUILD-PROMPT.md` §5 ve §6'nın Xprinter bölümü eksiksiz geçerlidir. Bu planda özellikle:
- **Fiş biçimi:** Almanca, 48 kolon, fiyat yok. İçecekler en sonda "GETRÄNKE" başlığıyla.
- **Init:** `ESC @` + `FS .` + `ESC t 61`. Karakter tablosu no ve transliterasyon ayarlardan (`settings`) okunur.
- **Kesim:** Önce kağıt ilerletilir, sonra `GS V 66 0` ile kısmi kesim.
- **Ağ ve zamanlama:**
  - TCP bağlanma zaman aşımı 3 sn, durum yanıtı 1 sn. İşler tek tek gönderilir.
  - Kuyruk kontrolü 5 sn, heartbeat 30 sn, boşta yazıcı kontrolü 15 sn.
  - Yazıcı sorunluyken **iş sahiplenilmez**.
- **Ajan kimliği:** Ajan `service_role` kullanmaz. `apps/print-agent/.env` Görev 10'daki betikle üretilir ve commit edilmez.
- **KDS:**
  - HAZIR'ı geri alma penceresi 30 sn.
  - Süre renkleri: 10 dk'ya kadar yeşil, 10–20 dk sarı, 20 dk'dan sonra kırmızı.
  - OHNE satırları kırmızı. Kalem satırları 10" tablette ≥ 22 px.

## Dosya haritası (bu plan)
```
apps/web/src/features/kitchen/
  KitchenPage.tsx · OrderCard.tsx · SoldOutDrawer.tsx · KitchenHeader.tsx
  kitchenLogic.ts (+ kitchenLogic.test.ts) · useWakeLock.ts · useSoundAlert.ts
  OrderCard.test.tsx
apps/web/e2e/kitchen.spec.ts
packages/shared/src/ticket.ts (+ ticket.test.ts)                 # payload → Line[]
apps/print-agent/
  package.json · tsconfig.json · .env.example · build.mjs (esbuild tek dosya)
  src/config.ts · src/log.ts · src/escpos.ts · src/transport.ts · src/status.ts
  src/agent.ts · src/cli.ts · src/fake-printer.ts
  src/*.test.ts
  scripts/install-agent.ps1 · scripts/uninstall-agent.ps1 · scripts/run-agent.cmd
deploy/ramos-print-agent.service
```

---

## Görev 16: Mutfak ekranı (KDS)

**Files:**
- Create: `apps/web/src/features/kitchen/kitchenLogic.ts`, `KitchenPage.tsx`, `KitchenHeader.tsx`, `OrderCard.tsx`, `SoldOutDrawer.tsx`, `useWakeLock.ts`, `useSoundAlert.ts`
- Modify: `apps/web/src/i18n/tr.json`, `de.json` (`kitchen.*`)
- Test: `kitchenLogic.test.ts`, `OrderCard.test.tsx`, `apps/web/e2e/kitchen.spec.ts`

**Interfaces:**
- Consumes (Plan 2 Görev 12):
  - Veri: `useKitchenOrders(): OrderView[]`, `useMenu()`, `usePrinterStatus()`, `useStaffNames()`
  - Mutasyonlar: `useMarkReady()`, `useUndoReady()`, `useSetSoldOut()`, `useRetryJob()`, `useReprint()`
  - Realtime: `useBroadcastInvalidation(['orders','menu','printer-status','settings'])`
  - Diğer: `localName()`, `formatOrderNo()`
- Produces:
  - `/kitchen` sayfası.
  - `kitchenColumns(orders, now): { active: OrderView[]; ready: OrderView[] }`: `active` = `in_kitchen` (eskiden yeniye); `ready` = son 30 dk içinde hazır olanlar (yeniden eskiye).
  - `elapsedTone(createdAt, now): 'ok' | 'warn' | 'late'`
  - `canUndo(order, now): boolean` (≤ 30 sn)
  - `newOrderIds(prev: Set<string>, next: OrderView[]): string[]`
  - `itemLines(item, locale): { variant?: string; without?: string; options: string[]; note?: string }` — KDS dili kullanıcı `locale`'ından gelir: TR'de "ÇIKAR: Soğan", DE'de "OHNE: Zwiebeln".

- [ ] **Adım 1: Saf mantık testlerini yaz (kırmızı)**

`kitchenLogic.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { canUndo, elapsedTone, itemLines, kitchenColumns, newOrderIds } from './kitchenLogic';

const now = new Date('2026-09-15T18:00:00Z');
const o = (id: string, status: string, created: string, ready_at: string | null = null) =>
  ({ id, status, created_at: created, ready_at, items: [] }) as never;

describe('kitchenLogic', () => {
  it('sütunlar: mutfaktakiler eskiden yeniye, hazırlar son 30 dk ve yeniden eskiye', () => {
    const c = kitchenColumns([
      o('b', 'in_kitchen', '2026-09-15T17:50:00Z'), o('a', 'in_kitchen', '2026-09-15T17:40:00Z'),
      o('r1', 'ready', '2026-09-15T17:20:00Z', '2026-09-15T17:45:00Z'),
      o('r2', 'ready', '2026-09-15T17:10:00Z', '2026-09-15T17:20:00Z'),   // 40 dk önce hazır → gizli
      o('r3', 'ready', '2026-09-15T17:30:00Z', '2026-09-15T17:55:00Z')], now);
    expect(c.active.map((x: { id: string }) => x.id)).toEqual(['a', 'b']);
    expect(c.ready.map((x: { id: string }) => x.id)).toEqual(['r3', 'r1']);
  });
  it('süre tonu 10 / 20 dk eşiklerinde değişir', () => {
    expect(elapsedTone('2026-09-15T17:50:01Z', now)).toBe('ok');
    expect(elapsedTone('2026-09-15T17:49:00Z', now)).toBe('warn');
    expect(elapsedTone('2026-09-15T17:39:59Z', now)).toBe('late');
  });
  it('geri alma yalnız 30 sn içinde', () => {
    expect(canUndo({ status: 'ready', ready_at: '2026-09-15T17:59:31Z' } as never, now)).toBe(true);
    expect(canUndo({ status: 'ready', ready_at: '2026-09-15T17:59:29Z' } as never, now)).toBe(false);
  });
  it('yeni sipariş kimliklerini bulur (ses için)', () => {
    expect(newOrderIds(new Set(['a']), [o('a', 'in_kitchen', ''), o('b', 'in_kitchen', '')])).toEqual(['b']);
  });
  it('kalem satırları kullanıcının dilinde', () => {
    const item = {
      variant_name_de: 'Kalb', variant_name_tr: 'Dana', note: 'Soße extra',
      removed_ingredients: [{ id: 'z', name_de: 'Zwiebeln', name_tr: 'Soğan' }],
      selected_options: [
        { group_id: 's', group_name_de: 'Soße', group_name_tr: 'Sos', ticket_format: 'label_values', group_sort: 1,
          option_id: 'a', name_de: 'Knoblauch', name_tr: 'Sarımsaklı', price_delta_cents: 0 },
        { group_id: 'e', group_name_de: 'Extras', group_name_tr: 'Ekstralar', ticket_format: 'plus_each', group_sort: 2,
          option_id: 'w', name_de: 'Extra Weichkäse', name_tr: 'Ekstra beyaz peynir', price_delta_cents: 100 }],
    } as never;
    expect(itemLines(item, 'de')).toEqual({ variant: 'Kalb', without: 'OHNE: Zwiebeln',
      options: ['Soße: Knoblauch', '+ Extra Weichkäse'], note: 'Soße extra' });
    expect(itemLines(item, 'tr')).toEqual({ variant: 'Dana', without: 'ÇIKAR: Soğan',
      options: ['Sos: Sarımsaklı', '+ Ekstra beyaz peynir'], note: 'Soße extra' });
  });
});
```
Run: `npm test -w apps/web -- kitchenLogic` → Expected: FAIL

- [ ] **Adım 2: `kitchenLogic.ts` dosyasını yaz**

> **Not:** `itemLines` Plan 2 · Görev 13'te `apps/web/src/features/common/itemLines.ts` olarak zaten yazıldı ve test edildi. Burada **yeniden yazma**; `kitchenLogic.ts` içinde yalnızca `export { itemLines } from '../common/itemLines';` satırı olsun. Aşağıdaki gövde referans içindir. Kullanılmayan importlar (`Locale`, `OrderItemView`) kaldırılır.
```ts
import type { Locale } from '@ramos/shared';
import type { OrderItemView, OrderView } from '../../data/orders';

const MIN = 60_000;
export function kitchenColumns(orders: OrderView[], now: Date) {
  const t = now.getTime();
  const active = orders.filter((o) => o.status === 'in_kitchen')
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  const ready = orders.filter((o) => o.status === 'ready' && o.ready_at && t - Date.parse(o.ready_at) <= 30 * MIN)
    .sort((a, b) => (b.ready_at ?? '').localeCompare(a.ready_at ?? ''));
  return { active, ready };
}
export function elapsedTone(createdAt: string, now: Date): 'ok' | 'warn' | 'late' {
  const m = (now.getTime() - Date.parse(createdAt)) / MIN;
  return m <= 10 ? 'ok' : m <= 20 ? 'warn' : 'late';
}
export const canUndo = (o: Pick<OrderView, 'status' | 'ready_at'>, now: Date): boolean =>
  o.status === 'ready' && !!o.ready_at && now.getTime() - Date.parse(o.ready_at) <= 30_000;
export const newOrderIds = (prev: Set<string>, next: OrderView[]): string[] =>
  next.filter((o) => !prev.has(o.id)).map((o) => o.id);

export function itemLines(item: OrderItemView, locale: Locale) {
  const n = (de: string, tr: string | null) => (locale === 'tr' && tr ? tr : de);
  const groups = new Map<string, { label: string; format: string; values: string[] }>();
  [...item.selected_options].sort((a, b) => a.group_sort - b.group_sort).forEach((o) => {
    const g = groups.get(o.group_id) ?? { label: n(o.group_name_de, o.group_name_tr), format: o.ticket_format, values: [] };
    g.values.push(n(o.name_de, o.name_tr));
    groups.set(o.group_id, g);
  });
  const options = [...groups.values()].flatMap((g) =>
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
Run: testler PASS.

- [ ] **Adım 3: Kart bileşeni testi (kırmızı → yeşil)**

`OrderCard.test.tsx`:
- Bir `OrderView` render edilir (tablo "Tisch 12", `#047`, garson "Ahmet", bir kalem: 2x 05 Drehspieß Sandwich, Kalb, OHNE Zwiebeln; bir iptal edilmiş kalem).
- Beklentiler:
  1. `TISCH 12` başlığı `lang="de"` kapsayıcıdadır.
  2. `OHNE: Zwiebeln` satırı `data-tone="danger"` taşır.
  3. İptal edilmiş kalem `line-through` sınıfı ve "STORNO" rozetiyle gösterilir.
  4. `HAZIR` butonuna basınca `onReady('<id>')` çağrılır.
  5. `round_no > 1` iken "NACHBESTELLUNG" / "EK SİPARİŞ" etiketi görünür.

`OrderCard.tsx`:
- **Üst şerit:** masa adı (büyük harf, `text-3xl font-extrabold`, `lang="de"`), `formatOrderNo`, garson adı, geçen süre. Süre, `elapsedTone` renginde ve dakikada bir güncellenen bir `Elapsed` bileşeniyle gösterilir.
- **Kalem satırları:** `text-[22px] font-bold`, adet + kod + ad. Altında `itemLines` çıktısı: OHNE kırmızı zemin + beyaz metin, notlar sarı.
- **Alt:** tam genişlikte, ≥ 64 px **HAZIR** butonu (lime). Sipariş `ready` durumundaysa "Geri al" (30 sn) ya da "Hazır ✓" etiketi.
- **Yazdırma rozeti:** `print.status` `failed` ise kırmızı "Basılamadı · Tekrar dene" (`useRetryJob`), `pending`/`printing` ise mavi "Kuyrukta". Menüde "Tekrar bas" (`useReprint`).

- [ ] **Adım 4: Sayfa, ses, Wake Lock, tükendi paneli**

`useWakeLock.ts`:
```ts
import { useEffect } from 'react';
export function useWakeLock(enabled: boolean) {
  useEffect(() => {
    if (!enabled || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    const request = async () => { try { lock = await navigator.wakeLock.request('screen'); } catch { /* izin yok */ } };
    const onVis = () => { if (document.visibilityState === 'visible') void request(); };
    void request();
    document.addEventListener('visibilitychange', onVis);
    return () => { document.removeEventListener('visibilitychange', onVis); void lock?.release(); };
  }, [enabled]);
}
```
`useSoundAlert.ts`:
- `unlock()`: İlk dokunuşta `AudioContext` oluşturur ve kısa, sessiz bir ses çalarak kilidi açar.
- `beep()`: 880 Hz, 180 ms, iki kez çalar; `OscillatorNode` kullanılır, dosya gerekmez.
- Kilit durumu `localStorage`'da tutulmaz; her açılışta yeniden etkinleştirme gerekir.

`KitchenPage.tsx`:
- `useBroadcastInvalidation(['orders','menu','printer-status','settings'])` ile bağlanır. Durum `offline` ise üstte kırmızı "Bağlantı yok" şeridi çıkar.
- `usePrinterStatus().problem` doluysa turuncu ya da kırmızı yazıcı şeridi gösterilir. Metin `printer.<problem>` anahtarından gelir (anahtarlar Plan 2 · Görev 13'te eklendi; istenirse doğrudan `<ConnectionBanners>` kullanılır).
- İlk açılışta tam ekran **"Mutfak ekranını başlat"** katmanı çıkar. Dokunulunca:
  1. `unlock()` çağrılır.
  2. `useWakeLock(true)` açılır.
  3. Mümkünse `document.documentElement.requestFullscreen()` denenir.
- Yeni sipariş gelince `newOrderIds` sonucu boş değilse `beep()` çalar. İlk yüklemede ses çalmaz.
- **Düzen:** Solda `active` kartları, `grid-cols-[repeat(auto-fill,minmax(320px,1fr))]` ızgarası. Sağda 360 px'lik "Hazır" sütunu: küçük kartlar, geri alma butonu.
- `SoldOutDrawer`: Sağ üstteki "Tükendi" butonuyla açılır. Ürünler kategorilere göre listelenir, her birinde anahtar (`useSetSoldOut`) ve arama kutusu vardır.

- [ ] **Adım 5: E2E ve ekran görüntüsü (tablet 1280×800)**

`apps/web/e2e/kitchen.spec.ts`:
1. Hazırlık: garson hesabıyla API üzerinden (`@supabase/supabase-js` + test kullanıcısı) `Test-Tisch`'e sipariş gönder: 05 Kalb, OHNE Zwiebeln, Knoblauch.
2. `test-kitchen` ile giriş yap. "Mutfak ekranını başlat"a dokun.
3. Kartın **2 sn** içinde göründüğünü doğrula; kartta `OHNE: Zwiebeln` ya da `ÇIKAR: Soğan` olmalı.
4. HAZIR'a bas → kart "Hazır" sütununa geçmeli. "Geri al"a bas → kart geri gelmeli.
5. Ekran görüntüleri: `docs/screenshots/m4-kds-1280.png` ve hazır sütunu dolu hali.
6. Temizlik: `cleanupFixtureOrders` eşdeğeri (test masası verisi). Plan 1'deki SQL yardımcısını `apps/web/e2e/helpers.ts` içinde yeniden kullan.

Run: `npm run e2e -w apps/web -- kitchen --project=tablet` → Expected: PASS. Görüntüleri incele:
- 1–2 m'den okunabilirlik
- OHNE vurgusu
- Süre renkleri

- [ ] **Adım 6: Commit + M4 raporu**
```bash
git add apps/web/src/features/kitchen apps/web/e2e/kitchen.spec.ts apps/web/src/i18n docs/screenshots
git commit -m "feat(kitchen): canlı mutfak ekranı — kartlar, süre renkleri, HAZIR/geri al, tükendi, ses, wake lock"
```

---

## Görev 17: Fiş satır modeli — `renderTicket(payload) → Line[]`

**Files:**
- Create: `packages/shared/src/ticket.ts`
- Modify: `packages/shared/src/index.ts` (`export * from './ticket';`)
- Test: `packages/shared/src/ticket.test.ts`

**Interfaces:**
- Consumes: Plan 1'deki payload şekli (`build_order_payload`, `build_storno_payload`, `table_move` ve `test` payload'ları)
- Produces:
  - Payload tipi:
```ts
export interface TicketPayload {
  kind: 'order' | 'addition' | 'storno' | 'table_move' | 'reprint' | 'test';
  header: string; footer?: string; table: string; orderNo?: number; round?: number; createdAt: string;
  waiter?: string; note?: string | null; reason?: string; refOrderNo?: number; reprintOf?: string;
  fromTable?: string; toTable?: string; openOrderNos?: number[];
  settings?: { host: string; port: number; codepage: string; codepageNumber: number; transliterate: boolean };
  sampleLine?: string;
  items: { qty: number; code: string | null; name: string; isBeverage: boolean; variant: string | null;
           without: string[]; groups: { label: string; format: 'label_values' | 'values_only' | 'plus_each'; values: string[] }[];
           note: string | null }[];
}
```
  - Satır tipi:
```ts
export type Line =
  | { kind: 'text'; text: string; align?: 'left' | 'center'; bold?: boolean; invert?: boolean; height?: 1 | 2; width?: 1 | 2 }
  | { kind: 'rule' }
  | { kind: 'feed'; lines: number };
```
  - Fonksiyonlar:
    - `renderTicket(p: TicketPayload, opts?: { columns?: number; transliterate?: boolean }): Line[]` (varsayılan 48 kolon)
    - `wrap(text: string, width: number, indent: number): string[]`
    - `transliterate(s: string): string`
    - `sanitize(s: string): string`: `→`, `…` ve akıllı tırnakları ASCII'ye çevirir; `·` kalır
    - `linesToText(lines: Line[], columns?: number): string` — admin önizlemesi ve `dry-run` için düz metin

**Satır kuralları (spec §9):**
- **Başlık ve bant:**
  - Başlık ortalı ve kalın.
  - Tür bandı ortalı, ters renk, kalın, 2× yükseklik:
    - `order` türünde `round > 1` ise `NACHBESTELLUNG`
    - `addition` → `NACHBESTELLUNG`
    - `storno` → `*** STORNO ***`
    - `table_move` → `TISCHWECHSEL`
    - `reprint` → `NACHDRUCK`
    - `test` → `TESTDRUCK`
  - `order` türünde `round === 1` ise bant yok.
- **Masa ve meta:**
  - Masa satırı `toLocaleUpperCase('de-DE')`, 2×2 boyut, kalın ("TISCH 12").
  - Meta: `Bestellung #047` (+ `  Runde 2` eğer round > 1) ve `15.09.2026 19:42  Kellner: Ahmet` (Europe/Berlin).
- **Kalemler:**
  - Önce yiyecekler, sonra `rule` + `GETRÄNKE` (kalın) + içecekler.
  - Kalem satırı: `2x 05 Drehspieß Sandwich`, 2× yükseklik, kalın. 48 kolonda 3 boşluk asılı girintiyle kaydırılır.
  - Alt satırlar 3 boşluk girintilidir:
    - varyant
    - `OHNE: …` (ters renk + kalın)
    - gruplar: `label_values` → `Soße: A + B`, `values_only` → `A, B`, `plus_each` → her biri `+ A`
    - `Hinweis: …`
- **Sipariş sonu:** `rule`, sipariş notu `Hinweis: …` (kalın), footer (ortalı, varsa), `feed 3`.
- **Diğer türler:**
  - STORNO: meta yerine `zu Bestellung #047`, kalemler yalnızca iptal edilenler, sonda `Grund: …` (kalın).
  - TISCHWECHSEL: `TISCH 3 -> TISCH 5` (2× yükseklik, kalın) + `Offene Bestellungen: #047, #052`.
  - TESTDRUCK: `Drucker: <host>:<port>`, `Zeichensatz: <codepage> (<no>)`, `Transliteration: an/aus`, `sampleLine`, ardından örnek kalemler.

- [x] **Adım 1: Testleri yaz (kırmızı)**

`packages/shared/src/ticket.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { linesToText, renderTicket, transliterate, wrap, type TicketPayload } from './ticket';

const order: TicketPayload = {
  kind: 'order', header: "RAMO'S · KÜCHE", footer: '', table: 'Tisch 12', orderNo: 47, round: 2,
  createdAt: '2026-09-15T17:42:10Z', waiter: 'Ahmet', note: 'Kinderstuhl',
  items: [
    { qty: 3, code: null, name: 'Cola 0,33 l', isBeverage: true, variant: null, without: [], groups: [], note: null },
    { qty: 2, code: '05', name: 'Drehspieß Sandwich', isBeverage: false, variant: 'Kalb', without: ['Zwiebeln', 'Tomaten'],
      groups: [{ label: 'Soße', format: 'label_values', values: ['Knoblauch', 'Kräuter'] },
               { label: 'Schärfe', format: 'values_only', values: ['scharf (Chili)'] },
               { label: 'Extras', format: 'plus_each', values: ['Extra Weichkäse'] }], note: 'Soße extra' },
  ],
};

describe('renderTicket', () => {
  const lines = renderTicket(order);
  const texts = lines.flatMap((l) => (l.kind === 'text' ? [l.text] : l.kind === 'rule' ? ['---'] : []));

  it('başlık, ek sipariş bandı, masa ve meta', () => {
    expect(lines[0]).toMatchObject({ kind: 'text', text: "RAMO'S · KÜCHE", align: 'center', bold: true });
    expect(lines[1]).toMatchObject({ text: 'NACHBESTELLUNG', invert: true, height: 2 });
    expect(lines[2]).toMatchObject({ text: 'TISCH 12', height: 2, width: 2, bold: true });
    expect(texts).toContain('Bestellung #047  Runde 2');
    expect(texts).toContain('15.09.2026 19:42  Kellner: Ahmet');   // 17:42Z = 19:42 Berlin (CEST)
  });

  it('yiyecek önce, içecek GETRÄNKE altında; OHNE ters renk', () => {
    const iFood = texts.indexOf('2x 05 Drehspieß Sandwich');
    const iBev = texts.indexOf('GETRÄNKE');
    expect(iFood).toBeGreaterThan(0);
    expect(iBev).toBeGreaterThan(iFood);
    expect(texts[iBev + 1]).toBe('3x Cola 0,33 l');
    expect(lines.find((l) => l.kind === 'text' && l.text === '   OHNE: Zwiebeln, Tomaten'))
      .toMatchObject({ invert: true, bold: true });
    expect(texts).toEqual(expect.arrayContaining([
      '   Kalb', '   Soße: Knoblauch + Kräuter', '   scharf (Chili)', '   + Extra Weichkäse', '   Hinweis: Soße extra',
      'Hinweis: Kinderstuhl']));
    expect(lines.at(-1)).toEqual({ kind: 'feed', lines: 3 });
  });

  it('ilk turda bant yok; STORNO ve TISCHWECHSEL bantları', () => {
    expect(renderTicket({ ...order, round: 1 })[1]).toMatchObject({ text: 'TISCH 12' });
    const st = renderTicket({ ...order, kind: 'storno', refOrderNo: 47, reason: 'Gast hat storniert' });
    expect(st[1]).toMatchObject({ text: '*** STORNO ***' });
    expect(linesToText(st)).toContain('zu Bestellung #047');
    expect(linesToText(st)).toContain('Grund: Gast hat storniert');
    const mv = renderTicket({ ...order, kind: 'table_move', fromTable: 'Tisch 3', toTable: 'Tisch 5', openOrderNos: [47, 52], items: [] });
    expect(linesToText(mv)).toContain('TISCH 3 -> TISCH 5');
    expect(linesToText(mv)).toContain('Offene Bestellungen: #047, #052');
  });

  it('48 kolonu aşan satır asılı girintiyle kaydırılır', () => {
    expect(wrap('2x 76 Karışık Izgara (3 Personen) mit Pommes oder Reis und extra Salat', 48, 3))
      .toEqual(['2x 76 Karışık Izgara (3 Personen) mit Pommes oder', '   Reis und extra Salat']);
    for (const l of renderTicket(order)) if (l.kind === 'text') expect(l.text.length * (l.width ?? 1)).toBeLessThanOrEqual(48);
  });

  it('transliterasyon Türkçe harfleri ASCII yapar, Almanca harflere dokunmaz', () => {
    expect(transliterate('Kuzu Şiş · İşkembe · Yoğurtlu · Kräuter')).toBe('Kuzu Sis · Iskembe · Yogurtlu · Kräuter');
    expect(linesToText(renderTicket({ ...order, items: [{ ...order.items[1]!, name: 'Kuzu Şiş' }] }, { transliterate: true })))
      .toContain('2x 05 Kuzu Sis');
  });
});
```
Run: `npm test -w @ramos/shared -- ticket` → Expected: FAIL

- [x] **Adım 2: Uygula**

`packages/shared/src/ticket.ts` — yapı:
```ts
const TR_MAP: Record<string, string> = { ş: 's', Ş: 'S', ğ: 'g', Ğ: 'G', ı: 'i', İ: 'I' };
export const transliterate = (s: string) => s.replace(/[şŞğĞıİ]/g, (c) => TR_MAP[c]!);
export const sanitize = (s: string) =>
  s.replace(/→/g, '->').replace(/…/g, '...').replace(/[„“”]/g, '"').replace(/[‚‘’]/g, "'");

export function wrap(text: string, width: number, indent: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let cur = '';
  for (const w of words) {
    const candidate = cur ? `${cur} ${w}` : w;
    const limit = out.length ? width - indent : width;
    if (candidate.length <= limit) cur = candidate;
    else { out.push(cur); cur = w.slice(0, width - indent); }
  }
  if (cur) out.push(cur);
  return out.map((l, i) => (i === 0 ? l : `${' '.repeat(indent)}${l}`));
}

const fmt = (iso: string) => {
  const d = new Date(iso);
  const date = d.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric' });
  const time = d.toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' });
  return `${date} ${time}`;
};
const no = (n: number) => `#${String(n).padStart(3, '0')}`;
const BANNER: Record<string, string> = {
  addition: 'NACHBESTELLUNG', storno: '*** STORNO ***', table_move: 'TISCHWECHSEL', reprint: 'NACHDRUCK', test: 'TESTDRUCK',
};
```
`renderTicket` adımları:
1. Tüm metinlere `sanitize` uygulanır; `opts.transliterate` açıksa ayrıca `transliterate` uygulanır.
2. Kurallar yukarıdaki sırayla eklenir.
3. Kalem satırı, `wrap(…, columns, 3)` ile bölünüp her parça ayrı `text` satırı olur. Kalem satırlarının ilk parçası `height: 2, bold: true` taşır, devamı da aynı stili korur.
4. Alt satırlar `wrap(\`   ${metin}\`, columns, 6)` ile girintilenir.

`linesToText`:
- `rule` → 48 × `-`.
- `center` metin boşlukla ortalanır.
- `width: 2` metin iki kat genişlik varsayılarak ortalanmaz, olduğu gibi yazılır.

Run: `npm test -w @ramos/shared` → Expected: PASS (ticket + önceki testler)

- [x] **Adım 3: Commit**
```bash
git add packages/shared/src/ticket.ts packages/shared/src/ticket.test.ts packages/shared/src/index.ts
git commit -m "feat(shared): Almanca mutfak fişi satır modeli — türler, bantlar, 48 kolon kaydırma, transliterasyon"
```

---

## Görev 18: Yazdırma ajanı çekirdeği — ESC/POS kodlama, TCP gönderimi, durum okuma, sahte yazıcı

**Files:**
- Create: `apps/print-agent/package.json`, `tsconfig.json`, `.env.example`, `vitest.config.ts`
- Create: `apps/print-agent/src/escpos.ts`, `src/status.ts`, `src/transport.ts`, `src/fake-printer.ts`
- Test: `src/escpos.test.ts`, `src/status.test.ts`, `src/transport.test.ts`

**Interfaces:**
- Consumes: `renderTicket`, `Line` (Görev 17)
- Produces:
  - Kodlama (`escpos.ts`):
    - `encodeLines(lines: Line[], opts: EncodeOptions): Uint8Array`
    - `EncodeOptions` = `{ codepage: string; codepageNumber: number; columns?: number }`
    - Çıktı: init (`1B 40 1C 2E` …) + `ESC t <no>` + stiller + metin + besleme + `1D 56 42 00`
  - Durum (`status.ts`):
    - `parseStatus(bytes: Uint8Array): PrinterState`
    - `PrinterState` = `{ known, offline, cover_open, paper_end, paper_near_end, error, raw }`
    - `blockingProblem(s: PrinterState): 'offline' | 'cover_open' | 'paper_end' | null`
  - Taşıma (`transport.ts`):
    - `class PrinterError extends Error { code: 'offline' | 'timeout' | 'io' | 'cover_open' | 'paper_end' }`
    - `queryStatus(host, port, t?: { connectMs?: number; replyMs?: number }): Promise<PrinterState>` → bağlanamazsa `offline` fırlatır
    - `sendBytes(host, port, bytes, t?: { connectMs?: number }): Promise<void>`
    - `printWithChecks(host, port, bytes): Promise<{ before: PrinterState; after: PrinterState }>` → ön kontrolde engelleyici sorun varsa **göndermeden** `PrinterError` fırlatır
  - Sahte yazıcı (`fake-printer.ts`): `startFakePrinter({ port?: number; status?: [number, number, number]; silent?: boolean }): Promise<{ port: number; jobs: Uint8Array[]; setStatus(s): void; stop(): Promise<void> }>`

- [x] **Adım 1: Paketi oluştur**

`apps/print-agent/package.json`:
```json
{
  "name": "@ramos/print-agent",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "agent": "tsx src/cli.ts run",
    "agent:dry-run": "tsx src/cli.ts dry-run",
    "agent:test-print": "tsx src/cli.ts test-print",
    "agent:status": "tsx src/cli.ts status",
    "agent:fake-printer": "tsx src/cli.ts fake-printer",
    "build": "node build.mjs",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": { "@ramos/shared": "*", "@supabase/supabase-js": "^2", "@point-of-sale/receipt-printer-encoder": "^3" },
  "devDependencies": { "tsx": "*", "esbuild": "*" }
}
```
`npm i -w apps/print-agent` ile kur. `tsconfig.json` base'i genişletir; `lib` alanına `["ES2022"]` ve `types: ["node"]` eklenir.

`.env.example`: `SUPABASE_URL=`, `SUPABASE_ANON_KEY=`, `AGENT_EMAIL=`, `AGENT_PASSWORD=`, `AGENT_ID=ramos-pc-1`, `LOG_DIR=`.

Not: `tsx watch` TTY'siz arka planda takılabiliyor; geliştirmede **watch kullanma**.

- [x] **Adım 2: Testleri yaz (kırmızı)**

`src/status.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { blockingProblem, parseStatus } from './status';

describe('parseStatus (DLE EOT 1/2/4)', () => {
  it('normal: 0x12 0x12 0x12', () => {
    const s = parseStatus(Uint8Array.from([0x12, 0x12, 0x12]));
    expect(s).toMatchObject({ known: true, offline: false, cover_open: false, paper_end: false, paper_near_end: false });
    expect(blockingProblem(s)).toBeNull();
  });
  it('kapak açık, kağıt bitti, kağıt azaldı', () => {
    expect(parseStatus(Uint8Array.from([0x1a, 0x16, 0x12]))).toMatchObject({ offline: true, cover_open: true });
    expect(blockingProblem(parseStatus(Uint8Array.from([0x12, 0x32, 0x72])))).toBe('paper_end');
    expect(parseStatus(Uint8Array.from([0x12, 0x12, 0x1e]))).toMatchObject({ paper_near_end: true, paper_end: false });
  });
  it('eksik yanıt = bilinmiyor, engellemez', () => {
    const s = parseStatus(Uint8Array.from([0x12]));
    expect(s.known).toBe(false);
    expect(blockingProblem(s)).toBeNull();
  });
});
```
`src/escpos.test.ts`:
```ts
import { renderTicket } from '@ramos/shared';
import { describe, expect, it } from 'vitest';
import { encodeLines } from './escpos';

const hex = (b: Uint8Array) => Buffer.from(b).toString('hex');
const bytes = (s: string) => Buffer.from(s.replace(/\s/g, ''), 'hex').toString('hex');

describe('encodeLines (Xprinter)', () => {
  const lines = renderTicket({
    kind: 'order', header: 'KÜCHE', table: 'Tisch 1', orderNo: 1, round: 1, createdAt: '2026-09-15T17:00:00Z',
    waiter: 'Ali', note: null,
    items: [{ qty: 1, code: '59', name: 'Kuzu Şiş', isBeverage: false, variant: null, without: ['Zwiebeln'],
              groups: [{ label: 'Soße', format: 'label_values', values: ['Kräuter'] }], note: null }],
  });
  const out = hex(encodeLines(lines, { codepage: 'cp857', codepageNumber: 61 }));

  it('init: ESC @ + FS . ve ESC t 61', () => {
    expect(out.startsWith(bytes('1b40 1c2e'))).toBe(true);
    expect(out).toContain(bytes('1b74 3d'));
  });
  it('CP857: Ş=9E ş=9F ä=84', () => {
    expect(out).toContain(bytes('4b757a75 20 9e 69 9f'));   // "Kuzu Şiş"
    expect(out).toContain(bytes('4b72 84 75746572'));        // "Kräuter"
  });
  it('OHNE satırı ters renk (GS B 1 … GS B 0)', () => {
    const i = out.indexOf(Buffer.from('OHNE: Zwiebeln').toString('hex'));
    expect(out.lastIndexOf(bytes('1d4201'), i)).toBeGreaterThan(-1);
    expect(out.indexOf(bytes('1d4200'), i)).toBeGreaterThan(i);
  });
  it('kısmi kesimle biter: GS V 66 0', () => expect(out.endsWith(bytes('1d564200'))).toBe(true));
});
```
`src/transport.test.ts`:
```ts
import { afterEach, describe, expect, it } from 'vitest';
import { startFakePrinter } from './fake-printer';
import { PrinterError, printWithChecks, queryStatus, sendBytes } from './transport';

let stop: (() => Promise<void>) | undefined;
afterEach(async () => { await stop?.(); stop = undefined; });

describe('transport (sahte yazıcı)', () => {
  it('baytları olduğu gibi iletir ve durum okur', async () => {
    const fp = await startFakePrinter({}); stop = fp.stop;
    await sendBytes('127.0.0.1', fp.port, Uint8Array.from([1, 2, 3]));
    await new Promise((r) => setTimeout(r, 50));
    expect(Array.from(fp.jobs.at(-1)!)).toEqual([1, 2, 3]);
    expect((await queryStatus('127.0.0.1', fp.port)).known).toBe(true);
  });
  it('kağıt bittiyse göndermez', async () => {
    const fp = await startFakePrinter({ status: [0x12, 0x32, 0x72] }); stop = fp.stop;
    await expect(printWithChecks('127.0.0.1', fp.port, Uint8Array.from([9]))).rejects.toMatchObject({ code: 'paper_end' });
    expect(fp.jobs).toHaveLength(0);
  });
  it('kapalı porta bağlanamazsa offline', async () => {
    await expect(queryStatus('127.0.0.1', 1, { connectMs: 500 })).rejects.toBeInstanceOf(PrinterError);
  });
  it('durum yanıtı vermeyen yazıcı "bilinmiyor" sayılır ve basılır', async () => {
    const fp = await startFakePrinter({ silent: true }); stop = fp.stop;
    const r = await printWithChecks('127.0.0.1', fp.port, Uint8Array.from([7]));
    expect(r.before.known).toBe(false);
    await new Promise((res) => setTimeout(res, 50));
    expect(fp.jobs.some((j) => j.includes(7))).toBe(true);
  });
});
```
Run: `npm test -w @ramos/print-agent` → Expected: FAIL

- [x] **Adım 3: Uygula**

`src/status.ts`:
```ts
export interface PrinterState {
  known: boolean; offline: boolean; cover_open: boolean; paper_end: boolean; paper_near_end: boolean; error: boolean; raw: string;
}
export function parseStatus(b: Uint8Array): PrinterState {
  const raw = Buffer.from(b).toString('hex');
  if (b.length < 3) return { known: false, offline: false, cover_open: false, paper_end: false, paper_near_end: false, error: false, raw };
  const [s1, s2, s4] = [b[0]!, b[1]!, b[2]!];
  return {
    known: true, offline: (s1 & 0x08) !== 0, cover_open: (s2 & 0x04) !== 0,
    paper_end: (s2 & 0x20) !== 0 || (s4 & 0x60) !== 0, paper_near_end: (s4 & 0x0c) !== 0,
    error: (s2 & 0x40) !== 0, raw,
  };
}
export const blockingProblem = (s: PrinterState): 'offline' | 'cover_open' | 'paper_end' | null =>
  !s.known ? null : s.paper_end ? 'paper_end' : s.cover_open ? 'cover_open' : s.offline ? 'offline' : null;
```
`src/transport.ts`:
```ts
import net from 'node:net';
import { blockingProblem, parseStatus, type PrinterState } from './status';

export class PrinterError extends Error {
  constructor(public code: 'offline' | 'timeout' | 'io' | 'cover_open' | 'paper_end', msg?: string) { super(msg ?? code); }
}
const STATUS_QUERY = Uint8Array.from([0x10, 0x04, 0x01, 0x10, 0x04, 0x02, 0x10, 0x04, 0x04]);

function connect(host: string, port: number, connectMs: number): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const s = net.createConnection({ host, port });
    const t = setTimeout(() => { s.destroy(); reject(new PrinterError('offline', 'connect timeout')); }, connectMs);
    s.once('connect', () => { clearTimeout(t); resolve(s); });
    s.once('error', (e) => { clearTimeout(t); reject(new PrinterError('offline', e.message)); });
  });
}

export async function queryStatus(host: string, port: number, { connectMs = 3000, replyMs = 1000 } = {}): Promise<PrinterState> {
  const s = await connect(host, port, connectMs);
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    const done = () => { s.destroy(); resolve(parseStatus(new Uint8Array(Buffer.concat(chunks)))); };
    const t = setTimeout(done, replyMs);
    s.on('data', (d) => { chunks.push(d); if (Buffer.concat(chunks).length >= 3) { clearTimeout(t); done(); } });
    s.write(STATUS_QUERY);
  });
}

export async function sendBytes(host: string, port: number, bytes: Uint8Array, { connectMs = 3000 } = {}): Promise<void> {
  const s = await connect(host, port, connectMs);
  await new Promise<void>((resolve, reject) => {
    s.once('error', (e) => reject(new PrinterError('io', e.message)));
    s.end(bytes, () => resolve());
  });
  await new Promise((r) => s.once('close', r));
}

export async function printWithChecks(host: string, port: number, bytes: Uint8Array) {
  const before = await queryStatus(host, port);
  const problem = blockingProblem(before);
  if (problem) throw new PrinterError(problem);
  await sendBytes(host, port, bytes);
  const after = await queryStatus(host, port).catch(() => before);
  return { before, after };
}
```
`src/escpos.ts`:
```ts
import type { Line } from '@ramos/shared';
import ReceiptPrinterEncoder from '@point-of-sale/receipt-printer-encoder';

export interface EncodeOptions { codepage: string; codepageNumber: number; columns?: number }

export function encodeLines(lines: Line[], { codepage, codepageNumber, columns = 48 }: EncodeOptions): Uint8Array {
  const e = new ReceiptPrinterEncoder({
    language: 'esc-pos', printerModel: 'xprinter-xp-t80q', columns,
    codepageMapping: { cp437: 0, cp858: 19, windows1252: 16, cp857: 61, [codepage]: codepageNumber },
  });
  let r = e.initialize().codepage(codepage);
  for (const l of lines) {
    if (l.kind === 'rule') { r = r.rule(); continue; }
    if (l.kind === 'feed') { r = r.newline(l.lines); continue; }
    r = r.align(l.align ?? 'left').bold(!!l.bold).invert(!!l.invert).width(l.width ?? 1).height(l.height ?? 1)
      .text(l.text).newline()
      .invert(false).bold(false).width(1).height(1);
  }
  return new Uint8Array([...r.newline(3).encode(), 0x1d, 0x56, 0x42, 0x00]);
}
```
Kütüphane API'si (`width`, `height`, `invert`, `rule`, `newline(n)`, `codepageMapping`) sürüme göre küçük farklar gösterebilir. **Yazmadan önce kurulu sürümün README'sini ve tip tanımlarını oku**, farklıysa çağrıları uyarla. `escpos.test` baytları sözleşmedir; test yeşil olmalı.

`initialize()` çıktısında `1C 2E` (`FS .`) yoksa `r.raw([0x1c, 0x2e])` ile ekle; test bunu doğrular.

`src/fake-printer.ts`:
- `net.createServer` her bağlantıdaki baytları biriktirir.
- Gelen verideki her `10 04 n` üçlüsüne `status` dizisinden karşılık gelen baytı yanıt verir (`n = 1` → `status[0]`, `2` → `[1]`, `4` → `[2]`). `silent` açıksa yanıt vermez.
- Bağlantı kapanınca durum sorgusu dışındaki baytlar `jobs` dizisine eklenir.
- Port 0 ile açılır; gerçek port `server.address()`'ten alınır.

Run: `npm test -w @ramos/print-agent` → Expected: PASS (status, escpos, transport)

- [x] **Adım 4: Commit**
```bash
git add apps/print-agent package.json package-lock.json
git commit -m "feat(agent): ESC/POS kodlama (Xprinter CP857=61, FS ., GS V 66 0), TCP gönderim, DLE EOT durum, sahte yazıcı"
```

---

## Görev 19: Ajan döngüsü — kuyruk, yazıcı kapısı, heartbeat, ayar yenileme, CLI

**Files:**
- Create: `apps/print-agent/src/config.ts`, `src/log.ts`, `src/api.ts`, `src/agent.ts`, `src/cli.ts`
- Test: `src/agent.test.ts`, `src/log.test.ts`

**Interfaces:**
- Consumes: `encodeLines`, `printWithChecks`, `queryStatus`, `PrinterError`, `startFakePrinter` (Görev 18); `renderTicket`, `linesToText` (Görev 17); RPC'ler `claim_print_job`, `complete_print_job`, `agent_heartbeat` (Plan 1)
- Produces:
  - **Ayarlar:**
    - `AgentSettings` = `{ host: string; port: number; codepage: string; codepageNumber: number; transliterate: boolean }`
  - **`AgentApi` arayüzü:**
    - `claim(): Promise<Job | null>`
    - `complete(id, ok, error?)`
    - `heartbeat(h: Heartbeat)`
    - `settings(): Promise<AgentSettings>`
    - `onJobs(cb)`, `onSettings(cb)`, `close()`
  - **Veri tipleri:**
    - `Job` = `{ id: string; type: string; payload: TicketPayload; attempts: number }`
    - `Heartbeat` = `{ reachable: boolean; state: PrinterState | null; error: string | null }`
  - **`createSupabaseApi(env): Promise<AgentApi>`:** printer kullanıcısıyla giriş yapar, `print-jobs` ve `settings` private kanallarını dinler.
  - **`class Agent`:**
    - Kurucu: `constructor(api: AgentApi, deps: { printer: PrinterPort; log: Logger; now?: () => Date }, opts?: { pollMs?: number; heartbeatMs?: number; idleCheckMs?: number })`
    - Yöntemler: `start()`, `stop()`, `drain(): Promise<number>` (bekleyen işleri sırayla basar, basılan sayıyı döndürür), `checkPrinter()`
  - **`PrinterPort`:**
    - `print(s: AgentSettings, bytes): Promise<{ before; after }>`
    - `status(s: AgentSettings): Promise<PrinterState>`
    - Gerçek uygulama `transport.ts`'i sarar.
  - **Logger:** `createLogger(dir: string | null): Logger` (`info`, `warn`, `error`). JSON satırlarını günlük dosyaya yazar; 7 günden eski dosyaları siler, 5 MB'ta dönüştürür.
  - **CLI:**
    - `run`
    - `dry-run [--limit 5]` → son işleri render edip konsola yazar, **durum değiştirmez**
    - `test-print [--host --port]`
    - `status [--host --port]`
    - `fake-printer [--port 9100]`

- [ ] **Adım 1: Döngü testlerini yaz (kırmızı)**

`src/agent.test.ts` — bellek içi sahte API ve Görev 18'deki sahte yazıcı kullanılır:
```ts
import { describe, expect, it, vi } from 'vitest';
import { Agent, type AgentApi, type Job } from './agent';
import { PrinterError } from './transport';

const settings = { host: '127.0.0.1', port: 9100, codepage: 'cp857', codepageNumber: 61, transliterate: false };
const job = (id: string, table = 'Tisch 12'): Job => ({ id, type: 'order', attempts: 0, payload: {
  kind: 'order', header: 'KÜCHE', table, orderNo: 1, round: 1, createdAt: '2026-09-15T17:00:00Z', waiter: 'Ali',
  note: null, items: [{ qty: 1, code: '05', name: 'Drehspieß Sandwich', isBeverage: false, variant: 'Kalb',
  without: ['Zwiebeln'], groups: [], note: null }] } });

function fakeApi(jobs: Job[]) {
  const api = {
    claim: vi.fn(async () => jobs.shift() ?? null),
    complete: vi.fn(async () => {}), heartbeat: vi.fn(async () => {}),
    settings: vi.fn(async () => settings), onJobs: vi.fn(), onSettings: vi.fn(), close: vi.fn(async () => {}),
  } satisfies AgentApi;
  return api;
}
const okState = { known: true, offline: false, cover_open: false, paper_end: false, paper_near_end: false, error: false, raw: '121212' };
const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

describe('Agent', () => {
  it('bekleyen işleri sırayla basar ve başarıyla kapatır', async () => {
    const api = fakeApi([job('a', 'Tisch 1'), job('b', 'Tisch 2')]);
    const printed: string[] = [];
    const printer = { status: vi.fn(async () => okState),
      print: vi.fn(async (_s: unknown, bytes: Uint8Array) => { printed.push(Buffer.from(bytes).toString('latin1')); return { before: okState, after: okState }; }) };
    const agent = new Agent(api, { printer, log });
    await agent.checkPrinter();
    expect(await agent.drain()).toBe(2);
    expect(printed[0]).toContain('TISCH 1');
    expect(printed[1]).toContain('TISCH 2');
    expect(api.complete).toHaveBeenNthCalledWith(1, 'a', true, undefined);
  });

  it('yazıcı sorunluyken iş sahiplenmez; heartbeat sorunu bildirir', async () => {
    const api = fakeApi([job('a')]);
    const printer = { status: vi.fn(async () => ({ ...okState, paper_end: true })), print: vi.fn() };
    const agent = new Agent(api, { printer, log });
    await agent.checkPrinter();
    expect(await agent.drain()).toBe(0);
    expect(api.claim).not.toHaveBeenCalled();
    await agent.sendHeartbeat();
    expect(api.heartbeat).toHaveBeenCalledWith(expect.objectContaining({ reachable: true, state: expect.objectContaining({ paper_end: true }) }));
  });

  it('yazıcıya ulaşılamıyorsa sahiplenmez, reachable=false', async () => {
    const api = fakeApi([job('a')]);
    const printer = { status: vi.fn(async () => { throw new PrinterError('offline'); }), print: vi.fn() };
    const agent = new Agent(api, { printer, log });
    await agent.checkPrinter();
    expect(await agent.drain()).toBe(0);
    await agent.sendHeartbeat();
    expect(api.heartbeat).toHaveBeenCalledWith(expect.objectContaining({ reachable: false }));
  });

  it('gönderim sırasında hata olursa işi hata ile kapatır ve devam etmez', async () => {
    const api = fakeApi([job('a'), job('b')]);
    const printer = { status: vi.fn(async () => okState), print: vi.fn(async () => { throw new PrinterError('io', 'reset'); }) };
    const agent = new Agent(api, { printer, log });
    await agent.checkPrinter();
    expect(await agent.drain()).toBe(0);
    expect(api.complete).toHaveBeenCalledWith('a', false, 'io: reset');
    expect(api.claim).toHaveBeenCalledTimes(1);
  });

  it('ayar değişince yeni host kullanılır', async () => {
    const jobs: Job[] = [];
    const api = fakeApi(jobs);
    const seen: string[] = [];
    const printer = { status: vi.fn(async () => okState),
      print: vi.fn(async (s: { host: string }) => { seen.push(s.host); return { before: okState, after: okState }; }) };
    const agent = new Agent(api, { printer, log });
    await agent.start();                              // kuyruk boş: başlangıç drain'i hemen biter
    await new Promise((r) => setTimeout(r, 0));
    const cb = api.onSettings.mock.calls[0]![0] as (s: typeof settings) => void;
    cb({ ...settings, host: '10.0.0.9' });
    jobs.push(job('a'));
    await agent.drain();
    await agent.stop();
    expect(seen).toEqual(['10.0.0.9']);
  });
});
```
`src/log.test.ts`:
- Geçici klasörde `createLogger` çağrılır.
- `info` → `agent-YYYY-MM-DD.log` dosyasına JSON satırı yazılır.
- 8 gün önce tarihli bir dosya oluşturulup logger yeniden başlatılınca silinir.
- `dir = null` ise yalnızca konsola yazılır ve hata vermez.

Run: `npm test -w @ramos/print-agent -- agent log` → Expected: FAIL

- [ ] **Adım 2: `agent.ts` dosyasını yaz**
```ts
import { renderTicket, type TicketPayload } from '@ramos/shared';
import { encodeLines } from './escpos';
import { blockingProblem, type PrinterState } from './status';
import { PrinterError } from './transport';

export interface AgentSettings { host: string; port: number; codepage: string; codepageNumber: number; transliterate: boolean }
export interface Job { id: string; type: string; payload: TicketPayload; attempts: number }
export interface Heartbeat { reachable: boolean; state: PrinterState | null; error: string | null }
export interface AgentApi {
  claim(): Promise<Job | null>;
  complete(id: string, ok: boolean, error?: string): Promise<void>;
  heartbeat(h: Heartbeat): Promise<void>;
  settings(): Promise<AgentSettings>;
  onJobs(cb: () => void): void;
  onSettings(cb: (s: AgentSettings) => void): void;
  close(): Promise<void>;
}
export interface PrinterPort {
  status(s: AgentSettings): Promise<PrinterState>;
  print(s: AgentSettings, bytes: Uint8Array): Promise<{ before: PrinterState; after: PrinterState }>;
}
export interface Logger { info(m: string, d?: object): void; warn(m: string, d?: object): void; error(m: string, d?: object): void }

export class Agent {
  private settings: AgentSettings | null = null;
  private reachable = false;
  private state: PrinterState | null = null;
  private lastError: string | null = null;
  private draining = false;
  private again = false;
  private timers: NodeJS.Timeout[] = [];

  constructor(private api: AgentApi, private deps: { printer: PrinterPort; log: Logger },
              private opts = { pollMs: 5000, heartbeatMs: 30000, idleCheckMs: 15000 }) {}

  async start() {
    this.settings = await this.api.settings();
    this.api.onSettings((s) => { this.settings = s; this.deps.log.info('settings reloaded', { host: s.host }); void this.checkPrinter(); });
    this.api.onJobs(() => void this.drain());
    await this.checkPrinter();
    await this.sendHeartbeat();
    this.timers.push(setInterval(() => void this.drain(), this.opts.pollMs));
    this.timers.push(setInterval(() => void this.checkPrinter(), this.opts.idleCheckMs));
    this.timers.push(setInterval(() => void this.sendHeartbeat(), this.opts.heartbeatMs));
    void this.drain();
  }

  async stop() { this.timers.forEach(clearInterval); this.timers = []; await this.api.close(); }

  async checkPrinter(): Promise<void> {
    this.settings ??= await this.api.settings();
    if (!this.settings.host) { this.reachable = false; this.lastError = 'printer_host_missing'; return; }
    try {
      this.state = await this.deps.printer.status(this.settings);
      this.reachable = true;
      this.lastError = blockingProblem(this.state);
      // Sorun düzelince bekleyenler bir sonraki 5 sn'lik drain turunda basılır; burada drain tetiklenmez (yarış yok).
    } catch (e) {
      this.reachable = false;
      this.state = null;
      this.lastError = e instanceof PrinterError ? e.code : String(e);
    }
  }

  async sendHeartbeat() {
    try { await this.api.heartbeat({ reachable: this.reachable, state: this.state, error: this.lastError }); }
    catch (e) { this.deps.log.warn('heartbeat failed', { e: String(e) }); }
  }

  private printerReady(): boolean { return !!this.settings?.host && this.reachable && !!this.state && !blockingProblem(this.state); }

  async drain(): Promise<number> {
    if (this.draining) { this.again = true; return 0; }
    this.draining = true;
    let printed = 0;
    try {
      do {
        this.again = false;
        while (this.printerReady()) {
          const job = await this.api.claim();
          if (!job) break;
          const s = this.settings!;
          try {
            const bytes = encodeLines(renderTicket(job.payload, { transliterate: s.transliterate }),
                                      { codepage: s.codepage, codepageNumber: s.codepageNumber });
            const { after } = await this.deps.printer.print(s, bytes);
            this.state = after;
            await this.api.complete(job.id, true, undefined);
            printed++;
            this.deps.log.info('printed', { job: job.id, type: job.type });
          } catch (e) {
            const msg = e instanceof PrinterError ? `${e.code}: ${e.message}` : `encode_error: ${String(e)}`;
            await this.api.complete(job.id, false, msg);
            this.deps.log.error('print failed', { job: job.id, msg });
            await this.checkPrinter();
            return printed;
          }
        }
      } while (this.again);
    } finally { this.draining = false; }
    return printed;
  }
}
```
Test 4'teki beklenti `'io: reset'` biçimindedir: `PrinterError('io', 'reset')` → `${code}: ${message}`. `checkPrinter` hatası testteki sahte `status` tarafından belirlenir.

- [ ] **Adım 3: `api.ts`, `config.ts`, `log.ts`, `cli.ts`**

`src/config.ts`:
- `.env` dosyası `process.argv[1]` klasöründe ya da çalışma klasöründe aranır; bulununca `process.loadEnvFile(path)` ile yüklenir.
- Zorunlu alanlar: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `AGENT_EMAIL`, `AGENT_PASSWORD`, `AGENT_ID`. Eksikse Türkçe hata mesajıyla çıkar.
- `LOG_DIR` boşsa `%LOCALAPPDATA%\RamosPrintAgent\logs` (Windows) ya da `./logs` kullanılır.

`src/api.ts` — `createSupabaseApi`:
```ts
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: true } });
const { error } = await sb.auth.signInWithPassword({ email: env.AGENT_EMAIL, password: env.AGENT_PASSWORD });
if (error) throw new Error(`Ajan girişi başarısız: ${error.message}`);
await sb.realtime.setAuth();
```
- `claim` → `rpc('claim_print_job', { p_agent_id })`, ilk satır ya da `null`.
- `complete` → `rpc('complete_print_job', { p_job_id, p_ok, p_error, p_agent_id })` — **dört argümanlı imza zorunlu** (Görev 7 / R49, R52: üç argümanlı sürüm kaldırıldı). `p_agent_id`, `claim_print_job`'a verilen değerle **birebir aynı** olmalı; yoksa sahiplik kontrolü devreye girmez. İş başka bir ajan tarafından geri alınmışsa çağrı `job_not_printing` hatası verir: ajan bunu **loglar ve devam eder**, baskı hatası saymaz.
- **Sahiplik kimliği (R55):** `claim`/`complete` çağrılarında kullanılan kimlik her ajan çalıştırmasına özgüdür (ör. `${AGENT_ID}#${başlangıç-zaman-damgası}`), `agent_heartbeat` ise sade `AGENT_ID` gönderir. Böylece aynı PC'de takılmış eski bir süreç ile yeniden başlayan süreç birbirinin işini kapatamaz. Ajan ayrıca tek örnek çalışmalıdır (kilit dosyası ya da mutex).
- `heartbeat` → `rpc('agent_heartbeat', { p_agent_id, p_version, p_host: os.hostname(), p_reachable, p_state, p_error })`.
- `settings()` → `settings` satırındaki `printer_*` alanları `AgentSettings`'e çevrilir.
- `onJobs` / `onSettings` → `print-jobs` ve `settings` private kanalları (`config: { private: true }`). `settings` olayında `settings()` yeniden okunur.
- `claim` / `complete` `401` dönerse bir kez yeniden giriş yapılır, sonra tekrar denenir.

`src/log.ts` — Görev 19 Adım 1'deki test davranışı.

`src/cli.ts`:
```ts
const [cmd = 'run', ...rest] = process.argv.slice(2);
const arg = (name: string) => { const i = rest.indexOf(`--${name}`); return i >= 0 ? rest[i + 1] : undefined; };
```
Komutlar:
- `run`:
  1. `createLogger` → `createSupabaseApi` → `new Agent(api, { printer: tcpPrinter, log }).start()`.
  2. `SIGINT`/`SIGTERM` → `stop()`.
  3. Başlangıçta sürüm, ajan kimliği ve host loglanır.
- `status`: host/port argümandan ya da ayarlardan alınır → `queryStatus` sonucu JSON olarak yazılır.
- `test-print`: Plan 1 `enqueue_test_print`'teki örnek payload'un yerel kopyası render edilir, `printWithChecks` ile doğrudan basılır. Kuyruğa girmez; kurulum ve tanı içindir.
- `dry-run`: `print_jobs`'tan son `--limit` iş okunur (printer SELECT yetkisi var) → her biri `linesToText(renderTicket(payload))` ile konsola yazılır. **Durum değiştirmez.**
- `fake-printer`:
  - `startFakePrinter({ port })` başlatılır.
  - Gelen her iş `fake-printer-out/<zaman>.bin` dosyasına yazılır.
  - Ayrıca `.txt` önizleme yazılır: baytlar CP857 olarak çözülür, ESC dizileri atılır.

`tcpPrinter` = `{ status: (s) => queryStatus(s.host, s.port), print: (s, b) => printWithChecks(s.host, s.port, b) }`.

Run: `npm test -w @ramos/print-agent` → Expected: PASS

- [ ] **Adım 4: Sahte yazıcıyla canlı döngü (DB'ye karşı)**

1. `npm run agent:fake-printer -w apps/print-agent -- --port 9100` (ayrı terminal).
2. `npm run db:sql -- "update public.settings set printer_host = '127.0.0.1' where id = 1"`.
3. `npm run agent -w apps/print-agent` (ayrı terminal).
4. Garson ekranından (ya da `db:test` fixture'ıyla) sipariş gönder.
5. **5 sn** içinde `fake-printer-out/*.txt` dosyasında `TISCH …`, `OHNE: …` satırları görünmeli.
6. `print_jobs.status = 'printed'` olmalı.
7. Sahte yazıcıyı durdur → ~15 sn içinde admin sorgusunda `printer_status.printer_reachable = false` olmalı.
8. Yazıcıyı yeniden başlat → kuyruktaki iş otomatik basılmalı.

Kanıt olarak konsol çıktısını ve ilgili SQL sorgularını rapora ekle.

- [ ] **Adım 5: Commit**
```bash
git add apps/print-agent
git commit -m "feat(agent): iş döngüsü — realtime+5sn yoklama, yazıcı kapısı, sıralı baskı, heartbeat, ayar yenileme, CLI"
```

---

## Görev 20: Ajanın paketlenmesi, otomatik başlatma ve gerçek Xprinter testi

**Files:**
- Create: `apps/print-agent/build.mjs`, `apps/print-agent/scripts/install-agent.ps1`, `scripts/uninstall-agent.ps1`, `scripts/run-agent.cmd`
- Create: `deploy/ramos-print-agent.service`

**Interfaces:**
- Consumes: Görev 19 (`src/cli.ts`)
- Produces:
  - `npm run build -w apps/print-agent` → `apps/print-agent/dist/ramos-agent.mjs` (tek dosya; `@ramos/shared` ve bağımlılıklar gömülü)
  - Windows'ta "RamosPrintAgent" Zamanlanmış Görevi, Linux'ta systemd birimi

- [ ] **Adım 1: Tek dosya derleme**

`apps/print-agent/build.mjs`:
```js
import { build } from 'esbuild';
await build({
  entryPoints: ['src/cli.ts'], outfile: 'dist/ramos-agent.mjs', bundle: true, platform: 'node', format: 'esm',
  target: 'node22', sourcemap: false, minify: false,
  banner: { js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);" },
});
console.log('dist/ramos-agent.mjs hazır');
```
Run: `npm run build -w apps/print-agent` ve ardından `node apps/print-agent/dist/ramos-agent.mjs status --host 127.0.0.1 --port 9100` (sahte yazıcı açıkken) → JSON durum.

- [ ] **Adım 2: Windows kurulum betikleri (UTF-8 BOM!)**

`scripts/run-agent.cmd` — çökerse 5 sn sonra yeniden başlatır:
```bat
@echo off
cd /d "%~dp0"
if not exist logs mkdir logs
:loop
node "%~dp0ramos-agent.mjs" run >> "%~dp0logs\console.log" 2>&1
timeout /t 5 /nobreak > nul
goto loop
```
`scripts/install-agent.ps1`:
```powershell
param([string]$InstallDir = "$env:LOCALAPPDATA\RamosPrintAgent")
$ErrorActionPreference = 'Stop'
$nodeVersion = (node -v) 2>$null
if (-not $nodeVersion -or [int]($nodeVersion.TrimStart('v').Split('.')[0]) -lt 22) {
  Write-Host 'Node.js 22 veya üstü gerekli: https://nodejs.org (LTS) kurup tekrar çalıştırın.' -ForegroundColor Red; exit 1
}
New-Item -ItemType Directory -Force $InstallDir | Out-Null
Copy-Item "$PSScriptRoot\..\dist\ramos-agent.mjs" $InstallDir -Force
Copy-Item "$PSScriptRoot\run-agent.cmd" $InstallDir -Force
if (-not (Test-Path "$InstallDir\.env")) {
  if (Test-Path "$PSScriptRoot\..\.env") { Copy-Item "$PSScriptRoot\..\.env" "$InstallDir\.env" }
  else { Write-Host ".env bulunamadı. $InstallDir\.env dosyasını oluşturun (AGENT_EMAIL, AGENT_PASSWORD, …)." -ForegroundColor Yellow }
}
$action   = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument "/c `"$InstallDir\run-agent.cmd`"" -WorkingDirectory $InstallDir
$trigger  = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 `
            -RestartInterval (New-TimeSpan -Minutes 1) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -Hidden
Register-ScheduledTask -TaskName 'RamosPrintAgent' -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null
Start-ScheduledTask -TaskName 'RamosPrintAgent'
Write-Host "Ramo's yazdırma ajanı kuruldu ve başlatıldı: $InstallDir" -ForegroundColor Green
```
`scripts/uninstall-agent.ps1`:
1. `Unregister-ScheduledTask -TaskName RamosPrintAgent -Confirm:$false`
2. `Get-CimInstance Win32_Process | Where-Object CommandLine -like '*ramos-agent.mjs*' | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }`
3. Klasörü silmeden önce `Read-Host` ile onay iste. Bu betiği kullanıcı elle çalıştırır.

**BOM:** Write aracı BOM yazmaz. Her `.ps1` dosyasından sonra şunu çalıştır:
```powershell
foreach ($f in Get-ChildItem apps\print-agent\scripts\*.ps1) { $c = [IO.File]::ReadAllText($f.FullName); [IO.File]::WriteAllText($f.FullName, $c, [Text.UTF8Encoding]::new($true)) }
```
Doğrulama: `Format-Hex -Path apps\print-agent\scripts\install-agent.ps1 -Count 3` → `EF BB BF`.

- [ ] **Adım 3: Linux / Raspberry Pi birimi**

`deploy/ramos-print-agent.service`:
```ini
[Unit]
Description=Ramo's Print Agent
After=network-online.target
Wants=network-online.target

[Service]
WorkingDirectory=/opt/ramos-print-agent
ExecStart=/usr/bin/node /opt/ramos-print-agent/ramos-agent.mjs run
Restart=always
RestartSec=5
User=ramos
Environment=LOG_DIR=/var/log/ramos-print-agent

[Install]
WantedBy=multi-user.target
```
Kurulum adımları (kopyala, `.env`, `systemctl enable --now ramos-print-agent`) `docs/KURULUM.md`'de Görev 30'da yazılır.

- [ ] **Adım 4: Gerçek Xprinter testi (Faz A girdileriyle — durma)**

> **Faz B'de:**
> - **`PRINTER_DEV_HOST` verildiyse:** Aşağıdaki 1–3. maddeleri atla; `printer_host`'u bu IP ile ayarlayıp 4. maddeden itibaren **otomatik** yürüt.
> - **Fotoğraf onayı ve karakter kontrolü:** Beklenmez; `BUILD-PROGRESS.md` → "Kullanıcıya kalan kontroller" listesine yazılır. Türkçe karakterlerin doğruluğu kullanıcı fotoğrafına kadar bilinemez; varsayılan `cp857 / 61` kalır.
> - **IP verilmediyse ya da yazıcıya ulaşılamıyorsa:** Bu adımı ⏸ ertele. Sahte yazıcı testleri yeşilse M5 tamam sayılır. Sona bırak.

1. Kullanıcıdan şunları iste:
   - Geliştirme PC'sindeki Xprinter'ı (Windows'ta "XP-80", USB001) **Ethernet kablosuyla modeme** bağlaması.
   - **Self-test** sayfası basması (yazıcı kapalıyken FEED basılı → aç → 2–3 sn sonra bırak) ve sayfadaki **IP**'yi ve **code page listesinde 61'in karşılığını** yazması.
2. IP modemin alt ağında değilse (fabrika `192.168.123.100`): Kullanıcı Xprinter'ın Windows aracıyla (Port: NET) IP'yi modem alt ağına ayarlar. Ağ ayarını sen değiştirme; kullanıcı yapar.
3. Yazıcıda LAN portu yoksa: yalnız geliştirme için USB spooler RAW taşıma katmanı önerisi (spec §10.8) kullanıcıya sorulur.
4. `npm run db:sql -- "update public.settings set printer_host = '<IP>' where id = 1"`
5. `node apps/print-agent/dist/ramos-agent.mjs status --host <IP>` → `known: true`, `paper_end: false`.
6. `node apps/print-agent/dist/ramos-agent.mjs test-print --host <IP>` → **TESTDRUCK** basılır. Kullanıcıdan fişin fotoğrafını iste ve karakter satırını kontrol et: `ÄÖÜ äöü ß · Şş Ğğ İı Çç`.
   - Türkçe harfler bozuksa `printer_codepage = 'windows1254'`, `printer_codepage_number = 91` dene.
   - O da bozuksa `printer_transliterate = true`.
   - Kararı `settings`'e kaydet.
7. Ajanı `npm run agent -w apps/print-agent` ile başlat. Garson ekranından şu fişleri üret; her birinin fotoğrafı kullanıcıdan istenir ve onaylanır:
   1. Sipariş (OHNE + sos + ekstra + içecek)
   2. Ek sipariş
   3. STORNO
   4. TISCHWECHSEL
8. Gecikme ölçümü (5 sn hedefi): `npm run db:sql -- "select type, extract(epoch from printed_at - created_at) s from public.print_jobs order by created_at desc limit 5"`.
9. İsteğe bağlı: `install-agent.ps1` geliştirme PC'sinde denenir. Oturum kapatıp açınca ajan kalkmalı; Görev Yöneticisi'nde `node.exe` görünür. Sonra `uninstall-agent.ps1` ile kaldırılır.

- [ ] **Adım 5: Commit + M5 raporu**
```bash
git add apps/print-agent/build.mjs apps/print-agent/scripts deploy/ramos-print-agent.service
git commit -m "feat(agent): tek dosya paket, Windows zamanlanmış görev (BOM'lu) ve systemd birimi; gerçek Xprinter doğrulandı"
```
Rapora şunları ekle: fiş fotoğraflarının kullanıcı onayı, seçilen karakter tablosu, ölçülen gecikmeler.

