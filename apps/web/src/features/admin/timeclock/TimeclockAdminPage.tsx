import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { Banner } from '../../../ui/Banner';
import { Spinner } from '../../../ui/Spinner';
import { PeopleView } from './PeopleView';
import { QrView } from './QrView';
import { useTimeclockOverview } from './timeclockApi';
import { WeekView } from './WeekView';

const VIEWS = ['week', 'people', 'qr'] as const;
type View = (typeof VIEWS)[number];

/**
 * Admin > Mesai takibi (0020). Üç sekme: Haftalık tablo · Personel · QR ve ayarlar. Emir Et panelindeki
 * sistemin aynısı: görünüm yalnız haftalık, mola takibi yok, süre = çıkış − giriş. Düzeltme her zaman sebep
 * ister ve eski saatler geçmişte kalır (yasal kayıt, 2 yıl). Seçili sekme adreste (`?v=`) durur.
 */
export function TimeclockAdminPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const raw = params.get('v');
  const view: View = (VIEWS as readonly string[]).includes(raw ?? '') ? (raw as View) : 'week';
  const overview = useTimeclockOverview();

  const go = (v: View) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        next.set('v', v);
        return next;
      },
      { replace: true },
    );

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{t('admin.timeclock.title')}</h1>
        <p className="text-sm text-muted">{t('admin.timeclock.hint')}</p>
      </div>

      <div role="tablist" aria-label={t('admin.timeclock.tabsLabel')} className="-mx-1 flex gap-1 overflow-x-auto px-1">
        {VIEWS.map((v) => (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={view === v}
            onClick={() => go(v)}
            className={clsx(
              'flex min-h-12 shrink-0 items-center rounded-control px-3 text-sm font-medium',
              'transition-colors duration-150 ease-out',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
              view === v ? 'bg-lime/15 text-lime' : 'text-muted hover:bg-surface-2 hover:text-text',
            )}
          >
            {t(`admin.timeclock.tabs.${v}`)}
          </button>
        ))}
      </div>

      {overview.data ? (
        view === 'week' ? (
          <WeekView staff={overview.data.staff} />
        ) : view === 'people' ? (
          <PeopleView staff={overview.data.staff} />
        ) : (
          <QrView settings={overview.data.settings} />
        )
      ) : overview.isError ? (
        <Banner tone="danger">{t('errors.unknown')}</Banner>
      ) : (
        <div className="flex justify-center py-12">
          <Spinner className="text-muted" label={t('common.loading')} />
        </div>
      )}
    </div>
  );
}
