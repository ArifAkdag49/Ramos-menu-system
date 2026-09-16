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
import path from 'node:path';

// M7 (inceleme turu 1): tüm yollar BU DOSYANIN klasörüne göre çözülür, `cwd`'ye göre değil.
// `node apps/print-agent/build.mjs` depo kökünden çalıştırıldığında göreli `rmSync('dist')`
// KÖKTEKİ `dist/` klasörünü siliyordu.
const root = import.meta.dirname;

rmSync(path.join(root, 'dist'), { recursive: true, force: true });

await build({
  absWorkingDir: root,
  entryPoints: ['src/cli.ts'],
  outfile: 'dist/ramos-agent.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: false,
  minify: false,
  // Paketlenen bağımlılıklardan bazıları CJS'tir; esbuild bunları ESM çıktısında sarmalar ama
  // bir bağımlılık ÇALIŞMA ANINDA `require(...)` çağırırsa (koşullu/tembel yükleme) ESM'de
  // `require` tanımsızdır ve süreç çöker. Banner onu `createRequire` ile geri kazandırır.
  // BUGÜN ölü kod: `grep -c "require(" dist/ramos-agent.mjs` → 1 (yalnız esbuild'in kendi
  // `__require` yardımcısının ADI). Bir güvenlik ağı olarak bırakıldı: maliyeti 1 satır,
  // eksikliğinin maliyeti restoranda açılışta çöken bir ajan.
  banner: { js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);" },
  logLevel: 'info',
});

console.log('dist/ramos-agent.mjs hazır');
