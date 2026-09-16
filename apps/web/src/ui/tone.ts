/**
 * Durum renkleri (spec §8.5) — her yüzeyde aynı anlamı taşır.
 * Renk tek başına anlam taşımaz; yanında her zaman ikon + yazı bulunur.
 */
export type Tone = 'empty' | 'open' | 'ready' | 'danger' | 'warning' | 'info';

export const TONE_CLASS: Record<Tone, string> = {
  empty: 'border-border bg-surface-2 text-muted',
  open: 'border-lime/40 bg-lime/15 text-lime',
  ready: 'border-gold/40 bg-gold/15 text-gold',
  danger: 'border-danger/40 bg-danger/15 text-danger-ink',
  warning: 'border-warning/40 bg-warning/15 text-warning',
  info: 'border-info/40 bg-info/15 text-info',
};

/**
 * Aynı anlam, **opak** yüzeyde: renk kenarlıkta, metinde ve ikonda kalır; zemin her zaman
 * `surface-2`'dir. R81 — toast bir sayfa başlığının ya da panelin üstünde durabiliyor; %15 opak
 * tint koyu gövde üzerinde okunuyordu ama opak bir başlığın üstünde arkadaki metinle iç içe
 * geçiyordu. Rozet ve şerit (`TONE_CLASS`) her zaman gövde akışında durduğu için tint'te kalır.
 */
export const TONE_SOLID: Record<Tone, string> = {
  empty: 'border-border bg-surface-2 text-muted',
  open: 'border-lime/40 bg-surface-2 text-lime',
  ready: 'border-gold/40 bg-surface-2 text-gold',
  danger: 'border-danger/40 bg-surface-2 text-danger-ink',
  warning: 'border-warning/40 bg-surface-2 text-warning',
  info: 'border-info/40 bg-surface-2 text-info',
};
