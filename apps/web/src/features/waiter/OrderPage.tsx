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
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { Chip } from '../../ui/Chip';
import { IconButton } from '../../ui/IconButton';
import { ProductImage } from '../../ui/ProductImage';
import { ToastHost } from '../../ui/ToastHost';
import { CartDrawer } from './CartDrawer';
import { useCart } from './cartStore';
import { searchProducts } from './menuSearch';
import { ProductSheet } from './ProductSheet';
import { menuBody } from './waiterLogic';

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

  const { categories, products, byId, isLoading } = useMenu();
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
      { rootMargin: '-170px 0px -70% 0px' },
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
      initial: {
        variantId: line.variantId,
        optionIds: line.optionIds,
        removedIngredientIds: line.removedIngredientIds,
        extraCharges: line.extraCharges ?? [],
        quantity: line.quantity,
        note: line.note,
      },
    });
  };

  const handleSheetSubmit = (line: LineInput) => {
    if (!sheet) return;
    if (sheet.key) update(id, sheet.key, { productId: sheet.product.id, ...line });
    else add(id, { productId: sheet.product.id, ...line });
    toast(t('waiter.order.added', { name: sheet.product.name }));
    setSheet(null);
  };

  // R76 ile aynı kural: iskelet yalnız ilk yüklemede, arka plan tazelemesinde menü ekranda kalır.
  const body = menuBody(products.length > 0, isLoading);

  const cartCount = lines.reduce((n, l) => n + l.quantity, 0);
  const cartTotal = cartTotalCents(lines, byId);

  return (
    // `overflow-x-clip`: telefonda sayfa asla yatay kaymaz. `hidden` değil `clip` — `hidden` bir kaydırma
    // kabı kurup üstteki `sticky` başlığı bozardı.
    <div className="flex min-h-dvh flex-col overflow-x-clip">
      <div className="sticky top-0 z-10 bg-surface">
        {/* Sipariş girişinde üst blok kompakt: telefonda ürün listesine daha çok yer kalsın. */}
        <header className="flex h-14 items-center gap-2 border-b border-border px-2">
          <IconButton
            label={t('common.back')}
            icon={<ArrowLeft aria-hidden size={22} />}
            onClick={() => navigate(`/waiter/table/${id}`)}
          />
          <h1 className="min-w-0 flex-1 truncate text-xl font-semibold">
            {table ? localTableName(table.name, locale) : t('waiter.order.title')}
          </h1>
          <button
            type="button"
            onClick={() => setCartOpen(true)}
            className={clsx(
              'relative mr-2 inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-surface-2 px-3 text-base font-semibold',
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

        {/* Etiket görünmez ama erişilebilir kalır; yer tutucu ve büyüteç alanın amacını zaten söylüyor. */}
        <div className="px-4 py-2">
          <label htmlFor="order-search" className="sr-only">
            {t('common.search')}
          </label>
          <div className="relative">
            <Search
              aria-hidden
              size={18}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
            />
            <input
              id="order-search"
              type="text"
              inputMode="search"
              autoComplete="off"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('waiter.order.searchPlaceholder')}
              className="w-full rounded-control border border-border bg-surface-2 py-2.5 pl-10 pr-3 text-base text-text placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime"
            />
          </div>
        </div>

        {/* O7: rolsüz bir `div`'de `aria-label` duyurulmaz — ARIA 1.2 jenerik öğede yasaklar. */}
        {!searching ? (
          <div
            role="group"
            aria-label={t('waiter.order.categoriesLabel')}
            className="flex gap-2 overflow-x-auto overscroll-x-contain px-4 pb-2 [scrollbar-width:none]"
          >
            {categories.map((c) => (
              <Chip
                key={c.id}
                selected={activeCategoryId === c.id}
                className="min-h-10! shrink-0 whitespace-nowrap"
                onClick={() => scrollToCategory(c.id)}
              >
                {localName(c, locale)}
              </Chip>
            ))}
          </div>
        ) : null}
      </div>

      <div className="flex-1 px-4 pb-6">
        {body === 'loading' ? (
          <MenuSkeleton />
        ) : searching ? (
          filtered.map((p) => (
            <ProductRow
              key={p.id}
              product={p}
              t={t}
              onAdd={quickAdd}
              onOpenSheet={openSheetForAdd}
            />
          ))
        ) : (
          categories.map((c) => (
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
          ))
        )}
      </div>

      {sheet ? (
        <ProductSheet
          product={sheet.product}
          open
          onClose={() => setSheet(null)}
          onSubmit={handleSheetSubmit}
          initial={sheet.initial}
        />
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
  const cheapestVariant = product.variants.length
    ? Math.min(...product.variants.map((v) => v.price_cents))
    : null;
  // Y3: tükendi bilgisi artık rozette; fiyat gizlenmez — garson "bu ürün kaç para" sorusunu
  // tükenmiş üründe de cevaplayabilmeli (müşteri sorar, ürün akşam geri gelir).
  const priceLabel =
    cheapestVariant !== null
      ? t('waiter.order.priceFrom', { price: formatEuro(cheapestVariant) })
      : formatEuro(product.base_price_cents ?? 0);

  return (
    <li className="relative flex items-start gap-3 border-b border-border py-3">
      {/*
        Satırın tamamı ürün kartını açar (büyük görsel, malzeme çıkar/ekle, mutfağa not). Düğme satırı
        kaplayan bir katmandır: `<li>` içinde iç içe buton olmaz ve "Ekle" (`z-[1]`) üstte kalıp
        doğrudan sepete eklemeye devam eder. Tükenen ürünün kartı açılmaz — eklenemez.
      */}
      {soldOut ? null : (
        <button
          type="button"
          aria-label={t('waiter.order.openProduct', { name: product.name })}
          onClick={() => onOpenSheet(product)}
          className={clsx(
            'absolute inset-0 cursor-pointer rounded-control transition-colors duration-150 ease-out',
            'active:bg-surface-2/60 hover:bg-surface-2/30',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-lime',
          )}
        />
      )}
      <ProductImage path={product.image_path} size="thumb" code={product.code} />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {/*
          K1: ad satırın TAMAMINI alır ve kesilmek yerine iki satıra sarar. Eskiden ad ile
          "Ekle"/"Seç" düğmesi aynı satırdaydı; Almanca'da "Hinzufügen"/"Auswählen" düğmesi
          "Ekle"/"Seç"ten ~2,5 kat geniş olduğu için ada ~10 karakter kalıyordu
          (`05 Drehspie…`, `89 Gemüse …`). Menüde altı ayrı `Drehspieß …` ürünü var — hepsi aynı
          görünüyordu ve yanlış ürün ancak mutfak fişi bastıktan sonra fark ediliyordu (fiş +
          STORNO + yeniden basım). DESIGN.md §3: kısaltma yerine sarma.
        */}
        <p className="flex items-baseline gap-2">
          {product.code ? (
            <span className="tabular shrink-0 text-base text-muted">{product.code}</span>
          ) : null}
          <span
            className={clsx(
              // `min-w-0`: tek parçalı uzun Almanca bileşik adlar (Drehspießfleisch) esnek
              // kutunun varsayılan `min-width: auto`'su yüzünden satırı taşırmasın.
              'line-clamp-2 min-w-0 text-product font-semibold',
              soldOut && 'text-muted',
            )}
          >
            {product.name}
          </span>
        </p>
        <div data-testid="product-row-actions" className="flex items-center justify-between gap-3">
          <span className="tabular text-base text-muted">{priceLabel}</span>
          {soldOut ? (
            // Y3: eskiden satır `opacity-50` ile 2,74:1'e düşüyordu ve sağ taraf bomboş kalıp
            // "eksik render" gibi duruyordu. Opaklık yerine net bir durum: tam opak rozet.
            <Badge tone="empty">{t('waiter.order.soldOut')}</Badge>
          ) : (
            <Button
              size="md"
              variant="secondary"
              className="relative z-[1] shrink-0"
              icon={<Plus aria-hidden size={18} />}
              onClick={() => (needsSheet(product) ? onOpenSheet(product) : onAdd(product))}
            >
              {needsSheet(product) ? t('common.select') : t('common.add')}
            </Button>
          )}
        </div>
      </div>
    </li>
  );
}

/**
 * Y1: menü gelene kadar ekran bomboştu (`m3-order-loading-390.png`). İskelet, masa ızgarasındaki
 * kalıbın aynısıdır (`TablesPage`): aynı kenarlık, aynı nabız — yükleme iki ekranda aynı şeye
 * benzer. Ürün satırının gerçek ölçülerini taşır ki menü gelince düzen kaymasın.
 */
function MenuSkeleton() {
  return (
    <div data-testid="menu-skeleton" aria-hidden className="flex flex-col gap-3 py-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-start gap-3">
          <div className="size-14 shrink-0 animate-pulse rounded-card border border-border bg-surface-2" />
          <div className="flex flex-1 flex-col gap-2">
            <div className="h-6 w-3/4 animate-pulse rounded-control bg-surface-2" />
            <div className="h-12 animate-pulse rounded-control bg-surface-2" />
          </div>
        </div>
      ))}
    </div>
  );
}
