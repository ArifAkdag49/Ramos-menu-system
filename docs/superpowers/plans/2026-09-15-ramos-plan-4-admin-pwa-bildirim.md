# Ramo's Sipariş Sistemi — Plan 4: Admin Paneli, PWA ve Bildirimler (M6–M7, Görev 21–26)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Super admin'in işletmeyi tek başına yönetebileceği paneli ve ek özellikleri kurmak:
- **Panel:** canlı durum, menü (toplu atama ve fiş önizlemesiyle), personel, masalar, siparişler, raporlar, ayarlar.
- **PWA:** Uygulama kurulabilir hale gelir; ikonlar, service worker ve ilk açılış rehberi eklenir.
- **Bildirim:** "Hazır" olunca mesaideki garsonlara Web Push gider.

**Architecture:**
- Admin, `apps/web` içinde `/admin/*` rotalarıdır. Menü, masa ve ayar CRUD'u RLS'li doğrudan tablo yazımıyla, personel işlemleri `admin-staff` Edge Function ile yapılır.
- PWA: `vite-plugin-pwa`, `injectManifest` stratejisiyle kurulur; özel service worker push ve bildirime tıklama olaylarını işler.
- Push: `orders.status → ready` trigger'ı `pg_net` ile `notify-ready` Edge Function'ını çağırır. Fonksiyon Web Crypto tabanlı bir kütüphaneyle VAPID push gönderir.

**Tech Stack:** React 19 · dnd-kit · TanStack Query · vite-plugin-pwa (Workbox) · Web Push (VAPID) · Supabase Edge Functions (Deno) · pg_net · Vault · Playwright

**Spec:** `docs/superpowers/specs/2026-09-15-ramos-siparis-sistemi-design.md` (§8.1, §8.4, §11.3, §11.4, §12, §14, §17.5)

## Global Constraints
`docs/BUILD-PROMPT.md` §5–§6 geçerlidir. Bu planda özellikle:
- **Admin görünümü:** Masaüstü öncelikli (1440×900), mobilde de kullanılabilir (390).
- **Kayıtlar:**
  - Ürünler silinmez, arşivlenir.
  - Siparişte kullanılmış varyant/seçenek silinmez, pasifleştirilir (FK hatası `23503` → "Pasifleştir" önerisi).
- **Push:**
  - Yalnızca mesaideki aktif `waiter` + `admin` kullanıcılarına gider.
  - Kütüphane Web Crypto tabanlıdır (`jsr:@negrel/webpush` veya `@pushforge/builder`).
  - `notify-ready` fonksiyonu `verify_jwt = false` ile çalışır ve `x-webhook-secret` başlığını doğrular; sır Vault'ta tutulur.
- **iOS:** Push yalnızca ana ekrana eklenmiş PWA'da çalışır (16.4+). İzin kullanıcı dokunuşuyla istenir. `navigator.vibrate` yok.

## Dosya haritası (bu plan)
```
apps/web/src/features/admin/
  AdminLayout.tsx · DashboardPage.tsx · PrinterCard.tsx · dashboardLogic.ts (+test)
  menu/CategoriesPage.tsx · ProductsPage.tsx · ProductEditor.tsx · VariantsEditor.tsx
  menu/IngredientsPage.tsx · OptionGroupsPage.tsx · BulkAssignPage.tsx · TicketPreview.tsx
  menu/money.ts (+test) · menu/menuAdminLogic.ts (+test) · menu/adminMenuApi.ts
  staff/StaffPage.tsx · staff/adminStaffClient.ts (+test)
  tables/TablesAdminPage.tsx
  orders/OrdersPage.tsx · orders/OrderDrawer.tsx · orders/ordersQuery.ts (+test) · AuditLogPage.tsx
  reports/ReportsPage.tsx · reports/csv.ts (+test)
  settings/SettingsPage.tsx
apps/web/src/sw.ts · src/pwa/registerSW.ts · src/pwa/push.ts (+test) · src/features/onboarding/InstallGuide.tsx
apps/web/public/brand/* · apps/web/public/icons/* (PDF'ten üretilir)
scripts/make-brand-assets.py · scripts/gen-vapid.mjs
supabase/functions/notify-ready/index.ts · notify-ready/logic.ts (+ logic.test.ts)
supabase/migrations/0007_notify_ready.sql
```

---

## Görev 21: Admin kabuğu ve canlı durum ekranı

**Files:**
- Create: `apps/web/src/features/admin/AdminLayout.tsx`, `DashboardPage.tsx`, `PrinterCard.tsx`, `dashboardLogic.ts`
- Modify: `src/app/router.tsx` (`/admin/*` alt rotaları), `src/i18n/*.json` (`admin.*`)
- Test: `dashboardLogic.test.ts`, `PrinterCard.test.tsx`

**Interfaces:**
- Consumes: `useTableOverview`, `usePrinterStatus`, `useRetryJob`, `callRpc('report_range')`, `callRpc('enqueue_test_print')`, `useBroadcastInvalidation(['orders','menu','printer-status','settings','print-jobs'])`
- Produces:
  - `dashboardStats(tables: TableRow[]): { openTables: number; inKitchen: number; ready: number; openValueCents: number }`
  - `<PrinterCard />`: ajan sinyali, yazıcı durumu, son baskı, başarısız işler (her birinde "Tekrar dene"), **Test fişi bas** butonu
  - `AdminLayout`:
    - Masaüstünde sol menü: Canlı durum · Menü · Personel · Masalar · Siparişler · Raporlar · Ayarlar, ayrıca "Garson ekranı" ve "Mutfak ekranı" kısayolları.
    - Mobilde üst çubuk + çekmece.

- [ ] **Adım 1: Testleri yaz (kırmızı)**

`dashboardLogic.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { dashboardStats } from './dashboardLogic';

describe('dashboardStats', () => {
  it('açık masa, mutfak, hazır ve açık tutar toplamı', () => {
    expect(dashboardStats([
      { session_id: null, orders_in_kitchen: 0, orders_ready: 0, total_cents: 0 },
      { session_id: 'a', orders_in_kitchen: 2, orders_ready: 0, total_cents: 1950 },
      { session_id: 'b', orders_in_kitchen: 0, orders_ready: 1, total_cents: 2300 },
    ] as never)).toEqual({ openTables: 2, inKitchen: 2, ready: 1, openValueCents: 4250 });
  });
});
```
`PrinterCard.test.tsx`: `usePrinterStatus` mock'lanır.

| Durum | Beklenen görünüm |
|---|---|
| (a) `problem = null`, son baskı 2 dk önce | Yeşil "Çevrimiçi" ve "Son baskı: 2 dk önce" |
| (b) `agent_offline` | Kırmızı "Yazdırma ajanı çevrimdışı" ve yardım metni ("Restoran PC'si açık mı?") |
| (c) `paper_end` | Turuncu "Kağıt bitti" |
| (d) başarısız iş var | Listede "Tekrar dene" butonu `useRetryJob` ile çağrılır |

"Test fişi bas" butonu `callRpc('enqueue_test_print')` çağırır ve toast gösterir.

Run: FAIL

- [ ] **Adım 2: Uygula**

- `dashboardLogic.ts`: tek `reduce` ile hesaplanır.
- `DashboardPage`:
  - Üstte 4 istatistik kutusu: açık masa, mutfakta, hazır, bugünkü ciro. Bugünkü değerler `report_range(bugün, bugün)` ile alınır; iş günü `business_date` RPC'si yerine istemcide `Europe/Berlin` saati + 05:00 kuralıyla hesaplanır.
  - Sağda `PrinterCard`.
  - Altta "Açık masalar" tablosu (masa, açan, süre, tutar, durum) ve son 10 denetim kaydı (`audit_log`, `at desc`).
  - Stat kutuları ve kartlar için `dataviz` skill kurallarına uyulur: sade, tabular rakam, tek vurgu rengi.

Run: PASS

- [ ] **Adım 3: Ekran görüntüsü ve commit**

Görüntüler: `docs/screenshots/m6-dashboard-1440.png` ve `m6-dashboard-390.png`.
```bash
git add apps/web/src/features/admin apps/web/src/app/router.tsx apps/web/src/i18n docs/screenshots
git commit -m "feat(admin): admin kabuğu ve canlı durum (masalar, mutfak, ciro, yazıcı kartı, test fişi)"
```

---

## Görev 22: Menü yönetimi — kategoriler, ürünler, varyantlar, malzemeler, seçim grupları, toplu atama, fiş önizleme

**Files:**
- Create: `apps/web/src/features/admin/menu/*` (dosya haritasındaki menü dosyaları)
- Test: `money.test.ts`, `menuAdminLogic.test.ts`, `ProductEditor.test.tsx`, `apps/web/e2e/admin-menu.spec.ts`

**Interfaces:**
- Consumes: `supabase` (admin RLS yazımı), `useMenu`, `renderTicket`, `linesToText`, `localName`, `useSettings` (alerjen lejantı)
- Produces:
  - Para girişi:
    - `parseEuroInput(s: string): number | null` → "7,50" → 750, "7" → 700, "7.5" → 750, "abc" → null
    - `centsToInput(c: number): string` → 750 → "7,50"
  - `validateGroup(g: { min_select; max_select }, activeOptionCount: number): string | null` → hata anahtarları `min_gt_max`, `max_gt_options`, `min_gt_options`
  - Sıralama: `reorder<T extends { id: string }>(list: T[], fromId: string, toId: string): { id: string; sort: number }[]` → sürükle-bırak sonrası `sort = (index + 1) * 10` güncellemeleri
  - `previewPayloadFor(product: MenuProduct, sel: Selection, qty: number): TicketPayload` → örnek fiş için tek kalemli payload
  - `adminMenuApi`: `upsertCategory`, `upsertProduct`, `archiveProduct`, `duplicateProduct`, `saveVariants`, `setProductIngredients`, `setProductGroups`, `upsertIngredient`, `upsertGroup`, `upsertOption`, `bulkAssignIngredients(productIds, ingredientIds)`, `bulkAssignGroup(productIds, groupId)`

- [ ] **Adım 1: Testleri yaz (kırmızı)**

`money.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { centsToInput, parseEuroInput } from './money';

describe('para girişi', () => {
  it.each([['7,50', 750], ['7', 700], ['7.5', 750], [' 11,5 ', 1150], ['0,70', 70]])('%s → %i', (s, c) =>
    expect(parseEuroInput(s)).toBe(c));
  it.each(['', 'abc', '-1', '1,234'])('%s geçersiz', (s) => expect(parseEuroInput(s)).toBeNull());
  it('kuruştan giriş metnine', () => expect(centsToInput(750)).toBe('7,50'));
});
```
`menuAdminLogic.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { previewPayloadFor, reorder, validateGroup } from './menuAdminLogic';

describe('menü admin mantığı', () => {
  it('grup kuralları', () => {
    expect(validateGroup({ min_select: 2, max_select: 1 }, 3)).toBe('min_gt_max');
    expect(validateGroup({ min_select: 5, max_select: 5 }, 4)).toBe('min_gt_options');
    expect(validateGroup({ min_select: 0, max_select: 3 }, 2)).toBe('max_gt_options');
    expect(validateGroup({ min_select: 5, max_select: 5 }, 16)).toBeNull();
  });
  it('sürükle-bırak sırası 10’un katları', () => {
    expect(reorder([{ id: 'a' }, { id: 'b' }, { id: 'c' }], 'c', 'a'))
      .toEqual([{ id: 'c', sort: 10 }, { id: 'a', sort: 20 }, { id: 'b', sort: 30 }]);
  });
  it('önizleme payload’u seçimleri fişe çevirir', () => {
    const p = {
      id: 'p', code: '05', name: 'Drehspieß Sandwich', variants: [{ id: 'k', name_de: 'Kalb', name_tr: 'Dana' }],
      ingredients: [{ id: 'z', name_de: 'Zwiebeln', name_tr: 'Soğan' }],
      groups: [{ id: 's', name_de: 'Soße', ticket_format: 'label_values', options: [{ id: 'a', name_de: 'Knoblauch' }] }],
    } as never;
    const payload = previewPayloadFor(p, { variantId: 'k', optionIds: ['a'], removedIngredientIds: ['z'] }, 2);
    expect(payload.items[0]).toMatchObject({ qty: 2, code: '05', variant: 'Kalb', without: ['Zwiebeln'],
      groups: [{ label: 'Soße', format: 'label_values', values: ['Knoblauch'] }] });
    expect(payload.table).toBe('Tisch 12');
  });
});
```
`ProductEditor.test.tsx`:
1. Varyantlı ürünü açınca taban fiyat alanı gizlenir, varyant tablosu görünür.
2. "7,5" girilince kaydetme çağrısında `price_cents: 750` gider.
3. Kod çakışmasında (`23505`) alanın altında "Bu numara başka üründe kullanılıyor" görünür.
4. "Arşivle" onay ister ve `archiveProduct` çağrılır.

Run: FAIL

- [ ] **Adım 2: Uygula**

- `money.ts`:
  - Regex: `^\d+([.,]\d{1,2})?$`.
  - Virgül noktaya çevrilir, `Math.round(Number(x) * 100)` ile kuruşa dönüştürülür.
  - `centsToInput` için `(c / 100).toFixed(2).replace('.', ',')`.
- `menuAdminLogic.ts`: testteki davranış. `previewPayloadFor` şunları doldurur:
  - Sabit alanlar: `kind: 'order'`, `header: "RAMO'S · KÜCHE"`, `table: 'Tisch 12'`, `orderNo: 47`, `round: 1`, `createdAt: new Date().toISOString()`, `waiter: 'Vorschau'`.
  - `groups`: seçili seçenekler, grup sırasıyla ve `ticket_format` biçiminde.
- `adminMenuApi.ts`: Her fonksiyon `supabase.from(...).insert/update/upsert` kullanır ve hataları `{ code, message }` olarak fırlatır.
  - `duplicateProduct`: ürünü `slug`'ı `…-kopie-<kısa id>`, `code` null olacak şekilde kopyalar; varyant, malzeme ve grup bağlantılarını da kopyalar.
  - `bulkAssign*`: `upsert(..., { onConflict: 'product_id,ingredient_id', ignoreDuplicates: true })`.
- **Ekranlar:**
  - **Kategoriler:** dnd-kit sıralı liste, DE/TR ad satır içi düzenleme, "İçecek" ve "Aktif" anahtarları, **+ Kategori**.
  - **Ürünler:**
    - Liste: kategori filtresi + arama (Görev 14'teki `searchProducts`) + satırlar (kod · ad · fiyat · aktif · tükendi).
    - Satıra tıklayınca sağdan `ProductEditor` çekmecesi açılır:
      1. Temel: kod, ad, açıklama, kategori
      2. Fiyat: taban fiyat ya da `VariantsEditor` (ekle, sil → pasifleştir, ad DE/TR, fiyat, varsayılan, sürükle sırala)
      3. Alerjen: `settings.allergen_legend` çipleri, çoklu seçim → `"a,c,g,4,7"`
      4. Malzemeler: kütüphaneden çoklu seçim + sıralama
      5. Seçim grupları: çoklu seçim + sıralama
      6. Durum: aktif, tükendi
      7. Eylemler: Kopyala, Arşivle
  - **Malzemeler:** Tablo (DE, TR, kaç üründe kullanıldığı), ekle/düzenle/pasifleştir.
  - **Seçim grupları:** Liste + düzenleyici (admin etiketi, DE/TR ad, min/max, fiş biçimi, seçenekler: DE/TR, fiyat farkı, varsayılan, exclusive, sıra). Kaydetmeden önce `validateGroup` çalışır; kaç üründe kullanıldığı gösterilir.
  - **Toplu atama:**
    1. Kategori filtresi ile ürün seçimi (checkbox listesi).
    2. Atanacak şey: malzeme seti (çoklu seçim) **ya da** tek bir seçim grubu.
    3. **Uygula** → etkilenen ürün sayısı toast'la bildirilir.
  - **Fiş önizleme (`TicketPreview`):** Ürün + seçim (ürün panelinin yeniden kullanımı) → `linesToText(renderTicket(previewPayloadFor(...)))`, 48 kolonluk monospace kutuda (koyu zemin, kağıt görünümü). Ters renkli satırlar vurgulu gösterilir.
- Kayıt sonrası `qk.menu` geçersiz kılınır. Garson ekranı Realtime `menu` olayıyla zaten tazelenir.

Run: `npm test -w apps/web` → PASS

- [ ] **Adım 3: E2E — admin menü düzenleme etkisi**

`apps/web/e2e/admin-menu.spec.ts` (desktop):
1. `test-admin` ile giriş yap.
2. Test ürününün (`T05`) Kalb fiyatını 8,50 → 8,90 yap ve kaydet.
3. Başka bir sekmede `test-waiter` ile ürün panelini aç → **Kalb 8,90 €** görünmeli (Realtime `menu`).
4. Fiyatı geri al.
5. Toplu atama: test ürününe `g-scharf` grubunu ekle → panelde "Schärfe" görünmeli → bağlantıyı kaldır.

Görüntüler: `docs/screenshots/m6-menu-products-1440.png`, `m6-product-editor-1440.png`, `m6-ticket-preview-1440.png`.

- [ ] **Adım 4: Commit**
```bash
git add apps/web/src/features/admin/menu apps/web/e2e/admin-menu.spec.ts docs/screenshots
git commit -m "feat(admin): menü yönetimi — kategoriler, ürün editörü, varyantlar, malzeme ve seçim grupları, toplu atama, fiş önizleme"
```

---

## Görev 23: Personel, masalar, siparişler ve denetim kaydı

**Files:**
- Create: `staff/StaffPage.tsx`, `staff/adminStaffClient.ts`, `tables/TablesAdminPage.tsx`, `orders/OrdersPage.tsx`, `orders/OrderDrawer.tsx`, `orders/ordersQuery.ts`, `AuditLogPage.tsx`
- Test: `staff/adminStaffClient.test.ts`, `orders/ordersQuery.test.ts`, `apps/web/e2e/admin-staff.spec.ts`

**Interfaces:**
- Consumes:
  - `admin-staff` Edge Function (Görev 10 sözleşmesi)
  - `supabase` admin okuma (`profiles`, `orders`, `audit_log`), `dining_tables` yazımı
  - `CancelItemSheet`, `ItemLines`, `TicketPreview`, `useReprint`, `useRetryJob`
- Produces:
  - `callAdminStaff(body): Promise<{ user_id?: string }>`
    - Hata durumunda `AdminStaffError { key: string; status: number }` fırlatır.
    - Arayüzde `t('admin.staff.errors.<key>')` ile gösterilir.
  - `buildOrdersFilter(f: { from: string; to: string; tableId?: string; waiterId?: string; status?: string }): { business_date_gte: string; business_date_lte: string; session_table?: string; waiter_id?: string; status?: string }`
    - Saf fonksiyondur; `OrdersPage` sorgusunu kurar.
    - Tarih aralığı en fazla 31 gün olabilir; aşılırsa `range_too_long` fırlatır.

- [ ] **Adım 1: Testleri yaz (kırmızı)**

`adminStaffClient.test.ts`:
- `fetch` mock'lanır.
- `201 { user_id }` → değer döner.
- `409 { error: 'username_taken' }` → `AdminStaffError { key: 'username_taken', status: 409 }`.
- Ağ hatası → `key: 'network'`.
- İstek `Authorization: Bearer <access_token>` ve `apikey` başlıklarıyla gider.

`ordersQuery.test.ts`:
- Filtre `{ from: '2026-09-01', to: '2026-09-15', status: 'cancelled' }` → beklenen nesne.
- `to < from` → `range_invalid`.
- 32 günlük aralık → `range_too_long`.

Run: FAIL

- [ ] **Adım 2: Uygula**

- `adminStaffClient.ts`:
  - Oturum token'ı alınır: `supabase.auth.getSession()`.
  - İstek: `fetch(`${VITE_SUPABASE_URL}/functions/v1/admin-staff`, { method: 'POST', headers, body })`.
- **`StaffPage`:**
  - Tablo sütunları: ad, kullanıcı adı, rol, dil, aktif, mesai durumu (`is_on_duty` istemcide hesaplanır: `on_duty_since` bugünkü iş günü içinde mi).
  - **+ Personel:** ad, kullanıcı adı, rol (garson/mutfak/admin), PIN (garson/mutfak için 6+ hane, admin için 10+ karakterli parola), dil.
  - Satır eylemleri:
    - Düzenle (ad, rol, dil)
    - PIN sıfırla (yeni PIN girilir)
    - Pasifleştir / Aktifleştir (onaylı)
  - `test-*` kullanıcıları üstte "Test hesabı" rozetiyle gösterilir; M8'de pasifleştirilir.
- **`TablesAdminPage`:**
  - dnd-kit sıralı liste, **+ Masa** ("Tisch 13"), yeniden adlandır, aktif anahtarı.
  - Açık oturumu olan masa pasifleştirilemez (`table_overview` ile kontrol edilir; buton pasif + açıklama).
- **`OrdersPage`:**
  - Filtre çubuğu: tarih aralığı (varsayılan bugün), masa, garson, durum.
  - Sorgu sayfalıdır (`range(0, 49)` → "Daha fazla").
  - Satır sütunları: `#no`, saat, masa, garson, durum, kalem sayısı, tutar.
  - Satıra tıklayınca `OrderDrawer` açılır:
    - Kalemler (`ItemLines`); iptal edilenler sebep ve kişiyle.
    - Zaman çizelgesi (oluşturuldu, hazır, teslim, iptal).
    - Fiş işleri: tür, durum, deneme sayısı, hata, "Tekrar bas", "Tekrar dene".
    - Fiş önizleme: `TicketPreview` ile ilgili işin payload'u.
    - Kalem iptali (`CancelItemSheet`).
- **`AuditLogPage`:**
  - Filtreler: tarih, işlem, varlık.
  - Satır: zaman, kişi (`staff_names` haritası), işlem, varlık, kısa detay. Genişletilince JSON gösterilir.

Run: PASS

- [ ] **Adım 3: E2E — personel yaşam döngüsü**

`apps/web/e2e/admin-staff.spec.ts` (desktop):
1. `test-admin` → Personel → **+ Personel**: `test-e2e-garson`, PIN `482915`. Kullanıcı zaten varsa bu adımı atla ve PIN'ini sıfırla.
2. Başka bir tarayıcı bağlamında bu kullanıcıyla giriş yap → `/waiter`.
3. Admin kullanıcıyı pasifleştirsin → garson sayfayı yenileyince `/login` ekranına düşmeli (RLS + ban).
4. Kullanıcıyı yeniden aktifleştir.

Görüntüler: `docs/screenshots/m6-staff-1440.png`, `m6-orders-1440.png`, `m6-order-drawer-1440.png`.

- [ ] **Adım 4: Commit**
```bash
git add apps/web/src/features/admin apps/web/e2e/admin-staff.spec.ts docs/screenshots
git commit -m "feat(admin): personel yönetimi, masalar, sipariş geçmişi ve detay çekmecesi, denetim kaydı"
```

---

## Görev 24: Raporlar, CSV dışa aktarma ve Ayarlar

**Files:**
- Create: `reports/ReportsPage.tsx`, `reports/csv.ts`, `settings/SettingsPage.tsx`, `settings/settingsLogic.ts`
- Test: `reports/csv.test.ts`, `settings/settingsLogic.test.ts`

**Interfaces:**
- Consumes: `callRpc('report_range')`, admin `orders` + `order_items` okuması, `settings` güncellemesi, `TicketPreview`, `PrinterCard`, `enqueue_test_print`
- Produces:
  - `toCsv(headers: string[], rows: (string | number | null)[][]): string`
    - Ayırıcı `;`, satır sonu CRLF, başta UTF-8 BOM (`﻿`).
    - `;`, `"` ya da satır sonu içeren alanlar tırnaklanır; içteki `"` karakteri `""` olur.
  - `orderRowsForCsv(orders: OrderView[]): (string | number | null)[][]`
    - Sütunlar: `Datum;Uhrzeit;Bestellung;Runde;Tisch;Kellner;Status;Menge;Nr;Artikel;Variante;Einzelpreis;Summe;OHNE;Optionen;Hinweis;Storno-Grund`
    - Para alanları `"8,50"` biçiminde.
  - `validateSettings(s): Record<string, string>`: alan → hata anahtarı eşlemesi (`host_invalid`, `port_invalid`, `header_empty`, `time_invalid`).

- [ ] **Adım 1: Testleri yaz (kırmızı)**

`csv.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { toCsv } from './csv';

describe('toCsv', () => {
  it('BOM, ; ayırıcı, CRLF, kaçış', () => {
    expect(toCsv(['A', 'B'], [['x;y', 'He said "hi"'], [1, null]]))
      .toBe('﻿A;B\r\n"x;y";"He said ""hi"""\r\n1;\r\n');
  });
});
```
`settingsLogic.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { validateSettings } from './settingsLogic';

const ok = { printer_host: '192.168.1.50', printer_port: 9100, ticket_header: "RAMO'S · KÜCHE", business_day_start: '05:00' };
describe('validateSettings', () => {
  it('geçerli', () => expect(validateSettings(ok)).toEqual({}));
  it('boş host kabul (henüz kurulmadı), hatalı IP/port/başlık/saat reddedilir', () => {
    expect(validateSettings({ ...ok, printer_host: '' })).toEqual({});
    expect(validateSettings({ ...ok, printer_host: '999.1.1.1', printer_port: 70000, ticket_header: ' ', business_day_start: '25:00' }))
      .toEqual({ printer_host: 'host_invalid', printer_port: 'port_invalid', ticket_header: 'header_empty', business_day_start: 'time_invalid' });
  });
});
```
Run: FAIL

- [ ] **Adım 2: Uygula**

- **`csv.ts`:** Testteki davranış. `orderRowsForCsv`:
  - Tarih/saat `Europe/Berlin`'e göre biçimlenir.
  - `OHNE` alanı `removed_ingredients` DE adlarının `, ` ile birleşimidir.
  - `Optionen` alanı `itemLines(item, 'de').options` değerlerinin ` | ` ile birleşimidir.
  - İptal edilen kalemin `Status` sütunu `storniert` olur.
- **`settingsLogic.ts`:**
  - IPv4 (her oktet 0–255) ya da hostname (`^[a-zA-Z0-9.-]{1,253}$`).
  - Port 1–65535.
  - Başlık `trim` sonrası boş olmamalı.
  - Saat `^([01]\d|2[0-3]):[0-5]\d$`.
- **`ReportsPage`:**
  - Tarih aralığı hazır seçenekleri: Bugün, Dün, Son 7 gün, Bu ay (en fazla 31 gün).
  - Stat kutuları: sipariş, kalem, ciro, iptal edilen (adet ve tutar).
  - Tablolar: garson bazında, en çok satan 10 ürün.
  - Saatlik dağılım: yatay çubuk tablosu (`dataviz` skill kuralları: tek renk `--lime`, tabular rakam, eksen etiketleri).
  - **CSV indir:**
    - Aralıktaki siparişler `ORDER_SELECT` ile ve 1000'lik parçalarla (`range`) okunur, `toCsv` ile birleştirilir.
    - İndirme `Blob` + `a[download]` ile yapılır. Dosya adı `ramos-bestellungen-<from>_<to>.csv`.
- **`SettingsPage`:** Bölümler:
  1. Genel: restoran adı, iş günü başlangıcı.
  2. Fiş: başlık, altlık, canlı `TicketPreview`.
  3. Yazıcı:
     - IP, port.
     - Karakter tablosu seçimi: `cp857 / 61` (varsayılan), `windows1254 / 91`, `cp858 / 19`, `cp437 / 0`.
     - Transliterasyon anahtarı.
     - **Test fişi bas** butonu ve küçük `PrinterCard`.
  4. Hızlı notlar: DE/TR liste düzenleyici.
  5. İptal sebepleri: DE/TR + "serbest metin" bayrağı.
  6. Alerjen lejantı: kod / DE / TR tablo.
  - **Kaydet:** Önce `validateSettings`, sonra `update settings`. Ajan Realtime `settings` olayıyla ayarları yeniden yükler; bir sonraki fiş yeni ayarla basılır.

Run: PASS

- [ ] **Adım 3: Ekran görüntüleri ve commit**

Görüntüler: `docs/screenshots/m6-reports-1440.png`, `m6-settings-1440.png`, `m6-admin-390.png`.
```bash
git add apps/web/src/features/admin/reports apps/web/src/features/admin/settings docs/screenshots
git commit -m "feat(admin): raporlar + CSV (Excel uyumlu), ayarlar (fiş, yazıcı, notlar, iptal sebepleri, alerjenler)"
```
Kullanıcıya **M6 raporu** ver.

---

## Görev 25: PWA — marka varlıkları, manifest, service worker, kurulum rehberi, bildirim izni

**Files:**
- Create: `scripts/make-brand-assets.py`, `apps/web/public/brand/*`, `apps/web/public/icons/*`
- Create: `apps/web/src/sw.ts`, `src/pwa/registerSW.ts`, `src/pwa/push.ts`, `src/features/onboarding/InstallGuide.tsx`
- Modify: `apps/web/vite.config.ts` (VitePWA), `LoginPage.tsx` (logo), `ProfilePage.tsx` (Bildirimler bölümü), `WaiterLayout.tsx` (ilk açılış rehberi)
- Create: `apps/web/public/.htaccess`, `apps/web/public/assets/.htaccess` (Görev 28'de kullanılır)
- Test: `src/pwa/push.test.ts`, `apps/web/e2e/pwa.spec.ts`

**Interfaces:**
- Consumes: `docs/menu/source/ramos-menu.pdf`, `callRpc('save_push_subscription' | 'delete_push_subscription')`, `VITE_VAPID_PUBLIC_KEY`
- Produces:
  - `pushSupport(env: { isIOS: boolean; standalone: boolean; hasSW: boolean; hasPush: boolean; hasNotification: boolean }): 'ok' | 'ios_needs_install' | 'unsupported'`
  - `urlBase64ToUint8Array(b64: string): Uint8Array`
  - `enablePush(): Promise<{ ok: true } | { ok: false; reason: 'unsupported' | 'ios_needs_install' | 'denied' | 'error'; detail?: string }>` — **yalnızca kullanıcı dokunuşu içinden çağrılır**
  - `disablePush(): Promise<void>`
  - `pushState(): Promise<'enabled' | 'disabled' | 'denied' | 'unsupported'>`
  - `<InstallGuide />`: platforma göre adımlar; Android'de `beforeinstallprompt` ile "Uygulamayı yükle" butonu
  - SW olayları: `push` → bildirim göster; `notificationclick` → açık pencereyi odakla ya da `data.url`'yi aç

- [ ] **Adım 1: Marka varlıkları (renkleri değiştirmeden yalnız kırp ve ölçekle)**

`scripts/make-brand-assets.py`:
- PyMuPDF ile `docs/menu/source/ramos-menu.pdf` dosyasının 1. sayfasındaki gömülü görsel (1318×1866) çıkarılır.
- Çıkarılacak iki bölge:
  - **"RAMO'S" yazısı + "DÖNER & GRILL HOUSE"** — başlangıç kutusu: x 190–1135, y 455–835
  - **Altın alev** — başlangıç kutusu: x 600–720, y 1035–1190
- Kutu koordinatları başlangıç tahminidir. Kırpılan görseli **Read aracıyla aç, gözle doğrula** ve kutuyu düzelt. Koordinatlar betikte sabit kalır.
- Çıktılar:
  - `public/brand/wordmark.png` (orijinal çözünürlük, siyah zemin)
  - `public/brand/flame.png`
- İkonlar alevden üretilir, `#0A0A0A` zemin üzerine ortalanır:
  - `icons/icon-192.png` ve `icons/icon-512.png` (alev alanın ~%62'si)
  - `icons/maskable-512.png` (güvenli alan: alev ~%50)
  - `icons/apple-touch-icon.png` (180)
  - `icons/badge-72.png` (tek renk beyaz alev, şeffaf zemin; Android bildirim çubuğu için)
  - `favicon.png` (48)

PyMuPDF'in `Pixmap` işlemleri yetmezse `pip install pillow` ile Pillow kullan. Renk dönüşümü yapma, filtre uygulama.

- [ ] **Adım 2: Push yardımcı testleri (kırmızı)**

`src/pwa/push.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { pushSupport, urlBase64ToUint8Array } from './push';

describe('push', () => {
  it('iOS’ta ana ekrana eklenmeden push yok', () => {
    expect(pushSupport({ isIOS: true, standalone: false, hasSW: true, hasPush: false, hasNotification: false })).toBe('ios_needs_install');
    expect(pushSupport({ isIOS: true, standalone: true, hasSW: true, hasPush: true, hasNotification: true })).toBe('ok');
  });
  it('Android Chrome destekli; eski tarayıcı desteksiz', () => {
    expect(pushSupport({ isIOS: false, standalone: false, hasSW: true, hasPush: true, hasNotification: true })).toBe('ok');
    expect(pushSupport({ isIOS: false, standalone: false, hasSW: false, hasPush: false, hasNotification: false })).toBe('unsupported');
  });
  it('base64url çözümü', () => {
    expect(Array.from(urlBase64ToUint8Array('AQID'))).toEqual([1, 2, 3]);
    expect(urlBase64ToUint8Array('-_8').length).toBe(2);
  });
});
```
Run: FAIL

- [ ] **Adım 3: Uygula**

`vite.config.ts` eklentisi:
```ts
import { VitePWA } from 'vite-plugin-pwa';
// plugins: [react(), tailwindcss(), VitePWA({ … })]
VitePWA({
  strategies: 'injectManifest', srcDir: 'src', filename: 'sw.ts', registerType: 'prompt',
  injectManifest: { globPatterns: ['**/*.{js,css,html,png,svg,woff2}'] },
  manifest: {
    name: "Ramo's Bestellung", short_name: "Ramo's", start_url: '/', scope: '/', display: 'standalone',
    orientation: 'any', background_color: '#0A0A0A', theme_color: '#0A0A0A', lang: 'de',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  },
})
```
Kurulum: `npm i -D -w apps/web vite-plugin-pwa workbox-precaching`.

`src/sw.ts`:
```ts
/// <reference lib="webworker" />
import { precacheAndRoute } from 'workbox-precaching';
declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision: string | null }> };

precacheAndRoute(self.__WB_MANIFEST);
self.addEventListener('message', (e) => { if (e.data === 'SKIP_WAITING') void self.skipWaiting(); });

self.addEventListener('push', (event) => {
  const d = event.data?.json() as { title: string; body: string; tag: string; url: string } | undefined;
  if (!d) return;
  event.waitUntil(self.registration.showNotification(d.title, {
    body: d.body, tag: d.tag, renotify: true, icon: '/icons/icon-192.png', badge: '/icons/badge-72.png',
    data: { url: d.url }, vibrate: [200, 100, 200],
  } as NotificationOptions));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data as { url?: string })?.url ?? '/waiter/ready';
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = all.find((c) => new URL(c.url).origin === self.location.origin);
    if (existing) { await existing.focus(); (existing as WindowClient).navigate(url).catch(() => {}); }
    else await self.clients.openWindow(url);
  })());
});
```
`src/pwa/registerSW.ts`:
- `virtual:pwa-register` modülündeki `registerSW({ onNeedRefresh })` kullanılır.
- Yeni sürüm hazır olunca "Yeni sürüm hazır — Yenile" toast'ı gösterilir; dokununca `updateSW(true)` çağrılır.
- `main.tsx` içinde yalnız `import.meta.env.PROD` iken kaydedilir.

`src/pwa/push.ts`:
- Testteki saf fonksiyonlar yazılır.
- `enablePush`:
  1. `pushSupport(...)` kontrolü.
  2. `Notification.requestPermission()`: `denied` ise `{ ok: false, reason: 'denied' }` döner.
  3. `navigator.serviceWorker.ready` beklenir.
  4. `pushManager.getSubscription() ?? pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(import.meta.env.VITE_VAPID_PUBLIC_KEY) })`.
  5. `toJSON()` sonucundaki `endpoint` + `keys.p256dh` + `keys.auth` alanları `callRpc('save_push_subscription', { p_endpoint, p_p256dh, p_auth, p_ua: navigator.userAgent })` ile kaydedilir.
  6. Tüm akış `try/catch` içindedir; hata `{ ok: false, reason: 'error', detail }` olarak döner.
- `disablePush`: `unsubscribe()` + `delete_push_subscription`.

`InstallGuide.tsx`:

| Durum | Gösterilen |
|---|---|
| iOS, ana ekrana eklenmemiş | "Paylaş ⬆︎ → Ana Ekrana Ekle → uygulamayı ana ekrandan açın" (görselli adımlar) |
| Android, yüklenmemiş | "Uygulamayı yükle" butonu (`beforeinstallprompt`) ya da menü talimatı |
| Yüklü, bildirim kapalı | **"Bildirimleri aç"** butonu (`enablePush`) |
| Hepsi tamam | Rehber gizlenir |

- Rehberin gösterildiği bilgisi `localStorage`'da tutulur.
- Garson ilk girişte rehberi görür. Profil → **Bildirimler** bölümü durumu ve aç/kapat düğmesini gösterir.
- `LoginPage`'deki marka yazısı `public/brand/wordmark.png` ile değişir (`alt="Ramo's Döner & Grill House"`).

`public/.htaccess` ve `public/assets/.htaccess` Görev 28'de tanımlanan içeriklerle burada oluşturulur. Vite bu dosyaları `dist`'e kopyalar.

Run: `npm test -w apps/web` → PASS

- [ ] **Adım 4: E2E — PWA temel kontrolleri (üretim build'i)**

`apps/web/e2e/pwa.spec.ts`:
- `npm run build -w apps/web && npx -w apps/web vite preview --port 4173` üzerinde çalışır. Ayrı bir Playwright projesiyle, `baseURL http://localhost:4173`.
- Kontroller:
  1. `/manifest.webmanifest` erişilebilir, `display: standalone`, 3 ikon.
  2. Sayfa yeniden yüklenince `navigator.serviceWorker.controller` dolu.
  3. Çevrimdışıyken (`context.setOffline(true)`) uygulama kabuğu açılır ve "İnternet yok" şeridi görünür.
- Görüntü: `docs/screenshots/m7-install-guide-390.png`.

- [ ] **Adım 5: Commit**
```bash
git add scripts/make-brand-assets.py apps/web docs/screenshots
git commit -m "feat(pwa): marka ikonları (PDF'ten), manifest, injectManifest SW (push, bildirim tıklama, güncelleme), kurulum rehberi"
```

---

## Görev 26: "Hazır" bildirimi — `notify-ready` Edge Function, pg_net trigger, uygulama içi uyarı

**Files:**
- Create: `supabase/migrations/0007_notify_ready.sql`
- Create: `supabase/functions/notify-ready/logic.ts`, `logic.test.ts`, `index.ts`
- Create: `scripts/gen-vapid.mjs`, `scripts/setup-push.mjs`
- Create: `apps/web/src/features/waiter/useReadyAlerts.ts` (+ `readyAlerts.test.ts`)
- Modify: `packages/shared/src/money.ts` → `localTableName`; `WaiterLayout.tsx` (uyarı hook'u); garson/KDS masa adı gösterimleri
- Test: `supabase/tests/push.test.ts`

**Interfaces:**
- Consumes: `push_subscriptions`, `profiles.on_duty_since`, `public.is_on_duty`; Web Push kütüphanesi; `useReadyOrders`, `useSoundAlert` (Görev 16)
- Produces:
  - `public.ready_push_targets(p_order_id uuid) → jsonb`
    - Dönüş: `{ order: { order_no, table, items[{qty, code, name}] }, targets: [{ id, endpoint, p256dh, auth, locale }] }`
    - **Yalnız `service_role` çağırabilir.**
  - `internal.notify_ready()` trigger'ı: `orders.status` → `ready` geçişinde `net.http_post` ile `notify-ready`'yi çağırır. URL ve sır Vault'tan okunur (`notify_ready_url`, `notify_ready_webhook_secret`).
  - `buildNotification(order, locale): { title; body; tag; url }`
    - Başlık: TR `"Masa 12 · #047 hazır"`, DE `"Tisch 12 · #047 fertig"`
    - Gövde: ilk 3 kalem, fazlası `+N`
    - `tag` = `order-<no>`, `url` = `/waiter/ready`
  - `localTableName(name: string, locale: Locale): string` → TR'de `"Tisch 12"` → `"Masa 12"`. **Fiş her zaman DB adını kullanır.**
  - `newlyReady(prev: Set<string>, orders: OrderView[]): OrderView[]`
  - `useReadyAlerts()`: yeni hazır siparişte banner + ses + titreşim (Android). İlk yüklemede uyarı vermez.

**Önemli — test sırası:** Web Push, yalnızca **güvenli bağlamda** (HTTPS ya da `localhost`) çalışır. Telefondan LAN IP'siyle açılan geliştirme sunucusu güvenli değildir. Bu görevde:
- Sunucu hattı otomatik test edilir: trigger → fonksiyon → sahte endpoint → abonelik temizliği.
- **Gerçek telefon testi Görev 28'de**, HTTPS yayından sonra yapılır.

- [ ] **Adım 1: Testleri yaz (kırmızı)**

`supabase/functions/notify-ready/logic.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { buildNotification } from './logic';

const order = { order_no: 47, table: 'Tisch 12', items: [
  { qty: 2, code: '05', name: 'Drehspieß Sandwich' }, { qty: 1, code: '59', name: 'Kuzu Şiş' },
  { qty: 3, code: null, name: 'Cola 0,33 l' }, { qty: 1, code: null, name: 'Ayran 0,25 l' }] };

describe('buildNotification', () => {
  it('Türkçe', () => expect(buildNotification(order, 'tr')).toEqual({
    title: 'Masa 12 · #047 hazır', body: '2x 05 Drehspieß Sandwich, 1x 59 Kuzu Şiş, 3x Cola 0,33 l +1',
    tag: 'order-47', url: '/waiter/ready' }));
  it('Almanca', () => expect(buildNotification(order, 'de').title).toBe('Tisch 12 · #047 fertig'));
});
```
`apps/web/src/features/waiter/readyAlerts.test.ts`: `newlyReady(new Set(['a']), [{id:'a'}, {id:'b'}])` → yalnız `b` döner.

`supabase/tests/push.test.ts`:
```ts
import { beforeAll, describe, expect, it } from 'vitest';
import { cleanupFixtureOrders, ensureFixtures } from './helpers/fixtures';
import { sql } from './helpers/sql';
import { clientFor, ensureTestUsers, serviceClient } from './helpers/users';

let ids: Awaited<ReturnType<typeof ensureTestUsers>>;
beforeAll(async () => { ids = await ensureTestUsers(); await ensureFixtures(); await cleanupFixtureOrders(); });

describe('ready push hattı', () => {
  it('ready_push_targets yalnız service_role', async () => {
    const waiter = await clientFor('waiter');
    const { error } = await waiter.rpc('ready_push_targets', { p_order_id: crypto.randomUUID() });
    expect(error?.code).toBe('42501');
  });

  it('yalnız mesaideki personelin abonelikleri hedeflenir', async () => {
    await sql(`update public.profiles set on_duty_since = now() where id = '${ids.waiter}';
               update public.profiles set on_duty_since = null where id = '${ids.waiter2}';
               insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
               values ('${ids.waiter}', 'https://push.invalid/on', 'k', 'a'), ('${ids.waiter2}', 'https://push.invalid/off', 'k', 'a')
               on conflict (endpoint) do nothing;`);
    const { data } = await serviceClient().rpc('ready_push_targets', { p_order_id: crypto.randomUUID() });
    const eps = (data as { targets: { endpoint: string }[] }).targets.map((t) => t.endpoint);
    expect(eps).toContain('https://push.invalid/on');
    expect(eps).not.toContain('https://push.invalid/off');
  });

  it('ready geçişi pg_net ile fonksiyonu çağırır (200)', async () => {
    const waiter = await clientFor('waiter'); const kitchen = await clientFor('kitchen');
    const f = await ensureFixtures();
    const id = crypto.randomUUID();
    await waiter.rpc('submit_order', { p_order_id: id, p_table_id: f.tableId, p_items: [{ product_id: f.colaId, quantity: 1 }] });
    const before = Number((await sql<{ n: number }>(`select count(*) n from net._http_response`))[0]!.n);
    await kitchen.rpc('mark_order_ready', { p_order_id: id });
    await new Promise((r) => setTimeout(r, 6000));
    const rows = await sql<{ status_code: number }>(`select status_code from net._http_response order by id desc limit 1`);
    expect(Number((await sql<{ n: number }>(`select count(*) n from net._http_response`))[0]!.n)).toBeGreaterThan(before);
    expect(rows[0]!.status_code).toBe(200);
    await sql(`delete from public.push_subscriptions where endpoint like 'https://push.invalid/%'`);
  });
});
```
Run: `npm run fn:test` ve `npm run db:test -- push` → Expected: FAIL

- [ ] **Adım 2: VAPID anahtarları ve web tarafı ortam değişkeni**

`scripts/gen-vapid.mjs` — Web Crypto ile P-256 anahtar çifti üretir. Çıktı iki kütüphane biçimini de karşılar: public anahtar hem raw base64url hem JWK, private anahtar JWK.
```js
const { subtle } = globalThis.crypto;
const kp = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const raw = Buffer.from(await subtle.exportKey('raw', kp.publicKey)).toString('base64url');
const pubJwk = await subtle.exportKey('jwk', kp.publicKey);
const privJwk = await subtle.exportKey('jwk', kp.privateKey);
console.log(`VITE_VAPID_PUBLIC_KEY=${raw}`);
console.log(`VAPID_PUBLIC_JWK=${JSON.stringify(pubJwk)}`);
console.log(`VAPID_PRIVATE_JWK=${JSON.stringify(privJwk)}`);
```
Değerleri şöyle dağıt:
- `VITE_VAPID_PUBLIC_KEY` → `apps/web/.env`
- `VAPID_PUBLIC_JWK`, `VAPID_PRIVATE_JWK`, `WEBHOOK_SECRET` (rastgele 32 bayt) → kök `.env`

`VAPID_SUBJECT` olarak uygulamanın **https adresini** kullan (öneri `https://ramos.arxdigitalsevice.com`, M8'de teyit edilir). Kişisel e-posta adresi kullanma.

- [ ] **Adım 3: Migration 0007**

`supabase/migrations/0007_notify_ready.sql`:
```sql
-- 0007 — "Hazır" push hattı (spec §11.3)
create extension if not exists pg_net;

create function public.ready_push_targets(p_order_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'order', (select jsonb_build_object('order_no', o.order_no, 'table', t.name,
                'items', (select coalesce(jsonb_agg(jsonb_build_object('qty', i.quantity, 'code', i.product_code, 'name', i.product_name)
                                  order by i.is_beverage, i.category_sort, i.sort), '[]'::jsonb)
                          from public.order_items i where i.order_id = o.id and i.status = 'active'))
              from public.orders o
              join public.table_sessions ts on ts.id = o.session_id
              join public.dining_tables t on t.id = ts.table_id
              where o.id = p_order_id),
    'targets', (select coalesce(jsonb_agg(jsonb_build_object('id', ps.id, 'endpoint', ps.endpoint,
                  'p256dh', ps.p256dh, 'auth', ps.auth, 'locale', p.locale)), '[]'::jsonb)
                from public.push_subscriptions ps join public.profiles p on p.id = ps.user_id
                where p.is_active and p.role in ('waiter', 'admin') and public.is_on_duty(p.on_duty_since)));
$$;

create function internal.notify_ready() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_url text; v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'notify_ready_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'notify_ready_webhook_secret';
  if v_url is null or v_secret is null then return null; end if;
  perform net.http_post(
    url := v_url,
    body := jsonb_build_object('order_id', new.id),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', v_secret),
    timeout_milliseconds := 5000);
  return null;
end $$;

create trigger orders_notify_ready after update of status on public.orders
  for each row when (new.status = 'ready' and old.status is distinct from 'ready')
  execute function internal.notify_ready();

revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
revoke all on all functions in schema internal from public, anon, authenticated;
-- ready_push_targets toplu grant'tan SONRA daraltılır: yalnız service_role
revoke execute on function public.ready_push_targets(uuid) from authenticated;
```
**Kural:** Bundan sonra eklenecek migration'larda toplu `grant … to authenticated` bloğu kullanılırsa `ready_push_targets` için `revoke` satırı tekrar edilir. `push.test`'in ilk testi bunu yakalar.

Run: `npm run db:apply`

`scripts/setup-push.mjs` — Vault sırlarını yazar. Değerler repoya girmez, `.env`'den okunur:
```js
import { runSql } from './db.mjs';
const url = `${process.env.SUPABASE_URL}/functions/v1/notify-ready`;
const secret = process.env.WEBHOOK_SECRET;
if (!secret) { console.error('.env: WEBHOOK_SECRET eksik'); process.exit(1); }
const esc = (s) => s.replace(/'/g, "''");
for (const [name, value] of [['notify_ready_url', url], ['notify_ready_webhook_secret', secret]]) {
  await runSql(`do $$ begin
    if exists (select 1 from vault.secrets where name = '${name}') then
      perform vault.update_secret((select id from vault.secrets where name = '${name}'), '${esc(value)}');
    else perform vault.create_secret('${esc(value)}', '${name}'); end if; end $$;`);
}
console.log('Vault sırları yazıldı');
```
`scripts/db.mjs`, `runSql` fonksiyonunu export eder ve komut satırı ancak doğrudan çalıştırıldığında devreye girer (`import.meta.url === pathToFileURL(process.argv[1]).href` kontrolü). Bu değişikliği yap.

Run: `node --env-file=.env scripts/setup-push.mjs`

- [ ] **Adım 4: Fonksiyon mantığı ve giriş noktası**

`supabase/functions/notify-ready/logic.ts`:
```ts
export interface ReadyOrder { order_no: number; table: string; items: { qty: number; code: string | null; name: string }[] }
export const localTableName = (name: string, locale: 'tr' | 'de') =>
  locale === 'tr' ? name.replace(/^Tisch\s+/i, 'Masa ') : name;
export function buildNotification(o: ReadyOrder, locale: 'tr' | 'de') {
  const no = `#${String(o.order_no).padStart(3, '0')}`;
  const shown = o.items.slice(0, 3).map((i) => `${i.qty}x ${i.code ? `${i.code} ` : ''}${i.name}`);
  const more = o.items.length > 3 ? ` +${o.items.length - 3}` : '';
  return {
    title: `${localTableName(o.table, locale)} · ${no} ${locale === 'tr' ? 'hazır' : 'fertig'}`,
    body: shown.join(', ') + more, tag: `order-${o.order_no}`, url: '/waiter/ready',
  };
}
```
Aynı `localTableName` fonksiyonunu `packages/shared/src/money.ts` içine de ekle ve `index`'ten export et. Garson ve KDS arayüzünde masa adları bununla gösterilir: TR kullanıcı "Masa 12" görür. Fişte ise hep DB adı ("TISCH 12") kalır.

`supabase/functions/notify-ready/index.ts`:
- `POST` isteğinde `x-webhook-secret` ≠ `Deno.env.get('WEBHOOK_SECRET')` ise `401`.
- Gövdeden `{ order_id }` alınır.
- `service` istemcisiyle `rpc('ready_push_targets', { p_order_id })` çağrılır.
- Her hedef için:
  1. `buildNotification(order, target.locale)` ile JSON payload hazırlanır.
  2. Seçilen kütüphaneyle gönderilir, `TTL` 300 sn, `urgency: 'high'`:
     - **`@pushforge/builder`:** `buildPushHTTPRequest({ privateJWK, subscription: { endpoint, keys: { p256dh, auth } }, message: { payload, adminContact: VAPID_SUBJECT, options: { ttl: 300, urgency: 'high' } } })` → dönen `{ endpoint, headers, body }` ile `fetch`
     - **ya da `jsr:@negrel/webpush`:** `importVapidKeys` → `ApplicationServer.new` → `subscribe(...).pushTextMessage(...)`
     - Kütüphanenin güncel README'sine göre yaz.
  3. Yanıt `404`/`410` ise abonelik silinir. Başarıda `last_success_at = now()` yazılır.
- Dönüş: `{ sent, removed }`.
- Function secret'ları: `VAPID_PUBLIC_JWK`, `VAPID_PRIVATE_JWK`, `VAPID_SUBJECT`, `WEBHOOK_SECRET` (Management API `/secrets`).
- Yayın: `npm run fn:deploy -- notify-ready --no-verify-jwt` (kullanıcı onayıyla).

Run: `npm run fn:test` → PASS. `npm run db:test -- push` → PASS. Sahte endpoint `push.invalid` olduğu için ağ hatası beklenir; fonksiyon yine `200` döner.

- [ ] **Adım 5: Uygulama içi "Hazır" uyarısı**

`useReadyAlerts.ts`:
- `useReadyOrders()` verisini izler; `newlyReady` sonucu dolu ve bu ilk yükleme değilse şunları yapar:
  1. Üstte kalıcı banner: "Masa 12 · #047 hazır → Göster", dokununca `/waiter/ready`.
  2. `beep()` (Görev 16'daki `useSoundAlert`; ilk dokunuşta kilit açılır).
  3. `navigator.vibrate?.([200, 100, 200])`.
- `WaiterLayout` bu hook'u çağırır.
- Sipariş teslim edildiğinde banner kendiliğinden kapanır.

- [ ] **Adım 6: Commit + M7 raporu**
```bash
git add supabase/migrations/0007_notify_ready.sql supabase/functions/notify-ready supabase/tests/push.test.ts scripts/gen-vapid.mjs scripts/setup-push.mjs scripts/db.mjs apps/web packages/shared
git commit -m "feat(push): notify-ready (Vault + pg_net trigger), mesaideki garsonlara Web Push, uygulama içi hazır uyarısı"
```
Rapora şunları yaz: sunucu hattının doğrulandığı, gerçek telefon testinin Görev 28'e kaldığı (HTTPS gerekli).

