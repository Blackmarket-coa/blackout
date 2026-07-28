import type { FeatureFlags } from '../../core/features/featureFlags';

/**
 * The Town Square widget catalog. Each entry is metadata only — the actual
 * render nodes are built in `HomeFeed` (which owns the feed hooks/data) and
 * looked up by id. This registry drives: the default dashboard order, the
 * "Add widget" gallery, feature-flag availability, and premium/entitled gating.
 *
 * A widget with `defaultOrder === null` is optional/premium: it is NOT on the
 * board by default and appears in the gallery for the user to add (subject to
 * `requiredFeatureKeys`).
 */
export type HomeWidgetId =
    | 'featureGuide'
    | 'quickActions'
    | 'plugins'
    | 'bountyBoard'
    | 'creatorRail'
    | 'liveRail'
    | 'feed'
    | 'premiumPrivacyPulse'
    | 'premiumCoalitionPulse';

export interface HomeWidgetDef {
    id: HomeWidgetId;
    label: string;
    description: string;
    /** Default board position, or null for optional/premium widgets. */
    defaultOrder: number | null;
    /** Whether the user may remove/hide it. The core feed stays put. */
    removable: boolean;
    /** Feature flag that must be on for the widget to be available at all. */
    flag?: keyof FeatureFlags;
    /**
     * `features.*` entitlement keys required to render this (premium) widget.
     * When the caller lacks them the gallery shows a paywall instead of adding.
     */
    requiredFeatureKeys?: string[];
    /** Marketplace listing to route to when locked (upsell target). */
    upsellListingPath?: string;
}

export const HOME_WIDGETS: HomeWidgetDef[] = [
    {
        id: 'featureGuide',
        label: 'Welcome guide',
        description: 'A short explainer of what the Town Square gathers.',
        defaultOrder: 0,
        removable: true,
    },
    {
        id: 'quickActions',
        label: 'Quick actions',
        description: 'Shortcut cards to Canopies, Events, Live, and the Market.',
        defaultOrder: 1,
        removable: true,
    },
    {
        id: 'plugins',
        label: 'Your plugins',
        description: 'Home cards from the plugins you have installed.',
        defaultOrder: 2,
        removable: true,
    },
    {
        id: 'bountyBoard',
        label: 'Bounty board',
        description: 'Open bounties you can pick up.',
        defaultOrder: 3,
        removable: true,
        flag: 'homeBountyBoard',
    },
    {
        id: 'creatorRail',
        label: 'Creator content',
        description: 'A rail of content from creators you follow.',
        defaultOrder: 4,
        removable: true,
        flag: 'creatorContent',
    },
    {
        id: 'liveRail',
        label: 'Live now',
        description: 'Streams that are live right now.',
        defaultOrder: 5,
        removable: true,
    },
    {
        id: 'feed',
        label: 'Activity feed',
        description: 'The unified feed across dens, streams, coalitions, and more.',
        defaultOrder: 6,
        // The feed is the heart of the Town Square — it can be reordered but not
        // removed, so the page is never left empty.
        removable: false,
    },
    {
        id: 'premiumPrivacyPulse',
        label: 'Privacy pulse',
        description:
            'Live status of your anonymized transport, decoy traffic, and hardening — a Signal-tier widget.',
        defaultOrder: null,
        removable: true,
        requiredFeatureKeys: ['features.hardening.torTransport'],
        upsellListingPath: '/monetization/marketplace',
    },
    {
        id: 'premiumCoalitionPulse',
        label: 'Coalition pulse',
        description:
            'Governance activity and shared-treasury health across your coalitions — a Coalition-tier widget.',
        defaultOrder: null,
        removable: true,
        requiredFeatureKeys: ['features.transparency.auditExport'],
        upsellListingPath: '/monetization/marketplace',
    },
];

export const HOME_WIDGET_IDS: HomeWidgetId[] = HOME_WIDGETS.map((w) => w.id);

export const HOME_WIDGET_BY_ID: Record<HomeWidgetId, HomeWidgetDef> = Object.fromEntries(
    HOME_WIDGETS.map((w) => [w.id, w])
) as Record<HomeWidgetId, HomeWidgetDef>;

/** Default board order — the widgets with a non-null defaultOrder, sorted. */
export const DEFAULT_HOME_WIDGET_ORDER: HomeWidgetId[] = HOME_WIDGETS.filter(
    (w) => w.defaultOrder !== null
)
    .sort((a, b) => (a.defaultOrder as number) - (b.defaultOrder as number))
    .map((w) => w.id);

/** Whether a widget is available given the active feature flags. */
export function isWidgetFlagEnabled(def: HomeWidgetDef, flags: FeatureFlags): boolean {
    return def.flag ? Boolean(flags[def.flag]) : true;
}

/** Whether the caller is entitled to a (possibly premium) widget. */
export function isWidgetEntitled(
    def: HomeWidgetDef,
    hasFeature: (key: string) => boolean
): boolean {
    if (!def.requiredFeatureKeys || def.requiredFeatureKeys.length === 0) return true;
    return def.requiredFeatureKeys.every(hasFeature);
}
