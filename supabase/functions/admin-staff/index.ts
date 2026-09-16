// Personel yönetimi: yalnız aktif admin çağırabilir (verify_jwt + kod içi rol denetimi).
// Deno çalışma zamanı; kök ESLint yapılandırması supabase/functions/** klasörünü yoksayar.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { emailFor, guardDeactivate, validateCreate, validateSecret } from './logic.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'invalid_request' });

  const url = Deno.env.get('SUPABASE_URL')!;
  const service = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const domain = Deno.env.get('STAFF_EMAIL_DOMAIN') ?? 'staff.arxdigitalsevice.com';

  // Çağıran gerçekten aktif admin mi? (verify_jwt açık olsa da burada tekrar doğrulanır.)
  const token = req.headers.get('Authorization')?.replace('Bearer ', '') ?? '';
  const { data: auth } = await service.auth.getUser(token);
  const meId = auth.user?.id;
  const me = meId
    ? (await service.from('profiles').select('id, role, is_active').eq('id', meId).maybeSingle()).data
    : null;
  if (!me || me.role !== 'admin' || !me.is_active) return json(403, { error: 'not_authorized' });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'invalid_request' });
  }
  const audit = (action: string, entityId: string, details: Record<string, unknown> = {}) =>
    service.from('audit_log').insert({ actor_id: me.id, action, entity: 'profile', entity_id: entityId, details });

  if (body.action === 'create') {
    const v = validateCreate(body);
    if (!v.ok) return json(400, { error: v.error });
    const { data: taken } = await service.from('profiles').select('id').eq('username', v.value.username).maybeSingle();
    if (taken) return json(409, { error: 'username_taken' });
    const { data: created, error } = await service.auth.admin.createUser({
      email: emailFor(v.value.username, domain),
      password: v.value.pin,
      email_confirm: true,
    });
    if (error || !created.user) return json(409, { error: 'username_taken' });
    const { error: pErr } = await service.from('profiles').insert({
      id: created.user.id,
      username: v.value.username,
      display_name: v.value.display_name,
      role: v.value.role,
      locale: v.value.locale,
    });
    if (pErr) return json(400, { error: 'invalid_request' });
    await audit('staff_create', created.user.id, { username: v.value.username, role: v.value.role });
    return json(201, { user_id: created.user.id });
  }

  const userId = String(body.user_id ?? '');
  const { data: target } = await service.from('profiles').select('id, role, is_active').eq('id', userId).maybeSingle();
  if (!target || target.role === 'printer') return json(404, { error: 'user_not_found' });
  const { count: activeAdmins } = await service
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'admin')
    .eq('is_active', true);

  if (body.action === 'update') {
    const patch: Record<string, unknown> = {};
    if (typeof body.display_name === 'string') {
      const dn = body.display_name.trim();
      if (dn.length < 1 || dn.length > 60) return json(400, { error: 'display_name_invalid' });
      patch.display_name = dn;
    }
    if (body.locale !== undefined) {
      if (body.locale !== 'tr' && body.locale !== 'de') return json(400, { error: 'locale_invalid' });
      patch.locale = body.locale;
    }
    if (body.role !== undefined) {
      if (!['admin', 'waiter', 'kitchen'].includes(String(body.role))) return json(400, { error: 'role_invalid' });
      // Son aktif admin rolünü kaybedemez.
      if (target.role === 'admin' && body.role !== 'admin' && (activeAdmins ?? 0) <= 1) {
        return json(400, { error: 'last_admin' });
      }
      patch.role = body.role;
    }
    await service.from('profiles').update(patch).eq('id', userId);
    await audit('staff_update', userId, patch);
    return json(200, {});
  }

  if (body.action === 'reset_pin') {
    const err = validateSecret(target.role, String(body.pin ?? ''));
    if (err) return json(400, { error: err });
    const { error } = await service.auth.admin.updateUserById(userId, { password: String(body.pin) });
    if (error) return json(400, { error: 'invalid_request' });
    await audit('staff_reset_pin', userId);
    return json(200, {});
  }

  if (body.action === 'set_active') {
    const active = body.active === true;
    if (!active) {
      const guard = guardDeactivate({
        targetId: userId,
        meId: me.id,
        targetRole: target.role,
        activeAdmins: activeAdmins ?? 0,
      });
      if (guard) return json(400, { error: guard });
    }
    await service.auth.admin.updateUserById(userId, { ban_duration: active ? 'none' : '876000h' });
    await service
      .from('profiles')
      .update({ is_active: active, ...(active ? {} : { on_duty_since: null }) })
      .eq('id', userId);
    await audit(active ? 'staff_activate' : 'staff_deactivate', userId);
    return json(200, {});
  }

  return json(400, { error: 'invalid_request' });
});
