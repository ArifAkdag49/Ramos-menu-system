import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import '../../i18n';

const signIn = vi.fn();
vi.mock('../../lib/auth', () => ({
  useAuth: (sel: (s: unknown) => unknown) => sel({ signIn, profile: null, session: null, ready: true }),
  homeFor: () => '/waiter',
}));
import { LoginPage } from './LoginPage';

describe('LoginPage', () => {
  it('kullanıcı adı + PIN ile giriş dener, hatada genel mesaj gösterir', async () => {
    signIn.mockRejectedValueOnce(new Error('login_failed'));
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );
    await userEvent.type(screen.getByLabelText(/kullanıcı adı/i), 'ahmet');
    await userEvent.type(screen.getByLabelText(/pin/i), '123456');
    await userEvent.click(screen.getByRole('button', { name: /giriş/i }));
    expect(signIn).toHaveBeenCalledWith('ahmet', '123456');
    expect(await screen.findByRole('alert')).toHaveTextContent(/kullanıcı adı veya pin hatalı/i);
  });
});
