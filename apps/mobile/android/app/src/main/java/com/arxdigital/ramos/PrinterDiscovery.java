package com.arxdigital.ramos;

import java.net.InetSocketAddress;
import java.net.Socket;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Yerel ağda fiş yazıcısı arama — apps/print-agent/src/discover.ts'in Android karşılığı (bilgisayarsız
 * kurulum: yazıcıyı telefon/tablet kendisi bulur). Saf Java (Android'e bağımlı değil; JVM testleri
 * {@code PrinterDiscoveryTest}). Ağ listesini ve soket bağlamayı {@link LanNetworks} verir.
 *
 * İki aşama:
 * <ol>
 * <li><b>Kapı taraması:</b> her adreste dört port paralel denenir (yalnız TCP bağlantısı, veri yok):
 *     9100 düz ham, 9143 Epson şifreli ham, 443 / 80 Epson ePOS-Print. Cevapsız adres bağlantı zaman
 *     aşımı kadar bekletir; 254 adres × 4 port, 64 eşzamanlı → tipik 5–12 sn.</li>
 * <li><b>Kimlik:</b> açık port bulunan her adrese protokol sorusu sorulur (adres başına sırayla — yazıcı
 *     aynı anda tek bağlantı kabul eder, R69). 443/80: ePOS durum belgesi; yalnız gerçek ePOS yanıtı
 *     ({@code <response …>}) yazıcı sayılır — modem/NAS/kamera gibi 443'ü açık her cihaz elenir. 9143:
 *     TLS + DLE EOT, cevap ESC/POS biçimindeyse "epson_secure" (o zaman 9100 yok sayılır: Secure Printing
 *     açık Epson'da 9100 açık görünür ama basmaz). 9100: DLE EOT; ESC/POS cevap → "escpos" (doğrulanmış),
 *     cevapsız → "open" (aday; Xprinter bazen durum sorusuna cevap vermez, deneme fişiyle doğrulanır).</li>
 * </ol>
 * Sonuç: doğrulanmışlar önce (ePOS &gt; Epson şifreli &gt; ESC/POS &gt; aday), sonra adres sırası. Bir
 * adres birden fazla portla listelenebilir (ör. TM-m30III: 443 ePOS + 9143); yönetici seçer.
 */
final class PrinterDiscovery {

    static final String KIND_ESCPOS = "escpos";
    static final String KIND_EPSON_SECURE = "epson_secure";
    static final String KIND_EPSON_EPOS = "epson_epos";
    static final String KIND_OPEN = "open";

    /** Wi-Fi'da ilk ARP + bağlantı 500 ms'yi aşabiliyor (discover.ts ile aynı gerekçe). */
    static final int DEFAULT_CONNECT_MS = 700;
    static final int DEFAULT_CONCURRENCY = 64;
    /** Tek ağdan taranacak en fazla adres: /22'den geniş ağlarda yalnız cihazın kendi /24'ü taranır. */
    static final int MAX_HOSTS_PER_NETWORK = 1022;
    /** Kimlik sorusu (bağlantı + cevap) üst süresi. */
    static final int STATUS_TIMEOUT_MS = 2500;
    /** Kapı taramasının tamamı için üst sınır (ağ çok yavaşsa yarım sonuçla döner). */
    static final long MAX_SCAN_MS = 45_000;
    static final long MAX_IDENTIFY_MS = 30_000;

    private PrinterDiscovery() {}

    // ---------------------------------------------------------------- tipler

    /** Cihazın bağlı olduğu yerel IPv4 ağı (adres + önek). */
    static final class Network {
        final String address;
        final int prefix;
        /** "wifi" | "ethernet" | "other" — yalnız ekranda gösterilir. */
        final String transport;

        Network(String address, int prefix, String transport) {
            this.address = address;
            this.prefix = prefix;
            this.transport = transport;
        }
    }

    /** Taranan portlar; testler geçici portlarla değiştirir. */
    static final class Ports {
        static final Ports DEFAULT = new Ports(9100, PrinterClient.EPSON_TLS_PORT, PrinterClient.EPOS_HTTPS_PORT, PrinterClient.EPOS_HTTP_PORT);

        final int raw;
        final int tls;
        final int eposHttps;
        final int eposHttp;

        Ports(int raw, int tls, int eposHttps, int eposHttp) {
            this.raw = raw;
            this.tls = tls;
            this.eposHttps = eposHttps;
            this.eposHttp = eposHttp;
        }

        int[] all() {
            return new int[] { raw, tls, eposHttps, eposHttp };
        }
    }

    static final class Found {
        final String host;
        final int port;
        /** {@link #KIND_ESCPOS} | {@link #KIND_EPSON_SECURE} | {@link #KIND_EPSON_EPOS} | {@link #KIND_OPEN}. */
        final String kind;
        /** Protokol cevabıyla doğrulandı (fiş yazıcısı olduğu kesin). */
        final boolean confirmed;
        /** Son okunan durum baytları (onaltılık) ya da null. */
        final String status;
        final String message;

        Found(String host, int port, String kind, boolean confirmed, String status, String message) {
            this.host = host;
            this.port = port;
            this.kind = kind;
            this.confirmed = confirmed;
            this.status = status;
            this.message = message;
        }
    }

    static final class Result {
        final List<Found> printers;
        /** Taranan adres sayısı. */
        final int scanned;
        final long durationMs;

        Result(List<Found> printers, int scanned, long durationMs) {
            this.printers = printers;
            this.scanned = scanned;
            this.durationMs = durationMs;
        }
    }

    // ---------------------------------------------------------------- adres hesapları

    private static final Pattern IPV4 = Pattern.compile("^(\\d{1,3})\\.(\\d{1,3})\\.(\\d{1,3})\\.(\\d{1,3})$");

    /** IPv4 metni → 32 bit (işaretsiz, long). Geçersizse -1. */
    static long ipToLong(String ip) {
        if (ip == null) return -1;
        Matcher m = IPV4.matcher(ip.trim());
        if (!m.matches()) return -1;
        long n = 0;
        for (int i = 1; i <= 4; i++) {
            int o = Integer.parseInt(m.group(i));
            if (o > 255) return -1;
            n = (n << 8) | o;
        }
        return n;
    }

    static String longToIp(long n) {
        return ((n >> 24) & 255) + "." + ((n >> 16) & 255) + "." + ((n >> 8) & 255) + "." + (n & 255);
    }

    static boolean isIpv4(String host) {
        return ipToLong(host) >= 0;
    }

    /** discover.ts `scanTargets`: ağ, yayın ve cihazın kendi adresi hariç taranacak adresler. */
    static List<String> scanTargets(String address, int prefix, int maxHosts) {
        long self = ipToLong(address);
        if (self < 0 || prefix < 1 || prefix > 30) return Collections.emptyList();
        int effective = prefix;
        if ((1L << (32 - prefix)) - 2 > maxHosts) effective = 24; // çok geniş ağ → yalnız kendi /24'ü
        long mask = (0xffffffffL << (32 - effective)) & 0xffffffffL;
        long network = self & mask;
        long broadcast = network | (~mask & 0xffffffffL);
        List<String> out = new ArrayList<>();
        for (long n = network + 1; n < broadcast; n++) {
            if (n != self) out.add(longToIp(n));
        }
        return out;
    }

    /** `host`, `address/prefix` ağının içinde mi (ikisi de IPv4 metni). */
    static boolean inSubnet(String host, String address, int prefix) {
        long h = ipToLong(host), a = ipToLong(address);
        if (h < 0 || a < 0 || prefix < 0 || prefix > 32) return false;
        long mask = prefix == 0 ? 0 : (0xffffffffL << (32 - prefix)) & 0xffffffffL;
        return (h & mask) == (a & mask);
    }

    // ---------------------------------------------------------------- tarama

    static Result discover(List<Network> networks, List<String> extraHosts) {
        return discover(networks, extraHosts, Ports.DEFAULT, DEFAULT_CONNECT_MS, DEFAULT_CONCURRENCY);
    }

    /**
     * Ağ taraması + kimlik. Asla fırlatmaz (bireysel bağlantı hataları "kapalı" sayılır). Çağıran
     * {@link PrinterClient#LOCK} kilidini almalıdır: tarama sürerken istasyon baskısı yazıcıya
     * bağlanmasın (yazıcı tek oturum kabul eder).
     */
    static Result discover(List<Network> networks, List<String> extraHosts, Ports ports, int connectMs, int concurrency) {
        long started = System.currentTimeMillis();
        Set<String> hostSet = new LinkedHashSet<>();
        if (extraHosts != null) {
            for (String h : extraHosts) {
                if (h != null && !h.trim().isEmpty()) hostSet.add(h.trim());
            }
        }
        if (networks != null) {
            for (Network n : networks) hostSet.addAll(scanTargets(n.address, n.prefix, MAX_HOSTS_PER_NETWORK));
        }
        List<String> hosts = new ArrayList<>(hostSet);
        if (hosts.isEmpty()) return new Result(Collections.emptyList(), 0, System.currentTimeMillis() - started);

        // 1) kapı taraması
        int[] portList = ports.all();
        Set<String> open = ConcurrentHashMap.newKeySet();
        ExecutorService pool = Executors.newFixedThreadPool(Math.max(1, Math.min(concurrency, hosts.size() * portList.length)), r -> {
            Thread t = new Thread(r, "ramos-discover");
            t.setDaemon(true);
            return t;
        });
        for (String host : hosts) {
            for (int port : portList) {
                pool.execute(() -> {
                    if (isOpen(host, port, connectMs)) open.add(key(host, port));
                });
            }
        }
        pool.shutdown();
        try {
            if (!pool.awaitTermination(MAX_SCAN_MS, TimeUnit.MILLISECONDS)) pool.shutdownNow();
        } catch (InterruptedException e) {
            pool.shutdownNow();
            Thread.currentThread().interrupt();
        }

        // 2) kimlik — adresler paralel, adres içinde sırayla
        List<String> candidates = new ArrayList<>();
        for (String host : hosts) {
            for (int port : portList) {
                if (open.contains(key(host, port))) {
                    candidates.add(host);
                    break;
                }
            }
        }
        List<Found> found = new ArrayList<>();
        if (!candidates.isEmpty()) {
            ExecutorService ident = Executors.newFixedThreadPool(Math.min(8, candidates.size()), r -> {
                Thread t = new Thread(r, "ramos-identify");
                t.setDaemon(true);
                return t;
            });
            List<Future<List<Found>>> futures = new ArrayList<>();
            for (String host : candidates) futures.add(ident.submit(() -> identify(host, open, ports)));
            ident.shutdown();
            long deadline = System.currentTimeMillis() + MAX_IDENTIFY_MS;
            for (Future<List<Found>> f : futures) {
                try {
                    found.addAll(f.get(Math.max(1, deadline - System.currentTimeMillis()), TimeUnit.MILLISECONDS));
                } catch (Exception e) {
                    // zaman aşımı / kesinti: bu adres atlanır
                }
            }
            ident.shutdownNow();
        }

        Collections.sort(found, (a, b) -> {
            int r = Integer.compare(rank(a), rank(b));
            if (r != 0) return r;
            long ia = ipToLong(a.host), ib = ipToLong(b.host);
            if (ia != ib) return Long.compare(ia < 0 ? Long.MAX_VALUE : ia, ib < 0 ? Long.MAX_VALUE : ib);
            return Integer.compare(a.port, b.port);
        });
        return new Result(found, hosts.size(), System.currentTimeMillis() - started);
    }

    private static int rank(Found f) {
        if (!f.confirmed) return 3;
        switch (f.kind) {
            case KIND_EPSON_EPOS:
                return 0;
            case KIND_EPSON_SECURE:
                return 1;
            default:
                return 2;
        }
    }

    private static String key(String host, int port) {
        return host + ":" + port;
    }

    /** Yalnız TCP bağlantısı kurulabiliyor mu (veri göndermeden). Asla fırlatmaz. */
    static boolean isOpen(String host, int port, int connectMs) {
        Socket s = new Socket();
        try {
            PrinterClient.bindSocket(s, host);
            s.connect(new InetSocketAddress(host, port), connectMs);
            return true;
        } catch (Throwable t) {
            return false;
        } finally {
            PrinterClient.closeQuietly(s);
        }
    }

    /** Açık portları olan tek adresin kimliği (sırayla: ePOS 443 → 80 → 9143 → 9100). */
    static List<Found> identify(String host, Set<String> open, Ports ports) {
        List<Found> out = new ArrayList<>();
        boolean https = open.contains(key(host, ports.eposHttps));
        boolean http = open.contains(key(host, ports.eposHttp));
        boolean tls = open.contains(key(host, ports.tls));
        boolean raw = open.contains(key(host, ports.raw));

        boolean epos = false;
        if (https) {
            PrinterClient.StatusResult r = PrinterClient.statusEpos(host, ports.eposHttps, true, STATUS_TIMEOUT_MS);
            if (r.reachable) {
                out.add(new Found(host, ports.eposHttps, KIND_EPSON_EPOS, true, r.status, r.message));
                epos = true;
            }
        }
        if (!epos && http) {
            PrinterClient.StatusResult r = PrinterClient.statusEpos(host, ports.eposHttp, false, STATUS_TIMEOUT_MS);
            if (r.reachable) out.add(new Found(host, ports.eposHttp, KIND_EPSON_EPOS, true, r.status, r.message));
        }

        boolean secure = false;
        if (tls) {
            PrinterClient.StatusResult r = PrinterClient.statusRaw(host, ports.tls, true, STATUS_TIMEOUT_MS);
            if (r.reachable && PrinterClient.looksLikeEscPos(PrinterClient.unhex(r.status))) {
                out.add(new Found(host, ports.tls, KIND_EPSON_SECURE, true, r.status, null));
                secure = true;
            }
        }
        if (raw && !secure) {
            PrinterClient.StatusResult r = PrinterClient.statusRaw(host, ports.raw, false, STATUS_TIMEOUT_MS);
            if (r.reachable) {
                boolean esc = PrinterClient.looksLikeEscPos(PrinterClient.unhex(r.status));
                out.add(new Found(host, ports.raw, esc ? KIND_ESCPOS : KIND_OPEN, esc, r.status, esc ? null : r.message));
            }
        }
        if (tls && !secure && !raw) {
            // 9143 açık, TLS'le durum cevabı yok: yine de aday (deneme fişiyle doğrulanabilir) — discover.ts.
            out.add(new Found(host, ports.tls, KIND_OPEN, false, null, String.format(Locale.ROOT, "port %d açık, durum cevabı yok", ports.tls)));
        }
        return out;
    }
}
