import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startUpdateScheduler } from './updateScheduler';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('startUpdateScheduler — yeni sürüm hazır olduğunda', () => {
  it('ekran boştaysa hemen uygular, şerit hiç görünmez', () => {
    const apply = vi.fn();
    const showPrompt = vi.fn();
    startUpdateScheduler({ apply, safe: () => true, showPrompt });

    expect(apply).toHaveBeenCalledTimes(1);
    expect(showPrompt).not.toHaveBeenCalled();
  });

  it('kullanıcı iş başındaysa bekler, şeridi gösterir, boşalınca kendisi uygular', () => {
    const apply = vi.fn();
    const showPrompt = vi.fn();
    let safe = false;
    startUpdateScheduler({ apply, safe: () => safe, showPrompt, retryMs: 5_000 });

    expect(apply).not.toHaveBeenCalled();
    expect(showPrompt).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(20_000);
    expect(apply).not.toHaveBeenCalled();

    safe = true;
    vi.advanceTimersByTime(5_000);
    expect(apply).toHaveBeenCalledTimes(1);

    // Uygulandıktan sonra zamanlayıcı durur: sayfa yenilenirken ikinci kez çağrılmaz.
    vi.advanceTimersByTime(60_000);
    expect(apply).toHaveBeenCalledTimes(1);
  });

  it('uygulama arka plana atılınca beklemeden dener', () => {
    const apply = vi.fn();
    let safe = false;
    startUpdateScheduler({ apply, safe: () => safe, showPrompt: vi.fn(), retryMs: 60_000 });

    safe = true;
    document.dispatchEvent(new Event('visibilitychange'));
    expect(apply).toHaveBeenCalledTimes(1);
  });

  it('şeritteki düğme beklemeden uygular ve zamanlayıcıyı durdurur', () => {
    const apply = vi.fn();
    let manual: (() => void) | null = null;
    startUpdateScheduler({
      apply,
      safe: () => false,
      showPrompt: (fn) => { manual = fn; },
      retryMs: 5_000,
    });

    manual!();
    expect(apply).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(60_000);
    expect(apply).toHaveBeenCalledTimes(1);
  });

  it('durdurulduğunda artık uygulamaz', () => {
    const apply = vi.fn();
    let safe = false;
    const stop = startUpdateScheduler({ apply, safe: () => safe, showPrompt: vi.fn(), retryMs: 1_000 });

    stop();
    safe = true;
    vi.advanceTimersByTime(10_000);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(apply).not.toHaveBeenCalled();
  });
});
