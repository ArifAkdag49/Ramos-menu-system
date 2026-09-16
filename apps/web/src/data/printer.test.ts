import { describe, expect, it } from 'vitest';
import { completeStuckSeconds, derivePrinterProblem } from './printer';

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

/**
 * R79 — "sessiz fiş kaybı" işareti. Yazdırma ajanı bir onayı 60 sn'den uzun süre tamamlayamazsa
 * bunu `printer_status.last_error` alanına `complete_stuck_<sn>s[;asıl hata]` biçiminde yazıyordu
 * ama `apps/web` bu alanı hiç okumuyordu: veri tabanında duran uyarıyı kimse görmüyordu.
 */
describe('derivePrinterProblem — onay takılması (R79)', () => {
  it('last_error "complete_stuck" ile başlıyorsa ayrı bir durum çıkar', () => {
    expect(derivePrinterProblem({ ...base, last_error: 'complete_stuck_75s;ECONNRESET' }, now)).toBe('complete_stuck');
    expect(derivePrinterProblem({ ...base, last_error: 'complete_stuck_600s' }, now)).toBe('complete_stuck');
  });

  it('fiziksel sorunlar önce gelir, takılma başarısız işlerin önüne geçer', () => {
    expect(
      derivePrinterProblem({ ...base, last_error: 'complete_stuck_75s', printer_state: { paper_end: true } }, now),
    ).toBe('paper_end');
    expect(derivePrinterProblem({ ...base, last_error: 'complete_stuck_75s', failed_jobs: 3 }, now)).toBe(
      'complete_stuck',
    );
  });

  it('ilgisiz bir hata mevcut davranışı değiştirmez', () =>
    expect(derivePrinterProblem({ ...base, last_error: 'ECONNRESET' }, now)).toBeNull());
});

describe('completeStuckSeconds', () => {
  it('takılma süresini saniye olarak okur', () => {
    expect(completeStuckSeconds('complete_stuck_75s;ECONNRESET')).toBe(75);
    expect(completeStuckSeconds('complete_stuck_600s')).toBe(600);
  });

  it('başka hiçbir metinden sayı uydurmaz', () => {
    expect(completeStuckSeconds('ECONNRESET')).toBeNull();
    expect(completeStuckSeconds(null)).toBeNull();
  });
});
