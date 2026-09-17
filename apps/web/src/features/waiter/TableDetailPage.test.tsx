import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import type { OrderItemView, OrderView } from '../../data/orderMapper';

const item = (over: Partial<OrderItemView> & { id: string; product_name: string }): OrderItemView => ({
  product_id: 'p', quantity: 1, product_code: null, variant_name_de: null, variant_name_tr: null,
  removed_ingredients: [], selected_options: [], extra_charges: [], note: null, status: 'active', cancel_reason: null,
  sort: 1, category_sort: 1, is_beverage: false, unit_price_cents: 750, ...over,
});

const order: OrderView = {
  id: 'o1', order_no: 47, round_no: 1, status: 'in_kitchen', created_at: '2026-09-15T17:42:00Z',
  ready_at: null, note: null, waiter_id: 'w1', waiter_name: 'Ahmet', table_name: 'Tisch 3',
  print: null,
  items: [
    // Kapı sahnesindeki sıra: iptal edilmiş kalem sunucudan İLK sırada geliyor.
    item({
      id: 'i-storno', product_name: '01 Linsensuppe', quantity: 3, status: 'cancelled',
      cancel_reason: 'Gast hat storniert',
    }),
    item({
      id: 'i-doener', product_name: '05 Drehspieß Sandwich', variant_name_de: 'Kalb', variant_name_tr: 'Dana',
      removed_ingredients: [{ name_de: 'Zwiebeln', name_tr: 'Soğan' }] as OrderItemView['removed_ingredients'],
    }),
  ],
};

vi.mock('../../data/orders', async () => ({
  useSessionOrders: () => [order],
  useMarkServed: () => ({ mutate: vi.fn() }),
  useReprint: () => ({ mutate: vi.fn() }),
  useRetryJob: () => ({ mutate: vi.fn() }),
  useCloseSession: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('../../data/tables', () => ({
  useTableOverview: () => [{ table_id: 't1', name: 'Tisch 3' }],
  useOpenSessionQuery: () => ({ data: { id: 's1', table_id: 't1' }, isLoading: false }),
}));
vi.mock('../../data/settings', () => ({ useSettings: () => undefined }));
vi.mock('./BillSheet', () => ({ BillSheet: () => null }));
vi.mock('./MoveTableSheet', () => ({ MoveTableSheet: () => null }));
vi.mock('./CancelItemSheet', () => ({ CancelItemSheet: () => null }));

import { TableDetailPage } from './TableDetailPage';

beforeAll(async () => {
  await i18n.changeLanguage('tr');
});

const show = () =>
  render(
    <MemoryRouter initialEntries={['/waiter/table/t1']}>
      <Routes>
        <Route path="/waiter/table/:tableId" element={<TableDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );

const itemRows = () => screen.getByTestId('order-items').querySelectorAll(':scope > li');

/**
 * Y8: kartın ilk satırı üstü çizili "3× 01 Linsensuppe" idi — hem garsonun hem aşçının gözü önce
 * yapılmayacak işe gidiyordu. Sıra görünümde değişir, veri sırası (fiş sırası) değişmez.
 */
describe('TableDetailPage — iptal edilmiş kalem sona iner (Y8)', () => {
  it('aktif kalem önce, iptal edilmiş kalem sonra çizilir', () => {
    show();
    const rows = [...itemRows()];
    expect(rows[0]?.textContent).toContain('Drehspieß Sandwich');
    expect(rows[1]?.textContent).toContain('Linsensuppe');
  });
});

/**
 * Y2: kalem kapsayıcısındaki `opacity-60` altındaki `--color-danger-ink`'i de söndürüyordu;
 * iptal sebebi 3,38:1'e düşüyordu (axe: serious). Üstü çizili + muted gövde kalır, sebep satırı
 * tam opaklıktadır.
 */
describe('TableDetailPage — iptal edilmiş kalem kontrastı (Y2)', () => {
  it('kalemde blok opaklık yok', () => {
    show();
    const storno = [...itemRows()].find((li) => li.textContent?.includes('Linsensuppe'));
    expect(storno?.className ?? '').not.toMatch(/opacity-/);
  });

  it('iptal sebebi tam opak danger-ink satırında durur', () => {
    show();
    const reason = screen.getByText(/İptal:/).closest('p') as HTMLElement;
    expect(reason.className).toContain('text-danger-ink');
    expect(reason.className).not.toMatch(/opacity-/);
  });

  it('iptal edilmiş kalemin adı üstü çizili ve muted', () => {
    show();
    const name = screen.getByText(/Linsensuppe/).closest('p') as HTMLElement;
    expect(name.className).toContain('line-through');
    expect(name.className).toContain('text-muted');
  });
});

/** Y7: ürün adı `product` rolünü (17 px) okur; kalem alt satırları 16 px'e çıkar. */
describe('TableDetailPage — yazı rolleri (Y7)', () => {
  it('ürün adı `text-product` tokenını kullanır', () => {
    show();
    expect((screen.getByText(/Drehspieß Sandwich/).closest('p') as HTMLElement).className).toContain('text-product');
  });

  it('ÇIKAR satırı 14 px değildir', () => {
    show();
    const without = screen.getByText(/ÇIKAR/);
    expect(without.className).not.toContain('text-sm');
  });
});

/** O3: "…" düğmesi yalnız ikondu; "Teslim edildi (içecek)" onun arkasındaydı (§10.3). */
describe('TableDetailPage — ikon her zaman yazıyla (O3)', () => {
  it('"Diğer işlemler" düğmesinin görünür yazısı var', () => {
    show();
    expect(screen.getByRole('button', { name: 'Diğer işlemler' })).toHaveTextContent('Diğer işlemler');
  });
});

/**
 * Devredilen (c): alt eylem çubuğu 3 eşit sütundu; DE'de hem "Tisch schließen" hem "Tisch wechseln"
 * sarılıyordu. 2+1 düzen: üstte Hesap · Taşı, altta tam genişlik "Masayı kapat".
 */
describe('TableDetailPage — alt eylem çubuğu 2+1 (devredilen c)', () => {
  it('"Masayı kapat" Hesap/Taşı ile aynı satırda değildir', () => {
    show();
    const bar = screen.getByRole('group', { name: 'Masa işlemleri' });
    const pair = within(bar).getByTestId('table-actions-pair');
    expect(within(pair).getByRole('button', { name: 'Hesap' })).toBeInTheDocument();
    expect(within(pair).getByRole('button', { name: 'Taşı' })).toBeInTheDocument();
    expect(within(pair).queryByRole('button', { name: 'Masayı kapat' })).not.toBeInTheDocument();
  });

  it('"Masayı kapat" tam genişlikte kendi satırındadır', () => {
    show();
    expect(screen.getByRole('button', { name: 'Masayı kapat' }).className).toContain('w-full');
  });
});
