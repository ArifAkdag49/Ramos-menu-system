import { localTableName, type Locale } from '@ramos/shared';
import { AlertTriangle, ArrowRightLeft, LayoutGrid } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { useMoveSession } from '../../data/orders';
import { useTableOverview } from '../../data/tables';
import { toast } from '../../lib/toast';
import { Banner } from '../../ui/Banner';
import { Button } from '../../ui/Button';
import { EmptyState } from '../../ui/EmptyState';
import { Sheet } from '../../ui/Sheet';
import { errorKey } from './submitError';

/**
 * Masa taşıma (spec §8.2): yalnız **boş** masalar gösterilir. "Dolu masa seçilemez" kuralı burada
 * yeniden türetilmez; sunucu `target_table_busy` ile son sözü söyler (R42) — liste sadece garsonun
 * işini kolaylaştıran bir ön süzgeçtir, ekranda eskimiş veri varsa hata anahtarı gösterilir.
 */
export function MoveTableSheet({
  sessionId,
  currentTableId,
  locale,
  open,
  onClose,
}: {
  sessionId: string;
  currentTableId: string;
  locale: Locale;
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const move = useMoveSession();

  const free = useTableOverview().filter((r) => !r.session_id && r.table_id !== currentTableId);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const target = free.find((r) => r.table_id === targetId);
  const targetName = target ? localTableName(target.name, locale) : '';

  const confirm = async () => {
    if (!target) return;
    setProblem(null);
    try {
      await move.mutateAsync({ sessionId, targetTableId: target.table_id });
      toast(t('waiter.move.done', { table: targetName }), 'open');
      onClose();
      navigate(`/waiter/table/${target.table_id}`);
    } catch (e) {
      setProblem(t(`errors.${errorKey(e)}`));
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('waiter.move.title')}
      closeLabel={t('common.close')}
      footer={
        free.length === 0 ? undefined : (
          <div className="flex flex-col gap-3">
            {problem ? (
              <Banner tone="danger" icon={<AlertTriangle aria-hidden size={20} />}>
                {problem}
              </Banner>
            ) : null}
            <Button
              size="lg"
              fullWidth
              disabled={!target}
              loading={move.isPending}
              icon={<ArrowRightLeft aria-hidden size={20} />}
              onClick={() => void confirm()}
            >
              {t('waiter.move.confirm', { table: targetName })}
            </Button>
          </div>
        )
      }
    >
      {free.length === 0 ? (
        <EmptyState icon={<LayoutGrid aria-hidden size={40} />} title={t('waiter.move.empty')} />
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted">{t('waiter.move.hint')}</p>
          <div className="grid grid-cols-3 gap-2">
            {free.map((row) => {
              const selected = row.table_id === targetId;
              return (
                <button
                  key={row.table_id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setTargetId(row.table_id)}
                  className={
                    // M5: uzun masa adı ("Test-Tisch-2") hücreden taşıyordu; kırılmasına izin
                    // verilir ve hücre dikeyde büyür.
                    'min-h-14 break-words rounded-card border px-2 py-2 text-base font-semibold transition-colors ' +
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime focus-visible:ring-offset-2 focus-visible:ring-offset-bg ' +
                    (selected ? 'border-lime bg-lime/15 text-lime' : 'border-border bg-surface-2 text-text')
                  }
                >
                  {localTableName(row.name, locale)}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </Sheet>
  );
}
