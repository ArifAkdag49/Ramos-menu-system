import type { SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from './helpers/sql';
import { anonClient, clientFor, ensureTestUsers } from './helpers/users';

// 0020 — mesai takibi. CANLI veritabanında koşar: yalnız adı `test-mesai-` ile başlayan personel oluşturulur
// ve sonda silinir. Basılı QR'a dokunulmaz (yenileme test edilmez); konum ayarı testte değiştirilir ve
// `afterAll`'da eski hâline döner. Fiş/sipariş oluşturulmaz.

type Settings = { location_check: boolean; lat: number | null; lng: number | null; radius_m: number };
type Scan = { action: 'in' | 'out' | 'ignored'; name: string; open: boolean; at: string; minutes?: number };

let admin: SupabaseClient;
let waiter: SupabaseClient;
const anon = anonClient();
let qr = '';
let saved: Settings;

const TEST_STAFF = `name like 'test-mesai-%'`;
const cleanup = async () => {
  await sql(`delete from public.timeclock_shifts where staff_id in (select id from public.timeclock_staff where ${TEST_STAFF});
             delete from public.timeclock_staff where ${TEST_STAFF};`);
};

async function rpc<T>(c: SupabaseClient, fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await c.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

/** Personel ekler, telefonunu eşleştirir; dönüş: {id, token}. */
async function pairedStaff(name: string) {
  const id = await rpc<string>(admin, 'timeclock_add_staff', { p_name: `test-mesai-${name}` });
  const { code } = await rpc<{ code: string }>(admin, 'timeclock_pair_code', { p_id: id });
  const { token } = await rpc<{ token: string }>(anon, 'timeclock_pair', { p_code: code });
  return { id, token };
}
const scan = (token: string, extra: Record<string, unknown> = {}) =>
  rpc<Scan>(anon, 'timeclock_scan', { p_qr: qr, p_device: token, ...extra });
/** Kişinin bütün mesailerini `interval` kadar geriye çeker (çift okutma penceresini geçmek için). */
const rewind = (id: string, interval: string) =>
  sql(`update public.timeclock_shifts set started_at = started_at - interval '${interval}',
              ended_at = ended_at - interval '${interval}' where staff_id = '${id}'`);

beforeAll(async () => {
  await ensureTestUsers();
  [admin, waiter] = await Promise.all([clientFor('admin'), clientFor('waiter')]);
  await cleanup();
  const [s] = await sql<Settings & { qr_token: string }>(
    `select qr_token, location_check, lat, lng, radius_m from public.timeclock_settings where id = 1`);
  qr = s!.qr_token;
  saved = s!;
  // Testler konum kontrolü KAPALI başlar.
  await sql(`update public.timeclock_settings set location_check = false where id = 1`);
});
afterAll(async () => {
  await cleanup();
  await sql(`update public.timeclock_settings set location_check = ${saved.location_check},
               lat = ${saved.lat ?? 'null'}, lng = ${saved.lng ?? 'null'}, radius_m = ${saved.radius_m} where id = 1`);
});

describe('mesai takibi (0020)', () => {
  it('yanlış QR reddedilir; doğru QR konum gerekip gerekmediğini söyler', async () => {
    await expect(rpc(anon, 'timeclock_config', { p_qr: 'x' })).rejects.toThrow('timeclock_bad_qr');
    expect(await rpc(anon, 'timeclock_config', { p_qr: qr })).toEqual({ location: false });
  });

  it('eşleştirme kodu tek kullanımlık; eşleşmemiş telefon okutamaz', async () => {
    const id = await rpc<string>(admin, 'timeclock_add_staff', { p_name: '  test-mesai-eşleş  ' });
    const { code } = await rpc<{ code: string }>(admin, 'timeclock_pair_code', { p_id: id });
    const r = await rpc<{ token: string; name: string }>(anon, 'timeclock_pair', { p_code: code });
    expect(r.name).toBe('test-mesai-eşleş');
    expect(r.token).toMatch(/^[0-9a-f]{64}$/);
    await expect(rpc(anon, 'timeclock_pair', { p_code: code })).rejects.toThrow('timeclock_bad_pair');
    await expect(scan('0'.repeat(64))).rejects.toThrow('timeclock_not_paired');
    await expect(rpc(anon, 'timeclock_scan', { p_qr: 'yanlis', p_device: r.token })).rejects.toThrow('timeclock_bad_qr');
  });

  it('giriş → 2 dk içinde tekrar sayılmaz → çıkış süresiyle', async () => {
    const { id, token } = await pairedStaff('akış');
    expect(await scan(token)).toMatchObject({ action: 'in', open: true, name: 'test-mesai-akış' });
    expect(await scan(token)).toMatchObject({ action: 'ignored', open: true });
    await rewind(id, '90 minutes');
    expect(await scan(token)).toMatchObject({ action: 'out', open: false, minutes: 90 });

    const ov = await rpc<{ staff: { id: string; paired: boolean; working: boolean }[] }>(admin, 'timeclock_overview');
    expect(ov.staff.find((s) => s.id === id)).toMatchObject({ paired: true, working: false });
  });

  it('16 saatten eski açık mesai kapanmaz: yeni okutma yeni mesai açar, eskisi "çıkış eksik"', async () => {
    const { id, token } = await pairedStaff('unuttu');
    await scan(token);
    await rewind(id, '17 hours');
    expect(await scan(token)).toMatchObject({ action: 'in' });

    const [m] = await sql<{ monday: string }>(
      // `rewind` iş gününü (work_date) değiştirmez: hafta bugünün haftasıdır.
      `select to_char(date_trunc('week', now() at time zone 'Europe/Berlin'), 'YYYY-MM-DD') as monday`);
    const week = await rpc<{ shifts: { staff_id: string; missing_end: boolean; end: string | null }[] }>(
      admin, 'timeclock_week', { p_monday: m!.monday });
    expect(week.shifts.filter((s) => s.staff_id === id && s.missing_end)).toHaveLength(1);
  });

  it('elle mesai: sebep ve geçerli aralık şart, düzeltme geçmişi tutulur', async () => {
    const id = await rpc<string>(admin, 'timeclock_add_staff', { p_name: 'test-mesai-elle' });
    const add = (start: string, end: string | null, reason: string) =>
      rpc<string>(admin, 'timeclock_add_shift', { p_staff_id: id, p_start: start, p_end: end, p_reason: reason });
    await expect(add('2026-11-02 09:00', '2026-11-02 08:00', 'x')).rejects.toThrow('timeclock_bad_range');
    await expect(add('2026-11-02 09:00', '2026-11-03 10:00', 'x')).rejects.toThrow('timeclock_bad_range');
    await expect(add('2026-11-02 09:00', null, '  ')).rejects.toThrow('reason_required');

    const shift = await add('2026-11-02 09:00', '2026-11-02 17:30', 'kart unutuldu');
    await rpc(admin, 'timeclock_edit_shift', {
      p_id: shift, p_start: '2026-11-02 10:00', p_end: '2026-11-02 17:30', p_reason: 'geç geldi',
    });
    const week = await rpc<{ days: string[]; shifts: Record<string, unknown>[] }>(
      admin, 'timeclock_week', { p_monday: '2026-11-02' });
    expect(week.days).toHaveLength(7);
    expect(week.shifts.find((s) => s.id === shift)).toMatchObject({
      start: '2026-11-02 10:00', end: '2026-11-02 17:30', minutes: 450, edited: true, manual: true,
    });
    const edits = await rpc<{ old_start: string | null; new_start: string; reason: string }[]>(
      admin, 'timeclock_shift_edits', { p_id: shift });
    expect(edits.map((e) => [e.old_start, e.new_start, e.reason])).toEqual([
      ['2026-11-02 09:00', '2026-11-02 10:00', 'geç geldi'],
      [null, '2026-11-02 09:00', 'kart unutuldu'],
    ]);
    await expect(rpc(admin, 'timeclock_week', { p_monday: '2026-11-03' })).rejects.toThrow('timeclock_bad_week');
  });

  it('telefonsuz personel: admin başlatır ve bitirir (çift okutma kuralı yok)', async () => {
    const id = await rpc<string>(admin, 'timeclock_add_staff', { p_name: 'test-mesai-telefonsuz' });
    expect(await rpc<Scan>(admin, 'timeclock_clock_manually', { p_id: id })).toMatchObject({ action: 'in' });
    expect(await rpc<Scan>(admin, 'timeclock_clock_manually', { p_id: id })).toMatchObject({ action: 'out' });
  });

  it('konum: uzaktan okutma engellenmez ama işaretlenir; konum saklanmaz', async () => {
    await rpc(admin, 'timeclock_save_settings', { p_location_check: true, p_lat: 52.52, p_lng: 13.405, p_radius_m: 150 });
    expect(await rpc(anon, 'timeclock_config', { p_qr: qr })).toEqual({ location: true });
    const { id, token } = await pairedStaff('konum');
    expect(await scan(token, { p_lat: 52.5205, p_lng: 13.4052, p_accuracy: 20 })).toMatchObject({ action: 'in' });
    await rewind(id, '3 hours');
    expect(await scan(token, { p_lat: 48.137, p_lng: 11.575 })).toMatchObject({ action: 'out' });
    const [row] = await sql<{ in_ok: boolean; out_ok: boolean }>(
      `select in_location_ok as in_ok, out_location_ok as out_ok from public.timeclock_shifts where staff_id = '${id}'`);
    expect(row).toEqual({ in_ok: true, out_ok: false });
    await expect(rpc(admin, 'timeclock_save_settings', { p_lat: 52.5 })).rejects.toThrow('timeclock_bad_location');
    await sql(`update public.timeclock_settings set location_check = false where id = 1`);
  });

  it('pasife alınan personelin telefonu çalışmaz; garson ve anon yönetim fonksiyonlarını çağıramaz', async () => {
    const { id, token } = await pairedStaff('ayrıldı');
    await rpc(admin, 'timeclock_update_staff', { p_id: id, p_active: false });
    await expect(scan(token)).rejects.toThrow('timeclock_not_paired');
    await expect(rpc(admin, 'timeclock_pair_code', { p_id: id })).rejects.toThrow('timeclock_not_found');

    await expect(rpc(waiter, 'timeclock_overview')).rejects.toThrow('not_authorized');
    await expect(rpc(waiter, 'timeclock_add_staff', { p_name: 'test-mesai-x' })).rejects.toThrow('not_authorized');
    await expect(rpc(waiter, 'timeclock_rotate_qr')).rejects.toThrow('not_authorized');
    await expect(rpc(anon, 'timeclock_overview')).rejects.toThrow();
  });
});
