import { cartTotalCents, formatEuro, unitPriceCents, type CartLine, type Locale } from '@ramos/shared';
import { Copy, Pencil, Send, ShoppingCart, Trash2, WifiOff } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMenu } from '../../data/menu';
import { useOnline } from '../../lib/online';
import { Banner } from '../../ui/Banner';
import { Button } from '../../ui/Button';
import { EmptyState } from '../../ui/EmptyState';
import { IconButton } from '../../ui/IconButton';
import { Sheet } from '../../ui/Sheet';
import { Stepper } from '../../ui/Stepper';
import { cartLineSummary } from './cartLineSummary';
import { useCart } from './cartStore';
import { MissingProductLine } from './MissingProductLine';
import { SendConfirm } from './SendConfirm';

/**
 * Sepet paneli: satırlar, satır eylemleri (adet · düzenle · çoğalt · sil), siparişe genel not,
 * toplam ve tek ana eylem olan "Mutfağa gönder" (BUILD-PROMPT §10.1).
 *
 * Çevrimdışıyken gönder pasiftir ve şerit ne yapılacağını söyler; sepet `localStorage`'da masa
 * bazında durduğu için (Görev 14 `cartStore`) hiçbir şey kaybolmaz (spec §13).
 *
 * Onay paneli aynı anda **açılmaz**, sepetin yerini alır: iki `Sheet` üst üste açılırsa odak
 * kapanları çakışır ve klavye kullanıcısı alttaki panelde sıkışır.
 */
export function CartDrawer({
  tableId,
  tableName,
  locale,
  open,
  onClose,
  onEditLine,
}: {
  tableId: string;
  tableName: string;
  locale: Locale;
  open: boolean;
  onClose: () => void;
  onEditLine: (line: CartLine) => void;
}) {
  const { t } = useTranslation();
  const { byId } = useMenu();
  const online = useOnline();

  const lines = useCart((s) => s.carts[tableId]) ?? [];
  const note = useCart((s) => s.notes[tableId]) ?? '';
  const setNote = useCart((s) => s.setNote);
  const setQty = useCart((s) => s.setQty);
  const remove = useCart((s) => s.remove);
  const duplicate = useCart((s) => s.duplicate);

  const [confirming, setConfirming] = useState(false);

  if (!open) return null;

  if (confirming && lines.length > 0) {
    return (
      <SendConfirm
        tableId={tableId}
        tableName={tableName}
        lines={lines}
        byId={byId}
        locale={locale}
        onBack={() => setConfirming(false)}
        onEditLine={(line) => {
          setConfirming(false);
          onEditLine(line);
        }}
      />
    );
  }

  const total = cartTotalCents(lines, byId);

  return (
    <Sheet
      open
      onClose={onClose}
      title={t('waiter.order.cartTitle')}
      closeLabel={t('common.close')}
      footer={
        lines.length === 0 ? undefined : (
          <div className="flex flex-col gap-3">
            {!online ? (
              <Banner tone="danger" icon={<WifiOff aria-hidden size={20} />}>
                {t('waiter.cart.offline')}
              </Banner>
            ) : null}
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-base font-semibold">{t('waiter.cart.total')}</span>
              <span className="tabular text-2xl font-bold">{formatEuro(total)}</span>
            </div>
            <Button
              size="lg"
              fullWidth
              disabled={!online}
              icon={<Send aria-hidden size={20} />}
              onClick={() => setConfirming(true)}
            >
              {t('waiter.cart.send')}
            </Button>
          </div>
        )
      }
    >
      {lines.length === 0 ? (
        <EmptyState icon={<ShoppingCart aria-hidden size={40} />} title={t('waiter.order.cartEmpty')} />
      ) : (
        // Alttaki yapışkan altlık (toplam + gönder) içeriğin sonunu örter; not alanı sonuna kadar
        // kaydırılabilsin diye altta altlık yüksekliği kadar boşluk bırakılır.
        <div className="flex flex-col gap-4 pb-36">
          <ul className="flex flex-col gap-3">
            {lines.map((line) => {
              const product = byId.get(line.productId);
              // R75: menüden düşmüş ürün sessizce gizlenmez — görünür ve silinebilir olur.
              if (!product)
                return (
                  <MissingProductLine
                    key={line.key}
                    productId={line.productId}
                    onRemove={() => remove(tableId, line.key)}
                  />
                );
              const summary = cartLineSummary(product, line, locale, t('waiter.order.removedPrefix'));
              return (
                <li key={line.key} className="flex flex-col gap-3 rounded-card border border-border bg-surface p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-base font-semibold">
                        {line.quantity}× <span lang="de">{product.name}</span>
                      </p>
                      {summary ? <p className="text-sm text-muted">{summary}</p> : null}
                    </div>
                    <span className="tabular shrink-0 text-base font-semibold">
                      {formatEuro(unitPriceCents(product, line) * line.quantity)}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Stepper
                      value={line.quantity}
                      onChange={(q) => setQty(tableId, line.key, q)}
                      decreaseLabel={t('waiter.order.quantity.decrease')}
                      increaseLabel={t('waiter.order.quantity.increase')}
                      valueLabel={t('waiter.order.quantity.value', { count: line.quantity })}
                    />
                    <Button variant="ghost" icon={<Pencil aria-hidden size={18} />} onClick={() => onEditLine(line)}>
                      {t('common.edit')}
                    </Button>
                    <Button
                      variant="ghost"
                      icon={<Copy aria-hidden size={18} />}
                      onClick={() => duplicate(tableId, line.key)}
                    >
                      {t('common.duplicate')}
                    </Button>
                    <IconButton
                      label={t('common.remove')}
                      icon={<Trash2 aria-hidden size={18} />}
                      onClick={() => remove(tableId, line.key)}
                    />
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="flex flex-col gap-2">
            <label htmlFor="cart-note" className="text-base font-semibold">
              {t('waiter.cart.noteLabel')}
            </label>
            <textarea
              id="cart-note"
              value={note}
              maxLength={500}
              rows={2}
              placeholder={t('waiter.cart.notePlaceholder')}
              onChange={(e) => setNote(tableId, e.target.value)}
              className="w-full resize-none rounded-control border border-border bg-surface-2 px-3 py-2 text-base text-text placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime"
            />
          </div>
        </div>
      )}
    </Sheet>
  );
}
