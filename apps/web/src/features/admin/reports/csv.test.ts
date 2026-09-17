import { formatEuro } from '@ramos/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OrderItemView, OrderView } from '../../../data/orderMapper';
import { orderTotalCents } from '../orders/ordersQuery';
import {
  CSV_HEADERS,
  csvFileName,
  csvMoney,
  downloadTextFile,
  orderRowsForCsv,
  toCsv,
} from './csv';

describe('toCsv', () => {
  it('BOM, ; ayırıcı, CRLF, kaçış', () => {
    expect(
      toCsv(
        ['A', 'B'],
        [
          ['x;y', 'He said "hi"'],
          [1, null],
        ],
      ),
    ).toBe('\uFEFFA;B\r\n"x;y";"He said ""hi"""\r\n1;\r\n');
  });

  it('satır sonu içeren alan tırnaklanır (LF ve CR)', () => {
    expect(toCsv(['A'], [['bir\nki'], ['a\rb']])).toBe('\uFEFFA\r\n"bir\nki"\r\n"a\rb"\r\n');
  });

  it('satır yoksa yalnız başlık', () => expect(toCsv(['A', 'B'], [])).toBe('\uFEFFA;B\r\n'));

  it('başlık alanları da kaçırılır', () =>
    expect(toCsv(['A;B', 'C'], [])).toBe('\uFEFF"A;B";C\r\n'));

  // CSV/formül enjeksiyonu (OWASP): Excel "=", "+", "-", "@" ile başlayan hücreyi formül sayar.
  // "+ Extra Käse" #NAME? olur, garsonun yazdığı "=HYPERLINK(…)" notu çalışırdı.
  it('formül gibi başlayan metin tek tırnakla metne çevrilir', () => {
    expect(toCsv(['A'], [['=SUM(A1)'], ['+ Knoblauch'], ['-5'], ['@x'], ['\tx']])).toBe(
      "\uFEFFA\r\n'=SUM(A1)\r\n'+ Knoblauch\r\n'-5\r\n'@x\r\n'\tx\r\n",
    );
  });

  it('korunan metin ayırıcı da içeriyorsa hem korunur hem tırnaklanır', () =>
    expect(toCsv(['A'], [['=1;2']])).toBe('\uFEFFA\r\n"\'=1;2"\r\n'));

  it('sayılar olduğu gibi yazılır (negatif sayı formül değildir)', () =>
    expect(toCsv(['A', 'B'], [[-3, 0]])).toBe('\uFEFFA;B\r\n-3;0\r\n'));

  it('ortadaki = ya da + dokunulmadan kalır', () =>
    expect(toCsv(['A'], [['a=b+c']])).toBe('\uFEFFA\r\na=b+c\r\n'));
});

describe('csvMoney', () => {
  it('kuruşu Almanca ondalıkla yazar, € ve binlik ayırıcı yok', () => {
    expect(csvMoney(850)).toBe('8,50');
    expect(csvMoney(0)).toBe('0,00');
    expect(csvMoney(5)).toBe('0,05');
    expect(csvMoney(123450)).toBe('1234,50');
  });
});

describe('csvFileName', () => {
  it('aralık dosya adına girer', () =>
    expect(csvFileName('2026-09-01', '2026-09-17')).toBe(
      'ramos-bestellungen-2026-09-01_2026-09-17.csv',
    ));
});

const item = (over: Partial<OrderItemView>): OrderItemView => ({
  id: 'i1',
  product_id: 'p1',
  quantity: 1,
  product_code: null,
  product_name: 'Ürün',
  variant_name_de: null,
  variant_name_tr: null,
  removed_ingredients: [],
  selected_options: [],
  extra_charges: [],
  note: null,
  status: 'active',
  cancel_reason: null,
  sort: 10,
  category_sort: 10,
  is_beverage: false,
  unit_price_cents: 0,
  ...over,
});

const order = (over: Partial<OrderView>): OrderView => ({
  id: 'o1',
  order_no: 47,
  round_no: 1,
  status: 'served',
  // Yaz saati: 22:30 UTC → Berlin 00:30, ertesi takvim günü.
  created_at: '2026-09-16T22:30:00Z',
  ready_at: null,
  note: null,
  waiter_id: 'w1',
  waiter_name: 'Ayşe',
  table_name: 'Tisch 12',
  items: [],
  print: null,
  ...over,
});

const sandwich = item({
  id: 'i1',
  quantity: 2,
  product_code: '05',
  product_name: 'Drehspieß Sandwich',
  variant_name_de: 'Kalb',
  variant_name_tr: 'Dana',
  removed_ingredients: [
    { id: 'z', name_de: 'Zwiebeln', name_tr: 'Soğan' },
    { id: 't', name_de: 'Tomaten', name_tr: 'Domates' },
  ],
  selected_options: [
    {
      group_id: 'g1',
      group_name_de: 'Soße',
      group_name_tr: 'Sos',
      ticket_format: 'label_values',
      group_sort: 1,
      option_id: 'o1',
      name_de: 'Knoblauch',
      name_tr: 'Sarımsak',
      price_delta_cents: 0,
    },
    {
      group_id: 'g1',
      group_name_de: 'Soße',
      group_name_tr: 'Sos',
      ticket_format: 'label_values',
      group_sort: 1,
      option_id: 'o2',
      name_de: 'Kräuter',
      name_tr: 'Otlu',
      price_delta_cents: 0,
    },
  ],
  // Ekstra ücret (0009) sunucuda birim fiyata eklenmiştir: 8,50 + 4,00 = 12,50.
  extra_charges: [{ label: 'Extra Käse', cents: 400 }],
  note: 'Soße extra',
  unit_price_cents: 1250,
});

const cola = item({
  id: 'i2',
  quantity: 3,
  product_name: 'Cola 0,33 l',
  is_beverage: true,
  status: 'cancelled',
  cancel_reason: 'Gast hat storniert',
  unit_price_cents: 350,
});

describe('orderRowsForCsv', () => {
  it('sütun sırası sabittir', () =>
    expect(CSV_HEADERS.join(';')).toBe(
      'Datum;Uhrzeit;Bestellung;Runde;Tisch;Kellner;Status;Menge;Nr;Artikel;Variante;Einzelpreis;Summe;OHNE;Optionen;Hinweis;Storno-Grund',
    ));

  it('her kalem bir satır; tarih/saat Berlin, para "8,50", OHNE ve seçenekler DE', () => {
    const rows = orderRowsForCsv([order({ items: [sandwich] })]);
    expect(rows).toEqual([
      [
        '17.09.2026',
        '00:30',
        '#047',
        1,
        'Tisch 12',
        'Ayşe',
        'serviert',
        2,
        '05',
        'Drehspieß Sandwich',
        'Kalb',
        '12,50',
        '25,00',
        'Zwiebeln, Tomaten',
        `Soße: Knoblauch + Kräuter | + Extra Käse (+${formatEuro(400)})`,
        'Soße extra',
        null,
      ],
    ]);
    expect(rows[0]).toHaveLength(CSV_HEADERS.length);
  });

  it('iptal edilen kalem "storniert", tutarı 0 (sipariş tutarıyla aynı kural), sebebi yazılır', () => {
    const [row] = orderRowsForCsv([order({ items: [cola] })]);
    expect(row?.[6]).toBe('storniert');
    expect(row?.[7]).toBe(3);
    expect(row?.[11]).toBe('3,50');
    expect(row?.[12]).toBe('0,00');
    expect(row?.[16]).toBe('Gast hat storniert');
  });

  it('Summe sütununun toplamı ekrandaki sipariş tutarına eşittir (ekstra ücret dahil, iptal hariç)', () => {
    const orders = [
      order({ items: [sandwich, cola] }),
      order({ id: 'o2', order_no: 48, items: [item({ quantity: 1, unit_price_cents: 990 })] }),
    ];
    const cents = orderRowsForCsv(orders).reduce(
      (sum, r) => sum + Math.round(Number(String(r[12]).replace(',', '.')) * 100),
      0,
    );
    expect(cents).toBe(orders.reduce((s, o) => s + orderTotalCents(o.items), 0));
    expect(cents).toBe(2500 + 990);
  });

  it('sipariş durumu Almanca yazılır; iptal edilmiş sipariş kalemi storniert', () => {
    const status = (s: OrderView['status']) =>
      orderRowsForCsv([order({ status: s, items: [item({})] })])[0]?.[6];
    expect(status('in_kitchen')).toBe('in der Küche');
    expect(status('ready')).toBe('fertig');
    expect(status('served')).toBe('serviert');
    expect(status('cancelled')).toBe('storniert');
  });

  it('sipariş notu kalem notunun yanına "Bestellung:" önekiyle eklenir', () => {
    const rows = orderRowsForCsv([
      order({
        note: 'Allergie beachten',
        items: [item({ note: 'ohne Salz' }), item({ id: 'i2' })],
      }),
    ]);
    expect(rows[0]?.[15]).toBe('ohne Salz | Bestellung: Allergie beachten');
    expect(rows[1]?.[15]).toBe('Bestellung: Allergie beachten');
  });

  it("boş alanlar null (CSV'de boş hücre), kış saati de Berlin'e göre", () => {
    const [row] = orderRowsForCsv([
      order({
        created_at: '2026-01-10T18:05:00Z',
        round_no: 2,
        waiter_name: '',
        items: [item({})],
      }),
    ]);
    expect(row?.slice(0, 6)).toEqual(['10.01.2026', '19:05', '#047', 2, 'Tisch 12', null]);
    expect(row?.[8]).toBeNull();
    expect(row?.[10]).toBeNull();
    expect(row?.[13]).toBeNull();
    expect(row?.[14]).toBeNull();
    expect(row?.[15]).toBeNull();
  });

  it('siparişler oluşturulma sırasıyla, kalemler sipariş içindeki sırayla', () => {
    const rows = orderRowsForCsv([
      order({
        id: 'b',
        order_no: 2,
        created_at: '2026-09-16T12:00:00Z',
        items: [item({ product_name: 'B' })],
      }),
      order({
        id: 'a',
        order_no: 1,
        created_at: '2026-09-16T11:00:00Z',
        items: [item({ product_name: 'A1' }), item({ id: 'x', product_name: 'A2' })],
      }),
    ]);
    expect(rows.map((r) => r[9])).toEqual(['A1', 'A2', 'B']);
  });

  it("toCsv ile birlikte Excel'in okuyacağı dosyayı üretir", () => {
    const text = toCsv(CSV_HEADERS, orderRowsForCsv([order({ items: [sandwich] })]));
    const [header, line] = text.split('\r\n');
    expect(header).toBe(`\uFEFF${CSV_HEADERS.join(';')}`);
    // Seçenekler "+ …" ile başlamıyor ama ";" içermiyor: tırnaksız; para alanı "12,50" virgüllü kalır.
    expect(line).toContain(';12,50;25,00;Zwiebeln, Tomaten;');
  });
});

describe('downloadTextFile', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('Blob + a[download] ile indirir ve nesne adresini bırakır', () => {
    vi.useFakeTimers();
    const created: Blob[] = [];
    const createObjectURL = vi.fn((b: Blob) => {
      created.push(b);
      return 'blob:csv';
    });
    const revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      expect(this.download).toBe('a.csv');
      expect(this.href).toBe('blob:csv');
      expect(document.body.contains(this)).toBe(true);
    });

    downloadTextFile('a.csv', '\uFEFFA\r\n', 'text/csv;charset=utf-8');

    expect(click).toHaveBeenCalledTimes(1);
    expect(created[0]?.type).toBe('text/csv;charset=utf-8');
    // Adres tıklamayla aynı anda bırakılırsa bazı tarayıcılar indirmeyi iptal eder: bir tur sonra.
    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:csv');
    expect(document.querySelector('a[download]')).toBeNull();
  });
});
