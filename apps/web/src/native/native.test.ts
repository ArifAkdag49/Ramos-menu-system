import { afterEach, describe, expect, it } from 'vitest';
import { base64ToBytes, bytesToBase64, hexToBytes } from './base64';
import { isNative, nativePlugin } from './capacitor';

type W = Window & { Capacitor?: unknown };

afterEach(() => {
  delete (window as W).Capacitor;
});

describe('isNative / nativePlugin', () => {
  it('tarayıcıda (Capacitor yok) false ve eklenti null', () => {
    expect(isNative()).toBe(false);
    expect(nativePlugin('RamosPrinter')).toBeNull();
  });

  it('köprü enjekte edilmiş yerel uygulamada true; eklenti Plugins altından gelir', () => {
    const RamosPrinter = { send: () => {}, status: () => {} };
    (window as W).Capacitor = { isNativePlatform: () => true, Plugins: { RamosPrinter } };
    expect(isNative()).toBe(true);
    expect(nativePlugin('RamosPrinter')).toBe(RamosPrinter);
    expect(nativePlugin('PushNotifications')).toBeNull();
  });

  it('köprü var ama yerel platform değil (Capacitor web) → false', () => {
    (window as W).Capacitor = { isNativePlatform: () => false, Plugins: { RamosPrinter: {} } };
    expect(isNative()).toBe(false);
    expect(nativePlugin('RamosPrinter')).toBeNull();
  });

  it('bozuk köprü fırlatsa bile false', () => {
    (window as W).Capacitor = {
      isNativePlatform: () => {
        throw new Error('x');
      },
    };
    expect(isNative()).toBe(false);
  });
});

describe('base64 / hex', () => {
  it('Uint8Array → base64 ve geri', () => {
    const bytes = new Uint8Array([0x1b, 0x40, 0x1c, 0x2e, 0xff, 0x00]);
    expect(bytesToBase64(bytes)).toBe('G0AcLv8A');
    expect(Array.from(base64ToBytes('G0AcLv8A'))).toEqual(Array.from(bytes));
  });

  it('boş dizi', () => expect(bytesToBase64(new Uint8Array())).toBe(''));

  it('büyük fiş (yığın sınırını aşan boyut) bozulmadan çevrilir', () => {
    const big = new Uint8Array(200_000).map((_, i) => i % 256);
    expect(base64ToBytes(bytesToBase64(big))).toEqual(big);
  });

  it('onaltılık durum → baytlar; geçersiz girdi boş', () => {
    expect(Array.from(hexToBytes('16 00 0c'))).toEqual([0x16, 0x00, 0x0c]);
    expect(Array.from(hexToBytes('A0ff'))).toEqual([0xa0, 0xff]);
    expect(hexToBytes('abc').length).toBe(0);
    expect(hexToBytes('zz').length).toBe(0);
  });
});
