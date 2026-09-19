# Epson Server Direct Print (SDP) — protokol notları

Epson TM yazıcı (ör. TM-m30III) belirli aralıkla sunucumuza HTTP(S) POST atar, sunucu fişi yanıtın içinde
ePOS-Print XML olarak döner, yazıcı basar ve sonucu bir sonraki POST'ta bildirir. Bilgisayar ya da
yazdırma ajanı gerekmez. Uygulama: `supabase/functions/epson-sdp/` + `supabase/migrations/0012_epson_sdp.sql`.
Kurulum adımları: [KURULUM.md §2.7](KURULUM.md#27-epson-server-direct-print-bilgisayarsız).

İşaretler: **[belge]** Epson belgesinde açıkça yazıyor · **[çıkarım]** belgeden çıkarıldı / başka
kaynaktan · **[belirsiz]** gerçek yazıcıda denenmedi, doğrulanmalı.

## Kaynaklar

1. *Server Direct Print User's Manual* M00062910 Rev.K (Epson, 2016) —
   <https://files.support.epson.com/pdf/pos/bulk/server_direct_print_um_en_revk.pdf> (bölüm 3 "Request and Response").
2. *ePOS-Print XML User's Manual* Rev.AF —
   <https://files.support.epson.com/pdf/pos/bulk/epos-print_xml_um_en_rev_af.pdf> (`<command>`, `<text lang>`).
3. *TM-m30III Technical Reference Guide* Rev.B —
   <https://files.support.epson.com/pdf/pos/bulk/tm-m30iii_trg_en_revb.pdf> (s. 91 "TM-Intelligent Function":
   Server Direct Print ve Status Notification destekli, 3 URL, ePOS-Print XML).
4. Epson SDP özet sayfası: <https://download4.epson.biz/sec_pubs/pos/reference_en/technology/server_direct_print.html>
   (otomatik indirmeye 403 veriyor, tarayıcıdan açılır).
5. TM-m30III Web Config SDP alanları (üçüncü taraf kurulum rehberi):
   <https://graystephelp.freshdesk.com/support/solutions/articles/47001279469-cpos-setting-up-epson-tm-m30iii>.
6. *Web Config Reference Guide TM-m30III/m50II/P20II/P80II* —
   <https://download4.epson.biz/sec_pubs/bs/pdf/TM-m30III_m50II_P20II_P80II_WebConfig_rg_en_RevG.pdf> (otomatik
   indirmeye 403 verdi; okunamadı).

Not: Rev.K belgesi TM-m30III'ten eskidir; model listesinde TM-i/TM-DT/TM-T88VI var. TM-m30III'ün SDP desteği
kaynak 3'ten; protokolün aynı olduğu **[çıkarım]**.

## 1. Yazıcının isteği (print request) — [belge]

```
POST <Web Config'teki URL>
Content-Type: application/x-www-form-urlencoded

ConnectionType=GetRequest&ID=<Web Config ID alanı>
```

- Gönderim aralığı Web Config "Interval" (sn): önceki iletişimin bitişinden sonrakinin başlangıcına kadar.
- İletişim başarısızsa aralık sonunda yeniden denenir.
- `ID`: Web Config'teki ID; Digest kimlik doğrulamasının kullanıcı adı olarak da kullanılır.
- TM-m30III Web Config'te ayrıca **Name** (varsayılan seri numarası) ve **URL Encode** alanları var (kaynak 5).
  Name'in form alanı olarak gönderildiği **[belirsiz]**; kodumuz `Name`'i okur ama kullanmaz.

## 2. Sunucu yanıtı — [belge]

`HTTP 200`, `Content-Type: text/xml; charset=utf-8`, yalnız UTF-8, **BOM yok**, en fazla 2 MB (TM-T88VI; TM-m30III
için sınır **[belirsiz]**, fişlerimiz ~2–8 KB).

```xml
<?xml version="1.0" encoding="utf-8"?>
<PrintRequestInfo Version="2.00">
  <ePOSPrint>
    <Parameter>
      <devid>local_printer</devid>
      <timeout>60000</timeout>
      <printjobid>…</printjobid>
    </Parameter>
    <PrintData>
      <epos-print xmlns="http://www.epson-pos.com/schemas/2011/03/epos-print">
        <command>1b401c2e1b7430…</command>
      </epos-print>
    </PrintData>
  </ePOSPrint>
  <!-- bir istekte birden çok <ePOSPrint> olabilir; biz en fazla 5 iş koyuyoruz -->
</PrintRequestInfo>
```

- `Version`: yok/`1.00` → printjobid yok; `2.00` → printjobid var (TM-T88VI, TM-i 4.1+, TM-DT 3.0+);
  `3.00` → + müşteri ekranı + XML hata bildirimi (yalnız TM-T88VI). Sürümler arası uyum yok. **2.00 seçtik**;
  TM-m30III'ün 2.00'ı desteklediği **[belirsiz]** (en olası sürüm; desteklemezse sonuç printjobid'siz gelir ve
  işler 60 sn sonra yeniden gönderilir → çift baskı riski; ilk kurulumda test fişiyle doğrulanmalı).
- `devid`: yazıcının kendisi için `local_printer` [belge, örneklerde]. `timeout` ms.
- `printjobid`: **1–30 alfanümerik** karakter [çıkarım: ePOS-Print API kılavuzu]. UUID (36 karakter) sığmadığı için
  iş kimliği 25 haneli base36'ya çevrilip geri çözülür (`logic.ts` `jobIdToPrintJobId`).
- **Boş kuyruk**: `200`, `Content-Type: text/xml; charset=utf-8`, `Content-Length: 0` [belge, s. 46].

### Ham ESC/POS: `<command>` — [belge]

ePOS-Print XML'de `<command>41424344450a</command>` "ESC/POS komutlarını onaltılık kodla" gönderir; eleman
tablosunda tüm yazıcı sütunlarında destekli. Belge uyarısı: ePOS-Print arayüzü bu komutları denetlemez, ePOS'un
kendi durumunu bozabilir. Biz fişin tamamını tek `<command>` olarak yolluyoruz: ajanın bastığı baytların aynısı
(`ESC @`, `FS .`, `ESC t n`, metin, `GS V 66 0`). TM-m30III'te `ESC @` ile başlayan ham fişin sorunsuz basıldığı
**[belirsiz]**. Sorun çıkarsa plan: kesmeyi `<cut type="feed"/>` elemanına taşımak ya da `<text>`/`<feed>`/`<cut>`
elemanlarına geçmek.

**Türkçe harfler:** `<text lang>` değerleri en/de/fr/it/es (ANK), ja, ko, zh ve `mul` (UTF-8, bazı modellerde)
[belge]; Türkçe dil kodu yok. `<text>` yolunda Ş/ğ/İ/ı için `mul` gerekirdi ve TM-m30III desteği **[belirsiz]**.
Bu yüzden `<command>` + `ESC t` kod sayfası seçildi: kod sayfası ADI `settings.printer_codepage`'den, NUMARASI
Epson tablosundan (cp857 → 13, windows1254 → 48, cp858 → 19, windows1252 → 16, cp437 → 0; bilinmeyen → windows1254/48).

## 3. Baskı sonucu (printing result) — [belge]

```
POST <URL>
Content-Type: application/x-www-form-urlencoded

ConnectionType=SetResponse&ID=<ID>&ResponseFile=<XML>
```

`Version="2.00"` için:

```xml
<PrintResponseInfo Version="2.00">
  <ePOSPrint>
    <Parameter><devid>local_printer</devid><printjobid>ABC123</printjobid></Parameter>
    <PrintResponse>
      <response xmlns="http://www.epson-pos.com/schemas/2011/03/epos-print"
                success="true" code="" status="251854870" battery="0"/>
    </PrintResponse>
  </ePOSPrint>
</PrintResponseInfo>
```

- Başarısızlıkta `success="false"` ve `code`: `EPTR_REC_EMPTY` (kağıt yok), `EPTR_COVER_OPEN`, `EPTR_CUTTER`,
  `EPTR_MECHANICAL`, `EPTR_AUTOMATICAL`, `EPTR_UNRECOVERABLE`, `EX_BADPORT`, `EX_TIMEOUT`, `SchemaError`,
  `DeviceNotFound`, `PrintSystemError`, `EX_SPOOLER`, `JobNotFound`, `Printing`.
- Belgedeki 2.00 örneklerinde kapanış etiketleri hatalı (`</PrintResponseInfo>` fazladan); ayrıştırıcı etiket
  sırasına güvenmez.
- 3.00'da XML hatası `<ServerDirectPrint><Response Success="false"><ErrorSummary>…` olarak gelir (printjobid yok).
- Sunucu yanıtı: `200`, boş gövde [belge, s. 54].
- Web Config'te "URL Encode" kapalıysa `ResponseFile` ham XML olarak gelebilir; `parseForm` bunu da okur
  **[çıkarım]**. Önerimiz: URL Encode = Enable.
- Spooler açıksa sonuç baskıdan önce, alındığında gönderilebilir [belge, TM-i 4.1+/TM-T88VI dipnotu].

## 4. Kimlik doğrulama

- Belgede **Basic auth yok**; yalnız **Digest** var [belge, s. 55]: yazıcı önce sahte istek atar, sunucu
  `401` döner, yazıcı ID/parola ile Digest yanıtı gönderir. Parolasız ID ile Digest çalışmaz.
- Uygulamamız Digest yerine **URL'de anahtar** kullanır: `…/functions/v1/epson-sdp?t=<64 hex>`. Anahtar
  32 rastgele bayt; DB'de yalnız sha256 özeti (`sdp_printers.token_hash`). Yedek: `?t` yoksa form `ID` alanı
  anahtar sayılır (Web Config ID alanının 64 karakter alıp almadığı **[belirsiz]**).
- Yanlış/eksik anahtar `401`, pasif yazıcı `403`, POST dışı `405`, 256 KB üstü gövde `413`, DB hatası `500`
  (yazıcı aralıkla yeniden dener). Yazıcı bu kodları Web Config günlüğünde / "Access Test"te gösterir **[çıkarım]**.
- Risk: URL'deki anahtar Supabase fonksiyon günlüklerinde istek adresiyle görünebilir **[belirsiz]**. Anahtar
  sızarsa Ayarlar → "Anahtarı yenile".

## 5. HTTPS ve sertifika

- TM-T88VI tüm sürümler: HTTPS, sunucu doğrulamalı HTTPS, TLS 1.2 destekli; SSL3 yok [belge, s. 13]. TM-m30III
  için aynısı **[çıkarım]**.
- Web Config "Server Authentication": açıksa sunucu sertifikası yazıcıya **kayıtlı kök sertifikalarla** doğrulanır
  ("Register certificates in advance") [belge]. Kapalıyken bağlantı şifreli ama sunucu doğrulanmaz.
- Supabase (`*.supabase.co`, Cloudflare arkasında) sertifika zinciri (2026-09-17 ölçümü):
  - TLS 1.3/ECDSA istemci: `supabase.co` ← GTS WE1 ← GTS Root R4 ← (çapraz) GlobalSign Root CA
  - TLS 1.2/RSA istemci: `supabase.co` ← GTS WR1 ← GTS Root R1 ← (çapraz) GlobalSign Root CA
  Yani eski RSA'lı TLS 1.2 istemcisine de uygun zincir sunuluyor. TM-m30III kök deposunda GTS Root R1 ya da
  GlobalSign Root CA bulunup bulunmadığı **[belirsiz]** (Web Config Reference Guide okunamadı; firmware 13.x notlarında
  "Automatic certificate update" var). Öneri: önce Server Authentication **Disable** ile "Access Test"; sonra
  Enable deneyin, geçmezse GTS Root R1'i Web Config → sertifika içe aktarma ile ekleyin ya da Disable bırakın.

## 6. Kuyruk semantiği (bizim tasarım)

- `settings.print_route`: `agent` (varsayılan) | `epson_sdp`. `epson_sdp` iken `claim_print_job` (ajan) boş döner
  ve `agent_heartbeat` `printer_status`'a yazmaz; `agent` iken SDP iş almaz.
- `sdp_claim_next`: `claim_print_job` kuralı (pending ya da 60 sn'den eski printing), `claimed_by =
  'epson-sdp:<yazıcı id>'`, istek başına ≤ 5 iş; `printer_status`'a `host = 'Epson SDP'` ve `last_seen_at` yazar
  (admin şeridindeki "Yazıcı bağlantısı yok" 90 sn eşiği SDP'de de çalışır).
- `sdp_complete`: `complete_print_job` semantiği (printed / 5-15-30-60-120 sn geri çekilme / 6. hatada failed);
  `EPTR_REC_EMPTY` → `printer_state.paper_end`, `EPTR_COVER_OPEN` → `cover_open`, `EX_BADPORT|EX_TIMEOUT|
  DeviceNotFound|PrintSystemError` → `printer_reachable = false`.
- Sonuç 60 sn içinde gelmezse iş yeniden verilir → olası çift baskı (ajandaki davranışla aynı).
- Baskı yolu SDP'den ajana geçerken "printing" durumundaki bir iş 60 sn sonra ajana düşebilir (olası çift baskı).

## 7. Belirsizlik özeti (gerçek yazıcıda doğrulanacak)

1. TM-m30III `PrintRequestInfo Version="2.00"` ve printjobid'li sonuç gönderiyor mu?
2. `<command>` ile `ESC @ … GS V` içeren ham fiş doğru basılıyor mu (Türkçe harfler, kesme)?
3. Web Config "Access Test" Supabase HTTPS adresine geçiyor mu; Server Authentication Enable ile kök sertifika var mı?
4. Interval alt sınırı (5 sn kabul ediliyor mu), `Name` form alanı, ID alanı uzunluğu.
5. URL'deki `?t=` sorgu dizgisi yazıcıda korunuyor mu (bazı istemciler sorgu dizgisini atabilir).

## 8. Doğrudan ePOS-Print (Server Direct Print değil)

Aynı `<epos-print>` / `<command>` belgesi, yazıcının **kendi** web servisine de gönderilebilir:
`POST http(s)://<yazıcı IP>/cgi-bin/epos/service.cgi?devid=local_printer&timeout=<ms>` (SOAP zarfı içinde).
Yazıcı hemen `<response success="true|false" code="…" status="<ASB>"/>` ile cevap verir; sunucu, aralık ya da
Web Config ayarı gerekmez — Epson TM Utility'nin test fişi bastığı yol budur. TM-m30III bazı kurulumlarda ham
9100/9143 baskısına hiç cevap vermezken ePOS-Print çalışır.

Uygulama (2026-09-19): tablet istasyonu (`apps/mobile … EposClient.java`, `PrinterClient.java`) ve yazdırma
ajanı (`apps/print-agent/src/epos.ts`). Yol seçimi **port** ile: `443` → HTTPS, `80` → HTTP; Ayarlar → Yazıcı
türü → **Epson TM-m30III (ePOS-Print, port 443)**. `status` özniteliği (ASB, 32 bit) DLE EOT 1/2/4 biçimine
çevrilir ki durum okuyan her yer tek ayrıştırıcıyla kalsın (`asbToStatus`). İstek tamamen yazıldıktan sonra yanıt
gelmezse ham yolla aynı kural uygulanır: iş basılmış sayılır (çift fiş olmasın). Kurulum: [KURULUM.md §2.6](KURULUM.md#26-epson-tm-m30iii-secure-printing-ve-epos-print).
