import { useEffect, useState, type CSSProperties } from 'react';
import type { Room } from 'matrix-js-sdk';
import { useOptionalCall } from '../call/CallProvider';
import { ScreenSharePreview } from '../call/ScreenSharePreview';
import { readPowerLevel, usePowerLevels } from '../../hooks/usePowerLevels';
import {
    buildOwncastPlaylistUrl,
    fetchOwncastOrigin,
    listStreams,
    type StreamSummary,
} from '../streams/streamsClient';
import { useWatchParty, type WatchPartyHandle } from './useWatchParty';
import { useWatchPartyLive } from './useWatchPartyLive';
import { WatchPartyPlayer } from './WatchPartyPlayer';
import { WatchPartyReactionBar, WatchPartyReactionOverlay } from './WatchPartyReactions';
import {
    WATCH_PARTY_STATE_EVENT_TYPE,
    type WatchPartyMode,
    type WatchPartySourceKind,
    type WatchPartyState,
    isValidSourceUri,
} from './watchPartyState';

const buttonStyle: CSSProperties = {
    border: '1px solid var(--border-default)',
    borderRadius: 8,
    background: 'var(--bg-surface)',
    color: 'var(--text-primary)',
    padding: '6px 10px',
    cursor: 'pointer',
    fontSize: 12,
};

const inputStyle: CSSProperties = {
    border: '1px solid var(--border-default)',
    borderRadius: 8,
    background: 'var(--bg-input)',
    color: 'var(--text-primary)',
    padding: '6px 8px',
    fontSize: 13,
};

const mutedText: CSSProperties = { fontSize: 12, color: 'var(--text-secondary)' };

const MODE_COPY: Record<WatchPartyMode, { label: string; hint: string }> = {
    shared_player: {
        label: 'Shared player',
        hint: 'Everyone plays the same video, kept in sync by the host (movies, shows, replays).',
    },
    live_event: {
        label: 'Live event',
        hint: 'Watch a live stream together — the stream itself keeps everyone in sync (sports, politics).',
    },
    screenshare: {
        label: 'Screenshare',
        hint: "Watch the host's shared screen in this den's voice call (games, anything on their machine).",
    },
};

const sourceKindForUri = (uri: string): WatchPartySourceKind => {
    if (uri.startsWith('mxc://')) return 'mxc';
    if (/\.m3u8(\?|$)/.test(uri)) return 'hls';
    return 'url';
};

/**
 * Live Blackout streams for the live-event source picker. One shot on mount;
 * failures degrade to the manual URL input, which always stays available.
 */
const LiveStreamPicker = ({ onPick }: { onPick: (uri: string, title: string) => void }) => {
    const [streams, setStreams] = useState<StreamSummary[]>([]);
    const [playlistUrl, setPlaylistUrl] = useState('');
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        let cancelled = false;
        void Promise.all([
            listStreams({ state: 'live', sort: 'live', limit: 10 }),
            fetchOwncastOrigin(),
        ])
            .then(([list, origin]) => {
                if (cancelled) return;
                setStreams(list.items.filter((s) => s.state === 'live'));
                setPlaylistUrl(buildOwncastPlaylistUrl(origin.origin));
            })
            .catch(() => {
                if (!cancelled) setFailed(true);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    if (failed || (streams.length === 0 && !playlistUrl)) {
        return (
            <small style={mutedText}>
                {failed
                    ? 'Could not load live streams — paste a stream URL below instead.'
                    : 'Looking for live streams…'}
            </small>
        );
    }
    if (streams.length === 0) {
        return <small style={mutedText}>No Blackout streams are live right now.</small>;
    }

    return (
        <div style={{ display: 'grid', gap: 4 }} aria-label="Live streams">
            <small style={mutedText}>Live now:</small>
            {streams.map((stream) => (
                <button
                    key={stream.id}
                    type="button"
                    style={{ ...buttonStyle, justifySelf: 'start' }}
                    disabled={!playlistUrl}
                    onClick={() => onPick(playlistUrl, stream.title)}
                >
                    🔴 {stream.title}
                </button>
            ))}
        </div>
    );
};

const StartPartyForm = ({
    onStart,
}: {
    onStart: (mode: WatchPartyMode, uri: string, title: string) => Promise<void>;
}) => {
    const [mode, setMode] = useState<WatchPartyMode>('shared_player');
    const [uri, setUri] = useState('');
    const [title, setTitle] = useState('');
    const [error, setError] = useState<string | null>(null);

    const needsSource = mode !== 'screenshare';

    const start = async () => {
        setError(null);
        if (needsSource && !isValidSourceUri(sourceKindForUri(uri.trim()), uri.trim())) {
            setError('Source must be an https:// video/playlist URL or an mxc:// upload URI.');
            return;
        }
        await onStart(mode, uri.trim(), title.trim());
    };

    return (
        <div style={{ display: 'grid', gap: 8 }}>
            <div
                role="radiogroup"
                aria-label="Watch party mode"
                style={{ display: 'grid', gap: 4 }}
            >
                {(Object.keys(MODE_COPY) as WatchPartyMode[]).map((m) => (
                    <label key={m} style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
                        <input
                            type="radio"
                            name="watch-party-mode"
                            checked={mode === m}
                            onChange={() => setMode(m)}
                        />
                        <span style={{ fontSize: 13 }}>
                            <strong>{MODE_COPY[m].label}</strong>{' '}
                            <span style={mutedText}>{MODE_COPY[m].hint}</span>
                        </span>
                    </label>
                ))}
            </div>
            {mode === 'live_event' ? (
                <LiveStreamPicker
                    onPick={(pickedUri, pickedTitle) => {
                        setUri(pickedUri);
                        setTitle(pickedTitle);
                    }}
                />
            ) : null}
            {needsSource ? (
                <>
                    <input
                        style={inputStyle}
                        aria-label="Video source URL"
                        placeholder="https://…/movie.mp4, https://…/live.m3u8, or mxc://…"
                        value={uri}
                        onChange={(e) => setUri(e.target.value)}
                    />
                    <input
                        style={inputStyle}
                        aria-label="Title (optional)"
                        placeholder="Title (optional)"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                    />
                </>
            ) : null}
            {error ? <small style={{ color: 'var(--accent-danger, #d33)' }}>{error}</small> : null}
            <button
                type="button"
                style={{ ...buttonStyle, justifySelf: 'start' }}
                onClick={() => void start()}
            >
                Start watch party
            </button>
            <small style={mutedText}>
                DRM services (Netflix, Disney+, …) will not load in the shared player and usually
                black-screen under screenshare — use a direct file, an upload, or a live stream URL.
            </small>
        </div>
    );
};

const ScreenshareParty = ({ hostId, isHost }: { hostId: string; isHost: boolean }) => {
    const call = useOptionalCall();

    return (
        <div style={{ display: 'grid', gap: 8 }}>
            <small style={mutedText}>
                {isHost
                    ? 'You are presenting. Join the voice channel in this den and share your screen; everyone in the call sees it.'
                    : `${hostId} is presenting. Join the voice channel in this den to watch their screen.`}
            </small>
            {call?.joined && isHost ? (
                <>
                    <button
                        type="button"
                        style={{ ...buttonStyle, justifySelf: 'start' }}
                        onClick={() => call.setScreenSharing(!call.screenSharing)}
                    >
                        {call.screenSharing ? 'Stop sharing' : 'Share your screen'}
                    </button>
                    <ScreenSharePreview />
                </>
            ) : null}
        </div>
    );
};

/**
 * Right-panel watch-party widget: start a party in one of three modes
 * (shared player / live event / screenshare) and follow it. State +
 * transport live in the `co.bmc.watch_party` room state event; the call
 * layer carries the media for screenshare mode.
 */
export const WatchPartyWidget = ({ room }: { room: Room }) => {
    const mx = room.client;
    const myUserId = mx.getUserId() ?? '';
    const { state, isHost, canControl, startParty, advance, claimHost, endParty } =
        useWatchParty(room);

    if (!state) {
        return (
            <section aria-label="Watch party" style={{ display: 'grid', gap: 10, padding: 12 }}>
                <header>
                    <strong>Watch party</strong>
                    <p style={{ margin: '4px 0 0', ...mutedText }}>
                        Watch movies, live events, or a shared screen together, in sync.
                    </p>
                </header>
                {canControl ? (
                    <StartPartyForm
                        onStart={async (mode, uri, title) => {
                            await startParty(
                                mode,
                                mode === 'screenshare'
                                    ? null
                                    : {
                                          kind: sourceKindForUri(uri),
                                          uri,
                                          title: title || undefined,
                                      }
                            );
                        }}
                    />
                ) : (
                    <small style={mutedText}>
                        No watch party is running. A moderator can start one.
                    </small>
                )}
            </section>
        );
    }

    return (
        <ActiveParty
            room={room}
            state={state}
            myUserId={myUserId}
            isHost={isHost}
            canControl={canControl}
            advance={advance}
            claimHost={claimHost}
            endParty={endParty}
        />
    );
};

const ActiveParty = ({
    room,
    state,
    myUserId,
    isHost,
    canControl,
    advance,
    claimHost,
    endParty,
}: {
    room: Room;
    state: WatchPartyState;
    myUserId: string;
    isHost: boolean;
    canControl: boolean;
    advance: WatchPartyHandle['advance'];
    claimHost: WatchPartyHandle['claimHost'];
    endParty: WatchPartyHandle['endParty'];
}) => {
    const { bursts, controlRequests, activeViewers, sendReaction, requestControl } =
        useWatchPartyLive(room, state.hostId);
    const [requested, setRequested] = useState(false);

    // Handing over the host only works when the target can write the party
    // state event server-side; annotate under-powered requesters instead of
    // minting a host whose transport writes the server would reject.
    const powerLevels = usePowerLevels(room);
    const requiredStatePower = readPowerLevel.state(powerLevels, WATCH_PARTY_STATE_EVENT_TYPE);
    const canWriteState = (userId: string) =>
        readPowerLevel.user(powerLevels, userId) >= requiredStatePower;

    return (
        <section aria-label="Watch party" style={{ display: 'grid', gap: 10, padding: 12 }}>
            <header style={{ display: 'grid', gap: 2 }}>
                <strong>
                    {MODE_COPY[state.mode].label}
                    {state.source?.title ? ` — ${state.source.title}` : ''}
                </strong>
                <small style={mutedText}>
                    Host: {state.hostId}
                    {isHost ? ' (you)' : ''}
                    {state.mode !== 'screenshare' ? ` · ${state.status}` : ''}
                </small>
                {activeViewers.length > 0 ? (
                    <small style={mutedText} title={activeViewers.join(', ')}>
                        👥 Watching now: {activeViewers.length}
                    </small>
                ) : null}
            </header>

            <div style={{ position: 'relative' }}>
                {state.mode === 'screenshare' ? (
                    <ScreenshareParty hostId={state.hostId} isHost={isHost} />
                ) : (
                    <WatchPartyPlayer
                        room={room}
                        state={state}
                        isHost={isHost}
                        onAdvance={advance}
                    />
                )}
                <WatchPartyReactionOverlay bursts={bursts} />
            </div>

            <WatchPartyReactionBar onReact={sendReaction} />

            {isHost && controlRequests.length > 0 ? (
                <div style={{ display: 'grid', gap: 4 }}>
                    <strong style={{ fontSize: 12 }}>Control requests</strong>
                    {controlRequests.map((userId) => (
                        <div key={userId} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <span style={{ fontSize: 13 }}>{userId}</span>
                            {canWriteState(userId) ? (
                                <button
                                    type="button"
                                    style={buttonStyle}
                                    onClick={() => void advance({ hostId: userId })}
                                >
                                    Make host
                                </button>
                            ) : (
                                <small style={mutedText}>
                                    needs moderator power to drive playback
                                </small>
                            )}
                        </div>
                    ))}
                </div>
            ) : null}

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {!canControl && !requested ? (
                    <button
                        type="button"
                        style={buttonStyle}
                        onClick={() => {
                            setRequested(true);
                            void requestControl().catch(() => setRequested(false));
                        }}
                    >
                        Request control
                    </button>
                ) : null}
                {!canControl && requested ? (
                    <small style={mutedText}>Control requested — waiting for the host.</small>
                ) : null}
                {canControl && !isHost && state.hostId !== myUserId ? (
                    <button type="button" style={buttonStyle} onClick={() => void claimHost()}>
                        Take over as host
                    </button>
                ) : null}
                {canControl ? (
                    <button type="button" style={buttonStyle} onClick={() => void endParty()}>
                        End party
                    </button>
                ) : null}
            </div>
        </section>
    );
};

export default WatchPartyWidget;
