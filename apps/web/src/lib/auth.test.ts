import type { Session } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  maybeSingle: vi.fn(),
  getSession: vi.fn(),
  signOut: vi.fn(),
  signInWithPassword: vi.fn(),
  onAuthStateChange: vi.fn(),
}));

vi.mock('./supabase', () => ({
  supabase: {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: h.maybeSingle }) }) }),
    auth: {
      getSession: h.getSession,
      signOut: h.signOut,
      signInWithPassword: h.signInWithPassword,
      onAuthStateChange: h.onAuthStateChange,
    },
  },
}));
vi.mock('../i18n', () => ({ setLanguage: vi.fn() }));

import { emailFor, homeFor, usable, useAuth, type Profile } from './auth';

const SESSION = { user: { id: 'u1' } } as unknown as Session;

const profileOf = (over: Partial<Profile> = {}): Profile => ({
  id: 'u1',
  username: 'ahmet',
  display_name: 'Ahmet',
  role: 'waiter',
  locale: 'tr',
  is_active: true,
  on_duty_since: null,
  ...over,
});

const okRead = (p: Profile | null) => h.maybeSingle.mockResolvedValue({ data: p, error: null });
const failedRead = () =>
  h.maybeSingle.mockResolvedValue({ data: null, error: { message: 'TypeError: Failed to fetch' } });

beforeEach(() => {
  vi.clearAllMocks();
  h.signOut.mockResolvedValue({ error: null });
  h.getSession.mockResolvedValue({ data: { session: SESSION } });
  useAuth.setState({ ready: false, session: null, profile: null, problem: null });
});

describe('usable — kimin uygulamaya girebileceği (spec §12)', () => {
  it('aktif garson, mutfak ve admin girebilir', () => {
    expect(usable(profileOf({ role: 'waiter' }))).toBe(true);
    expect(usable(profileOf({ role: 'kitchen' }))).toBe(true);
    expect(usable(profileOf({ role: 'admin' }))).toBe(true);
  });
  it('printer rolü giremez', () => expect(usable(profileOf({ role: 'printer' }))).toBe(false));
  it('pasif hesap giremez', () => expect(usable(profileOf({ is_active: false }))).toBe(false));
  it('profil yoksa giremez', () => expect(usable(null)).toBe(false));
});

describe('emailFor — sentetik e-posta', () => {
  it('boşlukları atar ve küçük harfe çevirir', () =>
    expect(emailFor('  AhMeT ')).toBe(`ahmet@${import.meta.env.VITE_STAFF_EMAIL_DOMAIN}`));
});

describe('homeFor — rolün ana ekranı', () => {
  it('admin → /admin', () => expect(homeFor('admin')).toBe('/admin'));
  it('kitchen → /kitchen', () => expect(homeFor('kitchen')).toBe('/kitchen'));
  it('waiter → /waiter', () => expect(homeFor('waiter')).toBe('/waiter'));
  it('printer uygulamaya giremez, garson ekranına düşmez', () =>
    expect(homeFor('printer')).toBe('/login'));
});

describe('init — kalıcı oturum', () => {
  it('C1: profil OKUNAMAZSA oturum korunur, çıkış yapılmaz', async () => {
    failedRead();
    await useAuth.getState().init();
    const s = useAuth.getState();
    expect(h.signOut).not.toHaveBeenCalled();
    expect(s.session).toBe(SESSION);
    expect(s.problem).toBe('profile_unreadable');
    expect(s.ready).toBe(true);
  });

  it('C1: okuma BAŞARILI ama satır yoksa çıkış yapılır', async () => {
    okRead(null);
    await useAuth.getState().init();
    expect(h.signOut).toHaveBeenCalledTimes(1);
    expect(useAuth.getState().session).toBeNull();
    expect(useAuth.getState().problem).toBeNull();
    expect(useAuth.getState().ready).toBe(true);
  });

  it('printer rolündeki oturum kapatılır', async () => {
    okRead(profileOf({ role: 'printer' }));
    await useAuth.getState().init();
    expect(h.signOut).toHaveBeenCalledTimes(1);
    expect(useAuth.getState().profile).toBeNull();
  });

  it('pasif hesabın oturumu kapatılır', async () => {
    okRead(profileOf({ is_active: false }));
    await useAuth.getState().init();
    expect(h.signOut).toHaveBeenCalledTimes(1);
    expect(useAuth.getState().profile).toBeNull();
  });

  it('geçerli profil oturuma yazılır', async () => {
    const p = profileOf();
    okRead(p);
    await useAuth.getState().init();
    expect(h.signOut).not.toHaveBeenCalled();
    expect(useAuth.getState().profile).toEqual(p);
    expect(useAuth.getState().problem).toBeNull();
  });

  it('oturum yoksa profil aranmaz', async () => {
    h.getSession.mockResolvedValue({ data: { session: null } });
    await useAuth.getState().init();
    expect(h.maybeSingle).not.toHaveBeenCalled();
    expect(useAuth.getState().ready).toBe(true);
    expect(useAuth.getState().problem).toBeNull();
  });

  it('I4: beklenmeyen hata olsa bile ready true olur ve sorun bildirilir', async () => {
    h.getSession.mockRejectedValue(new Error('storage kilitli'));
    await useAuth.getState().init();
    expect(useAuth.getState().ready).toBe(true);
    expect(useAuth.getState().problem).toBe('init_failed');
  });
});

describe('reloadProfile', () => {
  it('okuma başarısızsa eldeki profili silmez', async () => {
    const p = profileOf();
    useAuth.setState({ session: SESSION, profile: p });
    failedRead();
    await useAuth.getState().reloadProfile();
    expect(useAuth.getState().profile).toEqual(p);
    expect(h.signOut).not.toHaveBeenCalled();
  });

  it('hesap pasifleştirildiyse oturumu kapatır', async () => {
    useAuth.setState({ session: SESSION, profile: profileOf() });
    okRead(profileOf({ is_active: false }));
    await useAuth.getState().reloadProfile();
    expect(h.signOut).toHaveBeenCalledTimes(1);
    expect(useAuth.getState().profile).toBeNull();
  });
});

describe('signIn', () => {
  it('parola yanlışsa genel hata fırlatır', async () => {
    h.signInWithPassword.mockResolvedValue({ data: { session: null }, error: { message: 'bad' } });
    await expect(useAuth.getState().signIn('ahmet', '000000')).rejects.toThrow('login_failed');
  });

  it('printer hesabı giriş yapamaz ve oturumu kapatılır', async () => {
    h.signInWithPassword.mockResolvedValue({ data: { session: SESSION }, error: null });
    okRead(profileOf({ role: 'printer' }));
    await expect(useAuth.getState().signIn('test-printer', 'x')).rejects.toThrow('login_failed');
    expect(h.signOut).toHaveBeenCalledTimes(1);
    expect(useAuth.getState().profile).toBeNull();
  });

  it('pasif hesap giriş yapamaz ve oturumu kapatılır', async () => {
    h.signInWithPassword.mockResolvedValue({ data: { session: SESSION }, error: null });
    okRead(profileOf({ is_active: false }));
    await expect(useAuth.getState().signIn('test-inactive', 'x')).rejects.toThrow('login_failed');
    expect(h.signOut).toHaveBeenCalledTimes(1);
  });

  it('geçerli hesap girer', async () => {
    const p = profileOf({ role: 'kitchen' });
    h.signInWithPassword.mockResolvedValue({ data: { session: SESSION }, error: null });
    okRead(p);
    await useAuth.getState().signIn('test-kitchen', 'x');
    expect(useAuth.getState().profile).toEqual(p);
    expect(h.signOut).not.toHaveBeenCalled();
  });
});
