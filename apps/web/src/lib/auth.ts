import type { Session } from '@supabase/supabase-js';
import { create } from 'zustand';
import { setLanguage } from '../i18n';
import { supabase } from './supabase';

export type Role = 'admin' | 'waiter' | 'kitchen' | 'printer';

export interface Profile {
  id: string;
  username: string;
  display_name: string;
  role: Role;
  locale: 'tr' | 'de';
  is_active: boolean;
  on_duty_since: string | null;
}

/**
 * Açılışta çözülemeyen durumlar. `null` = sorun yok.
 * - `profile_unreadable`: oturum duruyor ama profil okunamadı (uyuyan proje, kopuk Wi-Fi, 5xx).
 * - `init_failed`: açılış beklenmedik biçimde patladı (ör. depoya erişim engellendi).
 */
export type AuthProblem = 'profile_unreadable' | 'init_failed' | null;

interface AuthStore {
  ready: boolean;
  session: Session | null;
  profile: Profile | null;
  problem: AuthProblem;
  init(): Promise<void>;
  signIn(username: string, pin: string): Promise<void>;
  signOut(): Promise<void>;
  reloadProfile(): Promise<void>;
}

export const emailFor = (u: string) =>
  `${u.trim().toLowerCase()}@${import.meta.env.VITE_STAFF_EMAIL_DOMAIN}`;

/** Pasif hesap ve `printer` rolü uygulamaya giremez (spec §12). */
export const usable = (p: Profile | null): p is Profile =>
  !!p && p.is_active && p.role !== 'printer';

export interface ProfileRead {
  profile: Profile | null;
  /** `true` ise soru "profil yok" değil, "okuyamadık" — oturum ASLA bu yüzden kapatılmaz. */
  failed: boolean;
}

async function loadProfile(uid: string): Promise<ProfileRead> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, display_name, role, locale, is_active, on_duty_since')
    .eq('id', uid)
    .maybeSingle();
  if (error) return { profile: null, failed: true };
  return { profile: (data as Profile | null) ?? null, failed: false };
}

/**
 * M8: `onAuthStateChange` aboneliği uygulama ömrü boyunca açık kalır ve sökülmez —
 * uygulama tek sayfa, dinleyici de tek. Oturum yenilendiğinde profil yeniden doğrulanmaz;
 * yetkinin gerçek sınırı RLS'tir (spec §12), istemcideki profil yalnız yönlendirme içindir.
 * Rol/aktiflik değişimi `reloadProfile()` ile yakalanır.
 */
let authListenerBound = false;

function bindAuthListener(set: (partial: Partial<AuthStore>) => void) {
  if (authListenerBound) return;
  authListenerBound = true;
  supabase.auth.onAuthStateChange((_e, s) =>
    set(s ? { session: s } : { session: null, profile: null }),
  );
}

export const useAuth = create<AuthStore>((set, get) => ({
  ready: false,
  session: null,
  profile: null,
  problem: null,

  async init() {
    try {
      const { data } = await supabase.auth.getSession();
      const session = data.session;
      if (!session) {
        set({ session: null, profile: null, problem: null });
        return;
      }

      const { profile, failed } = await loadProfile(session.user.id);
      if (failed) {
        // Okuma başarısız: oturumu KORU (spec §8.1 "oturum telefonda kalıcıdır").
        // Kullanıcı vardiya ortasında yeniden PIN girmek zorunda kalmaz; tekrar deneme yolu açılır.
        set({ session, profile: null, problem: 'profile_unreadable' });
        return;
      }

      if (!usable(profile)) {
        // Okuma başarılı ve cevap net: satır yok ya da profil uygun değil → çıkış.
        await supabase.auth.signOut();
        set({ session: null, profile: null, problem: null });
        return;
      }

      setLanguage(profile.locale);
      set({ session, profile, problem: null });
    } catch {
      set({ problem: 'init_failed' });
    } finally {
      // `ready` her yolda kurulur: aksi hâlde marka yükleyicisi sonsuza kadar kalır.
      set({ ready: true });
      bindAuthListener(set);
    }
  },

  async signIn(username, pin) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: emailFor(username),
      password: pin,
    });
    if (error || !data.session) throw new Error('login_failed');
    const { profile } = await loadProfile(data.session.user.id);
    // Girişte yetki doğrulanamıyorsa içeri alınmaz (fail-closed) ve tek genel mesaj verilir.
    if (!usable(profile)) {
      await supabase.auth.signOut();
      set({ session: null, profile: null });
      throw new Error('login_failed');
    }
    setLanguage(profile.locale);
    set({ session: data.session, profile, problem: null });
  },

  async signOut() {
    await supabase.auth.signOut();
    set({ session: null, profile: null, problem: null });
  },

  async reloadProfile() {
    const s = get().session;
    if (!s) return;
    const { profile, failed } = await loadProfile(s.user.id);
    if (failed) return; // Geçici okuma hatası elde duran profili silmez.
    if (!usable(profile)) {
      // Admin hesabı pasifleştirdiyse ya da role düşürdüyse etki anında.
      await supabase.auth.signOut();
      set({ session: null, profile: null });
      return;
    }
    setLanguage(profile.locale);
    set({ profile, problem: null });
  },
}));

export const homeFor = (role: Role): string => {
  switch (role) {
    case 'admin':
      return '/admin';
    case 'kitchen':
      return '/kitchen';
    case 'waiter':
      return '/waiter';
    // `printer` uygulamaya hiç giremez (`usable`); yine de sessizce garson ekranına düşmesin.
    case 'printer':
      return '/login';
  }
};
