import { describe, expect, it } from 'vitest';
import { itemLines } from './itemLines';

const item = {
  variant_name_de: 'Kalb',
  variant_name_tr: 'Dana',
  note: 'Soße extra',
  removed_ingredients: [{ id: 'z', name_de: 'Zwiebeln', name_tr: 'Soğan' }],
  selected_options: [
    {
      group_id: 's',
      group_name_de: 'Soße',
      group_name_tr: 'Sos',
      ticket_format: 'label_values',
      group_sort: 1,
      option_id: 'a',
      name_de: 'Knoblauch',
      name_tr: 'Sarımsaklı',
      price_delta_cents: 0,
    },
    {
      group_id: 'b',
      group_name_de: 'Beilage',
      group_name_tr: 'Garnitür',
      ticket_format: 'values_only',
      group_sort: 0,
      option_id: 'r',
      name_de: 'Reis',
      name_tr: 'Pilav',
      price_delta_cents: 0,
    },
    {
      group_id: 'e',
      group_name_de: 'Extras',
      group_name_tr: 'Ekstralar',
      ticket_format: 'plus_each',
      group_sort: 2,
      option_id: 'w',
      name_de: 'Extra Weichkäse',
      name_tr: 'Ekstra beyaz peynir',
      price_delta_cents: 100,
    },
  ],
} as never;

describe('itemLines', () => {
  it('Almanca', () =>
    expect(itemLines(item, 'de')).toEqual({
      variant: 'Kalb',
      without: 'OHNE: Zwiebeln',
      options: ['Reis', 'Soße: Knoblauch', '+ Extra Weichkäse'],
      note: 'Soße extra',
    }));

  it('Türkçe', () =>
    expect(itemLines(item, 'tr')).toEqual({
      variant: 'Dana',
      without: 'ÇIKAR: Soğan',
      options: ['Pilav', 'Sos: Sarımsaklı', '+ Ekstra beyaz peynir'],
      note: 'Soße extra',
    }));
});
