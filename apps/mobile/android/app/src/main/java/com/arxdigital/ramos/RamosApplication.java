package com.arxdigital.ramos;

import android.app.Application;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.os.Build;

/**
 * Uygulama süreci başlarken "ramos_ready" bildirim kanalını oluşturur (Android 8+). FCM, uygulama arka
 * plandayken gelen bildirimleri AndroidManifest'teki default_notification_channel_id ile bu kanala koyar;
 * kanal Activity'den önce, süreç başlar başlamaz var olmalı (FCM servisi Activity açmadan da çalışır).
 */
public class RamosApplication extends Application {

    public static final String CHANNEL_READY = "ramos_ready";

    @Override
    public void onCreate() {
        super.onCreate();
        createReadyChannel();
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
