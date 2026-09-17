import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const callRpc = vi.fn();
vi.mock('../lib/rpc', () => ({ callRpc: (...args: unknown[]) => callRpc(...args) }));

import { disablePush, enablePush, pushState, pushSupport, urlBase64ToUint8Array } from './push';

describe('push', () => {
  it('iOS’ta ana ekrana eklenmeden push yok', () => {
    expect(
      pushSupport({
        isIOS: true,
        standalone: false,
        hasSW: true,
        hasPush: false,
        hasNotification: false,
      }),
    ).toBe('ios_needs_install');
    expect(
      pushSupport({
        isIOS: true,
        standalone: true,
        hasSW: true,
        hasPush: true,
        hasNotification: true,
      }),
    ).toBe('ok');
  });

  it('Android Chrome destekli; eski tarayıcı desteksiz', () => {
    expect(
      pushSupport({
        isIOS: false,
        standalone: false,
        hasSW: true,
        hasPush: true,
        hasNotification: true,
      }),
    ).toBe('ok');
    expect(
      pushSupport({
        isIOS: false,
        standalone: false,
        hasSW: false,
        hasPush: false,
        hasNotification: false,
      }),
    ).toBe('unsupported');
  });

  it('iOS ana ekranda ama eski sürüm (push API yok) → desteksiz', () => {
    expect(
      pushSupport({
        isIOS: true,
        standalone: true,
        hasSW: true,
        hasPush: false,
        hasNotification: false,
      }),
    ).toBe('unsupported');
  });

  it('base64url çözümü', () => {
    expect(Array.from(urlBase64ToUint8Array('AQID'))).toEqual([1, 2, 3]);
    expect(urlBase64ToUint8Array('-_8').length).toBe(2);
  });
});

/* ------------------------------------------------------------------------------------------ */
/* Tarayıcı API'leri (jsdom'da yok) — Android Chrome benzeri sahte ortam                        */
/* ------------------------------------------------------------------------------------------ */

const KEY = 'AQID';

function fakeSubscription(endpoint = 'https://push.example/abc', key: number[] = [1, 2, 3]) {
  return {
    endpoint,
    options: { applicationServerKey: new Uint8Array(key).buffer },
    toJSON: () => ({ endpoint, keys: { p256dh: 'P256', auth: 'AUTH' } }),
    unsubscribe: vi.fn().mockResolvedValue(true),
  };
}

type FakeSub = ReturnType<typeof fakeSubscription>;

function installBrowser({
  permission = 'default' as NotificationPermission,
  answer = 'granted' as NotificationPermission,
  existing = null as FakeSub | null,
  created = fakeSubscription(),
} = {}) {
  const Notification = { permission, requestPermission: vi.fn().mockResolvedValue(answer) };
  const pushManager = {
    getSubscription: vi.fn().mockResolvedValue(existing),
    subscribe: vi.fn().mockResolvedValue(created),
  };
  const registration = { pushManager };
  vi.stubGlobal('Notification', Notification);
  vi.stubGlobal('PushManager', function PushManager() {});
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: {
      ready: Promise.resolve(registration),
      getRegistration: vi.fn().mockResolvedValue(registration),
    },
  });
  return { Notification, pushManager };
}

describe('enablePush / disablePush / pushState', () => {
  beforeEach(() => {
    callRpc.mockReset().mockResolvedValue(null);
    vi.stubEnv('VITE_VAPID_PUBLIC_KEY', KEY);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    // @ts-expect-error yalnız test temizliği
    delete navigator.serviceWorker;
  });

  it('desteklenmeyen tarayıcıda izin bile sorulmaz', async () => {
    expect(await enablePush()).toEqual({ ok: false, reason: 'unsupported' });
    expect(callRpc).not.toHaveBeenCalled();
  });

  it('izin reddedilirse abonelik yok', async () => {
    const { pushManager } = installBrowser({ answer: 'denied' });
    expect(await enablePush()).toEqual({ ok: false, reason: 'denied' });
    expect(pushManager.subscribe).not.toHaveBeenCalled();
  });

  it('izin penceresi kapatılırsa (karar yok) ayrı sebep döner', async () => {
    installBrowser({ answer: 'default' });
    expect(await enablePush()).toEqual({ ok: false, reason: 'dismissed' });
  });

  it('izin verilince abone olur ve aboneliği sunucuya kaydeder', async () => {
    const { Notification, pushManager } = installBrowser();
    expect(await enablePush()).toEqual({ ok: true });
    expect(Notification.requestPermission).toHaveBeenCalledOnce();
    const opts = pushManager.subscribe.mock.calls[0]![0] as PushSubscriptionOptionsInit;
    expect(opts.userVisibleOnly).toBe(true);
    expect(Array.from(opts.applicationServerKey as Uint8Array)).toEqual([1, 2, 3]);
    expect(callRpc).toHaveBeenCalledWith('save_push_subscription', {
      p_endpoint: 'https://push.example/abc',
      p_p256dh: 'P256',
      p_auth: 'AUTH',
      p_ua: navigator.userAgent,
    });
  });

  it('izin, önünde başka bekleme olmadan istenir (iOS dokunuş şartı)', () => {
    const { Notification } = installBrowser();
    void enablePush();
    // Senkron: `enablePush()` ilk `await`'ten önce izni istemiş olmalı.
    expect(Notification.requestPermission).toHaveBeenCalledOnce();
  });

  it('eski anahtarla alınmış abonelik yenilenir', async () => {
    const old = fakeSubscription('https://push.example/old', [9, 9, 9]);
    const { pushManager } = installBrowser({ permission: 'granted', existing: old });
    expect(await enablePush()).toEqual({ ok: true });
    expect(old.unsubscribe).toHaveBeenCalledOnce();
    expect(pushManager.subscribe).toHaveBeenCalledOnce();
  });

  it('aynı anahtarlı mevcut abonelik yeniden kullanılır', async () => {
    const { pushManager } = installBrowser({ permission: 'granted', existing: fakeSubscription() });
    expect(await enablePush()).toEqual({ ok: true });
    expect(pushManager.subscribe).not.toHaveBeenCalled();
    expect(callRpc).toHaveBeenCalledOnce();
  });

  it('sunucu kaydı başarısızsa hata döner (sessizce "açık" denmez)', async () => {
    installBrowser();
    callRpc.mockRejectedValueOnce(new Error('network'));
    expect(await enablePush()).toEqual({ ok: false, reason: 'error', detail: 'network' });
  });

  it('VAPID anahtarı yoksa abone olmaya çalışmaz', async () => {
    vi.stubEnv('VITE_VAPID_PUBLIC_KEY', '');
    const { pushManager } = installBrowser();
    expect(await enablePush()).toMatchObject({ ok: false, reason: 'error' });
    expect(pushManager.subscribe).not.toHaveBeenCalled();
  });

  it('disablePush: sunucudan siler ve aboneliği bırakır', async () => {
    const sub = fakeSubscription();
    installBrowser({ permission: 'granted', existing: sub });
    await disablePush();
    expect(callRpc).toHaveBeenCalledWith('delete_push_subscription', { p_endpoint: sub.endpoint });
    expect(sub.unsubscribe).toHaveBeenCalledOnce();
  });

  it('disablePush: sunucuya ulaşılamasa da yerel abonelik bırakılır', async () => {
    const sub = fakeSubscription();
    installBrowser({ permission: 'granted', existing: sub });
    callRpc.mockRejectedValueOnce(new Error('network'));
    await disablePush();
    expect(sub.unsubscribe).toHaveBeenCalledOnce();
  });

  it('pushState: desteksiz / reddedildi / kapalı / açık', async () => {
    expect(await pushState()).toBe('unsupported');

    installBrowser({ permission: 'denied' });
    expect(await pushState()).toBe('denied');

    installBrowser({ permission: 'default' });
    expect(await pushState()).toBe('disabled');

    installBrowser({ permission: 'granted', existing: null });
    expect(await pushState()).toBe('disabled');

    installBrowser({ permission: 'granted', existing: fakeSubscription() });
    expect(await pushState()).toBe('enabled');
  });
});
