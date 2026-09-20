package com.arxdigital.ramos;

import android.content.Context;
import android.net.nsd.NsdManager;
import android.net.nsd.NsdServiceInfo;
import android.os.SystemClock;
import android.util.Log;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;

/**
 * Bonjour / mDNS (DNS-SD) ile yazıcı bulma — Android {@link NsdManager}. Epson TM, Star, Brother, HP gibi
 * ağ yazıcıları kendilerini `_pdl-datastream._tcp` (ham 9100), `_printer._tcp` (LPD), `_ipp._tcp` ve
 * `_http._tcp` (web arayüzü) olarak duyurur. Bulunan hizmet çözümlenir, IPv4 adresi ve hizmet adı
 * ({@link PrinterDiscovery}'ye ipucu olarak) döner. `_http._tcp` her cihazda var (modem, NAS…): yalnız adı
 * yazıcıya benzeyenler alınır. Bloklayıcıdır (çağıran arka plan thread'i); pencere süresi kadar dinler.
 */
final class NsdProbe {

    private static final String TAG = "RamosNsd";
    static final String[] PRINTER_TYPES = { "_pdl-datastream._tcp.", "_printer._tcp.", "_ipp._tcp." };
    static final String HTTP_TYPE = "_http._tcp.";
    private static final long RESOLVE_WAIT_MS = 2500;

    private NsdProbe() {}

    static boolean looksLikePrinter(String name) {
        return PrinterDiscovery.looksLikePrinter(name);
    }

    /** windowMs boyunca dinler; IPv4 adres → hizmet adı. Asla fırlatmaz. */
    @SuppressWarnings("deprecation")
    static Map<String, String> discover(Context ctx, long windowMs) {
        Map<String, String> out = new ConcurrentHashMap<>();
        NsdManager nsd;
        try {
            nsd = (NsdManager) ctx.getApplicationContext().getSystemService(Context.NSD_SERVICE);
        } catch (Throwable t) {
            return out;
        }
        if (nsd == null) return out;

        final LinkedBlockingQueue<NsdServiceInfo> queue = new LinkedBlockingQueue<>();
        List<NsdManager.DiscoveryListener> listeners = new ArrayList<>();
        List<String> types = new ArrayList<>();
        for (String t : PRINTER_TYPES) types.add(t);
        types.add(HTTP_TYPE);
        for (final String type : types) {
            NsdManager.DiscoveryListener l = new NsdManager.DiscoveryListener() {
                @Override
                public void onStartDiscoveryFailed(String serviceType, int errorCode) {
                    Log.w(TAG, "keşif başlatılamadı " + serviceType + ": " + errorCode);
                }

                @Override
                public void onStopDiscoveryFailed(String serviceType, int errorCode) {}

                @Override
                public void onDiscoveryStarted(String serviceType) {}

                @Override
                public void onDiscoveryStopped(String serviceType) {}

                @Override
                public void onServiceFound(NsdServiceInfo info) {
                    String name = info.getServiceName();
                    if (HTTP_TYPE.equals(type) && !looksLikePrinter(name)) return;
                    queue.offer(info);
                }

                @Override
                public void onServiceLost(NsdServiceInfo info) {}
            };
            try {
                nsd.discoverServices(type, NsdManager.PROTOCOL_DNS_SD, l);
                listeners.add(l);
            } catch (Throwable t) {
                Log.w(TAG, "discoverServices " + type + ": " + t);
            }
        }

        long deadline = SystemClock.elapsedRealtime() + windowMs;
        try {
            while (true) {
                long left = deadline - SystemClock.elapsedRealtime();
                if (left <= 0) break;
                NsdServiceInfo info = queue.poll(Math.min(left, 200), TimeUnit.MILLISECONDS);
                if (info != null) resolve(nsd, info, out);
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        } finally {
            for (NsdManager.DiscoveryListener l : listeners) {
                try {
                    nsd.stopServiceDiscovery(l);
                } catch (Throwable ignored) {}
            }
        }
        return out;
    }

    /** Tek tek çözümleme: bazı sürümlerde eşzamanlı resolve "already active" ile başarısız olur. */
    @SuppressWarnings("deprecation")
    private static void resolve(NsdManager nsd, NsdServiceInfo info, final Map<String, String> out) {
        final CountDownLatch done = new CountDownLatch(1);
        final String name = info.getServiceName();
        try {
            nsd.resolveService(info, new NsdManager.ResolveListener() {
                @Override
                public void onResolveFailed(NsdServiceInfo serviceInfo, int errorCode) {
                    done.countDown();
                }

                @Override
                public void onServiceResolved(NsdServiceInfo serviceInfo) {
                    try {
                        InetAddress a = serviceInfo.getHost();
                        if (a instanceof Inet4Address) {
                            String host = a.getHostAddress();
                            if (host != null) out.putIfAbsent(host, name != null ? name : "");
                        }
                    } finally {
                        done.countDown();
                    }
                }
            });
            done.await(RESOLVE_WAIT_MS, TimeUnit.MILLISECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        } catch (Throwable t) {
            Log.w(TAG, "resolve " + name + ": " + t);
        }
    }
}
