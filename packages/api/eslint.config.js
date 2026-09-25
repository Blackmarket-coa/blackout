import js from '@eslint/js';
import globals from 'globals';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import prettier from 'eslint-config-prettier';

// Flat config for the Hono API. It lives here, not at the repository root,
// because the root `.eslintrc.cjs` is Element Web's upstream config and
// requires `eslint-plugin-matrix-org`, which this workspace never installs:
// every eslintrc-mode lint under packages/ died on that plugin before it
// looked at a single file. ESLint 8 looks for a flat config by walking up
// from the working directory, not from each linted file, so
// `pnpm --filter @blackout/api run lint` (cwd packages/api) finds this one
// first and never falls back to the root eslintrc.
//
// The versions mirror apps/blackout-client so the lockfile gains no new
// packages.

const tsRecommended = tsPlugin.configs['eslint-recommended'].overrides[0].rules;

export default [
    {
        files: ['src/**/*.ts', 'test/**/*.ts'],
        languageOptions: {
            parser: tsParser,
            parserOptions: {
                ecmaVersion: 'latest',
                sourceType: 'module',
            },
            globals: {
                ...globals.node,
            },
        },
        plugins: {
            '@typescript-eslint': tsPlugin,
        },
        rules: {
            ...js.configs.recommended.rules,
            ...tsRecommended,
            ...tsPlugin.configs.recommended.rules,
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/no-non-null-assertion': 'off',
            '@typescript-eslint/no-unused-vars': [
                'error',
                {
                    argsIgnorePattern: '^_',
                    varsIgnorePattern: '^_',
                    caughtErrorsIgnorePattern: '^_',
                    ignoreRestSiblings: true,
                },
            ],
            // giphy.ts/tenor.ts drain upstream bodies with `while (true)` and
            // leave via break/return; only non-loop constants are suspicious.
            'no-constant-condition': ['error', { checkLoops: false }],
        },
    },
    {
        // Test doubles are mostly empty stubs (onMessage() {}, release() {}).
        files: ['test/**/*.ts'],
        rules: {
            '@typescript-eslint/no-empty-function': 'off',
        },
    },
    prettier,
];
