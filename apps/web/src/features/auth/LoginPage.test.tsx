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

const renderPage = () =>
  render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>,
  );

describe('LoginPage', () => {
  it('kullanıcı adı + PIN ile giriş dener, hatada genel mesaj gösterir', async () => {
    signIn.mockRejectedValueOnce(new Error('login_failed'));
    renderPage();
    await userEvent.type(screen.getByLabelText(/kullanıcı adı/i), 'ahmet');
    await userEvent.type(screen.getByLabelText(/pin/i), '123456');
    await userEvent.click(screen.getByRole('button', { name: /giriş/i }));
    expect(signIn).toHaveBeenCalledWith('ahmet', '123456');
    expect(await screen.findByRole('alert')).toHaveTextContent(/kullanıcı adı veya pin hatalı/i);
  });

  it('I5/R62: aynı alan hem PIN hem admin parolası kabul eder', () => {
    renderPage();
    const secret = screen.getByLabelText(/pin veya parola/i);
    expect(secret).toHaveAttribute('type', 'password');
    // Sayısal tuş takımı dayatılmaz: admin parolası harf içerir.
    expect(secret).not.toHaveAttribute('inputmode');
    expect(secret).not.toHaveAttribute('pattern');
  });

  it('M7: en az 6 hane kuralı alanın kendisinde', () => {
    renderPage();
    const secret = screen.getByLabelText(/pin veya parola/i);
    expect(secret).toHaveAttribute('minlength', '6');
    expect(secret).toHaveAttribute('maxlength', '72');
  });
});

describe('LoginPage — şifre önizleme', () => {
  it('göz butonu alanı düz metne çevirir ve geri gizler', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );
    const input = document.getElementById('pin') as HTMLInputElement;
    expect(input.type).toBe('password');
    await user.click(screen.getByRole('button', { name: 'Şifreyi göster' }));
    expect(input.type).toBe('text');
    await user.click(screen.getByRole('button', { name: 'Şifreyi gizle' }));
    expect(input.type).toBe('password');
  });
});
