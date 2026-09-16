import { QueryClientProvider } from '@tanstack/react-query';
import { Flame, LogOut, RotateCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RouterProvider } from 'react-router';
import { useAuth } from '../lib/auth';
import { queryClient } from '../lib/queryClient';
import { Button } from '../ui/Button';
import { Spinner } from '../ui/Spinner';
import { router } from './router';

/** StrictMode iki kez bağladığı için oturum açılışı yalnız bir kez çalışır. */
let started = false;

function Brand() {
  return (
    <>
      <Flame aria-hidden size={40} className="text-lime" />
      <p className="text-3xl font-bold tracking-tight">RAMO&apos;S</p>
    </>
  );
}

export function App() {
  const { t } = useTranslation();
  const ready = useAuth((s) => s.ready);
  const problem = useAuth((s) => s.problem);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    if (started) return;
    started = true;
    // `init()` kendi içinde yakalar: hiçbir durumda reddetmez, `ready` her yolda kurulur.
    void useAuth.getState().init();
  }, []);

  if (!ready) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4">
        <Brand />
        <Spinner className="text-muted" label={t('common.loading')} />
      </div>
    );
  }

  // Açılış çözülemedi: sonsuz yükleyici yerine ne olduğu + iki çıkış yolu.
  if (problem) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6 text-center">
        <Brand />
        <p role="alert" className="max-w-sm text-base text-danger-ink">
          {t(`errors.${problem}`)}
        </p>
        <div className="flex w-full max-w-sm flex-col gap-3">
          <Button
            size="lg"
            fullWidth
            loading={retrying}
            icon={<RotateCw aria-hidden size={20} />}
            onClick={() => {
              setRetrying(true);
              void useAuth
                .getState()
                .init()
                .finally(() => setRetrying(false));
            }}
          >
            {t('common.retry')}
          </Button>
          <Button
            variant="ghost"
            fullWidth
            icon={<LogOut aria-hidden size={20} />}
            onClick={() => void useAuth.getState().signOut()}
          >
            {t('common.logout')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
