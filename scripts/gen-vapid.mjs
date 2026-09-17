// Web Push (VAPID) anahtar çifti ve notify-ready webhook sırrı üretir, ortam dosyalarına yazar.
// Kullanım: node scripts/gen-vapid.mjs [--force] [--subject https://alan.adi] [--stdout]
//
// Varsayılan: değerler DOĞRUDAN dosyalara yazılır, terminale yalnız anahtar adları basılır.
//   kök .env              → VAPID_PUBLIC_JWK, VAPID_PRIVATE_JWK, VAPID_SUBJECT (yoksa), WEBHOOK_SECRET
//   apps/web/.env         → VITE_VAPID_PUBLIC_KEY (tarayıcının applicationServerKey'i, raw base64url)
//   apps/web/.env.production → VITE_VAPID_PUBLIC_KEY
// Anahtarlar zaten varsa durur: VAPID anahtarını değiştirmek tüm telefon aboneliklerini geçersiz kılar.
// Bilerek yenilemek için --force. --stdout değerleri dosyaya yazmak yerine ekrana basar (sohbete yapıştırma!).
// Sonraki adım: node --env-file=.env scripts/setup-push.mjs (function secret'ları + Vault).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const force = args.includes('--force');
const toStdout = args.includes('--stdout');
const subjectArg = args.includes('--subject') ? args[args.indexOf('--subject') + 1] : undefined;
const DEFAULT_SUBJECT = 'https://ramos.arxdigitalsevice.com';

const root = path.resolve(import.meta.dirname, '..');
const FILES = {
  root: path.join(root, '.env'),
  web: path.join(root, 'apps/web/.env'),
  webProd: path.join(root, 'apps/web/.env.production'),
};

const { subtle } = globalThis.crypto;
const kp = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const publicRaw = Buffer.from(await subtle.exportKey('raw', kp.publicKey)).toString('base64url');
const publicJwk = JSON.stringify(await subtle.exportKey('jwk', kp.publicKey));
const privateJwk = JSON.stringify(await subtle.exportKey('jwk', kp.privateKey));
const webhookSecret = Buffer.from(globalThis.crypto.getRandomValues(new Uint8Array(32))).toString('base64url');

if (toStdout) {
  console.log(`VITE_VAPID_PUBLIC_KEY=${publicRaw}`);
  console.log(`VAPID_PUBLIC_JWK='${publicJwk}'`);
  console.log(`VAPID_PRIVATE_JWK='${privateJwk}'`);
  console.log(`WEBHOOK_SECRET=${webhookSecret}`);
} else {
  main();
}

function main() {
  for (const file of Object.values(FILES)) {
    if (!existsSync(file)) {
      console.error(`Bulunamadı: ${path.relative(root, file)} — önce ortam dosyasını oluştur.`);
      process.exitCode = 1;
      return;
    }
  }
  const existing = [
    [FILES.root, 'VAPID_PRIVATE_JWK'],
    [FILES.root, 'WEBHOOK_SECRET'],
    [FILES.web, 'VITE_VAPID_PUBLIC_KEY'],
    [FILES.webProd, 'VITE_VAPID_PUBLIC_KEY'],
  ].filter(([file, key]) => hasKey(readFileSync(file, 'utf8'), key));
  if (existing.length > 0 && !force) {
    for (const [file, key] of existing) console.error(`Zaten var: ${path.relative(root, file)} → ${key}`);
    console.error('Anahtarlar değiştirilmedi. Bilerek yenilemek için --force (mevcut push abonelikleri geçersizleşir).');
    process.exitCode = 1;
    return;
  }

  const rootContent = readFileSync(FILES.root, 'utf8');
  const rootValues = {
    VAPID_PUBLIC_JWK: `'${publicJwk}'`,
    VAPID_PRIVATE_JWK: `'${privateJwk}'`,
    WEBHOOK_SECRET: webhookSecret,
  };
  if (subjectArg || !hasKey(rootContent, 'VAPID_SUBJECT')) rootValues.VAPID_SUBJECT = subjectArg ?? DEFAULT_SUBJECT;
  upsertEnv(FILES.root, rootValues, '# Görev 26 — Web Push (scripts/gen-vapid.mjs yazar; değerler sohbete yazılmaz):');
  upsertEnv(FILES.web, { VITE_VAPID_PUBLIC_KEY: publicRaw }, '# Görev 26 — Web Push public anahtarı (scripts/gen-vapid.mjs):');
  upsertEnv(FILES.webProd, { VITE_VAPID_PUBLIC_KEY: publicRaw }, '# Görev 26 — Web Push public anahtarı (scripts/gen-vapid.mjs):');

  console.log(`Yazıldı: .env → ${Object.keys(rootValues).join(', ')}`);
  console.log('Yazıldı: apps/web/.env, apps/web/.env.production → VITE_VAPID_PUBLIC_KEY');
  console.log('Sonraki adım: node --env-file=.env scripts/setup-push.mjs');
}

function hasKey(content, key) {
  return new RegExp(`^\\s*${key}\\s*=\\s*\\S`, 'm').test(content);
}

/** KEY=değer satırını yerinde değiştirir; yoksa dosya sonuna ekler. Satır sonu biçimi (CRLF/LF) korunur. */
function upsertEnv(file, values, header) {
  let content = readFileSync(file, 'utf8');
  const eol = content.includes('\r\n') ? '\r\n' : '\n';
  const appended = [];
  for (const [key, value] of Object.entries(values)) {
    const re = new RegExp(`^[ \\t]*${key}[ \\t]*=.*$`, 'm');
    if (re.test(content)) content = content.replace(re, () => `${key}=${value}`);
    else appended.push(`${key}=${value}`);
  }
  if (appended.length > 0) {
    if (content.length > 0 && !content.endsWith(eol)) content += eol;
    content += [header, ...appended].join(eol) + eol;
  }
  writeFileSync(file, content, 'utf8');
}
