import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FoundPrinter, RamosPrinterPlugin } from '../../../native/capacitor';
import {
  applyFoundPrinter,
  discoverPrinters,
  discoverySupport,
  normalizeDiscovery,
  presetForFound,
  primaryNetwork,
} from './printerDiscovery';
import type { SettingsForm } from './settingsLogic';

type W = Window & { Capacitor?: unknown };

function mockNative(plugin: Partial<RamosPrinterPlugin> | null) {
  (window as W).Capacitor = {
    isNativePlatform: () => true,
    Plugins: plugin ? { RamosPrinter: plugin } : {},
  };
}

const form: SettingsForm = {
  restaurant_name: 'R',
  business_day_start: '05:00',
  ticket_header: 'H',
  ticket_footer: '',
  printer_host: '192.168.1.50',
  printer_port: '9100',
  codepage: 'cp857/61',
  printer_transliterate: false,
  quick_notes: [],
  cancel_reasons: [],
  allergen_legend: [],
};

const found = (over: Partial<FoundPrinter> = {}): FoundPrinter => ({
  host: '192.168.2.198',
  port: 443,
  kind: 'epson_epos',
  confirmed: true,
  ...over,
});

afterEach(() => {
  delete (window as W).Capacitor;
});

describe('discoverySupport', () => {
  it('tarayıcıda yok, eski APK old_app, yeni APK ready', () => {
    expect(discoverySupport()).toBe('browser');
    mockNative({ send: vi.fn(), status: vi.fn() });
    expect(discoverySupport()).toBe('old_app');
    mockNative({ send: vi.fn(), status: vi.fn(), discover: vi.fn() });
    expect(discoverySupport()).toBe('ready');
  });
});

describe('normalizeDiscovery', () => {
  it('geçerli yanıtı olduğu gibi alır, bozuk satırları atar', () => {
    const r = normalizeDiscovery({
      ok: true,
      networks: [{ address: '192.168.2.17', prefix: 24, transport: 'wifi' }, { nope: 1 }],
      printers: [
        { host: ' 192.168.2.198 ', port: 443, kind: 'epson_epos', confirmed: true, status: '121212' },
        { host: '192.168.2.40', port: 9100, kind: 'weird', confirmed: false, message: 'x' },
        { host: '', port: 9100, kind: 'escpos' },
        { host: '192.168.2.41', port: 70000, kind: 'escpos' },
        null,
      ],
      scanned: 254,
      durationMs: 8123,
    });
    expect(r).toEqual({
      ok: true,
      networks: [{ address: '192.168.2.17', prefix: 24, transport: 'wifi' }],
      printers: [
        {
          host: '192.168.2.198',
          port: 443,
          kind: 'epson_epos',
          confirmed: true,
          status: '121212',
          message: undefined,
        },
        {
          host: '192.168.2.40',
          port: 9100,
          kind: 'open',
          confirmed: false,
          status: undefined,
          message: 'x',
        },
      ],
      scanned: 254,
      durationMs: 8123,
    });
  });

  it('hata zarfını korur, bilinmeyen hata io olur', () => {
    expect(normalizeDiscovery({ ok: false, error: 'no_network', message: 'm' })).toEqual({
      ok: false,
      error: 'no_network',
      message: 'm',
    });
    expect(normalizeDiscovery({ ok: false, error: 'busy' })).toEqual({
      ok: false,
      error: 'busy',
      message: undefined,
    });
    expect(normalizeDiscovery({ ok: false, error: 'whatever' }).ok).toBe(false);
    expect(normalizeDiscovery(undefined)).toEqual({ ok: false, error: 'io', message: 'no_response' });
    expect(normalizeDiscovery('x')).toMatchObject({ ok: false, error: 'io' });
  });
});

describe('discoverPrinters', () => {
  it('eklenti yoksa unsupported, reddederse io — asla fırlatmaz', async () => {
    expect(await discoverPrinters()).toEqual({ ok: false, error: 'unsupported' });
    mockNative({ send: vi.fn(), status: vi.fn(), discover: vi.fn().mockRejectedValue(new Error('boom')) });
    expect(await discoverPrinters()).toEqual({ ok: false, error: 'io', message: 'boom' });
  });

  it('kayıtlı adresi (kırpılmış) yerel tarafa verir; boşsa vermez', async () => {
    const discover = vi.fn().mockResolvedValue({ ok: true, printers: [], networks: [], scanned: 0 });
    mockNative({ send: vi.fn(), status: vi.fn(), discover });
    await discoverPrinters(' 192.168.2.198 ');
    expect(discover).toHaveBeenLastCalledWith({ host: '192.168.2.198' });
    await discoverPrinters('   ');
    expect(discover).toHaveBeenLastCalledWith({});
  });
});

describe('presetForFound / applyFoundPrinter', () => {
  it('kanıt türü hazır seçimi belirler, aday yalnız portundan', () => {
    expect(presetForFound({ kind: 'epson_epos', port: 80 })).toBe('epson_epos');
    expect(presetForFound({ kind: 'epson_secure', port: 9143 })).toBe('epson');
    expect(presetForFound({ kind: 'escpos', port: 9100 })).toBe('xprinter');
    expect(presetForFound({ kind: 'open', port: 9143 })).toBe('epson');
    expect(presetForFound({ kind: 'open', port: 80 })).toBe('epson_epos');
    expect(presetForFound({ kind: 'escpos', port: 9101 })).toBe('custom');
  });

  it('adres, port ve karakter tablosunu doldurur; özel portta tablo değişmez', () => {
    expect(applyFoundPrinter(form, found())).toMatchObject({
      printer_host: '192.168.2.198',
      printer_port: '443',
      codepage: 'windows1254/48',
      ticket_header: 'H',
    });
    expect(applyFoundPrinter(form, found({ kind: 'escpos', port: 9101 }))).toMatchObject({
      printer_port: '9101',
      codepage: 'cp857/61',
    });
  });
});

describe('primaryNetwork', () => {
  it('Wi-Fi öncelikli, yoksa ilk, hiç yoksa null', () => {
    const eth = { address: '10.0.0.5', prefix: 24, transport: 'ethernet' };
    const wifi = { address: '192.168.1.5', prefix: 24, transport: 'wifi' };
    expect(primaryNetwork([eth, wifi])).toBe(wifi);
    expect(primaryNetwork([eth])).toBe(eth);
    expect(primaryNetwork([])).toBeNull();
  });
});
