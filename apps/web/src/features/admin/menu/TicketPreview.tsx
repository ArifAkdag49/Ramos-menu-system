import { clsx } from 'clsx';
import {
  linesToText,
  renderTicket,
  type Line,
  type MenuProduct,
  type Selection,
  type TicketPayload,
} from '@ramos/shared';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Chip } from '../../../ui/Chip';
import { Stepper } from '../../../ui/Stepper';
import { previewPayloadFor } from './menuAdminLogic';

const COLUMNS = 48;

/**
 * Fiş önizlemesi: ürünü kaydetmeden önce **mutfağın göreceği kâğıdı** gösterir. Seçim kutuları
 * garson panelindeki mantığın sadeleştirilmiş hâlidir (tek ürün, fiyat yok) çünkü burada amaç
 * satış değil, biçimi görmek: "Soße: Knoblauch" mu yazacak, "+ Knoblauch" mı?
 *
 * Kutu 48 kolonluk tek aralıklı yazıyla çizilir (BUILD-PROMPT §5); ters renkli satırlar (OHNE,
 * NACHBESTELLUNG) yazıcıda olduğu gibi zemin/yazı renkleri değişmiş olarak görünür.
 */
export function TicketPreview({ product, isBeverage }: { product: MenuProduct; isBeverage: boolean }) {
  const { t } = useTranslation();
  const [qty, setQty] = useState(1);
  const [sel, setSel] = useState<Selection>(() => initialSelection(product));

  const lines = useMemo(
    () => renderTicket(previewPayloadFor(product, sel, qty, isBeverage), { columns: COLUMNS }),
    [product, sel, qty, isBeverage],
  );

  const toggleOption = (id: string) =>
    setSel((s) => ({
      ...s,
      optionIds: s.optionIds.includes(id) ? s.optionIds.filter((x) => x !== id) : [...s.optionIds, id],
    }));

  const toggleIngredient = (id: string) =>
    setSel((s) => ({
      ...s,
      removedIngredientIds: s.removedIngredientIds.includes(id)
        ? s.removedIngredientIds.filter((x) => x !== id)
        : [...s.removedIngredientIds, id],
    }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Stepper
          value={qty}
          onChange={setQty}
          decreaseLabel={t('waiter.order.quantity.decrease')}
          increaseLabel={t('waiter.order.quantity.increase')}
          valueLabel={t('waiter.order.quantity.value', { count: qty })}
        />
        <p className="text-xs text-muted">{t('admin.menu.preview.hint')}</p>
      </div>

      {product.variants.length > 0 ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="pb-1 text-xs font-medium text-muted">{t('admin.menu.preview.variant')}</legend>
          <div className="flex flex-wrap gap-2">
            {product.variants.map((v) => (
              <Chip
                key={v.id}
                selected={sel.variantId === v.id}
                onClick={() => setSel((s) => ({ ...s, variantId: v.id }))}
              >
                {v.name_de}
              </Chip>
            ))}
          </div>
        </fieldset>
      ) : null}

      {product.ingredients.length > 0 ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="pb-1 text-xs font-medium text-muted">{t('admin.menu.preview.without')}</legend>
          <div className="flex flex-wrap gap-2">
            {product.ingredients.map((ing) => (
              <Chip
                key={ing.id}
                removed={sel.removedIngredientIds.includes(ing.id)}
                selected={!sel.removedIngredientIds.includes(ing.id)}
                onClick={() => toggleIngredient(ing.id)}
              >
                {ing.name_de}
              </Chip>
            ))}
          </div>
        </fieldset>
      ) : null}

      {product.groups.map((g) => (
        <fieldset key={g.id} className="flex flex-col gap-2">
          <legend className="pb-1 text-xs font-medium text-muted">{g.name_de}</legend>
          <div className="flex flex-wrap gap-2">
            {g.options.map((o) => (
              <Chip key={o.id} selected={sel.optionIds.includes(o.id)} onClick={() => toggleOption(o.id)}>
                {o.name_de}
              </Chip>
            ))}
          </div>
        </fieldset>
      ))}

      <TicketPaper lines={lines} />
    </div>
  );
}

/** Açılışta varsayılan varyant ve varsayılan seçenekler işaretli gelir — garsonun gördüğü hâl. */
function initialSelection(product: MenuProduct): Selection {
  return {
    variantId: (product.variants.find((v) => v.is_default) ?? product.variants[0])?.id ?? null,
    optionIds: product.groups.flatMap((g) => g.options.filter((o) => o.is_default).map((o) => o.id)),
    removedIngredientIds: [],
  };
}

/**
 * Görev 23: sipariş çekmecesi gerçek bir fiş işinin yükünü aynı kâğıtla gösterir — ürün editöründeki
 * önizleme ile geçmiş siparişin fişi arasında görsel fark olmasın diye çizim tek yerdedir.
 */
export function TicketPayloadPaper({ payload }: { payload: TicketPayload }) {
  const lines = useMemo(() => renderTicket(payload, { columns: COLUMNS }), [payload]);
  return <TicketPaper lines={lines} />;
}

/**
 * Fiş her zaman Almanca (BUILD-PROMPT §5). TR arayüzde de bu kutunun içeriği Almanca kalır,
 * bu yüzden kapsayıcıya `lang="de"` verilir: ekran okuyucu doğru sesle okur ve `text-transform`
 * uygulayan bir stil "i" harfini Türkçe kuralıyla "İ" yapamaz (§6).
 */
function TicketPaper({ lines }: { lines: Line[] }) {
  return (
    <div
      lang="de"
      data-testid="ticket-preview"
      className="overflow-x-auto rounded-card border border-border bg-[#F5F5F0] p-4 text-[#0A0A0A]"
    >
      <pre className="w-max font-mono text-xs leading-[1.45]">
        {lines.map((line, i) => {
          const text = linesToText([line], COLUMNS);
          const isText = line.kind === 'text';
          return (
            <span
              key={i}
              className={clsx(
                'block',
                isText && line.bold && 'font-bold',
                isText && line.height === 2 && 'text-sm',
                // Çift genişlik: tek aralıklı yazıda harf başına 1ch ek aralık = kâğıttaki 2 kolon.
                isText && line.width === 2 && 'tracking-[1ch]',
                isText && line.invert && 'bg-[#0A0A0A] text-[#F5F5F0]',
              )}
            >
              {text === '' ? ' ' : text}
            </span>
          );
        })}
      </pre>
    </div>
  );
}
