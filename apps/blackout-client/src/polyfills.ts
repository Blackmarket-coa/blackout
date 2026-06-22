// Browser polyfills for the Node globals a few dependencies (matrix-js-sdk and
// its crypto/codec paths) reference as bare globals. Imported first from
// main.tsx so the globals exist before any dependency module executes.
//
// `global` is shimmed in index.html (`window.global ||= window`). Here we add
// `Buffer`. The production build also rewrites bare `Buffer` references via
// @rollup/plugin-inject (see vite.config.js); this runtime assignment is what
// covers the dev server, where Vite 8's Rolldown dependency optimizer no longer
// runs the old esbuild node-globals polyfill plugin.
import { Buffer } from 'buffer';

const globalScope = globalThis as unknown as { Buffer?: typeof Buffer };
if (!globalScope.Buffer) {
  globalScope.Buffer = Buffer;
}
