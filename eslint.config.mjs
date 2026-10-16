import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default [
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '.tools/**',
      '.pnpm-store/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx,mjs}'],
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
        document: 'readonly',
        URL: 'readonly',
      },
    },
  },
  {
    files: ['**/*.mjs'],
    rules: { '@typescript-eslint/no-unused-vars': 'off' },
  },
];
