import { AlertTriangle } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from '../../../lib/toast';
import { Banner } from '../../../ui/Banner';
import { Button } from '../../../ui/Button';
import { Sheet } from '../../../ui/Sheet';
import { errorKey } from '../../waiter/submitError';
import { TextField } from '../menu/fields';
import { useSaveShift, useShiftEdits } from './timeclockApi';
import { fromInput, hhmm, toInput, type Shift } from './timeclockLogic';

export type ShiftTarget =
  | { kind: 'edit'; shift: Shift; name: string }
  | { kind: 'add'; staffId: string; name: string; date: string };

/** Mesai düzeltme / elle ekleme. Sebep zorunlu; düzeltilmiş mesainin geçmişi altta görünür. */
export function ShiftSheet({ target, onClose }: { target: ShiftTarget; onClose: () => void }) {
  const { t } = useTranslation();
  const shift = target.kind === 'edit' ? target.shift : null;
  const [start, setStart] = useState(shift ? toInput(shift.start) : `${target.kind === 'add' ? target.date : ''}T09:00`);
  const [end, setEnd] = useState(shift ? toInput(shift.end) : '');
  const [reason, setReason] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const save = useSaveShift();
  const edits = useShiftEdits(shift?.edited ? shift.id : null);

  const submit = async () => {
    setProblem(null);
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(start)) {
      setProblem(t('admin.timeclock.errTime'));
      return;
    }
    try {
      await save.mutateAsync({
        shiftId: shift?.id,
        staffId: target.kind === 'add' ? target.staffId : undefined,
        start: fromInput(start),
        end: end ? fromInput(end) : null,
        reason,
      });
      toast(t('admin.timeclock.saved'), 'ready');
      onClose();
    } catch (e) {
      setProblem(t(`errors.${errorKey(e)}`));
    }
  };

  const span = (from: string, to: string | null) =>
    `${from.slice(5).replace('-', '.')} – ${to ? hhmm(to) : t('admin.timeclock.noEnd')}`;
  const title =
    target.kind === 'edit'
      ? t('admin.timeclock.shiftTitle', { name: target.name })
      : t('admin.timeclock.shiftAddTitle', { name: target.name });

  return (
    <Sheet
      open
      onClose={onClose}
      title={title}
      closeLabel={t('common.close')}
      busy={save.isPending}
      footer={
        <div className="flex flex-col gap-3">
          {problem ? (
            <Banner tone="danger" icon={<AlertTriangle aria-hidden size={20} />}>
              {problem}
            </Banner>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" disabled={save.isPending} onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button loading={save.isPending} onClick={() => void submit()}>
              {t('common.save')}
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <TextField type="datetime-local" label={t('admin.timeclock.fieldStart')} value={start} onChange={setStart} />
        <TextField
          type="datetime-local"
          label={t('admin.timeclock.fieldEnd')}
          value={end}
          onChange={setEnd}
          hint={t('admin.timeclock.fieldEndHint')}
        />
        <TextField
          label={t('admin.timeclock.fieldReason')}
          value={reason}
          maxLength={200}
          placeholder={t('admin.timeclock.fieldReasonPh')}
          onChange={setReason}
        />

        {edits.data && edits.data.length > 0 ? (
          <section className="flex flex-col gap-2 border-t border-border pt-3">
            <h3 className="text-xs font-semibold text-muted">{t('admin.timeclock.history')}</h3>
            <ul className="flex flex-col gap-3 text-sm">
              {edits.data.map((e) => (
                <li key={`${e.at}-${e.new_start}`} className="flex flex-col gap-0.5">
                  <span className="tabular text-xs text-muted">
                    {e.at}
                    {e.by ? ` · ${e.by}` : ''}
                  </span>
                  <span className="tabular">
                    {e.old_start
                      ? t('admin.timeclock.historyLine', {
                          from: span(e.old_start, e.old_end),
                          to: span(e.new_start, e.new_end),
                        })
                      : `${t('admin.timeclock.added')}: ${span(e.new_start, e.new_end)}`}
                  </span>
                  <span className="text-xs text-muted">{e.reason}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </Sheet>
  );
}
