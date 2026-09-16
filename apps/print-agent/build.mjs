// Ajanı restoran PC'sine kopyalanabilecek tek bir dosyada derler (Görev 19): `@ramos/shared`
// dahil tüm bağımlılıklar `dist/cli.js` içine gömülür, yalnızca Node'un kendi çekirdek
// modülleri (node:*) dışarıda bırakılır — deploy ederken ayrı bir node_modules taşınmaz.
import { build } from 'esbuild';
import { rmSync } from 'node:fs';

rmSync('dist', { recursive: true, force: true });

await build({
  entryPoints: ['src/cli.ts'],
  outfile: 'dist/cli.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: true,
  logLevel: 'info',
});
