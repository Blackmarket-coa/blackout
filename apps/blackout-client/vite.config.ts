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
            '@blackout/design': path.resolve(rootDir, '../../packages/design/src/index.ts'),
        },
        // Ensure `@blackout/ui` primitives (consumed from source) share the
        // app's single React instance rather than the ui package's own react.
        dedupe: ['react', 'react-dom'],
    },
    plugins: [react(), wasm(), topLevelAwait(), sri()],
});
