package com.arxdigital.ramos;

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import androidx.core.app.NotificationManagerCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONObject;

/**
 * RamosPrinter — tablet yazıcı istasyonunun ağ yazıcısına ham ESC/POS baskısı + arka plan istasyonu.
 *
 * JS sözleşmesi (apps/web yerel köprüsü buna göre yazıldı — değiştirme):
 *   send({ host, port, data: base64, timeoutMs = 8000, checkStatus = true })
 *     → { ok, status?: hex, error?: 'offline'|'timeout'|'io'|'cover_open'|'paper_end', message? }
 *   status({ host, port, timeoutMs? }) → { reachable, status?: hex, message? }
 *
 * Arka plan istasyonu (v2.1 — WebView kapalıyken de basan ön plan servisi, {@link StationService}):
 *   startBackgroundStation({ feedUrl, token, deviceId })
 *     → { ok: true, notificationsGranted } | { ok: false, error: 'invalid_args'|'start_failed', message? }
 *   stopBackgroundStation() → { ok: true }
 *   getBackgroundStation() → { enabled, running, deviceId, lastPrintedAt, printed, lastError, reachable,
 *     lastPollAt, missingPrinter, route, notificationsGranted, ignoringBatteryOptimizations }
 *   openBatteryOptimizationSettings() → { ok: true } | { ok: false, error: 'unavailable', message? }
 *
 * Metotlar ASLA reject etmez; her hata ok:false / reachable:false olarak döner. Ağ işleri arka plan
 * thread'lerinde çalışır (WebView/ana thread asla bloklanmaz). Baskı/durum mantığı {@link PrinterClient}.
 */
@CapacitorPlugin(
    name = "RamosPrinter",
    permissions = { @Permission(alias = RamosPrinterPlugin.NOTIFICATIONS, strings = { Manifest.permission.POST_NOTIFICATIONS }) }
)
public class RamosPrinterPlugin extends Plugin {

    static final String NOTIFICATIONS = "notifications";

    private final ExecutorService io = Executors.newCachedThreadPool();

    /**
     * Uygulama açılırken: istasyon açık bırakılmış ama servis çalışmıyorsa (ör. "Zorla durdur" sonrası ya
     * da Android arka plandan yeniden başlatmaya izin vermediyse) şimdi başlat — uygulama ön planda.
     */
    @Override
    public void load() {
        try {
            StationStore.Config cfg = StationStore.config(getContext());
            if (cfg.enabled && cfg.isComplete() && !StationService.isRunning()) StationService.start(getContext());
        } catch (Exception ignored) {
            // başlatılamadı: web tarafı getBackgroundStation ile running=false görür
        }
    }

    @Override
    protected void handleOnDestroy() {
        io.shutdownNow();
    }

    // ---------------------------------------------------------------- baskı

    @PluginMethod
    public void send(final PluginCall call) {
        final String host = call.getString("host", "");
        final Integer port = call.getInt("port");
        final String data = call.getString("data");
        final int timeoutMs = positive(call.getInt("timeoutMs"), PrinterClient.DEFAULT_TIMEOUT_MS);
        final boolean checkStatus = call.getBoolean("checkStatus", true);
        io.execute(() -> {
            JSObject r;
            try {
                PrinterClient.SendResult res;
                PrinterClient.LOCK.lock();
                try {
                    res = PrinterClient.sendBase64(host, port, data, timeoutMs, checkStatus);
                } finally {
                    PrinterClient.LOCK.unlock();
                }
                r = toJs(res);
            } catch (Throwable t) {
                r = new JSObject();
                r.put("ok", false);
                r.put("error", "io");
                r.put("message", String.valueOf(t.getMessage()));
            }
            call.resolve(r);
        });
    }

    @PluginMethod
    public void status(final PluginCall call) {
        final String host = call.getString("host", "");
        final Integer port = call.getInt("port");
        final int timeoutMs = positive(call.getInt("timeoutMs"), PrinterClient.CONNECT_MS + PrinterClient.REPLY_MS);
        io.execute(() -> {
            JSObject r = new JSObject();
            try {
                PrinterClient.StatusResult res;
                PrinterClient.LOCK.lock();
                try {
                    res = PrinterClient.status(host, port, timeoutMs);
                } finally {
                    PrinterClient.LOCK.unlock();
                }
                r.put("reachable", res.reachable);
                if (res.status != null) r.put("status", res.status);
                if (res.message != null) r.put("message", res.message);
            } catch (Throwable t) {
                r = new JSObject();
                r.put("reachable", false);
                r.put("message", String.valueOf(t.getMessage()));
            }
            call.resolve(r);
        });
    }

    // ---------------------------------------------------------------- arka plan istasyonu

    @PluginMethod
    public void startBackgroundStation(final PluginCall call) {
        final String feedUrl = trimOrNull(call.getString("feedUrl"));
        final String token = trimOrNull(call.getString("token"));
        final String deviceId = trimOrNull(call.getString("deviceId"));
        if (feedUrl == null || !FeedClient.isAllowedUrl(feedUrl)) {
            call.resolve(fail("invalid_args", "feedUrl https adresi olmalı"));
            return;
        }
        if (token == null) {
            call.resolve(fail("invalid_args", "token eksik"));
            return;
        }
        if (deviceId == null) {
            call.resolve(fail("invalid_args", "deviceId eksik"));
            return;
        }
        StationStore.enable(getContext(), feedUrl, token, deviceId);
        // Önce servis: izin penceresi sırasında Activity kapanırsa da istasyon çalışır.
        try {
            StationService.start(getContext());
        } catch (Exception e) {
            // Ayar kalır (enabled): uygulama açılınca / açılışta yeniden denenir.
            call.resolve(fail("start_failed", String.valueOf(e.getMessage())));
            return;
        }
        // Android 13+: bildirim izni yoksa iste. Cevap ne olursa olsun servis çalışır — izinsiz ön plan
        // servisi de çalışır, yalnız bildirimi görünmez (getBackgroundStation.notificationsGranted).
        if (Build.VERSION.SDK_INT >= 33 && getPermissionState(NOTIFICATIONS) != PermissionState.GRANTED) {
            requestPermissionForAlias(NOTIFICATIONS, call, "afterNotificationPermission");
            return;
        }
        resolveStarted(call);
    }

    @PermissionCallback
    private void afterNotificationPermission(PluginCall call) {
        if (notificationsGranted()) {
            // İzin yeni verildi: izinsiz gönderilmiş ön plan bildirimi görünmez kalır → yeniden gönder.
            try {
                StationService.start(getContext());
            } catch (Exception ignored) {
                // servis zaten çalışıyor; bildirim bir sonraki durum değişiminde görünür
            }
        }
        resolveStarted(call);
    }

    private void resolveStarted(PluginCall call) {
        JSObject r = new JSObject();
        r.put("ok", true);
        r.put("notificationsGranted", notificationsGranted());
        call.resolve(r);
    }

    @PluginMethod
    public void stopBackgroundStation(final PluginCall call) {
        Context ctx = getContext();
        StationStore.disable(ctx, null);
        try {
            ctx.stopService(new Intent(ctx, StationService.class));
        } catch (Exception ignored) {
            // servis zaten yok
        }
        JSObject r = new JSObject();
        r.put("ok", true);
        call.resolve(r);
    }

    @PluginMethod
    public void getBackgroundStation(final PluginCall call) {
        Context ctx = getContext();
        StationStore.Config cfg = StationStore.config(ctx);
        StationStore.Status s = StationStore.snapshot(ctx);
        boolean running = StationService.isRunning();
        JSObject r = new JSObject();
        r.put("enabled", cfg.enabled);
        r.put("running", running);
        r.put("deviceId", cfg.deviceId != null ? cfg.deviceId : JSONObject.NULL);
        r.put("lastPrintedAt", s.lastPrintedAt != null ? (Object) s.lastPrintedAt : JSONObject.NULL);
        r.put("printed", s.printed);
        String err = running && s.feedError != null ? s.feedError : s.lastError;
        r.put("lastError", err != null ? err : JSONObject.NULL);
        r.put("reachable", s.reachable != null ? (Object) s.reachable : JSONObject.NULL);
        r.put("lastPollAt", s.lastPollAt != null ? (Object) s.lastPollAt : JSONObject.NULL);
        r.put("missingPrinter", s.missingPrinter);
        r.put("route", s.route != null ? s.route : JSONObject.NULL);
        r.put("notificationsGranted", notificationsGranted());
        r.put("ignoringBatteryOptimizations", ignoringBatteryOptimizations());
        call.resolve(r);
    }

    @PluginMethod
    public void openBatteryOptimizationSettings(final PluginCall call) {
        Activity activity = getActivity();
        Context ctx = activity != null ? activity : getContext();
        String pkg = ctx.getPackageName();
        // Muafiyet zaten varsa istek penceresi hiçbir şey göstermez → doğrudan liste ekranı.
        Intent request = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + pkg));
        Intent list = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
        Intent[] tries = ignoringBatteryOptimizations() ? new Intent[] { list } : new Intent[] { request, list };
        String lastMessage = null;
        for (Intent i : tries) {
            try {
                if (activity == null) i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                ctx.startActivity(i);
                JSObject r = new JSObject();
                r.put("ok", true);
                call.resolve(r);
                return;
            } catch (Exception e) {
                lastMessage = String.valueOf(e.getMessage());
            }
        }
        call.resolve(fail("unavailable", lastMessage));
    }

    // ---------------------------------------------------------------- yardımcılar

    private boolean notificationsGranted() {
        try {
            return NotificationManagerCompat.from(getContext()).areNotificationsEnabled();
        } catch (Exception e) {
            return false;
        }
    }

    private boolean ignoringBatteryOptimizations() {
        try {
            PowerManager pm = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
            return pm != null && pm.isIgnoringBatteryOptimizations(getContext().getPackageName());
        } catch (Exception e) {
            return false;
        }
    }

    /** v2.0 ile aynı alanlar ve sıra: ok, error?, message?, status?. */
    private static JSObject toJs(PrinterClient.SendResult res) {
        JSObject r = res.ok ? new JSObject() : fail(res.error, res.message);
        if (res.ok) r.put("ok", true);
        if (res.status != null) r.put("status", res.status);
        return r;
    }

    private static JSObject fail(String code, String message) {
        JSObject r = new JSObject();
        r.put("ok", false);
        r.put("error", code);
        if (message != null) r.put("message", message);
        return r;
    }

    private static String trimOrNull(String s) {
        if (s == null) return null;
        s = s.trim();
        return s.isEmpty() ? null : s;
    }

    private static int positive(Integer v, int def) {
        return v == null || v <= 0 ? def : v;
    }
}
