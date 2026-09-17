// epson-sdp Edge Function'ı için ön-derleme: supabase/functions/epson-sdp/render.ts → render.bundle.js.
// render.ts depo modüllerini (packages/shared ticket.ts + escpos.ts) ve npm paketlerini
// (@point-of-sale/*) kullanır; Supabase'e yalnız fonksiyon klasörü yüklendiği için bunlar tek bir ESM
// dosyasına gömülür. Çıktı .gitignore'dadır — deploy-function.mjs yayından hemen önce bu betiği çalıştırır.
// Elle: node scripts/build-epson-sdp.mjs
import { build } from 'esbuild';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const dir = path.join(root, 'supabase/functions/epson-sdp');

export async function buildEpsonSdp() {
  await build({
    absWorkingDir: root,
    entryPoints: [path.join(dir, 'render.ts')],
    outfile: path.join(dir, 'render.bundle.js'),
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
  return path.join(dir, 'render.bundle.js');
}

const isMain = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) console.log('yazıldı:', path.relative(root, await buildEpsonSdp()));
