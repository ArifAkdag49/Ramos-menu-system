const eur = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });

export const formatEuro = (cents: number): string => eur.format(cents / 100);

export const formatOrderNo = (n: number): string => `#${String(n).padStart(3, '0')}`;
