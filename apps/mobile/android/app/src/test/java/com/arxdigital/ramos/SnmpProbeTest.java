package com.arxdigital.ramos;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.InetAddress;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import org.junit.Test;

/** Saf JVM: BER kodlama/çözme ve sahte SNMP cihazıyla (yerel UDP) sorgu. */
public class SnmpProbeTest {

    /** GetResponse: version 1, community, requestId, iki OCTET STRING varbind (sysDescr, sysName). */
    private static byte[] response(int requestId, String descr, String name) {
        byte[] vb1 = SnmpProbe.tlv(0x30, SnmpProbe.concat(SnmpProbe.tlv(0x06, new byte[] { 0x2b, 6, 1, 2, 1, 1, 1, 0 }),
            SnmpProbe.tlv(0x04, descr.getBytes(StandardCharsets.UTF_8))));
        byte[] vb2 = SnmpProbe.tlv(0x30, SnmpProbe.concat(SnmpProbe.tlv(0x06, new byte[] { 0x2b, 6, 1, 2, 1, 1, 5, 0 }),
            SnmpProbe.tlv(0x04, name.getBytes(StandardCharsets.UTF_8))));
        byte[] pdu = SnmpProbe.tlv(0xA2, SnmpProbe.concat(SnmpProbe.intTlv(requestId), SnmpProbe.intTlv(0), SnmpProbe.intTlv(0),
            SnmpProbe.tlv(0x30, SnmpProbe.concat(vb1, vb2))));
        return SnmpProbe.tlv(0x30, SnmpProbe.concat(SnmpProbe.intTlv(0), SnmpProbe.tlv(0x04, "public".getBytes(StandardCharsets.US_ASCII)), pdu));
    }

    @Test
    public void tlv_encodesShortAndLongLengths() {
        assertArrayEquals(new byte[] { 0x04, 0x02, 'a', 'b' }, SnmpProbe.tlv(0x04, new byte[] { 'a', 'b' }));
        byte[] big = SnmpProbe.tlv(0x04, new byte[200]);
        assertEquals((byte) 0x81, big[1]);
        assertEquals((byte) 200, big[2]);
        assertEquals(203, big.length);
        byte[] huge = SnmpProbe.tlv(0x04, new byte[300]);
        assertEquals((byte) 0x82, huge[1]);
        assertEquals(1, huge[2]);
        assertEquals(44, huge[3]);
    }

    @Test
    public void intTlv_isMinimalTwosComplement() {
        assertArrayEquals(new byte[] { 0x02, 0x01, 0x00 }, SnmpProbe.intTlv(0));
        assertArrayEquals(new byte[] { 0x02, 0x01, 0x7f }, SnmpProbe.intTlv(127));
        assertArrayEquals(new byte[] { 0x02, 0x02, 0x00, (byte) 0x80 }, SnmpProbe.intTlv(128));
        assertArrayEquals(new byte[] { 0x02, 0x02, 0x01, 0x00 }, SnmpProbe.intTlv(256));
    }

    @Test
    public void getRequest_hasVersionCommunityAndBothOids() {
        byte[] req = SnmpProbe.getRequest(0x1234);
        assertEquals(0x30, req[0] & 0xff);
        String hex = PrinterClient.hex(req);
        assertTrue(hex.startsWith("30")); // SEQUENCE
        assertTrue(hex.contains("020100")); // version 1
        assertTrue(hex.contains("04067075626c6963")); // "public"
        assertTrue(hex.contains("a0")); // GetRequest PDU
        assertTrue(hex.contains("06082b060102010101000500")); // sysDescr.0 + NULL
        assertTrue(hex.contains("06082b060102010105000500")); // sysName.0 + NULL
        assertTrue(hex.contains("02021234")); // request id
        List<String> strings = SnmpProbe.octetStrings(req);
        assertEquals(Collections.singletonList("public"), strings);
    }

    @Test
    public void describe_joinsDescrAndName_andToleratesGarbage() {
        assertEquals("EPSON TM-m30III · EPSONA1B2C3", SnmpProbe.describe(response(7, "EPSON TM-m30III", "EPSONA1B2C3")));
        assertEquals("EPSON TM-m30III", SnmpProbe.describe(response(7, "EPSON TM-m30III", "TM-m30III")));
        assertEquals("Xprinter", SnmpProbe.describe(response(7, "", "Xprinter")));
        assertEquals("", SnmpProbe.describe(new byte[] { 0x30, 0x05, 0x02, 0x01, 0x00 }));
        assertEquals("", SnmpProbe.describe(new byte[0]));
        assertEquals("", SnmpProbe.describe(new byte[] { 0x30, (byte) 0x84, 1, 2, 3, 4 })); // bozuk uzunluk
        // Kontrol karakterleri temizlenir, uzunluk sınırlanır
        char[] longName = new char[200];
        Arrays.fill(longName, 'x');
        String d = SnmpProbe.describe(response(1, "ab\n\nc", new String(longName)));
        assertTrue(d.startsWith("a b c · "));
        assertTrue(d.length() <= 8 + 120);
    }

    @Test
    public void query_collectsRepliesFromFakeDevice() throws Exception {
        try (DatagramSocket device = new DatagramSocket(0, InetAddress.getByName("127.0.0.1"))) {
            device.setSoTimeout(3000);
            Thread t = new Thread(() -> {
                try {
                    byte[] buf = new byte[1024];
                    DatagramPacket p = new DatagramPacket(buf, buf.length);
                    device.receive(p);
                    byte[] reply = response(1, "EPSON TM-m30III", "EPSONA1B2C3");
                    device.send(new DatagramPacket(reply, reply.length, p.getAddress(), p.getPort()));
                } catch (Exception ignored) {}
            });
            t.setDaemon(true);
            t.start();
            Map<String, String> found = SnmpProbe.query(
                Collections.singletonList(InetAddress.getByName("127.0.0.1")), device.getLocalPort(), 700, false);
            assertEquals(1, found.size());
            assertEquals("EPSON TM-m30III · EPSONA1B2C3", found.get("127.0.0.1"));
        }
    }

    @Test
    public void query_noDevice_returnsEmptyWithinWait() throws Exception {
        int closed;
        try (DatagramSocket s = new DatagramSocket(0, InetAddress.getByName("127.0.0.1"))) {
            closed = s.getLocalPort();
        }
        long start = System.currentTimeMillis();
        Map<String, String> found = SnmpProbe.query(Collections.singletonList(InetAddress.getByName("127.0.0.1")), closed, 400, false);
        assertTrue(found.isEmpty());
        assertTrue(System.currentTimeMillis() - start < 3000);
        assertTrue(SnmpProbe.query(Collections.emptyList(), 161, 400, false).isEmpty());
    }

    @Test
    public void broadcastTargets_includesLimitedAndDirected() {
        List<InetAddress> t = SnmpProbe.broadcastTargets(Arrays.asList(
            new PrinterDiscovery.Network("192.168.2.176", 24, "wifi"),
            new PrinterDiscovery.Network("10.0.0.5", 22, "ethernet"),
            new PrinterDiscovery.Network("bad", 24, "wifi")));
        assertEquals(3, t.size());
        assertEquals("255.255.255.255", t.get(0).getHostAddress());
        assertEquals("192.168.2.255", t.get(1).getHostAddress());
        assertEquals("10.0.3.255", t.get(2).getHostAddress());
    }
}
