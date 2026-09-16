import type { Locale } from '@ramos/shared';
import { Flame } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useKitchenOrders,
  useMarkReady,
  useReprint,
  useRetryJob,
  useUndoReady,
  type OrderView,
} from '../../data/orders';
import { useBroadcastInvalidation } from '../../lib/realtime';
import { Button } from '../../ui/Button';
import { ConnectionBanners } from '../common/ConnectionBanners';
import { KitchenHeader } from './KitchenHeader';
import { kitchenColumns, newOrderIds } from './kitchenLogic';
import { OrderCard } from './OrderCard';
import { SoldOutDrawer } from './SoldOutDrawer';
import { useSoundAlert } from './useSoundAlert';
import { useWakeLock } from './useWakeLock';

const TICK_MS = 15_000;

/**
 * Mutfak ekranı (KDS). Tüm vardiya boyunca açık kalan 1280×800 tablet: büyük kartlar, tek ana
 * eylem (HAZIR), sesli uyarı ve ekran kilidi kullanıcı dokunuşuyla açılır (BUILD-PROMPT §6 —
 * otomatik oynatma tarayıcıda engellidir). Realtime `useBroadcastInvalidation` zaten Görev
 * 12'de yazıldı; burada yalnız tüketilir, ikinci bir yoklama eklenmez.
 */
export function KitchenPage() {
  const { t, i18n } = useTranslation();
  const locale: Locale = i18n.language === 'de' ? 'de' : 'tr';

  useBroadcastInvalidation(['orders', 'menu', 'printer-status', 'settings']);
  const orders = useKitchenOrders();
  const markReady = useMarkReady();
  const undoReady = useUndoReady();
  const retryJob = useRetryJob();
  const reprint = useReprint();
  const { unlock, beep } = useSoundAlert();

  const [started, setStarted] = useState(false);
  const [soldOutOpen, setSoldOutOpen] = useState(false);
  const [, forceTick] = useState(0);

  useWakeLock(started);

  useEffect(() => {
    const id = setInterval(() => forceTick((n) => n + 1), TICK_MS);
    return () => clearInterval(id);
  }, []);

  // Yeni sipariş sesi: ilk yüklemede çalmaz, yalnız sonradan eklenen siparişlerde (Adım 4).
  const prevIdsRef = useRef<Set<string> | null>(null);
  const activeIdsKey = orders
    .filter((o) => o.status === 'in_kitchen')
    .map((o) => o.id)
    .join(',');
  useEffect(() => {
    const activeOrders = orders.filter((o) => o.status === 'in_kitchen');
    const ids = new Set(activeOrders.map((o) => o.id));
    if (prevIdsRef.current) {
      const added = newOrderIds(prevIdsRef.current, activeOrders);
      if (added.length > 0 && started) beep();
    }
    prevIdsRef.current = ids;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIdsKey, started]);

  const now = new Date();
  const { active, ready } = kitchenColumns(orders, now);

  const startScreen = () => {
    unlock();
    setStarted(true);
    // Tam ekran bir iyileştirmedir: API yoksa, izin yoksa ya da senkron/asenkron reddederse
    // (bazı tablet tarayıcılarında olur) ekran yine de çalışmaya devam eder — asla fırlatmaz.
    try {
      void document.documentElement.requestFullscreen?.()?.catch(() => {});
    } catch {
      /* tam ekran desteklenmiyor ya da engellendi — sorun değil */
    }
  };

  const retryFor = (order: OrderView) =>
    order.print?.status === 'failed' ? () => retryJob.mutate(order.print!.job_id) : undefined;

  return (
    <div className="flex min-h-dvh flex-col">
      <KitchenHeader onOpenSoldOut={() => setSoldOutOpen(true)} />
      <ConnectionBanners topics={['orders', 'menu', 'printer-status', 'settings']} />

      <div className="flex flex-1 gap-4 overflow-hidden p-4">
        <section className="flex-1 overflow-y-auto">
          {active.length === 0 ? (
            <p className="py-12 text-center text-lg text-muted">{t('kitchen.empty.active')}</p>
          ) : (
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-4">
              {active.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  locale={locale}
                  onReady={(id) => markReady.mutate(id)}
                  onUndo={(id) => undoReady.mutate(id)}
                  onRetry={retryFor(order)}
                  onReprint={() => reprint.mutate(order.id)}
                />
              ))}
            </ul>
          )}
        </section>

        <aside className="flex w-[360px] shrink-0 flex-col gap-3 overflow-y-auto border-l border-border pl-4">
          <h2 className="text-lg font-semibold text-muted">{t('kitchen.columns.ready')}</h2>
          {ready.length === 0 ? (
            <p className="py-6 text-center text-base text-muted">{t('kitchen.empty.ready')}</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {ready.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  locale={locale}
                  compact
                  onReady={(id) => markReady.mutate(id)}
                  onUndo={(id) => undoReady.mutate(id)}
                  onRetry={retryFor(order)}
                  onReprint={() => reprint.mutate(order.id)}
                />
              ))}
            </ul>
          )}
        </aside>
      </div>

      <SoldOutDrawer open={soldOutOpen} onClose={() => setSoldOutOpen(false)} locale={locale} />

      {!started ? (
        <div className="fixed inset-0 z-30 flex flex-col items-center justify-center gap-6 bg-bg px-6 text-center">
          <Flame aria-hidden size={56} className="text-lime" />
          <h1 className="text-2xl font-semibold">{t('kitchen.start.title')}</h1>
          <p className="max-w-sm text-base text-muted">{t('kitchen.start.hint')}</p>
          <Button size="lg" className="min-h-16 px-8 text-xl" onClick={startScreen}>
            {t('kitchen.start.button')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
