package com.arxdigital.ramos;

import android.app.Notification;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.os.SystemClock;
import android.util.Log;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import java.net.HttpURLConnection;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import org.json.JSONObject;

/**
 * Arka plan yazıcı istasyonu — WebView'dan BAĞIMSIZ ön plan servisi. Uygulama arka plandayken, ekran
 * kapalıyken, son uygulamalardan kaydırılıp kapatıldığında ve (BootReceiver ile) açılıştan sonra fiş basar.
 *
 * Döngü (tek işçi thread): station-feed `next` uzun yoklama (sunucu ≤ 20 sn tutar) → iş varsa
 * PrinterClient ile yazıcıya (durum → engel varsa gönderme → yaz → durum) → `complete` → hemen yeniden
 * sor. Ağ/5xx hatasında üstel geri çekilme 2 sn → 60 sn (başarıda sıfırlanır; ağ geri gelince hemen
 * dener). Ayrı thread 30 sn'de bir yazıcıyı yoklar ve `heartbeat` yazar. 401 → istasyon kalıcı kapanır.
 *
 * Kurallar web istasyonuyla (apps/web/src/features/station/stationRunner.ts) aynı:
 * - Bayt gittiyse tek izinli sonraki çağrı complete(ok=true)'dur ve iş bizim olduğu sürece yeniden
 *   denenir (çift fiş olmasın — R68).
 * - Yazıcı hatasında iş başarısız kapatılır (sunucu yeniden dener) ve kısa bir ara verilir.
 * - Yazıcıya aynı anda tek bağlantı (PrinterClient.LOCK — R69).
 *
 * Çalışırken PARTIAL_WAKE_LOCK + WifiLock tutulur; kalıcı düşük öncelikli bildirim ("Durdur" eylemli).
 */
public class StationService extends Service {

    static final String TAG = "RamosStation";
    static final String ACTION_START = "com.arxdigital.ramos.station.START";
    static final String ACTION_STOP = "com.arxdigital.ramos.station.STOP";

    static final int NOTIFICATION_ID = 7101;
    static final int ALERT_NOTIFICATION_ID = 7102;

    static final int WAIT_MS = 20_000;
    /** Web istasyonuyla aynı: baskı 10 sn, durum yoklaması 3 sn. */
    static final int SEND_TIMEOUT_MS = 10_000;
    static final int STATUS_TIMEOUT_MS = 3_000;
    static final long HEARTBEAT_MS = 30_000;
    static final long BACKOFF_MIN_MS = 2_000;
    static final long BACKOFF_MAX_MS = 60_000;
    /** Yazıcı hatasından sonra sıradaki işi hemen almadan önce ara (web: tur biter, 5 sn sonra yoklar). */
    static final long PRINT_FAIL_PAUSE_MS = 5_000;
    /** Sunucu beklemeden boş yanıt dönerse sıkı döngüye girmemek için iki yoklama arası en az süre. */
    static final long MIN_POLL_GAP_MS = 1_000;
    static final long MIN_POLL_GAP_OTHER_ROUTE_MS = 10_000;
    /** complete(ok=true) yeniden deneme üst süresi. */
    static final long COMPLETE_RETRY_MAX_MS = 5 * 60_000L;

    /** Süreç içinde tek örnek (eklentinin `running` bilgisi için). */
    private static volatile boolean workerAlive = false;

    private final Object waitLock = new Object();
    private volatile boolean stopped = true;
    private volatile boolean wakeRequested = false;
    private volatile HttpURLConnection activeNext;
    private volatile Thread worker;
    private ScheduledExecutorService heartbeats;
    private PowerManager.WakeLock wakeLock;
    private WifiManager.WifiLock wifiLock;
    private ConnectivityManager.NetworkCallback netCallback;
    private final Handler main = new Handler(Looper.getMainLooper());
    private String lastNotificationText;
    private String version;

    static boolean isRunning() {
        return workerAlive;
    }

    /** Uygulama içinden başlatma (eklenti / açılış alıcısı). */
    static void start(Context ctx) {
        Intent i = new Intent(ctx, StationService.class).setAction(ACTION_START);
        ContextCompat.startForegroundService(ctx, i);
    }

    // ---------------------------------------------------------------- yaşam döngüsü

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        version = "android-bg-" + BuildConfig.VERSION_NAME;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent != null ? intent.getAction() : null;
        // startForegroundService ile başlatıldıysak (durdurma dahil) önce startForeground çağrılmalı.
        boolean foreground = goForeground();

        if (ACTION_STOP.equals(action)) {
            Log.i(TAG, "bildirimden durduruldu");
            StationStore.disable(this, null);
            shutdown();
            return START_NOT_STICKY;
        }

        StationStore.Config cfg = StationStore.config(this);
        if (!cfg.enabled || !cfg.isComplete() || !FeedClient.isAllowedUrl(cfg.feedUrl)) {
            Log.i(TAG, "istasyon kapalı ya da ayar eksik — servis duruyor");
            shutdown();
            return START_NOT_STICKY;
        }
        if (!foreground) {
            // Ön plana geçemedik (Android 12+ arka plan kısıtı): kısa ömürlü arka plan servisi olarak
            // çalışmanın anlamı yok. enabled korunur: uygulama açılınca / açılışta yeniden başlar.
            StationStore.update(this, s -> s.lastError = "start_failed: ön plan servisi başlatılamadı");
            shutdown();
            return START_NOT_STICKY;
        }
        if (worker == null || !worker.isAlive()) {
            startWorker();
        } else {
            // Ayar değişmiş olabilir (yeni jeton): işçi her turda ayarı yeniden okur; beklemeyi kes.
            wake();
        }
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        stopWorker();
        super.onDestroy();
    }

    /** true: ön plana geçildi. */
    private boolean goForeground() {
        Notification n = buildNotification(notificationText(StationStore.snapshot(this)));
        try {
            if (Build.VERSION.SDK_INT >= 34) {
                startForeground(NOTIFICATION_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
            } else {
                startForeground(NOTIFICATION_ID, n);
            }
            return true;
        } catch (Exception e) {
            // Android 12+: ForegroundServiceStartNotAllowedException (arka plandan başlatma kısıtı).
            Log.w(TAG, "startForeground başarısız: " + e);
            return false;
        }
    }

    private void startWorker() {
        stopped = false;
        wakeRequested = false;
        StationStore.onServiceStart(this);
        acquireLocks();
        registerNetworkCallback();
        workerAlive = true;
        worker = new Thread(this::runLoop, "ramos-station");
        worker.start();
        heartbeats = Executors.newSingleThreadScheduledExecutor(r -> new Thread(r, "ramos-station-hb"));
        // Açılışta hemen: yazıcı adresi önceki çalışmadan biliniyorsa. Bilinmiyorsa ilk `next` yanıtından sonra.
        if (StationStore.snapshot(this).printerHost != null) heartbeats.execute(this::heartbeatSafe);
        heartbeats.scheduleWithFixedDelay(this::heartbeatSafe, HEARTBEAT_MS, HEARTBEAT_MS, TimeUnit.MILLISECONDS);
        Log.i(TAG, "istasyon başladı (" + version + ")");
        refreshNotification();
    }

    /** İşçiyi durdurur, kilitleri bırakır. İdempotent. */
    private void stopWorker() {
        boolean wasRunning = !stopped;
        stopped = true;
        wake();
        HttpURLConnection c = activeNext;
        if (c != null) {
            try {
                c.disconnect(); // bekleyen uzun yoklamayı hemen kes
            } catch (Throwable ignored) {}
        }
        if (heartbeats != null) {
            heartbeats.shutdownNow();
            heartbeats = null;
        }
        unregisterNetworkCallback();
        releaseLocks();
        workerAlive = false;
        StationStore.update(this, s -> {
            s.running = false;
            s.feedError = null;
        });
        if (wasRunning) Log.i(TAG, "istasyon durdu");
    }

    /** Ana thread'de: işçiyi durdur, bildirimi kaldır, servisi bitir. */
    private void shutdown() {
        stopWorker();
        if (Build.VERSION.SDK_INT >= 24) {
            stopForeground(STOP_FOREGROUND_REMOVE);
        } else {
            stopForegroundLegacy();
        }
        stopSelf();
    }

    @SuppressWarnings("deprecation")
    private void stopForegroundLegacy() {
        stopForeground(true);
    }

    // ---------------------------------------------------------------- iş döngüsü

    private void runLoop() {
        long backoff = 0;
        boolean firstPoll = true;
        try {
            while (!stopped) {
                StationStore.Config cfg = StationStore.config(this);
                if (!cfg.enabled || !cfg.isComplete()) {
                    main.post(this::shutdown);
                    return;
                }
                FeedClient feed;
                try {
                    feed = new FeedClient(cfg.feedUrl, cfg.token, version);
                } catch (Exception e) {
                    StationStore.update(this, s -> s.lastError = "invalid_config: " + e.getMessage());
                    main.post(this::shutdown);
                    return;
                }

                long started = SystemClock.elapsedRealtime();
                FeedClient.NextResult r;
                try {
                    r = feed.next(WAIT_MS, c -> activeNext = c);
                } catch (FeedClient.UnauthorizedException e) {
                    onUnauthorized();
                    return;
                } catch (Exception e) {
                    if (stopped) return;
                    backoff = backoff == 0 ? BACKOFF_MIN_MS : Math.min(backoff * 2, BACKOFF_MAX_MS);
                    final String msg = feedErrorText(e);
                    Log.w(TAG, "next başarısız (" + msg + "), " + backoff + " ms sonra yeniden");
                    StationStore.update(this, s -> s.feedError = msg);
                    refreshNotification();
                    waitStop(backoff);
                    continue;
                }
                backoff = 0;
                final FeedClient.NextResult res = r;
                final long now = System.currentTimeMillis();
                StationStore.update(this, s -> {
                    s.feedError = null;
                    s.lastPollAt = now;
                    s.route = res.route;
                    s.printerHost = res.printerHost;
                    s.printerPort = res.printerPort;
                    s.missingPrinter = res.printerHost == null;
                });
                refreshNotification();
                if (firstPoll) {
                    firstPoll = false;
                    ScheduledExecutorService hb = heartbeats;
                    if (hb != null) {
                        try {
                            hb.execute(this::heartbeatSafe);
                        } catch (Exception ignored) {}
                    }
                }

                if (res.hasJob) {
                    handleJob(feed, res);
                    continue; // iş sonrası beklemeden yeniden sor (kuyrukta başka fiş olabilir)
                }
                boolean stationRoute = res.route == null || "station".equals(res.route);
                long gap = stationRoute ? MIN_POLL_GAP_MS : MIN_POLL_GAP_OTHER_ROUTE_MS;
                long elapsed = SystemClock.elapsedRealtime() - started;
                if (elapsed < gap) waitStop(gap - elapsed);
            }
        } catch (Throwable t) {
            Log.e(TAG, "işçi beklenmeyen hata", t);
            StationStore.update(this, s -> s.lastError = "io: " + t);
            // START_STICKY + yeniden başlatma yerine: kısa ara verip servisi yeniden başlat.
            if (!stopped) main.postDelayed(() -> {
                if (!stopped && (worker == null || !worker.isAlive())) startWorkerAgain();
            }, BACKOFF_MIN_MS);
        } finally {
            if (Thread.currentThread() == worker) workerAlive = false;
        }
    }

    private void startWorkerAgain() {
        worker = new Thread(this::runLoop, "ramos-station");
        workerAlive = true;
        worker.start();
    }

    private void handleJob(FeedClient feed, FeedClient.NextResult job) {
        if (job.jobId == null || job.jobId.isEmpty()) {
            // Kimliksiz iş kapatılamaz; basarsak sunucu geri alıp yeniden verir → çift fiş. Basma.
            Log.w(TAG, "kimliksiz iş atlandı");
            return;
        }
        if (job.printerHost == null) {
            String msg = "offline: yazıcı adresi yok (Ayarlar → Yazıcı bağlantısı)";
            StationStore.update(this, s -> s.lastError = msg);
            completeFailure(feed, job.jobId, msg);
            refreshNotification();
            waitStop(PRINT_FAIL_PAUSE_MS);
            return;
        }

        PrinterClient.SendResult res;
        PrinterClient.LOCK.lock();
        try {
            res = PrinterClient.sendBase64(job.printerHost, job.printerPort, job.data, SEND_TIMEOUT_MS, true);
        } finally {
            PrinterClient.LOCK.unlock();
        }

        if (!res.ok) {
            final String msg = sendErrorText(res);
            Log.w(TAG, "iş " + job.jobId + " basılamadı: " + msg);
            final boolean invalid = res.invalidInput;
            final String code = res.error;
            StationStore.update(this, s -> {
                s.lastError = msg;
                if (!invalid) {
                    s.reachable = !isUnreachableError(code);
                    s.problem = isPrinterProblem(code) ? code : null;
                }
            });
            refreshNotification();
            completeFailure(feed, job.jobId, msg);
            // Bozuk veri yazıcı sorunu değil: sıradakine hemen geç (web M6). Yazıcı hatasında kısa ara.
            if (!invalid) waitStop(PRINT_FAIL_PAUSE_MS);
            return;
        }

        // Bayt gitti: buradan sonra yalnız complete(true).
        final long now = System.currentTimeMillis();
        final String statusHex = res.status;
        StationStore.update(this, s -> {
            s.printed += 1;
            s.lastPrintedAt = now;
            s.lastError = null;
            s.reachable = true;
            s.problem = statusHex != null ? PrinterClient.blockingProblem(PrinterClient.unhex(statusHex)) : null;
        });
        Log.i(TAG, "iş " + job.jobId + " basıldı");
        refreshNotification();
        completeSuccessWithRetry(feed, job.jobId);
    }

    private void completeFailure(FeedClient feed, String jobId, String message) {
        try {
            feed.complete(jobId, false, message);
        } catch (FeedClient.UnauthorizedException e) {
            onUnauthorized();
        } catch (Exception e) {
            // Kapatılamadıysa sunucu işi kendi süresi dolunca geri alır ve yeniden dener.
            Log.w(TAG, "complete(false) yazılamadı: " + feedErrorText(e));
        }
    }

    /** Durdurma istense bile (iş basıldı) belirli süre denemeye devam eder: çift fiş olmasın. */
    private void completeSuccessWithRetry(FeedClient feed, String jobId) {
        long deadline = SystemClock.elapsedRealtime() + COMPLETE_RETRY_MAX_MS;
        long delay = 1_000;
        while (true) {
            try {
                String result = feed.complete(jobId, true, null);
                if (!"ok".equals(result)) Log.w(TAG, "complete(true) sonucu: " + result + " (iş artık bu istasyonun değil)");
                return;
            } catch (FeedClient.UnauthorizedException e) {
                onUnauthorized();
                return;
            } catch (FeedClient.HttpStatusException e) {
                if (e.code < 500) {
                    Log.w(TAG, "complete(true) reddedildi: " + e.getMessage());
                    return;
                }
                Log.w(TAG, "complete(true) yeniden denenecek: " + e.getMessage());
            } catch (Exception e) {
                Log.w(TAG, "complete(true) yeniden denenecek: " + feedErrorText(e));
            }
            if (SystemClock.elapsedRealtime() + delay > deadline) {
                Log.e(TAG, "complete(true) " + (COMPLETE_RETRY_MAX_MS / 1000) + " sn içinde yazılamadı: " + jobId);
                return;
            }
            SystemClock.sleep(delay);
            delay = Math.min(delay * 2, 30_000);
        }
    }

    /** 401: jeton silinmiş/iptal. Kalıcı kapat, kullanıcıya bildir. */
    private void onUnauthorized() {
        if (stopped && !StationStore.config(this).enabled) return;
        Log.w(TAG, "401 — istasyon kaydı silinmiş, kapatılıyor");
        StationStore.disable(this, "unauthorized: istasyon kaydı silindi");
        postAlert("İstasyon kaydı silindi — uygulamadan yeniden açın");
        stopped = true;
        main.post(this::shutdown);
    }

    // ---------------------------------------------------------------- heartbeat

    private void heartbeatSafe() {
        try {
            heartbeat();
        } catch (Throwable t) {
            Log.w(TAG, "heartbeat hata: " + t);
        }
    }

    private void heartbeat() throws Exception {
        if (stopped) return;
        StationStore.Config cfg = StationStore.config(this);
        if (!cfg.enabled || !cfg.isComplete()) return;
        StationStore.Status st = StationStore.snapshot(this);
        boolean stationRoute = st.route == null || "station".equals(st.route);

        boolean reachable = false;
        JSONObject state = null;
        String message = null;
        // Baskı yolu istasyon değilse yazıcıya bağlanma: bilgisayar programının baskısıyla çakışmasın (R69).
        boolean probe = st.printerHost != null && stationRoute;
        if (probe) {
            PrinterClient.StatusResult r;
            PrinterClient.LOCK.lock();
            try {
                r = PrinterClient.status(st.printerHost, st.printerPort, STATUS_TIMEOUT_MS);
            } finally {
                PrinterClient.LOCK.unlock();
            }
            if (stopped) return;
            reachable = r.reachable;
            message = r.message;
            byte[] bytes = PrinterClient.unhex(r.status);
            state = r.status != null ? PrinterClient.parseStatus(bytes) : null;
            final boolean ok = reachable;
            final String problem = ok ? PrinterClient.blockingProblem(bytes) : null;
            StationStore.update(this, s -> {
                s.reachable = ok;
                s.problem = problem;
            });
            refreshNotification();
        }

        String error;
        if (st.lastError != null) error = st.lastError;
        else if (st.printerHost == null) error = "no_printer_config";
        else if (!stationRoute) error = "route: " + st.route;
        else if (reachable) error = null;
        else error = "offline: " + (message == null || message.trim().isEmpty() ? "offline" : message.trim());

        try {
            new FeedClient(cfg.feedUrl, cfg.token, version).heartbeat(version, reachable, state, error);
        } catch (FeedClient.UnauthorizedException e) {
            onUnauthorized();
        } catch (Exception e) {
            Log.w(TAG, "heartbeat yazılamadı: " + feedErrorText(e));
        }
    }

    // ---------------------------------------------------------------- bekleme / ağ

    /** ms kadar bekler; durdurulunca ya da ağ geri gelince erken döner. */
    private void waitStop(long ms) {
        long deadline = SystemClock.elapsedRealtime() + ms;
        synchronized (waitLock) {
            while (!stopped && !wakeRequested) {
                long left = deadline - SystemClock.elapsedRealtime();
                if (left <= 0) break;
                try {
                    waitLock.wait(left);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    break;
                }
            }
            wakeRequested = false;
        }
    }

    private void wake() {
        synchronized (waitLock) {
            wakeRequested = true;
            waitLock.notifyAll();
        }
    }

    private void registerNetworkCallback() {
        if (Build.VERSION.SDK_INT < 24 || netCallback != null) return;
        ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        if (cm == null) return;
        netCallback = new ConnectivityManager.NetworkCallback() {
            @Override
            public void onAvailable(Network network) {
                // Wi-Fi geri geldi: geri çekilmeyi beklemeden hemen yeniden dene.
                wake();
            }
        };
        try {
            cm.registerDefaultNetworkCallback(netCallback);
        } catch (Exception e) {
            netCallback = null;
        }
    }

    private void unregisterNetworkCallback() {
        if (netCallback == null) return;
        ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        try {
            if (cm != null) cm.unregisterNetworkCallback(netCallback);
        } catch (Exception ignored) {}
        netCallback = null;
    }

    @SuppressWarnings({ "deprecation", "WakelockTimeout" })
    private void acquireLocks() {
        try {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (pm != null && wakeLock == null) {
                wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "ramos:station");
                wakeLock.setReferenceCounted(false);
                wakeLock.acquire(); // servis durunca bırakılır
            }
        } catch (Exception e) {
            Log.w(TAG, "wake lock alınamadı: " + e);
        }
        try {
            WifiManager wm = (WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            if (wm != null && wifiLock == null) {
                int mode = Build.VERSION.SDK_INT >= 29 ? WifiManager.WIFI_MODE_FULL_LOW_LATENCY : WifiManager.WIFI_MODE_FULL_HIGH_PERF;
                wifiLock = wm.createWifiLock(mode, "ramos:station");
                wifiLock.setReferenceCounted(false);
                wifiLock.acquire();
            }
        } catch (Exception e) {
            Log.w(TAG, "wifi lock alınamadı: " + e);
        }
    }

    private void releaseLocks() {
        try {
            if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        } catch (Exception ignored) {}
        wakeLock = null;
        try {
            if (wifiLock != null && wifiLock.isHeld()) wifiLock.release();
        } catch (Exception ignored) {}
        wifiLock = null;
    }

    // ---------------------------------------------------------------- bildirim

    static String notificationText(StationStore.Status s) {
        if (s.route != null && !"station".equals(s.route)) return "Baskı yolu istasyon değil";
        if (s.missingPrinter) return "Yazıcı adresi yok (Admin → Ayarlar)";
        if (s.feedError != null) return "Sunucuya ulaşılamıyor · yeniden deneniyor";
        if ("paper_end".equals(s.problem)) return "Yazıcıda kağıt bitti";
        if ("cover_open".equals(s.problem)) return "Yazıcı kapağı açık";
        if (Boolean.FALSE.equals(s.reachable) || "offline".equals(s.problem)) return "Yazıcıya ulaşılamıyor";
        if (s.lastPrintedAt != null) {
            return "Çalışıyor · son fiş " + new SimpleDateFormat("HH:mm", Locale.ROOT).format(new Date(s.lastPrintedAt));
        }
        return "Çalışıyor";
    }

    private void refreshNotification() {
        if (stopped) return;
        String text = notificationText(StationStore.snapshot(this));
        synchronized (this) {
            if (text.equals(lastNotificationText)) return;
            lastNotificationText = text;
        }
        try {
            NotificationManagerCompat.from(this).notify(NOTIFICATION_ID, buildNotification(text));
        } catch (SecurityException e) {
            // Android 13+ bildirim izni yok: bildirim görünmez ama servis çalışmaya devam eder.
        }
    }

    private Notification buildNotification(String text) {
        NotificationCompat.Builder b = new NotificationCompat.Builder(this, RamosApplication.CHANNEL_STATION)
            .setSmallIcon(R.drawable.ic_stat_ramos)
            .setColor(ContextCompat.getColor(this, R.color.colorAccent))
            .setContentTitle("Ramo's yazıcı istasyonu")
            .setContentText(text)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setShowWhen(false)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setContentIntent(openAppIntent())
            .addAction(0, "Durdur", stopIntent())
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE);
        return b.build();
    }

    private PendingIntent openAppIntent() {
        Intent open = new Intent(this, MainActivity.class)
            .setAction(Intent.ACTION_MAIN)
            .addCategory(Intent.CATEGORY_LAUNCHER)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED);
        return PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private PendingIntent stopIntent() {
        // Bildirim görünüyorsa servis bu süreçte çalışıyordur → düz startService yeterli (arka plan kısıtı yok).
        Intent stop = new Intent(this, StationService.class).setAction(ACTION_STOP);
        return PendingIntent.getService(this, 1, stop, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private void postAlert(String text) {
        NotificationCompat.Builder b = new NotificationCompat.Builder(this, RamosApplication.CHANNEL_STATION_ALERT)
            .setSmallIcon(R.drawable.ic_stat_ramos)
            .setColor(ContextCompat.getColor(this, R.color.colorAccent))
            .setContentTitle("Ramo's yazıcı istasyonu durdu")
            .setContentText(text)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(text))
            .setAutoCancel(true)
            .setCategory(NotificationCompat.CATEGORY_ERROR)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setContentIntent(openAppIntent());
        try {
            NotificationManagerCompat.from(this).notify(ALERT_NOTIFICATION_ID, b.build());
        } catch (SecurityException ignored) {}
    }

    // ---------------------------------------------------------------- yardımcılar

    /** Web istasyonu `sendErrorText` ile aynı: "kod: mesaj". */
    static String sendErrorText(PrinterClient.SendResult r) {
        String code = r.error != null ? r.error : "io";
        String msg = r.message != null ? r.message.trim() : "";
        return code + ": " + (msg.isEmpty() ? code : msg);
    }

    /** Web istasyonu `isUnreachableError` ile aynı. */
    static boolean isUnreachableError(String code) {
        return code == null || code.equals("offline") || code.equals("timeout") || code.equals("io");
    }

    private static boolean isPrinterProblem(String code) {
        return "paper_end".equals(code) || "cover_open".equals(code) || "offline".equals(code);
    }

    private static String feedErrorText(Exception e) {
        if (e instanceof FeedClient.HttpStatusException) return e.getMessage();
        String m = e.getMessage();
        return "network: " + (m == null || m.isEmpty() ? e.getClass().getSimpleName() : m);
    }
}
