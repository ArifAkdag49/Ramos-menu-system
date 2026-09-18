// Fiş kodunu Edge Function'lara gömen ön-derleme: supabase/functions/epson-sdp/render.ts → render.bundle.js.
// Aynı paket station-feed'e (0015, arka plan yazıcı istasyonu) de yazılır: iki fonksiyon aynı fiş baytlarını üretir.
// render.ts depo modüllerini (packages/shared ticket.ts + escpos.ts) ve npm paketlerini
// (@point-of-sale/*) kullanır; Supabase'e yalnız fonksiyon klasörü yüklendiği için bunlar tek bir ESM
// dosyasına gömülür ve her fonksiyon klasörüne ayrı kopyalanır. Çıktılar .gitignore'dadır —
// deploy-function.mjs yayından hemen önce bu betiği çalıştırır.
// Elle: node scripts/build-epson-sdp.mjs
import { build } from 'esbuild';
import { copyFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const dir = path.join(root, 'supabase/functions/epson-sdp');
/** Paketin kopyalandığı diğer fonksiyon klasörleri. */
const COPIES = [path.join(root, 'supabase/functions/station-feed')];

export async function buildEpsonSdp() {
  const outfile = path.join(dir, 'render.bundle.js');
  await build({
    absWorkingDir: root,
    entryPoints: [path.join(dir, 'render.ts')],
    outfile,
    bundle: true,
    // Deno: Node çekirdek modülü yok, yalnız web standartları. Paketler bunlara ihtiyaç duyarsa derleme düşer.
    platform: 'neutral',
    mainFields: ['module', 'main'],
    format: 'esm',
    target: 'es2022',
    minify: false,
    legalComments: 'none',
    banner: { js: '// OTOMATİK ÜRETİLDİ (scripts/build-epson-sdp.mjs) — elle düzenleme, git\'e ekleme.' },
    logLevel: 'warning',
  });
  const written = [outfile];
  for (const target of COPIES) {
    const copy = path.join(target, 'render.bundle.js');
    await copyFile(outfile, copy);
    written.push(copy);
  }
  return written;
}

const isMain = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) for (const f of await buildEpsonSdp()) console.log('yazıldı:', path.relative(root, f));
