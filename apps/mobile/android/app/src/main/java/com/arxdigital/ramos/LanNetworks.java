package com.arxdigital.ramos;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.LinkAddress;
import android.net.LinkProperties;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.wifi.WifiManager;
import android.util.Log;
import java.io.IOException;
import java.net.DatagramSocket;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.Socket;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Cihazın bağlı olduğu yerel ağlar (Wi-Fi ya da kablolu Ethernet), yazıcı soketlerinin o ağa bağlanması ve
 * tam keşif ({@link #discoverAll}: mDNS + SNMP + TCP taraması).
 *
 * Neden bağlama: Android'de {@code new Socket().connect()} "varsayılan ağı" kullanır. Telefonda mobil veri
 * açıkken Android, Wi-Fi'ı internetsiz/zayıf sayınca varsayılan ağı hücresel yapabilir; o anda yerel ağdaki
 * yazıcıya giden her bağlantı mobil şebekeye gider ve zaman aşımına düşer — Epson TM Utility ise aynı
 * telefondan basar (Wi-Fi'a açıkça bağlanır). {@link #binder} soketi bağlanmadan önce yazıcının bulunduğu
 * yerel ağa bağlar ({@link Network#bindSocket}); yerel ağ yoksa varsayılan ağla devam edilir.
 *
 * VPN ağları sayılmaz (yazıcı VPN'in arkasında olmaz, tarama uzar).
 */
final class LanNetworks {

    private static final String TAG = "RamosLan";
    /** mDNS dinleme penceresi; TCP taramasıyla paralel çalıştığı için toplam süreyi uzatmaz. */
    static final long NSD_WINDOW_MS = 4000;

    static final class Lan {
        final Network network;
        final String address;
        final int prefix;
        /** "wifi" | "ethernet" */
        final String transport;

        Lan(Network network, String address, int prefix, String transport) {
            this.network = network;
            this.address = address;
            this.prefix = prefix;
            this.transport = transport;
        }
    }

    private LanNetworks() {}

    /** Wi-Fi / Ethernet ağları, IPv4 adresiyle. Wi-Fi önce. Hata durumunda boş liste (asla fırlatmaz). */
    @SuppressWarnings("deprecation")
    static List<Lan> list(Context ctx) {
        List<Lan> out = new ArrayList<>();
        try {
            ConnectivityManager cm = (ConnectivityManager) ctx.getApplicationContext().getSystemService(Context.CONNECTIVITY_SERVICE);
            if (cm == null) return out;
            // getAllNetworks: API 31'de "kullanımdan kalktı" ama çalışır; eşzamanlı tek alternatif yok.
            Network[] all = cm.getAllNetworks();
            if (all == null) return out;
            for (Network n : all) {
                NetworkCapabilities caps = cm.getNetworkCapabilities(n);
                if (caps == null || caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN)) continue;
                String transport;
                if (caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) transport = "wifi";
                else if (caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET)) transport = "ethernet";
                else continue;
                LinkProperties lp = cm.getLinkProperties(n);
                if (lp == null) continue;
                for (LinkAddress la : lp.getLinkAddresses()) {
                    InetAddress a = la.getAddress();
                    if (!(a instanceof Inet4Address) || a.isLoopbackAddress()) continue;
                    out.add(new Lan(n, a.getHostAddress(), la.getPrefixLength(), transport));
                }
            }
        } catch (Throwable t) {
            Log.w(TAG, "ağ listesi okunamadı: " + t);
        }
        // Wi-Fi önce (yazıcı çoğunlukla Wi-Fi modemde); sıra kararlı kalsın.
        List<Lan> sorted = new ArrayList<>();
        for (Lan l : out) if ("wifi".equals(l.transport)) sorted.add(l);
        for (Lan l : out) if (!"wifi".equals(l.transport)) sorted.add(l);
        return sorted;
    }

    /** Ekran/tarama için ağ tanımları. */
    static List<PrinterDiscovery.Network> discoveryNetworks(List<Lan> lans) {
        List<PrinterDiscovery.Network> out = new ArrayList<>();
        for (Lan l : lans) out.add(new PrinterDiscovery.Network(l.address, l.prefix, l.transport));
        return out;
    }

    /**
     * Hedef adres için ağ: adres bir yerel ağın alt ağındaysa o ağ; değilse (alan adı, başka alt ağ) ilk Wi-Fi,
     * yoksa ilk Ethernet. Yerel makine adresleri (localhost, 127.*, emülatörün 10.0.2.2'si) bağlanmaz.
     */
    static Lan pick(List<Lan> lans, String host) {
        if (lans == null || lans.isEmpty() || host == null) return null;
        String h = host.trim().toLowerCase(Locale.ROOT);
        if (h.equals("localhost") || h.startsWith("127.") || h.equals("10.0.2.2")) return null;
        for (Lan l : lans) if (PrinterDiscovery.inSubnet(h, l.address, l.prefix)) return l;
        return lans.get(0);
    }

    /** Ağ listesi önbelleği: tarama sırasında saniyede yüzlerce bağlantı açılır, her birinde sistem sorgusu gereksiz. */
    private static final long CACHE_MS = 2000;
    private static volatile List<Lan> cached = null;
    private static volatile long cachedAt = 0;

    private static List<Lan> listCached(Context app) {
        long now = System.currentTimeMillis();
        List<Lan> c = cached;
        if (c != null && now - cachedAt < CACHE_MS) return c;
        c = list(app);
        cached = c;
        cachedAt = now;
        return c;
    }

    /** Ağ listesi en çok 2 sn eski olabilir (Wi-Fi değişince bir sonraki bağlantı yeni ağı görür). */
    static PrinterClient.SocketBinder binder(Context ctx) {
        final Context app = ctx.getApplicationContext();
        return new PrinterClient.SocketBinder() {
            @Override
            public void bind(Socket socket, String host) throws IOException {
                Lan lan = pick(listCached(app), host);
                if (lan != null) lan.network.bindSocket(socket);
            }

            @Override
            public void bindDatagram(DatagramSocket socket) throws IOException {
                List<Lan> lans = listCached(app);
                if (!lans.isEmpty()) lans.get(0).network.bindSocket(socket);
            }
        };
    }

    /**
     * Tam keşif: Bonjour/mDNS ({@link NsdProbe}) + SNMP yayını + TCP taraması, Wi-Fi çoklu yayın kilidi
     * altında (yayın/mDNS cevapları filtrelenmesin). Kilit ({@link PrinterClient#LOCK}) ve tekil tarama
     * ({@link PrinterDiscovery#tryBegin()}) çağıranındır. Asla fırlatmaz.
     */
    static PrinterDiscovery.Result discoverAll(Context ctx, List<Lan> lans, List<String> extraHosts) {
        final Context app = ctx.getApplicationContext();
        WifiManager.MulticastLock lock = null;
        try {
            WifiManager wm = (WifiManager) app.getSystemService(Context.WIFI_SERVICE);
            if (wm != null) {
                lock = wm.createMulticastLock("ramos:discover");
                lock.setReferenceCounted(false);
                lock.acquire();
            }
        } catch (Throwable t) {
            Log.w(TAG, "multicast lock: " + t);
        }
        try {
            return PrinterDiscovery.discover(
                discoveryNetworks(lans),
                extraHosts,
                () -> {
                    Map<String, String> m = NsdProbe.discover(app, NSD_WINDOW_MS);
                    if (!m.isEmpty()) Log.i(TAG, "mDNS: " + m);
                    return m;
                },
                PrinterDiscovery.Ports.DEFAULT,
                PrinterDiscovery.DEFAULT_CONNECT_MS,
                PrinterDiscovery.DEFAULT_CONCURRENCY,
                PrinterDiscovery.DEFAULT_SNMP_WAIT_MS
            );
        } finally {
            try {
                if (lock != null && lock.isHeld()) lock.release();
            } catch (Throwable ignored) {}
        }
    }
}
