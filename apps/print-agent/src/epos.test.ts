import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import {
  asbToStatusBytes,
  eposDocument,
  eposErrorCode,
  eposPrint,
  eposRequest,
  eposStatus,
  isEposPort,
  parseEposResponse,
} from './epos';
import { PrinterError, printWithChecks, queryStatus } from './transport';

/** Sahte ePOS-Print sunucusu: gelen isteği kaydeder, verilen yanıtı döner. */
function fakePrinter(
  handler: (req: { url: string; method: string; headers: http.IncomingHttpHeaders; body: string }, res: http.ServerResponse) => void,
) {
  const requests: { url: string; method: string; headers: http.IncomingHttpHeaders; body: string }[] = [];
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (d: Buffer) => chunks.push(d));
    req.on('end', () => {
      const r = { url: req.url ?? '', method: req.method ?? '', headers: req.headers, body: Buffer.concat(chunks).toString('utf8') };
      requests.push(r);
      handler(r, res);
    });
  });
  return new Promise<{ port: number; requests: typeof requests; close: () => Promise<void> }>((resolve) => {
    server.listen(0, '127.0.0.1', () =>
      resolve({
        port: (server.address() as AddressInfo).port,
        requests,
        close: () => new Promise((r) => server.close(() => r())),
      }),
    );
  });
}

const soap = (attrs: string) =>
  `<?xml version="1.0" encoding="utf-8"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"><soapenv:Body><response ${attrs} xmlns="http://www.epson-pos.com/schemas/2011/03/epos-print"/></soapenv:Body></soapenv:Envelope>`;

const ok = (asb = 251658262) => soap(`success="true" code="" status="${asb}" battery="0"`);

let closers: (() => Promise<void>)[] = [];
afterEach(async () => {
  await Promise.all(closers.map((c) => c()));
  closers = [];
});

describe('ePOS-Print belge ve ayrıştırma', () => {
  it('port kuralı: 443 ve 80 ePOS, 9100/9143 değil', () => {
    expect(isEposPort(443)).toBe(true);
    expect(isEposPort(80)).toBe(true);
    expect(isEposPort(9100)).toBe(false);
    expect(isEposPort(9143)).toBe(false);
  });

  it('belge: SOAP zarfı + epos-print + onaltılık command; boş bayt → command yok (durum sorusu)', () => {
    const doc = eposDocument(Uint8Array.from([0x1b, 0x40, 0x41, 0x0a]));
    expect(doc).toContain('<epos-print xmlns="http://www.epson-pos.com/schemas/2011/03/epos-print">');
    expect(doc).toContain('<command>1b40410a</command>');
    expect(doc.startsWith('<?xml version="1.0" encoding="utf-8"?><s:Envelope')).toBe(true);
    expect(eposDocument(new Uint8Array())).not.toContain('<command>');
  });

  it('yanıt: success/code/status okunur; önek ve öznitelik sırası fark etmez; eleman yoksa null', () => {
    expect(parseEposResponse(ok())).toEqual({ success: true, code: '', asb: 251658262 });
    expect(parseEposResponse(soap('code="EPTR_COVER_OPEN" status="252641318" success="false"'))).toEqual({
      success: false,
      code: 'EPTR_COVER_OPEN',
      asb: 252641318,
    });
    expect(parseEposResponse('<html>404</html>')).toBeNull();
    expect(parseEposResponse(soap('success="true" status="abc"'))).toMatchObject({ asb: null });
  });

  it('ASB → DLE EOT baytları: normal / kapak açık / kağıt bitti / kağıt azaldı / çevrimdışı+hata', () => {
    expect([...asbToStatusBytes(0x0f000016)]).toEqual([0x12, 0x12, 0x12]);
    expect([...asbToStatusBytes(0x20)]).toEqual([0x12, 0x16, 0x12]);
    expect([...asbToStatusBytes(0x80000)]).toEqual([0x12, 0x32, 0x72]);
    expect([...asbToStatusBytes(0x20000)]).toEqual([0x12, 0x12, 0x1e]);
    expect([...asbToStatusBytes(0x08 | 0x400)]).toEqual([0x1a, 0x52, 0x12]);
  });

  it('hata kodu eşlemesi', () => {
    expect(eposErrorCode('EPTR_REC_EMPTY')).toBe('paper_end');
    expect(eposErrorCode('EPTR_COVER_OPEN')).toBe('cover_open');
    expect(eposErrorCode('EX_TIMEOUT')).toBe('timeout');
    expect(eposErrorCode('DeviceNotFound')).toBe('offline');
    expect(eposErrorCode('EPTR_MECHANICAL')).toBe('io');
    expect(eposErrorCode('')).toBe('io');
  });
});

describe('ePOS-Print ile baskı ve durum (sahte yazıcı)', () => {
  it('baskı: doğru yol, başlıklar ve gövde; başarı → yanıttaki durum', async () => {
    const p = await fakePrinter((_r, res) => {
      res.writeHead(200, { 'Content-Type': 'text/xml; charset=utf-8' });
      res.end(ok());
    });
    closers.push(p.close);
    const bytes = Uint8Array.from([0x1b, 0x40, 0x48, 0x69, 0x0a, 0x1d, 0x56, 0x42, 0x00]);
    const { before, after } = await eposPrint('127.0.0.1', p.port, bytes, { tls: false, timeoutMs: 5000 });
    expect(p.requests).toHaveLength(1);
    const req = p.requests[0]!;
    expect(req.method).toBe('POST');
    expect(req.url).toBe('/cgi-bin/epos/service.cgi?devid=local_printer&timeout=3000');
    expect(req.headers['content-type']).toBe('text/xml; charset=utf-8');
    expect(req.headers.soapaction).toBe('""');
    expect(req.body).toContain('<command>1b4048690a1d564200</command>');
    expect(before).toMatchObject({ known: true, offline: false, cover_open: false, paper_end: false });
    expect(after).toEqual(before);
  });

  it('yazıcı reddederse (kapak açık) PrinterError kodu ve mesajı ePOS kodunu taşır', async () => {
    const p = await fakePrinter((_r, res) => {
      res.writeHead(200, { 'Content-Type': 'text/xml' });
      res.end(soap('success="false" code="EPTR_COVER_OPEN" status="252641318"'));
    });
    closers.push(p.close);
    const err = await eposPrint('127.0.0.1', p.port, Uint8Array.from([1]), { tls: false }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PrinterError);
    expect((err as PrinterError).code).toBe('cover_open');
    expect((err as PrinterError).message).toBe('epos: EPTR_COVER_OPEN');
  });

  it('HTTP 404 (ePOS-Print kapalı / yanlış cihaz) → io hatası, açıklayıcı mesaj', async () => {
    const p = await fakePrinter((_r, res) => {
      res.writeHead(404);
      res.end('not found');
    });
    closers.push(p.close);
    const err = await eposPrint('127.0.0.1', p.port, Uint8Array.from([1]), { tls: false }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PrinterError);
    expect((err as PrinterError).code).toBe('io');
    expect((err as PrinterError).message).toMatch(/HTTP 404/);
  });

  it('200 ama ePOS yanıtı değil (HTML) → io hatası', async () => {
    const p = await fakePrinter((_r, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<html>login</html>');
    });
    closers.push(p.close);
    const err = await eposPrint('127.0.0.1', p.port, Uint8Array.from([1]), { tls: false }).catch((e: unknown) => e);
    expect((err as PrinterError).code).toBe('io');
    expect((err as PrinterError).message).toMatch(/ePOS yanıtı yok/);
  });

  it('istek gitti ama yanıt hiç gelmedi → basılmış sayılır, durum bilinmiyor (çift fiş olmasın)', async () => {
    const p = await fakePrinter(() => {
      /* hiç cevap verme */
    });
    closers.push(p.close);
    const { before, after } = await eposPrint('127.0.0.1', p.port, Uint8Array.from([1]), { tls: false, timeoutMs: 300 });
    expect(before.known).toBe(false);
    expect(after.known).toBe(false);
  });

  it('bağlantı reddedilirse offline', async () => {
    const p = await fakePrinter(() => {});
    const port = p.port;
    await p.close();
    const err = await eposPrint('127.0.0.1', port, Uint8Array.from([1]), { tls: false }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PrinterError);
    expect((err as PrinterError).code).toBe('offline');
  });

  it('durum sorusu: boş belge; kapak açıkken yazıcı hata koduyla cevap verse de durum baytları döner', async () => {
    const p = await fakePrinter((_r, res) => {
      res.writeHead(200);
      // 0x0F000036: normal durum (0x0F000016) + kapak açık (0x20); kağıt bitti biti (0x80000) yok.
      res.end(soap('success="false" code="EPTR_COVER_OPEN" status="251658294"'));
    });
    closers.push(p.close);
    const state = await eposStatus('127.0.0.1', p.port, { tls: false });
    expect(p.requests[0]!.body).not.toContain('<command>');
    expect(state).toMatchObject({ known: true, cover_open: true, paper_end: false });
  });

  it('eposRequest: yanıt gövdesi ve HTTP durumu olduğu gibi döner', async () => {
    const p = await fakePrinter((_r, res) => {
      res.writeHead(503);
      res.end('busy');
    });
    closers.push(p.close);
    await expect(eposRequest('127.0.0.1', p.port, '<x/>', { tls: false })).resolves.toEqual({ status: 503, body: 'busy' });
  });
});

describe('transport: ePOS portları ePOS yoluna gider', () => {
  it('printWithChecks / queryStatus port 80 ve 443 için ham TCP açmaz, ePOS-Print kullanır', async () => {
    // Gerçek 80/443 açılamaz; kural port sabitleriyle sınanır: 9100 ham yolda kalır (bağlantı reddi = offline),
    // ePOS yolunun kendisi yukarıda sahte sunucuyla sınandı.
    expect(isEposPort(443) && isEposPort(80)).toBe(true);
    const p = await fakePrinter(() => {});
    const port = p.port;
    await p.close();
    await expect(printWithChecks('127.0.0.1', port, Uint8Array.from([1]), { connectMs: 300 })).rejects.toMatchObject({
      code: 'offline',
    });
    await expect(queryStatus('127.0.0.1', port, { connectMs: 300 })).rejects.toMatchObject({ code: 'offline' });
  });
});
