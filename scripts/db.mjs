// Supabase Management API ile SQL çalıştırır ve migration uygular.
// Kullanım: node --env-file=.env scripts/db.mjs apply
//           node --env-file=.env scripts/db.mjs sql "select 1"
//           node --env-file=.env scripts/db.mjs sql --file supabase/seed/seed.sql
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const ref = process.env.SUPABASE_PROJECT_REF;
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!ref || !token) {
  console.error('SUPABASE_PROJECT_REF ve SUPABASE_ACCESS_TOKEN .env içinde tanımlı olmalı');
  process.exit(1);
}

export async function runSql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`SQL hatası (${res.status}): ${text}`);
  return text ? JSON.parse(text) : [];
}

async function apply() {
  await runSql(`
    create schema if not exists internal;
    revoke all on schema internal from public, anon, authenticated;
    create table if not exists internal.migrations (
      name text primary key,
      applied_at timestamptz not null default now()
    );`);
  const done = new Set((await runSql('select name from internal.migrations')).map((r) => r.name));
  const dir = path.resolve('supabase/migrations');
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    if (done.has(file)) continue;
    const body = await readFile(path.join(dir, file), 'utf8');
    process.stdout.write(`→ ${file} … `);
    await runSql(`begin;\n${body}\ninsert into internal.migrations(name) values ('${file}');\ncommit;`);
    console.log('ok');
  }
  console.log('Migration durumu güncel.');
}

const [cmd, ...args] = process.argv.slice(2);
if (cmd === 'apply') {
  await apply();
} else if (cmd === 'sql') {
  const query = args[0] === '--file' ? await readFile(args[1], 'utf8') : args.join(' ');
  console.log(JSON.stringify(await runSql(query), null, 2));
} else {
  console.error('Komut: apply | sql "<sorgu>" | sql --file <yol>');
  process.exit(1);
}
