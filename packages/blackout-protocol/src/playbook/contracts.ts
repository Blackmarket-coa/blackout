/**
 * Den playbook contracts.
 *
 * A "playbook" is a named starting point for a den (Matrix room): the same
 * primitive grows in capability by choosing a playbook at creation time and
 * editing parameters later. Playbooks are not a closed taxonomy — every
 * parameter remains editable in plain language afterward.
 *
 * The two orthogonal axes that drive visual signature and governance defaults:
 *   • Structure  → leaf-shape badge
 *   • Leadership → single-stroke glyph
 *
 * Lifecycle phase drives the phenology bar; everything else is metadata.
 *
 * Vocabulary cross-reference: this surface borrows naming and posture from
 * Loomio's proposal-template work and Decidim's "Participant Experience" copy.
 * No code is lifted; only the conceptual shape of "named processes, not
 * abstract forms."
 */

import type { EventEnvelope } from '../common/types';

export const PLAYBOOK_PROTOCOL_VERSION = 1 as const;

export const PLAYBOOK_IDS = [
    'hearth',
    'circle',
    'grove',
    'workshop',
    'commons',
    'local',
    'confluence',
    'order',
    'stream',
] as const;
export type PlaybookId = (typeof PLAYBOOK_IDS)[number];

export const PLAYBOOK_STRUCTURES = [
    'flat',
    'hierarchical',
    'federated',
    'nested',
] as const;
export type PlaybookStructure = (typeof PLAYBOOK_STRUCTURES)[number];

export const PLAYBOOK_LEADERSHIPS = [
    'appointed',
    'elected',
    'rotating',
    'sortition',
    'consent',
    'consensus',
    'majority',
    'liquid',
] as const;
export type PlaybookLeadership = (typeof PLAYBOOK_LEADERSHIPS)[number];

export const PLAYBOOK_PHASES = [
    'spring',
    'summer',
    'autumn',
    'winter',
    'compost',
] as const;
export type PlaybookPhase = (typeof PLAYBOOK_PHASES)[number];

export const PLAYBOOK_MODES = ['trial', 'committed'] as const;
export type PlaybookMode = (typeof PLAYBOOK_MODES)[number];

/**
 * Feature flags derived from the playbook. The picker resolves these once at
 * creation; users can edit them later via the same visual interface as the
 * initial reveal.
 */
export interface PlaybookFeatures {
    /** Proposals, rounds, roles render in the timeline and radial wedge. */
    governanceActive: boolean;
    /** Treasury views (List + Garden) and snapshot events enabled. */
    treasury: boolean;
    /** Round primitive enabled (turn-queue affordance on timeline events). */
    rounds: boolean;
    /** Role cards + phenology + elections enabled. */
    roles: boolean;
    /** Voice-note input is the first-class round response mode. */
    voiceNotesOnRounds: boolean;
    /** Founding-document templates seeded at creation. */
    documents: boolean;
}

/**
 * Optional onboarding credit grant. v1 ships the metadata; demurrage decay is
 * v2 (and pilot-branch-specific for the childcare Credits sub-ledger).
 */
export interface PlaybookOnboardingGrant {
    /** Numeric amount encoded as a string to preserve precision. */
    amount: string;
    /** Currency symbol or sub-ledger code (e.g. "USDC", "FBM-HOUR", "CCC"). */
    currency: string;
    /** Optional annual demurrage rate as a string (e.g. "0.06" = 6%/yr). */
    demurrage?: {
        ratePerYear: string;
    };
}

/**
 * The state-event payload written to `co.bmc.den.playbook` (state key "").
 *
 * Everything except `playbookId` is editable later through the playbook
 * settings surface. `playbookId` itself is also editable but doing so is a
 * deliberate act — switching playbooks is a den-level decision, not a setting
 * toggle.
 */
export interface DenPlaybookPayload {
    playbookId: PlaybookId;
    /** Human-readable name. Defaults from PLAYBOOK_CATALOG; user can rename. */
    name: string;
    structure: PlaybookStructure;
    leadership: PlaybookLeadership;
    phase: PlaybookPhase;
    /**
     * One sentence describing what this circle has authority over (S3 domain).
     * Editable by consent. Empty string for casual playbooks (Hearth).
     */
    domain: string;
    features: PlaybookFeatures;
    /** Accent color drawn from PLAYBOOK_ACCENT_PALETTE; not a free RGB picker. */
    accent: PlaybookAccentToken;
    mode: PlaybookMode;
    /** ISO-8601 timestamp the trial period began; only present when mode === 'trial'. */
    trialStartedAt?: string;
    /** ISO-8601 timestamp; lets the settings surface show lineage. */
    createdAt: string;
    /** ISO-8601 timestamp of the last edit. */
    updatedAt: string;
    /** Optional onboarding credit grant (J2). */
    onboardingCreditGrant?: PlaybookOnboardingGrant;
}

/**
 * The nine accent tokens. Names refer to phenomena, not products — so they
 * survive a palette refresh without invalidating playbook state events.
 * Concrete hex values live in the client theme layer.
 */
export const PLAYBOOK_ACCENT_PALETTE = [
    'moss',
    'fern',
    'pine',
    'saffron',
    'ember',
    'clay',
    'lichen',
    'slate',
    'dusk',
] as const;
export type PlaybookAccentToken = (typeof PLAYBOOK_ACCENT_PALETTE)[number];

/**
 * Default values for each playbook. The picker resolves answers to a playbook
 * id, then reads this catalog to produce a DenPlaybookPayload. Users can
 * override every field on the reveal screen and afterward.
 *
 * Description copy is intentionally three short sentences: the first names
 * the archetype, the second describes the decision posture, the third
 * describes the resources/treasury shape.
 */
export interface PlaybookCatalogEntry {
    id: PlaybookId;
    name: string;
    description: string;
    structure: PlaybookStructure;
    leadership: PlaybookLeadership;
    accent: PlaybookAccentToken;
    features: PlaybookFeatures;
    onboardingCreditGrant?: PlaybookOnboardingGrant;
}

const ZERO_FEATURES: PlaybookFeatures = {
    governanceActive: false,
    treasury: false,
    rounds: false,
    roles: false,
    voiceNotesOnRounds: false,
    documents: false,
};

const FULL_FEATURES: PlaybookFeatures = {
    governanceActive: true,
    treasury: true,
    rounds: true,
    roles: true,
    voiceNotesOnRounds: true,
    documents: true,
};

export const PLAYBOOK_CATALOG: Readonly<Record<PlaybookId, PlaybookCatalogEntry>> = Object.freeze({
    hearth: {
        id: 'hearth',
        name: 'Hearth',
        description:
            'A small casual den, like a few friends around a fire. No formal decisions, no roles, no shared property. You can grow into a different playbook whenever you want.',
        structure: 'flat',
        leadership: 'consensus',
        accent: 'ember',
        features: { ...ZERO_FEATURES },
    },
    circle: {
        id: 'circle',
        name: 'Circle',
        description:
            'An affinity group where everyone agrees together. Decisions are surfaced as consent checks, never votes. A shared kitty holds the small things you split.',
        structure: 'flat',
        leadership: 'consent',
        accent: 'fern',
        features: {
            ...FULL_FEATURES,
            roles: false,
            voiceNotesOnRounds: false,
        },
    },
    grove: {
        id: 'grove',
        name: 'Grove',
        description:
            'A mutual-aid co-op exchanging time and care rather than cash. Decisions are by consent, with a steward circle rotating through. Your time-bank seeds the den with an onboarding grant.',
        structure: 'nested',
        leadership: 'consent',
        accent: 'moss',
        features: { ...FULL_FEATURES },
        onboardingCreditGrant: {
            amount: '4',
            currency: 'FBM-HOUR',
        },
    },
    workshop: {
        id: 'workshop',
        name: 'Workshop',
        description:
            'A worker co-op with sociocratic circles and rotating roles. Domains scope each circle to one sentence of authority. The treasury is shared and visible.',
        structure: 'nested',
        leadership: 'rotating',
        accent: 'pine',
        features: { ...FULL_FEATURES },
    },
    commons: {
        id: 'commons',
        name: 'Commons',
        description:
            'A multi-stakeholder co-op — parents and educators, tenants and landlords, growers and eaters. Consent decisions, member circles by stake, transparent treasury.',
        structure: 'federated',
        leadership: 'consent',
        accent: 'lichen',
        features: { ...FULL_FEATURES },
    },
    local: {
        id: 'local',
        name: 'Local',
        description:
            'A tenant union, neighborhood council, or chapter. Stewards are elected; the room votes on the things that need a vote. The treasury supports dues and direct action.',
        structure: 'hierarchical',
        leadership: 'elected',
        accent: 'clay',
        features: { ...FULL_FEATURES },
    },
    confluence: {
        id: 'confluence',
        name: 'Confluence',
        description:
            'A federation council where delegates from member co-ops meet. Membership is by delegation, not individuals. Decisions ripple back to the constituent dens.',
        structure: 'federated',
        leadership: 'consent',
        accent: 'saffron',
        features: { ...FULL_FEATURES },
    },
    order: {
        id: 'order',
        name: 'Order',
        description:
            'A hierarchical organization with appointed leaders — a surgical team, a religious order, a traditional firm. Roles are durable, not rotated. Treasury and proposals follow chain of command.',
        structure: 'hierarchical',
        leadership: 'appointed',
        accent: 'slate',
        features: {
            ...FULL_FEATURES,
            voiceNotesOnRounds: false,
        },
    },
    stream: {
        id: 'stream',
        name: 'Stream',
        description:
            'A liquid-democracy group: every member can delegate their voice on any topic, transitively. Roles are emergent from sustained delegation. Treasury follows the same flow.',
        structure: 'flat',
        leadership: 'liquid',
        accent: 'dusk',
        features: { ...FULL_FEATURES },
    },
});

export const isPlaybookId = (value: unknown): value is PlaybookId =>
    typeof value === 'string' && (PLAYBOOK_IDS as readonly string[]).includes(value);

export const isPlaybookStructure = (value: unknown): value is PlaybookStructure =>
    typeof value === 'string' && (PLAYBOOK_STRUCTURES as readonly string[]).includes(value);

export const isPlaybookLeadership = (value: unknown): value is PlaybookLeadership =>
    typeof value === 'string' && (PLAYBOOK_LEADERSHIPS as readonly string[]).includes(value);

export const isPlaybookPhase = (value: unknown): value is PlaybookPhase =>
    typeof value === 'string' && (PLAYBOOK_PHASES as readonly string[]).includes(value);

export const isPlaybookMode = (value: unknown): value is PlaybookMode =>
    typeof value === 'string' && (PLAYBOOK_MODES as readonly string[]).includes(value);

export const isPlaybookAccentToken = (value: unknown): value is PlaybookAccentToken =>
    typeof value === 'string' && (PLAYBOOK_ACCENT_PALETTE as readonly string[]).includes(value);

const isPlaybookFeatures = (value: unknown): value is PlaybookFeatures => {
    if (!value || typeof value !== 'object') return false;
    const f = value as Record<string, unknown>;
    return (
        typeof f.governanceActive === 'boolean' &&
        typeof f.treasury === 'boolean' &&
        typeof f.rounds === 'boolean' &&
        typeof f.roles === 'boolean' &&
        typeof f.voiceNotesOnRounds === 'boolean' &&
        typeof f.documents === 'boolean'
    );
};

export const isDenPlaybookPayload = (value: unknown): value is DenPlaybookPayload => {
    if (!value || typeof value !== 'object') return false;
    const p = value as Record<string, unknown>;
    if (!isPlaybookId(p.playbookId)) return false;
    if (typeof p.name !== 'string') return false;
    if (!isPlaybookStructure(p.structure)) return false;
    if (!isPlaybookLeadership(p.leadership)) return false;
    if (!isPlaybookPhase(p.phase)) return false;
    if (typeof p.domain !== 'string') return false;
    if (!isPlaybookFeatures(p.features)) return false;
    if (!isPlaybookAccentToken(p.accent)) return false;
    if (!isPlaybookMode(p.mode)) return false;
    if (typeof p.createdAt !== 'string') return false;
    if (typeof p.updatedAt !== 'string') return false;
    return true;
};

export interface PlaybookProtocolSurface {
    owner: '@blackout/protocol';
    version: typeof PLAYBOOK_PROTOCOL_VERSION;
    policy: 'additive-only-minor';
}

export const PLAYBOOK_PROTOCOL_SURFACE: PlaybookProtocolSurface = {
    owner: '@blackout/protocol',
    version: PLAYBOOK_PROTOCOL_VERSION,
    policy: 'additive-only-minor',
};

export type DenPlaybookSet = EventEnvelope<
    'blackout.den.playbook.set',
    DenPlaybookPayload
>;
