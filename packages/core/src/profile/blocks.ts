/**
 * Modular profile layout — the profile as a homestead rather than a form.
 *
 * A profile is an ordered list of blocks the owner chooses and arranges. Order
 * is the array order; a hidden block keeps its place so unhiding it restores
 * the arrangement the owner built rather than appending to the end.
 *
 * Every role gets the same skeleton and surfaces different modules: a creator
 * pins their shop, a mutual-aid organizer their pledges, a general user their
 * people. There is no separate "creator profile" type.
 */

export const PROFILE_BLOCK_KINDS = [
    'bio',
    'status',
    'circle_map',
    'relay_wall',
    'coliseum_record',
    'creator_shop',
    'mutual_aid_ledger',
    'pinned_media',
    'wall',
    'links',
] as const;
export type ProfileBlockKind = typeof PROFILE_BLOCK_KINDS[number];

export const isProfileBlockKind = (value: unknown): value is ProfileBlockKind =>
    typeof value === 'string' && (PROFILE_BLOCK_KINDS as readonly string[]).includes(value);

export interface ProfileBlock {
    kind: ProfileBlockKind;
    /** Hidden blocks keep their slot, so unhiding restores the owner's order. */
    visible: boolean;
}

export interface ProfileLayout {
    blocks: ProfileBlock[];
}

/**
 * The arrangement a profile starts with. Bio and status first because they are
 * what a stranger reads to decide whether to connect; the rest follow in the
 * order most profiles end up using anyway. Blocks with nothing to show are
 * hidden by default rather than rendering as empty shelves.
 */
export const DEFAULT_PROFILE_LAYOUT: ProfileLayout = {
    blocks: [
        { kind: 'bio', visible: true },
        { kind: 'status', visible: true },
        { kind: 'circle_map', visible: true },
        { kind: 'relay_wall', visible: true },
        { kind: 'pinned_media', visible: true },
        { kind: 'wall', visible: true },
        { kind: 'links', visible: true },
        { kind: 'coliseum_record', visible: false },
        { kind: 'creator_shop', visible: false },
        { kind: 'mutual_aid_ledger', visible: false },
    ],
};

/**
 * Suggested starting arrangements per role. Only a *starting point* — the same
 * blocks are available to everyone, and any of them can be reordered or hidden
 * afterwards.
 */
export const ROLE_BLOCK_SUGGESTIONS = {
    creator: ['creator_shop', 'pinned_media', 'relay_wall'],
    organizer: ['mutual_aid_ledger', 'circle_map', 'relay_wall'],
    debater: ['coliseum_record', 'relay_wall', 'bio'],
    member: ['bio', 'circle_map', 'relay_wall'],
} as const satisfies Record<string, readonly ProfileBlockKind[]>;

export type ProfileRoleKey = keyof typeof ROLE_BLOCK_SUGGESTIONS;

/**
 * Normalize a stored (possibly partial or stale) layout.
 *
 * Unknown block kinds are dropped and blocks missing from the stored list are
 * appended hidden — so a release that adds a block never silently rearranges
 * someone's homestead, and a release that removes one never leaves a hole.
 * Duplicates collapse to their first occurrence.
 */
export function normalizeProfileLayout(input: unknown): ProfileLayout {
    const raw = (input as ProfileLayout | undefined)?.blocks;
    const blocks: ProfileBlock[] = [];
    const seen = new Set<ProfileBlockKind>();

    if (Array.isArray(raw)) {
        for (const entry of raw) {
            const kind = (entry as ProfileBlock | undefined)?.kind;
            if (!isProfileBlockKind(kind) || seen.has(kind)) continue;
            seen.add(kind);
            blocks.push({ kind, visible: (entry as ProfileBlock).visible !== false });
        }
    }

    for (const fallback of DEFAULT_PROFILE_LAYOUT.blocks) {
        if (seen.has(fallback.kind)) continue;
        seen.add(fallback.kind);
        blocks.push({ kind: fallback.kind, visible: false });
    }

    return { blocks };
}

/** Apply a role's suggestion: those blocks first and visible, everything else kept in order. */
export function applyRoleSuggestion(layout: ProfileLayout, role: ProfileRoleKey): ProfileLayout {
    const suggested = ROLE_BLOCK_SUGGESTIONS[role];
    const promoted = suggested.map((kind) => ({ kind, visible: true }));
    const rest = layout.blocks.filter(
        (block) => !(suggested as readonly ProfileBlockKind[]).includes(block.kind)
    );
    return { blocks: [...promoted, ...rest] };
}

/** The blocks a viewer actually renders, in order. */
export const visibleBlocks = (layout: ProfileLayout): ProfileBlockKind[] =>
    layout.blocks.filter((block) => block.visible).map((block) => block.kind);
