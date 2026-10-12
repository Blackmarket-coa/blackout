/**
 * Client switch for the chat panel's session lengths (launch-plan step B3,
 * docs/black-mask-chat-panel-and-account-link.md section 3). **Off by default.**
 *
 * Off: the panel (`/embed`) signs in and keeps its session exactly as it did
 * before B3. It shows no length choice, sends nothing to the session-length
 * endpoints, uses the full app's storage names (so it shares the full app's
 * session, as before), has no Sign out bar and deletes nothing extra when the
 * homeserver drops its session.
 *
 * On: panel sign-in asks how long the session lasts, binds the length to the
 * new device on the homeserver, and the panel keeps its own session, separate
 * from the full app's. The servers enforce the length on their own switches
 * (the homeserver module's `session_lengths_enabled`, the API's
 * `BLACKOUT_SESSION_LENGTHS`); until both answer, the panel offers only
 * "Until I sign out". The full app is the same either way.
 *
 * Set at build time: `VITE_BLACKOUT_PANEL_SESSION_LENGTHS` when the client is
 * built (`apps/blackout-client/.env.example`). Vite writes its value into the
 * bundle in place of the `import.meta.env` reference below, the way
 * `VITE_FBM_MANAGE_ORIGINS` and `VITE_MATRIX_HOMESERVER_URL` reach the bundle.
 * No build in this repository sets it. It accepts the values the API's
 * `BLACKOUT_SESSION_LENGTHS` accepts; anything else, unset included, is off.
 *
 * Why not one of the client's other switches:
 * - `FeatureFlags` (`app/core/features/featureFlags.ts`): its beta switch
 *   (`VITE_BLACKOUT_BETA_UNLOCK_ALL`, which
 *   `deploy/docker/feature-presets.env.template` sets) is meant to turn every
 *   flag there on, and this one must only ever be turned on on purpose. Its
 *   overrides are also read at run time from `process.env` and
 *   `Function('return import.meta')`; in a browser `process` is undefined and
 *   that `Function` throws, so a build-time setting would not reach the page.
 * - `config.json`: fetched after the page starts, but the storage names must be
 *   fixed before the stored session is first read (`storageNamespace.ts`).
 */
const TRUTHY = new Set(['1', 'true', 'yes', 'on']);

/** Pure: is this raw environment value "on"? Anything else, unset included, is off. */
export const panelSessionLengthsEnabledIn = (raw: unknown): boolean =>
    typeof raw === 'string' && TRUTHY.has(raw.trim().toLowerCase());

/** The build's setting of the switch. */
export const panelSessionLengthsEnabled = (): boolean =>
    panelSessionLengthsEnabledIn(import.meta.env.VITE_BLACKOUT_PANEL_SESSION_LENGTHS);
