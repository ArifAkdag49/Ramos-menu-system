# RAMO'S — Tasarım sistemi

Bu dosya arayüzün anayasasıdır. Görev 11'de kuruldu; sonraki tüm ekranlar (garson, mutfak, admin)
buradaki kararlara uyar. Değişiklik gerekiyorsa önce burası güncellenir.

Kaynaklar: spec §8 (ekranlar), §14 (tasarım sistemi), `docs/BUILD-PROMPT.md` §10 (sadelik ilkeleri),
`ui-ux-pro-max` (design system + UX kuralları), `frontend-design` (sanat yönü), `design-system`
(token katmanları), `ui-styling` (erişilebilir primitive'ler), `brand` (ses tonu).

---

## 1. Sanat yönü — "kara tahta"

Menü kartının kimliği sürdürülür: **kara tahta zemin + neon lime + altın**. Ekran, mutfağın
duvarındaki tahtanın dijital hâli gibi durur: koyu, sakin, tek vurgulu.

Üç kural:

1. **Tek vurgu.** Bir ekranda yalnız bir şey parlar: ana eylem butonu ya da "hazır" rozeti.
   Geri kalan her şey sessiz kalır.
2. **Çizgi, gölge değil.** Yüzeyler birbirinden **1 px `--border`** çizgisiyle ayrılır. Gölge
   yalnızca gerçekten üstte duran katmanlarda (Sheet, Dialog, Toast) kullanılır.
3. **Süs yok.** Gradyan yıkama, cam efekti, parlama, dekoratif ikon yok. Renk bir anlam taşımıyorsa
   kullanılmaz.

**Bilinçli olarak kaçınılanlar** (şablon/AI görünümünün tipik işaretleri): krem zemin + serif
başlık; her bölümün üstünde harf aralıklı BÜYÜK HARF etiket; her kartta aynı yuvarlaklık ve aynı
yumuşak gri gölge; buton metninin sonuna eklenen "→"; "A · B · C" orta noktalı üstbilgi zincirleri;
bölüm bölüm aşağıdan yukarı kayan giriş animasyonları. Bunların yerine bilgi taşıyan yapı kullanılır
(durum rengi, kenarlık, gerçek sayı).

---

## 2. Token katmanları

`apps/web/src/styles/tokens.css` üç katmanlıdır: **temel → anlamsal → bileşen**. Bileşenlerde ham
hex yazılmaz; her zaman token okunur.

### 2.1 Temel (marka renkleri — SABİT, spec §14)

| Token | Değer | Not |
|---|---|---|
| `--color-bg` | `#0A0A0A` | Ekranın zemini |
| `--color-surface` | `#141414` | Kart, satır, panel |
| `--color-surface-2` | `#1C1C1C` | Kart içi kart, ikincil buton, input |
| `--color-border` | `#2A2A2A` | Tüm ayırıcı çizgiler |
| `--color-text` | `#F5F5F0` | Gövde metni |
| `--color-muted` | `#A3A3A3` | İkincil metin |
| `--color-lime` | `#88B600` | Aktif / devam eden |
| `--color-gold` | `#C49736` | Hazır |
| `--color-danger` | `#E5484D` | Çıkar / iptal / hata |
| `--color-warning` | `#F5A524` | Uyarı (yazıcı, mesai) |
| `--color-info` | `#3E9BFF` | Yazdırılıyor / kuyrukta |
| `--color-danger-ink` | `#FF7B7F` | Koyu yüzeyde kırmızı **metin** — türetilmiş, marka rengi değil |

#### Kontrast — ölçülen değerler

Aşağıdaki sayılar elle yazılmadı: `src/ui/tone.test.ts` bunları `tokens.css`'ten okuyup WCAG 2.1
formülüyle hesaplıyor ve eşiğin altına düşen her çift testi kırıyor. **Kabul eşiği 4,5 değil 5,0** —
eşiğe yüzdelik farkla dayanan renk kabul edilmez.

Düz `#0A0A0A` zeminde: text 18,1:1 · warning 9,7:1 · lime 8,2:1 · muted 7,9:1 · gold 7,4:1 ·
info 6,9:1 · danger 5,1:1.

**Asıl çalışan çiftler bunlar değil.** Hiçbir bileşen düz zemin üzerinde durmuyor: `TONE_CLASS`
metni kendi renginin `/15` tinti üzerine koyuyor ve her sonraki ekran bunu miras alıyor.

| Durum | Metin | Zemin | Oran |
|---|---|---|---|
| open (lime) | `--color-lime` | lime/15 → `#1D2409` | 6,7:1 |
| ready (gold) | `--color-gold` | gold/15 → `#261F11` | 6,1:1 |
| warning | `--color-warning` | warning/15 → `#2D210E` | 7,7:1 |
| info | `--color-info` | info/15 → `#12202F` | 5,8:1 |
| danger | **`--color-danger-ink`** | danger/15 → `#2B1314` | 7,0:1 |
| empty | `--color-muted` | `--color-surface-2` | 6,8:1 |

`--color-danger` **metin olarak** kendi tinti üzerinde 4,45:1 kalıyordu: AA eşiğinin altında, üstelik
uygulamanın en kritik yazısında (giriş hatası). Marka tokenı değiştirilemeyeceği için kırmızı metne
ayrı bir token verildi — `--color-danger-ink #FF7B7F`: bg 7,9 · surface 7,4 · surface-2 6,8 ·
danger tinti 7,0.

**Kural:** koyu yüzeydeki kırmızı yazı her zaman `text-danger-ink`'tir. `--color-danger` yalnız zemin,
kenarlık ve ikon olarak kullanılır; `bg-danger` üzerindeki yazı `text-bg`'dir (5,1:1).
Lime ve gold zemin olduğunda da **üzerine `#0A0A0A` metin** gelir (8,2:1 / 7,4:1).

### 2.2 Anlamsal (renk = anlam, her yüzeyde aynı)

| Anlam | Token | Nerede |
|---|---|---|
| Boş / pasif | `--color-muted` | Boş masa, tükenmiş ürün, pasif kayıt |
| Açık · mutfakta · aktif | `--color-lime` | Açık masa, `in_kitchen`, ana eylem |
| Hazır | `--color-gold` | Hazır siparişler, hazır rozeti (nabız) |
| Çıkar · iptal · hata | `--color-danger` | OHNE satırı, STORNO, hata şeridi |
| Uyarı | `--color-warning` | "Mesai kapalı", "Kağıt bitti" |
| Yazdırılıyor · kuyrukta | `--color-info` | Yazdırma rozeti, kuyruk |

Renk **tek başına** anlam taşımaz: her durumun yanında ikon **ve** yazı bulunur (`color-not-only`).

### 2.3 Bileşen katmanı

`--btn-primary-bg`, `--btn-primary-fg`, `--btn-secondary-bg`, `--btn-danger-bg`, `--field-bg`,
`--field-border`, `--ring` … Her bileşen kendi tokenını okur; tema değişikliği tek yerden yapılır.

---

## 3. Tipografi

**Tek aile: Montserrat Variable** (`@fontsource-variable/montserrat`, yerel). İkinci bir yazı tipi
yok — hiyerarşi ağırlık ve boyutla kurulur.

| Rol | Boyut / satır | Ağırlık |
|---|---|---|
| `display` (marka, KDS masa no) | 40 / 1.05 | 700 |
| `h1` (ekran başlığı) | 24 / 1.2 | 600 |
| `h2` (bölüm) | 20 / 1.3 | 600 |
| `kds-line` (mutfak kalem satırı) | 22 / 1.35 | 600 |
| `product` (ürün adı) | 17 / 1.35 | 600 |
| `body` (garson gövdesi) | 16 / 1.5 | 400 |
| `body-admin` | 14 / 1.5 | 400 |
| `label` | 14 / 1.4 | 500 |
| `caption` | 12 / 1.4 | 500 |

Kurallar:
- Garsonda gövde **≥ 16 px** (iOS'ta odaklanınca otomatik yakınlaştırmayı da önler), ürün adı ≥ 17 px,
  mutfakta kalem satırı ≥ 22 px, adminde gövde ≥ 14 px.
- Para, saat, sipariş no ve adet **`.tabular`** (`font-variant-numeric: tabular-nums`) ile yazılır;
  sayı değişince satır oynamaz.
- Satır uzunluğu 35–60 karakter (telefon), 60–75 (masaüstü).
- **CSS ile büyük harfe çevirme yok.** `text-transform: uppercase` + `lang="tr"` Almanca "i"yi "İ"
  yapar. Büyük harf gerekiyorsa metin zaten büyük yazılır ve kapsayıcıya `lang="de"` verilir.

---

## 4. Boşluk, köşe, kenarlık, katman

- **Boşluk ölçeği (4 pt tabanlı):** 4 · 8 · 12 · 16 · 24 · 32 · 48. Ekran kenar boşluğu 16 px.
  Bölüm arası 24 px, blok arası 32 px.
- **Köşe yuvarlaklığı anlam taşır:** `--radius-card 14px` (kart, panel) · `--radius-control 12px`
  (buton, input) · `--radius-sheet 20px` (alttan açılan panel, yalnız üst köşeler) ·
  `--radius-pill 999px` (çip, rozet). Hepsine aynı yuvarlaklık verilmez.
- **Kenarlık:** 1 px `--color-border`. Seçili/aktif durumda kenarlık rengi anlam rengine döner.
- **Gölge:** yalnız üç yerde — Sheet, Dialog, Toast: `0 -8px 32px rgb(0 0 0 / 0.55)`. Kartlarda gölge yok.
- **z ölçeği:** 0 içerik · 10 yapışkan başlık · 20 alt eylem çubuğu · 40 scrim · 50 sheet/dialog · 60 toast.

---

## 5. Dokunma ve erişilebilirlik

- Dokunma hedefi **≥ 48 px** (`--tap-min: 48px`); ana eylem butonu **56 px**.
- Komşu hedefler arası **≥ 8 px**.
- Ana eylemler ekranın **alt bölgesinde** (başparmak alanı), `env(safe-area-inset-bottom)` kadar
  ek alt boşlukla.
- **Odak halkası:** `focus-visible` ile 2 px `--color-lime` + 2 px offset. Odak halkası asla kaldırılmaz.
- Her input'un görünür `<label>`'ı vardır; yalnız `placeholder` ile etiketleme yok.
- Hata mesajları `role="alert"` ile duyurulur.
- Yalnız ikonlu buton yok — **ikon + yazı** (istisna: geri ve kapat; onlarda `aria-label` zorunlu).
- Kaydırma alanları yatay taşma yapmaz; `min-h-dvh` kullanılır (`100vh` değil).

---

## 6. Hareket

- Süre **150–220 ms**; girişte `ease-out`, çıkışta `ease-in` (çıkış girişin ~%70'i).
- Hareket yalnız **bir değişikliği anlatmak** için: sepete eklendi, gönderildi, hazır rozeti nabzı,
  sheet açılışı. Dekoratif animasyon yok; sayfa bölümlerinin sırayla belirmesi yok.
- Yalnız `transform` ve `opacity` animasyonlanır (düzen kaymaz).
- `prefers-reduced-motion: reduce` tüm animasyon ve geçişleri kapatır (tokens.css'te global kural).

---

## 7. Bileşen örnekleri

### Button

| Varyant | Zemin | Metin | Kullanım |
|---|---|---|---|
| `primary` | `--color-lime` | `#0A0A0A` | Ekranın tek ana eylemi |
| `secondary` | `--color-surface-2` | `--color-text` | Yan eylemler |
| `danger` | `--color-danger` | `#0A0A0A` | İptal, çıkar, kapat |
| `ghost` | saydam | `--color-text` | Liste içi üçüncül eylem |

| Özellik | Normal | :hover | :active | disabled | loading |
|---|---|---|---|---|---|
| Zemin | varyant | %8 açılır | %8 koyulaşır | varyant, `opacity .45` | varyant |
| Ölçek | 1 | 1 | 0.98 | 1 | 1 |
| İçerik | ikon + yazı | — | — | — | spinner + yazı |
| Tıklanır | ✓ | ✓ | ✓ | ✗ (`disabled`) | ✗ (`aria-busy`) |

Yükseklik: `md` 48 px, `lg` 56 px. Tam genişlik ana eylemde varsayılan.

### Diğer primitive'ler (`src/ui/`)

| Bileşen | Not |
|---|---|
| `IconButton` | 48 px kare, `aria-label` zorunlu (geri / kapat) |
| `Chip` | Pill, 48 px yükseklik, `aria-pressed` ile seçili durum |
| `Sheet` | Alttan açılır; `document.body`'ye portal, açıkken uygulama kökü `inert` + gövde kaydırması kilitli, **odak kapanı**, `Esc` ile kapanır, `role="dialog" aria-modal`. Scrim `aria-hidden` bir katmandır (düğme değil): erişilebilirlik ağacında ikinci bir "Kapat" oluşturmaz |
| `Stepper` | − / sayı / + ; her buton 48 px, sayı `.tabular`, `aria-live="polite"` |
| `Badge` | Durum rozeti: renk + ikon + yazı |
| `Banner` | Ekran üstü şerit (uyarı/hata), `role="status"` ya da `role="alert"` |
| `Toast` | Kısa onay, 3–5 sn, odağı çalmaz. Canlı bölge (`role="status" aria-live="polite"`) **sürekli monte kalır**, mesaj içine yazılır — bölge duyuru anında doğarsa çoğu ekran okuyucu hiçbir şey seslendirmez |
| `Spinner` | Etiketliyse `role="status"`, etiketsizse tamamen süs (`aria-hidden`, rol yok — ikisi birden çelişir); reduced-motion'da dönmez |
| `EmptyState` | İkon + tek cümle + tek eylem ("Bu masada sipariş yok — Sipariş al") |

---

## 8. Metin tonu (TR / DE)

`brand` (ses tonu) + `ui-ux-pro-max` kurallarıyla belirlendi (`design:ux-copy` kurulu değil).

- **Günlük dil, teknik terim yok.** "Mutfağa gönder", "Hazır", "Teslim edildi", "Masayı kapat".
  "RPC", "senkronizasyon", "oturum", "token" gibi kelimeler arayüzde geçmez.
- **Buton = eylemin kendisi.** "Gönder" değil "Mutfağa gönder"; "Tamam" değil "Masayı kapat".
  Aynı eylem akış boyunca aynı adı taşır.
- **Cümle düzeni:** cümle başı büyük, geri kalanı küçük. Ünlem yok, emoji yok.
- **Hata iki şey söyler: ne oldu + ne yapılmalı.**
  "İnternet yok — sepet saklandı, bağlantı gelince gönder."
- **Girişte tek genel hata:** "Kullanıcı adı veya PIN hatalı" / "Benutzername oder PIN falsch".
  Hangi alanın yanlış olduğu **söylenmez** (kullanıcı adı sızdırmamak için).
- **Boş durum yol gösterir**, üzülmez: "Bu masada sipariş yok — Sipariş al".
- **Almanca metin kapsayıcılarına `lang="de"`** verilir.
- Ürün adları tek dildir (menüdeki gibi); kategori/malzeme/seçenek adları `localName()` ile.
- Para `formatEuro()` (`8,50 €`), sipariş no `formatOrderNo()` (`#047`), tarih `dd.MM.yyyy HH:mm`.

---

## 9. Ekran iskeleti (sonraki görevler için)

- **Telefon öncelikli 390×844.** Üstte ince başlık (geri hep solda), ortada kaydırılan içerik,
  altta tek ana eylem + (garsonda) 3 sekmeli alt menü (Masalar · Hazır · Profil).
- **En fazla 2 seviye derinlik.** Ayrıntı bottom sheet ile açılır, yeni sayfa açılmaz.
- **Telefonda tablo yok** — kart ve liste.
- **Görselli/görselsiz aynı düzen:** ürün satırında 56 px kare, panel üstünde 4:3 kutu; görsel
  yoksa marka renklerinde yer tutucu (alev + ürün numarası). Sabit en-boy oranı, düzen kaymaz.
- Doğrulama görünümleri (Playwright): **390×844**, **1280×800**, **1440×900**.
