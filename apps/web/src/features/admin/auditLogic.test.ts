import { formatEuro } from '@ramos/shared';
import { describe, expect, it } from 'vitest';
import { auditLabelKeys, auditSummary, type AuditSummaryContext } from './auditLogic';

const ctx = (over: Partial<AuditSummaryContext> = {}): AuditSummaryContext => ({
  locale: 'tr',
  staffName: (id) => ({ u1: 'Ayşe', u2: 'Mehmet' })[id],
  roleName: (role) => ({ waiter: 'Garson', kitchen: 'Mutfak', admin: 'Yönetici' })[role] ?? role,
  fieldName: (field) => ({ name: 'Ad', sort: 'Sıra', base_price_cents: 'Fiyat' })[field] ?? field,
  ...over,
});

const entry = (
  action: string,
  entity: string,
  details: unknown,
  entity_id: string | null = 'x',
) => ({
  action,
  entity,
  entity_id,
  details,
});

describe('auditLabelKeys', () => {
  it('RPC eylemleri kendi anahtarını alır', () =>
    expect(auditLabelKeys(entry('order_submit', 'order', {}))).toEqual({
      action: 'admin.audit.action.order_submit',
      entity: 'admin.audit.entity.order',
    }));

  it('satır tetikleyicisi (insert/update/delete) varlık adıyla birlikte', () =>
    expect(auditLabelKeys(entry('update', 'dining_tables', {}))).toEqual({
      action: 'admin.audit.action.update',
      entity: 'admin.audit.entity.dining_tables',
    }));

  it('personel eylemleri (admin-staff fonksiyonu) tanınır', () =>
    expect(auditLabelKeys(entry('staff_reset_pin', 'profile', {}))).toEqual({
      action: 'admin.audit.action.staff_reset_pin',
      entity: 'admin.audit.entity.profile',
    }));

  it('bilinmeyen eylem ve varlık null — ekran ham değeri gösterir', () =>
    expect(auditLabelKeys(entry('gizemli', 'bilinmeyen', {}))).toEqual({
      action: null,
      entity: null,
    }));
});

describe('auditSummary', () => {
  // formatEuro sayı ile € arasına bölünmez boşluk koyar; beklenti aynı biçimlendiriciden gelir.
  it('sipariş gönderimi: numara, masa (TR arayüzde Masa), tutar', () =>
    expect(
      auditSummary(
        entry('order_submit', 'order', {
          table: 'Tisch 4',
          order_no: 47,
          round: 2,
          total_cents: 1850,
        }),
        ctx(),
      ),
    ).toBe(`#047 · Masa 4 · ${formatEuro(1850)}`));

  it('DE arayüzde masa adı olduğu gibi', () =>
    expect(
      auditSummary(
        entry('session_open', 'table_session', { table: 'Tisch 4' }),
        ctx({ locale: 'de' }),
      ),
    ).toBe('Tisch 4'));

  it('kalem iptali: numara, adet × ürün, sebep', () =>
    expect(
      auditSummary(
        entry('item_cancel', 'order_item', {
          order_no: 7,
          product: 'Cola 0,33 l',
          qty: 2,
          reason: 'Falsch',
        }),
        ctx(),
      ),
    ).toBe('#007 · 2× Cola 0,33 l · Falsch'));

  it('masa taşıma: nereden → nereye', () =>
    expect(
      auditSummary(
        entry('session_move', 'table_session', { from: 'Tisch 1', to: 'Tisch 2' }),
        ctx(),
      ),
    ).toBe('Masa 1 → Masa 2'));

  it('hazır / teslim: yalnız sipariş numarası', () =>
    expect(auditSummary(entry('order_ready', 'order', { order_no: 12 }), ctx())).toBe('#012'));

  it('personel ekleme: kullanıcı adı ve rol', () =>
    expect(
      auditSummary(
        entry('staff_create', 'profile', { username: 'ayse', role: 'waiter' }, 'u1'),
        ctx(),
      ),
    ).toBe('Ayşe · @ayse · Garson'));

  it('personel güncelleme: hedef kişi ve yeni değerler, aynı ad tekrarlanmaz', () =>
    expect(
      auditSummary(
        entry(
          'staff_update',
          'profile',
          { display_name: 'Ayşe', role: 'kitchen', locale: 'de' },
          'u1',
        ),
        ctx(),
      ),
    ).toBe('Ayşe · Mutfak · DE'));

  it('pasifleştirme: hedef kişinin adı', () =>
    expect(auditSummary(entry('staff_deactivate', 'profile', {}, 'u2'), ctx())).toBe('Mehmet'));

  it('satır ekleme: kaydın adı (masa adı yerelleşir)', () =>
    expect(
      auditSummary(
        entry('insert', 'dining_tables', { new: { id: 't', name: 'Tisch 13', sort: 130 } }),
        ctx(),
      ),
    ).toBe('Masa 13'));

  it('satır güncelleme: ad ve değişen alanlar; updated_at sayılmaz', () =>
    expect(
      auditSummary(
        entry('update', 'products', {
          old: { name: 'Döner', base_price_cents: 800, sort: 10, updated_at: '1' },
          new: { name: 'Döner', base_price_cents: 850, sort: 20, updated_at: '2' },
        }),
        ctx(),
      ),
    ).toBe('Döner · Fiyat, Sıra'));

  it('adı olmayan satır (name_de kullanılır)', () =>
    expect(
      auditSummary(entry('delete', 'product_variants', { old: { name_de: 'Kalb' } }), ctx()),
    ).toBe('Kalb'));

  it('ayrıntısı boş ya da bozuk kayıt boş dize verir', () => {
    expect(auditSummary(entry('order_reprint', 'order', {}), ctx())).toBe('');
    expect(auditSummary(entry('order_submit', 'order', null), ctx())).toBe('');
    expect(auditSummary(entry('update', 'settings', 'bozuk'), ctx())).toBe('');
  });
});
