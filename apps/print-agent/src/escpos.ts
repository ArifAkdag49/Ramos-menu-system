import type { Line } from '@ramos/shared';
import ReceiptPrinterEncoder from '@point-of-sale/receipt-printer-encoder';

export interface EncodeOptions {
  codepage: string;
  codepageNumber: number;
  columns?: number;
}

// Xprinter pitfalls (BUILD-PROMPT §6):
// - `initialize()` must start with ESC @ (0x1B 0x40) followed by FS . (0x1C 0x2E) —
//   the library's esc-pos initialize() already emits both, in that order — or
//   umlauts print as Chinese characters.
// - ESC @ resets the code page, so `ESC t <n>` (here: ESC t 61 for CP857) must be
//   re-sent after every init; the encoder does this automatically the first time
//   text is encoded in a codepage, since `.codepage()` only records the codepage
//   name and the actual `ESC t <n>` bytes are emitted lazily by the first `.text()`
//   call that uses it.
// - Only partial cut exists: GS V 66 0 (0x1D 0x56 0x42 0x00), appended by hand
//   after feeding — never `.cut()`, and no bell.
export function encodeLines(lines: Line[], { codepage, codepageNumber, columns = 48 }: EncodeOptions): Uint8Array {
  const encoder = new ReceiptPrinterEncoder({
    language: 'esc-pos',
    printerModel: 'xprinter-xp-t80q',
    columns,
    codepageMapping: { cp437: 0, cp858: 19, windows1252: 16, cp857: 61, [codepage]: codepageNumber },
  });

  // The composer only applies center/right padding when it flushes a line, and it
  // applies that padding to *everything* still sitting in its buffer — including
  // the init bytes, if nothing has flushed them out yet. Since the very first
  // ticket line is always center-aligned (the header), an unflushed `initialize()`
  // would otherwise end up with spaces inserted *before* ESC @ / FS . / ESC t 61.
  // Flushing once, immediately, keeps the init sequence as its own left-aligned
  // line so it always leads the output untouched.
  let r = encoder.initialize().codepage(codepage).newline();

  for (const l of lines) {
    if (l.kind === 'rule') {
      r = r.rule();
      continue;
    }
    if (l.kind === 'feed') {
      r = r.newline(l.lines);
      continue;
    }
    r = r
      .align(l.align ?? 'left')
      .bold(!!l.bold)
      .invert(!!l.invert)
      .width(l.width ?? 1)
      .height(l.height ?? 1)
      .text(l.text)
      .newline()
      .invert(false)
      .bold(false)
      .width(1)
      .height(1);
  }

  const body = r.newline(3).encode();
  return new Uint8Array([...body, 0x1d, 0x56, 0x42, 0x00]);
}
