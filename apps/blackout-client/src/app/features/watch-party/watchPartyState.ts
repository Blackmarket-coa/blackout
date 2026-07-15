// Watch-party state lives in the `co.bmc.watch_party` room state event: one
// shared playhead (source, status, position, rate) written by the host and
// followed by everyone else. Pure parsing/reconciliation helpers so the sync
// math is testable without a live room or a real <video> element.

export const WATCH_PARTY_STATE_EVENT_TYPE = 'co.bmc.watch_party';
export const WATCH_PARTY_MOD_POWER = 50;
export const WATCH_PARTY_TITLE_MAX = 120;

/** Drift beyond this while playing forces a hard seek to the expected position. */
export const DRIFT_HARD_SEEK_MS = 1500;
/** Drift beyond this (but under the hard threshold) is corrected by nudging the rate. */
export const DRIFT_RATE_NUDGE_MS = 300;
/** Drift beyond this while paused re-aligns the (invisible) paused playhead. */
export const DRIFT_PAUSED_SEEK_MS = 500;
/** Fractional rate adjustment applied while soft-correcting drift. */
export const RATE_NUDGE_FACTOR = 0.05;

export const PLAYBACK_RATE_MIN = 0.25;
export const PLAYBACK_RATE_MAX = 3;

const MATRIX_USER_ID_RE = /^@[^:\s]+:[^:\s]+$/;
const MXC_RE = /^mxc:\/\/[^/\s]+\/[A-Za-z0-9_-]+$/;

export type WatchPartyMode = 'shared_player' | 'screenshare' | 'live_event';
export type WatchPartySourceKind = 'url' | 'hls' | 'mxc';
export type WatchPartyStatus = 'playing' | 'paused';

export interface WatchPartySource {
    kind: WatchPartySourceKind;
    /** https:// media/playlist URL, or mxc:// content URI for uploads. */
    uri: string;
    title?: string;
}

export interface WatchPartyState {
    mode: WatchPartyMode;
    /** Null for screenshare parties (the SFU display stream is the source). */
    source: WatchPartySource | null;
    /** The member whose transport actions are authoritative. */
    hostId: string;
    status: WatchPartyStatus;
    /** Playhead position at `updatedTs`, not "now" — see expectedPositionMs. */
    positionMs: number;
    /** Host clock when this revision was written. */
    updatedTs: number;
    playbackRate: number;
    /** Monotonic write counter; stale revisions must be ignored. */
    revision: number;
}

const MODES: readonly WatchPartyMode[] = ['shared_player', 'screenshare', 'live_event'];
const SOURCE_KINDS: readonly WatchPartySourceKind[] = ['url', 'hls', 'mxc'];

const clampRate = (rate: number): number =>
    Math.min(PLAYBACK_RATE_MAX, Math.max(PLAYBACK_RATE_MIN, rate));

const isSafeHttpsUrl = (uri: string): boolean => {
    try {
        return new URL(uri).protocol === 'https:';
    } catch {
        return false;
    }
};

export const isValidSourceUri = (kind: WatchPartySourceKind, uri: string): boolean =>
    kind === 'mxc' ? MXC_RE.test(uri) : isSafeHttpsUrl(uri);

const parseSource = (value: unknown): WatchPartySource | null => {
    if (!value || typeof value !== 'object') return null;
    const raw = value as Record<string, unknown>;
    const kind = SOURCE_KINDS.find((k) => k === raw.kind);
    if (!kind) return null;
    if (typeof raw.uri !== 'string' || !isValidSourceUri(kind, raw.uri)) return null;
    const title =
        typeof raw.title === 'string' && raw.title.trim().length > 0
            ? raw.title.trim().slice(0, WATCH_PARTY_TITLE_MAX)
            : undefined;
    return { kind, uri: raw.uri, title };
};

export const parseWatchPartyState = (
    content: Record<string, unknown> | undefined | null
): WatchPartyState | null => {
    if (!content) return null;

    const mode = MODES.find((m) => m === content.mode);
    if (!mode) return null;
    if (typeof content.host_id !== 'string' || !MATRIX_USER_ID_RE.test(content.host_id))
        return null;

    const source = parseSource(content.source);
    // A screenshare party has no media source; the other modes require one.
    if (mode !== 'screenshare' && !source) return null;

    const status: WatchPartyStatus = content.status === 'playing' ? 'playing' : 'paused';
    const positionMs =
        typeof content.position_ms === 'number' && Number.isFinite(content.position_ms)
            ? Math.max(0, content.position_ms)
            : 0;
    const updatedTs =
        typeof content.updated_ts === 'number' && Number.isFinite(content.updated_ts)
            ? content.updated_ts
            : 0;
    const playbackRate =
        typeof content.playback_rate === 'number' && Number.isFinite(content.playback_rate)
            ? clampRate(content.playback_rate)
            : 1;
    const revision =
        typeof content.revision === 'number' &&
        Number.isInteger(content.revision) &&
        content.revision > 0
            ? content.revision
            : 1;

    return {
        mode,
        source,
        hostId: content.host_id,
        status,
        positionMs,
        updatedTs,
        playbackRate,
        revision,
    };
};

export const serializeWatchPartyState = (state: WatchPartyState): Record<string, unknown> => ({
    mode: state.mode,
    source: state.source
        ? {
              kind: state.source.kind,
              uri: state.source.uri,
              ...(state.source.title ? { title: state.source.title } : {}),
          }
        : null,
    host_id: state.hostId,
    status: state.status,
    position_ms: Math.max(0, Math.round(state.positionMs)),
    updated_ts: state.updatedTs,
    playback_rate: clampRate(state.playbackRate),
    revision: state.revision,
});

export interface CreateWatchPartyInput {
    mode: WatchPartyMode;
    source: WatchPartySource | null;
    hostId: string;
    nowTs: number;
}

export const createWatchParty = ({
    mode,
    source,
    hostId,
    nowTs,
}: CreateWatchPartyInput): WatchPartyState => ({
    mode,
    source: mode === 'screenshare' ? null : source,
    hostId,
    status: 'paused',
    positionMs: 0,
    updatedTs: nowTs,
    playbackRate: 1,
    revision: 1,
});

export type WatchPartyPatch = Partial<
    Pick<WatchPartyState, 'status' | 'positionMs' | 'playbackRate' | 'source' | 'hostId'>
>;

/** Host-side write: apply a patch, stamp the clock, and bump the revision. */
export const hostAdvance = (
    state: WatchPartyState,
    patch: WatchPartyPatch,
    nowTs: number
): WatchPartyState => ({
    ...state,
    ...patch,
    playbackRate: clampRate(patch.playbackRate ?? state.playbackRate),
    positionMs: Math.max(0, patch.positionMs ?? state.positionMs),
    updatedTs: nowTs,
    revision: state.revision + 1,
});

/** Guard against out-of-order state event delivery. */
export const isNewerState = (prev: WatchPartyState | null, next: WatchPartyState): boolean => {
    if (!prev) return true;
    if (next.revision !== prev.revision) return next.revision > prev.revision;
    return next.updatedTs > prev.updatedTs;
};

export const canControlParty = (
    state: WatchPartyState | null,
    userId: string,
    powerLevel: number
): boolean => {
    if (state && state.hostId === userId) return true;
    return powerLevel >= WATCH_PARTY_MOD_POWER;
};

/** Where the shared playhead should be "now", extrapolated from the last write. */
export const expectedPositionMs = (state: WatchPartyState, nowTs: number): number => {
    if (state.status !== 'playing') return state.positionMs;
    const elapsed = Math.max(0, nowTs - state.updatedTs);
    return state.positionMs + elapsed * state.playbackRate;
};

export interface LocalPlayback {
    positionMs: number;
    paused: boolean;
    playbackRate: number;
}

export interface ReconcileTarget {
    /** Desired playing state for the local element. */
    play: boolean;
    /** Hard-seek target, or null when the playhead is close enough. */
    seekToMs: number | null;
    /** Rate to apply: the host rate, possibly nudged to close small drift. */
    playbackRate: number;
}

/**
 * Compute what the local player should do to converge on the shared playhead.
 * Big drift gets a hard seek; small drift gets a gentle rate nudge so playback
 * stays smooth; live-event mode never seeks (the stream itself is the clock).
 */
export const reconcilePlayback = (
    local: LocalPlayback,
    state: WatchPartyState,
    nowTs: number
): ReconcileTarget => {
    const baseRate = clampRate(state.playbackRate);

    if (state.mode === 'live_event') {
        return { play: state.status === 'playing', seekToMs: null, playbackRate: baseRate };
    }

    if (state.status === 'paused') {
        const drift = state.positionMs - local.positionMs;
        return {
            play: false,
            seekToMs: Math.abs(drift) > DRIFT_PAUSED_SEEK_MS ? state.positionMs : null,
            playbackRate: baseRate,
        };
    }

    const expected = expectedPositionMs(state, nowTs);
    const drift = expected - local.positionMs;

    if (Math.abs(drift) > DRIFT_HARD_SEEK_MS) {
        return { play: true, seekToMs: expected, playbackRate: baseRate };
    }
    if (Math.abs(drift) > DRIFT_RATE_NUDGE_MS) {
        const nudged = baseRate * (drift > 0 ? 1 + RATE_NUDGE_FACTOR : 1 - RATE_NUDGE_FACTOR);
        return { play: true, seekToMs: null, playbackRate: clampRate(nudged) };
    }
    return { play: true, seekToMs: null, playbackRate: baseRate };
};
