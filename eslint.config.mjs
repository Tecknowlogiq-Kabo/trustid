// @ts-check
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['eslint.config.mjs'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      sourceType: 'commonjs',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
    },
  },
  // Relaxed rules for Jest spec files — these patterns are standard in Jest but
  // trigger false positives from strict TypeScript ESLint rules.
  {
    files: ['**/*.spec.ts', '**/*.e2e-spec.ts'],
    rules: {
      // jest.Mocked<T> methods look like "unbound methods" to ESLint but are safe in tests
      '@typescript-eslint/unbound-method': 'off',
      // Accessing mock.calls[0][n] returns `any` — acceptable in test assertions
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      // Unused underscore-prefixed vars are a convention for "intentionally unused" in tests
      '@typescript-eslint/no-unused-vars': ['error', { varsIgnorePattern: '^_' }],
    },
  },
);