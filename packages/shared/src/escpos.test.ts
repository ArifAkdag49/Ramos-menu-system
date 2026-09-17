import { describe, expect, it } from 'vitest';
import { encodeLines, isSupportedCodepage } from './escpos';
import { renderTicket, type Line } from './ticket';

// Fix round 1 (Görev 18 review): assertions now search the raw Uint8Array/Buffer
// directly (Buffer.indexOf/includes on a Buffer needle is byte-aligned) instead of
// substring-searching a hex STRING, where a match can start on an odd hex-nibble
// offset and report a false positive that doesn't correspond to real byte data.
const ascii = (s: string) => Buffer.from(s, 'ascii');

function countCRLF(buf: Uint8Array): number {
  let count = 0;
  for (let i = 0; i + 1 < buf.length; i++) {
    if (buf[i] === 0x0a && buf[i + 1] === 0x0d) count++;
  }
  return count;
}

describe('encodeLines (Xprinter)', () => {
  const lines = renderTicket({
    kind: 'order', header: 'KÜCHE', table: 'Tisch 1', orderNo: 1, round: 1, createdAt: '2026-09-15T17:00:00Z',
    waiter: 'Ali', note: null,
    items: [{ qty: 1, code: '59', name: 'Kuzu Şiş', isBeverage: false, variant: null, without: ['Zwiebeln'],
              groups: [{ label: 'Soße', format: 'label_values', values: ['Kräuter'] }], note: null }],
  });
  const out = Buffer.from(encodeLines(lines, { codepage: 'cp857', codepageNumber: 61 }));

  it('init: ESC @ + FS . + ESC t 61, baştan (gereksiz boş satır yok — Minor 7)', () => {
    expect(out.subarray(0, 7)).toEqual(Buffer.from([0x1b, 0x40, 0x1c, 0x2e, 0x1b, 0x74, 0x3d]));
  });

  it('CP857: Ş=9E ş=9F ä=84', () => {
    expect(out.includes(Buffer.concat([ascii('Kuzu '), Buffer.from([0x9e]), ascii('i'), Buffer.from([0x9f])]))).toBe(true); // "Kuzu Şiş"
    expect(out.includes(Buffer.concat([ascii('Kr'), Buffer.from([0x84]), ascii('uter')]))).toBe(true); // "Kräuter"
  });

  it('"ohne" alt satırı 8 boşluk girintisiyle olduğu gibi basılır (Critical 1)', () => {
    expect(out.includes(ascii('        ohne Zwiebeln'))).toBe(true); // leading 8-space indent must survive verbatim
    expect(out.includes(ascii('Nr.  Artikel'))).toBe(true); // sütun boşlukları da korunur
  });

  it('bant ters renkte basılır (GS B 1 … GS B 0)', () => {
    const banner = renderTicket({
      kind: 'storno', header: 'KÜCHE', table: 'Tisch 1', refOrderNo: 1, createdAt: '2026-09-15T17:00:00Z', items: [],
    });
    const buf = Buffer.from(encodeLines(banner, { codepage: 'cp857', codepageNumber: 61 }));
    const i = buf.indexOf(ascii('*** STORNO ***'));
    expect(i).toBeGreaterThan(-1);
    expect(buf.lastIndexOf(Buffer.from([0x1d, 0x42, 0x01]), i)).toBeGreaterThan(-1);
    expect(buf.indexOf(Buffer.from([0x1d, 0x42, 0x00]), i)).toBeGreaterThan(i);
  });

  it('kısmi kesimle biter: GS V 66 0', () => {
    expect(out.subarray(out.length - 4)).toEqual(Buffer.from([0x1d, 0x56, 0x42, 0x00]));
  });
});

describe('encodeLines — girinti asla yeniden sarılmaz/temizlenmez (R61, Critical 1)', () => {
  it('6 boşluklu asılı girintili devam satırı baytı baytına korunur', () => {
    const manual: Line[] = [
      { kind: 'text', text: 'MAIN LINE', bold: true },
      { kind: 'text', text: '      continuation line' },
    ];
    const out = Buffer.from(encodeLines(manual, { codepage: 'cp857', codepageNumber: 61 }));
    expect(out.includes(ascii('      continuation line'))).toBe(true);
  });

  it('sağdaki/soldaki tek boşluklar da korunur (satır 0 kolonunda değilse dahi)', () => {
    const manual: Line[] = [{ kind: 'text', text: ' x  y ' }];
    const out = Buffer.from(encodeLines(manual, { codepage: 'cp857', codepageNumber: 61 }));
    expect(out.includes(ascii(' x  y '))).toBe(true);
  });
});

describe('encodeLines — codepage adı/numarası tek doğruluk kaynağı (R60, Important 4)', () => {
  const oneLine: Line[] = [{ kind: 'text', text: 'x' }];

  it('uyuşmayan çift (cp857 + 91) yüksek sesle hata verir, sessizce yanlış tabloya düşmez', () => {
    expect(() => encodeLines(oneLine, { codepage: 'cp857', codepageNumber: 91 })).toThrow();
  });

  it('bilinmeyen codepage adı hata verir', () => {
    expect(() => encodeLines(oneLine, { codepage: 'bilinmeyen', codepageNumber: 0 })).toThrow();
  });

  it('windows1254/91 (WPC1254 kurtarma yolu) doğru tabloyla kodlar: Ş=DE, ESC t 91', () => {
    const out = Buffer.from(encodeLines([{ kind: 'text', text: 'Ş' }], { codepage: 'windows1254', codepageNumber: 91 }));
    expect(out.subarray(4, 7)).toEqual(Buffer.from([0x1b, 0x74, 0x5b])); // ESC t 91 (0x5b)
    expect(out.includes(Buffer.from([0xde]))).toBe(true); // windows1254: Ş = 0xDE (cp857 would wrongly say 0x9E)
  });
});

describe('encodeLines — Epson numaraları (TM-m30III)', () => {
  it('windows1254/48 (Epson WPC1254): ESC t 48, Ş=DE, ä=E4, €=80', () => {
    const out = Buffer.from(encodeLines([{ kind: 'text', text: 'Şä€' }], { codepage: 'windows1254', codepageNumber: 48 }));
    expect(out.subarray(4, 7)).toEqual(Buffer.from([0x1b, 0x74, 0x30])); // ESC t 48 (0x30)
    expect(out.includes(Buffer.from([0xde, 0xe4, 0x80]))).toBe(true);
  });

  it('cp857/13 (Epson PC857): ESC t 13, Ş=9E', () => {
    const out = Buffer.from(encodeLines([{ kind: 'text', text: 'Ş' }], { codepage: 'cp857', codepageNumber: 13 }));
    expect(out.subarray(4, 7)).toEqual(Buffer.from([0x1b, 0x74, 0x0d]));
    expect(out.includes(Buffer.from([0x9e]))).toBe(true);
  });

  it('başka tablonun Epson numarası hâlâ hata: cp857/48, windows1254/13, cp437/48', () => {
    const x: Line[] = [{ kind: 'text', text: 'x' }];
    expect(() => encodeLines(x, { codepage: 'cp857', codepageNumber: 48 })).toThrow(/uyuşmayan/);
    expect(() => encodeLines(x, { codepage: 'windows1254', codepageNumber: 13 })).toThrow();
    expect(() => encodeLines(x, { codepage: 'cp437', codepageNumber: 48 })).toThrow();
  });

  it('isSupportedCodepage bilinen çiftleri tanır', () => {
    expect(isSupportedCodepage('windows1254', 48)).toBe(true);
    expect(isSupportedCodepage('windows1254', 91)).toBe(true);
    expect(isSupportedCodepage('cp857', 91)).toBe(false);
    expect(isSupportedCodepage('utf8', 0)).toBe(false);
  });
});

describe('encodeLines — rule() ASCII "-" kullanır (Minor 6)', () => {
  it('kutu çizim karakteri (─, cp437 0xC4) değil, düz tire basılır', () => {
    const out = Buffer.from(encodeLines([{ kind: 'rule' }], { codepage: 'cp857', codepageNumber: 61 }));
    expect(out.includes(ascii('-'.repeat(48)))).toBe(true);
    expect(out.includes(Buffer.from([0xc4]))).toBe(false);
  });
});

describe('encodeLines — besleme tam istenen kadar (Minor 7 + 8)', () => {
  it('baştan boş satır yok, tek "feed" satırı tek CRLF üretir (çift besleme yok)', () => {
    const out = encodeLines([{ kind: 'feed', lines: 1 }], { codepage: 'cp857', codepageNumber: 61 });
    expect(countCRLF(out)).toBe(1);
  });
});
