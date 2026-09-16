// admin-staff — saf doğrulama ve koruma mantığı.
// Deno'ya bağımlılığı yoktur; Node + Vitest ile test edilir (npm run fn:test).
export type StaffRole = 'admin' | 'waiter' | 'kitchen';
export interface CreateInput {
  username: string;
  display_name: string;
  role: StaffRole;
  pin: string;
  locale: 'tr' | 'de';
}
type Result<T> = { ok: true; value: T } | { ok: false; error: string };

const USERNAME = /^[a-z0-9._-]{3,32}$/;
const ROLES: readonly string[] = ['admin', 'waiter', 'kitchen'];

/** Admin parolası ≥ 10 karakter; garson/mutfak PIN'i 6–12 hane. */
export function validateSecret(role: string, pin: string): string | null {
  if (role === 'admin') return typeof pin === 'string' && pin.length >= 10 ? null : 'password_too_short';
  return /^[0-9]{6,12}$/.test(pin ?? '') ? null : 'pin_invalid';
}

export function validateCreate(raw: Record<string, unknown>): Result<CreateInput> {
  const username = String(raw.username ?? '').trim().toLowerCase();
  const display_name = String(raw.display_name ?? '').trim();
  const role = String(raw.role ?? '');
  const pin = String(raw.pin ?? '');
  const locale = String(raw.locale ?? 'tr');
  if (!USERNAME.test(username)) return { ok: false, error: 'username_invalid' };
  if (display_name.length < 1 || display_name.length > 60) return { ok: false, error: 'display_name_invalid' };
  if (!ROLES.includes(role)) return { ok: false, error: 'role_invalid' };
  if (locale !== 'tr' && locale !== 'de') return { ok: false, error: 'locale_invalid' };
  const secretError = validateSecret(role, pin);
  if (secretError) return { ok: false, error: secretError };
  return { ok: true, value: { username, display_name, role: role as StaffRole, pin, locale } };
}

export const emailFor = (username: string, domain: string): string => `${username}@${domain}`;

/** Admin kendini pasifleştiremez; son aktif admin pasifleştirilemez. */
export function guardDeactivate(a: {
  targetId: string;
  meId: string;
  targetRole: string;
  activeAdmins: number;
}): string | null {
  if (a.targetId === a.meId) return 'cannot_deactivate_self';
  if (a.targetRole === 'admin' && a.activeAdmins <= 1) return 'last_admin';
  return null;
}
