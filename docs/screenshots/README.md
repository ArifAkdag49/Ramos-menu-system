# Ekran görüntüleri dizini

Dosya adı kalıbı: `<aşama>-<ekran>[-<dil>]-<genişlik>.png`. Genişlik piksel cinsinden: 390 telefon, 1280 mutfak tableti, 1440 masaüstü. `-de` Almanca arayüzü gösterir; eki olmayanlar Türkçedir.
Görüntülerin çoğu Playwright E2E koşularında yeniden üretilir. Üreten spec'ler `apps/web/e2e/` klasöründedir.

## M2 · Giriş (Görev 11)

| Dosya | Ekran | Üreten |
|---|---|---|
| `m2-login-phone.png` | Giriş ekranı, telefon | `login.spec.ts` |
| `m2-login-tablet.png` | Giriş ekranı, tablet | `login.spec.ts` |
| `m2-login-desktop.png` | Giriş ekranı, masaüstü | `login.spec.ts` |

## M3 · Garson (Görev 13–15, tasarım kapısı)

| Dosya | Ekran | Üreten |
|---|---|---|
| `m3-tables-390.png` | Masalar ızgarası (açık ve hazır masalar dolu) | `design-gate.spec.ts`, `waiter-flow.spec.ts` |
| `m3-tables-filter-390.png` | Masalar, filtre uygulanmış | `design-gate.spec.ts` |
| `m3-tables-de-390.png` | Masalar (DE) | `design-gate.spec.ts` |
| `m3-table-detail-390.png` | Masa detayı: turlar ve kalemler | `design-gate.spec.ts`, `waiter-flow.spec.ts` |
| `m3-table-detail-de-390.png` | Masa detayı (DE) | `design-gate.spec.ts` |
| `m3-order-loading-390.png` | Sipariş girişi, menü yükleniyor (iskelet) | `design-gate.spec.ts` |
| `m3-order-menu-390.png` | Sipariş girişi: menü ve arama | `design-gate.spec.ts`, `order.spec.ts` |
| `m3-order-menu-de-390.png` | Sipariş girişi (DE) | `design-gate.spec.ts` |
| `m3-product-sheet-390.png` | Ürün paneli: varyant, çıkarılan malzeme, sos | `design-gate.spec.ts`, `order.spec.ts` |
| `m3-product-required-390.png` | Ürün paneli: zorunlu seçim uyarısı | `design-gate.spec.ts` |
| `m3-pizza-mix-390.png` | Ürün paneli: pizza karışık seçim | `order.spec.ts` |
| `m3-cart-full-390.png` | Dolu sepet | `design-gate.spec.ts` |
| `m3-confirm-full-390.png` | Mutfağa gönderme onayı (dolu) | `design-gate.spec.ts` |
| `m3-ready-390.png` | Hazır sekmesi | `design-gate.spec.ts`, `waiter.spec.ts` |
| `m3-profile-390.png` | Profil sekmesi (dil, mesai) | `design-gate.spec.ts`, `waiter.spec.ts` |
| `m3-flow-cart-390.png` | Uçtan uca akış: sepet | `waiter-flow.spec.ts` |
| `m3-flow-offline-390.png` | Uçtan uca akış: çevrimdışı uyarısı | `waiter-flow.spec.ts` |
| `m3-flow-confirm-390.png` | Uçtan uca akış: gönderme onayı | `waiter-flow.spec.ts` |
| `m3-flow-sent-390.png` | Uçtan uca akış: gönderildi | `waiter-flow.spec.ts` |
| `m3-flow-bill-390.png` | Uçtan uca akış: hesap | `waiter-flow.spec.ts` |
| `m3-flow-cancelled-390.png` | Uçtan uca akış: kalem iptali | `waiter-flow.spec.ts` |
| `m3-flow-move-390.png` | Uçtan uca akış: masa taşıma | `waiter-flow.spec.ts` |
| `m3-flow-tables-390.png` | Uçtan uca akış: masa kapatıldıktan sonra masalar | `waiter-flow.spec.ts` |

## M4 · Mutfak ekranı / KDS (Görev 16, tasarım kapısı)

| Dosya | Ekran | Üreten |
|---|---|---|
| `m4-kds-start-1280.png` | "Mutfak ekranını başlat" | `design-gate.spec.ts` |
| `m4-kds-1280.png` | KDS sipariş kartları | `design-gate.spec.ts`, `kitchen.spec.ts` |
| `m4-kds-soldout-1280.png` | Tükendi işaretleme | `design-gate.spec.ts` |
| `m4-kds-ready-1280.png` | Hazır sütunu dolu | `design-gate.spec.ts`, `kitchen.spec.ts` |

## M6 · Admin (Görev 21–22, tasarım kapısı)

| Dosya | Ekran | Üreten |
|---|---|---|
| `m6-dashboard-loading-1440.png` | Canlı durum, yükleniyor | `m6-admin-gate.spec.ts` |
| `m6-dashboard-1440.png` | Canlı durum ekranı | `m6-admin-gate.spec.ts` |
| `m6-dashboard-de-1440.png` | Canlı durum (DE) | `m6-admin-gate.spec.ts` |
| `m6-dashboard-390.png` | Canlı durum, telefon | `m6-admin-gate.spec.ts` |
| `m6-dashboard-de-390.png` | Canlı durum, telefon (DE) | `m6-admin-gate.spec.ts` |
| `m6-dashboard-drawer-390.png` | Telefon: gezinme çekmecesi açık | `m6-admin-gate.spec.ts` |
| `m6-menu-products-1440.png` | Menü yönetimi: ürün listesi | `admin-menu.spec.ts` |
| `m6-product-editor-1440.png` | Ürün düzenleyici | `admin-menu.spec.ts` |
| `m6-ticket-preview-1440.png` | Fiş önizleme | `admin-menu.spec.ts` |

## M8 · Canlı yayın (Görev 28)

| Dosya | Ekran | Kaynak |
|---|---|---|
| `m8-canli-login-390.png` | Canlı adreste giriş ekranı (`ramos.arxdigitalsevice.com`) | Plesk yayını duman testi |

## Demo · canlı müşteri sunumu akışı

Bu görüntüler canlı adreste `demo-garson` ve `demo-mutfak` hesaplarıyla, elle yürütülen uçtan uca doğrulamada alındı. E2E koşuları bunları yeniden üretmez.

| Dosya | Ekran |
|---|---|
| `demo-01-masalar-390.png` | Garson: masalar |
| `demo-02-menu-390.png` | Garson: sipariş girişi, menü |
| `demo-02b-urun-390.png` | Garson: ürün paneli |
| `demo-03-sepet-390.png` | Garson: sepet |
| `demo-04-gonderildi-390.png` | Garson: mutfağa gönderildi |
| `demo-05-kds-1280.png` | Mutfak: KDS'de yeni sipariş |
| `demo-06-kds-hazir-1280.png` | Mutfak: HAZIR işaretlendi |
| `demo-07-hazir-390.png` | Garson: Hazır sekmesi |

## Planda geçen ama henüz üretilmemiş görüntüler

- `m3-flow-close-kitchen-note-390.png`: `waiter-flow.spec.ts` bu görüntüyü çekiyor, ancak klasöre henüz kaydedilmedi.
- `m6-staff-1440.png`, `m6-orders-1440.png`, `m6-order-drawer-1440.png`: Görev 23.
- `m6-reports-1440.png`, `m6-settings-1440.png`, `m6-admin-390.png`: Görev 24.
- `m7-install-guide-390.png`: Görev 25.
