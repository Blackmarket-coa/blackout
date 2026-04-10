# Additional Dependencies for blackout_app

These are the dependencies used by blackout-client features that may not be present
in the upstream Cinny fork. Check your `package.json` and add any that are missing.

## Runtime Dependencies (check if already present)

```json
{
  "@matrix-org/matrix-sdk-crypto-wasm": "^18.0.0",
  "@tanstack/react-query": "^5.90.2",
  "i18next": "^25.6.3",
  "jotai": "^2.15.1",
  "matrix-js-sdk": "^38.4.0",
  "react": "^18.3.1",
  "react-dom": "^18.3.1",
  "react-i18next": "^16.2.4",
  "react-router-dom": "^6.30.1",
  "slate": "0.112.0",
  "@vanilla-extract/css": "^1.17.4",
  "slate-history": "^0.113.1",
  "slate-react": "^0.113.0"
}
```

## Likely Already in Cinny

Cinny already uses these, so they should be present:
- `react`, `react-dom`
- `matrix-js-sdk`
- `@matrix-org/matrix-sdk-crypto-wasm`
- `jotai`
- `@tanstack/react-query`
- `i18next`, `react-i18next`
- `slate`, `slate-react`, `slate-history`
- `@vanilla-extract/css`

## May Need to Add

These might not be in Cinny and are needed for specific features:
- `react-router-dom` — if Cinny uses a different router
- `yjs`, `y-indexeddb` — only if using CRDT-backed governance documents

## Dev Dependencies (if not present)

```json
{
  "vite-plugin-top-level-await": "^1.6.0",
  "vite-plugin-wasm": "^3.5.0"
}
```

These Vite plugins are needed for WASM crypto support. Add them to `vite.config.js`:

```js
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';

export default defineConfig({
  plugins: [react(), wasm(), topLevelAwait()],
  // ...
});
```
