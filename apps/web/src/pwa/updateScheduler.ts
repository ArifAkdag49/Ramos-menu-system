export interface UpdateSchedulerDeps {
  /** Bekleyen yeni sürümü etkinleştirir ve sayfayı yeniler. */
  apply: () => void;
  /** Şimdi yenilemek güvenli mi (`updateGate`). */
  safe: () => boolean;
  /** Güvenli değilken şerit: kullanıcı beklemek istemezse elle basar. */
  showPrompt: (applyNow: () => void) => void;
  /** Güvenli mi diye yeniden bakma aralığı. */
  retryMs?: number;
}

const DEFAULT_RETRY_MS = 10_000;

/**
 * Yeni sürüm hazır olduğunda ne yapılacağını yönetir.
 *
 * Eski davranış "her zaman sor" idi: bekleyen service worker yalnız kullanıcı düğmeye basınca
 * devreye giriyordu. Uygulama restoranda hiç kapanmadığı için (telefon/tablette arka planda durur)
 * bekleyen sürüm kendiliğinden etkinleşmiyor, şerit her açılışta yeniden çıkıyordu.
 *
 * Yenisi: ekran boş olur olmaz — ya da uygulama arka plana atılır atılmaz — yeni sürüm sessizce
 * devreye alınır. Şerit yalnız kullanıcı iş başındayken (açık panel, yazı yazarken, istek/baskı
 * sürerken) görünür ve iş biter bitmez kendiliğinden uygulanır.
 */
export function startUpdateScheduler(deps: UpdateSchedulerDeps): () => void {
  let done = false;
  let timer: ReturnType<typeof setInterval> | null = null;

  const stop = (): void => {
    done = true;
    if (timer !== null) clearInterval(timer);
    timer = null;
    document.removeEventListener('visibilitychange', check);
    window.removeEventListener('focus', check);
  };

  const applyNow = (): void => {
    if (done) return;
    stop();
    deps.apply();
  };

  function check(): void {
    if (done) return;
    if (deps.safe()) applyNow();
  }

  if (deps.safe()) {
    done = true;
    deps.apply();
    return () => {};
  }

  deps.showPrompt(applyNow);
  timer = setInterval(check, deps.retryMs ?? DEFAULT_RETRY_MS);
  document.addEventListener('visibilitychange', check);
  window.addEventListener('focus', check);
  return stop;
}
