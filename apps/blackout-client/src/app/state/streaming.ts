import { atomWithStorage } from 'jotai/utils';

/**
 * Tabs for the Creator Hub (`/streaming`). Unlike coalition / coliseum this is
 * an account-level surface, not room-scoped, so the tab set is fixed here
 * rather than derived from a Matrix state event.
 *
 * The hub opens on `overview` (a deep-link dashboard into the creator's
 * surfaces). The remaining destinations are consolidated: `content` merges the
 * live / replays / clips directories, `earnings` merges rewards / listings /
 * splits, and `integrations` merges the platform-integration management
 * surfaces (broadcast / connections / bridges / health). Each merged tab hosts
 * an in-tab sub-view switcher; the retired pre-consolidation tab ids live on
 * as those sub-view ids so persisted selections and deep-links keep working.
 */
export type StreamingTabId = 'overview' | 'content' | 'kits' | 'earnings' | 'integrations';

export type ContentViewId = 'live' | 'replays' | 'clips';
export type EarningsViewId = 'rewards' | 'listings' | 'splits';
export type IntegrationsViewId = 'broadcast' | 'connections' | 'bridges' | 'health';

export type StreamingHubViewId = ContentViewId | EarningsViewId | IntegrationsViewId;

/** The ten pre-consolidation tab ids, accepted for remap only. */
export type LegacyStreamingTabId = StreamingHubViewId;

export const STREAMING_TAB_ORDER: StreamingTabId[] = [
    'overview',
    'content',
    'kits',
    'earnings',
    'integrations',
];

export const STREAMING_TAB_LABELS: Record<StreamingTabId, string> = {
    overview: 'Overview',
    content: 'Content',
    kits: 'Kits',
    earnings: 'Earnings',
    integrations: 'Integrations',
};

/**
 * Short plain-text hints per tab and sub-view, rendered as button tooltips in
 * the tab strip / HubSubTabs. Fuller explainers live in
 * `features/streaming/streamingTabGuides.tsx`; keep the two in sync when a
 * tab's purpose changes.
 */
export const STREAMING_TAB_HINTS: Record<StreamingTabId, string> = {
    overview: 'Your creator dashboard — publish content and jump into every surface',
    content: 'Live streams, replays, and clips',
    kits: 'Ready-made kits that set up your creator surfaces',
    earnings: 'Rewards, listings, and revenue splits',
    integrations: 'Broadcast tools, platform connections, bridges, and health',
};

export const CONTENT_VIEW_HINTS: Record<ContentViewId, string> = {
    live: 'Streams broadcasting right now',
    replays: 'Past streams saved to watch later',
    clips: 'Short highlights cut from streams',
};

export const EARNINGS_VIEW_HINTS: Record<EarningsViewId, string> = {
    rewards: 'Tips, subscriptions, and reward payouts',
    listings: 'Your marketplace listings',
    splits: 'Revenue-split contracts with collaborators',
};

export const INTEGRATIONS_VIEW_HINTS: Record<IntegrationsViewId, string> = {
    broadcast: 'Stream keys and broadcast settings',
    connections: 'Linked Twitch, YouTube, Kick, and Discord accounts',
    bridges: 'Chat bridges and outgoing webhooks',
    health: 'Status of your connected integrations',
};

export const CONTENT_VIEW_ORDER: ContentViewId[] = ['live', 'replays', 'clips'];

export const CONTENT_VIEW_LABELS: Record<ContentViewId, string> = {
    live: 'Live',
    replays: 'Replays',
    clips: 'Clips',
};

export const EARNINGS_VIEW_ORDER: EarningsViewId[] = ['rewards', 'listings', 'splits'];

export const EARNINGS_VIEW_LABELS: Record<EarningsViewId, string> = {
    rewards: 'Rewards',
    listings: 'Listings',
    splits: 'Splits',
};

export const INTEGRATIONS_VIEW_ORDER: IntegrationsViewId[] = [
    'broadcast',
    'connections',
    'bridges',
    'health',
];

export const INTEGRATIONS_VIEW_LABELS: Record<IntegrationsViewId, string> = {
    broadcast: 'Broadcast',
    connections: 'Connections',
    bridges: 'Bridges & Webhooks',
    health: 'Health',
};

export const DEFAULT_STREAMING_TAB: StreamingTabId = 'overview';

export const isValidStreamingTab = (value: unknown): value is StreamingTabId =>
    typeof value === 'string' && STREAMING_TAB_ORDER.includes(value as StreamingTabId);

export const isContentView = (value: unknown): value is ContentViewId =>
    typeof value === 'string' && CONTENT_VIEW_ORDER.includes(value as ContentViewId);

export const isEarningsView = (value: unknown): value is EarningsViewId =>
    typeof value === 'string' && EARNINGS_VIEW_ORDER.includes(value as EarningsViewId);

export const isIntegrationsView = (value: unknown): value is IntegrationsViewId =>
    typeof value === 'string' && INTEGRATIONS_VIEW_ORDER.includes(value as IntegrationsViewId);

export const isLegacyStreamingTab = (value: unknown): value is LegacyStreamingTabId =>
    isContentView(value) || isEarningsView(value) || isIntegrationsView(value);

/** Where the hub should land: a tab, plus (for merged tabs) a sub-view. */
export interface StreamingHubLocation {
    tab: StreamingTabId;
    view?: StreamingHubViewId;
}

export const LEGACY_STREAMING_TAB_REMAP: Record<LegacyStreamingTabId, StreamingHubLocation> = {
    live: { tab: 'content', view: 'live' },
    replays: { tab: 'content', view: 'replays' },
    clips: { tab: 'content', view: 'clips' },
    rewards: { tab: 'earnings', view: 'rewards' },
    listings: { tab: 'earnings', view: 'listings' },
    splits: { tab: 'earnings', view: 'splits' },
    broadcast: { tab: 'integrations', view: 'broadcast' },
    connections: { tab: 'integrations', view: 'connections' },
    bridges: { tab: 'integrations', view: 'bridges' },
    health: { tab: 'integrations', view: 'health' },
};

/**
 * Resolve any tab-ish value — a current tab id, a retired pre-consolidation
 * tab id, or garbage — to a hub location. Unknown values land on the default
 * tab rather than surfacing a broken selection.
 */
export const resolveStreamingTab = (value: unknown): StreamingHubLocation => {
    if (isValidStreamingTab(value)) return { tab: value };
    if (isLegacyStreamingTab(value)) return LEGACY_STREAMING_TAB_REMAP[value];
    return { tab: DEFAULT_STREAMING_TAB };
};

const STREAMING_TAB_STORAGE_KEY = 'bmc-streaming-tab';

const readRawStorage = (key: string): string | null => {
    try {
        return globalThis.localStorage.getItem(key);
    } catch {
        return null;
    }
};

/**
 * Jotai's default storage JSON-encodes, so a stored id is normally quoted;
 * tolerate a bare string too so a hand-edited or pre-JSON value still parses.
 */
const parseStoredId = (raw: string | null): string | null => {
    if (raw === null) return null;
    try {
        const parsed: unknown = JSON.parse(raw);
        return typeof parsed === 'string' ? parsed : null;
    } catch {
        return raw;
    }
};

/**
 * Storage adapter that remaps retired tab ids on read (same shape as the
 * settings `appearanceStorage` normalizer). The key is never rewritten on
 * read — only when the user next changes tabs — which lets the sub-view
 * atoms below recover the legacy id for their own migration.
 */
const streamingTabStorage = {
    getItem: (key: string, initialValue: StreamingTabId): StreamingTabId => {
        const stored = parseStoredId(readRawStorage(key));
        if (isValidStreamingTab(stored)) return stored;
        if (isLegacyStreamingTab(stored)) return LEGACY_STREAMING_TAB_REMAP[stored].tab;
        return initialValue;
    },
    setItem: (key: string, value: StreamingTabId): void => {
        try {
            globalThis.localStorage.setItem(key, JSON.stringify(value));
        } catch {
            // ignore — storage may be unavailable (private mode, quota).
        }
    },
    removeItem: (key: string): void => {
        try {
            globalThis.localStorage.removeItem(key);
        } catch {
            // ignore — storage may be unavailable.
        }
    },
};

export const streamingTabAtom = atomWithStorage<StreamingTabId>(
    STREAMING_TAB_STORAGE_KEY,
    DEFAULT_STREAMING_TAB,
    streamingTabStorage
);

/**
 * Sub-view storage: prefers its own key, then falls back to a legacy tab id
 * still sitting in the tab key (a user whose stored tab was `replays` lands
 * on Content → Replays with no imperative migration), then the default.
 */
const createSubViewStorage = <V extends StreamingHubViewId>(
    isView: (value: unknown) => value is V
) => ({
    getItem: (key: string, initialValue: V): V => {
        const stored = parseStoredId(readRawStorage(key));
        if (isView(stored)) return stored;
        const legacyTab = parseStoredId(readRawStorage(STREAMING_TAB_STORAGE_KEY));
        if (isView(legacyTab)) return legacyTab;
        return initialValue;
    },
    setItem: (key: string, value: V): void => {
        try {
            globalThis.localStorage.setItem(key, JSON.stringify(value));
        } catch {
            // ignore — storage may be unavailable.
        }
    },
    removeItem: (key: string): void => {
        try {
            globalThis.localStorage.removeItem(key);
        } catch {
            // ignore — storage may be unavailable.
        }
    },
});

export const streamingContentViewAtom = atomWithStorage<ContentViewId>(
    'bmc-streaming-content-view',
    'live',
    createSubViewStorage(isContentView)
);

export const streamingEarningsViewAtom = atomWithStorage<EarningsViewId>(
    'bmc-streaming-earnings-view',
    'rewards',
    createSubViewStorage(isEarningsView)
);

export const streamingIntegrationsViewAtom = atomWithStorage<IntegrationsViewId>(
    'bmc-streaming-integrations-view',
    'broadcast',
    createSubViewStorage(isIntegrationsView)
);
