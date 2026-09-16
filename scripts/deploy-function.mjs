// Edge Function'ı Management API ile yayınlar (Supabase CLI kurulu değil).
// Kullanım: npm run fn:deploy -- admin-staff [--no-verify-jwt]
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

// Hata yollarında process.exit() yerine process.exitCode kullanılır: açık fetch soketiyle
// ani çıkış Windows'ta libuv assertion'ı tetikliyor (çıkış kodu 127 oluyordu).
async function main() {
  const [name, flag] = process.argv.slice(2);
  if (!name) return fail('Fonksiyon adı gerekli');

  // Yanlış projeye yayın koruması: ref/token dolu olmalı ve proje adı beklenenle eşleşmeli.
  const ref = process.env.SUPABASE_PROJECT_REF;
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  const expectedProject = process.env.SUPABASE_PROJECT_NAME ?? 'ramos-siparis';
  if (!ref || !token) return fail('SUPABASE_PROJECT_REF ve SUPABASE_ACCESS_TOKEN gerekli (.env)');

  const projectRes = await fetch(`https://api.supabase.com/v1/projects/${ref}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!projectRes.ok) {
    await projectRes.text();
    return fail(`Proje doğrulanamadı (${projectRes.status})`);
  }
  const project = await projectRes.json();
  if (project.name !== expectedProject) {
    return fail(`Yanlış proje: ${project.name} (beklenen: ${expectedProject}) — yayın durduruldu`);
  }

  const dir = path.resolve('supabase/functions', name);
  const form = new FormData();
  form.append('metadata', JSON.stringify({ entrypoint_path: 'index.ts', name, verify_jwt: flag !== '--no-verify-jwt' }));
  for (const f of await readdir(dir)) {
    if (f.endsWith('.test.ts')) continue;
    form.append('file', new Blob([await readFile(path.join(dir, f))], { type: 'application/typescript' }), f);
  }
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${ref}/functions/deploy?slug=${name}`,
    { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
  console.log(res.status, await res.text());
  if (!res.ok) process.exitCode = 1;
}

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

await main();
