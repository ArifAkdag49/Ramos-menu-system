import { clsx } from 'clsx';
import { Copy, Plus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from '../../../lib/toast';
import { Badge } from '../../../ui/Badge';
import { Button } from '../../../ui/Button';
import { EmptyState } from '../../../ui/EmptyState';
import { Sheet } from '../../../ui/Sheet';
import { errorKey } from '../../waiter/submitError';
import { TextField } from '../menu/fields';
import { QrImage } from './QrImage';
import { useAddStaff, useClockManually, usePairCode, useUpdateStaff } from './timeclockApi';
import { hhmm, pairUrl, type TimeclockStaff } from './timeclockLogic';

export function PeopleView({ staff }: { staff: TimeclockStaff[] }) {
  const { t } = useTranslation();
  const add = useAddStaff();
  const update = useUpdateStaff();
  const clock = useClockManually();
  const pair = usePairCode();
  const [name, setName] = useState('');
  const [pairing, setPairing] = useState<{ name: string; link: string; expires: string } | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [leaving, setLeaving] = useState<TimeclockStaff | null>(null);
  const busy = add.isPending || update.isPending || clock.isPending || pair.isPending;

  const fail = (e: unknown) => toast(t(`errors.${errorKey(e)}`), 'danger');

  const submitAdd = async () => {
    if (!name.trim()) return;
    try {
      await add.mutateAsync(name);
      setName('');
    } catch (e) {
      fail(e);
    }
  };

  const startPair = async (s: TimeclockStaff) => {
    try {
      const r = await pair.mutateAsync(s.id);
      setPairing({ name: s.name, link: pairUrl(window.location.origin, r.code), expires: r.expires });
    } catch (e) {
      fail(e);
    }
  };

  const toggleClock = async (s: TimeclockStaff) => {
    try {
      const r = await clock.mutateAsync(s.id);
      toast(
        t(r.action === 'out' ? 'admin.timeclock.clockedOut' : 'admin.timeclock.clockedIn', {
          name: r.name,
          time: hhmm(r.at),
        }),
        'ready',
      );
    } catch (e) {
      fail(e);
    }
  };

  const setActive = async (id: string, active: boolean) => {
    try {
      await update.mutateAsync({ id, active });
    } catch (e) {
      fail(e);
    }
  };

  const copy = async (link: string) => {
    try {
      await navigator.clipboard.writeText(link);
      toast(t('admin.timeclock.copied'));
    } catch {
      toast(t('admin.timeclock.copyError'), 'danger');
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void submitAdd();
        }}
      >
        <div className="min-w-56 flex-1">
          <TextField
            label={t('admin.timeclock.personName')}
            value={name}
            maxLength={120}
            hint={t('admin.timeclock.staffHint')}
            onChange={setName}
          />
        </div>
        <Button type="submit" icon={<Plus aria-hidden size={18} />} loading={add.isPending} className="mb-6">
          {t('admin.timeclock.addPerson')}
        </Button>
      </form>

      {staff.length === 0 ? (
        <EmptyState title={t('admin.timeclock.noStaff')} />
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-card border border-border bg-surface">
          {staff.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="flex min-w-0 flex-col gap-1.5">
                <p className={clsx('font-medium', !s.active && 'text-muted')}>{s.name}</p>
                <div className="flex flex-wrap gap-1.5">
                  {!s.active ? <Badge>{t('admin.timeclock.passive')}</Badge> : null}
                  {s.active ? (
                    <Badge tone={s.paired ? 'ready' : 'warning'}>
                      {s.paired ? t('admin.timeclock.paired') : t('admin.timeclock.notPaired')}
                    </Badge>
                  ) : null}
                  {s.working ? (
                    <Badge tone="open">
                      {t('admin.timeclock.nowWorking')} · {t('admin.timeclock.since', { time: hhmm(s.since ?? '') })}
                    </Badge>
                  ) : null}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {s.active ? (
                  <>
                    <Button variant="secondary" disabled={busy} onClick={() => void toggleClock(s)}>
                      {s.working ? t('admin.timeclock.clockOut') : t('admin.timeclock.clockIn')}
                    </Button>
                    <Button variant="secondary" disabled={busy} onClick={() => void startPair(s)}>
                      {s.paired ? t('admin.timeclock.pairAgain') : t('admin.timeclock.pair')}
                    </Button>
                  </>
                ) : null}
                <Button variant="ghost" disabled={busy} onClick={() => setRenaming({ id: s.id, name: s.name })}>
                  {t('admin.timeclock.rename')}
                </Button>
                {s.active ? (
                  <Button variant="ghost" disabled={busy} onClick={() => setLeaving(s)}>
                    {t('admin.timeclock.deactivate')}
                  </Button>
                ) : (
                  <Button variant="ghost" disabled={busy} onClick={() => void setActive(s.id, true)}>
                    {t('admin.timeclock.activate')}
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-muted">{t('admin.timeclock.storageNote')}</p>

      {pairing ? (
        <Sheet open onClose={() => setPairing(null)} title={t('admin.timeclock.pairTitle', { name: pairing.name })} closeLabel={t('common.close')}>
          <div className="flex flex-col items-center gap-4 text-center">
            <p className="text-sm text-muted">{t('admin.timeclock.pairHint', { time: pairing.expires })}</p>
            <QrImage value={pairing.link} alt={t('admin.timeclock.pairQrAlt')} size={224} />
            <p className="break-all rounded-control border border-border bg-surface-2 px-3 py-2 font-mono text-xs">
              {pairing.link}
            </p>
            <Button variant="secondary" icon={<Copy aria-hidden size={18} />} onClick={() => void copy(pairing.link)}>
              {t('admin.timeclock.copyLink')}
            </Button>
          </div>
        </Sheet>
      ) : null}

      {renaming ? (
        <RenameSheet
          initial={renaming.name}
          busy={update.isPending}
          onClose={() => setRenaming(null)}
          onSave={async (next) => {
            try {
              await update.mutateAsync({ id: renaming.id, name: next });
              setRenaming(null);
            } catch (e) {
              fail(e);
            }
          }}
        />
      ) : null}

      {leaving ? (
        <Sheet
          open
          onClose={() => setLeaving(null)}
          title={t('admin.timeclock.deactivateTitle', { name: leaving.name })}
          closeLabel={t('common.close')}
          busy={update.isPending}
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="ghost" disabled={update.isPending} onClick={() => setLeaving(null)}>
                {t('common.cancel')}
              </Button>
              <Button
                variant="danger"
                loading={update.isPending}
                onClick={() => {
                  const id = leaving.id;
                  void setActive(id, false).then(() => setLeaving(null));
                }}
              >
                {t('admin.timeclock.deactivate')}
              </Button>
            </div>
          }
        >
          <p className="text-sm text-muted">{t('admin.timeclock.deactivateMsg')}</p>
        </Sheet>
      ) : null}
    </div>
  );
}

function RenameSheet({
  initial,
  busy,
  onClose,
  onSave,
}: {
  initial: string;
  busy: boolean;
  onClose: () => void;
  onSave: (name: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState(initial);
  return (
    <Sheet
      open
      onClose={onClose}
      title={t('admin.timeclock.rename')}
      closeLabel={t('common.close')}
      busy={busy}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" disabled={busy} onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button loading={busy} disabled={!value.trim()} onClick={() => void onSave(value)}>
            {t('common.save')}
          </Button>
        </div>
      }
    >
      <TextField label={t('admin.timeclock.personName')} value={value} maxLength={120} onChange={setValue} />
    </Sheet>
  );
}
