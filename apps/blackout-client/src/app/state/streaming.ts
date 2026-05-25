import { atomWithStorage } from 'jotai/utils';

/**
 * Tabs for the consolidated Streaming hub (`/streaming`). Unlike coalition /
 * coliseum this is an account-level surface, not room-scoped, so the tab set is
 * fixed here rather than derived from a Matrix state event.
 */
export type StreamingTabId =
    | 'live'
    | 'replays'
    | 'broadcast'
    | 'connections'
    | 'bridges'
    | 'health';

export const STREAMING_TAB_ORDER: StreamingTabId[] = [
    'live',
    'replays',
    'broadcast',
    'connections',
    'bridges',
    'health',
];

export const STREAMING_TAB_LABELS: Record<StreamingTabId, string> = {
    live: 'Live',
    replays: 'Replays',
    broadcast: 'Broadcast',
    connections: 'Connections',
    bridges: 'Bridges & Webhooks',
    health: 'Health',
};

export const DEFAULT_STREAMING_TAB: StreamingTabId = 'live';

export const isValidStreamingTab = (value: unknown): value is StreamingTabId =>
    typeof value === 'string' && STREAMING_TAB_ORDER.includes(value as StreamingTabId);

export const streamingTabAtom = atomWithStorage<StreamingTabId>(
    'bmc-streaming-tab',
    DEFAULT_STREAMING_TAB,
);
