# The web client's CSP and WebAssembly (2026-11-21)

Found while evaluating whether a Godot game build could run inside the client
(`docs/product/COALITION_GAME_REUSE_EVALUATION.md`), and checked before
anything was changed.

## Found

-   **The repository's nginx CSP stops the web client starting encryption.**
    `infra/single-server-baseline/nginx/snippets/security-headers.conf` and
    `infra/nginx/snippets/security-headers.conf` send `script-src 'self'`, and
    the Black Mask panel's CSP maps in both site configurations repeat it. The
    snippet is included at server level on the chat origin, so the client's
    pages carry it. Under that directive Chromium refuses to compile
    WebAssembly. The web client depends on WebAssembly for encryption:
    `apps/blackout-client/src/client/initMatrix.ts` calls matrix-js-sdk's
    `initRustCrypto`, which calls `initAsync()` in
    `@matrix-org/matrix-sdk-crypto-wasm` (18.0.0), which runs
    `WebAssembly.instantiateStreaming`.
-   **It fails closed.** `MatrixBootstrapper.tsx` sets `crypto_failed` when
    crypto cannot start, and a failure in `initMatrixFromStoredSession` sets
    `logged_out`. Nothing is sent unencrypted; the client cannot be used for
    encrypted chat.
-   **The live site is not affected today.** A request to
    `https://theblackout.app/` on 2026-11-21 returned no
    `Content-Security-Policy` header (nor `Strict-Transport-Security` or
    `Referrer-Policy`, which the baseline also sends), so the live chat origin
    is not served by these configurations as written. The break would appear
    when they are deployed.
-   The desktop app's own CSP (`blackout-desktop/src-tauri/tauri.conf.json`)
    already allows `'wasm-unsafe-eval'`.

## Done

`script-src 'self'` became `script-src 'self' 'wasm-unsafe-eval'` in the six
places that send it: both `security-headers.conf` snippets and the default
and relaxed values of `$black_mask_panel_csp` in both site configurations.
No `add_header` directive was added or removed, so which headers each
location inherits is unchanged.

`'wasm-unsafe-eval'` allows compiling WebAssembly and nothing else: it does not
allow `eval` or new JavaScript sources. Scripts still load only from the
origin, so only code that can already run on the page can compile a module.

## Checked

-   **Chromium 153, the real crypto package.** A page loading
    `@matrix-org/matrix-sdk-crypto-wasm` 18.0.0 from the client's
    `node_modules` and calling `initAsync()`: under the old policy it fails
    ("Compiling or instantiating WebAssembly module violates the following
    Content Security policy directive … "script-src 'self'""); with
    `'wasm-unsafe-eval'` it succeeds.
-   **Through the baseline nginx.** Both configurations, before and after,
    in scratch copies (hostnames resolved to 127.0.0.1, a self-signed
    certificate, IPv6 listens removed, upstreams replaced by stand-ins; the
    frontend stand-in sends the client image's `frame-ancestors 'none'` CSP):
    -   `nginx -t` passes for all four.
    -   The derived baseline trees differ in exactly three lines, each only in
        `script-src`.
    -   Response headers at 30 locations across the chat, API, Matrix and TURN
        hosts and port 80: the only difference is `script-src`, at the 11
        chat-origin locations that carry the CSP (`/`, `/embed`, `/embed/…`,
        `/v1/`, `/i/`, `/c/`, `/tiles/`, both `.well-known/matrix` documents,
        another path, and `chat.theblackout.app`). The other headers are the
        same at every location, and the API, Matrix and TURN hosts send no CSP
        before or after. The same holds for `infra/nginx`.
    -   End to end: Chromium loading `https://theblackout.app/` through the
        baseline nginx, with the real crypto package served by the frontend
        stand-in: `initAsync()` fails under the old configuration and succeeds
        under the new one. The browser trusted only the test certificate
        (`--ignore-certificate-errors-spki-list` with its key's hash) and
        could resolve no other host.
-   `tools/ci/check-embed-proxy-framing.mjs` passes (the relaxed panel CSP
    still equals the snippet except for `frame-ancestors`) and its 56 tests
    pass.

## Not checked

-   Firefox and Safari: only Chromium was run here.
-   The client's full start-up against a homeserver under the new policy
    (the check above stops at the crypto library's start).
-   Whatever serves the live site: it sends neither this CSP nor HSTS. Which
    headers it should send is a deployment decision recorded here, not made.

## Operator action

A deployment that copied the baseline's `nginx/` files before this change
should copy `snippets/security-headers.conf` and
`sites-available/theblackout.app.conf` again, then run
`docker compose exec reverse-proxy nginx -t` and reload, as for any nginx
change (`docs/runbooks/SPATIAL_LAYER_BASE.md` describes the live directory).
