import type { MenuGroup, MenuProduct } from '@ramos/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';

vi.mock('../../data/settings', () => ({ useSettings: () => undefined }));

import { ProductSheet } from './ProductSheet';

// Brief'teki örnekler Almanca ad kullanır (Hähnchen, Kalb, Zwiebeln …) — varyant/seçenek/malzeme
// adları da `localName()` ile gösterildiği için testte dil Almanca'ya sabitlenir.
beforeAll(() => {
  void i18n.changeLanguage('de');
});

// Görev 9'daki "teller" ürünü (Beilage + Soße + Extras) — packages/shared/src/pricing.test.ts ile aynı.
const sauce: MenuGroup = {
  id: 'g-s', name_de: 'Soße', name_tr: 'Sos', min_select: 1, max_select: 3, ticket_format: 'label_values', sort: 1,
  options: [
    { id: 'kn', name_de: 'Knoblauch', name_tr: null, price_delta_cents: 0, is_default: false, is_exclusive: false, sort: 1 },
    { id: 'kr', name_de: 'Kräuter', name_tr: null, price_delta_cents: 0, is_default: false, is_exclusive: false, sort: 2 },
    { id: 'sc', name_de: 'Scharfe Soße', name_tr: null, price_delta_cents: 0, is_default: false, is_exclusive: false, sort: 3 },
    { id: 'oh', name_de: 'ohne Soße', name_tr: null, price_delta_cents: 0, is_default: false, is_exclusive: true, sort: 4 },
  ],
};
const beilage: MenuGroup = {
  id: 'g-b', name_de: 'Beilage', name_tr: null, min_select: 1, max_select: 1, ticket_format: 'values_only', sort: 0,
  options: [
    { id: 'po', name_de: 'Pommes', name_tr: null, price_delta_cents: 0, is_default: true, is_exclusive: false, sort: 1 },
    { id: 're', name_de: 'Reis', name_tr: null, price_delta_cents: 0, is_default: false, is_exclusive: false, sort: 2 },
  ],
};
const extras: MenuGroup = {
  id: 'g-e', name_de: 'Extras', name_tr: null, min_select: 0, max_select: 2, ticket_format: 'plus_each', sort: 2,
  options: [
    { id: 'wk', name_de: 'Extra Weichkäse', name_tr: null, price_delta_cents: 100, is_default: false, is_exclusive: false, sort: 1 },
    { id: 'fl', name_de: 'Extra Fleisch', name_tr: null, price_delta_cents: 200, is_default: false, is_exclusive: false, sort: 2 },
  ],
};
const teller: MenuProduct = {
  id: 'p08', category_id: 'c', code: '08', name: 'Drehspieß Teller', description: null,
  base_price_cents: null, allergens: null, image_path: null, is_sold_out: false, sort: 1,
  variants: [
    { id: 'h', name_de: 'Hähnchen', name_tr: 'Tavuk', price_cents: 1250, is_default: true, sort: 1 },
    { id: 'k', name_de: 'Kalb', name_tr: 'Dana', price_cents: 1350, is_default: false, sort: 2 },
  ],
  ingredients: [{ id: 'zw', name_de: 'Zwiebeln', name_tr: 'Soğan', sort: 1 }],
  groups: [beilage, sauce, extras],
};

const toppingIds = ['t1', 't2', 't3', 't4', 't5', 't6'];
const pizzaMixGroup: MenuGroup = {
  id: 'g-pm', name_de: 'Beläge', name_tr: 'Malzemeler', min_select: 5, max_select: 5, ticket_format: 'label_values', sort: 0,
  options: toppingIds.map((id, i) => ({
    id, name_de: `Belag ${id}`, name_tr: null, price_delta_cents: 0, is_default: false, is_exclusive: false, sort: i + 1,
  })),
};
const pizzaMix: MenuProduct = {
  id: 'p47', category_id: 'c2', code: '47', name: 'Pizza Mix', description: null,
  base_price_cents: 1150, allergens: null, image_path: null, is_sold_out: false, sort: 2,
  variants: [], ingredients: [], groups: [pizzaMixGroup],
};

const addToCart = () => screen.getByRole('button', { name: /In den Warenkorb/ });

describe('ProductSheet', () => {
  it('açılışta Hähnchen ve Pommes seçilidir; fiyat 12,50 €', () => {
    render(<ProductSheet product={teller} open onClose={vi.fn()} onSubmit={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Hähnchen/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /Pommes/ })).toHaveAttribute('aria-pressed', 'true');
    expect(addToCart()).toHaveTextContent('12,50');
  });

  it('Kalb seçilince fiyat 13,50 €; Extra Weichkäse eklenince 14,50 €', async () => {
    const user = userEvent.setup();
    render(<ProductSheet product={teller} open onClose={vi.fn()} onSubmit={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /Kalb/ }));
    expect(addToCart()).toHaveTextContent('13,50');
    await user.click(screen.getByRole('button', { name: /Extra Weichkäse/ }));
    expect(addToCart()).toHaveTextContent('14,50');
  });

  it('Soße seçilmeden Sepete ekle pasiftir ve Soße grubu aria-invalid taşır', () => {
    render(<ProductSheet product={teller} open onClose={vi.fn()} onSubmit={vi.fn()} />);
    expect(addToCart()).toBeDisabled();
    expect(screen.getByRole('group', { name: 'Soße' })).toHaveAttribute('aria-invalid', 'true');
  });

  it('Zwiebeln çipine dokununca aria-pressed false olur ve üstü çizili OHNE görünür', async () => {
    const user = userEvent.setup();
    render(<ProductSheet product={teller} open onClose={vi.fn()} onSubmit={vi.fn()} />);
    const chip = screen.getByRole('button', { name: /Zwiebeln/ });
    expect(chip).toHaveAttribute('aria-pressed', 'true');
    await user.click(chip);
    expect(chip).toHaveAttribute('aria-pressed', 'false');
    expect(chip).toHaveTextContent('OHNE');
    expect(chip.className).toMatch(/line-through/);
  });

  it('ohne Soße seçilince Knoblauch seçimi kalkar', async () => {
    const user = userEvent.setup();
    render(<ProductSheet product={teller} open onClose={vi.fn()} onSubmit={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /^Knoblauch$/ }));
    expect(screen.getByRole('button', { name: /^Knoblauch$/ })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: /ohne Soße/ }));
    expect(screen.getByRole('button', { name: /^Knoblauch$/ })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: /ohne Soße/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('Pizza Mix: 4 malzemeyle buton pasif, 5 ile aktif; 6.ya dokunmak seçimi değiştirmez', async () => {
    const user = userEvent.setup();
    render(<ProductSheet product={pizzaMix} open onClose={vi.fn()} onSubmit={vi.fn()} />);
    for (const id of toppingIds.slice(0, 4)) {
      await user.click(screen.getByRole('button', { name: new RegExp(`^Belag ${id}$`) }));
    }
    expect(addToCart()).toBeDisabled();
    await user.click(screen.getByRole('button', { name: new RegExp(`^Belag ${toppingIds[4]}$`) }));
    expect(addToCart()).not.toBeDisabled();
    await user.click(screen.getByRole('button', { name: new RegExp(`^Belag ${toppingIds[5]}$`) }));
    expect(screen.getByRole('button', { name: new RegExp(`^Belag ${toppingIds[5]}$`) })).toHaveAttribute('aria-pressed', 'false');
    expect(addToCart()).not.toBeDisabled();
  });

  it('adet 2 yapılıp Sepete ekleye basınca onSubmit doğru Selection, quantity ve note ile çağrılır', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<ProductSheet product={teller} open onClose={vi.fn()} onSubmit={onSubmit} />);
    await user.click(screen.getByRole('button', { name: /^Knoblauch$/ }));
    await user.click(screen.getByRole('button', { name: 'Menge erhöhen' }));
    await user.click(addToCart());
    expect(onSubmit).toHaveBeenCalledWith({
      variantId: 'h',
      optionIds: ['po', 'kn'],
      removedIngredientIds: [],
      quantity: 2,
      note: '',
    });
  });

  it('initial verilince seçim önceden dolar ve buton Güncelle olur', () => {
    render(
      <ProductSheet
        product={teller}
        open
        onClose={vi.fn()}
        onSubmit={vi.fn()}
        initial={{ variantId: 'k', optionIds: ['po', 'kn'], removedIngredientIds: ['zw'], quantity: 3, note: 'az pişmiş' }}
      />,
    );
    expect(screen.getByRole('button', { name: /Kalb/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /Aktualisieren/ })).toBeInTheDocument();
    expect(screen.getByDisplayValue('az pişmiş')).toBeInTheDocument();
  });
});
