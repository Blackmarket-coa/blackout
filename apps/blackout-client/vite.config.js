import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin';
import { NodeGlobalsPolyfillPlugin } from '@esbuild-plugins/node-globals-polyfill';
import inject from '@rollup/plugin-inject';
import { VitePWA } from 'vite-plugin-pwa';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';
import buildConfig from './build.config';

const wasmPlugin = {
  name: 'wasm-content-type',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      if (!req.url || !req.url.includes('.wasm')) {
        return next();
      }

      const origSetHeader = res.setHeader;
      res.setHeader = function (name, value) {
        if (name.toLowerCase() === 'content-type') {
          value = 'application/wasm';
        }
        return origSetHeader.call(this, name, value);
      };

      const origWriteHead = res.writeHead;
      res.writeHead = function (statusCode, ...args) {
        if (args.length === 1 && typeof args[0] === 'object') {
          return origWriteHead.call(this, statusCode, {
            ...args[0],
            'Content-Type': 'application/wasm',
          });
        }
        if (args.length >= 2 && typeof args[1] === 'object') {
          return origWriteHead.call(this, statusCode, args[0], {
            ...args[1],
            'Content-Type': 'application/wasm',
          });
        }
        res.setHeader('Content-Type', 'application/wasm');
        return origWriteHead.call(this, statusCode, ...args);
      };

      next();
    });
  },
};

const copyFiles = {
  targets: [
    {
      src: 'node_modules/pdfjs-dist/build/pdf.worker.min.mjs',
      dest: '',
      rename: 'pdf.worker.min.js',
    },
    {
      src: 'config.json',
      dest: '',
    },
    {
      src: 'public/manifest.json',
      dest: '',
    },
    {
      src: 'public/res/android',
      dest: 'public/',
    },
    {
      src: 'public/locales',
      dest: 'public/',
    },
  ],
};

export default defineConfig({
  appType: 'spa',
  publicDir: false,
  base: buildConfig.base,
  assetsInclude: ['**/*.wasm'],
  server: {
    port: 8080,
    host: true,
    fs: {
      allow: ['../..'],
    },
  },
  plugins: [
    wasm(),
    topLevelAwait(),
    wasmPlugin,
    vanillaExtractPlugin(),
    viteStaticCopy(copyFiles),
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
    exclude: ['@matrix-org/matrix-sdk-crypto-wasm'],
    esbuildOptions: {
      define: {
        global: 'globalThis',
      },
      plugins: [
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
    chunkSizeWarningLimit: 2900,
    rollupOptions: {
      plugins: [inject({ Buffer: ['buffer', 'Buffer'] })],
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
  },
});
