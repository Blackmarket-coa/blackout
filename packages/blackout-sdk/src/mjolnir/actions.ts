import type {
    BanListChangedEvent,
    BanListRuleKind,
    BanListRulePayload,
    BanListRuleRecommendation,
    ProtectionChangedEvent,
    ProtectionDescriptor,
} from '@blackout/protocol';
import type { ApiClient } from '../client/types';

export type BanListSnapshot = {
    /** Banlist id (server-issued, opaque). */
    listId: string;
    /** Human-readable label (e.g. `personal`, `coc-violations`). */
    label: string;
    /** Whether the user is subscribed to this list. */
    subscribed: boolean;
    /** Current rules; ordered newest-first by `updatedAt`. */
    rules: BanListRulePayload[];
};

export type BanListsResponse = {
    subject: string;
    lists: BanListSnapshot[];
};

export type ProtectionsResponse = {
    subject: string;
    protections: ProtectionDescriptor[];
};

export type AddBanListRuleInput = {
    kind: BanListRuleKind;
    entity: string;
    reason: string;
    /** Defaults server-side to `ban`. */
    recommendation?: BanListRuleRecommendation;
};

export const createMjolnirActions = (client: ApiClient) => ({
    /**
     * Fetch every banlist the subject can see (personal + subscribed).
     * Backed by `GET /v1/moderation/mjolnir/banlists`.
     */
    listBanLists: () =>
        client<BanListsResponse>({
            method: 'GET',
            path: '/v1/moderation/mjolnir/banlists',
        }),
    /**
     * Subscribe to a remote banlist (mirrors `_port`'s "Subscribe to a list"
     * action). Server emits a `blackout.moderation.mjolnir.banlist.changed`
     * envelope with `op: 'created'` for each rule the subscription pulled.
     */
    subscribeBanList: (listId: string) =>
        client<BanListSnapshot>({
            method: 'POST',
            path: `/v1/moderation/mjolnir/banlists/${encodeURIComponent(listId)}/subscribe`,
            body: {},
        }),
    /**
     * Unsubscribe from a banlist. Server emits a banlist-changed envelope
     * with `op: 'removed'` for each rule that was sourced from the list.
     */
    unsubscribeBanList: (listId: string) =>
        client<BanListSnapshot>({
            method: 'DELETE',
            path: `/v1/moderation/mjolnir/banlists/${encodeURIComponent(listId)}/subscribe`,
        }),
    /**
     * Add a rule to a banlist. Server emits a banlist-changed envelope
     * with `op: 'created'` and the new rule.
     */
    addBanListRule: (listId: string, input: AddBanListRuleInput) =>
        client<BanListChangedEvent>({
            method: 'POST',
            path: `/v1/moderation/mjolnir/banlists/${encodeURIComponent(listId)}/rules`,
            body: input,
        }),
    /**
     * Remove a rule from a banlist. Server emits a banlist-changed envelope
     * with `op: 'removed'` and the rule id.
     */
    removeBanListRule: (listId: string, ruleId: string) =>
        client<BanListChangedEvent>({
            method: 'DELETE',
            path: `/v1/moderation/mjolnir/banlists/${encodeURIComponent(listId)}/rules/${encodeURIComponent(ruleId)}`,
        }),
    /**
     * Fetch the protection directory and current per-protection state.
     * Backed by `GET /v1/moderation/mjolnir/protections`.
     */
    listProtections: () =>
        client<ProtectionsResponse>({
            method: 'GET',
            path: '/v1/moderation/mjolnir/protections',
        }),
    /**
     * Toggle a protection. Server emits a
     * `blackout.moderation.mjolnir.protection.changed` envelope.
     */
    setProtectionEnabled: (
        protectionId: string,
        enabled: boolean,
        settings?: Record<string, string | number | boolean>
    ) =>
        client<ProtectionChangedEvent>({
            method: 'PUT',
            path: `/v1/moderation/mjolnir/protections/${encodeURIComponent(protectionId)}`,
            body: settings ? { enabled, settings } : { enabled },
        }),
});

/**
 * Pure helper: classifies a personal-rule entity string into a
 * `BanListRuleKind`. Mirrors `_port`'s `MjolnirUserSettingsTab`
 * heuristic (line 57-60): `@…` → user, `!…` → room, otherwise server
 * (glob applied to homeserver names). Returns `null` if the entity is
 * empty after trimming.
 */
export const classifyBanListEntity = (entity: string): BanListRuleKind | null => {
    const trimmed = entity.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith('@')) return 'user';
    if (trimmed.startsWith('!')) return 'room';
    return 'server';
};

/**
 * Pure helper: applies a `blackout.moderation.mjolnir.banlist.changed`
 * envelope to a local snapshot. Returns the same reference if the
 * envelope's `listId` doesn't match. Rules are kept newest-first by
 * `updatedAt` after each apply.
 */
export const applyBanListChange = (
    snapshot: BanListSnapshot,
    payload: {
        listId: string;
        op: 'created' | 'updated' | 'removed';
        rule?: BanListRulePayload;
        removedRuleId?: string;
    }
): BanListSnapshot => {
    if (payload.listId !== snapshot.listId) return snapshot;

    let nextRules: BanListRulePayload[];
    if (payload.op === 'removed') {
        if (!payload.removedRuleId) return snapshot;
        nextRules = snapshot.rules.filter((rule) => rule.ruleId !== payload.removedRuleId);
    } else {
        if (!payload.rule) return snapshot;
        const without = snapshot.rules.filter((rule) => rule.ruleId !== payload.rule!.ruleId);
        nextRules = [payload.rule, ...without];
    }

    nextRules = [...nextRules].sort(
        (left, right) =>
            new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
    );

    return { ...snapshot, rules: nextRules };
};

export type {
    BanListChangedEvent,
    BanListRuleKind,
    BanListRulePayload,
    BanListRuleRecommendation,
    ProtectionChangedEvent,
    ProtectionDescriptor,
};
