package com.arxdigital.ramos;

import java.net.InetSocketAddress;
import java.net.Socket;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.Callable;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Yerel ağda fiş yazıcısı arama — apps/print-agent/src/discover.ts'in Android karşılığı (bilgisayarsız
 * kurulum: yazıcıyı telefon/tablet kendisi bulur). Saf Java (Android'e bağımlı değil; JVM testleri
 * {@code PrinterDiscoveryTest}). Ağ listesini, mDNS ipuçlarını ve soket bağlamayı {@link LanNetworks} verir.
 *
 * Üç kaynak, sonra kimlik:
 * <ol>
 * <li><b>Kapı taraması:</b> her adreste dört port paralel denenir (yalnız TCP bağlantısı): 9100 düz ham,
 *     9143 Epson şifreli ham, 443 / 80 Epson ePOS-Print. 254 adres × 4 port, 96 eşzamanlı, 1 sn → ≤ 11 sn.</li>
 * <li><b>İpuçları:</b> aynı anda SNMP yayını ({@link SnmpProbe}: sysDescr → cihaz adı) ve Bonjour/mDNS
 *     ({@code NsdProbe}, Android). Wi-Fi'da uyuyan yazıcı TCP taramasının 1 sn'lik sınırına takılabilir ama
 *     yayın paketine cevap verir. Kayıtlı adres de ipucu sayılır. İpuçlu adresler tarama sonucundan bağımsız,
 *     uzun zaman aşımıyla (3 sn) doğrudan sorgulanır.</li>
 * <li><b>Kimlik:</b> adres başına sırayla (yazıcı tek bağlantı kabul eder, R69). 443/80: ePOS durum belgesi;
 *     yalnız gerçek ePOS yanıtı yazıcı sayılır (modem/NAS elenir). 9143: TLS + DLE EOT, ESC/POS cevap →
 *     "epson_secure" (o zaman 9100 yok sayılır: Secure Printing açık Epson'da 9100 basmaz). 9100: DLE EOT;
 *     ESC/POS → "escpos" (doğrulanmış), bağlanıp cevapsız → "open" (aday). İpuçlu adres hiçbir protokole cevap
 *     vermezse ama adı yazıcıya benziyorsa yine aday olarak listelenir (deneme fişiyle doğrulanır).</li>
 * </ol>
 * Sonuç: doğrulanmışlar önce (ePOS &gt; Epson şifreli &gt; ESC/POS &gt; aday), sonra adres sırası.
 */
final class PrinterDiscovery {

    static final String KIND_ESCPOS = "escpos";
    static final String KIND_EPSON_SECURE = "epson_secure";
    static final String KIND_EPSON_EPOS = "epson_epos";
    static final String KIND_OPEN = "open";

    /** Kapı taraması bağlantı sınırı. Wi-Fi'da ilk ARP + bağlantı 500 ms'yi aşabiliyor; uyuyan yazıcı için ipuçları var. */
    static final int DEFAULT_CONNECT_MS = 1000;
    static final int DEFAULT_CONCURRENCY = 96;
    /** Tek ağdan taranacak en fazla adres: /22'den geniş ağlarda yalnız cihazın kendi /24'ü taranır. */
    static final int MAX_HOSTS_PER_NETWORK = 1022;
    /** Taramada açık bulunan porta kimlik sorusu (bağlantı + cevap). */
    static final int STATUS_TIMEOUT_MS = 2500;
    /** İpuçlu adres (SNMP / mDNS / kayıtlı): bağlantı 3 sn — Wi-Fi'da uyuyan yazıcı. */
    static final int HINT_TIMEOUT_MS = 3500;
    static final int DEFAULT_SNMP_WAIT_MS = SnmpProbe.DEFAULT_WAIT_MS;
    static final long MAX_SCAN_MS = 45_000;
    static final long MAX_IDENTIFY_MS = 40_000;
    static final long HINT_SOURCE_WAIT_MS = 6_000;

    static final Pattern PRINTER_NAME = Pattern.compile(
        "(?i)printer|drucker|yazıcı|epson|tm-?[a-z]?\\d|\\bstar\\b|xprinter|bixolon|citizen|zebra|\\bpos\\b|receipt|thermal|zjiang|gprinter|rongta|sewoo|brother|kyocera|ricoh|hp laserjet|canon"
    );

    /** Süreç genelinde tek tarama: Ayarlar'daki düğme ile istasyonun kendi araması çakışmasın. */
    private static final AtomicBoolean BUSY = new AtomicBoolean(false);

    private PrinterDiscovery() {}

    static boolean tryBegin() {
        return BUSY.compareAndSet(false, true);
    }

    static void end() {
        BUSY.set(false);
    }

    static boolean looksLikePrinter(String name) {
        return name != null && PRINTER_NAME.matcher(name).find();
    }

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
        /** SNMP sysDescr ya da mDNS hizmet adı (ör. "EPSON TM-m30III"); yoksa null. */
        final String name;

        Found(String host, int port, String kind, boolean confirmed, String status, String message, String name) {
            this.host = host;
            this.port = port;
            this.kind = kind;
            this.confirmed = confirmed;
            this.status = status;
            this.message = message;
            this.name = name == null || name.trim().isEmpty() ? null : name.trim();
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
        return discover(networks, extraHosts, null, Ports.DEFAULT, DEFAULT_CONNECT_MS, DEFAULT_CONCURRENCY, DEFAULT_SNMP_WAIT_MS);
    }

    /** Testler: ipucu kaynağı ve SNMP yayını yok. */
    static Result discover(List<Network> networks, List<String> extraHosts, Ports ports, int connectMs, int concurrency) {
        return discover(networks, extraHosts, null, ports, connectMs, concurrency, 0);
    }

    /**
     * Ağ taraması + ipuçları + kimlik. Asla fırlatmaz (bireysel bağlantı hataları "kapalı" sayılır). Çağıran
     * {@link PrinterClient#LOCK} kilidini almalı ve {@link #tryBegin()} ile tek taramayı sağlamalıdır.
     *
     * @param hintSource ek ipucu kaynağı (mDNS): adres → ad; taramayla paralel çalıştırılır, null olabilir
     * @param snmpWaitMs SNMP yayınının bekleme süresi; 0 → yayın yok
     */
    static Result discover(
        List<Network> networks,
        List<String> extraHosts,
        Callable<Map<String, String>> hintSource,
        Ports ports,
        int connectMs,
        int concurrency,
        int snmpWaitMs
    ) {
        long started = System.currentTimeMillis();
        Set<String> extras = new LinkedHashSet<>();
        if (extraHosts != null) {
            for (String h : extraHosts) {
                if (h != null && !h.trim().isEmpty()) extras.add(h.trim());
            }
        }
        Set<String> hostSet = new LinkedHashSet<>(extras);
        if (networks != null) {
            for (Network n : networks) hostSet.addAll(scanTargets(n.address, n.prefix, MAX_HOSTS_PER_NETWORK));
        }
        List<String> hosts = new ArrayList<>(hostSet);

        // İpucu kaynakları taramayla paralel.
        ExecutorService side = Executors.newFixedThreadPool(2, daemon("ramos-discover-hints"));
        Future<Map<String, String>> snmpFuture = null;
        Future<Map<String, String>> hintFuture = null;
        if (snmpWaitMs > 0 && networks != null && !networks.isEmpty()) {
            final int wait = snmpWaitMs;
            final List<Network> nets = networks;
            snmpFuture = side.submit(() -> SnmpProbe.query(SnmpProbe.broadcastTargets(nets), SnmpProbe.PORT, wait, true));
        }
        if (hintSource != null) hintFuture = side.submit(hintSource);
        side.shutdown();

        // 1) kapı taraması
        int[] portList = ports.all();
        Set<String> open = ConcurrentHashMap.newKeySet();
        if (!hosts.isEmpty()) {
            ExecutorService pool = Executors.newFixedThreadPool(
                Math.max(1, Math.min(concurrency, hosts.size() * portList.length)), daemon("ramos-discover"));
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
        }

        // 2) ipuçları: kayıtlı adres(ler) + mDNS + SNMP (adres → ad)
        Map<String, String> hints = new LinkedHashMap<>();
        for (String h : extras) hints.put(h, null);
        merge(hints, hintFuture, HINT_SOURCE_WAIT_MS);
        merge(hints, snmpFuture, snmpWaitMs + 2000L);

        // 3) kimlik — adresler paralel, adres içinde sırayla
        Set<String> candidates = new LinkedHashSet<>(hints.keySet());
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
            ExecutorService ident = Executors.newFixedThreadPool(Math.min(8, candidates.size()), daemon("ramos-identify"));
            List<Future<List<Found>>> futures = new ArrayList<>();
            for (final String host : candidates) {
                final boolean hinted = hints.containsKey(host);
                final String name = hints.get(host);
                futures.add(ident.submit(() -> hinted ? identifyHinted(host, name, open, ports) : identify(host, open, ports)));
            }
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

    private static java.util.concurrent.ThreadFactory daemon(String name) {
        return r -> {
            Thread t = new Thread(r, name);
            t.setDaemon(true);
            return t;
        };
    }

    private static void merge(Map<String, String> hints, Future<Map<String, String>> f, long waitMs) {
        if (f == null) return;
        Map<String, String> m;
        try {
            m = f.get(Math.max(1, waitMs), TimeUnit.MILLISECONDS);
        } catch (Exception e) {
            f.cancel(true);
            return;
        }
        if (m == null) return;
        for (Map.Entry<String, String> e : m.entrySet()) {
            String host = e.getKey();
            if (host == null || !isIpv4(host)) continue;
            String name = e.getValue() == null || e.getValue().trim().isEmpty() ? null : e.getValue().trim();
            if (!hints.containsKey(host) || (hints.get(host) == null && name != null)) hints.put(host, name);
        }
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

    /** Taramada açık bulunan portlara kimlik sorusu. */
    static List<Found> identify(String host, Set<String> open, Ports ports) {
        return identifyWith(
            host, ports, STATUS_TIMEOUT_MS, null,
            open.contains(key(host, ports.eposHttps)), open.contains(key(host, ports.eposHttp)),
            open.contains(key(host, ports.tls)), open.contains(key(host, ports.raw)), true
        );
    }

    /**
     * İpuçlu adres (SNMP / mDNS / kayıtlı): dört port da uzun zaman aşımıyla doğrudan sorgulanır — tarama
     * "kapalı" demiş olsa da (uyuyan Wi-Fi yazıcısı). Hiçbir protokol cevabı yoksa ama adı yazıcıya
     * benziyorsa ya da bir portu açıksa aday olarak listelenir.
     */
    static List<Found> identifyHinted(String host, String name, Set<String> open, Ports ports) {
        List<Found> out = identifyWith(host, ports, HINT_TIMEOUT_MS, name, true, true, true, true, false);
        if (!out.isEmpty()) return out;
        // Yazıcıya özgü port (9100 / 9143) açıksa ya da adı yazıcıya benziyorsa aday; yalnız 443/80 açık olan
        // adsız cihaz (modem, NAS) aday değildir.
        boolean raw = open.contains(key(host, ports.raw)), tls = open.contains(key(host, ports.tls));
        boolean https = open.contains(key(host, ports.eposHttps)), http = open.contains(key(host, ports.eposHttp));
        boolean printerPort = raw || tls;
        if (!printerPort && !looksLikePrinter(name)) return out;
        int port = raw ? ports.raw : tls ? ports.tls : https ? ports.eposHttps : http ? ports.eposHttp : ports.raw;
        String msg = printerPort || https || http
            ? String.format(Locale.ROOT, "port %d açık, durum cevabı yok", port)
            : "ağda görüldü (SNMP/Bonjour), yazıcı portları cevap vermedi";
        out.add(new Found(host, port, KIND_OPEN, false, null, msg, name));
        return out;
    }

    /**
     * Ortak kimlik akışı: ePOS 443 → 80 → 9143 (TLS + DLE EOT) → 9100 (DLE EOT). `candidateOnSilentTls`:
     * tarama yolunda 9143 açık ama cevapsız ve 9100 kapalıysa aday (discover.ts kuralı).
     */
    private static List<Found> identifyWith(
        String host, Ports ports, int timeoutMs, String name,
        boolean https, boolean http, boolean tls, boolean raw, boolean candidateOnSilentTls
    ) {
        List<Found> out = new ArrayList<>();
        boolean epos = false;
        if (https) {
            PrinterClient.StatusResult r = PrinterClient.statusEpos(host, ports.eposHttps, true, timeoutMs);
            if (r.reachable) {
                out.add(new Found(host, ports.eposHttps, KIND_EPSON_EPOS, true, r.status, r.message, name));
                epos = true;
            }
        }
        if (!epos && http) {
            PrinterClient.StatusResult r = PrinterClient.statusEpos(host, ports.eposHttp, false, timeoutMs);
            if (r.reachable) out.add(new Found(host, ports.eposHttp, KIND_EPSON_EPOS, true, r.status, r.message, name));
        }

        boolean secure = false;
        boolean tlsAnswered = false;
        if (tls) {
            PrinterClient.StatusResult r = PrinterClient.statusRaw(host, ports.tls, true, timeoutMs);
            tlsAnswered = r.reachable;
            if (r.reachable && PrinterClient.looksLikeEscPos(PrinterClient.unhex(r.status))) {
                out.add(new Found(host, ports.tls, KIND_EPSON_SECURE, true, r.status, null, name));
                secure = true;
            }
        }
        boolean rawReachable = false;
        if (raw && !secure) {
            PrinterClient.StatusResult r = PrinterClient.statusRaw(host, ports.raw, false, timeoutMs);
            rawReachable = r.reachable;
            if (r.reachable) {
                boolean esc = PrinterClient.looksLikeEscPos(PrinterClient.unhex(r.status));
                out.add(new Found(host, ports.raw, esc ? KIND_ESCPOS : KIND_OPEN, esc, r.status, esc ? null : r.message, name));
            }
        }
        if (candidateOnSilentTls && tlsAnswered && !secure && !rawReachable) {
            // 9143 açık, TLS'le durum cevabı yok: yine de aday (deneme fişiyle doğrulanabilir) — discover.ts.
            out.add(new Found(host, ports.tls, KIND_OPEN, false, null, String.format(Locale.ROOT, "port %d açık, durum cevabı yok", ports.tls), name));
        }
        return out;
    }
}
