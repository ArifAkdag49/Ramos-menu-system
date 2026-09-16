// Yazdırma ajanının kullandığı `printer` rollü hesabı hazırlar ve apps/print-agent/.env dosyasını yazar.
// Parola burada üretilir; ekrana ASLA yazılmaz (yalnız .env dosyasına gider, dosya git dışıdır).
// Kullanım: node --env-file=.env scripts/create-printer-user.mjs
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const email = `drucker@${process.env.STAFF_EMAIL_DOMAIN}`;
const password = randomBytes(24).toString('base64url');
const { data: list } = await s.auth.admin.listUsers({ perPage: 1000 });
let user = list.users.find((u) => u.email === email);
if (user) await s.auth.admin.updateUserById(user.id, { password });
else user = (await s.auth.admin.createUser({ email, password, email_confirm: true })).data.user;
await s
  .from('profiles')
  .upsert({ id: user.id, username: 'drucker', display_name: 'Drucker', role: 'printer', locale: 'de' });
mkdirSync('apps/print-agent', { recursive: true });
writeFileSync(
  'apps/print-agent/.env',
  [
    `SUPABASE_URL=${process.env.SUPABASE_URL}`,
    `SUPABASE_ANON_KEY=${process.env.SUPABASE_ANON_KEY}`,
    `AGENT_EMAIL=${email}`,
    `AGENT_PASSWORD=${password}`,
    'AGENT_ID=ramos-pc-1',
    'LOG_DIR=',
  ].join('\n') + '\n',
  'utf8',
);
console.log('Yazıcı hesabı hazır; apps/print-agent/.env yazıldı (commit ETME).');
