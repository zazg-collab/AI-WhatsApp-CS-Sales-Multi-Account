import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

/**
 * Flat ESLint config for the whole monorepo. Lean on purpose: the code already
 * compiles under strict `tsc`, so lint targets real-bug rules (react-hooks deps,
 * unused vars) without drowning in style noise. Type-aware linting is left off
 * to keep it fast and config-free per workspace.
 */
export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/.next/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/*.config.{js,mjs,cjs,ts}',
      'packages/database/prisma/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      // The codebase (and especially its test mocks) uses `any` deliberately.
      '@typescript-eslint/no-explicit-any': 'off',
      // Allow intentionally-unused args/vars when prefixed with _.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      // `@ts-expect-error`/`@ts-ignore` are used sparingly and intentionally.
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
    },
  },
  // React hooks rules for the Next.js web app (catches stale-closure / missing
  // dependency bugs that tsc can't see).
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Hook dep completeness is advisory — flag it without failing the build.
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  // Tests run under Jest/Vitest globals and use loose mock typings.
  {
    files: ['**/*.spec.ts', '**/*.test.ts', '**/*.test.tsx'],
    languageOptions: { globals: { ...globals.jest } },
    rules: {
      '@typescript-eslint/no-unsafe-function-type': 'off',
    },
  },
);
