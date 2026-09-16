import type { Locale } from '@ramos/shared';
import { AlertTriangle, Ban } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCancelItem, type OrderItemView } from '../../data/orders';
import { useSettings } from '../../data/settings';
import { toast } from '../../lib/toast';
import { Banner } from '../../ui/Banner';
import { Button } from '../../ui/Button';
import { Chip } from '../../ui/Chip';
import { Sheet } from '../../ui/Sheet';
import { errorKey } from './submitError';

interface CancelReason {
  de: string;
  tr?: string;
  freeText?: boolean;
}

const isReason = (v: unknown): v is CancelReason =>
  typeof v === 'object' && v !== null && typeof (v as { de?: unknown }).de === 'string';

/**
 * Kalem iptali (spec §8.2: "Aktif kalemde 'İptal' (sebep seçtirir)"). Sebepler ayarlardan gelir
 * (`settings.cancel_reasons`), serbest metin isteyen seçenek (`freeText`) zorunlu alan açar.
 *
 * Karar: sunucuya **Almanca** sebep yazılır. Sebep `cancel_order_item` içinde doğrudan STORNO
 * fişinin gövdesine giriyor ve fiş her zaman Almancadır (global-constraints §5); TR etiketi
 * gönderilseydi mutfak Türkçe bir sebep okurdu. Serbest metin garsonun yazdığı gibi gider.
 */
export function CancelItemSheet({
  item,
  locale,
  open,
  onClose,
}: {
  item: Pick<OrderItemView, 'id' | 'product_name' | 'quantity'>;
  locale: Locale;
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const settings = useSettings();
  const cancelItem = useCancelItem();

  // `settings.cancel_reasons` şemada `jsonb` (yani `Json`); biçimi tek yerde doğrulanır ki
  // bozuk/eksik bir ayar satırı ekranı çökertmesin.
  const raw: unknown = settings?.cancel_reasons;
  const reasons: CancelReason[] = Array.isArray(raw) ? raw.filter(isReason) : [];

  const [picked, setPicked] = useState<number | null>(null);
  const [freeText, setFreeText] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  const chosen = picked === null ? undefined : reasons[picked];
  const needsText = chosen?.freeText === true;
  const reason = needsText ? freeText.trim() : (chosen?.de ?? '');

  const confirm = async () => {
    setProblem(null);
    try {
      await cancelItem.mutateAsync({ itemId: item.id, reason });
      toast(t('waiter.cancelItem.done'), 'info');
      onClose();
    } catch (e) {
      setProblem(t(`errors.${errorKey(e)}`));
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('waiter.cancelItem.title')}
      closeLabel={t('common.close')}
      footer={
        <div className="flex flex-col gap-3">
          {problem ? (
            <Banner tone="danger" icon={<AlertTriangle aria-hidden size={20} />}>
              {problem}
            </Banner>
          ) : null}
          <Button
            size="lg"
            fullWidth
            variant="danger"
            disabled={reason.length === 0}
            loading={cancelItem.isPending}
            icon={<Ban aria-hidden size={20} />}
            onClick={() => void confirm()}
          >
            {t('waiter.cancelItem.confirm')}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-base font-semibold">
          {item.quantity}× <span lang="de">{item.product_name}</span>
        </p>

        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
          <legend className="mb-1 text-base font-semibold">{t('waiter.cancelItem.reasonLabel')}</legend>
          <div className="flex flex-wrap gap-2">
            {reasons.map((r, i) => (
              <Chip key={r.de} selected={picked === i} onClick={() => setPicked(i)}>
                <span lang={locale === 'tr' && r.tr ? undefined : 'de'}>
                  {(locale === 'tr' && r.tr) || r.de}
                </span>
              </Chip>
            ))}
          </div>
        </fieldset>

        {needsText ? (
          <div className="flex flex-col gap-2">
            <label htmlFor="cancel-reason-text" className="text-base font-semibold">
              {t('waiter.cancelItem.otherLabel')}
            </label>
            <input
              id="cancel-reason-text"
              type="text"
              value={freeText}
              maxLength={200}
              autoComplete="off"
              placeholder={t('waiter.cancelItem.otherPlaceholder')}
              onChange={(e) => setFreeText(e.target.value)}
              className="w-full rounded-control border border-border bg-surface-2 px-3 py-3 text-base text-text placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime"
            />
          </div>
        ) : null}
      </div>
    </Sheet>
  );
}
