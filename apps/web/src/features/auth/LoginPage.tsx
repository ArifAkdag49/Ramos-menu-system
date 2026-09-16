import { Flame, LogIn } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { homeFor, useAuth } from '../../lib/auth';
import { Button } from '../../ui/Button';

const FIELD =
  'min-h-12 w-full rounded-xl border border-border bg-surface-2 px-4 text-base text-text placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime focus-visible:ring-offset-2 focus-visible:ring-offset-bg';

/**
 * Giriş ekranı: kullanıcı adı + PIN. Kayıt ekranı yoktur; `signUp` ve
 * `resetPasswordForEmail` hiç çağrılmaz (spec §12). Her hata için tek genel mesaj.
 */
export function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const signIn = useAuth((s) => s.signIn);
  const profile = useAuth((s) => s.profile);

  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (profile) navigate(homeFor(profile.role), { replace: true });
  }, [profile, navigate]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setFailed(false);
    try {
      await signIn(username, pin);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <form onSubmit={onSubmit} className="w-full max-w-sm">
        <div className="mb-10 flex flex-col items-center gap-3 text-center">
          <Flame aria-hidden size={40} className="text-lime" />
          <h1 className="text-4xl font-bold tracking-tight">RAMO&apos;S</h1>
          <p className="text-base text-muted">{t('login.subtitle')}</p>
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label htmlFor="username" className="text-sm font-medium text-muted">
              {t('login.username')}
            </label>
            <input
              id="username"
              name="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              required
              className={FIELD}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="pin" className="text-sm font-medium text-muted">
              {t('login.pin')}
            </label>
            <input
              id="pin"
              name="pin"
              type="password"
              inputMode="numeric"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              autoComplete="current-password"
              required
              className={`${FIELD} tabular tracking-[0.3em]`}
            />
          </div>

          {failed ? (
            <p
              role="alert"
              className="rounded-card border border-danger/40 bg-danger/15 px-4 py-3 text-base text-danger"
            >
              {t('errors.login_failed')}
            </p>
          ) : null}

          <Button
            type="submit"
            size="lg"
            fullWidth
            loading={loading}
            icon={<LogIn aria-hidden size={20} />}
          >
            {t('login.submit')}
          </Button>
        </div>
      </form>
    </main>
  );
}
