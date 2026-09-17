import { useEffect } from 'react';
import { create } from 'zustand';
import { useReadyOrdersQuery, type OrderView } from '../../data/orders';
import { useAuth } from '../../lib/auth';
import { useSoundAlert } from '../kitchen/useSoundAlert';
import { reduceReadyAlerts, type ReadyAlertState } from './readyAlerts';

const VIBRATE_PATTERN = [200, 100, 200];

interface AlertStore extends ReadyAlertState {
  /** Durumun ait olduğu kullanıcı: aynı telefonda başka garson girerse sıfırdan başlanır. */
  owner: string | null;
}

/**
 * Bileşen dışında tutulur: garson sipariş girişine (`/waiter/table/:id/order`, iskeletin
 * dışında) gidip dönünce iskelet yeniden monte olur. Durum bileşende olsaydı o arada hazır olan
 * sipariş "ilk yükleme" sayılıp sessizce yutulurdu.
 */
const useAlertStore = create<AlertStore>()(() => ({ owner: null, seen: null, alerted: [] }));

const dismiss = () => useAlertStore.setState({ alerted: [] });

/** Yalnız testler için. */
export const resetReadyAlerts = () =>
  useAlertStore.setState({ owner: null, seen: null, alerted: [] });

export interface ReadyAlerts {
  /** Uyarısı verilmiş, hâlâ teslim bekleyen en yeni sipariş. */
  latest: OrderView | null;
  /** Onun dışında uyarısı açık kalan sipariş sayısı. */
  more: number;
  dismiss: () => void;
}

/**
 * Uygulama öndeyken "Hazır" uyarısı (Görev 26): push bildirimine ek olarak ekranda şerit, ses
 * ve (Android'de) titreşim. İlk yüklemede uyarı vermez; sipariş teslim edilince şerit kendiliğinden
 * kapanır. Ses, tarayıcı kuralı gereği ilk dokunuşta açılır (`useSoundAlert.unlock`).
 */
export function useReadyAlerts(): ReadyAlerts {
  const me = useAuth((s) => s.profile?.id ?? null);
  const { orders, isSuccess } = useReadyOrdersQuery();
  const { unlock, beep } = useSoundAlert();
  const alerted = useAlertStore((s) => s.alerted);

  useEffect(() => {
    const onGesture = () => {
      unlock();
      window.removeEventListener('click', onGesture);
      window.removeEventListener('keydown', onGesture);
    };
    window.addEventListener('click', onGesture);
    window.addEventListener('keydown', onGesture);
    return () => {
      window.removeEventListener('click', onGesture);
      window.removeEventListener('keydown', onGesture);
    };
  }, [unlock]);

  // Sorgu her render'da yeni dizi döndürür; efekt yalnız kimlik kümesi değişince çalışsın.
  const idsKey = orders.map((o) => o.id).join(',');

  useEffect(() => {
    if (!isSuccess) return;
    const store = useAlertStore.getState();
    const base: ReadyAlertState = store.owner === me ? store : { seen: null, alerted: [] };
    const ids = idsKey ? idsKey.split(',').map((id) => ({ id })) : [];
    const { state, fresh } = reduceReadyAlerts(base, ids);
    useAlertStore.setState({ owner: me, seen: state.seen, alerted: state.alerted });
    if (fresh.length === 0) return;
    beep();
    try {
      navigator.vibrate?.(VIBRATE_PATTERN); // iOS'ta yok; Android'de dokunuş sonrası çalışır
    } catch {
      /* desteklenmiyor */
    }
  }, [idsKey, isSuccess, me, beep]);

  const byId = new Map(orders.map((o) => [o.id, o]));
  const pending = alerted.flatMap((id) => byId.get(id) ?? []);
  return { latest: pending.at(-1) ?? null, more: Math.max(0, pending.length - 1), dismiss };
}
