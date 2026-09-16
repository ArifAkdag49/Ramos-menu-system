import { renderTicket } from '@ramos/shared';
import { describe, expect, it } from 'vitest';
import { encodeLines } from './escpos';

const hex = (b: Uint8Array) => Buffer.from(b).toString('hex');
const bytes = (s: string) => Buffer.from(s.replace(/\s/g, ''), 'hex').toString('hex');

describe('encodeLines (Xprinter)', () => {
  const lines = renderTicket({
    kind: 'order', header: 'KÜCHE', table: 'Tisch 1', orderNo: 1, round: 1, createdAt: '2026-09-15T17:00:00Z',
    waiter: 'Ali', note: null,
    items: [{ qty: 1, code: '59', name: 'Kuzu Şiş', isBeverage: false, variant: null, without: ['Zwiebeln'],
              groups: [{ label: 'Soße', format: 'label_values', values: ['Kräuter'] }], note: null }],
  });
  const out = hex(encodeLines(lines, { codepage: 'cp857', codepageNumber: 61 }));

  it('init: ESC @ + FS . ve ESC t 61', () => {
    expect(out.startsWith(bytes('1b40 1c2e'))).toBe(true);
    expect(out).toContain(bytes('1b74 3d'));
  });
  it('CP857: Ş=9E ş=9F ä=84', () => {
    expect(out).toContain(bytes('4b757a75 20 9e 69 9f'));   // "Kuzu Şiş"
    expect(out).toContain(bytes('4b72 84 75746572'));        // "Kräuter"
  });
  it('OHNE satırı ters renk (GS B 1 … GS B 0)', () => {
    const i = out.indexOf(Buffer.from('OHNE: Zwiebeln').toString('hex'));
    expect(out.lastIndexOf(bytes('1d4201'), i)).toBeGreaterThan(-1);
    expect(out.indexOf(bytes('1d4200'), i)).toBeGreaterThan(i);
  });
  it('kısmi kesimle biter: GS V 66 0', () => expect(out.endsWith(bytes('1d564200'))).toBe(true));
});
