import net from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { discoverPrinters, intToIp, ipToInt, isPrivateIpv4, localNetworks, looksLikeEscPos, scanTargets } from './discover';
import { startFakePrinter, type FakePrinter } from './fake-printer';
import { parseStatus } from './status';
import { testTlsCredentials } from './__fixtures__/testTls';

describe('ipToInt / intToIp', () => {
  it('gidiş-dönüş aynı adresi verir', () => {
    for (const ip of ['0.0.0.0', '192.168.1.250', '10.0.0.1', '255.255.255.255']) {
      expect(intToIp(ipToInt(ip))).toBe(ip);
    }
  });

  it('geçersiz adreste hata fırlatır', () => {
    expect(() => ipToInt('192.168.1')).toThrow();
    expect(() => ipToInt('192.168.1.256')).toThrow();
  });
});

describe('isPrivateIpv4', () => {
  it('10/8, 172.16/12 ve 192.168/16 özeldir; diğerleri değildir', () => {
    expect(isPrivateIpv4('10.1.2.3')).toBe(true);
    expect(isPrivateIpv4('172.20.0.5')).toBe(true);
    expect(isPrivateIpv4('192.168.178.20')).toBe(true);
    expect(isPrivateIpv4('172.32.0.1')).toBe(false);
    expect(isPrivateIpv4('87.106.47.17')).toBe(false);
  });
});

describe('scanTargets', () => {
  it('/24: ağ, yayın ve PC\'nin kendi adresi hariç 253 adres', () => {
    const t = scanTargets('192.168.1.12', 24);
    expect(t).toHaveLength(253);
    expect(t[0]).toBe('192.168.1.1');
    expect(t.at(-1)).toBe('192.168.1.254');
    expect(t).not.toContain('192.168.1.12');
    expect(t).not.toContain('192.168.1.0');
    expect(t).not.toContain('192.168.1.255');
  });

  it('/22 tamamen taranır (1021 adres)', () => {
    expect(scanTargets('192.168.178.20', 22)).toHaveLength(1021);
  });

  it('/16 gibi geniş ağlarda yalnız PC\'nin kendi /24\'ü taranır', () => {
    const t = scanTargets('10.20.30.40', 16);
    expect(t).toHaveLength(253);
    expect(t[0]).toBe('10.20.30.1');
  });

  it('/31 ve /32\'de taranacak adres yoktur', () => {
    expect(scanTargets('192.168.1.1', 31)).toEqual([]);
    expect(scanTargets('192.168.1.1', 32)).toEqual([]);
  });
});

describe('localNetworks', () => {
  const iface = (address: string, cidr: string, extra: Partial<{ internal: boolean; family: string }> = {}) => ({
    address, netmask: '255.255.255.0', family: 'IPv4', mac: '00:00:00:00:00:00', internal: false, cidr, ...extra,
  });

  it('yalnız fiziksel arayüzlerdeki özel IPv4 ağlarını döner', () => {
    const nets = localNetworks({
      Ethernet: [iface('192.168.1.12', '192.168.1.12/24'), { ...iface('fe80::1', 'fe80::1/64'), family: 'IPv6' }],
      'Wi-Fi': [iface('192.168.178.20', '192.168.178.20/24')],
      'vEthernet (WSL)': [iface('172.28.0.1', '172.28.0.1/20')],
      'Loopback Pseudo-Interface 1': [iface('127.0.0.1', '127.0.0.1/8', { internal: true })],
      APIPA: [iface('169.254.10.10', '169.254.10.10/16')],
      Genel: [iface('87.106.47.17', '87.106.47.17/24')],
    } as never);
    expect(nets).toEqual([
      { name: 'Ethernet', address: '192.168.1.12', prefix: 24 },
      { name: 'Wi-Fi', address: '192.168.178.20', prefix: 24 },
    ]);
  });
});

describe('looksLikeEscPos', () => {
  it('Xprinter normal cevabı (12 12 12) ESC/POS sayılır', () => {
    expect(looksLikeEscPos(parseStatus(Uint8Array.from([0x12, 0x12, 0x12])))).toBe(true);
  });

  it('kapak açık / kağıt yok gibi durumlar da ESC/POS biçimindedir (bit1 ve bit4 hep 1)', () => {
    expect(looksLikeEscPos(parseStatus(Uint8Array.from([0x1a, 0x16, 0x72])))).toBe(true);
  });

  it('cevapsız ya da biçimi uymayan cihaz ESC/POS sayılmaz', () => {
    expect(looksLikeEscPos(parseStatus(new Uint8Array()))).toBe(false);
    expect(looksLikeEscPos(parseStatus(Uint8Array.from([0x48, 0x54, 0x54])))).toBe(false); // "HTT"
  });
});

describe('discoverPrinters — gerçek TCP ile', () => {
  const cleanup: Array<() => Promise<void>> = [];
  afterEach(async () => {
    while (cleanup.length) await cleanup.pop()!();
  });

  it('durum sorusuna ESC/POS cevabı veren cihazı fiş yazıcısı olarak bulur', async () => {
    const printer: FakePrinter = await startFakePrinter({ port: 0 });
    cleanup.push(() => printer.stop());
    const found = await discoverPrinters({ networks: [], extraHosts: ['127.0.0.1'], port: printer.port, securePort: null });
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ host: '127.0.0.1', port: printer.port, tls: false, escpos: true });
    expect(found[0]).not.toHaveProperty('brand');
    expect(found[0]!.state.raw).toBe('121212');
  });

  it('portu açık ama durum sorusuna cevap vermeyen cihaz escpos=false ile listelenir', async () => {
    const printer = await startFakePrinter({ port: 0, silent: true });
    cleanup.push(() => printer.stop());
    const found = await discoverPrinters({ networks: [], extraHosts: ['127.0.0.1'], port: printer.port, securePort: null });
    expect(found).toEqual([expect.objectContaining({ host: '127.0.0.1', escpos: false })]);
  });

  it('port kapalıysa hiçbir şey bulunmaz', async () => {
    const server = net.createServer();
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    const port = (server.address() as net.AddressInfo).port;
    await new Promise<void>((r) => server.close(() => r()));
    const found = await discoverPrinters({ networks: [], extraHosts: ['127.0.0.1'], port, securePort: port + 1, connectMs: 300 });
    expect(found).toEqual([]);
  });

  it('ESC/POS cihazlar önce, sonra adrese göre sıralanır', async () => {
    const states: Record<string, number[]> = { '10.0.0.9': [0x12, 0x12, 0x12], '10.0.0.2': [], '10.0.0.5': [0x12, 0x12, 0x12] };
    const found = await discoverPrinters({
      networks: [],
      extraHosts: Object.keys(states),
      securePort: null,
      probe: async () => true,
      status: async (host) => parseStatus(Uint8Array.from(states[host]!)),
    });
    expect(found.map((f) => [f.host, f.escpos])).toEqual([
      ['10.0.0.5', true],
      ['10.0.0.9', true],
      ['10.0.0.2', false],
    ]);
  });

  describe('Epson şifreli port (TLS 9143 yerine test portu)', () => {
    const creds = testTlsCredentials();

    it('TLS el sıkışması + durum cevabı veren cihaz epson-secure olarak bulunur', async () => {
      const epson = await startFakePrinter({ tls: creds });
      cleanup.push(() => epson.stop());
      const closed = net.createServer();
      await new Promise<void>((r) => closed.listen(0, '127.0.0.1', () => r()));
      const plainPort = (closed.address() as net.AddressInfo).port;
      await new Promise<void>((r) => closed.close(() => r()));
      const found = await discoverPrinters({ networks: [], extraHosts: ['127.0.0.1'], port: plainPort, securePort: epson.port, connectMs: 300 });
      expect(found).toEqual([
        expect.objectContaining({ host: '127.0.0.1', port: epson.port, tls: true, brand: 'epson-secure', escpos: true }),
      ]);
    });

    it('aynı adreste 9100 da açıksa şifreli port tercih edilir (tek kayıt)', async () => {
      const epson = await startFakePrinter({ tls: creds });
      const plain = await startFakePrinter({});
      cleanup.push(() => epson.stop(), () => plain.stop());
      const found = await discoverPrinters({ networks: [], extraHosts: ['127.0.0.1'], port: plain.port, securePort: epson.port });
      expect(found).toHaveLength(1);
      expect(found[0]).toMatchObject({ port: epson.port, tls: true, brand: 'epson-secure' });
    });

    it('şifreli port açık ama TLS değilse (el sıkışma hatası) düz port kullanılır', async () => {
      const sockets = new Set<net.Socket>();
      const notTls = net.createServer((socket) => {
        sockets.add(socket);
        socket.on('error', () => {}); // TLS istemcisi el sıkışma hatasında bağlantıyı sıfırlar
        socket.end('nope');
      });
      await new Promise<void>((r) => notTls.listen(0, '127.0.0.1', () => r()));
      cleanup.push(
        () =>
          new Promise<void>((r) => {
            for (const so of sockets) so.destroy();
            notTls.close(() => r());
          }),
      );
      const plain = await startFakePrinter({});
      cleanup.push(() => plain.stop());
      const found = await discoverPrinters({
        networks: [],
        extraHosts: ['127.0.0.1'],
        port: plain.port,
        securePort: (notTls.address() as net.AddressInfo).port,
      });
      expect(found).toEqual([expect.objectContaining({ port: plain.port, tls: false, escpos: true })]);
      expect(found[0]).not.toHaveProperty('brand');
    });

    it('yalnız şifreli port açık, durum cevabı yok: tls=true, escpos=false aday olarak listelenir', async () => {
      const calls: Array<[number, boolean]> = [];
      const found = await discoverPrinters({
        networks: [],
        extraHosts: ['10.0.0.7'],
        probe: async (_h, port) => port === 9143,
        status: async (_h, port, o) => {
          calls.push([port, o.tls === true]);
          return parseStatus(new Uint8Array());
        },
      });
      expect(found).toEqual([expect.objectContaining({ host: '10.0.0.7', port: 9143, tls: true, escpos: false })]);
      expect(calls.every(([port, tls]) => port === 9143 && tls)).toBe(true);
    });

    it('port şifreli portla aynıysa (ajan 9143 ile çalışıyor) yalnız TLS taranır', async () => {
      const probed: number[] = [];
      await discoverPrinters({
        networks: [],
        extraHosts: ['10.0.0.8'],
        port: 9143,
        probe: async (_h, port) => {
          probed.push(port);
          return false;
        },
      });
      expect(probed).toEqual([9143]);
    });
  });
});
