import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '../../../i18n';
import type { Profile } from '../../../lib/auth';

const h = vi.hoisted(() => ({
  staff: [] as Profile[],
  callAdminStaff: vi.fn(),
}));

vi.mock('../../../data/staff', () => ({
  useAdminStaffList: () => ({ isPending: false, data: h.staff }),
}));

// Hata sınıfı gerçek modülden gelir: ekran hatayı `instanceof` ile tanır.
vi.mock('./adminStaffClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./adminStaffClient')>()),
  callAdminStaff: h.callAdminStaff,
}));

import { useAuth } from '../../../lib/auth';
import { StaffPage } from './StaffPage';

const person = (over: Partial<Profile>): Profile => ({
  id: 'u1',
  username: 'ayse',
  display_name: 'Ayşe',
  role: 'waiter',
  locale: 'tr',
  is_active: true,
  on_duty_since: null,
  ...over,
});

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
);

const rowOf = (name: string) => {
  const row = screen.getByText(name).closest('li');
  if (!row) throw new Error(`satır yok: ${name}`);
  return within(row);
};

describe('<StaffPage />', () => {
  beforeEach(() => {
    h.staff = [
      person({
        id: 'u1',
        username: 'ayse',
        display_name: 'Ayşe',
        on_duty_since: new Date().toISOString(),
      }),
      person({ id: 'u2', username: 'demo-garson', display_name: 'Demo Garson' }),
      person({ id: 'me', username: 'patron', display_name: 'Patron', role: 'admin' }),
    ];
    h.callAdminStaff.mockReset().mockResolvedValue({});
    useAuth.setState({ profile: h.staff[2]! });
  });

  it('bugün mesaiye başlayan kişide "Mesaide", test/demo hesabında "Test hesabı" rozeti', () => {
    render(<StaffPage />, { wrapper });

    expect(rowOf('Ayşe').getByText('Mesaide')).toBeInTheDocument();
    expect(rowOf('Ayşe').queryByText('Test hesabı')).not.toBeInTheDocument();
    expect(rowOf('Demo Garson').getByText('Test hesabı')).toBeInTheDocument();
    expect(rowOf('Demo Garson').queryByText('Mesaide')).not.toBeInTheDocument();
  });

  it('düzenleme yalnız değişen alanı gönderir', async () => {
    render(<StaffPage />, { wrapper });

    await userEvent.click(rowOf('Ayşe').getByRole('button', { name: 'Düzenle' }));
    const dialog = within(screen.getByRole('dialog'));
    const name = dialog.getByLabelText('Ad');
    await userEvent.clear(name);
    await userEvent.type(name, 'Ayşe K.');
    await userEvent.selectOptions(dialog.getByLabelText('Dil'), 'de');
    await userEvent.click(dialog.getByRole('button', { name: 'Kaydet' }));

    expect(h.callAdminStaff).toHaveBeenCalledWith({
      action: 'update',
      user_id: 'u1',
      display_name: 'Ayşe K.',
      locale: 'de',
    });
  });

  it('kendi hesabında rol alanı kilitli, nedeni yazılı', async () => {
    render(<StaffPage />, { wrapper });

    await userEvent.click(rowOf('Patron').getByRole('button', { name: 'Düzenle' }));
    const dialog = within(screen.getByRole('dialog'));
    expect(dialog.getByLabelText('Rol')).toBeDisabled();
    expect(dialog.getByText(/Kendi rolünü değiştiremezsin/)).toBeInTheDocument();
  });
});
