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
import { RpcError } from '../../lib/rpc';
import { Button } from '../../ui/Button';
import { Toast } from '../../ui/Toast';
import { ConnectionBanners } from '../common/ConnectionBanners';
import { KitchenHeader } from './KitchenHeader';
import { kitchenColumns, newOrderIds } from './kitchenLogic';
import { OrderCard } from './OrderCard';
import { SoldOutDrawer } from './SoldOutDrawer';
import { useSoundAlert } from './useSoundAlert';
import { useWakeLock } from './useWakeLock';

const TICK_MS = 15_000;
const ERROR_TOAST_MS = 4_000;

/**
 * Mutfak ekranı (KDS). Tüm vardiya boyunca açık kalan 1280×800 tablet: büyük kartlar, tek ana
 * eylem (HAZIR), sesli uyarı ve ekran kilidi kullanıcı dokunuşuyla açılır (BUILD-PROMPT §6 —
 * otomatik oynatma tarayıcıda engellidir). Realtime abonelik burada **açılmaz** — `<ConnectionBanners>`
 * zaten `useBroadcastInvalidation`'ı çağırıyor (Görev 12/13); burada ikinci kez çağırmak aynı 4
 * kanalı iki kere açar (mutfak tableti vardiya boyunca 8 kanal tutar, Free plan'da paylaşılan
 * bağlantı bütçesini boşuna tüketir — reviewer I1). `<ConnectionBanners>` tek gerçek kaynak.
 */
export function KitchenPage() {
  const { t, i18n } = useTranslation();
  const locale: Locale = i18n.language === 'de' ? 'de' : 'tr';

  const orders = useKitchenOrders();
  const markReady = useMarkReady();
  const undoReady = useUndoReady();
  const retryJob = useRetryJob();
  const reprint = useReprint();
  const { unlock, beep } = useSoundAlert();

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // Zamanlayıcı kimliği tutulur: art arda iki hata gelirse birincinin zamanlayıcısı ikinci mesajı
  // erken silerdi (en kötü hâlde 1 sn görünürlük) — mutfak HAZIR'ın neden çalışmadığını kaçırır.
  const errorTimer = useRef<number | undefined>(undefined);
  const showError = (err: unknown) => {
    const key = err instanceof RpcError ? err.key : 'unknown';
    setErrorMessage(t(`errors.${key}`));
    window.clearTimeout(errorTimer.current);
    errorTimer.current = window.setTimeout(() => setErrorMessage(null), ERROR_TOAST_MS);
  };
  useEffect(() => () => window.clearTimeout(errorTimer.current), []);

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
    order.print?.status === 'failed'
      ? () => retryJob.mutate(order.print!.job_id, { onError: showError })
      : undefined;

  return (
    <div className="flex min-h-dvh flex-col">
      <KitchenHeader onOpenSoldOut={() => setSoldOutOpen(true)} />
      <ConnectionBanners topics={['orders', 'menu', 'printer-status', 'settings']} />

      <div className="flex flex-1 gap-4 overflow-hidden p-4">
        <section className="flex flex-1 flex-col gap-3 overflow-y-auto">
          {/* O15 — iki sütun simetrik başlıklı. `kitchen.columns.active` tanımlıydı ama hiç
              kullanılmıyordu; başlıksız sütun "bu liste ne?" sorusunu açık bırakıyordu. */}
          <h2 className="text-lg font-semibold text-muted">{t('kitchen.columns.active')}</h2>
          {active.length === 0 ? (
            <p className="py-12 text-center text-lg text-muted">{t('kitchen.empty.active')}</p>
          ) : (
            // O14 — `items-start`: kısa kart, uzun kartın yanında satır yüksekliğine gerilmesin.
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] items-start gap-4">
              {active.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  locale={locale}
                  onReady={(id) => markReady.mutate(id, { onError: showError })}
                  onUndo={(id) => undoReady.mutate(id, { onError: showError })}
                  onRetry={retryFor(order)}
                  onReprint={() => reprint.mutate(order.id, { onError: showError })}
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
                  onReady={(id) => markReady.mutate(id, { onError: showError })}
                  onUndo={(id) => undoReady.mutate(id, { onError: showError })}
                  onRetry={retryFor(order)}
                  onReprint={() => reprint.mutate(order.id, { onError: showError })}
                />
              ))}
            </ul>
          )}
        </aside>
      </div>

      <SoldOutDrawer open={soldOutOpen} onClose={() => setSoldOutOpen(false)} locale={locale} />

      <Toast tone="danger">{errorMessage}</Toast>

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
