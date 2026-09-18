package com.arxdigital.ramos;

import android.content.Context;
import android.content.SharedPreferences;

/**
 * Arka plan yazıcı istasyonunun kalıcı ayarı ve durumu (özel SharedPreferences "ramos_station").
 *
 * Ayar: feedUrl, token (x-station-token), deviceId, enabled. Durum: eklenti (`getBackgroundStation`),
 * servis ve açılış alıcısı aynı süreçte bellekteki {@link Status}'u paylaşır; her değişiklik ayrıca
 * diske yazılır (süreç ölüp yeniden kalkınca son değerler görünsün). `running` yalnız bellektedir —
 * süreç ölünce kendiliğinden false olur.
 */
final class StationStore {

    static final String PREFS = "ramos_station";

    private static final String K_FEED = "feedUrl";
    private static final String K_TOKEN = "token";
    private static final String K_DEVICE = "deviceId";
    private static final String K_ENABLED = "enabled";
    private static final String K_LAST_PRINTED = "lastPrintedAt";
    private static final String K_PRINTED = "printed";
    private static final String K_LAST_ERROR = "lastError";
    private static final String K_REACHABLE = "reachable";
    private static final String K_LAST_POLL = "lastPollAt";
    private static final String K_MISSING = "missingPrinter";
    private static final String K_ROUTE = "route";
    private static final String K_HOST = "printerHost";
    private static final String K_PORT = "printerPort";

    private StationStore() {}

    // ---------------------------------------------------------------- ayar

    static final class Config {
        final String feedUrl;
        final String token;
        final String deviceId;
        final boolean enabled;

        Config(String feedUrl, String token, String deviceId, boolean enabled) {
            this.feedUrl = feedUrl;
            this.token = token;
            this.deviceId = deviceId;
            this.enabled = enabled;
        }

        boolean isComplete() {
            return feedUrl != null && !feedUrl.isEmpty() && token != null && !token.isEmpty();
        }
    }

    private static SharedPreferences prefs(Context ctx) {
        return ctx.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static Config config(Context ctx) {
        SharedPreferences p = prefs(ctx);
        return new Config(p.getString(K_FEED, null), p.getString(K_TOKEN, null), p.getString(K_DEVICE, null), p.getBoolean(K_ENABLED, false));
    }

    /** Yeni ayar + enabled=true. Önceki durum (sayaçlar, son hata) sıfırlanır. */
    static synchronized void enable(Context ctx, String feedUrl, String token, String deviceId) {
        boolean running = status.running;
        status = new Status();
        status.running = running;
        // commit: servis hemen ardından okur.
        clearStatus(prefs(ctx).edit())
            .putString(K_FEED, feedUrl)
            .putString(K_TOKEN, token)
            .putString(K_DEVICE, deviceId)
            .putBoolean(K_ENABLED, true)
            .commit();
    }

    /**
     * Kapatır: enabled=false ve ayar (adres, jeton, cihaz kimliği) + durum silinir. lastError verilirse
     * (ör. 401 → "unauthorized: …") yalnız o saklanır ki uygulama nedenini gösterebilsin.
     */
    static synchronized void disable(Context ctx, String lastError) {
        boolean running = status.running;
        status = new Status();
        status.running = running;
        status.lastError = lastError;
        SharedPreferences.Editor e = clearStatus(prefs(ctx).edit())
            .remove(K_FEED)
            .remove(K_TOKEN)
            .remove(K_DEVICE)
            .putBoolean(K_ENABLED, false);
        if (lastError != null) e.putString(K_LAST_ERROR, lastError);
        e.commit();
    }

    private static SharedPreferences.Editor clearStatus(SharedPreferences.Editor e) {
        return e
            .remove(K_LAST_PRINTED)
            .remove(K_PRINTED)
            .remove(K_LAST_ERROR)
            .remove(K_REACHABLE)
            .remove(K_LAST_POLL)
            .remove(K_MISSING)
            .remove(K_ROUTE)
            .remove(K_HOST)
            .remove(K_PORT);
    }

    // ---------------------------------------------------------------- durum

    /** Değişmez olmayan ama yalnız {@link #update} içinde (kilitli) değiştirilen durum. */
    static final class Status {
        boolean running;
        Long lastPrintedAt;
        int printed;
        /** Son baskı/yazıcı hatası ("kod: mesaj"); başarılı baskıda silinir (web istasyonuyla aynı). */
        String lastError;
        /** Sunucuya (station-feed) ulaşılamama hatası; ilk başarılı yanıtta silinir. Yalnız bellekte. */
        String feedError;
        Boolean reachable;
        Long lastPollAt;
        boolean missingPrinter;
        String route;
        String printerHost;
        int printerPort = 9100;
        /** Son okunan yazıcı engeli (paper_end / cover_open / offline) ya da null. Yalnız bellekte. */
        String problem;

        Status copy() {
            Status s = new Status();
            s.running = running;
            s.lastPrintedAt = lastPrintedAt;
            s.printed = printed;
            s.lastError = lastError;
            s.feedError = feedError;
            s.reachable = reachable;
            s.lastPollAt = lastPollAt;
            s.missingPrinter = missingPrinter;
            s.route = route;
            s.printerHost = printerHost;
            s.printerPort = printerPort;
            s.problem = problem;
            return s;
        }
    }

    interface Mutation {
        void apply(Status s);
    }

    private static Status status = new Status();
    private static boolean loaded = false;

    /** Bellekteki durumun kopyası (süreç yeni kalktıysa önce diskten yüklenir). */
    static synchronized Status snapshot(Context ctx) {
        ensureLoaded(ctx);
        return status.copy();
    }

    /** Durumu değiştirir ve diske yazar; yeni durumun kopyasını döndürür. */
    static synchronized Status update(Context ctx, Mutation m) {
        ensureLoaded(ctx);
        m.apply(status);
        persist(ctx);
        return status.copy();
    }

    /** Servis başlarken: sayaç sıfırlanır ("başlangıçtan beri basılan"), son değerler korunur. */
    static synchronized void onServiceStart(Context ctx) {
        ensureLoaded(ctx);
        status.running = true;
        status.printed = 0;
        status.feedError = null;
        if (status.lastError != null && status.lastError.startsWith("start_failed")) status.lastError = null;
        persist(ctx);
    }

    private static void ensureLoaded(Context ctx) {
        if (loaded) return;
        loaded = true;
        SharedPreferences p = prefs(ctx);
        Status s = new Status();
        s.lastPrintedAt = p.contains(K_LAST_PRINTED) ? p.getLong(K_LAST_PRINTED, 0) : null;
        s.printed = p.getInt(K_PRINTED, 0);
        s.lastError = p.getString(K_LAST_ERROR, null);
        s.reachable = p.contains(K_REACHABLE) ? p.getBoolean(K_REACHABLE, false) : null;
        s.lastPollAt = p.contains(K_LAST_POLL) ? p.getLong(K_LAST_POLL, 0) : null;
        s.missingPrinter = p.getBoolean(K_MISSING, false);
        s.route = p.getString(K_ROUTE, null);
        s.printerHost = p.getString(K_HOST, null);
        s.printerPort = p.getInt(K_PORT, 9100);
        s.running = status.running;
        status = s;
    }

    private static void persist(Context ctx) {
        Status s = status;
        SharedPreferences.Editor e = prefs(ctx).edit();
        if (s.lastPrintedAt != null) e.putLong(K_LAST_PRINTED, s.lastPrintedAt);
        else e.remove(K_LAST_PRINTED);
        e.putInt(K_PRINTED, s.printed);
        if (s.lastError != null) e.putString(K_LAST_ERROR, s.lastError);
        else e.remove(K_LAST_ERROR);
        if (s.reachable != null) e.putBoolean(K_REACHABLE, s.reachable);
        else e.remove(K_REACHABLE);
        if (s.lastPollAt != null) e.putLong(K_LAST_POLL, s.lastPollAt);
        else e.remove(K_LAST_POLL);
        e.putBoolean(K_MISSING, s.missingPrinter);
        if (s.route != null) e.putString(K_ROUTE, s.route);
        else e.remove(K_ROUTE);
        if (s.printerHost != null) e.putString(K_HOST, s.printerHost);
        else e.remove(K_HOST);
        e.putInt(K_PORT, s.printerPort);
        e.apply();
    }
}
