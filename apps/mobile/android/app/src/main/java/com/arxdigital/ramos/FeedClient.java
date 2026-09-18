package com.arxdigital.ramos;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.MalformedURLException;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * station-feed Edge Function istemcisi (arka plan istasyonu). Her istek POST + JSON + `x-station-token`.
 *
 *   next      {action:'next', waitMs}                 → {job:{id,data}|null, printer:{host|null,port}, route}
 *   complete  {action:'complete', jobId, ok, error}   → {result:'ok'|…}
 *   heartbeat {action:'heartbeat', version, reachable, state, error} → {result:'ok'}
 *
 * 401 → {@link UnauthorizedException} (jeton silinmiş/iptal: istasyon kalıcı durur). Diğer HTTP hataları
 * {@link HttpStatusException}; ağ hataları IOException. Jeton asla loglanmaz.
 */
final class FeedClient {

    static final int CONNECT_TIMEOUT_MS = 10_000;
    /** Yanıt gövdesi üst sınırı (fiş base64'ü birkaç yüz KB'ı geçmez). */
    private static final int MAX_BODY = 8 * 1024 * 1024;

    static final class UnauthorizedException extends IOException {
        UnauthorizedException() {
            super("unauthorized");
        }
    }

    static final class HttpStatusException extends IOException {
        final int code;

        HttpStatusException(int code, String body) {
            super("http " + code + (body == null || body.isEmpty() ? "" : ": " + body));
            this.code = code;
        }
    }

    /** Uzun yoklamayı başka thread'den kesebilmek için etkin bağlantıyı bildirir. */
    interface ConnectionSink {
        void set(HttpURLConnection c);
    }

    static final class NextResult {
        /** İş kimliği ve base64 ESC/POS verisi; iş yoksa jobId null. */
        String jobId;
        String data;
        boolean hasJob;
        String printerHost;
        int printerPort = 9100;
        String route;
    }

    private final URL url;
    private final String token;
    private final String userAgent;

    FeedClient(String feedUrl, String token, String version) throws MalformedURLException {
        this.url = new URL(feedUrl);
        this.token = token;
        this.userAgent = "RamosStation/" + version + " (Android)";
    }

    /**
     * Yalnız https. Tek istisna DEBUG derlemesi: emülatörden bilgisayardaki sahte sunucuya (10.0.2.2)
     * düz HTTP — release'te BuildConfig.DEBUG sabit false; ayrıca yalnız debug derlemesinin ağ güvenlik
     * yapılandırması (src/debug) 10.0.2.2'ye düz HTTP'ye izin verir.
     */
    static boolean isAllowedUrl(String feedUrl) {
        if (feedUrl == null) return false;
        try {
            URL u = new URL(feedUrl.trim());
            String host = u.getHost();
            if (host == null || host.isEmpty()) return false;
            String proto = u.getProtocol().toLowerCase(Locale.ROOT);
            if (proto.equals("https")) return true;
            return BuildConfig.DEBUG && proto.equals("http") && host.equals("10.0.2.2");
        } catch (MalformedURLException e) {
            return false;
        }
    }

    NextResult next(int waitMs, ConnectionSink sink) throws IOException, JSONException {
        JSONObject body = new JSONObject();
        body.put("action", "next");
        body.put("waitMs", waitMs);
        JSONObject r = post(body, waitMs + 10_000, sink);
        NextResult n = new NextResult();
        JSONObject job = r.optJSONObject("job");
        if (job != null) {
            n.hasJob = true;
            n.jobId = job.isNull("id") ? null : job.optString("id", null);
            n.data = job.isNull("data") ? null : job.optString("data", null);
        }
        JSONObject printer = r.optJSONObject("printer");
        if (printer != null) {
            String host = printer.isNull("host") ? null : printer.optString("host", null);
            n.printerHost = host == null || host.trim().isEmpty() ? null : host.trim();
            int port = printer.optInt("port", 9100);
            n.printerPort = port >= 1 && port <= 65535 ? port : 9100;
        }
        n.route = r.isNull("route") ? null : r.optString("route", null);
        return n;
    }

    /** Sunucu `result` alanı ("ok" ya da iş artık bizim değilse başka bir değer). */
    String complete(String jobId, boolean ok, String error) throws IOException, JSONException {
        JSONObject body = new JSONObject();
        body.put("action", "complete");
        body.put("jobId", jobId);
        body.put("ok", ok);
        body.put("error", error == null ? JSONObject.NULL : error);
        JSONObject r = post(body, 15_000, null);
        return r.optString("result", "");
    }

    void heartbeat(String version, boolean reachable, JSONObject state, String error) throws IOException, JSONException {
        JSONObject body = new JSONObject();
        body.put("action", "heartbeat");
        body.put("version", version);
        body.put("reachable", reachable);
        body.put("state", state == null ? JSONObject.NULL : state);
        body.put("error", error == null ? JSONObject.NULL : error);
        post(body, 15_000, null);
    }

    private JSONObject post(JSONObject body, int readTimeoutMs, ConnectionSink sink) throws IOException, JSONException {
        HttpURLConnection c = (HttpURLConnection) url.openConnection();
        if (sink != null) sink.set(c);
        try {
            c.setRequestMethod("POST");
            c.setConnectTimeout(CONNECT_TIMEOUT_MS);
            c.setReadTimeout(readTimeoutMs);
            c.setUseCaches(false);
            c.setInstanceFollowRedirects(false);
            c.setDoOutput(true);
            c.setRequestProperty("Content-Type", "application/json");
            c.setRequestProperty("Accept", "application/json");
            c.setRequestProperty("User-Agent", userAgent);
            c.setRequestProperty("x-station-token", token);
            byte[] payload = body.toString().getBytes(StandardCharsets.UTF_8);
            c.setFixedLengthStreamingMode(payload.length);
            try (OutputStream out = c.getOutputStream()) {
                out.write(payload);
            }
            int code = c.getResponseCode();
            if (code == 401) throw new UnauthorizedException();
            if (code != 200) {
                throw new HttpStatusException(code, clip(readBody(c.getErrorStream())));
            }
            String text = readBody(c.getInputStream());
            return new JSONObject(text);
        } finally {
            if (sink != null) sink.set(null);
            c.disconnect();
        }
    }

    private static String readBody(InputStream in) throws IOException {
        if (in == null) return "";
        try (InputStream is = in) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[16 * 1024];
            int n;
            while ((n = is.read(buf)) >= 0) {
                out.write(buf, 0, n);
                if (out.size() > MAX_BODY) throw new IOException("yanıt çok büyük");
            }
            return new String(out.toByteArray(), StandardCharsets.UTF_8);
        }
    }

    private static String clip(String s) {
        if (s == null) return "";
        s = s.trim();
        return s.length() > 200 ? s.substring(0, 200) : s;
    }
}
