import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublicMenu } from './types';

// Canlı RPC'ye gidilmez: veri kancası sahte, her test durumunu kendisi kurar.
const h = vi.hoisted(() => ({
  state: {} as {
    data?: PublicMenu;
    isPending: boolean;
    isError: boolean;
    isFetching: boolean;
  },
  refetch: vi.fn(),
}));

vi.mock('./data/publicMenu', () => ({
  usePublicMenu: () => ({ ...h.state, refetch: h.refetch }),
}));

import { MENU_LOCALE_KEY } from './locale';
import { PublicMenuPage } from './PublicMenuPage';

const menu: PublicMenu = {
  restaurant_name: "Ramo's Döner & Grill House",
  allergen_legend: [
    { code: 'a', de: 'Glutenhaltiges Getreide', tr: 'Glutenli tahıl' },
    { code: 'g', de: 'Milch', tr: 'Süt' },
  ],
  categories: [
    {
      id: 'c2',
      name_de: 'Getränke',
      name_tr: 'İçecekler',
      name_en: 'Drinks',
      name_ar: 'مشروبات',
      is_beverage: true,
      sort: 20,
    },
    {
      id: 'c1',
      name_de: 'Suppen',
      name_tr: 'Çorbalar',
      name_en: 'Soups',
      name_ar: 'شوربات',
      is_beverage: false,
      sort: 10,
    },
    {
      id: 'c3',
      name_de: 'Leer',
      name_tr: null,
      name_en: null,
      name_ar: null,
      is_beverage: false,
      sort: 30,
    },
  ],
  products: [
    {
      id: 'p1',
      category_id: 'c1',
      code: '01',
      name: 'Linsensuppe',
      description: 'Rote Linsen, Zitrone',
      base_price_cents: 650,
      image_path: 'products/p1.webp',
      allergens: 'a,g',
      is_sold_out: false,
      sort: 1,
      variants: [],
    },
    {
      id: 'p2',
      category_id: 'c1',
      code: '02',
      name: 'Kuttelsuppe',
      description: null,
      base_price_cents: 700,
      image_path: null,
      allergens: null,
      is_sold_out: true,
      sort: 2,
      variants: [],
    },
    {
      id: 'p3',
      category_id: 'c2',
      code: null,
      name: 'Ayran',
      description: null,
      base_price_cents: null,
      image_path: null,
      allergens: 'g',
      is_sold_out: false,
      sort: 1,
      variants: [
        { name_de: 'Groß', name_tr: 'Büyük', price_cents: 350, sort: 2 },
        { name_de: 'Klein', name_tr: 'Küçük', price_cents: 250, sort: 1 },
      ],
    },
  ],
};

const ready = () => {
  h.state = { data: menu, isPending: false, isError: false, isFetching: false };
};

const languages = vi.spyOn(navigator, 'languages', 'get');

beforeEach(() => {
  localStorage.clear();
  languages.mockReturnValue(['de-DE']);
  h.refetch.mockReset();
  ready();
});

afterEach(() => {
  document.documentElement.removeAttribute('dir');
  document.documentElement.lang = 'tr';
});

describe('<PublicMenuPage />', () => {
  it('logo, dil seçici, kategoriler ve ürün satırları (Almanca)', () => {
    render(<PublicMenuPage />);

    expect(screen.getByRole('img', { name: "Ramo's Döner & Grill House" })).toBeInTheDocument();
    const langs = within(screen.getByRole('group', { name: 'Sprache' }));
    expect(langs.getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Deutsch',
      'Türkçe',
      'English',
      'العربية',
    ]);
    expect(langs.getByRole('button', { name: 'Deutsch' })).toHaveAttribute('aria-pressed', 'true');

    // Sıra `sort`'a göre; ürünü olmayan kategori görünmez.
    const nav = within(screen.getByRole('navigation', { name: 'Kategorien' }));
    expect(nav.getAllByRole('button').map((b) => b.textContent)).toEqual(['Suppen', 'Getränke']);
    expect(screen.getAllByRole('heading', { level: 2 }).map((x) => x.textContent)).toEqual([
      'Suppen',
      'Getränke',
    ]);

    const linsen = screen.getByRole('button', { name: /Linsensuppe/ });
    expect(linsen).toHaveTextContent('01');
    expect(linsen).toHaveTextContent('6,50');
    expect(linsen.querySelector('img')).toHaveAttribute(
      'src',
      expect.stringContaining('products/p1-thumb.webp'),
    );

    const kuttel = screen.getByRole('button', { name: /Kuttelsuppe/ });
    expect(kuttel).toHaveTextContent('Ausverkauft');
    expect(screen.getByRole('button', { name: /Ayran/ })).toHaveTextContent('ab 2,50');

    expect(document.documentElement.lang).toBe('de');
    expect(document.documentElement.getAttribute('dir')).toBe('ltr');
  });

  it('telefon dili Türkçe ise Türkçe açılır; ürün adı Almanca kalır', () => {
    languages.mockReturnValue(['tr-TR', 'en']);
    render(<PublicMenuPage />);
    expect(screen.getByRole('button', { name: 'Türkçe' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('navigation', { name: 'Kategoriler' })).toHaveTextContent('Çorbalar');
    expect(screen.getByRole('button', { name: /Kuttelsuppe/ })).toHaveTextContent('Tükendi');
    expect(screen.getByRole('button', { name: /Ayran/ })).toHaveTextContent('2,50 €’dan');
  });

  it('Arapça seçilince sayfa sağdan sola, seçim kaydedilir; çıkınca html geri alınır', async () => {
    document.documentElement.lang = 'tr';
    const { container, unmount } = render(<PublicMenuPage />);
    await userEvent.click(screen.getByRole('button', { name: 'العربية' }));

    expect(screen.getByRole('button', { name: 'العربية' })).toHaveAttribute('aria-pressed', 'true');
    expect(container.firstElementChild).toHaveAttribute('dir', 'rtl');
    expect(document.documentElement.getAttribute('dir')).toBe('rtl');
    expect(document.documentElement.lang).toBe('ar');
    expect(localStorage.getItem(MENU_LOCALE_KEY)).toBe('ar');
    expect(localStorage.getItem('ramos-locale')).toBeNull();
    expect(screen.getByRole('navigation', { name: 'الفئات' })).toHaveTextContent('شوربات');

    unmount();
    expect(document.documentElement.lang).toBe('tr');
    expect(document.documentElement.hasAttribute('dir')).toBe(false);
  });

  it('ürüne dokununca kart açılır: büyük görsel, açıklama, alerjen metni; sepet yok', async () => {
    render(<PublicMenuPage />);
    await userEvent.click(screen.getByRole('button', { name: /Linsensuppe/ }));

    const dialog = within(screen.getByRole('dialog', { name: 'Linsensuppe' }));
    expect(screen.getByRole('dialog').querySelector('img')).toHaveAttribute(
      'src',
      expect.stringContaining('products/p1.webp'),
    );
    expect(dialog.getByText('Rote Linsen, Zitrone')).toBeInTheDocument();
    expect(dialog.getByText('Glutenhaltiges Getreide')).toBeInTheDocument();
    expect(dialog.getByText('Milch')).toBeInTheDocument();
    expect(dialog.getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual([
      'Schließen',
    ]);

    await userEvent.click(dialog.getByRole('button', { name: 'Schließen' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('alerjen lejantı alt bölümde', () => {
    render(<PublicMenuPage />);
    const summary = screen.getByText('Allergene und Zusatzstoffe');
    expect(summary.closest('details')).toHaveTextContent('Glutenhaltiges Getreide');
  });

  it('yüklenirken iskelet', () => {
    h.state = { isPending: true, isError: false, isFetching: true };
    render(<PublicMenuPage />);
    expect(screen.getByTestId('menu-skeleton')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Sprache' })).toBeInTheDocument();
  });

  it('hata: mesaj + tekrar dene', async () => {
    h.state = { isPending: false, isError: true, isFetching: false };
    render(<PublicMenuPage />);
    expect(screen.getByRole('alert')).toHaveTextContent('konnte nicht geladen werden');
    await userEvent.click(screen.getByRole('button', { name: 'Erneut versuchen' }));
    expect(h.refetch).toHaveBeenCalled();
  });

  it('boş menü', () => {
    h.state = {
      data: { ...menu, products: [] },
      isPending: false,
      isError: false,
      isFetching: false,
    };
    render(<PublicMenuPage />);
    expect(screen.getByText('Die Speisekarte ist gerade leer.')).toBeInTheDocument();
  });
});
