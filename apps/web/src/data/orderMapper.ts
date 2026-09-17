import type { ExtraCharge } from '@ramos/shared';

export interface RemovedIngredientView {
  id: string;
  name_de: string;
  name_tr: string | null;
}

export interface SelectedOptionView {
  group_id: string;
  group_name_de: string;
  group_name_tr: string | null;
  ticket_format: 'label_values' | 'values_only' | 'plus_each';
  group_sort: number;
  option_id: string;
  name_de: string;
  name_tr: string | null;
  price_delta_cents: number;
}

export type OrderItemStatus = 'active' | 'cancelled';
export type OrderStatus = 'in_kitchen' | 'ready' | 'served' | 'cancelled';
export type PrintJobType = 'order' | 'addition' | 'storno' | 'table_move' | 'reprint' | 'test';
export type PrintJobStatus = 'pending' | 'printing' | 'printed' | 'failed';

const PRINTABLE_TYPES: readonly PrintJobType[] = ['order', 'addition', 'reprint'];

export interface OrderItemRow {
  id: string;
  product_id: string;
  quantity: number;
  product_code: string | null;
  product_name: string;
  variant_name_de: string | null;
  variant_name_tr: string | null;
  removed_ingredients: RemovedIngredientView[];
  selected_options: SelectedOptionView[];
  /** Garsonun yazdığı serbest ekstra ücretler (0009); eski kayıtlarda boş dizi. */
  extra_charges: ExtraCharge[];
  note: string | null;
  status: OrderItemStatus;
  cancel_reason: string | null;
  sort: number;
  category_sort: number;
  is_beverage: boolean;
  unit_price_cents: number;
}

export type OrderItemView = OrderItemRow;

export interface PrintJobRow {
  id: string;
  type: PrintJobType;
  status: PrintJobStatus;
  last_error: string | null;
  created_at: string;
}

export interface OrderRow {
  id: string;
  order_no: number;
  round_no: number;
  status: OrderStatus;
  created_at: string;
  ready_at: string | null;
  note: string | null;
  waiter_id: string;
  table_sessions: { id: string; dining_tables: { name: string } };
  order_items: OrderItemRow[];
  print_jobs: PrintJobRow[];
}

export interface OrderPrintView {
  status: PrintJobStatus;
  last_error: string | null;
  job_id: string;
}

export interface OrderView {
  id: string;
  order_no: number;
  round_no: number;
  status: OrderStatus;
  created_at: string;
  ready_at: string | null;
  note: string | null;
  waiter_id: string;
  waiter_name: string;
  table_name: string;
  items: OrderItemView[];
  print: OrderPrintView | null;
}

const byItemOrder = (a: OrderItemRow, b: OrderItemRow) =>
  Number(a.is_beverage) - Number(b.is_beverage) || a.category_sort - b.category_sort || a.sort - b.sort;

/** Sipariş satırlarını (iç içe seçim) `OrderView`'a çevirir. İptal edilen kalemler korunur. */
export function mapOrders(rows: OrderRow[], staffNames: Map<string, string>): OrderView[] {
  return rows.map((row): OrderView => {
    const items = [...row.order_items].sort(byItemOrder);
    const printJob = row.print_jobs
      .filter((j) => PRINTABLE_TYPES.includes(j.type))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];

    return {
      id: row.id,
      order_no: row.order_no,
      round_no: row.round_no,
      status: row.status,
      created_at: row.created_at,
      ready_at: row.ready_at,
      note: row.note,
      waiter_id: row.waiter_id,
      waiter_name: staffNames.get(row.waiter_id) ?? '',
      table_name: row.table_sessions.dining_tables.name,
      items,
      print: printJob
        ? { status: printJob.status, last_error: printJob.last_error, job_id: printJob.id }
        : null,
    };
  });
}
