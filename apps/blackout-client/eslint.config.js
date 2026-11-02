import globals from 'globals';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import prettier from 'eslint-config-prettier';

const noDirectBmcImportsRule = [
    'error',
    {
        selector:
            'ImportDeclaration[source.value=/bmc-/], ExportNamedDeclaration[source.value=/bmc-/], ExportAllDeclaration[source.value=/bmc-/]',
        message:
            'Direct bmc-* imports are blocked in shell/runtime entrypoints. Route customizations through feature plugins.',
    },
];

const noDirectFetchRule = [
    'error',
    {
        selector: "CallExpression[callee.name='fetch']",
        message:
            'Direct fetch() is blocked in app feature/page layers. Route calls through @blackout/sdk.',
    },
];

export default [
    // eslint 8 reported unused eslint-disable directives only when asked
    // (--report-unused-disable-directives); eslint 9+ warns by default, which
    // would fail --max-warnings=0 on the dead directives already in src/.
    // Keep eslint 8's behaviour; removing those directives is its own change.
    { linterOptions: { reportUnusedDisableDirectives: 'off' } },
    {
        files: ['src/**/*.{ts,tsx}'],
        languageOptions: {
            parser: tsParser,
            parserOptions: {
                ecmaVersion: 'latest',
                sourceType: 'module',
                ecmaFeatures: { jsx: true },
            },
            globals: {
                ...globals.browser,
            },
        },
        plugins: {
            '@typescript-eslint': tsPlugin,
            'react-hooks': reactHooks,
            'react-refresh': reactRefresh,
        },
        rules: {
            // eslint-plugin-react-hooks 4.6.0's recommended set, named: 7.x's
            // recommended adds the React Compiler rules, which this config never had.
            'react-hooks/rules-of-hooks': 'error',
            'no-undef': 'off',
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/no-non-null-assertion': 'off',
            'react-refresh/only-export-components': 'off',
            'react-hooks/exhaustive-deps': 'off',
        },
    },

    {
        files: [
            'src/index.tsx',
            'src/app/core/features/registry.ts',
            'src/app/core/features/plugins.ts',
            'src/app/core/features/composition.ts',
        ],
        rules: {
            'no-restricted-syntax': noDirectBmcImportsRule,
        },
    },
    {
        files: ['src/app/features/**/*.{ts,tsx}', 'src/app/pages/**/*.{ts,tsx}'],
        rules: {
            'no-restricted-syntax': noDirectFetchRule,
        },
    },
    {
        files: ['src/app/components/**/*.{ts,tsx}', 'src/platform/**/*.{ts,tsx}'],
        ignores: [
            // Runtime client-config bootstrap loader (loads /config.json).
            'src/app/components/bmc/auth/homeserver.ts',
            // Capacitor camera bridge: fetch() against a data: URI to convert to Blob.
            // This is a synchronous local decode, not a network call.
            'src/platform/nativeMediaBridge.ts',
        ],
        rules: {
            'no-restricted-syntax': noDirectFetchRule,
        },
    },
    prettier,
];
