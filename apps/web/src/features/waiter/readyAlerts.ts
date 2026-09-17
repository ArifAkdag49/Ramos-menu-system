/**
 * Uygulama içi "Hazır" uyarısının saf mantığı (Görev 26). Hook (`useReadyAlerts`) yalnız bunu
 * çağırır, ses/titreşim/ekran işini yapar.
 */

/** `prev` kümesinde olmayan (yani son bakıştan beri hazır olmuş) siparişler. */
export function newlyReady<T extends { id: string }>(
  prev: ReadonlySet<string>,
  orders: readonly T[],
): T[] {
  return orders.filter((o) => !prev.has(o.id));
}

export interface ReadyAlertState {
  /** Son bakışta hazır olan sipariş kimlikleri; `null` = henüz hiç yüklenmedi. */
  seen: ReadonlySet<string> | null;
  /** Uyarısı verilmiş ve hâlâ hazır bekleyen siparişler, eskiden yeniye. */
  alerted: readonly string[];
}

/**
 * Yeni hazır listesi geldiğinde durumu ilerletir.
 * - İlk yükleme uyarı vermez: garson uygulamayı açtığında zaten bekleyenler "yeni" değildir.
 * - Listeden düşen (teslim edilen ya da mutfakta geri alınan) sipariş uyarıdan da düşer.
 */
export function reduceReadyAlerts(
  state: ReadyAlertState,
  orders: readonly { id: string }[],
): { state: ReadyAlertState; fresh: string[] } {
  const current = new Set(orders.map((o) => o.id));
  if (state.seen === null) return { state: { seen: current, alerted: [] }, fresh: [] };
  const fresh = newlyReady(state.seen, orders).map((o) => o.id);
  const alerted = [...state.alerted.filter((id) => current.has(id)), ...fresh];
  return { state: { seen: current, alerted }, fresh };
}
