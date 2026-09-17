import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const callRpc = vi.fn();
vi.mock('../lib/rpc', () => ({ callRpc: (...args: unknown[]) => callRpc(...args) }));

import { disablePush, enablePush, pushState, syncPushSubscription } from '../pwa/push';
import { __resetNativePushForTests, notificationPath, setupNativePush } from './nativePush';

type Listener = (payload: never) => void;
type W = Window & { Capacitor?: unknown };

/** Capacitor PushNotifications eklentisinin sahtesi: `register()` sonrası olayı biz tetikleriz. */
function fakePush(
  opts: {
    perm?: string;
    afterRequest?: string;
    onRegister?: 'token' | 'error' | 'reject' | 'silent';
  } = {},
) {
  const listeners = new Map<string, Listener[]>();
  const emit = (event: string, payload: unknown) =>
    (listeners.get(event) ?? []).forEach((cb) => cb(payload as never));
  let token = 'fcm-token-1';
  const plugin = {
    checkPermissions: vi.fn(async () => ({ receive: opts.perm ?? 'prompt' })),
    requestPermissions: vi.fn(async () => ({ receive: opts.afterRequest ?? 'granted' })),
    register: vi.fn(async () => {
      const mode = opts.onRegister ?? 'token';
      if (mode === 'reject') throw new Error('Default FirebaseApp is not initialized');
      queueMicrotask(() => {
        if (mode === 'token') emit('registration', { value: token });
        if (mode === 'error') emit('registrationError', { error: 'SERVICE_NOT_AVAILABLE' });
      });
    }),
    unregister: vi.fn(async () => {}),
    addListener: vi.fn((event: string, cb: Listener) => {
      listeners.set(event, [...(listeners.get(event) ?? []), cb]);
      return { remove: () => {} };
    }),
  };
  (window as W).Capacitor = {
    isNativePlatform: () => true,
    Plugins: { PushNotifications: plugin },
  };
  return {
    plugin,
    emit,
    setToken: (t: string) => {
      token = t;
    },
    grant: () => plugin.checkPermissions.mockResolvedValue({ receive: 'granted' }),
  };
}

beforeEach(() => {
  __resetNativePushForTests();
  callRpc.mockReset().mockResolvedValue(null);
  localStorage.clear();
});

afterEach(() => {
  delete (window as W).Capacitor;
  vi.useRealTimers();
});

describe('yerel uygulamada bildirim (FCM)', () => {
  it('izin → register → registration jetonu save_fcm_token ile yazılır; durum açık', async () => {
    const f = fakePush();
    expect(await pushState()).toBe('disabled');

    await expect(enablePush()).resolves.toEqual({ ok: true });
    expect(f.plugin.requestPermissions).toHaveBeenCalledOnce();
    expect(f.plugin.register).toHaveBeenCalledOnce();
    expect(callRpc).toHaveBeenCalledWith('save_fcm_token', {
      p_token: 'fcm-token-1',
      p_ua: navigator.userAgent,
    });
    // Web Push yolu hiç kullanılmaz.
    expect(callRpc).not.toHaveBeenCalledWith('save_push_subscription', expect.anything());

    f.grant();
    expect(await pushState()).toBe('enabled');
  });

  it('izin zaten verilmişse tekrar sorulmaz', async () => {
    const f = fakePush({ perm: 'granted' });
    await expect(enablePush()).resolves.toEqual({ ok: true });
    expect(f.plugin.requestPermissions).not.toHaveBeenCalled();
  });

  it('izin reddi → denied; karar verilmeden kapatma → dismissed', async () => {
    fakePush({ afterRequest: 'denied' });
    await expect(enablePush()).resolves.toEqual({ ok: false, reason: 'denied' });
    __resetNativePushForTests();
    fakePush({ afterRequest: 'prompt' });
    await expect(enablePush()).resolves.toEqual({ ok: false, reason: 'dismissed' });
    expect(callRpc).not.toHaveBeenCalled();
  });

  it('registrationError (Firebase yok) → unavailable; durum error; çökmez', async () => {
    const f = fakePush({ onRegister: 'error' });
    await expect(enablePush()).resolves.toMatchObject({ ok: false, reason: 'unavailable' });
    expect(callRpc).not.toHaveBeenCalled();
    f.grant();
    expect(await pushState()).toBe('error');
  });

  it('register() reddederse de unavailable', async () => {
    fakePush({ onRegister: 'reject' });
    await expect(enablePush()).resolves.toMatchObject({
      ok: false,
      reason: 'unavailable',
      detail: expect.stringContaining('FirebaseApp'),
    });
  });

  it('registration olayı hiç gelmezse zaman aşımı → unavailable (düğme sonsuza dek dönmez)', async () => {
    vi.useFakeTimers();
    fakePush({ onRegister: 'silent' });
    const pending = enablePush();
    await vi.advanceTimersByTimeAsync(15_000);
    await expect(pending).resolves.toMatchObject({ ok: false, reason: 'unavailable' });
  });

  it('jeton sunucuya yazılamazsa error (tekrar denenebilir)', async () => {
    fakePush();
    callRpc.mockRejectedValue(new Error('network'));
    await expect(enablePush()).resolves.toMatchObject({ ok: false, reason: 'error' });
    expect(await pushState()).toBe('disabled');
  });

  it('kapatınca jeton delete_push_subscription ile silinir ve unregister çağrılır', async () => {
    const f = fakePush({ perm: 'granted' });
    await enablePush();
    callRpc.mockClear();

    await disablePush();
    expect(callRpc).toHaveBeenCalledWith('delete_push_subscription', { p_endpoint: 'fcm-token-1' });
    expect(f.plugin.unregister).toHaveBeenCalledOnce();
    expect(await pushState()).toBe('disabled');
  });

  it('izin cihaz ayarından kapatılmışsa denied', async () => {
    fakePush({ perm: 'denied' });
    expect(await pushState()).toBe('denied');
  });

  it('eşitleme: açıksa güncel jeton bu kullanıcıya yeniden yazılır; değiştiyse eskisi silinir', async () => {
    const f = fakePush({ perm: 'granted' });
    await enablePush();
    callRpc.mockClear();
    f.setToken('fcm-token-2');

    await syncPushSubscription();
    expect(f.plugin.requestPermissions).not.toHaveBeenCalled();
    expect(callRpc).toHaveBeenCalledWith('save_fcm_token', {
      p_token: 'fcm-token-2',
      p_ua: navigator.userAgent,
    });
    expect(callRpc).toHaveBeenCalledWith('delete_push_subscription', { p_endpoint: 'fcm-token-1' });
  });

  it('eşitleme: bildirim kapalıysa register çağrılmaz (izin sorulmaz)', async () => {
    const f = fakePush({ perm: 'granted' });
    await syncPushSubscription();
    expect(f.plugin.register).not.toHaveBeenCalled();
    expect(callRpc).not.toHaveBeenCalled();
  });

  it('bildirime dokununca data.url uygulama içinde açılır; dış adres yok sayılır', () => {
    const f = fakePush();
    const navigate = vi.fn();
    setupNativePush(navigate);
    setupNativePush(navigate); // ikinci çağrı dinleyiciyi çoğaltmaz

    f.emit('pushNotificationActionPerformed', {
      actionId: 'tap',
      notification: { data: { url: '/waiter/ready', tag: 'ready-1', order_id: 'o1' } },
    });
    f.emit('pushNotificationActionPerformed', {
      actionId: 'tap',
      notification: { data: { url: 'https://evil.example' } },
    });
    expect(navigate).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith('/waiter/ready');
  });

  it('tarayıcıda setupNativePush hiçbir şey yapmaz', () => {
    const navigate = vi.fn();
    expect(() => setupNativePush(navigate)).not.toThrow();
  });
});

describe('notificationPath', () => {
  it('yalnız uygulama içi yol', () => {
    expect(notificationPath({ url: '/waiter/ready' })).toBe('/waiter/ready');
    expect(notificationPath({ url: '//evil.example' })).toBeNull();
    expect(notificationPath({ url: 'https://x' })).toBeNull();
    expect(notificationPath(null)).toBeNull();
    expect(notificationPath({})).toBeNull();
  });
});
