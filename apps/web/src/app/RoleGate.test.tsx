import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router';

const h = vi.hoisted(() => ({ maybeSingle: vi.fn(), onAuthStateChange: vi.fn() }));

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: h.maybeSingle }) }) }),
    auth: {
      getSession: vi.fn(),
      signOut: vi.fn(),
      signInWithPassword: vi.fn(),
      onAuthStateChange: h.onAuthStateChange,
    },
  },
}));
vi.mock('../i18n', () => ({ setLanguage: vi.fn() }));

import { useAuth, type Profile, type Role } from '../lib/auth';
import { RoleGate } from './RoleGate';

const profileOf = (role: Role, over: Partial<Profile> = {}): Profile => ({
  id: 'u1',
  username: 'ahmet',
  display_name: 'Ahmet',
  role,
  locale: 'tr',
  is_active: true,
  on_duty_since: null,
  ...over,
});

function renderGate(roles: Role[]) {
  return render(
    <MemoryRouter initialEntries={['/korumali']}>
      <Routes>
        <Route
          path="/korumali"
          element={
            <RoleGate roles={roles}>
              <p>korumalı içerik</p>
            </RoleGate>
          }
        />
        <Route path="/login" element={<p>giriş ekranı</p>} />
        <Route path="/waiter" element={<p>garson ekranı</p>} />
        <Route path="/kitchen" element={<p>mutfak ekranı</p>} />
        <Route path="/admin" element={<p>admin ekranı</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => useAuth.setState({ ready: true, session: null, profile: null, problem: null }));

describe('RoleGate', () => {
  it('profil yoksa girişe yönlendirir', () => {
    renderGate(['waiter', 'admin']);
    expect(screen.getByText('giriş ekranı')).toBeInTheDocument();
  });

  it('rolü uyan garsonu içeri alır', () => {
    useAuth.setState({ profile: profileOf('waiter') });
    renderGate(['waiter', 'admin']);
    expect(screen.getByText('korumalı içerik')).toBeInTheDocument();
  });

  it('admin garson ekranına da girebilir', () => {
    useAuth.setState({ profile: profileOf('admin') });
    renderGate(['waiter', 'admin']);
    expect(screen.getByText('korumalı içerik')).toBeInTheDocument();
  });

  it('mutfak hesabını garson ekranından kendi ekranına yollar', () => {
    useAuth.setState({ profile: profileOf('kitchen') });
    renderGate(['waiter', 'admin']);
    expect(screen.getByText('mutfak ekranı')).toBeInTheDocument();
  });

  it('garsonu admin ekranından kendi ekranına yollar', () => {
    useAuth.setState({ profile: profileOf('waiter') });
    renderGate(['admin']);
    expect(screen.getByText('garson ekranı')).toBeInTheDocument();
  });

  it('mutfak hesabı admin ekranına giremez', () => {
    useAuth.setState({ profile: profileOf('kitchen') });
    renderGate(['admin']);
    expect(screen.queryByText('korumalı içerik')).not.toBeInTheDocument();
    expect(screen.getByText('mutfak ekranı')).toBeInTheDocument();
  });
});
