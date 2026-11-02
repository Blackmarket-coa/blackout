import js from '@eslint/js';
import globals from 'globals';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import prettier from 'eslint-config-prettier';

// Flat config for the Hono API. It lives here, not at the repository root,
// because the root `.eslintrc.cjs` is Element Web's upstream config and
// requires `eslint-plugin-matrix-org`, which this workspace never installs:
// every eslintrc-mode lint under packages/ died on that plugin before it
// looked at a single file. ESLint 10 looks the config up from each linted
// file's directory, so files under packages/api find this one, and it has
// no eslintrc mode, so the root `.eslintrc.cjs` is never read.
//
// The versions mirror apps/blackout-client so the lockfile gains no new
// packages.

const tsRecommended = tsPlugin.configs['eslint-recommended'].overrides[0].rules;

export default [
    // eslint 8 reported unused eslint-disable directives only when asked
    // (--report-unused-disable-directives); eslint 9+ warns by default, which
    // would fail --max-warnings=0 on the dead directives already here.
    // Keep eslint 8's behaviour; removing those directives is its own change.
    { linterOptions: { reportUnusedDisableDirectives: 'off' } },
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
            // The rule set eslint 8.29 and typescript-eslint 5.46.1 enforced here.
            // typescript-eslint 8 dropped these six from `recommended`; they still exist.
            '@typescript-eslint/adjacent-overload-signatures': 'error',
            '@typescript-eslint/no-empty-function': 'error',
            '@typescript-eslint/no-empty-interface': 'error',
            '@typescript-eslint/no-inferrable-types': 'error',
            '@typescript-eslint/no-loss-of-precision': 'error',
            '@typescript-eslint/no-var-requires': 'error',
            // typescript-eslint 8's eslint-recommended override turns these two off.
            'no-class-assign': 'error',
            'no-with': 'error',
            // eslint 9 added blockScopedFunctions with default "allow", which stops
            // reporting block-level functions in strict code; eslint 8.29 reported them.
            'no-inner-declarations': ['error', 'functions', { blockScopedFunctions: 'disallow' }],
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
