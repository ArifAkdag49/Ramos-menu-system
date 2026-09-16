import {
  cartTotalCents,
  defaultSelection,
  formatEuro,
  localName,
  localTableName,
  needsSheet,
  type CartLine,
  type Locale,
  type MenuProduct,
} from '@ramos/shared';
import { clsx } from 'clsx';
import type { TFunction } from 'i18next';
import { ArrowLeft, Plus, Search, ShoppingCart } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import { useMenu, type MenuCategory } from '../../data/menu';
import { useTableOverview } from '../../data/tables';
import { toast } from '../../lib/toast';
import { Button } from '../../ui/Button';
import { Chip } from '../../ui/Chip';
import { IconButton } from '../../ui/IconButton';
import { ProductImage } from '../../ui/ProductImage';
import { ToastHost } from '../../ui/ToastHost';
import { CartDrawer } from './CartDrawer';
import { useCart } from './cartStore';
import { searchProducts } from './menuSearch';
import { ProductSheet } from './ProductSheet';

type LineInput = Omit<CartLine, 'key' | 'productId'>;
interface SheetState {
  product: MenuProduct;
  key?: string;
  initial?: LineInput;
}

/**
 * Sipariş girişi: arama + kategori çipleri + ürün listesi + ürün paneli + sepet önizlemesi.
 * `/waiter` iskeletinin (WaiterLayout) DIŞINDadır — kendi üst çubuğu ve gezinmesi vardır
 * (BUILD-PROMPT §10.4: en fazla 2 seviye derinlik, ayrıntı bottom sheet ile açılır).
 * Sepet, genel not ve mutfağa gönderme `CartDrawer`/`SendConfirm`'dedir (Görev 15); bu ekran
 * yalnız ürün seçimini yönetir ve sepeti açar.
 */
export function OrderPage() {
  const { tableId } = useParams();
  const id = tableId ?? '';
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const locale: Locale = i18n.language === 'de' ? 'de' : 'tr';

  const { categories, products, byId } = useMenu();
  const rows = useTableOverview();
  const table = rows.find((r) => r.table_id === id);

  const add = useCart((s) => s.add);
  const update = useCart((s) => s.update);
  const lines = useCart((s) => s.carts[id]) ?? [];

  const [query, setQuery] = useState('');
  const [sheet, setSheet] = useState<SheetState | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);

  const filtered = useMemo(() => searchProducts(products, query), [products, query]);
  const searching = query.trim().length > 0;

  const byCategory = useMemo(() => {
    const map = new Map<string, MenuProduct[]>();
    for (const p of filtered) map.set(p.category_id, [...(map.get(p.category_id) ?? []), p]);
    return map;
  }, [filtered]);

  const sectionRefs = useRef(new Map<string, HTMLElement>());

  useEffect(() => {
    if (searching || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        const catId = visible?.target.getAttribute('data-category-id');
        if (catId) setActiveCategoryId(catId);
      },
      { rootMargin: '-160px 0px -70% 0px' },
    );
    for (const el of sectionRefs.current.values()) observer.observe(el);
    return () => observer.disconnect();
  }, [searching, categories, filtered]);

  const scrollToCategory = (categoryId: string) => {
    setActiveCategoryId(categoryId);
    sectionRefs.current.get(categoryId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const quickAdd = (p: MenuProduct) => {
    add(id, { productId: p.id, ...defaultSelection(p), quantity: 1, note: '' });
    navigator.vibrate?.(15);
    toast(t('waiter.order.added', { name: p.name }));
  };

  const openSheetForAdd = (p: MenuProduct) => setSheet({ product: p });

  const openSheetForEdit = (line: CartLine) => {
    const product = byId.get(line.productId);
    if (!product) return;
    setSheet({
      product,
      key: line.key,
      initial: { variantId: line.variantId, optionIds: line.optionIds, removedIngredientIds: line.removedIngredientIds, quantity: line.quantity, note: line.note },
    });
  };

  const handleSheetSubmit = (line: LineInput) => {
    if (!sheet) return;
    if (sheet.key) update(id, sheet.key, { productId: sheet.product.id, ...line });
    else add(id, { productId: sheet.product.id, ...line });
    toast(t('waiter.order.added', { name: sheet.product.name }));
    setSheet(null);
  };

  const cartCount = lines.reduce((n, l) => n + l.quantity, 0);
  const cartTotal = cartTotalCents(lines, byId);

  return (
    <div className="flex min-h-dvh flex-col">
      <div className="sticky top-0 z-10 bg-surface">
        <header className="flex h-[var(--header-h)] items-center gap-3 border-b border-border px-4">
          <IconButton label={t('common.back')} icon={<ArrowLeft aria-hidden size={22} />} onClick={() => navigate(`/waiter/table/${id}`)} />
          <h1 className="min-w-0 flex-1 truncate text-xl font-semibold">{table ? localTableName(table.name, locale) : t('waiter.order.title')}</h1>
          <button
            type="button"
            onClick={() => setCartOpen(true)}
            className={clsx(
              'relative inline-flex min-h-12 items-center gap-2 rounded-xl border border-border bg-surface-2 px-4 text-base font-semibold',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
            )}
          >
            <ShoppingCart aria-hidden size={20} />
            <span className="tabular">{formatEuro(cartTotal)}</span>
            <span className="sr-only">{t('waiter.order.cartTitle')}</span>
            {cartCount > 0 ? (
              <span
                aria-hidden="true"
                className="absolute -right-1.5 -top-1.5 inline-flex min-w-5 items-center justify-center rounded-full bg-gold px-1 text-[10px] font-bold text-bg"
              >
                {cartCount}
              </span>
            ) : null}
          </button>
        </header>

        <div className="px-4 py-3">
          <label htmlFor="order-search" className="mb-1 block text-sm font-medium text-muted">
            {t('common.search')}
          </label>
          <div className="relative">
            <Search aria-hidden size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              id="order-search"
              type="text"
              inputMode="search"
              autoComplete="off"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('waiter.order.searchPlaceholder')}
              className="w-full rounded-control border border-border bg-surface-2 py-3 pl-10 pr-3 text-base text-text placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime"
            />
          </div>
        </div>

        {!searching ? (
          <div className="flex gap-2 overflow-x-auto px-4 pb-3" aria-label={t('waiter.order.categoriesLabel')}>
            {categories.map((c) => (
              <Chip key={c.id} selected={activeCategoryId === c.id} onClick={() => scrollToCategory(c.id)}>
                {localName(c, locale)}
              </Chip>
            ))}
          </div>
        ) : null}
      </div>

      <div className="flex-1 px-4 pb-6">
        {searching
          ? filtered.map((p) => (
              <ProductRow key={p.id} product={p} t={t} onAdd={quickAdd} onOpenSheet={openSheetForAdd} />
            ))
          : categories.map((c) => (
              <CategorySection
                key={c.id}
                category={c}
                products={byCategory.get(c.id) ?? []}
                locale={locale}
                t={t}
                onAdd={quickAdd}
                onOpenSheet={openSheetForAdd}
                registerRef={(el) => {
                  if (el) sectionRefs.current.set(c.id, el);
                }}
              />
            ))}
      </div>

      {sheet ? (
        <ProductSheet product={sheet.product} open onClose={() => setSheet(null)} onSubmit={handleSheetSubmit} initial={sheet.initial} />
      ) : null}

      <CartDrawer
        tableId={id}
        tableName={table ? localTableName(table.name, locale) : t('waiter.table.title')}
        locale={locale}
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        onEditLine={(line) => {
          setCartOpen(false);
          openSheetForEdit(line);
        }}
      />

      <ToastHost />
    </div>
  );
}

function CategorySection({
  category,
  products,
  locale,
  t,
  onAdd,
  onOpenSheet,
  registerRef,
}: {
  category: MenuCategory;
  products: MenuProduct[];
  locale: Locale;
  t: TFunction<'translation'>;
  onAdd: (p: MenuProduct) => void;
  onOpenSheet: (p: MenuProduct) => void;
  registerRef: (el: HTMLElement | null) => void;
}) {
  if (products.length === 0) return null;
  return (
    <section ref={registerRef} data-category-id={category.id} className="scroll-mt-40 py-3">
      <h2 className="mb-1 text-lg font-semibold">{localName(category, locale)}</h2>
      <ul>
        {products.map((p) => (
          <ProductRow key={p.id} product={p} t={t} onAdd={onAdd} onOpenSheet={onOpenSheet} />
        ))}
      </ul>
    </section>
  );
}

function ProductRow({
  product,
  t,
  onAdd,
  onOpenSheet,
}: {
  product: MenuProduct;
  t: TFunction<'translation'>;
  onAdd: (p: MenuProduct) => void;
  onOpenSheet: (p: MenuProduct) => void;
}) {
  const soldOut = product.is_sold_out;
  const cheapestVariant = product.variants.length ? Math.min(...product.variants.map((v) => v.price_cents)) : null;
  const priceLabel = soldOut
    ? t('waiter.order.soldOut')
    : cheapestVariant !== null
      ? t('waiter.order.priceFrom', { price: formatEuro(cheapestVariant) })
      : formatEuro(product.base_price_cents ?? 0);

  return (
    <li className={clsx('flex items-center gap-3 border-b border-border py-3', soldOut && 'opacity-50')}>
      <ProductImage path={product.image_path} size="thumb" code={product.code} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          {product.code ? <span className="tabular text-sm text-muted">{product.code}</span> : null}
          <span className="truncate text-product font-semibold">{product.name}</span>
        </div>
        <span className="tabular text-sm text-muted">{priceLabel}</span>
      </div>
      {soldOut ? null : (
        <Button
          size="md"
          variant="secondary"
          icon={<Plus aria-hidden size={18} />}
          onClick={() => (needsSheet(product) ? onOpenSheet(product) : onAdd(product))}
        >
          {needsSheet(product) ? t('common.select') : t('common.add')}
        </Button>
      )}
    </li>
  );
}
