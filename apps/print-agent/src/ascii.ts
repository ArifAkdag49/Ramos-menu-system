import { renderTicket, type Line, type TicketPayload } from '@ramos/shared';

// "Sade harf" modu (yazıcı kurulum sihirbazı → .env PRINTER_ASCII=1). Yazıcının karakter
// tablosu ne olursa olsun fiş okunur çıksın diye ASCII dışındaki her karakter düz karşılığına
// çevrilir. Paylaşılan `transliterate` ayarı yalnız Türkçe harfleri (ş ğ ı İ) sadeleştirir;
// bu mod Almanca harfleri ve fişin kendi sabit metinlerini ("GETRÄNKE", "·", "€") de kapsar.
// Fiş Almanca olduğu için ä/ö/ü/ß Almanca yazım kuralıyla açılır: Drehspieß → Drehspiess.
const MAP: Record<string, string> = {
  ä: 'ae', ö: 'oe', ü: 'ue', Ä: 'Ae', Ö: 'Oe', Ü: 'Ue', ß: 'ss', ẞ: 'SS',
  ş: 's', Ş: 'S', ğ: 'g', Ğ: 'G', ı: 'i', İ: 'I', ç: 'c', Ç: 'C',
  '·': '-', '•': '-', '–': '-', '—': '-', '→': '->', '…': '...', '€': 'EUR', '×': 'x',
  '„': '"', '“': '"', '”': '"', '«': '"', '»': '"', '‚': "'", '‘': "'", '’': "'", '´': "'",
  ' ': ' ',
};

const isUpperLetter = (ch: string | undefined): boolean => !!ch && ch !== ch.toLowerCase() && ch === ch.toUpperCase();
const isLetter = (ch: string | undefined): boolean => !!ch && ch.toLowerCase() !== ch.toUpperCase();

export function toAscii(text: string): string {
  const chars = [...text];
  let out = '';
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i]!;
    if (ch.charCodeAt(0) < 0x80) {
      out += ch;
      continue;
    }
    let mapped = MAP[ch];
    // Büyük harfli kelimede iki harfli açılım da büyük olsun: GETRÄNKE → GETRAENKE, Äpfel → Aepfel.
    if (mapped !== undefined && mapped.length > 1 && isUpperLetter(ch)) {
      const next = chars[i + 1];
      const allCaps = isUpperLetter(next) || (!isLetter(next) && isUpperLetter(chars[i - 1]));
      if (allCaps) mapped = mapped.toUpperCase();
    }
    if (mapped !== undefined) {
      out += mapped;
      continue;
    }
    // é → e, ñ → n, å → a …: aksan işaretleri ayrıştırılıp atılır; kalan yine ASCII değilse '?'.
    const base = ch.normalize('NFD').replace(/[̀-ͯ]/g, '');
    out += /^[\x20-\x7e]+$/.test(base) ? base : '?';
  }
  return out;
}

// Sade harfe çevrilince uzayan satır (ß→ss, €→EUR) yazıcıda alt satıra taşmasın: fazlalık,
// satır içindeki sütun dolgusundan (sondan başlayarak, satır başı girintisine dokunmadan,
// her boşluk dizisinde en az bir boşluk bırakarak) kırpılır.
function shrinkPadding(text: string, extra: number): string {
  let out = text;
  const runs = [...out.matchAll(/ {2,}/g)].filter((m) => (m.index ?? 0) > 0);
  for (let r = runs.length - 1; r >= 0 && extra > 0; r--) {
    const m = runs[r]!;
    const end = m.index! + m[0].length;
    const cut = Math.min(extra, m[0].length - 1);
    out = out.slice(0, end - cut) + out.slice(end);
    extra -= cut;
  }
  return out;
}

export function toAsciiKeepingWidth(text: string): string {
  const folded = toAscii(text);
  const extra = folded.length - text.length;
  return extra > 0 ? shrinkPadding(folded, extra) : folded;
}

/**
 * Ajanın ve `test-print`in ortak fiş üretimi. `ascii` kapalıyken davranış öncekiyle aynıdır
 * (site ayarındaki `transliterate`). Açıkken satır kırma doğru hesaplansın diye önce yük
 * sadeleştirilir; ardından fişin kendi sabit metinleri için üretilen satırlar, genişlikleri
 * korunarak sadeleştirilir.
 */
export function renderTicketForPrinter(payload: TicketPayload, s: { transliterate: boolean; ascii?: boolean }): Line[] {
  if (!s.ascii) return renderTicket(payload, { transliterate: s.transliterate });
  const folded = JSON.parse(JSON.stringify(payload), (_key, value: unknown) =>
    typeof value === 'string' ? toAscii(value) : value,
  ) as TicketPayload;
  return renderTicket(folded).map((l) => (l.kind === 'text' ? { ...l, text: toAsciiKeepingWidth(l.text) } : l));
}
