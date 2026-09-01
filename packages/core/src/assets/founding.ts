/**
 * Founding Contributor credentials.
 *
 * The people who made the first stickers, memes and coins are co-owners of what
 * the place became, and this records that in their identity rather than leaving
 * them as ordinary users who happened to be early.
 *
 * The rule is deliberately dull: be among the first N *approved* assets of a
 * kind. It cannot be bought, farmed by volume (each creator counts once per
 * kind), or granted by an admin's judgement. Ordinals are stamped at approval
 * and stored, so retiring an early asset never renumbers the people who came
 * after it.
 */

export const FOUNDING_CONTRIBUTOR_LIMIT = 50;

export type FoundingAssetKind = 'sticker' | 'meme' | 'coin';

/** True when this ordinal falls inside the founding window for its kind. */
export const isFoundingOrdinal = (ordinal: number | null): boolean =>
    ordinal !== null && ordinal >= 1 && ordinal <= FOUNDING_CONTRIBUTOR_LIMIT;

export interface FoundingCredential {
    kind: FoundingAssetKind;
    /** Their earliest founding ordinal for this kind. */
    ordinal: number;
    badgeId: string;
}

export const foundingBadgeId = (kind: FoundingAssetKind): string => `founding_${kind}_contributor`;

export interface FoundingAssetLike {
    creatorId: string;
    kind: string;
    status: string;
    foundingOrdinal: number | null;
}

/**
 * The founding credentials a person has earned.
 *
 * One per kind regardless of how many qualifying assets they made — the
 * credential says "you were here at the start", not "you uploaded the most" —
 * and their earliest ordinal is the one kept. Rejected and retired assets never
 * count: a credential should not rest on something later withdrawn.
 */
export function foundingCredentialsFor(
    creatorId: string,
    assets: readonly FoundingAssetLike[]
): FoundingCredential[] {
    const earliestByKind = new Map<FoundingAssetKind, number>();

    for (const asset of assets) {
        if (asset.creatorId !== creatorId) continue;
        if (asset.status !== 'approved') continue;
        if (!isFoundingOrdinal(asset.foundingOrdinal)) continue;
        const kind = asset.kind as FoundingAssetKind;
        const current = earliestByKind.get(kind);
        if (current === undefined || asset.foundingOrdinal! < current) {
            earliestByKind.set(kind, asset.foundingOrdinal!);
        }
    }

    return [...earliestByKind.entries()]
        .map(([kind, ordinal]) => ({ kind, ordinal, badgeId: foundingBadgeId(kind) }))
        .sort((a, b) => a.kind.localeCompare(b.kind));
}

/** How many founding slots remain for a kind, so the UI can say so honestly. */
export const foundingSlotsRemaining = (highestOrdinal: number): number =>
    Math.max(0, FOUNDING_CONTRIBUTOR_LIMIT - highestOrdinal);
