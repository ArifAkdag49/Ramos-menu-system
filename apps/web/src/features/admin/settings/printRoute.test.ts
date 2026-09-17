import { describe, expect, it } from 'vitest';
import { sdpConnection, sdpPrinterUrl } from './printRoute';

describe('sdpPrinterUrl', () => {
  it('Supabase adresinden fonksiyon adresi + anahtar', () => {
    expect(sdpPrinterUrl('https://abc.supabase.co', 'f'.repeat(64))).toBe(
      `https://abc.supabase.co/functions/v1/epson-sdp?t=${'f'.repeat(64)}`,
    );
  });
  it('sondaki eğik çizgi çift yazılmaz', () => {
    expect(sdpPrinterUrl('https://abc.supabase.co/', 'aa')).toBe('https://abc.supabase.co/functions/v1/epson-sdp?t=aa');
  });
});

describe('sdpConnection', () => {
  const now = new Date('2026-09-17T12:00:00Z');
  it('hiç bağlanmadı', () => expect(sdpConnection(null, now)).toBe('never'));
  it('son 90 sn içinde istek geldiyse bağlı', () =>
    expect(sdpConnection('2026-09-17T11:58:40Z', now)).toBe('online'));
  it('90 sn\'den eskiyse bağlantı yok', () =>
    expect(sdpConnection('2026-09-17T11:58:20Z', now)).toBe('offline'));
});
