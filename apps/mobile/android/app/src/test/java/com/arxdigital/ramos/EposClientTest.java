package com.arxdigital.ramos;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.Test;

/**
 * Saf JVM testleri (Android gerekmez): `gradlew testReleaseUnitTest`. Sahte ePOS-Print yazıcısı yerel
 * bir ServerSocket'tir; istek biçimi ve yanıt ayrıştırması sınanır. Aynı kurallar apps/print-agent
 * epos.test.ts'te de sınanır.
 */
public class EposClientTest {

    private static final String NS = "http://www.epson-pos.com/schemas/2011/03/epos-print";

    private static String soap(String attrs) {
        return "<?xml version=\"1.0\" encoding=\"utf-8\"?><soapenv:Envelope xmlns:soapenv=\"http://schemas.xmlsoap.org/soap/envelope/\">"
            + "<soapenv:Body><response " + attrs + " xmlns=\"" + NS + "\"/></soapenv:Body></soapenv:Envelope>";
    }

    private static byte[] httpResponse(int status, String body, boolean contentLength) {
        byte[] b = body.getBytes(StandardCharsets.UTF_8);
        String head = "HTTP/1.1 " + status + (status == 200 ? " OK" : " Error") + "\r\nContent-Type: text/xml; charset=utf-8\r\n"
            + (contentLength ? "Content-Length: " + b.length + "\r\n" : "")
            + "Connection: close\r\n\r\n";
        byte[] h = head.getBytes(StandardCharsets.US_ASCII);
        byte[] out = new byte[h.length + b.length];
        System.arraycopy(h, 0, out, 0, h.length);
        System.arraycopy(b, 0, out, h.length, b.length);
        return out;
    }

    /** Tek istek kabul eden sahte yazıcı: isteği okur (Content-Length kadar), verilen yanıtı yazar. */
    private static final class FakePrinter implements AutoCloseable {
        final ServerSocket server;
        final AtomicReference<String> request = new AtomicReference<>();
        final Thread thread;

        FakePrinter(byte[] response, boolean closeAfter) throws IOException {
            server = new ServerSocket(0);
            thread = new Thread(() -> {
                try (Socket c = server.accept()) {
                    InputStream in = c.getInputStream();
                    ByteArrayOutputStream got = new ByteArrayOutputStream();
                    byte[] buf = new byte[4096];
                    int headerEnd = -1;
                    int expected = -1;
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
                    request.set(new String(got.toByteArray(), StandardCharsets.UTF_8));
                    if (response != null) {
                        OutputStream out = c.getOutputStream();
                        out.write(response);
                        out.flush();
                    }
                    if (!closeAfter) Thread.sleep(3000);
                } catch (Exception ignored) {}
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

    private static EposClient.Response call(FakePrinter p, byte[] escpos, int readTimeoutMs) throws IOException {
        try (Socket s = new Socket("127.0.0.1", p.port())) {
            return EposClient.exchange(s, "127.0.0.1", p.port(), EposClient.document(escpos), 3000, readTimeoutMs);
        }
    }

    @Test
    public void document_wrapsEscposAsHexCommand_emptyIsStatusQuery() {
        String doc = EposClient.document(new byte[] { 0x1b, 0x40, 0x41, 0x0a });
        assertTrue(doc.startsWith("<?xml version=\"1.0\" encoding=\"utf-8\"?><s:Envelope"));
        assertTrue(doc.contains("<epos-print xmlns=\"" + NS + "\"><command>1b40410a</command></epos-print>"));
        assertFalse(EposClient.document(new byte[0]).contains("<command>"));
    }

    @Test
    public void request_hasPathHeadersAndBody() {
        String req = new String(EposClient.request("192.168.2.198", 443, "<x/>", 8000), StandardCharsets.UTF_8);
        assertTrue(req.startsWith("POST /cgi-bin/epos/service.cgi?devid=local_printer&timeout=8000 HTTP/1.1\r\nHost: 192.168.2.198\r\n"));
        assertTrue(req.contains("Content-Type: text/xml; charset=utf-8\r\n"));
        assertTrue(req.contains("SOAPAction: \"\"\r\n"));
        assertTrue(req.contains("Content-Length: 4\r\n"));
        assertTrue(req.contains("Connection: close\r\n\r\n<x/>"));
        assertTrue(new String(EposClient.request("h", 8080, "", 1000), StandardCharsets.UTF_8).contains("Host: h:8080\r\n"));
    }

    @Test
    public void parse_readsSuccessCodeAndStatus() throws IOException {
        EposClient.Response r = EposClient.parse(httpResponse(200, soap("success=\"true\" code=\"\" status=\"251658262\" battery=\"0\""), true));
        assertEquals(200, r.httpStatus);
        assertTrue(r.success);
        assertEquals("", r.code);
        assertEquals(Long.valueOf(251658262L), r.asb);

        r = EposClient.parse(httpResponse(200, soap("code=\"EPTR_COVER_OPEN\" status=\"252641318\" success=\"false\""), false));
        assertFalse(r.success);
        assertEquals("EPTR_COVER_OPEN", r.code);
        assertEquals(Long.valueOf(252641318L), r.asb);

        r = EposClient.parse(httpResponse(404, "<html>not found</html>", true));
        assertFalse(r.success);
        assertEquals("http_404", r.code);
        assertNull(r.asb);
    }

    @Test
    public void parse_chunkedBody() throws IOException {
        String body = soap("success=\"true\" code=\"\" status=\"1\"");
        String chunked = "HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n"
            + Integer.toHexString(body.length()) + "\r\n" + body + "\r\n0\r\n\r\n";
        EposClient.Response r = EposClient.parse(chunked.getBytes(StandardCharsets.UTF_8));
        assertTrue(r.success);
        assertEquals(Long.valueOf(1L), r.asb);
    }

    @Test
    public void parse_rejectsNonEposBody() {
        try {
            EposClient.parse(httpResponse(200, "<html>login</html>", true));
            fail("IOException bekleniyordu");
        } catch (IOException e) {
            assertTrue(e.getMessage().contains("ePOS yanıtı yok"));
        }
    }

    @Test
    public void asbToStatus_mapsBits() {
        assertArrayEquals(new byte[] { 0x12, 0x12, 0x12 }, EposClient.asbToStatus(0x0f000016L));
        assertArrayEquals(new byte[] { 0x12, 0x16, 0x12 }, EposClient.asbToStatus(0x20L));
        assertArrayEquals(new byte[] { 0x12, 0x32, 0x72 }, EposClient.asbToStatus(0x80000L));
        assertArrayEquals(new byte[] { 0x12, 0x12, 0x1e }, EposClient.asbToStatus(0x20000L));
        assertArrayEquals(new byte[] { 0x1a, 0x52, 0x12 }, EposClient.asbToStatus(0x08L | 0x400L));
        assertEquals("paper_end", PrinterClient.blockingProblem(EposClient.asbToStatus(0x80000L)));
        assertEquals("cover_open", PrinterClient.blockingProblem(EposClient.asbToStatus(0x20L)));
        assertNull(PrinterClient.blockingProblem(EposClient.asbToStatus(0x0f000016L)));
    }

    @Test
    public void errorCode_mapping() {
        assertEquals("paper_end", EposClient.errorCode("EPTR_REC_EMPTY"));
        assertEquals("cover_open", EposClient.errorCode("EPTR_COVER_OPEN"));
        assertEquals("timeout", EposClient.errorCode("EX_TIMEOUT"));
        assertEquals("offline", EposClient.errorCode("DeviceNotFound"));
        assertEquals("io", EposClient.errorCode("EPTR_MECHANICAL"));
        assertEquals("io", EposClient.errorCode(null));
    }

    @Test
    public void exchange_sendsRequestAndParsesResponse() throws Exception {
        try (FakePrinter p = new FakePrinter(httpResponse(200, soap("success=\"true\" code=\"\" status=\"251658262\""), true), true)) {
            EposClient.Response r = call(p, new byte[] { 0x1b, 0x40, 0x48, 0x69 }, 2000);
            assertTrue(r.success);
            assertEquals(Long.valueOf(251658262L), r.asb);
            String req = p.request.get();
            assertTrue(req, req.startsWith("POST /cgi-bin/epos/service.cgi?devid=local_printer&timeout=3000 HTTP/1.1\r\n"));
            assertTrue(req, req.contains("<command>1b404869</command>"));
        }
    }

    @Test
    public void exchange_noContentLengthAndKeptOpen_stillParses() throws Exception {
        // Yazıcı Content-Length yazmaz ve bağlantıyı kapatmaz: gövde zaman aşımında elden geçirilir.
        try (FakePrinter p = new FakePrinter(httpResponse(200, soap("success=\"true\" status=\"7\""), false), false)) {
            EposClient.Response r = call(p, new byte[] { 1 }, 400);
            assertTrue(r.success);
            assertEquals(Long.valueOf(7L), r.asb);
        }
    }

    @Test
    public void exchange_noResponse_throwsNoResponse() throws Exception {
        try (FakePrinter p = new FakePrinter(null, false)) {
            try {
                call(p, new byte[] { 1 }, 300);
                fail("NoResponseException bekleniyordu");
            } catch (EposClient.NoResponseException expected) {
                assertTrue(expected.getMessage().contains("zaman aşımı"));
            }
        }
    }

    @Test
    public void sendEpos_mapsPrinterRefusalToErrorCode() throws Exception {
        try (FakePrinter p = new FakePrinter(httpResponse(200, soap("success=\"false\" code=\"EPTR_REC_EMPTY\" status=\"524288\""), true), true)) {
            PrinterClient.SendResult r = PrinterClient.sendEpos("127.0.0.1", p.port(), false, new byte[] { 1 }, 2000);
            assertFalse(r.ok);
            assertEquals("paper_end", r.error);
            assertEquals("epos: EPTR_REC_EMPTY", r.message);
            assertEquals("123272", r.status);
        }
    }

    @Test
    public void sendEpos_noResponseAfterSend_countsAsPrinted() throws Exception {
        try (FakePrinter p = new FakePrinter(null, false)) {
            PrinterClient.SendResult r = PrinterClient.sendEpos("127.0.0.1", p.port(), false, new byte[] { 1 }, 400);
            assertTrue(r.ok);
            assertNull(r.status);
        }
    }

    @Test
    public void statusEpos_reportsReachableWithStatusBytes() throws Exception {
        try (FakePrinter p = new FakePrinter(httpResponse(200, soap("success=\"false\" code=\"EPTR_COVER_OPEN\" status=\"32\""), true), true)) {
            PrinterClient.StatusResult r = PrinterClient.statusEpos("127.0.0.1", p.port(), false, 2000);
            assertTrue(r.reachable);
            assertEquals("121612", r.status);
            assertEquals("epos: EPTR_COVER_OPEN", r.message);
        }
        try (FakePrinter p = new FakePrinter(httpResponse(404, "nope", true), true)) {
            PrinterClient.StatusResult r = PrinterClient.statusEpos("127.0.0.1", p.port(), false, 2000);
            assertFalse(r.reachable);
            assertTrue(r.message.contains("HTTP 404"));
        }
    }

    @Test
    public void portRules() {
        assertTrue(PrinterClient.isEposPort(443));
        assertTrue(PrinterClient.isEposPort(80));
        assertFalse(PrinterClient.isEposPort(9100));
        assertFalse(PrinterClient.isEposPort(9143));
        assertTrue(PrinterClient.usesTls(9143));
        assertTrue(PrinterClient.usesTls(443));
        assertFalse(PrinterClient.usesTls(80));
        assertFalse(PrinterClient.usesTls(9100));
    }
}
