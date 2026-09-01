/**
 * Bounded profile palettes and the milestones that unlock them.
 *
 * Deliberately a fixed set rather than a colour picker: profiles should read as
 * one ecosystem, and unbounded theming makes a network look like a ransom note.
 * Every palette sits in the solarpunk–Afrofuturist range the rest of the product
 * uses.
 *
 * Unlocks are tied to things a person genuinely did with other people — relaying,
 * being relayed onward, building a Circle — not to time served or money spent.
 * Nothing here is purchasable, and locked palettes are shown as locked with
 * their requirement stated, never hidden.
 */

export interface ProfilePalette {
    id: string;
    label: string;
    description: string;
    /** Maps onto ProfileCustomTheme token keys. */
    tokens: {
        accent: string;
        panelBg: string;
        panelFg: string;
        headerBg: string;
        linkColor: string;
    };
    /** Null when available to everyone from day one. */
    unlock: ProfileUnlockRule | null;
}

/**
 * What a palette asks for. Every rule is a count the person can see on their own
 * profile, so a locked palette can always say exactly how far off it is.
 */
export type ProfileUnlockRule =
    | { kind: 'relays_made'; atLeast: number }
    | { kind: 'circle_size'; atLeast: number }
    | { kind: 'circle_overlaps'; atLeast: number }
    | { kind: 'chain_depth_reached'; atLeast: number }
    | { kind: 'people_reached'; atLeast: number };

export const PROFILE_PALETTES: readonly ProfilePalette[] = [
    {
        id: 'canopy_floor',
        label: 'Canopy floor',
        description: 'Deep greens under a high canopy. The default ground.',
        tokens: {
            accent: '#D7FF3F',
            panelBg: '#101A14',
            panelFg: '#E8F5EC',
            headerBg: '#14201A',
            linkColor: '#9BE870',
        },
        unlock: null,
    },
    {
        id: 'clay_and_brass',
        label: 'Clay and brass',
        description: 'Warm earth with brass edges.',
        tokens: {
            accent: '#E8A33D',
            panelBg: '#1A1410',
            panelFg: '#F5EBE0',
            headerBg: '#231A14',
            linkColor: '#F0C674',
        },
        unlock: null,
    },
    {
        id: 'first_light',
        label: 'First light',
        description: 'For carrying something onward for the first time.',
        tokens: {
            accent: '#7FE3D4',
            panelBg: '#0E1A1C',
            panelFg: '#E4F5F2',
            headerBg: '#132326',
            linkColor: '#7FE3D4',
        },
        unlock: { kind: 'relays_made', atLeast: 1 },
    },
    {
        id: 'gathered',
        label: 'Gathered',
        description: 'For a Circle of ten.',
        tokens: {
            accent: '#C89BFF',
            panelBg: '#15101E',
            panelFg: '#EFE8F7',
            headerBg: '#1D1729',
            linkColor: '#C89BFF',
        },
        unlock: { kind: 'circle_size', atLeast: 10 },
    },
    {
        id: 'overlap',
        label: 'Overlap',
        description: 'For five circles that overlap yours.',
        tokens: {
            accent: '#FF9EC4',
            panelBg: '#1A1017',
            panelFg: '#F7E8EF',
            headerBg: '#241620',
            linkColor: '#FF9EC4',
        },
        unlock: { kind: 'circle_overlaps', atLeast: 5 },
    },
    {
        id: 'long_relay',
        label: 'Long relay',
        description: 'For appearing in a chain ten hops deep.',
        tokens: {
            accent: '#FFD166',
            panelBg: '#151206',
            panelFg: '#F7F2E0',
            headerBg: '#1F1A0C',
            linkColor: '#FFD166',
        },
        unlock: { kind: 'chain_depth_reached', atLeast: 10 },
    },
    {
        id: 'wide_light',
        label: 'Wide light',
        description: 'For something you relayed reaching fifty people.',
        tokens: {
            accent: '#9BE870',
            panelBg: '#0E1710',
            panelFg: '#E9F7E6',
            headerBg: '#142018',
            linkColor: '#9BE870',
        },
        unlock: { kind: 'people_reached', atLeast: 50 },
    },
];

export const PROFILE_PALETTE_IDS = PROFILE_PALETTES.map((p) => p.id);

export const findProfilePalette = (id: string | null | undefined): ProfilePalette | null =>
    PROFILE_PALETTES.find((palette) => palette.id === id) ?? null;

/** The counts an unlock rule is measured against. */
export interface ProfileMilestoneStats {
    relaysMade: number;
    circleSize: number;
    circleOverlaps: number;
    /** Deepest chain this person appears in. */
    chainDepthReached: number;
    /** Distinct people downstream of their relays. */
    peopleReached: number;
}

const statFor = (rule: ProfileUnlockRule, stats: ProfileMilestoneStats): number => {
    switch (rule.kind) {
        case 'relays_made':
            return stats.relaysMade;
        case 'circle_size':
            return stats.circleSize;
        case 'circle_overlaps':
            return stats.circleOverlaps;
        case 'chain_depth_reached':
            return stats.chainDepthReached;
        case 'people_reached':
            return stats.peopleReached;
    }
};

export interface PaletteAvailability {
    palette: ProfilePalette;
    unlocked: boolean;
    /** Present when locked: where they are and what it takes. */
    progress: { current: number; required: number } | null;
}

/**
 * Every palette with its state. Locked ones are returned too, with their
 * progress, so the UI can show them as locked rather than pretending they do
 * not exist — the same honesty the Illumination meter applies to unlit areas.
 */
export function paletteAvailability(stats: ProfileMilestoneStats): PaletteAvailability[] {
    return PROFILE_PALETTES.map((palette) => {
        if (!palette.unlock) return { palette, unlocked: true, progress: null };
        const current = statFor(palette.unlock, stats);
        const required = palette.unlock.atLeast;
        return current >= required
            ? { palette, unlocked: true, progress: null }
            : { palette, unlocked: false, progress: { current, required } };
    });
}

export const isPaletteUnlocked = (id: string, stats: ProfileMilestoneStats): boolean =>
    paletteAvailability(stats).find((entry) => entry.palette.id === id)?.unlocked ?? false;
