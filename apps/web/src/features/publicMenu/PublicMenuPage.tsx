import { clsx } from 'clsx';
import { Flame, RotateCw } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import logoUrl from '../../assets/brand/ramos-logo.webp';
import { productImageUrl } from '../../lib/images';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { useScrollSpy } from '../common/useScrollSpy';
import { usePublicMenu } from './data/publicMenu';
import { initialLocale, isRtl, PUBLIC_LOCALES, saveLocale, type PublicLocale } from './locale';
import { PublicProductSheet } from './PublicProductSheet';
import { categoryName, groupProducts, legendLabel, priceLabel } from './publicMenuLogic';
import { LANGUAGE_NAMES, t } from './strings';
import type { PublicMenu, PublicProduct } from './types';

const FOCUS =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime focus-visible:ring-offset-2 focus-visible:ring-offset-bg';

/**
 * Girişsiz müşteri menüsü (`/menu`, masadaki QR). Yalnız okuma: sepet, sipariş, seçim yok.
 * Dil telefonun dilinden gelir, seçici ile değişir (`ramos-menu-locale`; personelin dili etkilenmez).
 * Ürün adları ve açıklamaları sistemde yalnız Almanca — dil seçimi kategori adlarını ve sayfa
 * metinlerini çevirir.
 */
export function PublicMenuPage() {
  const [locale, setLocale] = useState<PublicLocale>(() =>
    initialLocale(
      typeof navigator === 'undefined' ? [] : (navigator.languages ?? [navigator.language]),
    ),
  );
  const { data, isPending, isError, refetch, isFetching } = usePublicMenu();
  const [openProduct, setOpenProduct] = useState<PublicProduct | null>(null);
  const rtl = isRtl(locale);

  // `<html lang/dir>` bu sayfadayken müşterinin dilidir (portal ile çizilen kart da miras alır);
  // sayfadan çıkınca personel uygulamasının değerleri geri gelir.
  useEffect(() => {
    const root = document.documentElement;
    const previous = { lang: root.lang, dir: root.getAttribute('dir') };
    root.lang = locale;
    root.setAttribute('dir', rtl ? 'rtl' : 'ltr');
    return () => {
      root.lang = previous.lang;
      if (previous.dir === null) root.removeAttribute('dir');
      else root.setAttribute('dir', previous.dir);
    };
  }, [locale, rtl]);

  useEffect(() => {
    const previous = document.title;
    document.title = `${data?.restaurant_name ?? "Ramo's"} · ${t(locale, 'pageTitle')}`;
    return () => {
      document.title = previous;
    };
  }, [data?.restaurant_name, locale]);

  const chooseLocale = (next: PublicLocale) => {
    setLocale(next);
    saveLocale(next);
  };

  const groups = useMemo(() => (data ? groupProducts(data.categories, data.products) : []), [data]);

  return (
    <div
      dir={rtl ? 'rtl' : 'ltr'}
      lang={locale}
      className="flex min-h-dvh flex-col overflow-x-clip bg-bg"
    >
      <header className="flex flex-col items-center gap-5 px-4 pb-4 pt-[max(1.5rem,env(safe-area-inset-top))]">
        <h1 className="flex flex-col items-center">
          <img
            src={logoUrl}
            alt={data?.restaurant_name ?? "Ramo's Döner & Grill House"}
            width={720}
            height={287}
            className="h-auto w-44"
          />
          <span className="sr-only">{t(locale, 'pageTitle')}</span>
        </h1>
        <LanguageSwitch locale={locale} onChange={chooseLocale} />
      </header>

      {isPending ? (
        <MenuSkeleton />
      ) : isError || !data ? (
        <div className="flex flex-1 flex-col items-center gap-4 px-6 py-16 text-center">
          <p role="alert" className="max-w-xs text-base text-muted">
            {t(locale, 'loadError')}
          </p>
          <Button
            variant="secondary"
            loading={isFetching}
            icon={<RotateCw aria-hidden size={18} />}
            onClick={() => void refetch()}
          >
            {t(locale, 'retry')}
          </Button>
        </div>
      ) : groups.length === 0 ? (
        <p className="flex-1 px-6 py-16 text-center text-base text-muted">{t(locale, 'empty')}</p>
      ) : (
        <MenuBody menu={data} groups={groups} locale={locale} onOpen={setOpenProduct} />
      )}

      {openProduct && data ? (
        <PublicProductSheet
          product={openProduct}
          legend={data.allergen_legend}
          locale={locale}
          onClose={() => setOpenProduct(null)}
        />
      ) : null}
    </div>
  );
}

function LanguageSwitch({
  locale,
  onChange,
}: {
  locale: PublicLocale;
  onChange: (l: PublicLocale) => void;
}) {
  return (
    <div
      role="group"
      aria-label={t(locale, 'languageLabel')}
      className="grid w-full max-w-md grid-cols-4 gap-1 rounded-full border border-border bg-surface p-1"
    >
      {PUBLIC_LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          lang={l}
          aria-pressed={l === locale}
          onClick={() => onChange(l)}
          className={clsx(
            'min-h-11 cursor-pointer rounded-full px-1 text-sm font-semibold transition-colors duration-150 ease-out',
            FOCUS,
            l === locale ? 'bg-lime text-bg' : 'text-muted hover:text-text',
          )}
        >
          {LANGUAGE_NAMES[l]}
        </button>
      ))}
    </div>
  );
}

function MenuBody({
  menu,
  groups,
  locale,
  onOpen,
}: {
  menu: PublicMenu;
  groups: ReturnType<typeof groupProducts>;
  locale: PublicLocale;
  onOpen: (p: PublicProduct) => void;
}) {
  const { activeId, register, scrollTo } = useScrollSpy({
    rootMargin: '-80px 0px -65% 0px',
    watch: groups,
  });
  const current = activeId ?? groups[0]?.category.id ?? null;
  const bar = useRef<HTMLDivElement>(null);

  // Aktif çip yatay şeritte görünür kalsın. Öğenin `scrollIntoView`'ı değil şeridin kendi
  // kaydırması: sayfanın süren yumuşak kaydırmasını kesmez, RTL'de de aynı hesapla çalışır.
  useEffect(() => {
    const el = bar.current;
    const chip = current ? el?.querySelector<HTMLElement>(`[data-chip="${current}"]`) : null;
    if (!el || !chip || typeof el.scrollBy !== 'function') return;
    const c = chip.getBoundingClientRect();
    const b = el.getBoundingClientRect();
    el.scrollBy({ left: c.left + c.width / 2 - (b.left + b.width / 2), behavior: 'smooth' });
  }, [current, locale]);

  return (
    <>
      <nav
        aria-label={t(locale, 'categoriesLabel')}
        className="sticky top-0 z-10 border-y border-border bg-bg/95 backdrop-blur-sm"
      >
        <div
          ref={bar}
          className="flex gap-2 overflow-x-auto overscroll-x-contain px-4 py-3 [scrollbar-width:none]"
        >
          {groups.map(({ category }) => {
            const active = category.id === current;
            return (
              <button
                key={category.id}
                type="button"
                data-chip={category.id}
                aria-current={active ? 'true' : undefined}
                onClick={() => scrollTo(category.id)}
                className={clsx(
                  'min-h-11 shrink-0 cursor-pointer whitespace-nowrap rounded-full border px-4 text-[15px] font-semibold',
                  'transition-colors duration-150 ease-out',
                  FOCUS,
                  active
                    ? 'border-lime bg-lime/15 text-lime'
                    : 'border-border bg-surface text-text',
                )}
              >
                {categoryName(category, locale)}
              </button>
            );
          })}
        </div>
      </nav>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4">
        {groups.map(({ category, products }) => (
          <section
            key={category.id}
            ref={register(category.id)}
            aria-labelledby={`cat-${category.id}`}
            className="scroll-mt-[4.5rem] pt-8"
          >
            <h2 id={`cat-${category.id}`} className="pb-1 text-2xl font-bold text-text">
              {categoryName(category, locale)}
            </h2>
            <ul>
              {products.map((p) => (
                <li key={p.id} className="border-b border-border last:border-b-0">
                  <ProductRow product={p} locale={locale} onOpen={onOpen} />
                </li>
              ))}
            </ul>
          </section>
        ))}

        <footer className="mt-10 flex flex-col gap-4 border-t border-border py-8 pb-[max(2rem,env(safe-area-inset-bottom))]">
          {menu.allergen_legend.length > 0 ? (
            <details className="group rounded-card border border-border bg-surface">
              <summary
                className={clsx(
                  'flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 rounded-card px-4 text-base font-semibold',
                  FOCUS,
                )}
              >
                {t(locale, 'allergenLegendTitle')}
                <span
                  aria-hidden
                  className="text-xl text-muted transition-transform group-open:rotate-45"
                >
                  +
                </span>
              </summary>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 px-4 pb-4 text-sm">
                {menu.allergen_legend.map((e) => (
                  <div key={e.code} className="contents">
                    <dt className="font-semibold text-gold">{e.code}</dt>
                    <dd className="text-muted">{legendLabel(e, locale)}</dd>
                  </div>
                ))}
              </dl>
            </details>
          ) : null}
          <p className="text-center text-xs text-muted">{t(locale, 'vatNote')}</p>
        </footer>
      </main>
    </>
  );
}

function ProductRow({
  product,
  locale,
  onOpen,
}: {
  product: PublicProduct;
  locale: PublicLocale;
  onOpen: (p: PublicProduct) => void;
}) {
  const soldOut = product.is_sold_out;
  return (
    <button
      type="button"
      onClick={() => onOpen(product)}
      className={clsx(
        '-mx-2 flex w-[calc(100%+1rem)] cursor-pointer items-start gap-4 rounded-card px-2 py-4 text-start',
        'transition-colors duration-150 ease-out active:bg-surface hover:bg-surface/60',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-lime',
      )}
    >
      <MenuThumb product={product} />
      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="flex items-baseline gap-2">
          {product.code ? (
            <span className="tabular shrink-0 text-sm font-semibold text-muted">
              {product.code}
            </span>
          ) : null}
          <bdi
            lang="de"
            className={clsx(
              'line-clamp-2 min-w-0 text-product font-semibold rtl:text-right',
              soldOut && 'text-muted',
            )}
          >
            {product.name}
          </bdi>
        </span>
        {product.description ? (
          <span lang="de" dir="auto" className="line-clamp-2 text-sm text-muted rtl:text-right">
            {product.description}
          </span>
        ) : null}
        <span className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1.5 pt-1">
          <span
            className={clsx(
              'tabular text-base font-semibold',
              soldOut ? 'text-muted' : 'text-gold',
            )}
          >
            {priceLabel(product, locale)}
          </span>
          {soldOut ? <Badge tone="empty">{t(locale, 'soldOut')}</Badge> : null}
        </span>
      </span>
    </button>
  );
}

/**
 * Satır görseli: 96 px kare, küçük (320 px) dosya. `ui/ProductImage`'in thumb kutusu 56 px'e
 * sabit (personel listesi); müşteri menüsünde görsel satırın asıl içeriği olduğu için daha büyük.
 */
function MenuThumb({ product }: { product: PublicProduct }) {
  const [failed, setFailed] = useState(false);
  const url = productImageUrl(product.image_path, 'thumb');
  return (
    <span className="relative block size-24 shrink-0 overflow-hidden rounded-card border border-border bg-surface-2">
      {url && !failed ? (
        <img
          src={url}
          alt=""
          loading="lazy"
          decoding="async"
          width={96}
          height={96}
          onError={() => setFailed(true)}
          className={clsx('size-full object-cover', product.is_sold_out && 'grayscale')}
        />
      ) : (
        <span
          data-testid="product-image-placeholder"
          aria-hidden
          className="flex size-full items-center justify-center"
        >
          <Flame className="text-gold/60" size={28} />
        </span>
      )}
    </span>
  );
}

function MenuSkeleton() {
  return (
    <div
      data-testid="menu-skeleton"
      aria-hidden
      className="mx-auto flex w-full max-w-2xl flex-col px-4"
    >
      <div className="flex gap-2 py-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-11 w-24 animate-pulse rounded-full bg-surface" />
        ))}
      </div>
      <div className="mt-6 h-7 w-40 animate-pulse rounded-control bg-surface" />
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex gap-4 border-b border-border py-4">
          <div className="size-24 shrink-0 animate-pulse rounded-card bg-surface" />
          <div className="flex flex-1 flex-col gap-2 pt-1">
            <div className="h-5 w-3/4 animate-pulse rounded-control bg-surface" />
            <div className="h-4 w-full animate-pulse rounded-control bg-surface" />
            <div className="h-5 w-16 animate-pulse rounded-control bg-surface" />
          </div>
        </div>
      ))}
    </div>
  );
}
