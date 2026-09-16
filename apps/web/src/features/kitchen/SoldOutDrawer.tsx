import { useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { localName, type Locale } from '@ramos/shared';
import { useMenu } from '../../data/menu';
import { useSetSoldOut } from '../../data/orders';
import { Chip } from '../../ui/Chip';
import { Sheet } from '../../ui/Sheet';
import { soldOutCount } from './kitchenLogic';

/**
 * "Tükendi" paneli: ürünler kategoriye göre gruplanır, aramayla filtrelenir, her ürün tek
 * dokunuşla tükendi/satışta arasında geçer (`useSetSoldOut`, Görev 12). Mutfaktan (kirli
 * ellerle) hızlı erişim için büyük dokunma hedefleri.
 *
 * M4 kapısı O10 — panel tüm mutfak ekranını kapatıyordu ve 107 ürün tek liste hâlindeydi.
 * Liste kendi yüksekliği sınırlı kaydırma kutusunda durur (panel içeriğiyle büyüdüğü için
 * yükseklik böylece makul bir orana iner), üstünde "yalnız tükendiler" süzgeci ve sayaç var.
 */
export function SoldOutDrawer({ open, onClose, locale = 'tr' }: { open: boolean; onClose: () => void; locale?: Locale }) {
  const { t } = useTranslation();
  const searchId = useId();
  const [query, setQuery] = useState('');
  const [onlySoldOut, setOnlySoldOut] = useState(false);
  const { categories, products } = useMenu();
  const setSoldOut = useSetSoldOut();

  const count = soldOutCount(products);
  const q = query.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      products.filter(
        (p) =>
          (!onlySoldOut || p.is_sold_out) &&
          (!q || p.name.toLowerCase().includes(q) || (p.code ?? '').toLowerCase().includes(q)),
      ),
    [products, q, onlySoldOut],
  );

  const byCategory = [...categories]
    .sort((a, b) => a.sort - b.sort)
    .map((c) => ({ category: c, items: filtered.filter((p) => p.category_id === c.id) }))
    .filter((g) => g.items.length > 0);

  return (
    <Sheet open={open} onClose={onClose} title={t('kitchen.soldOut.title')} closeLabel={t('common.close')}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor={searchId} className="text-sm font-medium text-muted">
            {t('kitchen.soldOut.search')}
          </label>
          <input
            id={searchId}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="min-h-12 rounded-control border border-border bg-surface-2 px-4 text-base text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Chip selected={onlySoldOut} onClick={() => setOnlySoldOut((v) => !v)}>
            {t('kitchen.soldOut.onlySoldOut')}
          </Chip>
          <p className="text-base text-muted">{t('kitchen.soldOut.count', { count })}</p>
        </div>

        {/* Kaydırma kutusu paneli dizginler: `Sheet` yüksekliği içerikten gelir, 107 ürün onu
            ekranın tamamına çıkarıyordu ve aşçı siparişleri kaybediyordu. */}
        <div className="flex max-h-[40dvh] flex-col gap-4 overflow-y-auto" data-testid="sold-out-list">
          {byCategory.length === 0 ? (
            <p className="py-6 text-center text-base text-muted">{t('kitchen.soldOut.empty')}</p>
          ) : (
            byCategory.map(({ category, items }) => (
              <div key={category.id} className="flex flex-col gap-2">
                <h3 className="text-base font-semibold text-muted">{localName(category, locale)}</h3>
                <div className="flex flex-wrap gap-2">
                  {items.map((p) => (
                    <Chip
                      key={p.id}
                      selected={p.is_sold_out}
                      removed={p.is_sold_out}
                      onClick={() => setSoldOut.mutate({ productId: p.id, soldOut: !p.is_sold_out })}
                    >
                      {p.code ? `${p.code} ` : ''}
                      {p.name}
                    </Chip>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </Sheet>
  );
}
