import { describe, expect, it, vi } from 'vitest';
import { createShutdownHandler } from './shutdown';

// M4 (review fix round 4): `agent.stop()` artık süre sınırı olmadan bekleyebiliyor (R70/R68) —
// bu bekleme sürerken bir OPERATÖR ikinci bir Ctrl+C basarsa eski `cli.ts` bunu SESSİZCE
// yutuyordu (`if (stopping) return;`), kapanış tamamen ölü/yanıtsız görünüyordu.

describe('createShutdownHandler — M4: ikinci sinyal sessizce yutulmaz', () => {
  it('ilk sinyalde agent.stop() çağrılır; ikinci sinyalde (stop sürerken) warn loglanır, stop() TEKRAR ÇAĞRILMAZ, kapanış iptal edilmez', async () => {
    let resolveStop: (() => void) | undefined;
    const agentStop = vi.fn(() => new Promise<void>((resolve) => { resolveStop = resolve; }));
    const agent = { stop: agentStop };
    const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    let done = false;
    const shutdown = createShutdownHandler(agent, log, () => { done = true; });

    shutdown('SIGINT');
    expect(agentStop).toHaveBeenCalledTimes(1);
    expect(log.info).toHaveBeenCalledWith('kapatılıyor', { signal: 'SIGINT' });

    shutdown('SIGINT'); // ikinci Ctrl+C — kapanış zaten sürüyor
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('zaten sürüyor'), { signal: 'SIGINT' });
    expect(agentStop).toHaveBeenCalledTimes(1); // TEKRAR çağrılmadı
    expect(done).toBe(false); // ilk stop() henüz çözülmedi — kapanış iptal edilmedi, hâlâ sürüyor

    shutdown('SIGTERM'); // üçüncü sinyal, farklı isim — yine yutulmaz, yine warn
    expect(log.warn).toHaveBeenCalledTimes(2);
    expect(agentStop).toHaveBeenCalledTimes(1);

    resolveStop!();
    await new Promise((r) => setTimeout(r, 0));
    expect(done).toBe(true); // ilk stop() sonunda çözülünce kapanış normal şekilde biter
  });

  it('agent.stop() reddederse hata loglanır, onDone yine de çağrılır', async () => {
    const agentStop = vi.fn(async () => { throw new Error('kapatma hatası'); });
    const agent = { stop: agentStop };
    const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    let done = false;
    const shutdown = createShutdownHandler(agent, log, () => { done = true; });

    shutdown('SIGINT');
    await new Promise((r) => setTimeout(r, 0));

    expect(log.error).toHaveBeenCalledWith('kapatma sırasında hata', { e: expect.stringContaining('kapatma hatası') });
    expect(done).toBe(true);
  });
});
