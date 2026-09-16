// Müşteri sunumu için demo hesaplarını hazırlar: `demo-garson` (waiter) ve `demo-mutfak` (kitchen).
// Parola YALNIZ ortam değişkeninden (kök .env → DEMO_PASSWORD) gelir; ekrana, log'a ya da git'e
// asla yazılmaz — `create-admin.mjs` ile aynı sözleşme.
//
// Kural (spec §12 / admin-staff `validateSecret`): garson-mutfak sırrı 6–12 hanedir. Betik bunu
// burada da doğrular, böylece demo hesapları admin panelindeki "PIN sıfırla" akışıyla da yönetilebilir.
//
// Betik yinelenebilir: hesap varsa parolası ve profili güncellenir, yoksa oluşturulur.
// Kullanım: node --env-file=.env scripts/create-demo-users.mjs
import { createClient } from '@supabase/supabase-js';

const password = process.env.DEMO_PASSWORD ?? '';
if (!/^[0-9]{6,12}$/.test(password)) {
  console.error('.env: DEMO_PASSWORD 6–12 haneli sayısal bir değer olmalı (spec §12 PIN kuralı).');
  process.exit(1);
}
const domain = process.env.STAFF_EMAIL_DOMAIN;
if (!domain) {
  console.error('.env: STAFF_EMAIL_DOMAIN eksik.');
  process.exit(1);
}

const DEMO_USERS = [
  { username: 'demo-garson', display_name: 'Demo Garson', role: 'waiter' },
  { username: 'demo-mutfak', display_name: 'Demo Mutfak', role: 'kitchen' },
];

const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { data: list, error: listError } = await s.auth.admin.listUsers({ perPage: 1000 });
if (listError) {
  console.error(listError.message);
  process.exit(1);
}

for (const u of DEMO_USERS) {
  const email = `${u.username}@${domain}`;
  let user = list.users.find((x) => x.email === email);
  if (user) {
    // `ban_duration: 'none'` — hesap daha önce admin panelinden pasifleştirilmişse geri açılır.
    const { error } = await s.auth.admin.updateUserById(user.id, { password, ban_duration: 'none' });
    if (error) {
      console.error(`${u.username}: ${error.message}`);
      process.exit(1);
    }
  } else {
    const { data, error } = await s.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) {
      console.error(`${u.username}: ${error.message}`);
      process.exit(1);
    }
    user = data.user;
  }
  const { error: pErr } = await s.from('profiles').upsert({
    id: user.id,
    username: u.username,
    display_name: u.display_name,
    role: u.role,
    locale: 'tr',
    is_active: true,
  });
  if (pErr) {
    console.error(`${u.username}: ${pErr.message}`);
    process.exit(1);
  }
  console.log(`Demo hesabı hazır: ${u.username} (${u.role})`);
}
