/**
 * Mjolnir moderation policy contracts (BKL-009).
 *
 * Mirrors `_port/src/mjolnir/{BanList,ListRule}.ts` plus the
 * `MjolnirUserSettingsTab` + protection-list surface, lifted into a typed
 * protocol so canonical and legacy hosts agree on the wire shape for
 * banlist subscriptions, protection toggles, and status updates.
 */

import type { EventEnvelope } from '../common/types';

export const MJOLNIR_PROTOCOL_VERSION = 1 as const;

export const MJOLNIR_EVENT_NAMES = {
    protectionChanged: 'co.bmc.moderation.mjolnir.protection.changed',
    banlistChanged: 'co.bmc.moderation.mjolnir.banlist.changed',
} as const;

export type MjolnirEventName =
    (typeof MJOLNIR_EVENT_NAMES)[keyof typeof MJOLNIR_EVENT_NAMES];

/**
 * Three canonical rule kinds. Mirrors `EventType.PolicyRule{User,Room,Server}`
 * (the Matrix spec types) — see `_port/src/mjolnir/BanList.ts:RULE_USER` etc.
 */
export type BanListRuleKind = 'user' | 'room' | 'server';

/**
 * Recommendation type for a ban-list rule. `ban` is the only recommendation
 * the canonical client honors today; `unban` is reserved for the rollback
 * envelope shape so receivers can distinguish "rule deleted" from "rule
 * downgraded to no-op".
 */
export type BanListRuleRecommendation = 'ban' | 'unban';

export interface BanListRulePayload {
    /** Rule id (server-issued; opaque to the SDK). */
    ruleId: string;
    /** Which kind of subject the rule targets. */
    kind: BanListRuleKind;
    /** Glob pattern (e.g. `@spam:*`, `*:bad.example`). */
    entity: string;
    /** Human-readable reason; informational only. */
    reason: string;
    /** Recommendation (`ban` for normal rules; `unban` for rollback). */
    recommendation: BanListRuleRecommendation;
    /** ISO-8601 timestamp the rule was created or last updated. */
    updatedAt: string;
}

/**
 * Operation applied in a banlist-changed envelope. `created` and `updated`
 * carry the new rule shape; `removed` carries only the rule id.
 */
export type BanListChangeOp = 'created' | 'updated' | 'removed';

export interface BanListChangedPayload {
    /** Banlist id the change applies to. */
    listId: string;
    /** ISO-8601 timestamp the change took effect. */
    changedAt: string;
    /** What happened. */
    op: BanListChangeOp;
    /** The full rule, present on `created` / `updated`. */
    rule?: BanListRulePayload;
    /** Rule id, present on `removed`. */
    removedRuleId?: string;
}

/**
 * State of a single protection (e.g. `BasicFloodingProtection`,
 * `MentionSpam`, `MessageIsVoice`). Mirrors the protection list rendered
 * by `_port`'s Mjolnir tab.
 */
export interface ProtectionDescriptor {
    /** Stable protection id. */
    id: string;
    /** Human-readable label. */
    label: string;
    /** Whether the protection is currently enabled. */
    enabled: boolean;
    /** Optional per-protection settings the canonical client may render. */
    settings?: Record<string, string | number | boolean>;
}

export interface ProtectionChangedPayload {
    /** Protection id whose state changed. */
    protectionId: string;
    /** Whether the protection is enabled after the change. */
    enabled: boolean;
    /** ISO-8601 timestamp the change took effect. */
    changedAt: string;
    /** Optional updated settings for the protection. */
    settings?: Record<string, string | number | boolean>;
}

export type ProtectionChangedEvent = EventEnvelope<
    'blackout.moderation.mjolnir.protection.changed',
    ProtectionChangedPayload
>;

export type BanListChangedEvent = EventEnvelope<
    'blackout.moderation.mjolnir.banlist.changed',
    BanListChangedPayload
>;
