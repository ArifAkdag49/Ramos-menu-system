import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useSoundAlert } from './useSoundAlert';

class FakeOscillator {
  type = '';
  frequency = { value: 0 };
  connect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
}
class FakeGain {
  gain = { value: 0 };
  connect = vi.fn();
}
class FakeAudioContext {
  state = 'running';
  currentTime = 0;
  destination = {};
  createOscillator = vi.fn(() => new FakeOscillator());
  createGain = vi.fn(() => new FakeGain());
  resume = vi.fn().mockResolvedValue(undefined);
  close = vi.fn().mockResolvedValue(undefined);
}

afterEach(() => {
  vi.restoreAllMocks();
  // @ts-expect-error test-only cleanup
  delete window.AudioContext;
});

describe('useSoundAlert', () => {
  it('unlock() AudioContext oluşturur', () => {
    // @ts-expect-error test double
    window.AudioContext = vi.fn(() => new FakeAudioContext());
    const { result } = renderHook(() => useSoundAlert());
    result.current.unlock();
    expect(window.AudioContext).toHaveBeenCalledTimes(1);
  });

  it('beep() iki osilatör çalar (880 Hz)', () => {
    const ctx = new FakeAudioContext();
    // `new Ctor()`nin `ctx`'i geri döndürmesi için gerçek `function` kullanılır (arrow
    // fonksiyonlu vi.fn() `new` ile çağrıldığında dönen nesneyi yok sayıyor).
    // @ts-expect-error test double
    window.AudioContext = vi.fn(function () {
      return ctx;
    });
    const { result } = renderHook(() => useSoundAlert());
    result.current.unlock();
    result.current.beep();

    expect(ctx.createOscillator).toHaveBeenCalledTimes(2);
    const oscillators = ctx.createOscillator.mock.results.map((r) => r.value as FakeOscillator);
    expect(oscillators).toHaveLength(2);
    for (const osc of oscillators) {
      expect(osc.frequency.value).toBe(880);
      expect(osc.type).toBe('sine');
    }
  });

  it('AudioContext yoksa (tarayıcı desteklemiyor) hata fırlatmaz', () => {
    const { result } = renderHook(() => useSoundAlert());
    expect(() => result.current.unlock()).not.toThrow();
    expect(() => result.current.beep()).not.toThrow();
  });

  it('unlock() öncesi beep() çağrılırsa hata fırlatmaz (kilit açılmamış)', () => {
    // @ts-expect-error test double
    window.AudioContext = vi.fn(() => new FakeAudioContext());
    const { result } = renderHook(() => useSoundAlert());
    expect(() => result.current.beep()).not.toThrow();
  });

  it('AudioContext oluşturma hata verirse (izin engeli) hata fırlatmaz', () => {
    window.AudioContext = vi.fn(() => {
      throw new Error('engellendi');
    });
    const { result } = renderHook(() => useSoundAlert());
    expect(() => result.current.unlock()).not.toThrow();
  });
});
