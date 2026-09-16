/**
 * Durum renkleri (spec §8.5) — her yüzeyde aynı anlamı taşır.
 * Renk tek başına anlam taşımaz; yanında her zaman ikon + yazı bulunur.
 */
export type Tone = 'empty' | 'open' | 'ready' | 'danger' | 'warning' | 'info';

export const TONE_CLASS: Record<Tone, string> = {
  empty: 'border-border bg-surface-2 text-muted',
  open: 'border-lime/40 bg-lime/15 text-lime',
  ready: 'border-gold/40 bg-gold/15 text-gold',
  danger: 'border-danger/40 bg-danger/15 text-danger',
  warning: 'border-warning/40 bg-warning/15 text-warning',
  info: 'border-info/40 bg-info/15 text-info',
};
