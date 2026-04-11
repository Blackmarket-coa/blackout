import globals from 'globals';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import reactPlugin from 'eslint-plugin-react';
import importPlugin from 'eslint-plugin-import';
import jsxA11yPlugin from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import prettier from 'eslint-config-prettier';

const noDirectFetchRule = [
    'error',
    {
        selector: "CallExpression[callee.name='fetch']",
        message:
            'Direct fetch() is blocked in app feature/page layers. Route calls through @blackout/sdk.',
    },
];

export default [
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
            react: reactPlugin,
            import: importPlugin,
            'jsx-a11y': jsxA11yPlugin,
            'react-hooks': reactHooks,
            'react-refresh': reactRefresh,
        },
        rules: {
            ...reactHooks.configs.recommended.rules,
            'no-undef': 'off',
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/no-non-null-assertion': 'off',
            'react-refresh/only-export-components': 'off',
            'react-hooks/exhaustive-deps': 'off',
        },
    },
    {
        files: ['src/app/features/**/*.{ts,tsx}', 'src/app/pages/**/*.{ts,tsx}'],
        rules: {
            'no-restricted-syntax': noDirectFetchRule,
        },
    },
    prettier,
];
