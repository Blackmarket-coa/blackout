import { describe, expect, it } from 'vitest';
import {
    isBanListChanged,
    isProtectionChanged,
    MJOLNIR_EVENT_NAMES,
    type BanListChangedEvent,
    type BanListRulePayload,
    type ProtectionChangedEvent,
} from '@blackout/protocol';
import {
    applyBanListChange,
    classifyBanListEntity,
    createMjolnirActions,
    type BanListSnapshot,
} from '@blackout/sdk';
import type { ApiClient, ApiRequest } from '@blackout/sdk';

const buildClient = <T>(response: T) => {
    const calls: ApiRequest[] = [];
    const apiClient: ApiClient = async (request) => {
        calls.push(request);
        return response as never;
    };
    return { apiClient, calls };
};

describe('@blackout/protocol mjolnir event guards (BKL-009)', () => {
    it('publishes the canonical Matrix event types', () => {
        expect(MJOLNIR_EVENT_NAMES.protectionChanged).toBe(
            'co.bmc.moderation.mjolnir.protection.changed'
        );
        expect(MJOLNIR_EVENT_NAMES.banlistChanged).toBe(
            'co.bmc.moderation.mjolnir.banlist.changed'
        );
    });

    it('isProtectionChanged narrows valid envelopes', () => {
        const valid: ProtectionChangedEvent = {
            event: 'blackout.moderation.mjolnir.protection.changed',
            roomId: '!m:srv',
            senderId: '@admin:srv',
            occurredAt: '2026-04-30T00:00:00.000Z',
            payload: {
                protectionId: 'BasicFloodingProtection',
                enabled: true,
                changedAt: '2026-04-30T00:00:00.000Z',
            },
        };
        expect(isProtectionChanged(valid)).toBe(true);
        expect(isBanListChanged(valid)).toBe(false);
        expect(
            isProtectionChanged({ ...valid, payload: { protectionId: 'x' } })
        ).toBe(false);
    });

    it('isBanListChanged enforces op-specific payload shape', () => {
        const created: BanListChangedEvent = {
            event: 'blackout.moderation.mjolnir.banlist.changed',
            roomId: '!m:srv',
            senderId: '@admin:srv',
            occurredAt: '2026-04-30T00:00:00.000Z',
            payload: {
                listId: 'personal',
                changedAt: '2026-04-30T00:00:00.000Z',
                op: 'created',
                rule: {
                    ruleId: 'r-1',
                    kind: 'user',
                    entity: '@spam:bad.example',
                    reason: 'spammer',
                    recommendation: 'ban',
                    updatedAt: '2026-04-30T00:00:00.000Z',
                },
            },
        };
        expect(isBanListChanged(created)).toBe(true);

        // `created` must carry a rule.
        expect(
            isBanListChanged({ ...created, payload: { ...created.payload, rule: undefined } })
        ).toBe(false);

        // `removed` must carry a rule id.
        const removed = {
            ...created,
            payload: { ...created.payload, op: 'removed' as const, rule: undefined },
        };
        expect(isBanListChanged(removed)).toBe(false);
        expect(
            isBanListChanged({
                ...removed,
                payload: { ...removed.payload, removedRuleId: 'r-1' },
            })
        ).toBe(true);

        // Unknown op rejected.
        expect(
            isBanListChanged({ ...created, payload: { ...created.payload, op: 'rogue' } })
        ).toBe(false);
    });
});

describe('@blackout/sdk createMjolnirActions', () => {
    it('listBanLists hits the banlist directory', async () => {
        const { apiClient, calls } = buildClient({ subject: '@a:srv', lists: [] });
        const actions = createMjolnirActions(apiClient);
        await actions.listBanLists();
        expect(calls.at(-1)).toEqual({
            method: 'GET',
            path: '/v1/moderation/mjolnir/banlists',
        });
    });

    it('subscribe + unsubscribe encode the list id', async () => {
        const { apiClient, calls } = buildClient({} as BanListSnapshot);
        const actions = createMjolnirActions(apiClient);

        await actions.subscribeBanList('list 9');
        expect(calls.at(-1)).toEqual({
            method: 'POST',
            path: `/v1/moderation/mjolnir/banlists/${encodeURIComponent('list 9')}/subscribe`,
            body: {},
        });

        await actions.unsubscribeBanList('list 9');
        expect(calls.at(-1)).toEqual({
            method: 'DELETE',
            path: `/v1/moderation/mjolnir/banlists/${encodeURIComponent('list 9')}/subscribe`,
        });
    });

    it('addBanListRule + removeBanListRule encode segments and forward inputs', async () => {
        const { apiClient, calls } = buildClient<BanListChangedEvent>(
            {} as BanListChangedEvent
        );
        const actions = createMjolnirActions(apiClient);

        await actions.addBanListRule('personal', {
            kind: 'user',
            entity: '@spam:bad.example',
            reason: 'spammer',
        });
        expect(calls.at(-1)).toEqual({
            method: 'POST',
            path: '/v1/moderation/mjolnir/banlists/personal/rules',
            body: { kind: 'user', entity: '@spam:bad.example', reason: 'spammer' },
        });

        await actions.removeBanListRule('personal', 'rule 9');
        expect(calls.at(-1)).toEqual({
            method: 'DELETE',
            path: `/v1/moderation/mjolnir/banlists/personal/rules/${encodeURIComponent('rule 9')}`,
        });
    });

    it('listProtections + setProtectionEnabled hit the protection paths', async () => {
        const { apiClient, calls } = buildClient<ProtectionChangedEvent>(
            {} as ProtectionChangedEvent
        );
        const actions = createMjolnirActions(apiClient);

        await actions.listProtections();
        expect(calls.at(-1)).toEqual({
            method: 'GET',
            path: '/v1/moderation/mjolnir/protections',
        });

        await actions.setProtectionEnabled('BasicFloodingProtection', true);
        expect(calls.at(-1)).toEqual({
            method: 'PUT',
            path: '/v1/moderation/mjolnir/protections/BasicFloodingProtection',
            body: { enabled: true },
        });

        await actions.setProtectionEnabled('MentionSpam', true, { maxMentions: 5 });
        expect(calls.at(-1)?.body).toEqual({
            enabled: true,
            settings: { maxMentions: 5 },
        });
    });
});

describe('classifyBanListEntity', () => {
    it('classifies @user, !room, and bare-server entities', () => {
        expect(classifyBanListEntity('@spam:bad.example')).toBe('user');
        expect(classifyBanListEntity('!badroom:srv')).toBe('room');
        expect(classifyBanListEntity('*.bad.example')).toBe('server');
    });

    it('returns null for empty / whitespace-only entities', () => {
        expect(classifyBanListEntity('')).toBeNull();
        expect(classifyBanListEntity('   ')).toBeNull();
    });
});

describe('applyBanListChange', () => {
    const ruleA: BanListRulePayload = {
        ruleId: 'r-a',
        kind: 'user',
        entity: '@a:bad.example',
        reason: 'spam',
        recommendation: 'ban',
        updatedAt: '2026-04-29T00:00:00.000Z',
    };
    const ruleB: BanListRulePayload = {
        ruleId: 'r-b',
        kind: 'user',
        entity: '@b:bad.example',
        reason: 'spam',
        recommendation: 'ban',
        updatedAt: '2026-04-30T00:00:00.000Z',
    };
    const snapshot: BanListSnapshot = {
        listId: 'personal',
        label: 'Personal',
        subscribed: true,
        rules: [ruleB, ruleA],
    };

    it('returns the same reference on listId mismatch', () => {
        expect(
            applyBanListChange(snapshot, {
                listId: 'other',
                op: 'created',
                rule: { ...ruleA, ruleId: 'r-c' },
            })
        ).toBe(snapshot);
    });

    it('replaces a rule on `updated` and resorts newest-first', () => {
        const updatedA: BanListRulePayload = {
            ...ruleA,
            updatedAt: '2026-05-01T00:00:00.000Z',
        };
        const next = applyBanListChange(snapshot, {
            listId: 'personal',
            op: 'updated',
            rule: updatedA,
        });
        expect(next.rules.map((r) => r.ruleId)).toEqual(['r-a', 'r-b']);
        expect(next.rules[0].updatedAt).toBe('2026-05-01T00:00:00.000Z');
    });

    it('appends a new rule on `created` and resorts newest-first', () => {
        const ruleC: BanListRulePayload = {
            ruleId: 'r-c',
            kind: 'server',
            entity: '*.evil.example',
            reason: 'shadow',
            recommendation: 'ban',
            updatedAt: '2026-05-02T00:00:00.000Z',
        };
        const next = applyBanListChange(snapshot, {
            listId: 'personal',
            op: 'created',
            rule: ruleC,
        });
        expect(next.rules.map((r) => r.ruleId)).toEqual(['r-c', 'r-b', 'r-a']);
    });

    it('drops a rule on `removed`', () => {
        const next = applyBanListChange(snapshot, {
            listId: 'personal',
            op: 'removed',
            removedRuleId: 'r-b',
        });
        expect(next.rules.map((r) => r.ruleId)).toEqual(['r-a']);
    });

    it('returns the same reference when payload is malformed for the op', () => {
        expect(
            applyBanListChange(snapshot, {
                listId: 'personal',
                op: 'created',
                rule: undefined,
            })
        ).toBe(snapshot);
        expect(
            applyBanListChange(snapshot, {
                listId: 'personal',
                op: 'removed',
                removedRuleId: undefined,
            })
        ).toBe(snapshot);
    });
});
