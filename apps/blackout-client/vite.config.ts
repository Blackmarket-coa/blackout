import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';
import { sri } from './vite-plugin-sri';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    resolve: {
        alias: {
            '@blackout/sdk': path.resolve(rootDir, '../../packages/blackout-sdk/src/index.ts'),
        },
    },
    plugins: [react(), wasm(), topLevelAwait(), sri()],
});
