import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Flame } from 'lucide-react';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { RouterProvider } from 'react-router';
import { useAuth } from '../lib/auth';
import { Spinner } from '../ui/Spinner';
import { router } from './router';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 2, refetchOnWindowFocus: true } },
});

/** StrictMode iki kez bağladığı için oturum açılışı yalnız bir kez çalışır. */
let started = false;

export function App() {
  const { t } = useTranslation();
  const ready = useAuth((s) => s.ready);

  useEffect(() => {
    if (started) return;
    started = true;
    void useAuth.getState().init();
  }, []);

  if (!ready) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4">
        <Flame aria-hidden size={40} className="text-lime" />
        <p className="text-3xl font-bold tracking-tight">RAMO&apos;S</p>
        <Spinner className="text-muted" label={t('common.loading')} />
      </div>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
