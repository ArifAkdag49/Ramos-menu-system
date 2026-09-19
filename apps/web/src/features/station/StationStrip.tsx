import { clsx } from 'clsx';
import { AlertTriangle, BatteryWarning, Printer } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useSettings } from '../../data/settings';
import { isNative } from '../../native/capacitor';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { openBatteryOptimizationSettings, stationErrorKey } from './backgroundStation';
import {
  backgroundSnapshot,
  INITIAL_SNAPSHOT,
  stationBadge,
  useStationStore,
  type BackgroundEnableFailure,
  type StationSnapshot,
} from './stationStore';
import {
  refreshBackgroundStatus,
  setBackgroundStation,
  useBackgroundStation,
  useDocumentVisible,
  useStationMode,
} from './useBackgroundStation';
import { useStation } from './useStation';

/**
 * Mutfak ekranı başlığının hemen altındaki "Yazıcı istasyonu" şeridi.
 *
 * Yerel Android uygulamasında **her zaman** görünür — baskı yolu ne olursa olsun. Eskiden yol
 * "Tablet yazıcı istasyonu" değilken şerit hiç çizilmiyordu; Admin'de yol değiştirilince mutfaktaki
 * anahtar "kayboluyor" ve neden kaybolduğu anlaşılmıyordu. Şimdi anahtar yerinde kalır, rozet
 * "Baskı yolu farklı" der ve nereden düzeltileceği yazılır. Tarayıcıda (Chrome/PWA) anahtar yoktur;
 * ama yol istasyonsa "bu cihaz Ramo's uygulaması değil, fiş basamaz" uyarısı çizilir — aksi hâlde
 * fişler sessizce sırada beklerdi.
 *
 * İki kip (`useStationMode`):
 * - **Arka plan** (yeni APK): anahtar yerel hizmeti açar/kapatır; fişi uygulama kapalıyken de hizmet
 *   basar.
 * - **Eski** (arka plan yöntemleri olmayan APK): anahtar WebView'daki JS döngüsünü açar; döngü yalnız
 *   yol istasyonken ve uygulama ön plandayken çalışır (`useStation`).
 *
 * Başlık çubuğunun içine değil altına konur: telefon genişliğinde başlıktaki "Tükendi" ve "Çıkış"
 * düğmeleriyle taşmasın; başlığın `--header-h` yüksekliği (toast ofseti, R81) değişmesin.
 */
export function StationStrip() {
  return isNative() ? <NativeStationStrip /> : <BrowserStationHint />;
}

/** Ayar henüz gelmediyse (`undefined`) yol bilinmiyor sayılır: uyarı çizilmez. */
const isRouteOff = (route: string | null | undefined) => route !== undefined && route !== 'station';

function BrowserStationHint() {
  const { t } = useTranslation();
  const route = useSettings()?.print_route;
  if (route !== 'station') return null;
  return (
    <StripShell>
      <p role="note" className="flex min-w-0 items-start gap-2 text-sm text-warning">
        <AlertTriangle aria-hidden size={18} className="mt-0.5 shrink-0" />
        <span>{t('kitchen.station.browserHint')}</span>
      </p>
    </StripShell>
  );
}

function NativeStationStrip() {
  const mode = useStationMode();
  const visible = useDocumentVisible();
  const route = useSettings()?.print_route;
  useStation(mode);
  useBackgroundStation(mode === 'background', visible, route);

  if (mode === 'legacy') return <LegacyStrip routeOff={isRouteOff(route)} />;
  if (mode === 'background') return <BackgroundStrip route={route} />;
  return null;
}

function StripShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border bg-surface px-3 py-1.5 sm:px-6">
      {children}
    </div>
  );
}

function StationSwitch({
  checked,
  busy = false,
  disabled = false,
  onToggle,
}: {
  checked: boolean;
  busy?: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-busy={busy || undefined}
      disabled={disabled || busy}
      onClick={onToggle}
      className={clsx(
        'inline-flex min-h-12 items-center gap-3 rounded-control px-1 text-base font-semibold',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
        'disabled:cursor-wait disabled:opacity-60',
      )}
    >
      <Printer aria-hidden size={20} className="shrink-0" />
      <span>{t('kitchen.station.label')}</span>
      <span
        aria-hidden
        className={clsx(
          'relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors',
          checked ? 'border-lime bg-lime' : 'border-border bg-surface-2',
        )}
      >
        <span
          className={clsx(
            'size-5 rounded-full transition-transform',
            checked ? 'translate-x-6 bg-bg' : 'translate-x-1 bg-muted',
          )}
        />
      </span>
    </button>
  );
}

function StationBadge({
  on,
  snapshot,
  routeOk,
}: {
  on: boolean;
  snapshot: StationSnapshot;
  routeOk: boolean;
}) {
  const { t, i18n } = useTranslation();
  const badge = stationBadge(on, snapshot, routeOk);
  const label =
    badge.lastPrintedAt !== undefined
      ? t('kitchen.station.onLastPrint', {
          time: new Intl.DateTimeFormat(i18n.language, {
            hour: '2-digit',
            minute: '2-digit',
          }).format(badge.lastPrintedAt),
        })
      : t(badge.key as Exclude<typeof badge.key, 'kitchen.station.onLastPrint'>);
  return <Badge tone={badge.tone}>{label}</Badge>;
}

/** Baskı yolu istasyon değil: bu tablet iş almaz — nereden düzeltileceği yazılır. */
function RouteOffNote() {
  const { t } = useTranslation();
  return (
    <p role="note" className="min-w-0 basis-full text-sm text-warning">
      {t('kitchen.station.routeOff')}
    </p>
  );
}

/**
 * Eski kip: JS döngüsünün anahtarı (`ramos-station-on`) ve durumu. Yol istasyon değilken anahtar
 * yine açılıp kapatılabilir (kalıcı yazılır); döngü yol istasyona dönünce kendiliğinden başlar.
 */
function LegacyStrip({ routeOff }: { routeOff: boolean }) {
  const { t } = useTranslation();
  const on = useStationStore((s) => s.on);
  const snapshot = useStationStore((s) => s.snapshot);

  return (
    <StripShell>
      <StationSwitch checked={on} onToggle={() => useStationStore.getState().setOn(!on)} />
      <StationBadge on={on} snapshot={snapshot} routeOk={!routeOff} />
      {routeOff ? <RouteOffNote /> : null}
      {on && !routeOff ? (
        <p className="min-w-0 basis-full text-sm text-muted sm:basis-auto">
          {t('kitchen.station.hint')}
        </p>
      ) : null}
      {on && !routeOff && snapshot.lastError ? (
        <p className="min-w-0 basis-full break-all text-xs text-warning">
          {t('kitchen.station.lastError', { error: snapshot.lastError })}
        </p>
      ) : null}
    </StripShell>
  );
}

function enableErrorText(t: TFunction, e: BackgroundEnableFailure): string {
  if (e.reason === 'rpc') return t(`errors.${e.key}`);
  if (e.reason === 'notifications_denied') return t('kitchen.station.bg.notificationsDenied');
  const detail = (e.reason !== 'unsupported' && e.message?.trim()) || e.reason;
  return t('kitchen.station.bg.startFailed', { detail });
}

/**
 * Arka plan kipi: anahtar yerel hizmeti yönetir; durum 2 sn'de bir yerelden okunur. Yol istasyon
 * değilken de çizilir: hizmet açıksa kapatılabilsin, kapalıysa neden fiş çıkmadığı görünsün.
 */
function BackgroundStrip({ route }: { route: string | null | undefined }) {
  const { t } = useTranslation();
  const bg = useStationStore((s) => s.bg);
  const busy = useStationStore((s) => s.bgBusy);
  const actionError = useStationStore((s) => s.bgError);
  const enabled = bg?.enabled === true;

  // Sunucudaki ayar ya da hizmetin son okuduğu yol istasyon değilse bu tablet iş almaz.
  const routeOff = isRouteOff(route) || (bg?.route != null && bg.route !== 'station');
  const errorKey = stationErrorKey(bg?.lastError ?? null);

  return (
    <StripShell>
      <StationSwitch
        checked={enabled}
        busy={busy}
        // İlk yerel okuma birkaç ms sürer; o ana dek anahtarın gerçek durumu bilinmez.
        disabled={bg === null}
        onToggle={() => void setBackgroundStation(!enabled)}
      />
      <StationBadge
        on={enabled}
        snapshot={bg ? backgroundSnapshot(bg) : INITIAL_SNAPSHOT}
        routeOk={!routeOff}
      />
      {routeOff ? <RouteOffNote /> : null}
      {enabled && bg ? (
        <>
          <p
            className={clsx(
              'min-w-0 basis-full text-sm sm:basis-auto',
              bg.running ? 'text-muted' : 'text-warning',
            )}
          >
            {t(bg.running ? 'kitchen.station.bg.running' : 'kitchen.station.bg.notRunning')}
          </p>
          <p className="text-sm text-muted tabular">
            {t('kitchen.station.bg.printed', { count: bg.printed })}
          </p>
          {bg.lastError ? (
            <p className="min-w-0 basis-full break-words text-xs text-warning">
              {errorKey ? t(errorKey) : t('kitchen.station.lastError', { error: bg.lastError })}
            </p>
          ) : null}
          {!bg.notificationsGranted ? (
            <p className="min-w-0 basis-full text-xs text-muted">
              {t('kitchen.station.bg.notificationsHidden')}
            </p>
          ) : null}
          {!bg.ignoringBatteryOptimizations ? (
            <div className="flex min-w-0 basis-full flex-wrap items-center gap-x-3 gap-y-1">
              <p className="min-w-0 flex-1 basis-56 text-sm text-warning">
                {t('kitchen.station.bg.batteryHint')}
              </p>
              <Button
                variant="secondary"
                icon={<BatteryWarning aria-hidden size={18} />}
                onClick={() =>
                  void openBatteryOptimizationSettings().then(() => refreshBackgroundStatus())
                }
              >
                {t('kitchen.station.bg.battery')}
              </Button>
            </div>
          ) : null}
        </>
      ) : null}
      {actionError ? (
        <p role="alert" className="min-w-0 basis-full break-words text-sm text-danger-ink">
          {enableErrorText(t, actionError)}
        </p>
      ) : null}
    </StripShell>
  );
}
