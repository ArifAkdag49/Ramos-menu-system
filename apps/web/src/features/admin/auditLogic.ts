import { formatEuro, formatOrderNo, localTableName, type Locale } from '@ramos/shared';

/**
 * Denetim kaydının iki kaynağı var ve ikisi de `admin.audit.*` ile çevrilir:
 * - RPC'ler ve `admin-staff` fonksiyonu kendi eylem adını yazar (`order_submit`, `staff_update` …).
 * - `internal.audit_row()` tetikleyicisi satır işlemini yazar (`insert/update/delete`), varlık tablo adıdır.
 *
 * Anahtarlar sabit haritadadır (şablon dize değil): i18next tip artırımı her anahtarı derlemede
 * denetler, yeni bir eylem eklenip çeviri unutulursa `tsc` yakalar.
 */
const ACTION_KEY = {
  session_open: 'admin.audit.action.session_open',
  session_close: 'admin.audit.action.session_close',
  session_move: 'admin.audit.action.session_move',
  order_submit: 'admin.audit.action.order_submit',
  order_ready: 'admin.audit.action.order_ready',
  order_ready_undo: 'admin.audit.action.order_ready_undo',
  order_served: 'admin.audit.action.order_served',
  order_reprint: 'admin.audit.action.order_reprint',
  item_cancel: 'admin.audit.action.item_cancel',
  product_sold_out: 'admin.audit.action.product_sold_out',
  product_available: 'admin.audit.action.product_available',
  duty_on: 'admin.audit.action.duty_on',
  duty_off: 'admin.audit.action.duty_off',
  staff_create: 'admin.audit.action.staff_create',
  staff_update: 'admin.audit.action.staff_update',
  staff_reset_pin: 'admin.audit.action.staff_reset_pin',
  staff_activate: 'admin.audit.action.staff_activate',
  staff_deactivate: 'admin.audit.action.staff_deactivate',
  insert: 'admin.audit.action.insert',
  update: 'admin.audit.action.update',
  delete: 'admin.audit.action.delete',
} as const;

const ENTITY_KEY = {
  categories: 'admin.audit.entity.categories',
  products: 'admin.audit.entity.products',
  product_variants: 'admin.audit.entity.product_variants',
  ingredients: 'admin.audit.entity.ingredients',
  product_ingredients: 'admin.audit.entity.product_ingredients',
  option_groups: 'admin.audit.entity.option_groups',
  options: 'admin.audit.entity.options',
  product_option_groups: 'admin.audit.entity.product_option_groups',
  dining_tables: 'admin.audit.entity.dining_tables',
  settings: 'admin.audit.entity.settings',
  table_session: 'admin.audit.entity.table_session',
  order: 'admin.audit.entity.order',
  order_item: 'admin.audit.entity.order_item',
  product: 'admin.audit.entity.product',
  profile: 'admin.audit.entity.profile',
} as const;

export type AuditAction = keyof typeof ACTION_KEY;
export type AuditEntity = keyof typeof ENTITY_KEY;
export type AuditActionKey = (typeof ACTION_KEY)[AuditAction];
export type AuditEntityKey = (typeof ENTITY_KEY)[AuditEntity];

/** Filtre açılır listeleri için bilinen değerler (sıra = ekrandaki sıra). */
export const AUDIT_ACTIONS = Object.keys(ACTION_KEY) as AuditAction[];
export const AUDIT_ENTITIES = Object.keys(ENTITY_KEY) as AuditEntity[];

const ROW_ACTIONS: readonly string[] = ['insert', 'update', 'delete'];

export const isRowAction = (action: string): boolean => ROW_ACTIONS.includes(action);

export function auditLabelKeys(e: { action: string; entity: string }): {
  action: AuditActionKey | null;
  entity: AuditEntityKey | null;
} {
  return {
    action: ACTION_KEY[e.action as AuditAction] ?? null,
    entity: ENTITY_KEY[e.entity as AuditEntity] ?? null,
  };
}

export interface AuditSummaryContext {
  locale: Locale;
  /** Personel kimliği → görünen ad (`staff_names`). */
  staffName: (id: string) => string | undefined;
  /** `waiter` → "Garson". */
  roleName: (role: string) => string;
  /** Tablo sütunu → okunur alan adı; bilinmeyen sütun olduğu gibi döner. */
  fieldName: (field: string) => string;
}

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Tetikleyicinin satır görüntüsünde tanıtıcı ad hangi sütunda? */
const rowLabel = (row: Rec): string | null =>
  str(row.name) ?? str(row.name_de) ?? str(row.admin_label) ?? str(row.display_name);

/** Değişikliği anlatmayan sütunlar (her güncellemede kendiliğinden değişir). */
const NOISE = new Set(['updated_at', 'updated_by']);

const MAX_FIELDS = 3;

/**
 * Satırın tek bakışta okunan kısa özeti. Ayrıntının tamamı satır açılınca JSON olarak görünür;
 * bu metin yalnız "hangi masa / hangi sipariş / kim" sorusuna cevap verir. Ayrıntısı boş ya da
 * beklenmeyen biçimde olan kayıt boş dize verir — ekran asla çökmez.
 */
export function auditSummary(
  e: { action: string; entity: string; entity_id: string | null; details: unknown },
  ctx: AuditSummaryContext,
): string {
  const d = isRec(e.details) ? e.details : {};
  const table = (v: unknown) => {
    const name = str(v);
    return name ? localTableName(name, ctx.locale) : null;
  };
  const orderNo = (v: unknown) => {
    const n = num(v);
    return n === null ? null : formatOrderNo(n);
  };
  const join = (parts: (string | null | undefined)[]) =>
    [...new Set(parts.filter((p): p is string => Boolean(p)))].join(' · ');
  const target = e.entity === 'profile' && e.entity_id ? ctx.staffName(e.entity_id) : undefined;

  switch (e.action) {
    case 'order_submit': {
      const total = num(d.total_cents);
      return join([orderNo(d.order_no), table(d.table), total === null ? null : formatEuro(total)]);
    }
    case 'order_ready':
    case 'order_ready_undo':
    case 'order_served':
      return join([orderNo(d.order_no)]);
    case 'item_cancel': {
      const qty = num(d.qty);
      const product = str(d.product);
      return join([orderNo(d.order_no), product ? `${qty ?? 1}× ${product}` : null, str(d.reason)]);
    }
    case 'session_open':
      return join([table(d.table)]);
    case 'session_move': {
      const from = table(d.from);
      const to = table(d.to);
      return from && to ? `${from} → ${to}` : '';
    }
    case 'staff_create': {
      const username = str(d.username);
      const role = str(d.role);
      return join([target, username ? `@${username}` : null, role ? ctx.roleName(role) : null]);
    }
    case 'staff_update': {
      const role = str(d.role);
      const locale = str(d.locale);
      return join([
        target,
        str(d.display_name),
        role ? ctx.roleName(role) : null,
        locale?.toUpperCase(),
      ]);
    }
  }

  if (isRowAction(e.action)) {
    const next = isRec(d.new) ? d.new : null;
    const prev = isRec(d.old) ? d.old : null;
    const row = next ?? prev;
    if (!row) return '';
    const label = rowLabel(row);
    const name = label && e.entity === 'dining_tables' ? localTableName(label, ctx.locale) : label;
    if (e.action !== 'update' || !next || !prev) return join([name]);
    const changed = Object.keys(next).filter(
      (k) => !NOISE.has(k) && JSON.stringify(next[k]) !== JSON.stringify(prev[k]),
    );
    const fields = changed.slice(0, MAX_FIELDS).map(ctx.fieldName).join(', ');
    const more = changed.length > MAX_FIELDS ? ` +${changed.length - MAX_FIELDS}` : '';
    return join([name, fields ? `${fields}${more}` : null]);
  }

  // Ayrıntısız eylemler (mesai, pasifleştirme, PIN sıfırlama …): hedef kişi varsa onun adı.
  return join([target]);
}
