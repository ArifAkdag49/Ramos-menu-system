package com.arxdigital.ramos;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

/**
 * Cihaz açılınca (BOOT_COMPLETED) ve uygulama güncellenince (MY_PACKAGE_REPLACED — güncelleme süreci
 * ve servisi öldürür) arka plan istasyonu açık bırakılmışsa ön plan servisini yeniden başlatır.
 *
 * Bu yayınlar Android 12+'nın "arka plandan ön plan servisi başlatılamaz" kısıtından muaftır. Android 15
 * açılış yayınından bazı FGS türlerini (dataSync, camera, mediaPlayback, phoneCall, mediaProjection,
 * microphone) yasaklar; istasyonun türü specialUse bu listede değildir.
 * Not: uygulama "Zorla durdur" ile durdurulduysa Android bu yayınları uygulama elle açılana dek iletmez.
 */
public class BootReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent != null ? intent.getAction() : null;
        if (!Intent.ACTION_BOOT_COMPLETED.equals(action)
            && !Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)
            && !"android.intent.action.QUICKBOOT_POWERON".equals(action)) {
            return;
        }
        StationStore.Config cfg = StationStore.config(context);
        if (!cfg.enabled || !cfg.isComplete()) return;
        try {
            StationService.start(context);
            Log.i(StationService.TAG, "istasyon yeniden başlatıldı (" + action + ")");
        } catch (Exception e) {
            Log.w(StationService.TAG, "istasyon yeniden başlatılamadı (" + action + "): " + e);
            StationStore.update(context, s -> s.lastError = "start_failed: " + e.getMessage());
        }
    }
}
