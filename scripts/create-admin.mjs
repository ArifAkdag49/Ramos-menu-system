// İlk admin hesabını oluşturur (parola yalnız ortam değişkeninden gelir, ekrana ya da dosyaya yazılmaz).
// Kullanım: node --env-file=.env scripts/create-admin.mjs ramo "Ramo"
import { createClient } from '@supabase/supabase-js';
const [username, displayName] = process.argv.slice(2);
const password = process.env.ADMIN_PASSWORD;
if (!username || !displayName || !password || password.length < 10) {
  console.error('Kullanım: ADMIN_PASSWORD (≥10) + <username> "<Görünen ad>"');
  process.exit(1);
}
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const email = `${username.toLowerCase()}@${process.env.STAFF_EMAIL_DOMAIN}`;
const { data, error } = await s.auth.admin.createUser({ email, password, email_confirm: true });
if (error) {
  console.error(error.message);
  process.exit(1);
}
const { error: pErr } = await s.from('profiles').insert({
  id: data.user.id,
  username: username.toLowerCase(),
  display_name: displayName,
  role: 'admin',
  locale: 'tr',
});
if (pErr) {
  console.error(pErr.message);
  process.exit(1);
}
console.log(`Admin oluşturuldu: ${username}`);
