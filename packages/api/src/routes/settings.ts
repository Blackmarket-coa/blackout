import { Hono } from 'hono';
import { z } from 'zod';
import type { SettingsValue } from '@blackout/protocol';
import { requireUser } from '../middleware/require-user';
import { readJsonBody } from '../middleware/validate';
import { emitDomainEvent } from '../modules/domain-events';
import { getSettingsBucket, setSettingsKey } from '../services/settingsStore';

const settings = new Hono();

// Canonical settings taxonomy — mirrors @blackout/protocol `SettingsScope` /
// `SettingsCategory`. Validated so the bucket key space stays bounded and a
// typo'd path can't silently mint a new bucket. The client reads/writes the
// `(account, labs)` bucket for per-user feature-flag overrides.
const SCOPES = ['device', 'account'] as const;
const CATEGORIES = ['preferences', 'sidebar', 'labs'] as const;

const isScope = (value: string): boolean => (SCOPES as readonly string[]).includes(value);
const isCategory = (value: string): boolean =>
    (CATEGORIES as readonly string[]).includes(value);

// SettingsValue is any JSON value (incl. `null`, which clears the override).
// `value` may be absent in a malformed body; we coerce that to `null` below.
const putSchema = z.object({ value: z.unknown() });

const MAX_VALUE_BYTES = 16_384;
const MAX_KEY_LENGTH = 256;

/**
 * GET /v1/settings/:scope/:category
 * Returns the full value map for the authenticated subject's bucket, or an empty
 * map when nothing has been saved. Matches the SDK's `SettingsBucketResponse`.
 */
settings.get('/:scope/:category', (c) => {
    const user = requireUser(c, 'Sign in to view settings');
    if (user instanceof Response) return user;

    const { scope, category } = c.req.param();
    if (!isScope(scope) || !isCategory(category)) {
        return c.json(
            { code: 'invalid_request', message: 'Unknown settings scope or category' },
            400,
        );
    }

    const values = getSettingsBucket(user.sub, scope, category);
    return c.json({ subject: user.sub, bucket: { scope, category, values } });
});

/**
 * PUT /v1/settings/:scope/:category/:key
 * Upsert a single key (`{ value }`; `value: null` clears it). Emits a
 * `settings.changed` domain event and echoes the updated bucket so the client
 * can replace its local snapshot atomically.
 */
settings.put('/:scope/:category/:key', async (c) => {
    const user = requireUser(c, 'Sign in to change settings');
    if (user instanceof Response) return user;

    const { scope, category, key } = c.req.param();
    if (!isScope(scope) || !isCategory(category)) {
        return c.json(
            { code: 'invalid_request', message: 'Unknown settings scope or category' },
            400,
        );
    }
    if (key.length === 0 || key.length > MAX_KEY_LENGTH) {
        return c.json({ code: 'invalid_request', message: 'Invalid settings key' }, 400);
    }

    const parsed = await readJsonBody(c, putSchema);
    if (parsed instanceof Response) return parsed;

    // Coerce a missing `value` to `null` (clear), preserving falsy JSON values
    // (`false`/`0`/`''`) since `??` only catches null/undefined.
    const value = (parsed.value ?? null) as SettingsValue;
    if (value !== null && JSON.stringify(value).length > MAX_VALUE_BYTES) {
        return c.json({ code: 'invalid_request', message: 'Settings value too large' }, 400);
    }

    const values = setSettingsKey(user.sub, scope, category, key, value);
    const event = emitDomainEvent({
        module: 'settings',
        type: 'settings.changed',
        payload: { subject: user.sub, scope, category, key, value },
    });

    return c.json({ subject: user.sub, bucket: { scope, category, values }, event });
});

export default settings;
