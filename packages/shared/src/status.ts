export interface PrinterState {
  known: boolean;
  offline: boolean;
  cover_open: boolean;
  paper_end: boolean;
  paper_near_end: boolean;
  error: boolean;
  raw: string;
}

// DLE EOT 1 / 2 / 4 reply bytes (status 1, status 2, status 4 — printer status,
// off-line status and paper sensor status, in that order). Xprinter follows the
// Epson layout for these three status bytes.
export function parseStatus(b: Uint8Array): PrinterState {
  // Buffer yok (web/Deno de kullanır): baytları elle onaltılığa çevir.
  const raw = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  if (b.length < 3) {
    return { known: false, offline: false, cover_open: false, paper_end: false, paper_near_end: false, error: false, raw };
  }
  const [s1, s2, s4] = [b[0]!, b[1]!, b[2]!];
  return {
    known: true,
    offline: (s1 & 0x08) !== 0,
    cover_open: (s2 & 0x04) !== 0,
    paper_end: (s2 & 0x20) !== 0 || (s4 & 0x60) !== 0,
    paper_near_end: (s4 & 0x0c) !== 0,
    error: (s2 & 0x40) !== 0,
    raw,
  };
}

// A missing/short status reply leaves `known: false` — that must never be treated
// as a blocking problem (BUILD-PROMPT §6: "Yanıt gelmezse durum 'bilinmiyor' sayılır,
// 'offline' değil"). Priority when known: paper_end > cover_open > offline.
export const blockingProblem = (s: PrinterState): 'offline' | 'cover_open' | 'paper_end' | null =>
  !s.known ? null : s.paper_end ? 'paper_end' : s.cover_open ? 'cover_open' : s.offline ? 'offline' : null;
