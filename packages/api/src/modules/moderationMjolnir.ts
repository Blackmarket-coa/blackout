import { Hono } from 'hono';
import { z } from 'zod';
import { readJsonBody } from '../middleware/validate';
import { requireAuthenticatedUser, requireDomainCapability } from './authz';
import type { FeatureModule } from './types';

/**
 * Mjolnir banlist + protection backend (Workstream E). Implements the REST
 * surface `createMjolnirActions` in `packages/blackout-sdk` has targeted since
 * BKL-009 landed the settings UI — until now the SDK called endpoints that
 * did not exist in this repo, so `MjolnirSettingsPage` always fell back to its
 * empty stub. Response shapes mirror the SDK/protocol contracts
 * (`BanListSnapshot`, `ProtectionDescriptor`, and the
 * `blackout.moderation.mjolnir.*.changed` envelopes).
 *
 * In-memory and per-subject, like profileStore / the notification-rules
 * store: each subject gets a `personal` list plus a subscribable seeded
 * community list, and the standard protection directory. Enforcement (the
 * bot actually acting on these rules) remains the Draupnir sidecar's job —
 * this is the policy store the client edits.
 */

type RuleKind = 'user' | 'room' | 'server';
type Recommendation = 'ban' | 'unban';

interface StoredRule {
    ruleId: string;
    kind: RuleKind;
    entity: string;
    reason: string;
    recommendation: Recommendation;
    updatedAt: string;
}

interface StoredList {
    listId: string;
    label: string;
    subscribed: boolean;
    rules: Map<string, StoredRule>;
}

interface Protection {
    id: string;
    label: string;
    enabled: boolean;
    settings?: Record<string, string | number | boolean>;
}

interface SubjectState {
    lists: Map<string, StoredList>;
    protections: Map<string, Protection>;
}

const subjects = new Map<string, SubjectState>();

const seedSubject = (): SubjectState => ({
    lists: new Map<string, StoredList>([
        ['personal', { listId: 'personal', label: 'personal', subscribed: true, rules: new Map() }],
        [
            'community-baseline',
            {
                listId: 'community-baseline',
                label: 'Community baseline',
                subscribed: false,
                rules: new Map<string, StoredRule>([
                    [
                        'baseline-1',
                        {
                            ruleId: 'baseline-1',
                            kind: 'server',
                            entity: '*.spam.example',
                            reason: 'Known spam homeserver pattern',
                            recommendation: 'ban',
                            updatedAt: '2026-05-01T00:00:00.000Z',
                        },
                    ],
                    [
                        'baseline-2',
                        {
                            ruleId: 'baseline-2',
                            kind: 'user',
                            entity: '@spam:*',
                            reason: 'Spam account glob',
                            recommendation: 'ban',
                            updatedAt: '2026-05-01T00:00:00.000Z',
                        },
                    ],
                ]),
            },
        ],
    ]),
    protections: new Map<string, Protection>([
        [
            'BasicFloodingProtection',
            {
                id: 'BasicFloodingProtection',
                label: 'Basic flooding protection',
                enabled: false,
                settings: { maxPerMinute: 10 },
            },
        ],
        [
            'MentionSpam',
            {
                id: 'MentionSpam',
                label: 'Mention spam',
                enabled: false,
                settings: { maxMentions: 8 },
            },
        ],
        [
            'JoinWaveShortCircuit',
            {
                id: 'JoinWaveShortCircuit',
                label: 'Join-wave short circuit',
                enabled: false,
                settings: { timescaleMinutes: 60, maxPer: 40 },
            },
        ],
    ]),
});

const stateFor = (subject: string): SubjectState => {
    const existing = subjects.get(subject);
    if (existing) return existing;
    const seeded = seedSubject();
    subjects.set(subject, seeded);
    return seeded;
};

/** Snapshot shape the SDK's `BanListSnapshot` expects (rules newest-first). */
const snapshot = (list: StoredList) => ({
    listId: list.listId,
    label: list.label,
    subscribed: list.subscribed,
    rules: [...list.rules.values()].sort(
        (left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
    ),
});

const banlistChangedEnvelope = (
    subject: string,
    payload: Record<string, unknown>
): Record<string, unknown> => ({
    event: 'blackout.moderation.mjolnir.banlist.changed',
    roomId: '',
    senderId: subject,
    occurredAt: new Date().toISOString(),
    payload,
});

const addRuleSchema = z.object({
    kind: z.enum(['user', 'room', 'server']),
    entity: z.string().min(1).max(255),
    reason: z.string().max(500),
    recommendation: z.enum(['ban', 'unban']).optional(),
});

const setProtectionSchema = z.object({
    enabled: z.boolean(),
    settings: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
});

function createMjolnirRouter() {
    const mjolnir = new Hono();

    mjolnir.get('/banlists', (c) => {
        const denied = requireDomainCapability(c, 'moderation', 'read');
        if (denied) return denied;
        const subject = requireAuthenticatedUser(c)!;
        const state = stateFor(subject);
        return c.json({ subject, lists: [...state.lists.values()].map(snapshot) });
    });

    mjolnir.post('/banlists/:listId/subscribe', (c) => {
        const denied = requireDomainCapability(c, 'moderation', 'write');
        if (denied) return denied;
        const subject = requireAuthenticatedUser(c)!;
        const list = stateFor(subject).lists.get(c.req.param('listId'));
        if (!list) return c.json({ code: 'not_found', message: 'Banlist not found' }, 404);
        list.subscribed = true;
        return c.json(snapshot(list));
    });

    mjolnir.delete('/banlists/:listId/subscribe', (c) => {
        const denied = requireDomainCapability(c, 'moderation', 'write');
        if (denied) return denied;
        const subject = requireAuthenticatedUser(c)!;
        const list = stateFor(subject).lists.get(c.req.param('listId'));
        if (!list) return c.json({ code: 'not_found', message: 'Banlist not found' }, 404);
        if (list.listId === 'personal') {
            return c.json(
                { code: 'invalid_request', message: 'Cannot unsubscribe your personal list' },
                400
            );
        }
        list.subscribed = false;
        return c.json(snapshot(list));
    });

    mjolnir.post('/banlists/:listId/rules', async (c) => {
        const denied = requireDomainCapability(c, 'moderation', 'write');
        if (denied) return denied;
        const subject = requireAuthenticatedUser(c)!;

        const parsed = await readJsonBody(c, addRuleSchema);
        if (parsed instanceof Response) return parsed;

        const list = stateFor(subject).lists.get(c.req.param('listId'));
        if (!list) return c.json({ code: 'not_found', message: 'Banlist not found' }, 404);

        const rule: StoredRule = {
            ruleId: crypto.randomUUID(),
            kind: parsed.kind,
            entity: parsed.entity,
            reason: parsed.reason,
            recommendation: parsed.recommendation ?? 'ban',
            updatedAt: new Date().toISOString(),
        };
        list.rules.set(rule.ruleId, rule);

        return c.json(
            banlistChangedEnvelope(subject, {
                listId: list.listId,
                changedAt: rule.updatedAt,
                op: 'created',
                rule,
            })
        );
    });

    mjolnir.delete('/banlists/:listId/rules/:ruleId', (c) => {
        const denied = requireDomainCapability(c, 'moderation', 'write');
        if (denied) return denied;
        const subject = requireAuthenticatedUser(c)!;

        const { listId, ruleId } = c.req.param();
        const list = stateFor(subject).lists.get(listId);
        if (!list || !list.rules.delete(ruleId)) {
            return c.json({ code: 'not_found', message: 'Rule not found' }, 404);
        }

        return c.json(
            banlistChangedEnvelope(subject, {
                listId: list.listId,
                changedAt: new Date().toISOString(),
                op: 'removed',
                removedRuleId: ruleId,
            })
        );
    });

    mjolnir.get('/protections', (c) => {
        const denied = requireDomainCapability(c, 'moderation', 'read');
        if (denied) return denied;
        const subject = requireAuthenticatedUser(c)!;
        const state = stateFor(subject);
        return c.json({ subject, protections: [...state.protections.values()] });
    });

    mjolnir.put('/protections/:protectionId', async (c) => {
        const denied = requireDomainCapability(c, 'moderation', 'write');
        if (denied) return denied;
        const subject = requireAuthenticatedUser(c)!;

        const parsed = await readJsonBody(c, setProtectionSchema);
        if (parsed instanceof Response) return parsed;

        const protection = stateFor(subject).protections.get(c.req.param('protectionId'));
        if (!protection) {
            return c.json({ code: 'not_found', message: 'Protection not found' }, 404);
        }

        protection.enabled = parsed.enabled;
        if (parsed.settings) {
            protection.settings = { ...protection.settings, ...parsed.settings };
        }

        return c.json({
            event: 'blackout.moderation.mjolnir.protection.changed',
            roomId: '',
            senderId: subject,
            occurredAt: new Date().toISOString(),
            payload: {
                protectionId: protection.id,
                enabled: protection.enabled,
                changedAt: new Date().toISOString(),
                settings: protection.settings,
            },
        });
    });

    return mjolnir;
}

/** Test-only helper used to reset state between integration tests. */
export function __resetMjolnirStoreForTests(): void {
    subjects.clear();
}

export const moderationMjolnirModule: FeatureModule = {
    id: 'moderation/mjolnir',
    mountPath: '/moderation/mjolnir',
    registerRoutes: createMjolnirRouter,
};
