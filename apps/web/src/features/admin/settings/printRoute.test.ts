import { describe, expect, it } from 'vitest';
import {
  idleNoteKey,
  PRINT_ROUTES,
  sdpConnection,
  sdpPrinterUrl,
  toPrintRoute,
} from './printRoute';

describe('sdpPrinterUrl', () => {
  it('Supabase adresinden fonksiyon adresi + anahtar', () => {
    expect(sdpPrinterUrl('https://abc.supabase.co', 'f'.repeat(64))).toBe(
      `https://abc.supabase.co/functions/v1/epson-sdp?t=${'f'.repeat(64)}`,
    );
  });
  it('sondaki eğik çizgi çift yazılmaz', () => {
    expect(sdpPrinterUrl('https://abc.supabase.co/', 'aa')).toBe(
      'https://abc.supabase.co/functions/v1/epson-sdp?t=aa',
    );
  });
});

describe('sdpConnection', () => {
  const now = new Date('2026-09-17T12:00:00Z');
  it('hiç bağlanmadı', () => expect(sdpConnection(null, now)).toBe('never'));
  it('son 90 sn içinde istek geldiyse bağlı', () =>
    expect(sdpConnection('2026-09-17T11:58:40Z', now)).toBe('online'));
  it("90 sn'den eskiyse bağlantı yok", () =>
    expect(sdpConnection('2026-09-17T11:58:20Z', now)).toBe('offline'));
});

describe('toPrintRoute / idleNoteKey', () => {
  it('üç yol olduğu gibi; bilinmeyen ya da boş değer ajana düşer', () => {
    expect(PRINT_ROUTES).toEqual(['agent', 'epson_sdp', 'station']);
    expect(toPrintRoute('station')).toBe('station');
    expect(toPrintRoute('epson_sdp')).toBe('epson_sdp');
    expect(toPrintRoute('usb')).toBe('agent');
    expect(toPrintRoute(undefined)).toBe('agent');
  });
  it('ajan yolunda not yok; SDP ve istasyonda kendi notu', () => {
    expect(idleNoteKey('agent')).toBeNull();
    expect(idleNoteKey('epson_sdp')).toBe('admin.settings.printRoute.agentIdleNote');
    expect(idleNoteKey('station')).toBe('admin.settings.printRoute.stationIdleNote');
  });
});
