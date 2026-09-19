package com.arxdigital.ramos;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.Socket;
import java.net.SocketTimeoutException;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Epson ePOS-Print (TM-m30III vb.): fiş, yazıcının kendi web servisine HTTP(S) POST ile gider — Epson
 * TM Utility'nin test fişi bastığı yol. TM-m30III bazı kurulumlarda ham 9100/9143 baskısına hiç cevap
 * vermez; bu yol o durumda çalışır. Aynı ESC/POS baytları XML zarfın içinde onaltılık olarak yollanır
 * (ePOS-Print XML `<command>`, docs/epson-server-direct-print.md §2 ile aynı eleman).
 *
 * Saf Java (Android'e bağımlı değil): HTTP/1.1 elle yazılır ve okunur. HttpURLConnection KULLANILMAZ —
 * port 80 düz HTTP'dir ve Android'in ağ güvenlik politikası (usesCleartextTraffic=false) onu engeller;
 * ham soket bu politikaya tabi değildir. Soket bağlantısını (TLS dahil) {@link PrinterClient} kurar.
 *
 * İstek:  POST /cgi-bin/epos/service.cgi?devid=local_printer&timeout=<ms>
 *         Content-Type: text/xml; charset=utf-8 · SOAPAction: "" · Connection: close
 *         SOAP zarfı → epos-print → command (onaltılık ESC/POS); boş belge = yalnız durum sorusu.
 * Yanıt:  <response success="true|false" code="…" status="<ASB, ondalık 32 bit>" battery="…"/>
 *
 * Kurallar (PrinterClient.send ile aynı): yalnız yanıtı okunan istek başarılı/başarısız sayılır; istek
 * tamamen yazıldıktan sonra yanıt hiç gelmezse {@link NoResponseException} — çağıran "bayt gitti" kuralını
 * uygular (çift fiş olmasın). Yazma sırasındaki hata düz IOException (iş gitmedi).
 */
final class EposClient {

    static final String PATH = "/cgi-bin/epos/service.cgi";
    static final String DEVID = "local_printer";
    static final String NS = "http://www.epson-pos.com/schemas/2011/03/epos-print";
    /** Yanıt üst sınırı (gerçek yanıt birkaç yüz bayt). */
    static final int MAX_RESPONSE = 256 * 1024;
    private static final int MAX_HEADER = 32 * 1024;

    /** İstek tamamen yazıldı ama (tam) bir HTTP yanıtı okunamadı. */
    static final class NoResponseException extends IOException {
        NoResponseException(String msg) {
            super(msg);
        }
    }

    static final class Response {
        final int httpStatus;
        /** `<response success="true">`; HTTP 200 değilse false. */
        final boolean success;
        /** ePOS hata kodu (EPTR_COVER_OPEN, EPTR_REC_EMPTY, EX_TIMEOUT …); HTTP hatasında `http_<kod>`; başarıda "". */
        final String code;
        /** `status` özniteliği (ASB, 32 bit); yoksa null. */
        final Long asb;

        Response(int httpStatus, boolean success, String code, Long asb) {
            this.httpStatus = httpStatus;
            this.success = success;
            this.code = code;
            this.asb = asb;
        }
    }

    private EposClient() {}

    // ---------------------------------------------------------------- belge

    /** Fiş belgesi; `escpos` boşsa yalnız durum sorusu (yazıcı boş işe de durumla cevap verir). */
    static String document(byte[] escpos) {
        StringBuilder sb = new StringBuilder(escpos.length * 2 + 300);
        sb.append("<?xml version=\"1.0\" encoding=\"utf-8\"?>")
            .append("<s:Envelope xmlns:s=\"http://schemas.xmlsoap.org/soap/envelope/\"><s:Body>")
            .append("<epos-print xmlns=\"").append(NS).append("\">");
        if (escpos.length > 0) sb.append("<command>").append(PrinterClient.hex(escpos)).append("</command>");
        sb.append("</epos-print></s:Body></s:Envelope>");
        return sb.toString();
    }

    /** HTTP/1.1 istek baytları. `printerTimeoutMs`: yazıcının işi tamamlamak için beklediği süre. */
    static byte[] request(String host, int port, String body, int printerTimeoutMs) {
        byte[] payload = body.getBytes(StandardCharsets.UTF_8);
        String hostHeader = port == 80 || port == 443 ? host : host + ":" + port;
        String head = "POST " + PATH + "?devid=" + DEVID + "&timeout=" + printerTimeoutMs + " HTTP/1.1\r\n"
            + "Host: " + hostHeader + "\r\n"
            + "User-Agent: RamosStation\r\n"
            + "Content-Type: text/xml; charset=utf-8\r\n"
            + "SOAPAction: \"\"\r\n"
            + "Content-Length: " + payload.length + "\r\n"
            + "Connection: close\r\n"
            + "\r\n";
        byte[] headBytes = head.getBytes(StandardCharsets.US_ASCII);
        byte[] out = new byte[headBytes.length + payload.length];
        System.arraycopy(headBytes, 0, out, 0, headBytes.length);
        System.arraycopy(payload, 0, out, headBytes.length, payload.length);
        return out;
    }

    // ---------------------------------------------------------------- alışveriş

    /**
     * Bağlı sokette isteği yazar, yanıtı okur ve ayrıştırır. Soketi KAPATMAZ (çağıran kapatır).
     *
     * @param readTimeoutMs yanıt için toplam bekleme (soket okuma zaman aşımı)
     * @throws NoResponseException istek yazıldı, yanıt gelmedi/yarım kaldı
     * @throws IOException yazma hatası ya da anlaşılmayan yanıt
     */
    static Response exchange(Socket s, String host, int port, String body, int printerTimeoutMs, int readTimeoutMs)
        throws IOException {
        byte[] req = request(host, port, body, printerTimeoutMs);
        OutputStream out = s.getOutputStream();
        out.write(req);
        out.flush();
        // Buradan sonra istek yazıcıdadır: okuma hatası "yanıt yok" demektir, "gönderilmedi" değil.
        byte[] raw;
        boolean partial = false;
        try {
            s.setSoTimeout(Math.max(100, readTimeoutMs));
            raw = readResponse(s.getInputStream());
        } catch (PartialResponseException e) {
            // Başlıklar geldi, gövde zaman aşımında kesildi (Content-Length yok ve yazıcı bağlantıyı
            // kapatmadı): eldeki ayrıştırılır; anlaşılmazsa "yanıt yok" sayılır.
            raw = e.raw;
            partial = true;
        } catch (SocketTimeoutException e) {
            throw new NoResponseException("yanıt zaman aşımı");
        } catch (IOException e) {
            throw new NoResponseException("yanıt okunamadı: " + e.getMessage());
        } finally {
            try {
                s.setSoTimeout(0);
            } catch (IOException ignored) {}
        }
        try {
            return parse(raw);
        } catch (IOException e) {
            if (partial) throw new NoResponseException("yanıt yarım kaldı: " + e.getMessage());
            throw e;
        }
    }

    /** Başlıklar okundu ama gövde zaman aşımında yarım kaldı. */
    static final class PartialResponseException extends IOException {
        final byte[] raw;

        PartialResponseException(byte[] raw) {
            super("yanıt yarım");
            this.raw = raw;
        }
    }

    /** Başlıklar + gövde (Content-Length / chunked / bağlantı kapanana dek). */
    static byte[] readResponse(InputStream in) throws IOException {
        ByteArrayOutputStream buf = new ByteArrayOutputStream();
        byte[] chunk = new byte[8192];
        int headerEnd = -1;
        int expected = -1; // gövde uzunluğu (Content-Length); -1 = bilinmiyor
        boolean chunked = false;
        while (true) {
            if (headerEnd >= 0 && !chunked && expected >= 0 && buf.size() >= headerEnd + expected) break;
            if (headerEnd >= 0 && chunked && endsChunked(buf.toByteArray(), headerEnd)) break;
            int n;
            try {
                n = in.read(chunk);
            } catch (SocketTimeoutException e) {
                if (headerEnd >= 0) throw new PartialResponseException(buf.toByteArray());
                throw e;
            }
            if (n < 0) break;
            buf.write(chunk, 0, n);
            if (buf.size() > MAX_RESPONSE) throw new IOException("yanıt çok büyük");
            if (headerEnd < 0) {
                headerEnd = indexOfHeaderEnd(buf.toByteArray());
                if (headerEnd < 0 && buf.size() > MAX_HEADER) throw new IOException("başlık çok büyük");
                if (headerEnd >= 0) {
                    Map<String, String> headers = headers(new String(buf.toByteArray(), 0, headerEnd, StandardCharsets.ISO_8859_1));
                    String len = headers.get("content-length");
                    String te = headers.get("transfer-encoding");
                    chunked = te != null && te.toLowerCase(Locale.ROOT).contains("chunked");
                    if (!chunked && len != null) {
                        try {
                            expected = Integer.parseInt(len.trim());
                        } catch (NumberFormatException e) {
                            expected = -1;
                        }
                    }
                }
            }
        }
        if (headerEnd < 0) throw new SocketTimeoutException("yanıt başlığı gelmedi");
        return buf.toByteArray();
    }

    private static boolean endsChunked(byte[] b, int from) {
        // Son parça "0\r\n\r\n" (isteğe bağlı fragman başlıkları yok sayılır: "0\r\n…\r\n\r\n").
        String tail = new String(b, from, b.length - from, StandardCharsets.ISO_8859_1);
        return tail.contains("\r\n0\r\n") && tail.endsWith("\r\n\r\n") || tail.startsWith("0\r\n") && tail.endsWith("\r\n\r\n");
    }

    private static int indexOfHeaderEnd(byte[] b) {
        for (int i = 0; i + 3 < b.length; i++) {
            if (b[i] == '\r' && b[i + 1] == '\n' && b[i + 2] == '\r' && b[i + 3] == '\n') return i + 4;
        }
        return -1;
    }

    /** Başlık bloğu → küçük harf ad → değer. İlk satır (durum) atlanır. */
    static Map<String, String> headers(String head) {
        Map<String, String> m = new HashMap<>();
        String[] lines = head.split("\r\n");
        for (int i = 1; i < lines.length; i++) {
            int c = lines[i].indexOf(':');
            if (c <= 0) continue;
            m.put(lines[i].substring(0, c).trim().toLowerCase(Locale.ROOT), lines[i].substring(c + 1).trim());
        }
        return m;
    }

    // ---------------------------------------------------------------- ayrıştırma

    private static final Pattern STATUS_LINE = Pattern.compile("^HTTP/1\\.[01] (\\d{3})");
    private static final Pattern RESPONSE_EL = Pattern.compile("<(?:[A-Za-z0-9_]+:)?response\\b([^>]*)>");
    private static final Pattern ATTR = Pattern.compile("([A-Za-z_]+)\\s*=\\s*\"([^\"]*)\"");

    /** Ham HTTP yanıtı → {@link Response}. HTTP 200 dışı → başarısız, kod `http_<durum>`. */
    static Response parse(byte[] raw) throws IOException {
        String text = new String(raw, StandardCharsets.UTF_8);
        Matcher st = STATUS_LINE.matcher(text);
        if (!st.find()) throw new IOException("HTTP yanıtı değil");
        int status = Integer.parseInt(st.group(1));
        int headerEnd = indexOfHeaderEnd(raw);
        String body = headerEnd >= 0 ? new String(raw, headerEnd, raw.length - headerEnd, StandardCharsets.UTF_8) : "";
        if (chunkedHeader(text, headerEnd)) body = dechunk(body);
        Matcher el = RESPONSE_EL.matcher(body);
        if (status != 200) {
            return new Response(status, false, "http_" + status, null);
        }
        if (!el.find()) throw new IOException("ePOS yanıtı yok (ePOS-Print kapalı ya da bu bir Epson değil)");
        Matcher a = ATTR.matcher(el.group(1));
        boolean success = false;
        String code = "";
        Long asb = null;
        while (a.find()) {
            String name = a.group(1);
            String value = a.group(2);
            if (name.equals("success")) success = value.equalsIgnoreCase("true");
            else if (name.equals("code")) code = value;
            else if (name.equals("status")) {
                try {
                    asb = Long.parseLong(value.trim());
                } catch (NumberFormatException e) {
                    asb = null;
                }
            }
        }
        return new Response(status, success, code, asb);
    }

    private static boolean chunkedHeader(String text, int headerEnd) {
        if (headerEnd < 0) return false;
        String te = headers(text.substring(0, Math.min(headerEnd, text.length()))).get("transfer-encoding");
        return te != null && te.toLowerCase(Locale.ROOT).contains("chunked");
    }

    /** Basit chunked çözücü: parça boyutu satırlarını atar, veriyi birleştirir. Bozuksa girdiyi döner. */
    static String dechunk(String body) {
        StringBuilder out = new StringBuilder();
        int pos = 0;
        try {
            while (true) {
                int eol = body.indexOf("\r\n", pos);
                if (eol < 0) return out.length() > 0 ? out.toString() : body;
                String sizeLine = body.substring(pos, eol).trim();
                int semi = sizeLine.indexOf(';');
                if (semi >= 0) sizeLine = sizeLine.substring(0, semi).trim();
                int size = Integer.parseInt(sizeLine, 16);
                if (size == 0) return out.toString();
                int start = eol + 2;
                out.append(body, start, Math.min(start + size, body.length()));
                pos = start + size + 2;
                if (pos > body.length()) return out.toString();
            }
        } catch (RuntimeException e) {
            return body;
        }
    }

    // ---------------------------------------------------------------- durum eşlemesi

    /**
     * ASB (ePOS `status`) → DLE EOT 1/2/4 biçiminde 3 bayt: durum okuyan her yer (PrinterClient.parseStatus,
     * packages/shared status.ts) tek ayrıştırıcıyla çalışmaya devam eder. Sabit bitler (0x12) gerçek
     * DLE EOT cevabındaki gibi. ASB bitleri: 0x08 çevrimdışı, 0x20 kapak açık, 0x400/0x800/0x2000/0x4000
     * mekanik/kesici/kurtarılamaz/otomatik kurtarılan hata, 0x20000 kağıt azaldı, 0x80000 kağıt bitti.
     */
    static byte[] asbToStatus(long asb) {
        boolean offline = (asb & 0x08L) != 0;
        boolean cover = (asb & 0x20L) != 0;
        boolean error = (asb & (0x400L | 0x800L | 0x2000L | 0x4000L)) != 0;
        boolean nearEnd = (asb & 0x20000L) != 0;
        boolean end = (asb & 0x80000L) != 0;
        int s1 = 0x12 | (offline ? 0x08 : 0);
        int s2 = 0x12 | (cover ? 0x04 : 0) | (end ? 0x20 : 0) | (error ? 0x40 : 0);
        int s4 = 0x12 | (nearEnd ? 0x0c : 0) | (end ? 0x60 : 0);
        return new byte[] { (byte) s1, (byte) s2, (byte) s4 };
    }

    /** ePOS hata kodu → RamosPrinter hata kodu ('offline'|'timeout'|'io'|'cover_open'|'paper_end'). */
    static String errorCode(String eposCode) {
        if (eposCode == null) return "io";
        switch (eposCode) {
            case "EPTR_REC_EMPTY":
                return "paper_end";
            case "EPTR_COVER_OPEN":
                return "cover_open";
            case "EX_TIMEOUT":
                return "timeout";
            case "DeviceNotFound":
            case "EX_BADPORT":
            case "PrintSystemError":
            case "EX_SPOOLER":
                return "offline";
            default:
                // EPTR_MECHANICAL, EPTR_CUTTER, EPTR_UNRECOVERABLE, EPTR_AUTOMATICAL, Printing, TooManyRequests,
                // ERROR_DEVICE_BUSY, SchemaError, http_4xx/5xx … → sunucu geri çekilmeyle yeniden dener.
                return "io";
        }
    }
}
