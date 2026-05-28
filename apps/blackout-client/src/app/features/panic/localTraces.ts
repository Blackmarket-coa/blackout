/**
 * "Panic wipe" — clear locally-stored sensitive traces this app keeps in
 * localStorage. Pure over a minimal key/value store interface so it's fully
 * unit-testable and reusable for the real `window.localStorage`.
 *
 * Two tiers:
 *  - SENSITIVE_TRACE_PREFIXES: privacy-relevant local state (drafts, burner
 *    metadata, saved steganography passphrases, reading position, etc.) — wiped
 *    by default.
 *  - SESSION_PREFIXES: the Matrix session + API token — only wiped when the
 *    user explicitly opts to sign out as part of the panic, since clearing them
 *    logs the device out (irreversible without the account's credentials).
 */

export const SENSITIVE_TRACE_PREFIXES = [
    'blackout.draft.', // unsent message drafts (content)
    'blackout.burners.', // burner identity metadata
    'blackout.burner.primary', // remembered primary while in burner mode
    'blackout.settings.steganography', // saved stego passphrases
    'blackout.settings.data-deletion', // data-broker request identifiers (PII)
    'blackout.ephemeral.', // ephemeral-drop view counts
    'blackout.timeline.scroll', // per-room reading position (metadata)
] as const;

export const SESSION_PREFIXES = [
    'blackout.matrix.sessions', // active + stored Matrix sessions
    'blackout.api.token', // Blackout API JWT
] as const;

export interface KeyValueStore {
    readonly length: number;
    key(index: number): string | null;
    removeItem(key: string): void;
}

const hasAnyPrefix = (key: string, prefixes: readonly string[]): boolean =>
    prefixes.some((prefix) => key.startsWith(prefix));

/** Snapshot all keys in the store matching any of the given prefixes. */
export const listMatchingKeys = (store: KeyValueStore, prefixes: readonly string[]): string[] => {
    const matches: string[] = [];
    for (let i = 0; i < store.length; i += 1) {
        const key = store.key(i);
        if (key && hasAnyPrefix(key, prefixes)) matches.push(key);
    }
    return matches;
};

export interface WipeOptions {
    /** Also clear the Matrix session + API token (signs the device out). */
    includeSession?: boolean;
}

/**
 * Remove all sensitive-trace keys (and, when requested, session keys). Keys are
 * snapshotted before removal so live iteration over a shrinking store can't skip
 * entries. Returns the keys removed.
 */
export const wipeSensitiveTraces = (store: KeyValueStore, options: WipeOptions = {}): string[] => {
    const prefixes = options.includeSession
        ? [...SENSITIVE_TRACE_PREFIXES, ...SESSION_PREFIXES]
        : SENSITIVE_TRACE_PREFIXES;
    const keys = listMatchingKeys(store, prefixes);
    for (const key of keys) store.removeItem(key);
    return keys;
};
