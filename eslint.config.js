import js from '@eslint/js';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const reportAsWarning = (config) => ({
  ...config,
  rules: Object.fromEntries(
    Object.entries(config.rules ?? {}).map(([name, rule]) => [
      name,
      Array.isArray(rule) ? ['warn', ...rule.slice(1)] : 'warn',
    ]),
  ),
});

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'vendor/**', 'graphify-out/**'],
  },
  reportAsWarning(js.configs.recommended),
  ...tseslint.configs.recommended.map(reportAsWarning),
  reportAsWarning(jsxA11y.flatConfigs.recommended),
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      // TypeScript has its own unused-variable implementation; avoid duplicate reports.
      'no-unused-vars': 'off',
      // Superseded by label-has-associated-control in the current jsx-a11y rules.
      'jsx-a11y/label-has-for': 'off',
    },
  },
  {
    files: ['src/**/*.{ts,tsx}', 'tests/**/*.ts', 'vite.config.ts'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
);
