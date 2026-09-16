import { describe, expect, it } from 'vitest';
import {
  isSameAgentProcess,
  parseProcStatStartTime,
  procCmdlineIsAgent,
  probeProcess,
  type ProcIo,
} from './proc';

// `/proc/<pid>/stat`: 1=pid, 2=comm (parantez içinde, BOŞLUK ve PARANTEZ içerebilir),
// 3=state, … 22=starttime. Aşağıdaki kurgu 22. alanı 987654321 yapar.
const statLine = (comm: string, startTime: string | number): string =>
  `1234 (${comm}) S ${Array(18).fill(0).join(' ')} ${startTime} 0 0 0 0 0`;

const io = (files: Record<string, string>, ps: string | null = null): ProcIo => ({
  readText: (p) => files[p] ?? null,
  powershell: () => ps,
});

describe('parseProcStatStartTime', () => {
  it('22. alanı (starttime) okur', () => {
    expect(parseProcStatStartTime(statLine('node', 987654321))).toBe(987654321);
  });

  it('comm alanı boşluk ve parantez içerse de doğru alanı bulur', () => {
    expect(parseProcStatStartTime(statLine('ramos agent (x)', 4242))).toBe(4242);
  });

  it('bozuk satırda null döner', () => {
    expect(parseProcStatStartTime('parantez yok')).toBeNull();
    expect(parseProcStatStartTime('1234 (node) S 1 2 3')).toBeNull();
    expect(parseProcStatStartTime(statLine('node', 'abc'))).toBeNull();
    expect(parseProcStatStartTime('')).toBeNull();
  });
});

describe('procCmdlineIsAgent', () => {
  it('ajan paketini çalıştıran süreci tanır (NUL ile ayrılmış argümanlar)', () => {
    expect(procCmdlineIsAgent('/usr/bin/node\0/opt/ramos-print-agent/ramos-agent.mjs\0run\0')).toBe(true);
  });

  it('ilgisiz daemon için false döner', () => {
    expect(procCmdlineIsAgent('/usr/sbin/cron\0-f\0')).toBe(false);
    expect(procCmdlineIsAgent('')).toBe(false);
  });
});

describe('probeProcess', () => {
  it('linux: starttime ve komut satırını /proc üzerinden okur', () => {
    const probe = probeProcess(42, 'linux', io({
      '/proc/42/stat': statLine('node', 555),
      '/proc/42/cmdline': '/usr/bin/node\0/opt/ramos-print-agent/ramos-agent.mjs\0run\0',
    }));
    expect(probe).toEqual({ startTime: 555, isAgent: true });
  });

  it('linux: PID başka bir sürece verilmişse isAgent false olur', () => {
    const probe = probeProcess(42, 'linux', io({
      '/proc/42/stat': statLine('cron', 555),
      '/proc/42/cmdline': '/usr/sbin/cron\0-f\0',
    }));
    expect(probe).toEqual({ startTime: 555, isAgent: false });
  });

  it('linux: /proc okunamazsa her ikisi de null olur', () => {
    expect(probeProcess(42, 'linux', io({}))).toEqual({ startTime: null, isAgent: null });
  });

  it('win32: başlangıç zamanını PowerShell ile alır, komut satırını bilmez', () => {
    expect(probeProcess(42, 'win32', io({}, '134340213628914830 '))).toEqual({
      startTime: 134340213628914830,
      isAgent: null,
    });
  });

  it('win32: PowerShell yanıt vermezse null döner', () => {
    expect(probeProcess(42, 'win32', io({}, null))).toEqual({ startTime: null, isAgent: null });
    expect(probeProcess(42, 'win32', io({}, ''))).toEqual({ startTime: null, isAgent: null });
  });

  it('diğer platformlarda bilgi yoktur (eski davranış)', () => {
    expect(probeProcess(42, 'darwin', io({}))).toEqual({ startTime: null, isAgent: null });
  });
});

describe('isSameAgentProcess', () => {
  it('süreç kesinlikle ajan DEĞİLSE pid yeniden kullanılmıştır', () => {
    // R85: Linux'ta kalıcı kilit + yeniden açılış = PID başka bir daemon'a düşebilir.
    expect(isSameAgentProcess(555, { startTime: 555, isAgent: false })).toBe(false);
  });

  it('başlangıç zamanları eşitse aynı süreçtir', () => {
    expect(isSameAgentProcess(555, { startTime: 555, isAgent: true })).toBe(true);
    expect(isSameAgentProcess(555, { startTime: 555, isAgent: null })).toBe(true);
  });

  it('başlangıç zamanları farklıysa pid yeniden kullanılmıştır', () => {
    expect(isSameAgentProcess(555, { startTime: 999, isAgent: true })).toBe(false);
    expect(isSameAgentProcess(555, { startTime: 999, isAgent: null })).toBe(false);
  });

  it('bilgi eksikse güvenli tarafta kalır (aynı süreç sayar, başlatmayı reddeder)', () => {
    expect(isSameAgentProcess(null, { startTime: 555, isAgent: null })).toBe(true);
    expect(isSameAgentProcess(555, { startTime: null, isAgent: null })).toBe(true);
    expect(isSameAgentProcess(null, { startTime: null, isAgent: null })).toBe(true);
  });

  it('ama "kesinlikle ajan değil" bilgisi eksik başlangıç zamanını EZER', () => {
    expect(isSameAgentProcess(null, { startTime: null, isAgent: false })).toBe(false);
  });
});
