package com.arxdigital.ramos;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import org.junit.Test;

/**
 * Saf JVM testleri (Android gerekmez): `gradlew testReleaseUnitTest`. Sahte yazıcılar yerel ServerSocket'lerdir;
 * tarama 127.0.0.1'i "bilinen adres" olarak, portları test portlarıyla değiştirerek çalışır. Adres hesapları
 * apps/print-agent discover.test.ts ile aynı örnekleri kullanır.
 */
public class PrinterDiscoveryTest {

    private static final String NS = "http://www.epson-pos.com/schemas/2011/03/epos-print";

    /** Tek bağlantı başına: isteği okur, `reply` yazar (null → sessiz), kapatır. Sınırsız bağlantı kabul eder. */
    private static final class FakeServer implements AutoCloseable {
        final ServerSocket server;
        final Thread thread;

        FakeServer(byte[] reply, boolean http) throws IOException {
            server = new ServerSocket(0);
            thread = new Thread(() -> {
                while (!server.isClosed()) {
                    try (Socket c = server.accept()) {
                        c.setSoTimeout(1500);
                        InputStream in = c.getInputStream();
                        ByteArrayOutputStream got = new ByteArrayOutputStream();
                        byte[] buf = new byte[4096];
                        if (http) {
                            int headerEnd = -1, expected = 0;
                            while (true) {
                                int n = in.read(buf);
                                if (n < 0) break;
                                got.write(buf, 0, n);
                                String text = new String(got.toByteArray(), StandardCharsets.UTF_8);
                                if (headerEnd < 0) {
                                    int i = text.indexOf("\r\n\r\n");
                                    if (i >= 0) {
                                        headerEnd = i + 4;
                                        for (String line : text.substring(0, i).split("\r\n")) {
                                            if (line.toLowerCase().startsWith("content-length:")) expected = Integer.parseInt(line.substring(15).trim());
                                        }
                                    }
                                }
                                if (headerEnd >= 0 && got.size() >= headerEnd + expected) break;
                            }
                        } else {
                            // ham: DLE EOT sorgusunun ilk baytlarını bekle (9 bayt), gelmezse zaman aşımı
                            try {
                                int n = in.read(buf);
                                got.write(buf, 0, Math.max(0, n));
                            } catch (IOException ignored) {}
                        }
                        if (reply != null) {
                            OutputStream out = c.getOutputStream();
                            out.write(reply);
                            out.flush();
                        }
                    } catch (IOException ignored) {
                        // kapandı ya da tek bağlantı hatası
                    }
                }
            });
            thread.setDaemon(true);
            thread.start();
        }

        int port() {
            return server.getLocalPort();
        }

        @Override
        public void close() throws IOException {
            server.close();
        }
    }

    private static byte[] eposOk() {
        String body = "<?xml version=\"1.0\" encoding=\"utf-8\"?><soapenv:Envelope xmlns:soapenv=\"http://schemas.xmlsoap.org/soap/envelope/\">"
            + "<soapenv:Body><response success=\"true\" code=\"\" status=\"251658262\" battery=\"0\" xmlns=\"" + NS + "\"/></soapenv:Body></soapenv:Envelope>";
        return http(200, body);
    }

    private static byte[] http(int status, String body) {
        byte[] b = body.getBytes(StandardCharsets.UTF_8);
        String head = "HTTP/1.1 " + status + (status == 200 ? " OK" : " Not Found") + "\r\nContent-Type: text/xml\r\nContent-Length: " + b.length + "\r\nConnection: close\r\n\r\n";
        byte[] h = head.getBytes(StandardCharsets.US_ASCII);
        byte[] out = new byte[h.length + b.length];
        System.arraycopy(h, 0, out, 0, h.length);
        System.arraycopy(b, 0, out, h.length, b.length);
        return out;
    }

    /** Kesinlikle kapalı bir port (ServerSocket açılıp hemen kapatılır). */
    private static int closedPort() throws IOException {
        try (ServerSocket s = new ServerSocket(0)) {
            return s.getLocalPort();
        }
    }

    private static final List<String> LOCALHOST = Collections.singletonList("127.0.0.1");

    // ---------------------------------------------------------------- adres hesapları

    @Test
    public void ipMath_roundTripsAndRejectsInvalid() {
        assertEquals(3232235777L, PrinterDiscovery.ipToLong("192.168.1.1"));
        assertEquals("192.168.1.1", PrinterDiscovery.longToIp(3232235777L));
        assertEquals(-1, PrinterDiscovery.ipToLong("192.168.1"));
        assertEquals(-1, PrinterDiscovery.ipToLong("192.168.1.256"));
        assertEquals(-1, PrinterDiscovery.ipToLong("yazici.local"));
        assertTrue(PrinterDiscovery.isIpv4("10.0.0.7"));
        assertFalse(PrinterDiscovery.isIpv4("epson"));
    }

    @Test
    public void scanTargets_slash24_excludesNetworkBroadcastAndSelf() {
        List<String> t = PrinterDiscovery.scanTargets("192.168.1.23", 24, PrinterDiscovery.MAX_HOSTS_PER_NETWORK);
        assertEquals(253, t.size());
        assertEquals("192.168.1.1", t.get(0));
        assertEquals("192.168.1.254", t.get(t.size() - 1));
        assertFalse(t.contains("192.168.1.23"));
        assertFalse(t.contains("192.168.1.0"));
        assertFalse(t.contains("192.168.1.255"));
    }

    @Test
    public void scanTargets_wideNetworkFallsBackToOwnSlash24_andTinyPrefixIsEmpty() {
        List<String> wide = PrinterDiscovery.scanTargets("10.20.30.40", 16, PrinterDiscovery.MAX_HOSTS_PER_NETWORK);
        assertEquals(253, wide.size());
        assertTrue(wide.get(0).startsWith("10.20.30."));
        assertEquals(1022 - 1, PrinterDiscovery.scanTargets("10.0.0.5", 22, PrinterDiscovery.MAX_HOSTS_PER_NETWORK).size());
        assertTrue(PrinterDiscovery.scanTargets("192.168.1.5", 31, 1022).isEmpty());
        assertTrue(PrinterDiscovery.scanTargets("bad", 24, 1022).isEmpty());
    }

    @Test
    public void inSubnet_matchesPrefix() {
        assertTrue(PrinterDiscovery.inSubnet("192.168.2.198", "192.168.2.17", 24));
        assertFalse(PrinterDiscovery.inSubnet("192.168.3.198", "192.168.2.17", 24));
        assertTrue(PrinterDiscovery.inSubnet("192.168.3.198", "192.168.2.17", 16));
        assertFalse(PrinterDiscovery.inSubnet("epson.local", "192.168.2.17", 24));
    }

    // ---------------------------------------------------------------- tarama

    @Test
    public void discover_findsEscposPrinterOnRawPort() throws Exception {
        try (FakeServer raw = new FakeServer(new byte[] { 0x12, 0x12, 0x12 }, false)) {
            PrinterDiscovery.Ports ports = new PrinterDiscovery.Ports(raw.port(), closedPort(), closedPort(), closedPort());
            PrinterDiscovery.Result r = PrinterDiscovery.discover(Collections.emptyList(), LOCALHOST, ports, 500, 8);
            assertEquals(1, r.scanned);
            assertEquals(1, r.printers.size());
            PrinterDiscovery.Found f = r.printers.get(0);
            assertEquals("127.0.0.1", f.host);
            assertEquals(raw.port(), f.port);
            assertEquals(PrinterDiscovery.KIND_ESCPOS, f.kind);
            assertTrue(f.confirmed);
            assertEquals("121212", f.status);
        }
    }

    @Test
    public void discover_openButSilentRawPortIsUnconfirmedCandidate() throws Exception {
        try (FakeServer silent = new FakeServer(null, false)) {
            PrinterDiscovery.Ports ports = new PrinterDiscovery.Ports(silent.port(), closedPort(), closedPort(), closedPort());
            PrinterDiscovery.Result r = PrinterDiscovery.discover(Collections.emptyList(), LOCALHOST, ports, 500, 8);
            assertEquals(1, r.printers.size());
            assertEquals(PrinterDiscovery.KIND_OPEN, r.printers.get(0).kind);
            assertFalse(r.printers.get(0).confirmed);
            assertNull(r.printers.get(0).status);
        }
    }

    @Test
    public void discover_findsEposPrinterOnHttpPort_andIgnoresNonEposWebServer() throws Exception {
        try (FakeServer epos = new FakeServer(eposOk(), true);
             FakeServer web = new FakeServer(http(404, "<html>router</html>"), true)) {
            // 80 = gerçek ePOS; ayrı bir "web sunucusu" da 80 gibi davranırsa elenmeli: ikinci taramada onu 80 yapıyoruz.
            PrinterDiscovery.Ports ports = new PrinterDiscovery.Ports(closedPort(), closedPort(), closedPort(), epos.port());
            PrinterDiscovery.Result r = PrinterDiscovery.discover(Collections.emptyList(), LOCALHOST, ports, 500, 8);
            assertEquals(1, r.printers.size());
            assertEquals(PrinterDiscovery.KIND_EPSON_EPOS, r.printers.get(0).kind);
            assertEquals(epos.port(), r.printers.get(0).port);
            assertTrue(r.printers.get(0).confirmed);
            assertEquals("121212", r.printers.get(0).status);

            PrinterDiscovery.Ports notEpos = new PrinterDiscovery.Ports(closedPort(), closedPort(), closedPort(), web.port());
            assertTrue(PrinterDiscovery.discover(Collections.emptyList(), LOCALHOST, notEpos, 500, 8).printers.isEmpty());
        }
    }

    @Test
    public void discover_ordersEposBeforeEscposAndKeepsBothPortsOfSameHost() throws Exception {
        try (FakeServer raw = new FakeServer(new byte[] { 0x12, 0x12, 0x12 }, false);
             FakeServer epos = new FakeServer(eposOk(), true)) {
            PrinterDiscovery.Ports ports = new PrinterDiscovery.Ports(raw.port(), closedPort(), closedPort(), epos.port());
            PrinterDiscovery.Result r = PrinterDiscovery.discover(Collections.emptyList(), LOCALHOST, ports, 500, 8);
            assertEquals(2, r.printers.size());
            assertEquals(PrinterDiscovery.KIND_EPSON_EPOS, r.printers.get(0).kind);
            assertEquals(PrinterDiscovery.KIND_ESCPOS, r.printers.get(1).kind);
        }
    }

    @Test
    public void discover_nothingOpen_returnsEmpty_andCountsHosts() throws Exception {
        PrinterDiscovery.Ports ports = new PrinterDiscovery.Ports(closedPort(), closedPort(), closedPort(), closedPort());
        PrinterDiscovery.Result r = PrinterDiscovery.discover(Collections.emptyList(), Arrays.asList("127.0.0.1", " ", null, "127.0.0.1"), ports, 300, 8);
        assertTrue(r.printers.isEmpty());
        assertEquals(1, r.scanned);
        assertTrue(r.durationMs >= 0);
        assertEquals(0, PrinterDiscovery.discover(Collections.emptyList(), Collections.emptyList(), ports, 300, 8).scanned);
    }

    @Test
    public void looksLikeEscPos_checksFixedBits() {
        assertTrue(PrinterClient.looksLikeEscPos(new byte[] { 0x12, 0x12, 0x12 }));
        assertTrue(PrinterClient.looksLikeEscPos(new byte[] { 0x1a, 0x16, 0x12 })); // çevrimdışı biti
        assertFalse(PrinterClient.looksLikeEscPos(new byte[] { 0x12, 0x12 }));
        assertFalse(PrinterClient.looksLikeEscPos(new byte[] { 0x48, 0x54, 0x54 })); // "HTT" — bir web sunucusu
        assertFalse(PrinterClient.looksLikeEscPos(null));
    }
}
