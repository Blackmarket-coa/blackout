import { atomWithStorage } from 'jotai/utils';

/**
 * Tabs for the Creator Hub (`/streaming`). Unlike coalition / coliseum this is
 * an account-level surface, not room-scoped, so the tab set is fixed here
 * rather than derived from a Matrix state event.
 *
 * The hub opens on `overview` (a deep-link dashboard into the creator's
 * surfaces), followed by the content directories (`live` / `replays` /
 * `clips`), creator tooling (`kits` / `rewards`), and the
 * platform-integration management tabs (`broadcast` / `connections` /
 * `bridges` / `health`).
 */
export type StreamingTabId =
    | 'overview'
    | 'live'
    | 'replays'
    | 'clips'
    | 'kits'
    | 'rewards'
    | 'broadcast'
    | 'connections'
    | 'bridges'
    | 'health';

export const STREAMING_TAB_ORDER: StreamingTabId[] = [
    'overview',
    'live',
    'replays',
    'clips',
    'kits',
    'rewards',
    'broadcast',
    'connections',
    'bridges',
    'health',
];

export const STREAMING_TAB_LABELS: Record<StreamingTabId, string> = {
    overview: 'Overview',
    live: 'Live',
    replays: 'Replays',
    clips: 'Clips',
    kits: 'Kits',
    rewards: 'Rewards',
    broadcast: 'Broadcast',
    connections: 'Connections',
    bridges: 'Bridges & Webhooks',
    health: 'Health',
};

export const DEFAULT_STREAMING_TAB: StreamingTabId = 'overview';

export const isValidStreamingTab = (value: unknown): value is StreamingTabId =>
    typeof value === 'string' && STREAMING_TAB_ORDER.includes(value as StreamingTabId);

export const streamingTabAtom = atomWithStorage<StreamingTabId>(
    'bmc-streaming-tab',
    DEFAULT_STREAMING_TAB
);
