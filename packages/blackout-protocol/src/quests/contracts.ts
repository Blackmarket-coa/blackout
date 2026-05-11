/**
 * User quest sheet (J3).
 *
 * Per-user, per-first-den, one-time. Stored as Matrix account data so the
 * sheet follows the user across devices without polluting room state.
 *
 * Banlist carve-out (per the user override): RPG-style onboarding is in
 * scope, bounded by "personal not comparative, non-coercive, identity-
 * forming not status-conferring." Quests reward narrative beats — they
 * never trade for governance privileges.
 */

import type { EventEnvelope } from '../common/types';

export const QUESTS_PROTOCOL_VERSION = 1 as const;

export const QUEST_IDS = [
    'first-round',
    'first-consent',
    'first-role-nomination',
    'first-domain',
] as const;
export type QuestId = (typeof QUEST_IDS)[number];

export const isQuestId = (value: unknown): value is QuestId =>
    typeof value === 'string' && (QUEST_IDS as readonly string[]).includes(value);

export interface CompletedQuest {
    id: QuestId;
    /** ISO-8601 timestamp the quest completed. */
    completedAt: string;
    /** Optional room where the completing event landed. */
    roomId?: string;
}

export interface UserQuestsPayload {
    /** Quest ids the user still has active. Absent ids are inactive. */
    activeQuests: ReadonlyArray<QuestId>;
    /** Quests the user has already completed; never re-emitted. */
    completedQuests: ReadonlyArray<CompletedQuest>;
    /** ISO-8601 timestamp the user dismissed the sheet, if any. */
    dismissedAt?: string;
}

export const isCompletedQuest = (value: unknown): value is CompletedQuest => {
    if (!value || typeof value !== 'object') return false;
    const p = value as Record<string, unknown>;
    return isQuestId(p.id) && typeof p.completedAt === 'string';
};

export const isUserQuestsPayload = (value: unknown): value is UserQuestsPayload => {
    if (!value || typeof value !== 'object') return false;
    const p = value as Record<string, unknown>;
    if (!Array.isArray(p.activeQuests)) return false;
    if (!p.activeQuests.every(isQuestId)) return false;
    if (!Array.isArray(p.completedQuests)) return false;
    if (!p.completedQuests.every(isCompletedQuest)) return false;
    if (p.dismissedAt !== undefined && typeof p.dismissedAt !== 'string') return false;
    return true;
};

/** Default sheet for a brand-new user: all four onboarding quests active. */
export const INITIAL_USER_QUESTS: UserQuestsPayload = {
    activeQuests: [...QUEST_IDS],
    completedQuests: [],
};

export type UserQuestsAccountDataEvent = EventEnvelope<
    'blackout.user.quests',
    UserQuestsPayload
>;

export interface QuestsProtocolSurface {
    owner: '@blackout/protocol';
    version: typeof QUESTS_PROTOCOL_VERSION;
    policy: 'additive-only-minor';
}

export const QUESTS_PROTOCOL_SURFACE: QuestsProtocolSurface = {
    owner: '@blackout/protocol',
    version: QUESTS_PROTOCOL_VERSION,
    policy: 'additive-only-minor',
};
