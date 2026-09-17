// "Hazır" push hattının sunucu ayarları (Görev 26). Tekrar çalıştırılabilir (upsert).
// Kullanım: node --env-file=.env scripts/setup-push.mjs
//   1) Edge Function secret'ları (Management API): VAPID_PUBLIC_JWK, VAPID_PRIVATE_JWK, VAPID_SUBJECT, WEBHOOK_SECRET
//   2) Vault: notify_ready_url = ${SUPABASE_URL}/functions/v1/notify-ready, notify_ready_webhook_secret = WEBHOOK_SECRET
// Değerler .env'den okunur; terminale yalnız adlar ve durum kodları basılır (hata metinleri maskelenir).
// Önce: node scripts/gen-vapid.mjs · Sonra: npm run fn:deploy -- notify-ready --no-verify-jwt
import { runSql } from './db.mjs';

// Hata yollarında process.exit() yerine process.exitCode (Windows'ta açık fetch soketiyle ani çıkış sorunu).
async function main() {
  const env = (k) => process.env[k] ?? '';
  const required = ['SUPABASE_PROJECT_REF', 'SUPABASE_ACCESS_TOKEN', 'SUPABASE_URL',
    'VAPID_PUBLIC_JWK', 'VAPID_PRIVATE_JWK', 'VAPID_SUBJECT', 'WEBHOOK_SECRET'];
  const missing = required.filter((k) => !env(k));
  if (missing.length > 0) return fail(`.env eksik: ${missing.join(', ')} (önce: node scripts/gen-vapid.mjs)`);

  const secrets = ['VAPID_PUBLIC_JWK', 'VAPID_PRIVATE_JWK', 'WEBHOOK_SECRET', 'SUPABASE_ACCESS_TOKEN'].map(env);
  const redact = (text) => secrets.reduce((t, s) => (s ? t.split(s).join('***') : t), String(text));

  // Anahtar biçimi: aynı P-256 çiftinin public/private JWK'ları olmalı.
  let pub, priv;
  try {
    pub = JSON.parse(env('VAPID_PUBLIC_JWK'));
    priv = JSON.parse(env('VAPID_PRIVATE_JWK'));
  } catch {
    return fail('VAPID_PUBLIC_JWK / VAPID_PRIVATE_JWK geçerli JSON değil');
  }
  if (pub.kty !== 'EC' || pub.crv !== 'P-256' || !priv.d || pub.x !== priv.x || pub.y !== priv.y) {
    return fail('VAPID JWK çifti geçersiz ya da birbiriyle eşleşmiyor');
  }
  if (!/^(https:\/\/|mailto:)/.test(env('VAPID_SUBJECT'))) return fail('VAPID_SUBJECT https:// ya da mailto: ile başlamalı');
  if (Buffer.from(env('WEBHOOK_SECRET'), 'base64url').length < 32) return fail('WEBHOOK_SECRET en az 32 bayt olmalı');

  // Yanlış projeye yazma koruması (deploy-function.mjs ile aynı).
  const ref = env('SUPABASE_PROJECT_REF');
  const auth = { Authorization: `Bearer ${env('SUPABASE_ACCESS_TOKEN')}` };
  const expectedProject = process.env.SUPABASE_PROJECT_NAME ?? 'ramos-siparis';
  const projectRes = await fetch(`https://api.supabase.com/v1/projects/${ref}`, { headers: auth });
  if (!projectRes.ok) {
    await projectRes.text();
    return fail(`Proje doğrulanamadı (${projectRes.status})`);
  }
  const project = await projectRes.json();
  if (project.name !== expectedProject) return fail(`Yanlış proje: ${project.name} (beklenen: ${expectedProject})`);

  // 1) Edge Function secret'ları
  const names = ['VAPID_PUBLIC_JWK', 'VAPID_PRIVATE_JWK', 'VAPID_SUBJECT', 'WEBHOOK_SECRET'];
  const secretsRes = await fetch(`https://api.supabase.com/v1/projects/${ref}/secrets`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify(names.map((name) => ({ name, value: env(name) }))),
  });
  const secretsText = await secretsRes.text();
  if (!secretsRes.ok) return fail(`Function secret'ları yazılamadı (${secretsRes.status}): ${redact(secretsText)}`);
  console.log(`Function secret'ları yazıldı (${secretsRes.status}): ${names.join(', ')}`);

  // 2) Vault (trigger buradan okur)
  const vault = [
    ['notify_ready_url', `${env('SUPABASE_URL').replace(/\/+$/, '')}/functions/v1/notify-ready`,
      'notify-ready Edge Function adresi (Görev 26)'],
    ['notify_ready_webhook_secret', env('WEBHOOK_SECRET'), 'notify-ready x-webhook-secret (Görev 26)'],
  ];
  const lit = (s) => {
    if (s.includes('$setup$')) throw new Error('değer desteklenmeyen karakter dizisi içeriyor');
    return `$setup$${s}$setup$`;
  };
  for (const [name, value, description] of vault) {
    try {
      await runSql(`do $do$
        declare v_id uuid;
        begin
          select s.id into v_id from vault.secrets s where s.name = ${lit(name)};
          if v_id is null then
            perform vault.create_secret(${lit(value)}, ${lit(name)}, ${lit(description)});
          else
            perform vault.update_secret(v_id, ${lit(value)}, ${lit(name)}, ${lit(description)});
          end if;
        end $do$;`);
    } catch (e) {
      return fail(`Vault yazılamadı (${name}): ${redact(e instanceof Error ? e.message : e)}`);
    }
  }
  const rows = await runSql(`select name from vault.secrets
    where name in ('notify_ready_url', 'notify_ready_webhook_secret') order by name`);
  console.log(`Vault sırları hazır: ${rows.map((r) => r.name).join(', ')}`);
}

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

await main();
