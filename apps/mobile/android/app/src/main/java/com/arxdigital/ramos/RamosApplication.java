package com.arxdigital.ramos;

import android.app.Application;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.os.Build;

/**
 * Uygulama süreci başlarken bildirim kanallarını oluşturur (Android 8+). FCM, uygulama arka plandayken
 * gelen bildirimleri AndroidManifest'teki default_notification_channel_id ile "ramos_ready" kanalına koyar;
 * kanallar Activity'den önce, süreç başlar başlamaz var olmalı (FCM servisi ve açılışta başlayan yazıcı
 * istasyonu servisi Activity açmadan da çalışır).
 */
public class RamosApplication extends Application {

    public static final String CHANNEL_READY = "ramos_ready";
    /** Arka plan yazıcı istasyonunun kalıcı (sessiz) bildirimi. */
    public static final String CHANNEL_STATION = "ramos_station";
    /** İstasyon kendiliğinden durduğunda (ör. kayıt silindi) tek seferlik uyarı. */
    public static final String CHANNEL_STATION_ALERT = "ramos_station_alert";

    @Override
    public void onCreate() {
        super.onCreate();
        createReadyChannel();
        createStationChannels();
    }

    private void createStationChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm == null) return;
        NotificationChannel ch = new NotificationChannel(CHANNEL_STATION, "Yazıcı istasyonu", NotificationManager.IMPORTANCE_LOW);
        ch.setDescription("Arka planda fiş basan yazıcı istasyonu çalışırken görünen kalıcı bildirim");
        ch.setShowBadge(false);
        ch.enableVibration(false);
        ch.setSound(null, null);
        nm.createNotificationChannel(ch);

        NotificationChannel alert = new NotificationChannel(
            CHANNEL_STATION_ALERT,
            "Yazıcı istasyonu uyarıları",
            NotificationManager.IMPORTANCE_DEFAULT
        );
        alert.setDescription("Yazıcı istasyonu kendiliğinden durduğunda (ör. istasyon kaydı silindi)");
        nm.createNotificationChannel(alert);
    }

    private void createReadyChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm == null) return;
        // Kanal önemi/sesi oluşturulduktan sonra kod ile değiştirilemez (kullanıcı ayarı olur); aynı kimlikle
        // tekrar çağırmak yalnız ad/açıklamayı günceller, bu yüzden her açılışta çağırmak güvenli.
        NotificationChannel ch = new NotificationChannel(CHANNEL_READY, "Hazır siparişler", NotificationManager.IMPORTANCE_HIGH);
        ch.setDescription("Sipariş hazır olduğunda sesli ve titreşimli bildirim");
        ch.enableVibration(true);
        ch.setVibrationPattern(new long[] { 0, 400, 200, 400 });
        ch.enableLights(true);
        ch.setShowBadge(true);
        ch.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);
        AudioAttributes attrs = new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build();
        ch.setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION), attrs);
        nm.createNotificationChannel(ch);
    }
}
