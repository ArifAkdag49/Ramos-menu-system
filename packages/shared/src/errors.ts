export const RPC_ERROR_KEYS = [
  'not_authorized', 'order_id_conflict', 'table_inactive', 'empty_order', 'too_many_items', 'note_too_long',
  'quantity_invalid', 'product_unavailable', 'product_sold_out', 'variant_required', 'variant_invalid',
  'option_invalid', 'option_group_min', 'option_group_max', 'option_exclusive_conflict', 'ingredient_invalid',
  'reason_required', 'reason_too_long', 'item_not_found', 'item_already_cancelled', 'session_closed',
  'order_not_in_kitchen', 'order_not_ready', 'undo_window_expired', 'order_not_open', 'open_orders_in_kitchen',
  'target_table_busy', 'product_not_found', 'session_not_found', 'locale_invalid', 'order_not_found',
  'job_not_failed', 'job_not_found', 'job_not_printing',
] as const;
export type RpcErrorKey = (typeof RPC_ERROR_KEYS)[number];
export const isRpcErrorKey = (s: string): s is RpcErrorKey => (RPC_ERROR_KEYS as readonly string[]).includes(s);
