# Changes

Three bugs prevented the Blackout client from loading in a local dev environment. Additionally, the `piggpin` feature branch includes new feature work and security hardening.

---

## Bug fixes

### 1. E2EE WASM crypto failed to load (`vite.config.js`)

The `@matrix-org/matrix-sdk-crypto-wasm` package loads its WASM binary via `new URL("./pkg/...wasm", import.meta.url)` followed by `WebAssembly.instantiateStreaming(fetch(url))`. Vite's dev server was serving the WASM file as HTML (SPA fallback) because its module pipeline couldn't resolve the asset, and when the file did serve, the `Content-Type` was wrong.

- Added `vite-plugin-wasm` and `vite-plugin-top-level-await` plugins to handle WASM module resolution through Vite's pipeline
- Added `assetsInclude: ['**/*.wasm']` so Vite treats `.wasm` as static assets
- Added `optimizeDeps.exclude: ['@matrix-org/matrix-sdk-crypto-wasm']` to prevent pre-bundling (which broke the URL resolution)
- Added a custom `wasmPlugin` middleware that intercepts `res.setHeader` and `res.writeHead` to force `Content-Type: application/wasm` for all `.wasm` responses
- Removed the old `serverMatrixSdkCryptoWasm()` filesystem-serving approach (now obsolete)
- Removed the `matrix-sdk` manual chunk split (no longer needed)

### 2. API server wouldn't start (`packages/api/package.json`)

The server reads all config from `process.env` but `.env` was never loaded. Startup crashed with `JWT secret missing`.

- Added `--env-file .env` to the `dev` and `start` scripts

### 3. CORS blocked the auth token exchange (`packages/api/src/config/cors.ts`)

The `/v1/auth/matrix/exchange` endpoint requires the `x-matrix-access-token` header, but CORS preflight rejected it because that header wasn't in the default `Access-Control-Allow-Headers`.

- Added `x-matrix-access-token` to the default `allowedHeaders` in both CORS config fallback paths

---

## Piggpin feature branch

### New feature: PiggPin (map-based view)

- New feature module at `apps/blackout-client/src/app/features/piggpin/` with manifest, routes, nav, and `PiggPinView` component
- Registered in `coreModules.ts`, `featureFlags.ts` (gated by `BLACPIGGPIN` env var), and `manifest.ts`
- Added as a coalition tab (inserts after "map"), labeled "Map" in `coalition.ts` state
- Added `piggpin` to `COALITION_TABS` in `packages/core/src/coalition/events.ts`

### Session/auth rework

- Switched from `localStorage` to in-memory token caching in `blackoutApiSession.ts` and `useMarketplaceAuth.ts` (avoids storage availability edge cases)
- Added `credentials: 'include'` to the fetch client for future httpOnly cookie transport
- Added cookie-based token extraction in `authMiddleware` (falls back to `Authorization` header)
- Restricted `x-blackout-capabilities` header parsing to development mode in `authz.ts` (prod uses JWT claims only)
- Added `setAuthCookie()`/`clearAuthCookie()` to auth routes; set cookies on register, login, matrix exchange, and token refresh
- Added `GET /session` endpoint returning userId and username
- Added `discovery.read`/`discovery.write` to default user capabilities in `deriveUserCapabilities()`

### SDK fetch client

- Added `credentials?: RequestCredentials` option to `createFetchApiClient()`, passed through to `fetch()`

### Lazy loading to isolate WASM top-level await

- Converted page components (`ClientLayout`, `AppShell`, `LoginPage`, `OAuthCallback`, `InviteLandingPage`, `OnboardingPage`, `PublicDirectory`) to `React.lazy()` imports so `matrix-js-sdk`'s top-level WASM await doesn't block the main module graph
- Replaced static `matrix-js-sdk` enum imports (`ClientEvent.Room`, `SyncState.Prepared`, etc.) with string constants in `rooms.ts`

### E2EE resilience

- Wrapped `client.initRustCrypto()` in try/catch so failure is a warning, not a crash

### Canopy indexing fix

- Removed `x-blackout-capabilities: discovery.write` header from `indexCanopy()` — capability is now minted in the session JWT server-side

### Legacy web app XSS hardening

- Wrapped all user-controlled content in `escapeHtml()` across `legacy/blackout-web/src/app.ts` and `legacy/blackout-web/src/components/MessageItem.ts`
- Added `legacy/blackout-web/src/utils/escapeHtml.ts`

### Misc

- Added `validateProdSecrets()` call on API startup
- Removed `x-blackout-capabilities` header from mobile governance tab
- Deleted `apps/blackout-client/vite.config.ts` (superseded by `.js`)
- Changed `??` to `||` for default values in marketplace-related config where empty strings should fall through
