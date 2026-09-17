import { clsx } from 'clsx';
import { ClipboardList, LayoutGrid, User } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, Outlet } from 'react-router';
import { useReadyOrders, useSetOnDuty } from '../../data/orders';
import { useAuth } from '../../lib/auth';
import { syncPushSubscription } from '../../pwa/push';
import { Banner } from '../../ui/Banner';
import { Button } from '../../ui/Button';
import { ToastHost } from '../../ui/ToastHost';
import { ConnectionBanners } from '../common/ConnectionBanners';
import { InstallGuide } from '../onboarding/InstallGuide';
import { ReadyAlertBanner } from './ReadyAlertBanner';

/**
 * Garson bölümünün iskeleti: üst bar (ad + mesai çipi), bağlantı şeritleri, içerik ve alt
 * gezinme (Masalar · Hazır · Profil). `/waiter/table/:id/order` (Görev 14) bu düzenin dışındadır.
 *
 * Görev 25/26: başlığın hemen altında uygulama içi "Hazır" şeridi (push'a ek, uygulama öndeyken);
 * içeriğin üstünde ilk açılış kurulum rehberi (kapatılabilir sayfa içi kart — modal değil, akışı
 * kesmez).
 */
export function WaiterLayout() {
  const { t } = useTranslation();
  const profile = useAuth((s) => s.profile);
  const setOnDuty = useSetOnDuty();
  const readyCount = useReadyOrders().length;
  const onDuty = !!profile?.on_duty_since;
  const profileId = profile?.id;

  // Bildirim izni zaten verilmişse aboneliği bu kullanıcıya yeniden yaz (sessiz; izin sormaz).
  useEffect(() => {
    if (profileId) void syncPushSubscription();
  }, [profileId]);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-10 flex h-[var(--header-h)] items-center justify-between gap-3 border-b border-border bg-surface px-4">
        <span className="truncate text-base font-semibold">{profile?.display_name}</span>
        <button
          type="button"
          aria-pressed={onDuty}
          onClick={() => setOnDuty.mutate(!onDuty)}
          className={clsx(
            'inline-flex min-h-12 shrink-0 items-center rounded-full border px-4 text-sm font-semibold transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
            onDuty ? 'border-lime/40 bg-lime/15 text-lime' : 'border-border bg-surface-2 text-muted',
          )}
        >
          {onDuty ? t('waiter.duty.on') : t('waiter.duty.off')}
        </button>
      </header>

      <ReadyAlertBanner />

      {!onDuty ? (
        <Banner
          tone="warning"
          className="mx-4 mt-3"
          action={
            <Button size="md" loading={setOnDuty.isPending} onClick={() => setOnDuty.mutate(true)}>
              {t('waiter.duty.start')}
            </Button>
          }
        >
          {t('waiter.duty.offBanner')}
        </Banner>
      ) : null}

      <ConnectionBanners topics={['orders', 'menu', 'printer-status', 'settings']} />

      <main className="flex-1 overflow-y-auto pb-24">
        <InstallGuide />
        <Outlet />
      </main>

      <nav
        aria-label={t('waiter.nav.label')}
        className="fixed inset-x-0 bottom-0 z-20 flex border-t border-border bg-surface pb-[env(safe-area-inset-bottom)]"
      >
        <TabLink to="/waiter" end icon={<LayoutGrid aria-hidden size={22} />} label={t('waiter.tables.title')} />
        <TabLink
          to="/waiter/ready"
          icon={<ClipboardList aria-hidden size={22} />}
          label={t('waiter.ready.title')}
          badge={readyCount > 0 ? readyCount : undefined}
        />
        <TabLink to="/waiter/profile" icon={<User aria-hidden size={22} />} label={t('waiter.profile.title')} />
      </nav>

      <ToastHost className="mb-[calc(3.5rem+env(safe-area-inset-bottom))]" />
    </div>
  );
}

function TabLink({
  to,
  end,
  icon,
  label,
  badge,
}: {
  to: string;
  end?: boolean;
  icon: ReactNode;
  label: string;
  badge?: number;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        clsx(
          'relative flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-xs font-medium',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
          isActive ? 'text-lime' : 'text-muted',
        )
      }
    >
      {icon}
      <span>{label}</span>
      {badge ? (
        <span
          aria-live="polite"
          className="absolute right-6 top-1 inline-flex min-w-5 items-center justify-center rounded-full bg-gold px-1 text-[10px] font-bold text-bg"
        >
          {badge}
        </span>
      ) : null}
    </NavLink>
  );
}
