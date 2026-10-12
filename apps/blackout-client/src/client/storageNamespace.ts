import { isEmbedPath } from '../app/features/black-mask-embed/embedPaths';
import { panelSessionLengthsEnabled } from './panelSessionLengthsFlag';

/**
 * Where this page keeps its Matrix session, its Blackout API token and its
 * IndexedDB stores.
 *
 * With B3's client switch on (`panelSessionLengthsFlag.ts`), the Black Mask
 * chat panel (`/embed`, launch-plan steps B1 and B3) keeps its own, separate
 * from the full app's, whether or not the browser partitions an embedded
 * frame's storage:
 *
 * - The panel never runs on the full app's session, which has no chosen
 *   length, and the full app never picks up the panel's time-limited one.
 * - Signing in to the panel never overwrites the full app's stored session for
 *   the same user (both are keyed by user id), and pruning stale stores on
 *   either side never deletes the other's encryption keys.
 * - The Rust crypto store gets a per-device name in the panel. Under the SDK's
 *   default name there is one per origin, and two devices cannot share it.
 *
 * Decided once, from the switch and the path the page loaded on (the path the
 * same way `main.tsx` decides "panel or full app"), so nothing that happens
 * later in the page can move a session from one to the other. The full app's
 * names are exactly the ones it has always used, and with the switch off the
 * panel uses them too, exactly as before B3.
 */
export type ClientStorageNamespace = {
    readonly embed: boolean;
    readonly sessionMapKey: string;
    readonly apiTokenKey: string;
    readonly syncStorePrefix: string;
    readonly cryptoStorePrefix: string;
    /** IndexedDB name prefix for the Rust crypto store; undefined keeps the SDK default. */
    readonly rustCryptoPrefix: (userId: string, deviceId: string) => string | undefined;
    /** Prefix shared by every Rust crypto store of `userId`, for pruning; undefined when not per-device. */
    readonly rustCryptoUserPrefix: (userId: string) => string | undefined;
};

const FULL_APP: ClientStorageNamespace = {
    embed: false,
    sessionMapKey: 'blackout.matrix.sessions.v1',
    apiTokenKey: 'blackout.api.token',
    syncStorePrefix: 'blackout-sync-store:',
    cryptoStorePrefix: 'blackout-crypto-store:',
    rustCryptoPrefix: () => undefined,
    rustCryptoUserPrefix: () => undefined,
};

// The panel's keys extend the full app's, so the panic wipe's prefixes
// (`blackout.matrix.sessions`, `blackout.api.token`) cover both.
const PANEL: ClientStorageNamespace = {
    embed: true,
    sessionMapKey: 'blackout.matrix.sessions.embed.v1',
    apiTokenKey: 'blackout.api.token.embed',
    syncStorePrefix: 'blackout-embed-sync-store:',
    cryptoStorePrefix: 'blackout-embed-crypto-store:',
    rustCryptoPrefix: (userId, deviceId) => `blackout-embed-rust:${userId}:${deviceId}`,
    rustCryptoUserPrefix: (userId) => `blackout-embed-rust:${userId}:`,
};

const detect = (): ClientStorageNamespace => {
    // Switch off: the panel shares the full app's names, as before B3.
    if (!panelSessionLengthsEnabled()) return FULL_APP;
    try {
        return isEmbedPath(window.location.pathname) ? PANEL : FULL_APP;
    } catch {
        return FULL_APP;
    }
};

let current: ClientStorageNamespace = detect();

export const storageNamespace = (): ClientStorageNamespace => current;

/**
 * True only in the chat panel with B3's client switch on: the panel then keeps
 * its own session, asks for a session length at sign-in, never starts a
 * session without one, and shows its Sign out bar. False in the full app, and
 * in the panel while the switch is off (it then behaves exactly as before B3).
 */
export const panelSessionsActive = (): boolean => current.embed;

/**
 * Test-only: pick the panel (true, as if the switch were on and the page were
 * the panel) or full-app (false) namespace, or re-detect from the switch and
 * the current path (null).
 */
export const setStorageNamespaceForTests = (embed: boolean | null): void => {
    if (embed === null) current = detect();
    else current = embed ? PANEL : FULL_APP;
};
