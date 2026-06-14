import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { wasm } from '@rollup/plugin-wasm';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin';
import { NodeGlobalsPolyfillPlugin } from '@esbuild-plugins/node-globals-polyfill';
import inject from '@rollup/plugin-inject';
import topLevelAwait from 'vite-plugin-top-level-await';
import { VitePWA } from 'vite-plugin-pwa';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import buildConfig from './build.config';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

// vite-plugin-static-copy v4 always preserves the source path structure under
// `dest` (output = dest + src-relative-path); use `rename.stripBase` to flatten.
// The pdf worker is handled natively via a `?url` import in plugins/pdfjs-dist.ts.
const copyFiles = {
  targets: [
    {
      src: 'netlify.toml',
      dest: '',
    },
    {
      src: 'config.json',
      dest: '',
    },
    {
      // -> dist/manifest.json (strip the leading `public/` segment).
      src: 'public/manifest.json',
      dest: '',
      rename: { stripBase: 1 },
    },
    {
      // src already starts with `public/`, so dest '' -> dist/public/res/android.
      src: 'public/res/android',
      dest: '',
    },
    {
      // src already starts with `public/`, so dest '' -> dist/public/locales.
      src: 'public/locales',
      dest: '',
    },
  ],
};

function serverMatrixSdkCryptoWasm(wasmFilePath) {
  return {
    name: 'vite-plugin-serve-matrix-sdk-crypto-wasm',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url === wasmFilePath) {
          const resolvedPath = path.join(path.resolve(), "/node_modules/@matrix-org/matrix-sdk-crypto-wasm/pkg/matrix_sdk_crypto_wasm_bg.wasm");

          if (fs.existsSync(resolvedPath)) {
            res.setHeader('Content-Type', 'application/wasm');
            res.setHeader('Cache-Control', 'no-cache');

            const fileStream = fs.createReadStream(resolvedPath);
            fileStream.pipe(res);
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
  base: buildConfig.base,
  resolve: {
    // `@blackout/ui` primitives (consumed from source) import `@blackout/design`
    // by package name. Resolve it to source — the client already consumes
    // design from source — so the production build does not depend on the
    // design package's `dist` being built first. Dedupe React so the primitives
    // share the app's single react 18 instance instead of the ui package's
    // own react ^19 copy.
    dedupe: ['react', 'react-dom'],
    alias: {
      '@blackout/design': path.resolve(rootDir, '../../packages/design/src/index.ts'),
    },
  },
  server: {
    port: 8080,
    host: true,
    fs: {
      // Allow serving files from one level up to the project root
      allow: ['..'],
    },
  },
  plugins: [
    serverMatrixSdkCryptoWasm('/node_modules/.vite/deps/pkg/matrix_sdk_crypto_wasm_bg.wasm'),
    topLevelAwait({
      // The export name of top-level await promise for each chunk module
      promiseExportName: '__tla',
      // The function to generate import names of top-level await promise in each chunk module
      promiseImportName: (i) => `__tla_${i}`,
    }),
    viteStaticCopy(copyFiles),
    vanillaExtractPlugin(),
    wasm(),
    react(),
    VitePWA({
      srcDir: 'src',
      filename: 'sw.ts',
      strategies: 'injectManifest',
      injectRegister: false,
      manifest: false,
      injectManifest: {
        injectionPoint: undefined,
      },
      devOptions: {
        enabled: true,
        type: 'module'
      }
    }),
  ],
  optimizeDeps: {
    esbuildOptions: {
      define: {
        global: 'globalThis',
      },
      plugins: [
        // Enable esbuild polyfill plugins
        NodeGlobalsPolyfillPlugin({
          process: false,
          buffer: true,
        }),
      ],
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    copyPublicDir: false,
    // The app relies on top-level await (es2022). Pin the build target to
    // es2022 so esbuild 0.28 doesn't try (and fail) to lower destructuring in
    // the top-level-await wrapper down to the legacy default target.
    target: 'es2022',
    // matrix-sdk (~1.1MB) and react-vendor (~210KB) are split out below for
    // caching across deploys. The app's main bundle is what's needed for
    // initial render after that split; gate the limit just above it to still
    // catch unexpected growth.
    chunkSizeWarningLimit: 2900,
    rollupOptions: {
      plugins: [inject({ Buffer: ['buffer', 'Buffer'] })],
      output: {
        // Function form (works on both Rollup and vite 8's Rolldown; the
        // object form was dropped in vite 8).
        manualChunks: (id) => {
          if (
            id.includes('node_modules/matrix-js-sdk') ||
            id.includes('node_modules/@matrix-org/matrix-sdk-crypto-wasm')
          ) {
            return 'matrix-sdk';
          }
          if (
            id.includes('node_modules/react-dom') ||
            id.includes('node_modules/react-router-dom') ||
            id.includes('node_modules/react/') ||
            id.includes('node_modules/scheduler/')
          ) {
            return 'react-vendor';
          }
          return undefined;
        },
      },
    },
  },
});
