import { clsx } from 'clsx';
import { ChevronLeft, ChevronRight, Hand, MapPinOff, Pencil, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '../../../ui/Badge';
import { Banner } from '../../../ui/Banner';
import { Button } from '../../../ui/Button';
import { EmptyState } from '../../../ui/EmptyState';
import { IconButton } from '../../../ui/IconButton';
import { Spinner } from '../../../ui/Spinner';
import { ShiftSheet, type ShiftTarget } from './ShiftSheet';
import { useTimeclockWeek } from './timeclockApi';
import {
  addDays,
  berlinToday,
  buildWeekRows,
  dmy,
  fmtMinutes,
  hhmm,
  mondayOf,
  type Shift,
  type TimeclockStaff,
} from './timeclockLogic';

export function WeekView({ staff }: { staff: TimeclockStaff[] }) {
  const { t, i18n } = useTranslation();
  const thisMonday = mondayOf(berlinToday());
  const [monday, setMonday] = useState(thisMonday);
  const [target, setTarget] = useState<ShiftTarget | null>(null);
  const week = useTimeclockWeek(monday);
  const rows = useMemo(() => (week.data ? buildWeekRows(week.data) : null), [week.data]);

  const dayLabel = useMemo(() => {
    const f = new Intl.DateTimeFormat(i18n.language, {
      weekday: 'short',
      day: '2-digit',
      month: '2-digit',
      timeZone: 'UTC',
    });
    return (d: string) => f.format(new Date(`${d}T12:00:00Z`));
  }, [i18n.language]);

  const working = staff.filter((s) => s.working);

  return (
    <div className="flex flex-col gap-4">
      <section
        aria-label={t('admin.timeclock.nowWorking')}
        className="flex flex-col gap-2 rounded-card border border-border bg-surface px-4 py-3"
      >
        <p className="text-xs font-semibold text-muted">{t('admin.timeclock.nowWorking')}</p>
        {working.length === 0 ? (
          <p className="text-sm text-muted">{t('admin.timeclock.nobodyWorking')}</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {working.map((s) => (
              <li key={s.id}>
                <Badge tone="open">
                  {s.name} · {t('admin.timeclock.since', { time: hhmm(s.since ?? '') })}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <IconButton
          label={t('admin.timeclock.prevWeek')}
          icon={<ChevronLeft aria-hidden size={20} />}
          onClick={() => setMonday(addDays(monday, -7))}
        />
        <span className="tabular min-w-44 text-center text-sm">
          {dmy(monday)} – {dmy(addDays(monday, 6))}
        </span>
        <IconButton
          label={t('admin.timeclock.nextWeek')}
          icon={<ChevronRight aria-hidden size={20} />}
          onClick={() => setMonday(addDays(monday, 7))}
        />
        {monday !== thisMonday ? (
          <Button variant="ghost" onClick={() => setMonday(thisMonday)}>
            {t('admin.timeclock.thisWeek')}
          </Button>
        ) : null}
      </div>

      {!rows ? (
        week.isError ? (
          <Banner tone="danger">{t('errors.unknown')}</Banner>
        ) : (
          <div className="flex justify-center py-12">
            <Spinner className="text-muted" label={t('common.loading')} />
          </div>
        )
      ) : rows.length === 0 ? (
        <EmptyState title={t('admin.timeclock.noStaff')} />
      ) : (
        <div className="overflow-x-auto rounded-card border border-border">
          <table className="w-full min-w-[880px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-2 text-xs text-muted">
                <th scope="col" className="sticky left-0 z-10 bg-surface-2 px-3 py-2.5 text-left font-medium">
                  {t('admin.timeclock.colStaff')}
                </th>
                {week.data!.days.map((d) => (
                  <th key={d} scope="col" className="px-2 py-2.5 text-left font-medium">
                    {dayLabel(d)}
                  </th>
                ))}
                <th scope="col" className="px-3 py-2.5 text-right font-medium">
                  {t('admin.timeclock.colTotal')}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-border last:border-0">
                  <th scope="row" className="sticky left-0 z-10 bg-surface px-3 py-2 text-left font-medium">
                    {row.name}
                  </th>
                  {week.data!.days.map((d) => (
                    <td key={d} className="group min-w-24 px-1.5 py-1.5 align-top">
                      <div className="flex flex-col gap-1">
                        {(row.days[d] ?? []).map((sh) => (
                          <ShiftChip
                            key={sh.id}
                            shift={sh}
                            onClick={() => setTarget({ kind: 'edit', shift: sh, name: row.name })}
                          />
                        ))}
                        <button
                          type="button"
                          aria-label={t('admin.timeclock.addShiftFor', { name: row.name, day: dayLabel(d) })}
                          onClick={() => setTarget({ kind: 'add', staffId: row.id, name: row.name, date: d })}
                          className="flex h-7 items-center justify-center rounded-control text-muted opacity-40 transition-opacity hover:bg-surface-2 hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime group-hover:opacity-100"
                        >
                          <Plus aria-hidden size={14} />
                        </button>
                      </div>
                    </td>
                  ))}
                  <td className="tabular px-3 py-2 text-right font-semibold">{fmtMinutes(row.totalMinutes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {target ? <ShiftSheet target={target} onClose={() => setTarget(null)} /> : null}
    </div>
  );
}

function ShiftChip({ shift, onClick }: { shift: Shift; onClick: () => void }) {
  const { t } = useTranslation();
  const open = shift.end === null;
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'tabular rounded-control border px-1.5 py-1 text-left transition-colors hover:border-lime/60',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime',
        shift.missing_end ? 'border-danger/50 bg-danger/10' : 'border-border bg-surface-2',
      )}
    >
      <span className="block whitespace-nowrap">
        {hhmm(shift.start)}–{shift.end ? hhmm(shift.end) : '…'}
      </span>
      <span className="flex items-center gap-1 text-xs text-muted">
        {shift.missing_end ? (
          <span className="text-danger-ink">{t('admin.timeclock.missingEnd')}</span>
        ) : open ? (
          <span className="text-lime">{t('admin.timeclock.running')}</span>
        ) : (
          fmtMinutes(shift.minutes ?? 0)
        )}
        {shift.edited ? (
          <span title={t('admin.timeclock.edited')}>
            <Pencil size={11} aria-label={t('admin.timeclock.edited')} />
          </span>
        ) : shift.manual ? (
          <span title={t('admin.timeclock.manual')}>
            <Hand size={11} aria-label={t('admin.timeclock.manual')} />
          </span>
        ) : null}
        {shift.location_failed ? (
          <span title={t('admin.timeclock.locationFailed')}>
            <MapPinOff size={12} className="text-warning" aria-label={t('admin.timeclock.locationFailed')} />
          </span>
        ) : null}
      </span>
    </button>
  );
}
