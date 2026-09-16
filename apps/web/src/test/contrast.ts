/**
 * WCAG 2.1 bağıl parlaklık ve kontrast oranı hesabı.
 *
 * Yalnız testler kullanır (uygulama paketine girmez). Amacı: DESIGN.md'deki kontrast
 * iddialarının elle yazılmış sayılar değil, `tokens.css`'ten okunup hesaplanan ve
 * bozulunca testi kıran değerler olması.
 */

export function parseHex(hex: string): [number, number, number] {
  const h = hex.trim().replace('#', '');
  const full =
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h.slice(0, 6);
  const r = Number.parseInt(full.slice(0, 2), 16);
  const g = Number.parseInt(full.slice(2, 4), 16);
  const b = Number.parseInt(full.slice(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) throw new Error(`geçersiz renk: ${hex}`);
  return [r, g, b];
}

const channel = (v: number): number => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

export function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHex(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** `fg` rengini `alpha` opaklıkla `bg` üzerine bindirir (Tailwind'deki `bg-x/15` karşılığı). */
export function overlay(fg: string, bg: string, alpha: number): string {
  const f = parseHex(fg);
  const b = parseHex(bg);
  const mix = f.map((c, i) => Math.round(c * alpha + (b[i] ?? 0) * (1 - alpha)));
  return `#${mix.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

/** `tokens.css`'teki `@theme` bloğundan `--color-*` değerlerini okur. */
export function readTokens(css: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of css.matchAll(/--color-([a-z0-9-]+):\s*(#[0-9a-fA-F]{3,8})/g)) {
    const name = m[1];
    const value = m[2];
    if (name && value) out[name] = value;
  }
  return out;
}
