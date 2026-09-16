import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useWakeLock } from './useWakeLock';

afterEach(() => {
  vi.restoreAllMocks();
  // @ts-expect-error test-only cleanup
  delete navigator.wakeLock;
});

describe('useWakeLock', () => {
  it('enabled=true iken navigator.wakeLock.request("screen") çağrılır', async () => {
    const release = vi.fn().mockResolvedValue(undefined);
    const request = vi.fn().mockResolvedValue({ release });
    Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true });

    renderHook(() => useWakeLock(true));
    await Promise.resolve();
    await Promise.resolve();

    expect(request).toHaveBeenCalledWith('screen');
  });

  it('enabled=false iken kilit istenmez', () => {
    const request = vi.fn().mockResolvedValue({ release: vi.fn() });
    Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true });

    renderHook(() => useWakeLock(false));

    expect(request).not.toHaveBeenCalled();
  });

  it('Wake Lock API yoksa hata fırlatmaz', () => {
    expect(() => renderHook(() => useWakeLock(true))).not.toThrow();
  });

  it('request reddedilirse (izin yok) hata fırlatmaz', async () => {
    const request = vi.fn().mockRejectedValue(new Error('izin yok'));
    Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true });

    expect(() => renderHook(() => useWakeLock(true))).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();
  });

  it('unmount olunca kilit serbest bırakılır', async () => {
    const release = vi.fn().mockResolvedValue(undefined);
    const request = vi.fn().mockResolvedValue({ release });
    Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true });

    const { unmount } = renderHook(() => useWakeLock(true));
    await Promise.resolve();
    await Promise.resolve();
    unmount();
    await Promise.resolve();

    expect(release).toHaveBeenCalled();
  });
});
