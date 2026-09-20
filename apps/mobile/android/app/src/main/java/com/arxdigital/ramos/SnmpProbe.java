package com.arxdigital.ramos;

import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.InetAddress;
import java.net.SocketTimeoutException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * SNMP v1 yayın sorgusu (sysDescr + sysName, topluluk "public") — ağdaki yazıcıları TCP taramasından
 * bağımsız, tek paketle bulur. Epson TM (EpsonNet), Star, Bixolon ve çoğu ağ yazıcısı SNMP'ye cevap verir;
 * Wi-Fi'da uyuyan yazıcı da cevap verir çünkü yayın paketini erişim noktası tamponlayıp uyanınca teslim eder
 * (TCP taramasının 1 saniyelik bağlantı sınırına takılan yazıcı için asıl güvence bu). Saf Java; paket BER ile
 * elle kodlanır, yanıttan yalnız OCTET STRING değerleri okunur (community, sysDescr, sysName sırasıyla).
 *
 * Cevap veren her adres bir "ipucu" olur: {@link PrinterDiscovery} ipuçlu adresleri uzun zaman aşımıyla
 * doğrudan sorgular ve cihaz adını (ör. "EPSON TM-m30III") sonuca yazar.
 */
final class SnmpProbe {

    static final int PORT = 161;
    static final String COMMUNITY = "public";
    static final int DEFAULT_WAIT_MS = 1500;

    private static final byte[] OID_SYS_DESCR = { 0x2b, 6, 1, 2, 1, 1, 1, 0 };
    private static final byte[] OID_SYS_NAME = { 0x2b, 6, 1, 2, 1, 1, 5, 0 };
    private static final int MAX_TEXT = 120;

    private SnmpProbe() {}

    // ---------------------------------------------------------------- BER

    static byte[] tlv(int type, byte[] value) {
        byte[] len;
        int n = value.length;
        if (n < 128) len = new byte[] { (byte) n };
        else if (n < 256) len = new byte[] { (byte) 0x81, (byte) n };
        else len = new byte[] { (byte) 0x82, (byte) (n >> 8), (byte) n };
        byte[] out = new byte[1 + len.length + n];
        out[0] = (byte) type;
        System.arraycopy(len, 0, out, 1, len.length);
        System.arraycopy(value, 0, out, 1 + len.length, n);
        return out;
    }

    static byte[] intTlv(int v) {
        // En kısa ikiye tümleyen gösterim (pozitif değerlerde başa 0 gerekebilir).
        byte[] full = { (byte) (v >> 24), (byte) (v >> 16), (byte) (v >> 8), (byte) v };
        int start = 0;
        while (start < 3 && full[start] == 0 && (full[start + 1] & 0x80) == 0) start++;
        return tlv(0x02, Arrays.copyOfRange(full, start, 4));
    }

    static byte[] concat(byte[]... parts) {
        int n = 0;
        for (byte[] p : parts) n += p.length;
        byte[] out = new byte[n];
        int i = 0;
        for (byte[] p : parts) {
            System.arraycopy(p, 0, out, i, p.length);
            i += p.length;
        }
        return out;
    }

    /** GetRequest: version 1, community "public", sysDescr.0 + sysName.0. */
    static byte[] getRequest(int requestId) {
        byte[] nul = tlv(0x05, new byte[0]);
        byte[] vb1 = tlv(0x30, concat(tlv(0x06, OID_SYS_DESCR), nul));
        byte[] vb2 = tlv(0x30, concat(tlv(0x06, OID_SYS_NAME), nul));
        byte[] pdu = tlv(0xA0, concat(intTlv(requestId), intTlv(0), intTlv(0), tlv(0x30, concat(vb1, vb2))));
        return tlv(0x30, concat(intTlv(0), tlv(0x04, COMMUNITY.getBytes(StandardCharsets.US_ASCII)), pdu));
    }

    /** Yanıttaki OCTET STRING değerleri sırayla (ilk değer community). Bozuk paket → eldeki kadar. */
    static List<String> octetStrings(byte[] msg) {
        List<String> out = new ArrayList<>();
        walk(msg, 0, msg.length, out, 0);
        return out;
    }

    private static void walk(byte[] b, int off, int end, List<String> out, int depth) {
        int i = off;
        while (i < end && depth < 8) {
            int type = b[i++] & 0xff;
            if (i >= end) break;
            int len = b[i++] & 0xff;
            if ((len & 0x80) != 0) {
                int n = len & 0x7f;
                if (n > 3 || i + n > end) break;
                len = 0;
                for (int k = 0; k < n; k++) len = (len << 8) | (b[i++] & 0xff);
            }
            if (len < 0 || i + len > end) break;
            if (type == 0x04) out.add(clean(new String(b, i, len, StandardCharsets.UTF_8)));
            else if ((type & 0x20) != 0) walk(b, i, i + len, out, depth + 1); // SEQUENCE / PDU (constructed)
            i += len;
        }
    }

    private static String clean(String s) {
        StringBuilder sb = new StringBuilder();
        for (char c : s.toCharArray()) {
            if (c >= 32 && c != 127) sb.append(c);
            else sb.append(' ');
        }
        String t = sb.toString().trim().replaceAll("\\s+", " ");
        return t.length() > MAX_TEXT ? t.substring(0, MAX_TEXT) : t;
    }

    /** sysDescr ve (farklıysa) sysName: "EPSON TM-m30III · EPSONA1B2C3". Boşsa "". */
    static String describe(byte[] response) {
        List<String> s = octetStrings(response);
        String descr = s.size() > 1 ? s.get(1) : "";
        String name = s.size() > 2 ? s.get(2) : "";
        if (descr.isEmpty()) return name;
        if (name.isEmpty() || descr.toLowerCase(Locale.ROOT).contains(name.toLowerCase(Locale.ROOT))) return descr;
        return descr + " · " + name;
    }

    // ---------------------------------------------------------------- sorgu

    /** Taranan ağların yönlendirilmiş yayın adresleri + sınırlı yayın (255.255.255.255). */
    static List<InetAddress> broadcastTargets(List<PrinterDiscovery.Network> networks) {
        List<InetAddress> out = new ArrayList<>();
        try {
            out.add(InetAddress.getByName("255.255.255.255"));
        } catch (Exception ignored) {}
        if (networks == null) return out;
        for (PrinterDiscovery.Network n : networks) {
            long a = PrinterDiscovery.ipToLong(n.address);
            if (a < 0 || n.prefix < 1 || n.prefix > 30) continue;
            long mask = (0xffffffffL << (32 - n.prefix)) & 0xffffffffL;
            long broadcast = (a & mask) | (~mask & 0xffffffffL);
            try {
                out.add(InetAddress.getByName(PrinterDiscovery.longToIp(broadcast)));
            } catch (Exception ignored) {}
        }
        return out;
    }

    /**
     * Hedeflere (yayın ya da tek adres) iki kez sorar (t=0 ve t≈waitMs/3), waitMs boyunca cevapları toplar.
     * Dönüş: gönderen adres → açıklama (boş olabilir). Asla fırlatmaz.
     */
    static Map<String, String> query(List<InetAddress> targets, int port, int waitMs, boolean bindToLan) {
        Map<String, String> out = new LinkedHashMap<>();
        if (targets == null || targets.isEmpty()) return out;
        DatagramSocket sock = null;
        try {
            sock = new DatagramSocket();
            sock.setBroadcast(true);
            if (bindToLan) PrinterClient.bindDatagram(sock);
            int id = (int) (System.nanoTime() & 0x3fffffff) | 1;
            byte[] req = getRequest(id);
            long start = System.currentTimeMillis();
            long deadline = start + waitMs;
            send(sock, targets, port, req);
            boolean resent = false;
            byte[] buf = new byte[2048];
            while (true) {
                long left = deadline - System.currentTimeMillis();
                if (left <= 0) break;
                if (!resent && left < waitMs * 2L / 3) {
                    send(sock, targets, port, req);
                    resent = true;
                }
                sock.setSoTimeout((int) Math.max(50, Math.min(left, 250)));
                DatagramPacket p = new DatagramPacket(buf, buf.length);
                try {
                    sock.receive(p);
                } catch (SocketTimeoutException e) {
                    continue;
                }
                String addr = p.getAddress() != null ? p.getAddress().getHostAddress() : null;
                if (addr == null || out.containsKey(addr)) continue;
                out.put(addr, describe(Arrays.copyOf(p.getData(), p.getLength())));
            }
        } catch (Throwable ignored) {
            // yayın kapalı / soket açılamadı: ipuçsuz devam
        } finally {
            if (sock != null) sock.close();
        }
        return out;
    }

    private static void send(DatagramSocket sock, List<InetAddress> targets, int port, byte[] req) {
        for (InetAddress t : targets) {
            try {
                sock.send(new DatagramPacket(req, req.length, t, port));
            } catch (Throwable ignored) {
                // bu hedefe gönderilemedi (ör. yayın izni yok)
            }
        }
    }
}
