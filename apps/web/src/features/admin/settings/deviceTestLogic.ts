import type { TicketPayload } from '@ramos/shared';
import { bytesToBase64 } from '../../../native/base64';
import type { RamosPrinterErrorCode, RamosPrinterPlugin } from '../../../native/capacitor';
import { withPrinterLock } from '../../station/stationRunner';
import { jobToBytes, type StationPrinterConfig } from '../../station/stationLogic';
import { hostValid, parseCodepageValue, portValid, type SettingsForm } from './settingsLogic';

/**
 * Ayarlar > Yazıcı bağlantısı > **Bu cihazdan test fişi bas** (yalnız Android uygulaması).
 *
 * Neden ayrı bir yol: "Test fişi bas" (`enqueue_test_print`) fişi ORTAK sıraya koyar; sırayı hangi
 * istasyon önce alırsa o basar. Restorandaki istasyon sürekli açık olduğu için başka bir yerde
 * (kurulumcunun kendi yazıcısı, yeni bir yazıcı denemesi) yapılan test fişi restoranın mutfağından
 * çıkıyordu (15.10.2026). Bu yol fişi sıraya hiç koymaz ve ayarı kaydetmez: formdaki adrese (kaydedilmemiş
 * olsa da) bu telefondan doğrudan basar. Restoranın istasyonu ve kayıtlı ayar etkilenmez.
 */

export type DeviceTestTarget =
  | { ok: true; cfg: StationPrinterConfig }
  | { ok: false; error: 'host_missing' | 'host_invalid' | 'port_invalid' };

/** Formdaki (kaydedilmemiş olabilir) yazıcı alanlarından baskı hedefi. */
export function deviceTestTarget(
  form: Pick<SettingsForm, 'printer_host' | 'printer_port' | 'codepage' | 'printer_transliterate'>,
): DeviceTestTarget {
  const host = form.printer_host.trim();
  if (!host) return { ok: false, error: 'host_missing' };
  if (!hostValid(host)) return { ok: false, error: 'host_invalid' };
  if (!portValid(form.printer_port)) return { ok: false, error: 'port_invalid' };
  const cp = parseCodepageValue(form.codepage) ?? { codepage: 'cp857', number: 61 };
  return {
    ok: true,
    cfg: {
      host,
      port: Number(form.printer_port.trim()),
      codepage: cp.codepage,
      codepageNumber: cp.number,
      transliterate: form.printer_transliterate,
    },
  };
}

/**
 * `enqueue_test_print` (0007) ile aynı fiş: TESTDRUCK başlığı, tarih, "Drucker: <adres>" satırı,
 * karakter tablosu ve deneme satırı. Fişteki adres satırı hangi yazıcıya gönderildiğini zaten söyler.
 */
export function deviceTestPayload(
  cfg: StationPrinterConfig,
  form: Pick<SettingsForm, 'ticket_header' | 'ticket_footer'>,
  waiter: string,
  now: Date,
): TicketPayload {
  const footer = form.ticket_footer.trim();
  return {
    kind: 'test',
    header: form.ticket_header.trim(),
    ...(footer ? { footer } : {}),
    table: 'Tisch 12',
    orderNo: 0,
    round: 1,
    createdAt: now.toISOString(),
    waiter,
    note: 'Testdruck',
    settings: {
      host: cfg.host,
      port: cfg.port,
      codepage: cfg.codepage,
      codepageNumber: cfg.codepageNumber,
      transliterate: cfg.transliterate,
    },
    sampleLine: 'ÄÖÜ äöü ß · Şş Ğğ İı Çç · 0123456789 · #*-+ · €',
    items: [
      {
        qty: 2,
        code: '05',
        name: 'Drehspieß Sandwich',
        isBeverage: false,
        variant: 'Kalb',
        without: ['Zwiebeln', 'Tomaten'],
        groups: [
          { label: 'Soße', format: 'label_values', values: ['Knoblauch', 'Joghurtsoße'] },
          { label: 'Extras', format: 'plus_each', values: ['Extra Weichkäse'] },
        ],
        note: 'Soße extra',
        priceCents: 1700,
      },
      {
        qty: 3,
        code: null,
        name: 'Cola 0,33 l',
        isBeverage: true,
        variant: null,
        without: [],
        groups: [],
        note: null,
        priceCents: 900,
      },
    ],
  };
}

export type DeviceTestError = RamosPrinterErrorCode | 'encode';

export type DeviceTestOutcome =
  | { ok: true; target: string }
  | { ok: false; target: string; error: DeviceTestError; message?: string };

/**
 * Fişi bu cihazdan basar. Asla fırlatmaz: kodlama hatası (`encode`) ve eklenti hatası sonuca döner.
 * Durum okuma açık (`checkStatus`): kapak açık / kâğıt yoksa bayt gönderilmez, sebep söylenir.
 */
export async function printDeviceTest(
  printer: RamosPrinterPlugin,
  cfg: StationPrinterConfig,
  payload: TicketPayload,
  timeoutMs = 10_000,
): Promise<DeviceTestOutcome> {
  const target = `${cfg.host}:${cfg.port}`;
  let data: string;
  try {
    data = bytesToBase64(jobToBytes(payload, cfg));
  } catch (e) {
    return {
      ok: false,
      target,
      error: 'encode',
      message: e instanceof Error ? e.message : String(e),
    };
  }
  try {
    const res = await withPrinterLock(() =>
      printer.send({ host: cfg.host, port: cfg.port, data, timeoutMs, checkStatus: true }),
    );
    if (res?.ok) return { ok: true, target };
    return { ok: false, target, error: res?.error ?? 'io', message: res?.message };
  } catch (e) {
    return { ok: false, target, error: 'io', message: e instanceof Error ? e.message : String(e) };
  }
}
