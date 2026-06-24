/**
 * The gamification banlist (System 5 — cooperative gamification).
 *
 * This is the single canonical, machine-readable definition of the
 * anti-dark-pattern constraints that every cooperative/gamified surface in the
 * platform must satisfy. The prose previously lived only in scattered code
 * comments (`quests/contracts.ts`, the party hook) and the design spec; this
 * module makes it one source of truth that docs, UI, and tests can all consume.
 *
 * The rules encode Yu-kai Chou's White-Hat stance (lead with Epic Meaning,
 * Accomplishment, Empowerment, Relatedness; avoid Scarcity/Unpredictability/
 * Loss-&-Avoidance), the self-determination-theory warning against competitive
 * ranking read as surveillance, Qiao et al. on shared *goals* over shared
 * *rewards*, and Duolingo's documented lesson that leniency beats punishment.
 *
 * Enforcement: `gamificationBanlist.test.ts` asserts this rule set is stable
 * and scans the cooperative feature surfaces for the banned patterns below.
 */

export const GAMIFICATION_BANLIST_VERSION = 1 as const;

export const GAMIFICATION_BANLIST_RULE_IDS = [
    'no-manufactured-urgency',
    'no-guilt-notifications',
    'no-monetized-loss-recovery',
    'opt-in-comparison',
    'aggregate-not-individual',
    'identity-not-status',
    'no-governance-trade',
    'forgiveness-over-punishment',
] as const;

export type GamificationBanlistRuleId = (typeof GAMIFICATION_BANLIST_RULE_IDS)[number];

export interface GamificationBanlistRule {
    id: GamificationBanlistRuleId;
    /** Short human-readable name. */
    title: string;
    /** The hard constraint, phrased as what is forbidden / required. */
    rule: string;
    /** Why the rule exists — the evidence or principle behind it. */
    rationale: string;
}

export const GAMIFICATION_BANLIST: readonly GamificationBanlistRule[] = Object.freeze([
    {
        id: 'no-manufactured-urgency',
        title: 'No manufactured urgency',
        rule: 'Never create streak anxiety, countdown pressure, or loss-aversion timers to drive engagement.',
        rationale:
            'Black-Hat Scarcity/Loss-&-Avoidance drives make users feel anxious and addicted; Duolingo-style streak anxiety is the cautionary tale.',
    },
    {
        id: 'no-guilt-notifications',
        title: 'No guilt notifications',
        rule: 'No escalating "you missed X days" or sad-mascot notifications that shame inaction.',
        rationale:
            'Guilt-driven re-engagement is a documented dark pattern and decouples engagement from real value.',
    },
    {
        id: 'no-monetized-loss-recovery',
        title: 'No monetized loss recovery',
        rule: 'Lost progress is never a paid recovery lever (no purchasable streak repair, etc.).',
        rationale:
            'Monetizing loss aversion is manipulative; forgiveness should be free and built-in.',
    },
    {
        id: 'opt-in-comparison',
        title: 'Comparison is opt-in',
        rule: 'Any leaderboard or ranking is opt-in, relative-to-self, and secondary — never mandatory or primary.',
        rationale:
            'Leaderboards are of ambivalent value and can be perceived as surveillance and crowd out cooperation (SDT; CHW study).',
    },
    {
        id: 'aggregate-not-individual',
        title: 'Collective progress is aggregate-only',
        rule: 'Shared-goal progress shows totals and counts, never a per-member breakdown or ranking.',
        rationale:
            'Emphasize shared goals over shared rewards (Qiao et al.) so members feel a common purpose, not a rank.',
    },
    {
        id: 'identity-not-status',
        title: 'Identity-forming, not status-conferring',
        rule: 'Progression is narrative/identity-forming; it must not confer comparative social status.',
        rationale:
            'White-Hat drives (Epic Meaning, Accomplishment, Empowerment) build durable intrinsic motivation; status games do not.',
    },
    {
        id: 'no-governance-trade',
        title: 'XP never buys governance power',
        rule: 'Gamification points/XP never unlock governance votes, roles, or privileges.',
        rationale:
            'Reputation and play must not become a path to capture cooperative decision-making.',
    },
    {
        id: 'forgiveness-over-punishment',
        title: 'Forgiveness over punishment',
        rule: 'Prefer grace periods and no-penalty pauses over punitive mechanics.',
        rationale:
            "Duolingo's own data shows leniency (streak freezes) raised daily active learners — forgiveness beats punishment.",
    },
]);

export const isGamificationBanlistRuleId = (value: unknown): value is GamificationBanlistRuleId =>
    typeof value === 'string' &&
    (GAMIFICATION_BANLIST_RULE_IDS as readonly string[]).includes(value);

export interface GamificationProtocolSurface {
    owner: '@blackout/protocol';
    version: typeof GAMIFICATION_BANLIST_VERSION;
    policy: 'additive-only-minor';
}

export const GAMIFICATION_PROTOCOL_SURFACE: GamificationProtocolSurface = {
    owner: '@blackout/protocol',
    version: GAMIFICATION_BANLIST_VERSION,
    policy: 'additive-only-minor',
};
