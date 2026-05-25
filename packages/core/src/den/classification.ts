/**
 * Den classification.
 *
 * Every den (a Matrix room) has a type that determines which surfaces it
 * exposes. The type rides on a Matrix state event keyed at (type, "") so it is
 * editable and federated like every other den-level fact.
 *
 * The four types map to the platform's discussion-space taxonomy:
 *   • public    — open debates, trending topics, discovery
 *   • coalition — organizing, projects, governance, local communities
 *   • private   — teams, trusted groups, moderation
 *   • ai        — the ONLY place AI tooling is permitted
 *
 * AI is deliberately confined to AI dens so that human reasoning, evidence,
 * and authentic participation remain the default everywhere else.
 */

export const DEN_TYPES = ['public', 'coalition', 'private', 'ai'] as const;
export type DenType = (typeof DEN_TYPES)[number];

export const DEFAULT_DEN_TYPE: DenType = 'public';

/** State event written at (type, "") carrying the den's classification. */
export const DEN_CLASSIFICATION_STATE_EVENT_TYPE = 'co.bmc.den.classification' as const;

export interface DenClassificationContent {
    denType: DenType;
    /** Optional human-readable note for moderators. */
    description?: string;
}

export function isDenType(value: unknown): value is DenType {
    return typeof value === 'string' && (DEN_TYPES as readonly string[]).includes(value);
}

/** Resolve a den's type from its classification content, defaulting to public. */
export function resolveDenType(content: DenClassificationContent | undefined): DenType {
    if (content && isDenType(content.denType)) return content.denType;
    return DEFAULT_DEN_TYPE;
}

/**
 * The single gate every AI surface must consult. AI tooling is enabled only
 * inside AI dens.
 */
export function aiToolsEnabled(denType: DenType): boolean {
    return denType === 'ai';
}
