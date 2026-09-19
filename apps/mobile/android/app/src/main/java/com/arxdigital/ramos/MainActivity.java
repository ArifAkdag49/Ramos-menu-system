package com.arxdigital.ramos;

import android.os.Bundle;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    /**
     * Sayfaya sorulan geri tuşu işleyicisi (apps/web/src/native/backButton.ts): açık panel varsa onu
     * kapatır ve true döner; false → aşağıda WebView geçmişinde geri gidilir.
     */
    private static final String BACK_JS =
        "(function(){try{return typeof window.__ramosBack==='function'&&window.__ramosBack()===true}catch(e){return false}})()";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Yerel eklentiler köprü kurulmadan (super.onCreate) önce kaydedilmeli.
        registerPlugin(RamosPrinterPlugin.class);
        super.onCreate(savedInstanceState);
        // Geri tuşu / geri hareketi. Capacitor çekirdeği geri tuşunu ele almaz (bunu @capacitor/app eklentisi
        // yapar; kurulu değil): işleyici olmayınca sistem varsayılanı Activity'yi bitirir — garson bir
        // ekrandan geri çıkmak isterken uygulama kapanıyordu. OnBackPressedDispatcher hem eski geri tuşunu
        // hem Android 13+/16 (targetSdk 36) "predictive back" hareketini kapsar.
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                onBack();
            }
        });
    }

    private void onBack() {
        WebView web = getBridge() != null ? getBridge().getWebView() : null;
        if (web == null) {
            moveTaskToBack(true);
            return;
        }
        web.evaluateJavascript(BACK_JS, value -> {
            // "true" → sayfa açık paneli kapattı; başka bir şey yapma.
            if ("true".equals(value)) return;
            if (web.canGoBack()) {
                web.goBack();
            } else {
                // Geçmiş yok (rolün ana ekranı): uygulamayı kapatmak yerine arka plana al — mutfak
                // tabletindeki istasyon ve oturum yerinde kalsın, tekrar açınca sayfa yeniden yüklenmesin.
                moveTaskToBack(true);
            }
        });
    }
}
