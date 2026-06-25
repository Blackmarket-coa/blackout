/**
 * In-memory user-settings store backing `GET/PUT /v1/settings/:scope/:category`.
 *
 * Mirrors the `SettingsBucket` shape the client SDK expects
 * (`packages/blackout-sdk/src/settings/actions.ts`): a per-(subject, scope,
 * category) map of opaque string keys → JSON values. The canonical client reads
 * the `(account, labs)` bucket at boot to hydrate per-user feature-flag
 * overrides (`flag.<name>` keys) and writes it when a Labs toggle flips.
 *
 * Ephemeral, like `profileStore` — values reset on restart. Durable persistence
 * can follow the same pg-migration pattern as users/sessions if cross-restart
 * settings become a requirement.
 */
import type { SettingsValue } from '@blackout/protocol';

const buckets = new Map<string, Record<string, SettingsValue>>();

// `scope` and `category` come from a fixed enum and `subject` is a UUID/matrix
// id, so none contain a pipe — safe to join the composite key with one.
const bucketKey = (subject: string, scope: string, category: string): string =>
    `${subject}|${scope}|${category}`;

/** Returns a copy of the stored bucket values, or an empty map when unset. */
export function getSettingsBucket(
    subject: string,
    scope: string,
    category: string,
): Record<string, SettingsValue> {
    return { ...(buckets.get(bucketKey(subject, scope, category)) ?? {}) };
}

/**
 * Upsert a single key. `value === null` clears the override (revert to default),
 * matching the SDK contract. Returns the full updated value map so callers can
 * echo the new bucket back to the client.
 */
export function setSettingsKey(
    subject: string,
    scope: string,
    category: string,
    key: string,
    value: SettingsValue,
): Record<string, SettingsValue> {
    const mapKey = bucketKey(subject, scope, category);
    const current = { ...(buckets.get(mapKey) ?? {}) };
    if (value === null) {
        delete current[key];
    } else {
        current[key] = value;
    }
    buckets.set(mapKey, current);
    return current;
}

/** Test-only helper used to reset state between integration tests. */
export function __resetSettingsStoreForTests(): void {
    buckets.clear();
}
