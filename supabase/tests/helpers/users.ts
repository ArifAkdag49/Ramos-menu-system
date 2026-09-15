import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { sql } from './sql';

export const TEST_USERS = {
  admin: { username: 'test-admin', role: 'admin' },
  waiter: { username: 'test-waiter', role: 'waiter' },
  waiter2: { username: 'test-waiter2', role: 'waiter' },
  kitchen: { username: 'test-kitchen', role: 'kitchen' },
  printer: { username: 'test-printer', role: 'printer' },
  inactive: { username: 'test-inactive', role: 'waiter' },
} as const;
export type TestUserKey = keyof typeof TEST_USERS;

const env = (k: string): string => {
  const v = process.env[k];
  if (!v) throw new Error(`.env: ${k} eksik`);
  return v;
};
export const emailOf = (username: string) => `${username}@${env('STAFF_EMAIL_DOMAIN')}`;
const opts = { auth: { persistSession: false, autoRefreshToken: false } };

export const serviceClient = () => createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), opts);
export const anonClient = () => createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), opts);

export async function ensureTestUsers(): Promise<Record<TestUserKey, string>> {
  const admin = serviceClient();
  const password = env('TEST_USER_PASSWORD');
  const ids = {} as Record<TestUserKey, string>;
  for (const key of Object.keys(TEST_USERS) as TestUserKey[]) {
    const u = TEST_USERS[key];
    const email = emailOf(u.username);
    const found = await sql<{ id: string }>(`select id from auth.users where email = '${email}'`);
    let id = found[0]?.id;
    if (!id) {
      const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (error) throw error;
      id = data.user.id;
    } else {
      const { error } = await admin.auth.admin.updateUserById(id, { password, ban_duration: 'none' });
      if (error) throw error;
    }
    await sql(`
      insert into public.profiles (id, username, display_name, role, locale, is_active)
      values ('${id}', '${u.username}', '${u.username}', '${u.role}', 'tr', ${key !== 'inactive'})
      on conflict (id) do update set role = excluded.role, is_active = excluded.is_active`);
    ids[key] = id;
  }
  return ids;
}

export async function clientFor(key: TestUserKey): Promise<SupabaseClient> {
  const client = anonClient();
  const { error } = await client.auth.signInWithPassword({
    email: emailOf(TEST_USERS[key].username),
    password: env('TEST_USER_PASSWORD'),
  });
  if (error) throw error;
  return client;
}
