package com.arxdigital.ramos;

import android.util.Base64;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.net.SocketTimeoutException;
import java.security.SecureRandom;
import java.security.cert.X509Certificate;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.locks.ReentrantLock;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import javax.net.ssl.HttpsURLConnection;
import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLSocket;
import javax.net.ssl.SSLSocketFactory;
import javax.net.ssl.TrustManager;
import javax.net.ssl.X509TrustManager;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Ağ yazıcısına ham ESC/POS baskısı ve DLE EOT durum okuma — RamosPrinterPlugin (WebView köprüsü) ile
 * StationService (arka plan istasyonu) ortak kullanır. Android'e (Context/WebView) bağımlı değildir;
 * her çağrı bloklar, çağıran kendi arka plan thread'inden çağırmalıdır.
 *
 * Davranış apps/print-agent/src/transport.ts `printWithChecks` ile aynıdır: tek bağlantı üzerinde
 * durum (DLE EOT 1/2/4) → engel varsa göndermeden hata → yaz → durum. Port 9143 ise TLS (Epson Secure
 * Printing), başka her port düz TCP. Durum bitleri packages/shared status.ts `parseStatus` /
 * `blockingProblem` ile aynı; bilinmeyen/cevapsız durum baskıyı ENGELLEMEZ.
 *
 * Yazıcı aynı anda tek oturum kabul eder (R69): baskı ve durum yoklaması {@link #LOCK} ile sırayla
 * yapılır — eklenti ve servis aynı süreçte, aynı kilidi paylaşır.
 */
final class PrinterClient {

    static final int EPSON_TLS_PORT = 9143;
    static final int DEFAULT_TIMEOUT_MS = 8000;
    /** transport.ts: TCP (+TLS el sıkışması) bağlantı zaman aşımı 3 sn. */
    static final int CONNECT_MS = 3000;
    /** DLE EOT cevabı için bekleme (3 bayt gelince erken biter). */
    static final int REPLY_MS = 800;

    /**
     * Yazıcı kilidi: aynı anda tek bağlantı (baskı ya da durum). Adil kilit — sırayla girer. Her işlem
     * kendi zaman aşımıyla sınırlı olduğundan bekleme de sınırlıdır (baskı ≤ timeoutMs + bağlantı).
     */
    static final ReentrantLock LOCK = new ReentrantLock(true);

    // DLE EOT n, n = 1 (yazıcı durumu), 2 (çevrimdışı durumu), 4 (kağıt sensörü).
    private static final byte[] STATUS_QUERY = { 0x10, 0x04, 0x01, 0x10, 0x04, 0x02, 0x10, 0x04, 0x04 };

    private static final Pattern BASE64 = Pattern.compile("^[A-Za-z0-9+/=\\s]*$");

    /** Baskı zaman aşımı bekçisi (süreç boyunca tek, daemon thread). */
    private static final ScheduledExecutorService WATCHDOG = Executors.newSingleThreadScheduledExecutor(r -> {
        Thread t = new Thread(r, "ramos-printer-watchdog");
        t.setDaemon(true);
        return t;
    });

    private PrinterClient() {}

    // ---------------------------------------------------------------- sonuçlar

    /** send sonucu: { ok, status?: hex, error?: 'offline'|'timeout'|'io'|'cover_open'|'paper_end', message? } */
    static final class SendResult {
        final boolean ok;
        final String status;
        final String error;
        final String message;
        /** Yazıcıya hiç bağlanılmadan reddedildi (geçersiz host/port/base64) — yazıcı sorunu değil. */
        final boolean invalidInput;

        private SendResult(boolean ok, String status, String error, String message, boolean invalidInput) {
            this.ok = ok;
            this.status = status;
            this.error = error;
            this.message = message;
            this.invalidInput = invalidInput;
        }

        static SendResult success(String status) {
            return new SendResult(true, status, null, null, false);
        }

        static SendResult fail(String code, String message) {
            return new SendResult(false, null, code, message, false);
        }

        static SendResult fail(String code, String message, String status) {
            return new SendResult(false, status, code, message, false);
        }

        static SendResult invalid(String message) {
            return new SendResult(false, null, "io", message, true);
        }
    }

    /** status sonucu: { reachable, status?: hex, message? } */
    static final class StatusResult {
        final boolean reachable;
        final String status;
        final String message;

        StatusResult(boolean reachable, String status, String message) {
            this.reachable = reachable;
            this.status = status;
            this.message = message;
        }
    }

    static final class PrinterException extends Exception {
        final String code;

        PrinterException(String code, String msg) {
            super(msg);
            this.code = code;
        }
    }

    // ---------------------------------------------------------------- baskı

    /**
     * Doğrulama + baskı. data base64 ESC/POS baytlarıdır. Asla fırlatmaz. Kilidi ALMAZ (çağıran alır).
     */
    static SendResult sendBase64(String host, Integer port, String data, int timeoutMs, boolean checkStatus) {
        try {
            if (host == null || host.trim().isEmpty() || port == null || port < 1 || port > 65535) {
                return SendResult.invalid("geçersiz host/port");
            }
            if (data == null) return SendResult.invalid("data (base64) eksik");
            // android.util.Base64 geçersiz karakterleri sessizce atlayabilir → önce alfabe kontrolü.
            byte[] bytes = null;
            if (BASE64.matcher(data).matches()) {
                try {
                    bytes = Base64.decode(data, Base64.DEFAULT);
                } catch (IllegalArgumentException e) {
                    bytes = null;
                }
            }
            if (bytes == null) return SendResult.invalid("data geçerli base64 değil");
            if (bytes.length == 0) return SendResult.invalid("data boş");
            return send(host.trim(), port, bytes, timeoutMs, checkStatus);
        } catch (Throwable t) {
            return SendResult.fail("io", String.valueOf(t.getMessage()));
        }
    }

    static SendResult send(String host, int port, byte[] bytes, int timeoutMs, boolean checkStatus) {
        final AtomicBoolean timedOut = new AtomicBoolean(false);
        Socket s;
        try {
            s = connect(host, port, Math.min(CONNECT_MS, timeoutMs));
        } catch (PrinterException e) {
            return SendResult.fail(e.code, e.getMessage());
        }
        // Tüm işlem timeoutMs ile sınırlı: süre dolunca soket kapatılır, askıdaki yazma/okuma hata verir
        // ve 'timeout' olarak raporlanır (transport.ts sendAndAwait'in boşta kalma zaman aşımı karşılığı —
        // bağlantıyı kabul edip hiç okumayan yazıcı istasyonu sonsuza dek kilitleyemez).
        final Socket sock = s;
        ScheduledFuture<?> dog = WATCHDOG.schedule(() -> {
            timedOut.set(true);
            closeQuietly(sock);
        }, timeoutMs, TimeUnit.MILLISECONDS);
        try {
            byte[] before = new byte[0];
            if (checkStatus) {
                before = readStatus(s, REPLY_MS);
                String problem = blockingProblem(before);
                if (problem != null) {
                    return SendResult.fail(problem, "yazıcı durumu: " + problem, before.length >= 3 ? hex(before) : null);
                }
            }
            try {
                OutputStream out = s.getOutputStream();
                out.write(bytes);
                out.flush();
            } catch (IOException e) {
                if (timedOut.get()) return SendResult.fail("timeout", "send timed out (yazıcıdan hiç yanıt/aktivite yok)");
                return SendResult.fail("io", e.getMessage());
            }
            if (timedOut.get()) return SendResult.fail("timeout", "send timed out (yazıcıdan hiç yanıt/aktivite yok)");
            // Yazma bitti: bundan sonraki hiçbir sorun gönderilmiş işi başarısız yapmaz.
            dog.cancel(false);
            byte[] after = new byte[0];
            if (checkStatus) {
                try {
                    after = readStatus(s, REPLY_MS);
                } catch (Throwable ignored) {
                    // "Yazıldı ≠ basıldı" ama gönderim sonrası okunamayan durum işi düşürmez (transport.ts).
                }
            }
            if (after.length >= 3) return SendResult.success(hex(after));
            if (before.length >= 3) return SendResult.success(hex(before));
            return SendResult.success(null);
        } finally {
            dog.cancel(false);
            closeQuietly(s);
        }
    }

    // ---------------------------------------------------------------- durum yoklaması

    /** Bağlan → DLE EOT → kapat. Asla fırlatmaz. Kilidi ALMAZ (çağıran alır). */
    static StatusResult status(String host, Integer port, int timeoutMs) {
        if (host == null || host.trim().isEmpty() || port == null || port < 1 || port > 65535) {
            return new StatusResult(false, null, "geçersiz host/port");
        }
        Socket s = null;
        try {
            s = connect(host.trim(), port, Math.min(CONNECT_MS, timeoutMs));
            byte[] reply = readStatus(s, Math.max(100, Math.min(REPLY_MS, timeoutMs)));
            return new StatusResult(
                true,
                reply.length > 0 ? hex(reply) : null,
                reply.length < 3 ? "durum bilinmiyor (yazıcı DLE EOT cevabı vermedi)" : null
            );
        } catch (PrinterException e) {
            return new StatusResult(false, null, e.getMessage());
        } catch (Throwable t) {
            return new StatusResult(false, null, String.valueOf(t.getMessage()));
        } finally {
            closeQuietly(s);
        }
    }

    // ---------------------------------------------------------------- bağlantı

    private static Socket connect(String host, int port, int connectMs) throws PrinterException {
        long start = System.currentTimeMillis();
        Socket plain = new Socket();
        try {
            plain.setTcpNoDelay(true);
            plain.connect(new InetSocketAddress(host, port), connectMs);
        } catch (SocketTimeoutException e) {
            closeQuietly(plain);
            throw new PrinterException("offline", "connect timeout");
        } catch (IOException | IllegalArgumentException | SecurityException e) {
            closeQuietly(plain);
            throw new PrinterException("offline", String.valueOf(e.getMessage()));
        }
        if (port != EPSON_TLS_PORT) return plain;

        // TLS: zaman aşımı TCP bağlantısı + el sıkışmanın TAMAMINI kapsar (transport.ts connectTls).
        try {
            int left = (int) Math.max(1, connectMs - (System.currentTimeMillis() - start));
            boolean local = isLocalPrinterHost(host);
            SSLSocketFactory factory = local ? trustAllFactory() : (SSLSocketFactory) SSLSocketFactory.getDefault();
            SSLSocket tls = (SSLSocket) factory.createSocket(plain, host, port, true);
            tls.setEnabledProtocols(modernProtocols(tls.getSupportedProtocols()));
            tls.setSoTimeout(left);
            tls.startHandshake();
            if (!local && !HttpsURLConnection.getDefaultHostnameVerifier().verify(host, tls.getSession())) {
                closeQuietly(tls);
                throw new PrinterException("offline", "tls: sertifika adı " + host + " ile eşleşmiyor");
            }
            tls.setSoTimeout(0);
            return tls;
        } catch (PrinterException e) {
            closeQuietly(plain);
            throw e;
        } catch (SocketTimeoutException e) {
            closeQuietly(plain);
            throw new PrinterException("offline", "tls: connect timeout");
        } catch (Exception e) {
            closeQuietly(plain);
            throw new PrinterException("offline", "tls: " + e.getMessage());
        }
    }

    /** TLS 1.2 altı kabul edilmez. */
    private static String[] modernProtocols(String[] supported) {
        List<String> out = new ArrayList<>();
        for (String p : supported) if (p.equals("TLSv1.2") || p.equals("TLSv1.3")) out.add(p);
        return out.toArray(new String[0]);
    }

    private static final Pattern IPV4 = Pattern.compile("^(\\d{1,3})\\.(\\d{1,3})\\.(\\d{1,3})\\.(\\d{1,3})$");

    /**
     * Yazıcının kendinden imzalı sertifikası (CA zinciri yok, adı IP) YALNIZ yerel ağ adreslerinde kabul
     * edilir: 10/8, 172.16/12, 192.168/16, 169.254/16, localhost (emülatörün 10.0.2.2'si 10/8 içinde).
     * DNS adı ya da genel IP için normal sertifika + ad doğrulaması yapılır. Adres metin olarak
     * değerlendirilir (DNS çözümlemesi yok) — bir alan adı özel IP'ye çözülse bile güven gevşemez.
     */
    static boolean isLocalPrinterHost(String host) {
        String h = host.toLowerCase(Locale.ROOT);
        if (h.equals("localhost") || h.equals("10.0.2.2")) return true;
        Matcher m = IPV4.matcher(h);
        if (!m.matches()) return false;
        int[] o = new int[4];
        for (int i = 0; i < 4; i++) {
            o[i] = Integer.parseInt(m.group(i + 1));
            if (o[i] > 255) return false;
        }
        return o[0] == 10
            || (o[0] == 172 && o[1] >= 16 && o[1] <= 31)
            || (o[0] == 192 && o[1] == 168)
            || (o[0] == 169 && o[1] == 254);
    }

    private static SSLSocketFactory trustAllFactory() throws Exception {
        TrustManager[] trustAll = new TrustManager[] {
            new X509TrustManager() {
                @Override
                public void checkClientTrusted(X509Certificate[] chain, String authType) {}

                // Bilinçli: yalnız isLocalPrinterHost() adreslerinde kullanılır (transport.ts
                // rejectUnauthorized:false gerekçesi — yazıcı kendi sertifikasını üretir).
                @Override
                public void checkServerTrusted(X509Certificate[] chain, String authType) {}

                @Override
                public X509Certificate[] getAcceptedIssuers() {
                    return new X509Certificate[0];
                }
            },
        };
        SSLContext ctx = SSLContext.getInstance("TLS");
        ctx.init(null, trustAll, new SecureRandom());
        return ctx.getSocketFactory();
    }

    // ---------------------------------------------------------------- durum (DLE EOT)

    /**
     * DLE EOT 1/2/4 gönderir, replyMs içinde gelen baytları döndürür (3 bayt gelince erken). Asla hata
     * fırlatmaz: kısa/eksik/bozuk cevap ya da bağlantı hatası yalnız "daha az bayt" demektir → bilinmiyor.
     */
    private static byte[] readStatus(Socket s, int replyMs) {
        ByteArrayOutputStream got = new ByteArrayOutputStream();
        try {
            OutputStream out = s.getOutputStream();
            out.write(STATUS_QUERY);
            out.flush();
            InputStream in = s.getInputStream();
            long deadline = System.currentTimeMillis() + replyMs;
            byte[] buf = new byte[64];
            while (got.size() < 3) {
                long left = deadline - System.currentTimeMillis();
                if (left <= 0) break;
                s.setSoTimeout((int) left);
                int n;
                try {
                    n = in.read(buf);
                } catch (SocketTimeoutException e) {
                    break;
                }
                if (n < 0) break;
                got.write(buf, 0, n);
            }
        } catch (Throwable ignored) {
            // bilinmiyor
        } finally {
            try {
                s.setSoTimeout(0);
            } catch (Throwable ignored) {}
        }
        return got.toByteArray();
    }

    /**
     * packages/shared/src/status.ts ile birebir: bayt < 3 → bilinmiyor → engel yok.
     * Öncelik: paper_end > cover_open > offline.
     */
    static String blockingProblem(byte[] b) {
        if (b.length < 3) return null;
        int s1 = b[0] & 0xff, s2 = b[1] & 0xff, s4 = b[2] & 0xff;
        boolean offline = (s1 & 0x08) != 0;
        boolean coverOpen = (s2 & 0x04) != 0;
        boolean paperEnd = (s2 & 0x20) != 0 || (s4 & 0x60) != 0;
        if (paperEnd) return "paper_end";
        if (coverOpen) return "cover_open";
        if (offline) return "offline";
        return null;
    }

    /** packages/shared/src/status.ts `parseStatus` karşılığı (sunucuya heartbeat `state` olarak gider). */
    static JSONObject parseStatus(byte[] b) throws JSONException {
        JSONObject o = new JSONObject();
        boolean known = b.length >= 3;
        int s1 = known ? b[0] & 0xff : 0, s2 = known ? b[1] & 0xff : 0, s4 = known ? b[2] & 0xff : 0;
        o.put("known", known);
        o.put("offline", known && (s1 & 0x08) != 0);
        o.put("cover_open", known && (s2 & 0x04) != 0);
        o.put("paper_end", known && ((s2 & 0x20) != 0 || (s4 & 0x60) != 0));
        o.put("paper_near_end", known && (s4 & 0x0c) != 0);
        o.put("error", known && (s2 & 0x40) != 0);
        o.put("raw", hex(b));
        return o;
    }

    // ---------------------------------------------------------------- yardımcılar

    static String hex(byte[] b) {
        StringBuilder sb = new StringBuilder(b.length * 2);
        for (byte x : b) sb.append(String.format(Locale.ROOT, "%02x", x & 0xff));
        return sb.toString();
    }

    /** Onaltılık metin → bayt; geçersizse boş dizi. */
    static byte[] unhex(String h) {
        if (h == null || (h.length() % 2) != 0) return new byte[0];
        byte[] out = new byte[h.length() / 2];
        try {
            for (int i = 0; i < out.length; i++) out[i] = (byte) Integer.parseInt(h.substring(i * 2, i * 2 + 2), 16);
        } catch (NumberFormatException e) {
            return new byte[0];
        }
        return out;
    }

    static void closeQuietly(Socket s) {
        if (s == null) return;
        try {
            s.close();
        } catch (Throwable ignored) {}
    }
}
