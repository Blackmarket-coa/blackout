/**
 * Base URL the API client makes requests against. Lives in its own module
 * (not `client.ts`) so `client/blackoutApiSession.ts` can import it without a
 * cycle — `client.ts` imports the session helpers for its 401 re-exchange,
 * while the session module only needs the base URL.
 *
 * Empty string = same-origin, which is the supported production mode: nginx
 * proxies `/v1/*` to the API on the chat origin.
 */
const viteEnv =
    typeof import.meta !== 'undefined'
        ? (
              import.meta as {
                  env?: { VITE_API_BASE_URL?: string; PROD?: boolean; DEV?: boolean };
              }
          ).env
        : undefined;

if (viteEnv?.DEV && !viteEnv.VITE_API_BASE_URL) {
    // Dev-only: same-origin requests hit the Vite dev server, which serves SPA
    // HTML instead of JSON, so the var must be set locally. In production an
    // empty value is correct — nginx proxies /v1/* to the API on the same
    // origin (see infra/nginx/sites-available/theblackout.app.conf) — so we
    // deliberately don't warn there. Warn (not error) to keep e2e smoke gates,
    // which fail on console.error, green.
    // eslint-disable-next-line no-console
    console.warn(
        '[blackout] VITE_API_BASE_URL is not set. In local dev the client will issue same-origin requests to the Vite server and receive SPA HTML instead of JSON. See apps/blackout-client/.env.example.',
    );
}

export const API_BASE_URL = viteEnv?.VITE_API_BASE_URL ?? '';
