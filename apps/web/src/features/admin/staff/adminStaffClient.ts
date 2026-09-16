import { supabase } from '../../../lib/supabase';

export class AdminStaffError extends Error {
  readonly key: string;
  readonly status: number;

  constructor(key: string, status: number) {
    super(key);
    this.name = 'AdminStaffError';
    this.key = key;
    this.status = status;
  }
}

/**
 * `admin-staff` Edge Function çağrısı. Yetki kararı sunucudadır (aktif admin denetimi); istemci
 * yalnız oturum jetonunu taşır. Hata gövdesindeki `error` anahtarı `admin.staff.errors.*` ile çevrilir.
 */
export async function callAdminStaff(body: Record<string, unknown>): Promise<{ user_id?: string }> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new AdminStaffError('not_authorized', 401);

  let res: Response;
  try {
    res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-staff`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new AdminStaffError('network', 0);
  }

  const json = (await res.json().catch(() => ({}))) as { error?: string; user_id?: string };
  if (!res.ok) throw new AdminStaffError(json.error ?? 'unknown', res.status);
  return json;
}
