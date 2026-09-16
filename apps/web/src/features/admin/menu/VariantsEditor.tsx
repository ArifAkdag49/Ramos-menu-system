import { Plus, RotateCcw, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../../ui/Button';
import { IconButton } from '../../../ui/IconButton';
import { MoveButtons, TextField } from './fields';
import { reorder } from './menuAdminLogic';

export interface VariantDraft {
  /** Yeni satırların henüz `id`'si yok; liste anahtarı ve sıralama bunun üzerinden yürür. */
  key: string;
  id?: string;
  name_de: string;
  name_tr: string;
  priceInput: string;
  is_default: boolean;
  is_active: boolean;
}

const newVariantDraft = (): VariantDraft => ({
  key: crypto.randomUUID(),
  name_de: '',
  name_tr: '',
  priceInput: '',
  is_default: false,
  is_active: true,
});

/**
 * Varyant tablosu (Hähnchen / Kalb …). Satır **silinmez**, pasifleştirilir: varyant siparişlerde
 * `order_items.variant_id` ile bağlıdır, silmek geçmiş fişleri kopartırdı (BUILD-PROMPT §5).
 * Pasif satır listede kalır, üstü çizilir ve geri alınabilir.
 */
export function VariantsEditor({
  variants,
  errors,
  onChange,
}: {
  variants: VariantDraft[];
  errors: Record<string, string | undefined>;
  onChange: (next: VariantDraft[]) => void;
}) {
  const { t } = useTranslation();

  const patch = (key: string, fields: Partial<VariantDraft>) =>
    onChange(variants.map((v) => (v.key === key ? { ...v, ...fields } : v)));

  const setDefault = (key: string) =>
    onChange(variants.map((v) => ({ ...v, is_default: v.key === key })));

  const move = (fromKey: string, toKey: string) => {
    const order = reorder(variants.map((v) => ({ id: v.key })), fromKey, toKey);
    if (order.length === 0) return;
    const byKey = new Map(variants.map((v) => [v.key, v]));
    onChange(order.map((o) => byKey.get(o.id)).filter((v): v is VariantDraft => Boolean(v)));
  };

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-3">
        {variants.map((v, i) => (
          <li
            key={v.key}
            className={`flex flex-col gap-2 rounded-card border border-border p-3 ${v.is_active ? 'bg-surface-2' : 'bg-surface-2/40'}`}
          >
            <div className="grid gap-2 sm:grid-cols-[1fr_1fr_8rem]">
              <TextField
                label={t('admin.menu.nameDe')}
                value={v.name_de}
                disabled={!v.is_active}
                error={errors[`${v.key}:name`]}
                onChange={(name_de) => patch(v.key, { name_de })}
              />
              <TextField
                label={t('admin.menu.nameTr')}
                value={v.name_tr}
                disabled={!v.is_active}
                onChange={(name_tr) => patch(v.key, { name_tr })}
              />
              <TextField
                label={t('admin.menu.price')}
                value={v.priceInput}
                disabled={!v.is_active}
                placeholder="8,50"
                inputClassName="tabular"
                error={errors[`${v.key}:price`]}
                onChange={(priceInput) => patch(v.key, { priceInput })}
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="flex min-h-12 items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="variant-default"
                  checked={v.is_default}
                  disabled={!v.is_active}
                  onChange={() => setDefault(v.key)}
                  className="size-4 accent-[var(--lime)]"
                />
                <span>{t('admin.menu.variants.default')}</span>
              </label>

              <span className="flex items-center gap-1">
                <MoveButtons
                  disabledUp={i === 0}
                  disabledDown={i === variants.length - 1}
                  onUp={() => move(v.key, variants[i - 1]?.key ?? v.key)}
                  onDown={() => move(v.key, variants[i + 1]?.key ?? v.key)}
                />
                {v.is_active ? (
                  <IconButton
                    label={t('admin.menu.variants.deactivate')}
                    icon={<Trash2 aria-hidden size={18} />}
                    onClick={() => patch(v.key, { is_active: false, is_default: false })}
                  />
                ) : (
                  <IconButton
                    label={t('admin.menu.variants.reactivate')}
                    icon={<RotateCcw aria-hidden size={18} />}
                    onClick={() => patch(v.key, { is_active: true })}
                  />
                )}
              </span>
            </div>

            {!v.is_active ? (
              <p className="text-xs text-muted">{t('admin.menu.variants.inactiveNote')}</p>
            ) : null}
          </li>
        ))}
      </ul>

      <Button
        variant="secondary"
        icon={<Plus aria-hidden size={18} />}
        onClick={() => onChange([...variants, newVariantDraft()])}
      >
        {t('admin.menu.variants.add')}
      </Button>
    </div>
  );
}
