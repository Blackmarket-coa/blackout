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
                  env?: { VITE_API_BASE_URL?: string; PROD?: boolean };
              }
          ).env
        : undefined;

if (viteEnv?.PROD && !viteEnv.VITE_API_BASE_URL) {
    // Warn (not error) so the e2e smoke gate — which fails on console.error
    // — stays green when the bundle is built without a base URL (CI, local
    // preview). Operators still see this in DevTools when they deploy a
    // misconfigured bundle.
    // eslint-disable-next-line no-console
    console.warn(
        '[blackout] VITE_API_BASE_URL is not set. The client will issue same-origin requests and likely receive SPA HTML instead of JSON. See apps/blackout-client/.env.example.',
    );
}

export const API_BASE_URL = viteEnv?.VITE_API_BASE_URL ?? '';
