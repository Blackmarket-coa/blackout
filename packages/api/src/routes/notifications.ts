import { Hono } from 'hono';
import { z } from 'zod';
import { readJsonBody } from '../middleware/validate';
import { requireUser } from '../middleware/require-user';

/**
 * Notification rule storage backing the BKL-004 rules editor
 * (`GET/PUT/DELETE /v1/notifications/rules`) — the endpoints
 * `packages/blackout-sdk/src/notifications/actions.ts` has targeted since the
 * editor landed, implemented here for the first time (until now the editor's
 * optimistic writes had no server behind them). Adds Workstream F per-room
 * scoping: a rule may carry a `roomId`, and room-scoped rules override the
 * category-wide rule for that room (see `resolveEffectiveNotificationRule` in
 * the SDK).
 *
 * Rules are keyed per subject by `feature:category` plus the optional room
 * scope, so a category-wide rule and any number of room overrides coexist.
 * In-memory (single-process) like profileStore; the presence-digest endpoints
 * from the same SDK module remain unimplemented server-side.
 */

export interface StoredNotificationRule {
    feature: string;
    category: string;
    roomId?: string;
    hardCapPerDay: number;
    cooldownMinutes: number;
    quietHours?: { startUtc: string; endUtc: string };
}

const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const ruleSchema = z.object({
    feature: z.string().min(1).max(64),
    category: z.string().min(1).max(64),
    roomId: z.string().min(1).max(255).optional(),
    hardCapPerDay: z.number().int().min(0).max(10_000),
    cooldownMinutes: z
        .number()
        .int()
        .min(0)
        .max(24 * 60),
    quietHours: z
        .object({
            startUtc: z.string().regex(HHMM_RE, 'expected HH:MM'),
            endUtc: z.string().regex(HHMM_RE, 'expected HH:MM'),
        })
        .optional(),
});

/** subject → ruleKey → rule */
const rulesBySubject = new Map<string, Map<string, StoredNotificationRule>>();

const ruleKey = (feature: string, category: string, roomId?: string): string =>
    roomId ? `${feature}:${category}:${roomId}` : `${feature}:${category}`;

const notifications = new Hono();

notifications.get('/rules', (c) => {
    const user = requireUser(c);
    if (user instanceof Response) return user;
    const rules = [...(rulesBySubject.get(user.sub)?.values() ?? [])];
    return c.json({ subject: user.sub, rules });
});

notifications.put('/rules/:feature/:category', async (c) => {
    const user = requireUser(c);
    if (user instanceof Response) return user;

    const parsed = await readJsonBody(c, ruleSchema);
    if (parsed instanceof Response) return parsed;

    const { feature, category } = c.req.param();
    if (parsed.feature !== feature || parsed.category !== category) {
        return c.json(
            { code: 'invalid_request', message: 'Body feature/category must match the path' },
            400
        );
    }

    const stored: StoredNotificationRule = {
        feature: parsed.feature,
        category: parsed.category,
        roomId: parsed.roomId,
        hardCapPerDay: parsed.hardCapPerDay,
        cooldownMinutes: parsed.cooldownMinutes,
        quietHours: parsed.quietHours,
    };
    const subjectRules = rulesBySubject.get(user.sub) ?? new Map<string, StoredNotificationRule>();
    subjectRules.set(ruleKey(feature, category, parsed.roomId), stored);
    rulesBySubject.set(user.sub, subjectRules);
    return c.json(stored);
});

notifications.delete('/rules/:feature/:category', (c) => {
    const user = requireUser(c);
    if (user instanceof Response) return user;

    const { feature, category } = c.req.param();
    const roomId = c.req.query('roomId') || undefined;
    const subjectRules = rulesBySubject.get(user.sub);
    const removed = subjectRules?.delete(ruleKey(feature, category, roomId)) ?? false;
    if (!removed) {
        return c.json({ code: 'not_found', message: 'Rule not found' }, 404);
    }
    return c.body(null, 204);
});

/** Test-only helper used to reset state between integration tests. */
export function __resetNotificationRulesForTests(): void {
    rulesBySubject.clear();
}

export default notifications;
