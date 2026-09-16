import { describe, expect, it } from 'vitest';
import { blockingProblem, parseStatus } from './status';

describe('parseStatus (DLE EOT 1/2/4)', () => {
  it('normal: 0x12 0x12 0x12', () => {
    const s = parseStatus(Uint8Array.from([0x12, 0x12, 0x12]));
    expect(s).toMatchObject({ known: true, offline: false, cover_open: false, paper_end: false, paper_near_end: false });
    expect(blockingProblem(s)).toBeNull();
  });
  it('kapak açık, kağıt bitti, kağıt azaldı', () => {
    expect(parseStatus(Uint8Array.from([0x1a, 0x16, 0x12]))).toMatchObject({ offline: true, cover_open: true });
    expect(blockingProblem(parseStatus(Uint8Array.from([0x12, 0x32, 0x72])))).toBe('paper_end');
    expect(parseStatus(Uint8Array.from([0x12, 0x12, 0x1e]))).toMatchObject({ paper_near_end: true, paper_end: false });
  });
  it('eksik yanıt = bilinmiyor, engellemez', () => {
    const s = parseStatus(Uint8Array.from([0x12]));
    expect(s.known).toBe(false);
    expect(blockingProblem(s)).toBeNull();
  });
});
