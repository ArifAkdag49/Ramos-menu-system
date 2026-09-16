import { beforeAll, describe, expect, it } from 'vitest';
import { anonClient, clientFor, emailOf, ensureTestUsers } from './helpers/users';

let ids: Awaited<ReturnType<typeof ensureTestUsers>>;
const call = async (who: 'admin' | 'waiter', body: unknown) => {
  const c = await clientFor(who);
  const { data: { session } } = await c.auth.getSession();
  const res = await fetch(`${process.env.SUPABASE_URL}/functions/v1/admin-staff`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${session!.access_token}`, apikey: process.env.SUPABASE_ANON_KEY!,
               'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
};

beforeAll(async () => { ids = await ensureTestUsers(); });

describe('admin-staff', () => {
  it('garson çağıramaz', async () => {
    expect(await call('waiter', { action: 'reset_pin', user_id: ids.waiter2, pin: '123456' }))
      .toEqual({ status: 403, body: { error: 'not_authorized' } });
  });
  it('geçersiz PIN reddedilir', async () => {
    expect((await call('admin', { action: 'create', username: 'test-x', display_name: 'X', role: 'waiter',
      pin: '12', locale: 'tr' })).body).toEqual({ error: 'pin_invalid' });
  });
  it('PIN sıfırlanır, pasifleştirilen kullanıcı giriş yapamaz, geri açılır', async () => {
    expect((await call('admin', { action: 'reset_pin', user_id: ids.waiter2, pin: '654321' })).status).toBe(200);
    const c = anonClient();
    expect((await c.auth.signInWithPassword({ email: emailOf('test-waiter2'), password: '654321' })).error).toBeNull();
    expect((await call('admin', { action: 'set_active', user_id: ids.waiter2, active: false })).status).toBe(200);
    expect((await anonClient().auth.signInWithPassword({ email: emailOf('test-waiter2'), password: '654321' })).error)
      .not.toBeNull();
    expect((await call('admin', { action: 'set_active', user_id: ids.waiter2, active: true })).status).toBe(200);
    await ensureTestUsers(); // parolayı TEST_USER_PASSWORD'e geri çeker
  });
  it('admin kendini pasifleştiremez', async () => {
    expect((await call('admin', { action: 'set_active', user_id: ids.admin, active: false })).body)
      .toEqual({ error: 'cannot_deactivate_self' });
  });
});
