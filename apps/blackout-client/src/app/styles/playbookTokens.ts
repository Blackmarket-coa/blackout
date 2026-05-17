import type {
    PlaybookAccentToken,
    PlaybookPhase,
} from '@blackout/protocol';

/**
 * Curated playbook accent palette — one swatch per token. Stable across all
 * five theme variants on purpose: a Grove is moss everywhere, so users see
 * their dens at a glance regardless of theme. Not a free RGB picker; that
 * would erode federation visual coherence.
 *
 * Hues chosen to be visually distinct at 16px on both dark and light
 * surfaces. Each pair carries a `solid` (filled badges, accent borders) and
 * `soft` (background washes, hover halos) form.
 */
export const PLAYBOOK_ACCENT_TOKENS: Readonly<
    Record<PlaybookAccentToken, { solid: string; soft: string; ink: string }>
> = Object.freeze({
    moss: { solid: '#3F7A4E', soft: 'rgba(63, 122, 78, 0.18)', ink: '#F4FFF7' },
    fern: { solid: '#5BA055', soft: 'rgba(91, 160, 85, 0.18)', ink: '#F4FFF7' },
    pine: { solid: '#1F5A47', soft: 'rgba(31, 90, 71, 0.20)', ink: '#F4FFF7' },
    saffron: { solid: '#D69A2E', soft: 'rgba(214, 154, 46, 0.20)', ink: '#1B130A' },
    ember: { solid: '#C66A2B', soft: 'rgba(198, 106, 43, 0.20)', ink: '#1B0F08' },
    clay: { solid: '#A45A45', soft: 'rgba(164, 90, 69, 0.20)', ink: '#FFF6F1' },
    lichen: { solid: '#7E9E6B', soft: 'rgba(126, 158, 107, 0.18)', ink: '#13180F' },
    slate: { solid: '#4D5E68', soft: 'rgba(77, 94, 104, 0.22)', ink: '#F0F4F6' },
    dusk: { solid: '#6B5A8C', soft: 'rgba(107, 90, 140, 0.22)', ink: '#F5F1FF' },
});

/**
 * Phenology bar colors — five seasonal states. The bar carries lifecycle and
 * health glanceably. Compost is intentionally muted (not red): the brief is
 * clear that an ended den is *renewal*, not *failure*.
 */
export const PHENOLOGY_TOKENS: Readonly<
    Record<PlaybookPhase, { solid: string; soft: string; label: string }>
> = Object.freeze({
    spring: { solid: '#9FD455', soft: 'rgba(159, 212, 85, 0.22)', label: 'In leaf · newly formed' },
    summer: { solid: '#3F9F5B', soft: 'rgba(63, 159, 91, 0.22)', label: 'In full leaf · active' },
    autumn: { solid: '#D69A2E', soft: 'rgba(214, 154, 46, 0.22)', label: 'Turning · entering review' },
    winter: { solid: '#7B8C99', soft: 'rgba(123, 140, 153, 0.22)', label: 'Dormant · quiet' },
    compost: { solid: '#5C5048', soft: 'rgba(92, 80, 72, 0.30)', label: 'Composted · made nutrient' },
});

export const phenologyPhaseOrder: readonly PlaybookPhase[] = [
    'spring',
    'summer',
    'autumn',
    'winter',
    'compost',
];
