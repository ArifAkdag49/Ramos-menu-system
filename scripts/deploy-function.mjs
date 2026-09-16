// Edge Function'ı Management API ile yayınlar (Supabase CLI kurulu değil).
// Kullanım: npm run fn:deploy -- admin-staff [--no-verify-jwt]
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const [name, flag] = process.argv.slice(2);
if (!name) {
  console.error('Fonksiyon adı gerekli');
  process.exit(1);
}
const dir = path.resolve('supabase/functions', name);
const form = new FormData();
form.append('metadata', JSON.stringify({ entrypoint_path: 'index.ts', name, verify_jwt: flag !== '--no-verify-jwt' }));
for (const f of await readdir(dir)) {
  if (f.endsWith('.test.ts')) continue;
  form.append('file', new Blob([await readFile(path.join(dir, f))], { type: 'application/typescript' }), f);
}
const res = await fetch(
  `https://api.supabase.com/v1/projects/${process.env.SUPABASE_PROJECT_REF}/functions/deploy?slug=${name}`,
  { method: 'POST', headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}` }, body: form });
console.log(res.status, await res.text());
if (!res.ok) process.exit(1);
