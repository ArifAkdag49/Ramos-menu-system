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

interface AuthStore {
  ready: boolean;
  session: Session | null;
  profile: Profile | null;
  init(): Promise<void>;
  signIn(username: string, pin: string): Promise<void>;
  signOut(): Promise<void>;
  reloadProfile(): Promise<void>;
}

const emailFor = (u: string) =>
  `${u.trim().toLowerCase()}@${import.meta.env.VITE_STAFF_EMAIL_DOMAIN}`;

/** Pasif hesap ve `printer` rolü uygulamaya giremez (spec §12). */
const usable = (p: Profile | null): p is Profile => !!p && p.is_active && p.role !== 'printer';

async function loadProfile(uid: string): Promise<Profile | null> {
  const { data } = await supabase
    .from('profiles')
    .select('id, username, display_name, role, locale, is_active, on_duty_since')
    .eq('id', uid)
    .maybeSingle();
  return (data as Profile | null) ?? null;
}

export const useAuth = create<AuthStore>((set, get) => ({
  ready: false,
  session: null,
  profile: null,

  async init() {
    const { data } = await supabase.auth.getSession();
    const profile = data.session ? await loadProfile(data.session.user.id) : null;
    if (data.session && !usable(profile)) {
      await supabase.auth.signOut();
      set({ ready: true, session: null, profile: null });
      return;
    }
    if (profile) setLanguage(profile.locale);
    set({ ready: true, session: data.session, profile });
    supabase.auth.onAuthStateChange((_e, s) =>
      set(s ? { session: s } : { session: null, profile: null }),
    );
  },

  async signIn(username, pin) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: emailFor(username),
      password: pin,
    });
    if (error || !data.session) throw new Error('login_failed');
    const profile = await loadProfile(data.session.user.id);
    if (!usable(profile)) {
      await supabase.auth.signOut();
      throw new Error('login_failed');
    }
    setLanguage(profile.locale);
    set({ session: data.session, profile });
  },

  async signOut() {
    await supabase.auth.signOut();
    set({ session: null, profile: null });
  },

  async reloadProfile() {
    const s = get().session;
    if (s) set({ profile: await loadProfile(s.user.id) });
  },
}));

export const homeFor = (role: Role): string =>
  role === 'admin' ? '/admin' : role === 'kitchen' ? '/kitchen' : '/waiter';
