import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { wasm } from '@rollup/plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';
import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin';
import { NodeGlobalsPolyfillPlugin } from '@esbuild-plugins/node-globals-polyfill';
import inject from '@rollup/plugin-inject';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { VitePWA } from 'vite-plugin-pwa';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

function serverMatrixSdkCryptoWasm(wasmFilePath: string) {
    return {
        name: 'vite-plugin-serve-matrix-sdk-crypto-wasm',
        configureServer(server: { middlewares: { use: (fn: (req: { url: string }, res: { setHeader: (k: string, v: string) => void; writeHead: (n: number) => void; end: (s: string) => void }, next: () => void) => void) => void } }) {
            server.middlewares.use((req, res, next) => {
                if (req.url === wasmFilePath) {
                    const resolvedPath = path.join(
                        rootDir,
                        'node_modules/@matrix-org/matrix-sdk-crypto-wasm/pkg/matrix_sdk_crypto_wasm_bg.wasm',
                    );
                    if (fs.existsSync(resolvedPath)) {
                        res.setHeader('Content-Type', 'application/wasm');
                        res.setHeader('Cache-Control', 'no-cache');
                        fs.createReadStream(resolvedPath).pipe(res as unknown as NodeJS.WritableStream);
                    } else {
                        res.writeHead(404);
                        res.end('File not found');
                    }
                } else {
                    next();
                }
            });
        },
    };
}

export default defineConfig({
    appType: 'spa',
    publicDir: false,
    base: '/',
    resolve: {
        alias: {
            '@blackout/sdk': path.resolve(rootDir, '../../packages/blackout-sdk/src/index.ts'),
        },
    },
    server: {
        port: 8080,
        host: true,
        fs: {
            allow: ['..'],
        },
    },
    plugins: [
        serverMatrixSdkCryptoWasm('/node_modules/.vite/deps/pkg/matrix_sdk_crypto_wasm_bg.wasm'),
        topLevelAwait({
            promiseExportName: '__tla',
            promiseImportName: (i) => `__tla_${i}`,
        }),
        viteStaticCopy({
            targets: [
                { src: 'node_modules/pdfjs-dist/build/pdf.worker.min.mjs', dest: '', rename: 'pdf.worker.min.js' },
                { src: 'netlify.toml', dest: '' },
                { src: 'config.json', dest: '' },
                { src: 'public/manifest.json', dest: '' },
                { src: 'public/res/android', dest: 'public/' },
                { src: 'public/locales', dest: 'public/' },
            ],
        }),
        vanillaExtractPlugin(),
        wasm(),
        react(),
        VitePWA({
            srcDir: 'src',
            filename: 'sw.ts',
            strategies: 'injectManifest',
            injectRegister: false,
            manifest: false,
            injectManifest: { injectionPoint: undefined },
            devOptions: { enabled: true, type: 'module' },
        }),
    ],
    optimizeDeps: {
        esbuildOptions: {
            define: { global: 'globalThis' },
            plugins: [NodeGlobalsPolyfillPlugin({ process: false, buffer: true })],
        },
    },
    build: {
        outDir: 'dist',
        sourcemap: true,
        copyPublicDir: false,
        rollupOptions: {
            plugins: [inject({ Buffer: ['buffer', 'Buffer'] })],
        },
    },
});
