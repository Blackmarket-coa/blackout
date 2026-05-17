import {
    PLAYBOOK_CATALOG,
    isPlaybookPhase,
    type DenPlaybookPayload,
    type PlaybookFeatures,
    type PlaybookId,
    type PlaybookPhase,
} from '@blackout/protocol';

/**
 * Picker answer space. The 3-question setup picker is the only consumer of
 * this module — every cell of the (4 × 5 × 4) answer matrix maps to a single
 * playbook id, and `resolvePlaybookFromPicker` is the lookup.
 *
 * Q1 size       : how many people will be in this den?
 * Q2 decisions  : how does the group prefer to decide?
 * Q3 resources  : what's the relationship to money / shared property?
 *
 * Names are intentionally vernacular rather than enterprise; copy is enforced
 * by the picker UI but the union literals here drive the lookup table.
 */
export type PickerSize = 'trio' | 'small' | 'medium' | 'constellation';
export type PickerDecisions =
    | 'one_trusted'
    | 'few_elected'
    | 'all_vote'
    | 'all_agree'
    | 'just_hang_out';
export type PickerResources =
    | 'no_money'
    | 'kitty'
    | 'treasury'
    | 'legal_entity';

export interface PickerAnswers {
    size: PickerSize;
    decisions: PickerDecisions;
    resources: PickerResources;
}

/**
 * Deterministic resolution table — every one of the 4 × 5 × 4 = 80 cells is
 * defined. Edits should preserve total coverage; the unit tests assert it.
 *
 * Design notes on a few non-obvious cells:
 *   • "just_hang_out" + any resources → Hearth always wins. The brief is firm
 *     that casual dens stay casual; we don't promote them into governance
 *     just because they have a shared kitty.
 *   • "one_trusted" + "legal_entity" → Order. The brief explicitly says
 *     authoritarian structures are first-class — surgical teams, religious
 *     orders, traditional firms.
 *   • "all_agree" + small/medium → Circle (under ~12, consensus is light) or
 *     Workshop (consent with rotating roles for larger).
 *   • "constellation" → Confluence (federation council) whenever any
 *     governance answer is given, regardless of decision shape, because at
 *     this scale delegation is the only thing that scales.
 */
type PickerKey = `${PickerSize}|${PickerDecisions}|${PickerResources}`;

const sizeAxis: readonly PickerSize[] = ['trio', 'small', 'medium', 'constellation'];
const decisionsAxis: readonly PickerDecisions[] = [
    'one_trusted',
    'few_elected',
    'all_vote',
    'all_agree',
    'just_hang_out',
];
const resourcesAxis: readonly PickerResources[] = ['no_money', 'kitty', 'treasury', 'legal_entity'];

const cellResolver = (
    size: PickerSize,
    decisions: PickerDecisions,
    resources: PickerResources
): PlaybookId => {
    // Casual escape hatch: just_hang_out always becomes Hearth, regardless of resources.
    if (decisions === 'just_hang_out') {
        return 'hearth';
    }

    // Authoritarian-with-legal-form is Order at every non-trio size — a
    // surgical team, a religious order, a traditional firm are all Order at
    // trio, small, medium, *or* constellation scale. The brief is explicit
    // that we don't refuse to model these structures.
    if (decisions === 'one_trusted' && resources === 'legal_entity' && size !== 'trio') {
        return 'order';
    }

    // Constellation scale: any governance shape resolves to Confluence except
    // Stream when decisions are liquid-style ("all_agree" at constellation is
    // effectively delegate-by-trust, which Stream models).
    if (size === 'constellation') {
        if (decisions === 'all_vote' && resources === 'legal_entity') return 'local';
        if (decisions === 'all_agree') return 'stream';
        return 'confluence';
    }

    // Trio (≤3): everyone-agrees + tiny → Circle; one_trusted → Hearth even
    // with money (it's a household, not an Order); few_elected at trio is
    // odd but we still try to honor it → Local lite.
    if (size === 'trio') {
        if (decisions === 'all_agree') return 'circle';
        if (decisions === 'all_vote') return 'circle';
        if (decisions === 'one_trusted') return 'hearth';
        if (decisions === 'few_elected') {
            return resources === 'no_money' ? 'circle' : 'local';
        }
    }

    // Small (4–12): consent at this size is the sociocratic sweet spot.
    if (size === 'small') {
        if (decisions === 'all_agree') {
            return resources === 'no_money' ? 'circle' : resources === 'kitty' ? 'circle' : 'grove';
        }
        if (decisions === 'one_trusted') return resources === 'no_money' ? 'hearth' : 'order';
        if (decisions === 'few_elected') return resources === 'kitty' ? 'grove' : 'local';
        if (decisions === 'all_vote') return 'local';
    }

    // Medium (13–80): Workshop / Commons / Local territory.
    if (size === 'medium') {
        if (decisions === 'all_agree') {
            return resources === 'legal_entity' ? 'commons' : 'workshop';
        }
        if (decisions === 'one_trusted') return 'order';
        if (decisions === 'few_elected') {
            return resources === 'legal_entity' ? 'commons' : 'workshop';
        }
        if (decisions === 'all_vote') return 'local';
    }

    // Fallback — should be unreachable given the matrix above.
    return 'hearth';
};

const buildLookupTable = (): Readonly<Record<PickerKey, PlaybookId>> => {
    const table: Record<string, PlaybookId> = {};
    for (const size of sizeAxis) {
        for (const decisions of decisionsAxis) {
            for (const resources of resourcesAxis) {
                const key: PickerKey = `${size}|${decisions}|${resources}`;
                table[key] = cellResolver(size, decisions, resources);
            }
        }
    }
    return Object.freeze(table);
};

export const PLAYBOOK_PICKER_TABLE: Readonly<Record<PickerKey, PlaybookId>> = buildLookupTable();

export const resolvePlaybookFromPicker = (answers: PickerAnswers): PlaybookId => {
    const key: PickerKey = `${answers.size}|${answers.decisions}|${answers.resources}`;
    return PLAYBOOK_PICKER_TABLE[key] ?? 'hearth';
};

/**
 * Hydrate a fresh `DenPlaybookPayload` from a playbook id and timestamps.
 * Picker → playbook id → this → state event. Users can edit any field
 * afterward through the same visual interface as the reveal.
 *
 * `mode` defaults to `'trial'` (J1): every new den starts in a 14-day
 * try-before-commit window. The brief's "every setting feels like a try"
 * posture lives here.
 */
export const createPlaybookPayload = (
    playbookId: PlaybookId,
    now: Date = new Date(),
    overrides: Partial<DenPlaybookPayload> = {}
): DenPlaybookPayload => {
    const entry = PLAYBOOK_CATALOG[playbookId];
    const iso = now.toISOString();
    return {
        playbookId: entry.id,
        name: entry.name,
        structure: entry.structure,
        leadership: entry.leadership,
        phase: 'spring',
        domain: '',
        features: { ...entry.features },
        accent: entry.accent,
        mode: 'trial',
        trialStartedAt: iso,
        createdAt: iso,
        updatedAt: iso,
        ...(entry.onboardingCreditGrant
            ? { onboardingCreditGrant: { ...entry.onboardingCreditGrant } }
            : {}),
        ...overrides,
    };
};

/**
 * Activity heuristic for the phenology bar. Pure function over a small
 * activity snapshot; consumers compute the snapshot from their own room
 * timeline state. The bar carries glanceable health *without* surveillance.
 */
export interface PlaybookActivitySnapshot {
    /** ms since the last timeline event in the den. */
    msSinceLastEvent: number;
    /** decisions (proposals reaching status === passed | failed) in the last 30 days. */
    decisionsLast30d: number;
    /** explicit compost state event present on the den. */
    composted: boolean;
}

const DAY_MS = 86_400_000;

export const phaseFromActivity = (
    snapshot: PlaybookActivitySnapshot,
    fallback: PlaybookPhase = 'summer'
): PlaybookPhase => {
    if (snapshot.composted) return 'compost';
    if (snapshot.msSinceLastEvent > 42 * DAY_MS) return 'winter';
    if (snapshot.msSinceLastEvent > 14 * DAY_MS) return 'autumn';
    if (snapshot.decisionsLast30d >= 3) return 'summer';
    if (snapshot.msSinceLastEvent < 3 * DAY_MS) return 'spring';
    return isPlaybookPhase(fallback) ? fallback : 'summer';
};

/**
 * Convenience: combine catalog defaults with a partial feature override.
 * Useful when a user nudges flags on the reveal screen before "Plant this den".
 */
export const featuresWithOverrides = (
    base: PlaybookFeatures,
    overrides: Partial<PlaybookFeatures>
): PlaybookFeatures => ({ ...base, ...overrides });
