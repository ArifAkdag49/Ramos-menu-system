import { describe, expect, it } from 'vitest';
import { emailFor, guardDeactivate, validateCreate, validateSecret } from './logic';

describe('admin-staff mantığı', () => {
  it('PIN kuralları role göre', () => {
    expect(validateSecret('waiter', '123456')).toBeNull();
    expect(validateSecret('waiter', '12345')).toBe('pin_invalid');
    expect(validateSecret('kitchen', '12ab56')).toBe('pin_invalid');
    expect(validateSecret('admin', 'kısa')).toBe('password_too_short');
    expect(validateSecret('admin', 'uzun-parola-10')).toBeNull();
  });
  it('create doğrulaması: kullanıcı adı, rol, dil', () => {
    const ok = validateCreate({ username: 'Ahmet', display_name: 'Ahmet', role: 'waiter', pin: '482915', locale: 'tr' });
    expect(ok).toEqual({ ok: true, value: { username: 'ahmet', display_name: 'Ahmet', role: 'waiter', pin: '482915', locale: 'tr' } });
    expect(validateCreate({ username: 'a b', display_name: 'x', role: 'waiter', pin: '482915', locale: 'tr' }))
      .toEqual({ ok: false, error: 'username_invalid' });
    expect(validateCreate({ username: 'drucker', display_name: 'x', role: 'printer', pin: '482915', locale: 'tr' }))
      .toEqual({ ok: false, error: 'role_invalid' });
    expect(validateCreate({ username: 'mehmet', display_name: 'M', role: 'waiter', pin: '482915', locale: 'en' }))
      .toEqual({ ok: false, error: 'locale_invalid' });
  });
  it('e-posta eşlemesi', () => {
    expect(emailFor('ahmet', 'staff.arxdigitalsevice.com')).toBe('ahmet@staff.arxdigitalsevice.com');
  });
  it('pasifleştirme korumaları', () => {
    expect(guardDeactivate({ targetId: 'a', meId: 'a', targetRole: 'admin', activeAdmins: 2 })).toBe('cannot_deactivate_self');
    expect(guardDeactivate({ targetId: 'b', meId: 'a', targetRole: 'admin', activeAdmins: 1 })).toBe('last_admin');
    expect(guardDeactivate({ targetId: 'b', meId: 'a', targetRole: 'waiter', activeAdmins: 1 })).toBeNull();
  });
});
