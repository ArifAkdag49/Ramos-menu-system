import type { Line } from '@ramos/shared';
import ReceiptPrinterEncoder from '@point-of-sale/receipt-printer-encoder';
import CodepageEncoder from '@point-of-sale/codepage-encoder';

export interface EncodeOptions {
  codepage: string;
  codepageNumber: number;
  columns?: number;
}

// R60 (Görev 18 review, Important 4): the printer's codepage-select command
// (`ESC t <n>`) and the byte table used to encode text must never be allowed to
// diverge — otherwise `{codepage:'cp857', codepageNumber:91}` silently switches
// the printer to WPC1254 while every byte is still taken from the CP857 table,
// and every Turkish character prints wrong. This is the single source of truth:
// BUILD-PROMPT §10.4's documented recovery path (fall back to number 91) only
// works because 91 is wired here to the matching `windows1254` encoding table.
type SupportedCodepage = 'cp437' | 'windows1252' | 'cp858' | 'cp857' | 'windows1254';

// Her kod sayfası için yazıcı markasına göre izinli `ESC t` numaraları. Aynı bayt tablosu farklı
// markalarda farklı numarayla seçilir: CP857 Xprinter'da 61, Epson'da 13; WPC1254 Xprinter'da 91,
// Epson'da 48 (Epson TM-m30III varsayılanı: Türkçe + Almanca harfler ve € tek tabloda). Numara
// yine de ADA bağlıdır — `cp857` + 91 gibi başka bir tablonun numarası hâlâ hata verir (R60).
export const CODEPAGE_TABLE: Record<SupportedCodepage, readonly number[]> = {
  cp437: [0],
  windows1252: [16],
  cp858: [19],
  cp857: [61, 13],
  windows1254: [91, 48],
};

/** Ad + numara bilinen bir eşleşme mi (config.ts'teki yerel geçersiz kılma doğrulaması da kullanır). */
export function isSupportedCodepage(codepage: string, codepageNumber: number): codepage is SupportedCodepage {
  const allowed = (CODEPAGE_TABLE as Record<string, readonly number[] | undefined>)[codepage];
  return allowed !== undefined && allowed.includes(codepageNumber);
}

export function knownCodepagePairs(): string {
  return Object.entries(CODEPAGE_TABLE)
    .flatMap(([name, ns]) => ns.map((n) => `${name}=${n}`))
    .join(', ');
}

function assertSupportedCodepage(codepage: string, codepageNumber: number): asserts codepage is SupportedCodepage {
  if (!isSupportedCodepage(codepage, codepageNumber)) {
    throw new Error(`Bilinmeyen ya da uyuşmayan codepage: '${codepage}' = ${codepageNumber}. Bilinen eşleşmeler: ${knownCodepagePairs()}`);
  }
}

const ESC_AT_FS_DOT = [0x1b, 0x40, 0x1c, 0x2e]; // ESC @ + FS . (character-mode reset; without FS . umlauts print as Chinese)
const PARTIAL_CUT = [0x1d, 0x56, 0x42, 0x00]; // GS V 66 0 — the Xprinter only has a partial cut, and no bell

// linesToText() (packages/shared/src/ticket.ts) centers the same way, for the same
// reason: the printed ticket and the admin "Fiş önizleme" / `agent:dry-run` text
// preview must agree pixel-for-pixel on where a centered line starts.
function centerPad(text: string, columns: number): string {
  const pad = Math.max(0, Math.floor((columns - text.length) / 2));
  return `${' '.repeat(pad)}${text}`;
}

// Xprinter pitfalls (BUILD-PROMPT §6):
// - Init is `ESC @` + `FS .`, followed by `ESC t <n>` — written by hand up front
//   (R61 below explains why nothing here uses the library's own `.initialize()`
//   / `.align()` machinery), followed by `GS V 66 0` appended by hand at the end.
// - CP857 = `ESC t 61` on Xprinter (Epson: 13); WPC1254 = `ESC t 91` on Xprinter (Epson: 48).
export function encodeLines(lines: Line[], { codepage, codepageNumber, columns = 48 }: EncodeOptions): Uint8Array {
  assertSupportedCodepage(codepage, codepageNumber);

  // R61 (Görev 18 review, Critical 1): line wrapping, indentation and the
  // 48-column budget are `@ramos/shared`'s `renderTicket` contract (tested in
  // packages/shared/src/ticket.test.ts) — every `Line.text` this function
  // receives is ALREADY wrapped and indented to fit. The encoder's own
  // `.text()` re-wraps *and* silently drops leading whitespace tokens at
  // column 0 (its TextWrap strips a leading-whitespace chunk whenever the
  // line is empty so far), which would strip every "   OHNE: …" / "      …"
  // hanging indent before it ever reaches the printer. So `.text()` (and by
  // extension `.align()`/`.initialize()`, which only exist to support it and
  // interact badly with an unflushed `.initialize()` when the first line is
  // centered — see the round-1 report) is never called here. Every text byte
  // is encoded by hand and written with `.raw()`, verbatim, indentation and
  // all; centering is done by hand for the same reason, matching
  // `linesToText`'s own centering formula so paper and preview agree.
  const encoder = new ReceiptPrinterEncoder({ language: 'esc-pos', columns });

  for (const l of lines) {
    if (l.kind === 'rule') {
      // Minor 6 (review): the library's `.rule()` always draws with cp437's
      // box-drawing '─' (0xC4 × columns). Spec §9.3's sample and `linesToText`
      // both use a plain ASCII '-' — match that, byte for byte.
      encoder.raw(new Array<number>(columns).fill(0x2d)).newline();
      continue;
    }
    if (l.kind === 'feed') {
      encoder.newline(l.lines);
      continue;
    }
    const text = l.align === 'center' && l.width !== 2 ? centerPad(l.text, columns) : l.text;
    encoder
      .bold(!!l.bold)
      .invert(!!l.invert)
      .width(l.width ?? 1)
      .height(l.height ?? 1)
      .raw(CodepageEncoder.encode(text, codepage))
      .newline()
      .invert(false)
      .bold(false)
      .width(1)
      .height(1);
  }

  // Minor 7 (review): prepend the init bytes by hand, symmetrically with the
  // cut appended below — no more leading blank line from an `.initialize()`
  // flushed as its own (throwaway) first line.
  // Minor 8 (review): renderTicket's own `closeTicket()` already ends every
  // ticket with `{kind:'feed', lines:3}` (handled by the loop above) — do not
  // add a second feed here, or every ticket wastes ~2.5cm of paper on 6 blank
  // lines instead of 3.
  const body = encoder.encode();
  return new Uint8Array([...ESC_AT_FS_DOT, 0x1b, 0x74, codepageNumber, ...body, ...PARTIAL_CUT]);
}
