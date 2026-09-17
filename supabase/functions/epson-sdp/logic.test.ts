import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  MAX_BODY_BYTES,
  buildPrintRequestXml,
  bytesToHex,
  epsonCodepage,
  escapeXml,
  handleSdpRequest,
  jobIdToPrintJobId,
  parseForm,
  parsePrintResponse,
  printJobIdToJobId,
  sha256Hex,
  type SdpDeps,
} from './logic';
import { renderEscpos } from './render';

const TOKEN = 'a'.repeat(64);
const JOB = '6f1c2b1e-8d4a-4c1b-9a53-0d6c7f1e2a90';
const JOB2 = '00000000-0000-4000-8000-000000000001';

describe('sha256Hex', () => {
  it('Node crypto ile aynı küçük harf hex (DB: encode(sha256(convert_to(token, UTF8)), hex))', async () => {
    expect(await sha256Hex(TOKEN)).toBe(createHash('sha256').update(TOKEN, 'utf8').digest('hex'));
  });
});

describe('printjobid dönüşümü', () => {
  it('UUID ↔ 25 karakter base36 (Epson: 1–30 alfanümerik)', () => {
    for (const id of [JOB, JOB2, 'ffffffff-ffff-ffff-ffff-ffffffffffff', '00000000-0000-0000-0000-000000000000']) {
      const pj = jobIdToPrintJobId(id);
      expect(pj).toMatch(/^[0-9a-z]{25}$/);
      expect(printJobIdToJobId(pj)).toBe(id);
    }
  });
  it('bozuk printjobid null döner', () => {
    expect(printJobIdToJobId('ABC123')).toBeNull();
    expect(printJobIdToJobId('')).toBeNull();
    expect(printJobIdToJobId('z'.repeat(25))).toBeNull(); // 128 biti aşar
    expect(printJobIdToJobId('<x>'.padEnd(25, '0'))).toBeNull();
  });
});

describe('XML yardımcıları', () => {
  it('escapeXml beş özel karakteri kaçırır', () =>
    expect(escapeXml(`<a & "b" 'c'>`)).toBe('&lt;a &amp; &quot;b&quot; &apos;c&apos;&gt;'));
  it('bytesToHex', () => expect(bytesToHex(new Uint8Array([0, 0x1b, 0xff, 0x0a]))).toBe('001bff0a'));
});

describe('epsonCodepage', () => {
  it('ad korunur, numara Epson tablosundan gelir (Xprinter numarası Epson\'a gitmez)', () => {
    expect(epsonCodepage({ codepage: 'cp857', codepageNumber: 61 })).toEqual({ codepage: 'cp857', codepageNumber: 13 });
    expect(epsonCodepage({ codepage: 'windows1254', codepageNumber: 91 })).toEqual({ codepage: 'windows1254', codepageNumber: 48 });
    expect(epsonCodepage({ codepage: 'cp858', codepageNumber: 19 })).toEqual({ codepage: 'cp858', codepageNumber: 19 });
  });
  it('bilinmeyen ya da eksik ayar → windows1254 / 48', () => {
    expect(epsonCodepage({ codepage: 'x', codepageNumber: 1 })).toEqual({ codepage: 'windows1254', codepageNumber: 48 });
    expect(epsonCodepage(undefined)).toEqual({ codepage: 'windows1254', codepageNumber: 48 });
  });
});

describe('buildPrintRequestXml', () => {
  it('PrintRequestInfo 2.00 şeması: her iş ayrı ePOSPrint, printjobid, command hex', () => {
    const xml = buildPrintRequestXml([
      { jobId: JOB, bytes: new Uint8Array([0x1b, 0x40, 0x41]) },
      { jobId: JOB2, bytes: new Uint8Array([0x0a]) },
    ]);
    expect(xml.startsWith('<?xml version="1.0" encoding="utf-8"?>\n<PrintRequestInfo Version="2.00">')).toBe(true);
    expect(xml.match(/<ePOSPrint>/g)).toHaveLength(2);
    expect(xml).toContain('<devid>local_printer</devid>');
    expect(xml).toContain('<timeout>60000</timeout>');
    expect(xml).toContain(`<printjobid>${jobIdToPrintJobId(JOB)}</printjobid>`);
    expect(xml).toContain('<epos-print xmlns="http://www.epson-pos.com/schemas/2011/03/epos-print">');
    expect(xml).toContain('<command>1b4041</command>');
    expect(xml).toContain('<command>0a</command>');
    expect(xml.trimEnd().endsWith('</PrintRequestInfo>')).toBe(true);
    expect(xml.charCodeAt(0)).not.toBe(0xfeff); // BOM desteklenmez
  });
  it('devid kaçırılır', () => {
    expect(buildPrintRequestXml([{ jobId: JOB, bytes: new Uint8Array([1]) }], { devid: 'a<b' }))
      .toContain('<devid>a&lt;b</devid>');
  });
});

const v2 = (entries: string) => `<?xml version="1.0" encoding="utf-8"?>
<PrintResponseInfo Version="2.00">${entries}</PrintResponseInfo>`;
const entry = (pj: string, success: string, code = '') => `
  <ePOSPrint>
    <Parameter><devid>local_printer</devid><printjobid>${pj}</printjobid></Parameter>
    <PrintResponse>
      <response xmlns="http://www.epson-pos.com/schemas/2011/03/epos-print" success="${success}" code="${code}" status="251854870" battery="0"/>
    </PrintResponse>
  </ePOSPrint>`;

describe('parsePrintResponse', () => {
  it('başarı', () =>
    expect(parsePrintResponse(v2(entry('ABC123', 'true')))).toEqual({
      results: [{ printJobId: 'ABC123', success: true, code: '' }], serverError: null,
    }));

  it('çoklu sonuç, hata kodu; kılavuzdaki bozuk kapanış etiketine rağmen', () => {
    // Kılavuz örneğinde <PrintResponse> yanlışlıkla </PrintResponseInfo> ile kapanıyor.
    const xml = v2(entry('A1', 'false', 'EPTR_REC_EMPTY') + entry('B2', 'true')).replace('</PrintResponse>', '</PrintResponseInfo>');
    expect(parsePrintResponse(xml).results).toEqual([
      { printJobId: 'A1', success: false, code: 'EPTR_REC_EMPTY' },
      { printJobId: 'B2', success: true, code: '' },
    ]);
  });

  it('success="1" da başarı; response eksikse başarısız sayılır', () => {
    const xml = v2(entry('A1', '1') + '<ePOSPrint><Parameter><printjobid>C3</printjobid></Parameter></ePOSPrint>');
    expect(parsePrintResponse(xml).results).toEqual([
      { printJobId: 'A1', success: true, code: '' },
      { printJobId: 'C3', success: false, code: 'no_response' },
    ]);
  });

  it('Version 3.00 XML hatası (ServerDirectPrint Success=false) raporlanır', () => {
    const xml = `<PrintResponseInfo Version="3.00"><ServerDirectPrint><Response Success="false">
      <ErrorSummary>Invalid XML format</ErrorSummary><ErrorDetail>Entity: line 9</ErrorDetail></Response>
      </ServerDirectPrint></PrintResponseInfo>`;
    expect(parsePrintResponse(xml)).toEqual({ results: [], serverError: 'Invalid XML format: Entity: line 9' });
  });

  it('Version 1.00 (printjobid yok) ve çöp girdi boş döner', () => {
    expect(parsePrintResponse('<PrintResponseInfo Version="1.00"><response success="true" code=""/></PrintResponseInfo>').results).toEqual([]);
    expect(parsePrintResponse('not xml').results).toEqual([]);
  });
});

describe('parseForm', () => {
  it('URL-encoded gövde', () => {
    const body = new URLSearchParams({ ConnectionType: 'SetResponse', ID: 'x', ResponseFile: '<a b="1">&amp;</a>' }).toString();
    expect(parseForm(body)).toEqual({ connectionType: 'SetResponse', id: 'x', name: '', responseFile: '<a b="1">&amp;</a>' });
  });
  it('URL Encode kapalıysa ResponseFile gövdenin geri kalanıdır', () => {
    const raw = 'ConnectionType=SetResponse&ID=&ResponseFile=<?xml version="1.0"?><X a="1&2">%</X>';
    expect(parseForm(raw).responseFile).toBe('<?xml version="1.0"?><X a="1&2">%</X>');
  });
});

describe('renderEscpos (ajanla aynı fiş baytları)', () => {
  it('ESC @ FS . ESC t 48 ile başlar, WPC1254 Türkçe harfler, kesme ile biter', () => {
    const bytes = renderEscpos(
      { kind: 'test', header: "RAMO'S", table: 'Tisch 1', createdAt: '2026-09-17T10:00:00Z', items: [], sampleLine: 'Şş Ğğ İı' },
      { codepage: 'windows1254', codepageNumber: 48, transliterate: false });
    expect([...bytes.slice(0, 7)]).toEqual([0x1b, 0x40, 0x1c, 0x2e, 0x1b, 0x74, 48]);
    expect([...bytes.slice(-4)]).toEqual([0x1d, 0x56, 0x42, 0x00]);
    const hex = bytesToHex(bytes);
    expect(hex).toContain('defe'); // Ş ş (WPC1254: 0xDE 0xFE)
    expect(hex).toContain('ddfd'); // İ ı (0xDD 0xFD)
  });
});

// ---------- istek işleyici ----------
const form = (fields: Record<string, string>) => new URLSearchParams(fields).toString();
const post = (body: string, { token = TOKEN, method = 'POST' as string, headers = {} as Record<string, string> } = {}) =>
  new Request(`https://x.supabase.co/functions/v1/epson-sdp${token ? `?t=${token}` : ''}`, {
    method,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...headers },
    body: method === 'GET' ? undefined : body,
  });

function deps(over: Partial<SdpDeps> = {}): SdpDeps {
  return {
    claimNext: vi.fn(async () => ({ printer: 'ok' as const, jobs: [] })),
    complete: vi.fn(async () => 'ok'),
    render: vi.fn(() => new Uint8Array([0x41, 0x0a])),
    log: vi.fn(),
    ...over,
  };
}

describe('handleSdpRequest', () => {
  it('POST dışı → 405', async () => {
    const res = await handleSdpRequest(post('', { method: 'GET' }), deps());
    expect(res.status).toBe(405);
    expect(res.headers.get('Allow')).toBe('POST');
  });

  it('anahtar yok/bozuk → 401 (DB çağrılmaz)', async () => {
    const d = deps();
    expect((await handleSdpRequest(post(form({ ConnectionType: 'GetRequest' }), { token: '' }), d)).status).toBe(401);
    expect((await handleSdpRequest(post(form({ ConnectionType: 'GetRequest' }), { token: 'abc' }), d)).status).toBe(401);
    expect(d.claimNext).not.toHaveBeenCalled();
  });

  it('bilinmeyen anahtar 401, pasif yazıcı 403; özet ile sorgulanır', async () => {
    const unknown = deps({ claimNext: vi.fn(async () => ({ printer: 'unknown' as const, jobs: [] })) });
    expect((await handleSdpRequest(post(form({ ConnectionType: 'GetRequest' })), unknown)).status).toBe(401);
    expect(unknown.claimNext).toHaveBeenCalledWith(await sha256Hex(TOKEN));
    const inactive = deps({ claimNext: vi.fn(async () => ({ printer: 'inactive' as const, jobs: [] })) });
    expect((await handleSdpRequest(post(form({ ConnectionType: 'GetRequest' })), inactive)).status).toBe(403);
  });

  it('anahtar URL yerine Web Config ID alanında da gelebilir', async () => {
    const d = deps();
    const res = await handleSdpRequest(post(form({ ConnectionType: 'GetRequest', ID: TOKEN }), { token: '' }), d);
    expect(res.status).toBe(200);
    expect(d.claimNext).toHaveBeenCalledWith(await sha256Hex(TOKEN));
  });

  it('gövde sınırı → 413', async () => {
    const big = 'x'.repeat(MAX_BODY_BYTES + 1);
    expect((await handleSdpRequest(post(big), deps())).status).toBe(413);
    expect((await handleSdpRequest(post('a', { headers: { 'Content-Length': String(MAX_BODY_BYTES + 1) } }), deps())).status)
      .toBe(413);
  });

  it('boş kuyruk: 200, text/xml, gövde boş', async () => {
    const res = await handleSdpRequest(post(form({ ConnectionType: 'GetRequest', ID: '' })), deps());
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/xml; charset=utf-8');
    expect(await res.text()).toBe('');
  });

  it('iş varsa XML döner; kodlanamayan iş başarısız kapatılır ve yanıta girmez', async () => {
    const settings = { codepage: 'cp857', codepageNumber: 61, transliterate: true };
    const d = deps({
      claimNext: vi.fn(async () => ({
        printer: 'ok' as const, settings,
        jobs: [{ id: JOB, type: 'order', payload: { kind: 'order' } }, { id: JOB2, type: 'order', payload: { bad: true } }],
      })),
      render: vi.fn((payload: Record<string, unknown>) => {
        if (payload.bad) throw new Error('boom');
        return new Uint8Array([0x41]);
      }),
    });
    const res = await handleSdpRequest(post(form({ ConnectionType: 'GetRequest' })), d);
    const xml = await res.text();
    expect(res.status).toBe(200);
    expect(xml).toContain(`<printjobid>${jobIdToPrintJobId(JOB)}</printjobid>`);
    expect(xml).not.toContain(jobIdToPrintJobId(JOB2));
    expect(xml).toContain('<command>41</command>');
    expect(d.render).toHaveBeenCalledWith({ kind: 'order' }, { codepage: 'cp857', codepageNumber: 13, transliterate: true });
    expect(d.complete).toHaveBeenCalledWith(await sha256Hex(TOKEN), JOB2, false, expect.stringMatching(/^encode_error: /));
  });

  it('hiçbir iş kodlanamazsa boş yanıt', async () => {
    const d = deps({
      claimNext: vi.fn(async () => ({ printer: 'ok' as const, jobs: [{ id: JOB, type: 'order', payload: {} }] })),
      render: vi.fn(() => { throw new Error('x'); }),
    });
    expect(await (await handleSdpRequest(post(form({ ConnectionType: 'GetRequest' })), d)).text()).toBe('');
  });

  it('SetResponse: her printjobid için sonuç kaydedilir, bozuk kimlik atlanır', async () => {
    const d = deps();
    const xml = v2(entry(jobIdToPrintJobId(JOB), 'true') + entry(jobIdToPrintJobId(JOB2), 'false', 'EPTR_COVER_OPEN') + entry('ABC', 'true'));
    const res = await handleSdpRequest(post(form({ ConnectionType: 'SetResponse', ID: '', ResponseFile: xml })), d);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('');
    const hash = await sha256Hex(TOKEN);
    expect(d.complete).toHaveBeenCalledTimes(2);
    expect(d.complete).toHaveBeenCalledWith(hash, JOB, true, null);
    expect(d.complete).toHaveBeenCalledWith(hash, JOB2, false, 'EPTR_COVER_OPEN');
  });

  it('SetResponse: anahtar reddedilirse 401/403', async () => {
    const xml = v2(entry(jobIdToPrintJobId(JOB), 'true'));
    const body = form({ ConnectionType: 'SetResponse', ResponseFile: xml });
    expect((await handleSdpRequest(post(body), deps({ complete: vi.fn(async () => 'unknown') }))).status).toBe(401);
    expect((await handleSdpRequest(post(body), deps({ complete: vi.fn(async () => 'inactive') }))).status).toBe(403);
  });

  it('SetResponse sonuçsuzsa (ör. XML hatası) DB’ye dokunulmaz: iş sahiplenmek için claim ÇAĞRILMAZ', async () => {
    const xml = `<PrintResponseInfo Version="3.00"><ServerDirectPrint><Response Success="false"><ErrorSummary>E</ErrorSummary></Response></ServerDirectPrint></PrintResponseInfo>`;
    const d = deps();
    const res = await handleSdpRequest(post(form({ ConnectionType: 'SetResponse', ResponseFile: xml })), d);
    expect(res.status).toBe(200);
    expect(d.claimNext).not.toHaveBeenCalled();
    expect(d.complete).not.toHaveBeenCalled();
    expect(d.log).toHaveBeenCalledWith('warn', 'sdp_response_error', expect.objectContaining({ error: 'E' }));
  });

  it('DB hatası → 500 (yazıcı aralıkla yeniden dener)', async () => {
    const d = deps({ claimNext: vi.fn(async () => { throw new Error('db'); }) });
    expect((await handleSdpRequest(post(form({ ConnectionType: 'GetRequest' })), d)).status).toBe(500);
  });

  it('bilinmeyen ConnectionType → 200 boş', async () => {
    const res = await handleSdpRequest(post(form({ ConnectionType: 'SetStatus' })), deps());
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('');
  });
});
