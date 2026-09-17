import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/*.d.ts',
      'supabase/functions/**',
      'docs/**',
      '**/playwright-report/**',
      '**/test-results/**',
      // Capacitor Android: Gradle derleme çıktısı ve `cap sync`'in kopyaladığı native-bridge.js.
      'apps/mobile/android/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  { files: ['**/*.{js,mjs,cjs}'], languageOptions: { globals: { ...globals.node } } },
  // Web uygulaması: tarayıcı globalleri + React hook kuralları (tek kök yapılandırma).
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs['recommended-latest'].rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  // Playwright yapılandırması ve E2E testleri Node ortamında çalışır.
  {
    files: ['apps/web/e2e/**/*.ts', 'apps/web/*.config.ts'],
    languageOptions: { globals: { ...globals.node } },
  },
);
