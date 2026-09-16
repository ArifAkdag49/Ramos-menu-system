// Ajanı restoran PC'sine kopyalanabilecek TEK bir dosyada derler (Görev 20): `@ramos/shared`
// dahil tüm bağımlılıklar `dist/ramos-agent.mjs` içine gömülür, yalnızca Node'un kendi çekirdek
// modülleri (node:*) dışarıda bırakılır — deploy ederken ayrı bir node_modules taşınmaz.
//
// Çıktı adı `ramos-agent.mjs`: kurulum betikleri (`scripts/install-agent.ps1`,
// `scripts/run-agent.cmd`) ve systemd birimi (`deploy/ramos-print-agent.service`) bu adı
// bekler; `.mjs` uzantısı da tek dosyanın yanında `package.json` olmadan ESM olarak
// çalışmasını garanti eder (kurulum klasöründe `"type": "module"` yoktur).
import { build } from 'esbuild';
import { rmSync } from 'node:fs';

rmSync('dist', { recursive: true, force: true });

await build({
  entryPoints: ['src/cli.ts'],
  outfile: 'dist/ramos-agent.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: false,
  minify: false,
  // Paketlenen bağımlılıkların bir kısmı CJS'tir ve `require`/`__dirname` bekler; ESM çıktısında
  // bunlar tanımsızdır. Banner, esbuild'in CJS→ESM sarmalayıcılarının ihtiyaç duyduğu `require`i
  // `createRequire` ile geri kazandırır.
  banner: { js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);" },
  logLevel: 'info',
});

console.log('dist/ramos-agent.mjs hazır');
