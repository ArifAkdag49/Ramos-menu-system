import { encodeLines, renderTicket, type TicketPayload } from '@ramos/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RpcError } from '../../lib/rpc';
import {
  __resetStationIdForTests,
  getStationId,
  isUnreachableError,
  jobToBytes,
  sendErrorText,
  shouldRetryComplete,
  stateFromHex,
  STATION_ID_KEY,
  stationPrinterConfig,
  type StationPrinterConfig,
} from './stationLogic';

const payload: TicketPayload = {
  kind: 'order',
  header: "RAMO'S",
  table: 'Tisch 12',
  orderNo: 47,
  round: 1,
  createdAt: '2026-09-17T12:00:00Z',
  waiter: 'Ayşe',
  note: null,
  items: [
    {
      qty: 2,
      code: '05',
      name: 'Drehspieß Sandwich',
      isBeverage: false,
      variant: null,
      without: ['Soğan'],
      groups: [],
      note: null,
    },
  ],
};

const cfg: StationPrinterConfig = {
  host: '192.168.1.50',
  port: 9100,
  codepage: 'cp857',
  codepageNumber: 61,
  transliterate: false,
};

function memoryStore(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: vi.fn((k: string) => data.get(k) ?? null),
    setItem: vi.fn((k: string, v: string) => void data.set(k, v)),
    data,
  };
}

beforeEach(() => __resetStationIdForTests());

describe('getStationId', () => {
  it('yoksa üretir ve saklar; sonraki çağrılar aynı kimliği döner', () => {
    const store = memoryStore();
    const uuid = vi.fn(() => 'uuid-1');
    expect(getStationId(store, uuid)).toBe('uuid-1');
    expect(store.data.get(STATION_ID_KEY)).toBe('uuid-1');
    expect(getStationId(store, uuid)).toBe('uuid-1');
    expect(uuid).toHaveBeenCalledOnce();
  });

  it('kayıtlı kimlik korunur', () => {
    expect(getStationId(memoryStore({ [STATION_ID_KEY]: 'tablet-a' }), () => 'x')).toBe('tablet-a');
  });

  it('depolama fırlatırsa (özel mod) çökmez; oturum boyunca aynı kimlik', () => {
    const broken = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('SecurityError');
      },
    };
    const uuid = vi.fn(() => 'session-1');
    expect(getStationId(broken, uuid)).toBe('session-1');
    expect(getStationId(broken, uuid)).toBe('session-1');
    expect(getStationId(null, uuid)).toBe('session-1');
    expect(uuid).toHaveBeenCalledOnce();
  });

  it('varsayılan: localStorage + gerçek uuid', () => {
    localStorage.removeItem(STATION_ID_KEY);
    const id = getStationId();
    expect(id).toMatch(/^[0-9a-f-]{8,}/);
    expect(localStorage.getItem(STATION_ID_KEY)).toBe(id);
  });
});

describe('stationPrinterConfig', () => {
  const row = {
    printer_host: ' 192.168.1.50 ',
    printer_port: 9143,
    printer_codepage: 'windows1254',
    printer_codepage_number: 48,
    printer_transliterate: true,
  };
  it('ayar satırından yazıcı bilgisi (adres kırpılır)', () => {
    expect(stationPrinterConfig(row)).toEqual({
      host: '192.168.1.50',
      port: 9143,
      codepage: 'windows1254',
      codepageNumber: 48,
      transliterate: true,
    });
  });
  it('adres boş, port geçersiz ya da ayar yoksa null', () => {
    expect(stationPrinterConfig({ ...row, printer_host: '  ' })).toBeNull();
    expect(stationPrinterConfig({ ...row, printer_port: 0 })).toBeNull();
    expect(stationPrinterConfig({ ...row, printer_port: 70000 })).toBeNull();
    expect(stationPrinterConfig(undefined)).toBeNull();
  });
});

describe('jobToBytes', () => {
  it('renderTicket + paylaşılan encodeLines ile aynı baytlar (ajanla birebir)', () => {
    const bytes = jobToBytes(payload, cfg);
    const expected = encodeLines(renderTicket(payload, { transliterate: false }), {
      codepage: 'cp857',
      codepageNumber: 61,
    });
    expect(bytes).toEqual(expected);
    // ESC @ + FS . + ESC t 61 … GS V 66 0
    expect(Array.from(bytes.slice(0, 7))).toEqual([0x1b, 0x40, 0x1c, 0x2e, 0x1b, 0x74, 61]);
    expect(Array.from(bytes.slice(-4))).toEqual([0x1d, 0x56, 0x42, 0x00]);
  });

  it('sade harf ayarı Türkçe harfleri sadeleştirir', () => {
    const plain = jobToBytes(payload, { ...cfg, transliterate: true });
    expect(plain).toEqual(
      encodeLines(renderTicket(payload, { transliterate: true }), {
        codepage: 'cp857',
        codepageNumber: 61,
      }),
    );
    expect(plain).not.toEqual(jobToBytes(payload, cfg));
  });

  it('uyuşmayan kod sayfası fırlatır (iş başarısız kapatılsın diye)', () => {
    expect(() => jobToBytes(payload, { ...cfg, codepageNumber: 91 })).toThrow(/uyuşmayan codepage/);
  });
});

describe('hata ve durum eşleme', () => {
  it('eklenti hatası → p_error metni', () => {
    expect(sendErrorText({ error: 'cover_open', message: 'Kapak açık' })).toBe(
      'cover_open: Kapak açık',
    );
    expect(sendErrorText({ error: 'timeout' })).toBe('timeout: timeout');
    expect(sendErrorText({})).toBe('io: io');
  });

  it('bağlantı hataları ulaşılamıyor sayılır; kapak/kâğıt sayılmaz', () => {
    expect(isUnreachableError('offline')).toBe(true);
    expect(isUnreachableError('timeout')).toBe(true);
    expect(isUnreachableError('io')).toBe(true);
    expect(isUnreachableError('cover_open')).toBe(false);
    expect(isUnreachableError('paper_end')).toBe(false);
  });

  it('onaltılık durum → PrinterState; yanıt yoksa null, kısa yanıt bilinmiyor', () => {
    expect(stateFromHex(undefined)).toBeNull();
    expect(stateFromHex('')).toBeNull();
    expect(stateFromHex('160000')).toMatchObject({
      known: true,
      offline: false,
      cover_open: false,
      raw: '160000',
    });
    expect(stateFromHex('16240c')).toMatchObject({
      known: true,
      cover_open: true,
      paper_near_end: true,
    });
    expect(stateFromHex('16')).toMatchObject({ known: false });
  });

  it('complete yeniden denemesi: ağ/bilinmeyen evet; iş artık bizim değilse hayır', () => {
    expect(shouldRetryComplete(new RpcError('network'))).toBe(true);
    expect(shouldRetryComplete(new RpcError('unknown'))).toBe(true);
    expect(shouldRetryComplete(new Error('Failed to fetch'))).toBe(true);
    expect(shouldRetryComplete(new RpcError('job_not_printing'))).toBe(false);
    expect(shouldRetryComplete(new RpcError('job_not_found'))).toBe(false);
    expect(shouldRetryComplete(new RpcError('not_authorized'))).toBe(false);
  });
});
