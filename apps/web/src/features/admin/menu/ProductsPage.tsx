import { formatEuro } from '@ramos/shared';
import { useQueryClient } from '@tanstack/react-query';
import { ImageOff, Plus, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAdminMenu, type AdminProduct } from '../../../data/adminMenu';
import { qk } from '../../../data/keys';
import { useSettings } from '../../../data/settings';
import { Badge } from '../../../ui/Badge';
import { Button } from '../../../ui/Button';
import { Chip } from '../../../ui/Chip';
import { ProductImage } from '../../../ui/ProductImage';
import { Spinner } from '../../../ui/Spinner';
import { toast } from '../../../lib/toast';
import { searchProducts } from '../../waiter/menuSearch';
import { FIELD } from './fields';
import { readAllergenLegend } from './menuAdminLogic';
import { ProductEditor } from './ProductEditor';

const ALL = 'all';

/** Ürünün ekranda görünen fiyatı: varyantlıysa aralık, değilse taban fiyat. */
function priceLabel(p: AdminProduct): string {
  const prices = p.product_variants.filter((v) => v.is_active).map((v) => v.price_cents);
  if (prices.length > 0) {
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    return min === max ? formatEuro(min) : `${formatEuro(min)} – ${formatEuro(max)}`;
  }
  return p.base_price_cents != null ? formatEuro(p.base_price_cents) : '—';
}

/**
 * Menü > Ürünler. Kategori süzgeci, arama (garson ekranındaki `searchProducts` — aynı arama iki
 * yerde iki türlü davranmasın) ve **"Görseli yok (N)"** çipi. Satıra dokununca ürün editörü açılır.
 */
export function ProductsPage() {
  const { t, i18n } = useTranslation();
  const isTr = i18n.language !== 'de';
  const queryClient = useQueryClient();
  const { categories, products, ingredients, groups, isPending } = useAdminMenu();
  const settings = useSettings();

  const [query, setQuery] = useState('');
  const [categoryId, setCategoryId] = useState<string>(ALL);
  const [onlyMissingImage, setOnlyMissingImage] = useState(false);
  const [editing, setEditing] = useState<{ product: AdminProduct | null } | null>(null);

  const allergenLegend = useMemo(() => readAllergenLegend(settings?.allergen_legend), [settings]);
  const missingImageCount = products.filter((p) => !p.image_path).length;

  const rows = useMemo(() => {
    let list = products;
    if (categoryId !== ALL) list = list.filter((p) => p.category_id === categoryId);
    if (onlyMissingImage) list = list.filter((p) => !p.image_path);
    list = searchProducts(list, query);
    return query ? list : [...list].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name, 'de'));
  }, [products, categoryId, onlyMissingImage, query]);

  const categoryName = (id: string) => {
    const c = categories.find((x) => x.id === id);
    return c ? (isTr && c.name_tr ? c.name_tr : c.name_de) : '—';
  };

  const afterSave = (message: string) => {
    setEditing(null);
    void queryClient.invalidateQueries({ queryKey: qk.menu });
    toast(message);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex min-w-0 flex-col gap-1.5">
            <label htmlFor="product-search" className="text-xs font-medium text-muted">
              {t('common.search')}
            </label>
            <div className="relative">
              <Search aria-hidden size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input
                id="product-search"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('admin.menu.products.searchPlaceholder')}
                className={`${FIELD} pl-10 sm:w-64`}
              />
            </div>
          </div>

          <div className="flex min-w-0 flex-col gap-1.5">
            <label htmlFor="product-category" className="text-xs font-medium text-muted">
              {t('admin.menu.category')}
            </label>
            <select
              id="product-category"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className={`${FIELD} py-2 sm:w-52`}
            >
              <option value={ALL}>{t('admin.menu.products.allCategories')}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {isTr && c.name_tr ? c.name_tr : c.name_de}
                </option>
              ))}
            </select>
          </div>

          <Chip
            selected={onlyMissingImage}
            icon={<ImageOff aria-hidden size={16} />}
            onClick={() => setOnlyMissingImage((v) => !v)}
            className="min-h-12 text-sm"
          >
            {t('admin.menu.products.noImageFilter', { count: missingImageCount })}
          </Chip>
        </div>

        <Button icon={<Plus aria-hidden size={20} />} onClick={() => setEditing({ product: null })}>
          {t('admin.menu.products.new')}
        </Button>
      </div>

      <section className="rounded-card border border-border bg-surface">
        {isPending ? (
          <p className="flex items-center justify-center gap-2 px-4 py-10 text-muted">
            <Spinner label={t('common.loading')} />
            <span>{t('common.loading')}</span>
          </p>
        ) : rows.length === 0 ? (
          <p className="px-4 py-10 text-center text-muted">{t('admin.menu.products.empty')}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {rows.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => setEditing({ product: p })}
                  className="flex w-full min-h-16 cursor-pointer items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-lime"
                >
                  <ProductImage path={p.image_path} size="thumb" code={p.code} />
                  <span className="tabular w-12 shrink-0 text-sm font-semibold text-muted">{p.code ?? '—'}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{p.name}</span>
                    <span className="block truncate text-xs text-muted">{categoryName(p.category_id)}</span>
                  </span>
                  <span className="tabular hidden shrink-0 text-sm font-semibold sm:block">{priceLabel(p)}</span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    {p.is_sold_out ? <Badge tone="danger">{t('admin.menu.isSoldOut')}</Badge> : null}
                    {!p.is_active ? <Badge tone="empty">{t('admin.menu.inactive')}</Badge> : null}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {editing ? (
        <ProductEditor
          key={editing.product?.id ?? 'new'}
          open
          product={editing.product}
          categories={categories}
          ingredients={ingredients}
          groups={groups}
          allergenLegend={allergenLegend}
          onClose={() => setEditing(null)}
          onSaved={afterSave}
        />
      ) : null}
    </div>
  );
}
