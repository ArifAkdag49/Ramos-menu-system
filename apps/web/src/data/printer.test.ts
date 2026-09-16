import { describe, expect, it } from 'vitest';
import { derivePrinterProblem } from './printer';

const now = new Date('2026-09-15T18:00:00Z');
const base = { last_seen_at: '2026-09-15T17:59:30Z', printer_reachable: true, printer_state: {}, failed_jobs: 0 };

describe('derivePrinterProblem', () => {
  it('90 sn sinyal yoksa ajan çevrimdışı', () =>
    expect(derivePrinterProblem({ ...base, last_seen_at: '2026-09-15T17:58:29Z' }, now)).toBe('agent_offline'));
  it('öncelik: ajan > ulaşılamıyor > kağıt > kapak > başarısız iş', () => {
    expect(derivePrinterProblem({ ...base, printer_reachable: false }, now)).toBe('printer_unreachable');
    expect(derivePrinterProblem({ ...base, printer_state: { paper_end: true, cover_open: true } }, now)).toBe('paper_end');
    expect(derivePrinterProblem({ ...base, printer_state: { cover_open: true } }, now)).toBe('cover_open');
    expect(derivePrinterProblem({ ...base, failed_jobs: 2 }, now)).toBe('jobs_failed');
    expect(derivePrinterProblem(base, now)).toBeNull();
  });
});
