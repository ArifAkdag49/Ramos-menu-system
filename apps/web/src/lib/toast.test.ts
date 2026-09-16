import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast, useToast } from './toast';

beforeEach(() => {
  vi.useFakeTimers();
  useToast.getState().dismiss();
});
afterEach(() => vi.useRealTimers());

describe('toast deposu', () => {
  it('mesajı ve tonu yayınlar', () => {
    toast('Mutfağa gönderildi · #047');
    expect(useToast.getState().message).toBe('Mutfağa gönderildi · #047');
    expect(useToast.getState().tone).toBe('open');
    toast('Masa kapatıldı', 'ready');
    expect(useToast.getState().tone).toBe('ready');
  });

  it('kendiliğinden kaybolur', () => {
    toast('Masa kapatıldı');
    vi.advanceTimersByTime(2499);
    expect(useToast.getState().message).toBe('Masa kapatıldı');
    vi.advanceTimersByTime(1);
    expect(useToast.getState().message).toBeNull();
  });

  it('yeni mesaj eskisinin sayacını iptal eder', () => {
    toast('Birinci');
    vi.advanceTimersByTime(2000);
    toast('İkinci');
    vi.advanceTimersByTime(1000); // birincinin sayacı burada dolardı
    expect(useToast.getState().message).toBe('İkinci');
    vi.advanceTimersByTime(1500);
    expect(useToast.getState().message).toBeNull();
  });

  it('elle kapatınca bekleyen sayaç sonraki mesajı silmez', () => {
    toast('Birinci');
    useToast.getState().dismiss();
    expect(useToast.getState().message).toBeNull();
    vi.advanceTimersByTime(2500);
    toast('İkinci');
    vi.advanceTimersByTime(100);
    expect(useToast.getState().message).toBe('İkinci');
  });
});
