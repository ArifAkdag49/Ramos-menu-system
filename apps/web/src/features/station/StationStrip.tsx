import { clsx } from 'clsx';
import { Printer } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSettings } from '../../data/settings';
import { isNative } from '../../native/capacitor';
import { Badge } from '../../ui/Badge';
import { stationBadge, useStationStore } from './stationStore';
import { useStation } from './useStation';

/**
 * Mutfak ekranı başlığının hemen altındaki "Yazıcı istasyonu" şeridi. Yalnız yerel Android
 * uygulamasında ve Admin → Ayarlar → Baskı yolu "Tablet yazıcı istasyonu" iken görünür; tarayıcıda
 * ve diğer yollarda hiçbir şey çizmez (ayar sorgusu bile açılmaz).
 *
 * Başlık çubuğunun içine değil altına konur: telefon genişliğinde başlıktaki "Tükendi" ve "Çıkış"
 * düğmeleriyle taşmasın; başlığın `--header-h` yüksekliği (toast ofseti, R81) değişmesin.
 */
export function StationStrip() {
  return isNative() ? <NativeStationStrip /> : null;
}

function NativeStationStrip() {
  const { t, i18n } = useTranslation();
  useStation();
  const route = useSettings()?.print_route;
  const on = useStationStore((s) => s.on);
  const snapshot = useStationStore((s) => s.snapshot);

  if (route !== 'station') return null;

  const badge = stationBadge(on, snapshot);
  const label =
    badge.lastPrintedAt !== undefined
      ? t('kitchen.station.onLastPrint', {
          time: new Intl.DateTimeFormat(i18n.language, {
            hour: '2-digit',
            minute: '2-digit',
          }).format(badge.lastPrintedAt),
        })
      : t(badge.key as Exclude<typeof badge.key, 'kitchen.station.onLastPrint'>);

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border bg-surface px-3 py-1.5 sm:px-6">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={() => useStationStore.getState().setOn(!on)}
        className={clsx(
          'inline-flex min-h-12 items-center gap-3 rounded-control px-1 text-base font-semibold',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
        )}
      >
        <Printer aria-hidden size={20} className="shrink-0" />
        <span>{t('kitchen.station.label')}</span>
        <span
          aria-hidden
          className={clsx(
            'relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors',
            on ? 'border-lime bg-lime' : 'border-border bg-surface-2',
          )}
        >
          <span
            className={clsx(
              'size-5 rounded-full transition-transform',
              on ? 'translate-x-6 bg-bg' : 'translate-x-1 bg-muted',
            )}
          />
        </span>
      </button>
      <Badge tone={badge.tone}>{label}</Badge>
      {on ? (
        <p className="min-w-0 basis-full text-sm text-muted sm:basis-auto">
          {t('kitchen.station.hint')}
        </p>
      ) : null}
      {on && snapshot.lastError ? (
        <p className="min-w-0 basis-full break-all text-xs text-warning">
          {t('kitchen.station.lastError', { error: snapshot.lastError })}
        </p>
      ) : null}
    </div>
  );
}
