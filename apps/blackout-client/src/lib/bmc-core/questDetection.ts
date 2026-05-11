import type {
    DenPlaybookPayload,
    QuestId,
    RolePayload,
} from '@blackout/protocol';
import type { ConsentReaction } from './consent';

/**
 * Quest signature detection (J3).
 *
 * Pure inputs → pure output: given the events / state a user has touched,
 * which onboarding quests should be marked complete? Used by the
 * QuestSheet UI to auto-tick boxes as soon as the user has done the
 * underlying thing, without explicit reporting.
 *
 * Each quest's signature is intentionally cheap:
 *
 *   first-round           → user opened *any* round (as facilitator)
 *   first-consent         → user reacted 🌱/🌾/🪨 on any consent proposal
 *   first-role-nomination → user holds at least one governance role (i.e.
 *                           someone nominated them — for v1 we accept
 *                           "I hold a role" as the proxy)
 *   first-domain          → user has edited a playbook so the den has a
 *                           non-empty `domain` sentence
 *
 * The detection deliberately accepts evidence from any room; quests are
 * per-user and once-only.
 */
export interface QuestEvidence {
    /** Matrix user id we're checking quests for. */
    userId: string;
    /** Any rounds the user has facilitated (we only need their facilitator id). */
    facilitatedRounds: ReadonlyArray<{ facilitator: string }>;
    /** Consent reactions the user has cast. */
    consentReactions: ReadonlyArray<Pick<ConsentReaction, 'reactorId' | 'key'>>;
    /** Governance roles the user currently holds (across dens). */
    rolesHeld: ReadonlyArray<Pick<RolePayload, 'holderId'>>;
    /** Playbooks the user has authored a non-empty domain for. */
    domainsAuthored: ReadonlyArray<Pick<DenPlaybookPayload, 'domain'>>;
}

export function detectQuestCompletions(input: QuestEvidence): ReadonlySet<QuestId> {
    const out = new Set<QuestId>();

    if (input.facilitatedRounds.some((r) => r.facilitator === input.userId)) {
        out.add('first-round');
    }

    if (input.consentReactions.some((r) => r.reactorId === input.userId)) {
        out.add('first-consent');
    }

    if (input.rolesHeld.some((r) => r.holderId === input.userId)) {
        // Holding a role implies someone nominated and consented to you.
        out.add('first-role-nomination');
    }

    if (input.domainsAuthored.some((p) => typeof p.domain === 'string' && p.domain.trim().length > 0)) {
        out.add('first-domain');
    }

    return out;
}

/**
 * Narrative beat for a completed quest — used by the J6 quest log.
 * Maps each quest id to a short user-facing phrase. The brief calls
 * for "narrative beats, not XP/badges."
 */
export const QUEST_NARRATIVE: Record<QuestId, string> = {
    'first-round': 'You opened your first Round.',
    'first-consent': 'You cast your first consent reaction.',
    'first-role-nomination': 'You took on your first role.',
    'first-domain': 'You wrote a domain sentence.',
};
