import { describe, expect, it, vi } from 'vitest';
import type { FoundPrinter } from './discover';
import { parseNeighborOutput, PrinterRediscovery } from './rediscover';
import { parseStatus } from './status';

const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
const settings = { host: '192.168.178.20', port: 9100, codepage: 'cp857', codepageNumber: 61, transliterate: false };

const printer = (host: string, escpos = true): FoundPrinter => ({
  host,
  port: 9100,
  escpos,
  state: parseStatus(escpos ? Uint8Array.from([0x12, 0x12, 0x12]) : new Uint8Array()),
});

function make(opts: { found: FoundPrinter[]; macs?: Record<string, string | null>; knownMac?: string | null }) {
  const macOf = vi.fn(async (ip: string) => opts.macs?.[ip] ?? null);
  const onMacLearned = vi.fn();
  const r = new PrinterRediscovery({
    log,
    knownMac: opts.knownMac ?? null,
    onMacLearned,
    discover: vi.fn(async () => opts.found),
    networks: () => [],
    macOf,
  });
  return { r, macOf, onMacLearned };
}

describe('parseNeighborOutput', () => {
  it('Windows `arp -a` satırını okur (Almanca/Türkçe başlıklardan bağımsız)', () => {
    const out = [
      '',
      'Schnittstelle: 192.168.178.127 --- 0xc',
      '  Internetadresse       Physische Adresse     Typ',
      '  192.168.178.25        02-b0-3e-f5-25-de     dynamisch',
    ].join('\r\n');
    expect(parseNeighborOutput(out, '192.168.178.25')).toBe('02:b0:3e:f5:25:de');
    expect(parseNeighborOutput(out, '192.168.178.26')).toBeNull();
  });

  it('Linux `ip neigh show` satırını okur; yayın ve boş adresi yok sayar', () => {
    expect(parseNeighborOutput('192.168.1.87 dev eth0 lladdr 00:11:22:AA:BB:CC REACHABLE', '192.168.1.87')).toBe('00:11:22:aa:bb:cc');
    expect(parseNeighborOutput('192.168.1.255 dev eth0 lladdr ff:ff:ff:ff:ff:ff PERMANENT', '192.168.1.255')).toBeNull();
  });
});

describe('PrinterRediscovery.find', () => {
  it('MAC bilinmiyorsa ve ağda tek ESC/POS yazıcı varsa onun adresini döner', async () => {
    const { r } = make({ found: [printer('192.168.178.20'), printer('192.168.178.31')] });
    expect(await r.find(settings)).toBe('192.168.178.31');
  });

  it('MAC bilinmiyorsa ve birden fazla yazıcı varsa geçmez (yanlış yazıcıya fiş gitmesin)', async () => {
    const { r } = make({ found: [printer('192.168.178.31'), printer('192.168.178.40')] });
    expect(await r.find(settings)).toBeNull();
  });

  it('MAC biliniyorsa birden fazla yazıcı arasından MAC eşleşeni seçer — durum sorusuna cevap vermeyen bile', async () => {
    const { r } = make({
      knownMac: '02:b0:3e:f5:25:de',
      found: [printer('192.168.178.31'), printer('192.168.178.40', false)],
      macs: { '192.168.178.31': '00:11:22:33:44:55', '192.168.178.40': '02:b0:3e:f5:25:de' },
    });
    expect(await r.find(settings)).toBe('192.168.178.40');
  });

  it('MAC biliniyor, adayların MAC\'i okundu ama eşleşmiyorsa tek yazıcı olsa bile geçmez', async () => {
    const { r } = make({
      knownMac: '02:b0:3e:f5:25:de',
      found: [printer('192.168.178.31')],
      macs: { '192.168.178.31': '00:11:22:33:44:55' },
    });
    expect(await r.find(settings)).toBeNull();
  });

  it('MAC biliniyor ama hiçbir adayın MAC\'i okunamıyorsa tek-yazıcı kuralına düşer', async () => {
    const { r } = make({ knownMac: '02:b0:3e:f5:25:de', found: [printer('192.168.178.31')] });
    expect(await r.find(settings)).toBe('192.168.178.31');
  });

  it('yalnız eski adres bulunduysa null döner', async () => {
    const { r } = make({ found: [printer('192.168.178.20')] });
    expect(await r.find(settings)).toBeNull();
  });
});

describe('PrinterRediscovery.learn', () => {
  it('MAC\'i bir kez öğrenir ve bildirir; aynı adres için tekrar sormaz', async () => {
    const { r, macOf, onMacLearned } = make({ found: [], macs: { '192.168.178.20': '02-B0-3E-F5-25-DE' } });
    await r.learn('192.168.178.20');
    await r.learn('192.168.178.20');
    expect(r.knownMac).toBe('02:b0:3e:f5:25:de');
    expect(onMacLearned).toHaveBeenCalledTimes(1);
    expect(macOf).toHaveBeenCalledTimes(1);
  });

  it('MAC okunamazsa aynı adres için en fazla 3 kez dener', async () => {
    const { r, macOf, onMacLearned } = make({ found: [] });
    for (let i = 0; i < 5; i++) await r.learn('192.168.178.20');
    expect(macOf).toHaveBeenCalledTimes(3);
    expect(onMacLearned).not.toHaveBeenCalled();
  });

  it('zaten bilinen MAC yeniden bildirilmez', async () => {
    const { onMacLearned, r } = make({ found: [], knownMac: '02:b0:3e:f5:25:de', macs: { '192.168.178.20': '02:b0:3e:f5:25:de' } });
    await r.learn('192.168.178.20');
    expect(onMacLearned).not.toHaveBeenCalled();
  });
});
