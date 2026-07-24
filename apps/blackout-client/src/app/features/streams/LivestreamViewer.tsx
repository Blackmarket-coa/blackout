import { lazy, Suspense, useEffect, useState, type CSSProperties } from 'react';
import { Link, useParams } from 'react-router';
import { useMatrixClientOrNull } from '../../hooks/useMatrixClient';
import { recordViewEvent } from '../../sdk/viewEvents';
import { LIVE_PATH, CREATOR_STOREFRONT_PATH, buildCommunitiesPath } from '../../pages/paths';
import {
    buildOwncastPlaylistUrl,
    fetchOwncastOrigin,
    fetchStream,
    type StreamSummary,
} from './streamsClient';

// TipButton lives in `features/monetization/components` and pulls in
// the wider commerce client. Keep it lazy so the viewer page renders
// before tip wiring is ready — and so the registry-load tests don't
// pull crypto in transitively (PR 1's lesson, applied again).
const TipButtonLazy = lazy(() =>
    import('../monetization/components/TipButton').then((mod) => ({
        default: mod.TipButton,
    }))
);

// The embedded den chat pulls in the full room timeline + composer (Slate,
// uploads, encryption). Keep it lazy so the viewer renders immediately and
// the heavy chat bundle only loads for den-associated streams.
const EmbeddedDenChatLazy = lazy(() =>
    import('./EmbeddedDenChat').then((mod) => ({
        default: mod.EmbeddedDenChat,
    }))
);

// Twitch-compat extension panels. Lazy so the (visible, sandboxed) iframe
// machinery only loads for streams that actually declare extensions.
const ExtensionPanelStackLazy = lazy(() =>
    import('./extensions/ExtensionFrame').then((mod) => ({
        default: mod.ExtensionPanelStack,
    }))
);

// Viewer-facing channel-points widget. Lazy; self-hides when the channel has
// no rewards.
const ChannelPointsWidgetLazy = lazy(() =>
    import('./ChannelPointsWidget').then((mod) => ({ default: mod.ChannelPointsWidget }))
);

// Past-broadcast (VOD) list. Lazy; the component self-hides when the stream
// has no replayable sessions.
const StreamVodsLazy = lazy(() =>
    import('./StreamVods').then((mod) => ({ default: mod.StreamVods }))
);

const layoutStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    minHeight: '100%',
    width: '100%',
    background: 'var(--bg-surface, #0f172a)',
    color: 'var(--text-primary, #f8fafc)',
};

const headerStyle: CSSProperties = {
    padding: '12px 16px 8px',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
};

const titleRow: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
};

const titleStyle: CSSProperties = { margin: 0, fontSize: 18, fontWeight: 700 };

const playerStyle: CSSProperties = {
    width: '100%',
    aspectRatio: '16 / 9',
    background: '#000',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
};

const tipRowStyle: CSSProperties = {
    padding: '8px 16px',
    display: 'flex',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'flex-end',
    borderTop: '1px solid var(--border-default, #374151)',
};

const chatCtaStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 10px',
    borderRadius: 999,
    border: '1px solid var(--accent-primary, #1ABC9C)',
    color: 'var(--accent-primary, #1ABC9C)',
    background: 'transparent',
    textDecoration: 'none',
    fontWeight: 600,
    fontSize: 13,
};

const breadcrumbStyle: CSSProperties = {
    fontSize: 12,
    color: 'var(--text-muted, #9ca3af)',
};

const liveBadge: CSSProperties = {
    display: 'inline-flex',
    padding: '2px 8px',
    borderRadius: 999,
    background: 'var(--text-danger, #ef4444)',
    color: 'var(--text-primary, #f8fafc)',
    fontSize: 11,
    fontWeight: 700,
};

const errorStyle: CSSProperties = {
    margin: '24px 16px',
    color: 'var(--text-muted, #9ca3af)',
};

const PlayerPane = ({
    stream,
    origin,
}: {
    stream: StreamSummary;
    origin: string | null;
}): JSX.Element => {
    const playlistUrl = origin ? buildOwncastPlaylistUrl(origin) : '';
    const isLive = stream.state === 'live';

    if (!isLive && !stream.replayPointer) {
        return (
            <div style={playerStyle} data-testid="livestream-player-offline">
                <span style={{ opacity: 0.7 }}>Stream is offline.</span>
            </div>
        );
    }

    if (!playlistUrl && !stream.replayPointer) {
        return (
            <div style={playerStyle} data-testid="livestream-player-no-origin">
                <span style={{ opacity: 0.7 }}>Loading player…</span>
            </div>
        );
    }

    // The browser plays HLS natively on Safari/iOS; everywhere else we
    // rely on Owncast's embed page which handles its own player. Until
    // we wire hls.js (deferred), use an iframe to the Owncast player.
    const src =
        isLive && origin ? `${origin.replace(/\/+$/, '')}/embed/video` : stream.replayPointer ?? '';

    return (
        <iframe
            title={`Stream ${stream.id}`}
            src={src}
            style={{ ...playerStyle, border: 0 }}
            data-testid="livestream-player-iframe"
            data-stream-id={stream.id}
            allow="autoplay; fullscreen"
        />
    );
};

/**
 * `/live/:streamId` viewer. Renders the stream metadata, an Owncast
 * embed (live or replay), a TipButton context-bound to the stream, and —
 * when the stream is associated with a den — the den's live chat mounted
 * in-page below the player (via EmbeddedDenChat), plus an "Open full den"
 * link for the standalone room. The breadcrumb's creator link doubles as a
 * product-shelf entry into the creator's storefront.
 */
export const LivestreamViewer = (): JSX.Element => {
    const { streamId } = useParams<{ streamId: string }>();
    const [stream, setStream] = useState<StreamSummary | null>(null);
    const [origin, setOrigin] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [forbidden, setForbidden] = useState(false);
    // A creator's id is their Matrix user id; owning the stream unlocks the
    // replay Clip cutter in the past-broadcasts list.
    const ownUserId = useMatrixClientOrNull()?.getUserId() ?? null;

    useEffect(() => {
        if (!streamId) return;
        let cancelled = false;
        Promise.all([fetchStream(streamId), fetchOwncastOrigin().catch(() => null)])
            .then(([streamRecord, originConfig]) => {
                if (cancelled) return;
                setStream(streamRecord);
                if (originConfig && typeof originConfig.origin === 'string') {
                    setOrigin(originConfig.origin);
                }
            })
            .catch((err) => {
                if (cancelled) return;
                if ((err as { status?: number } | null)?.status === 403) {
                    setForbidden(true);
                } else {
                    setError(err instanceof Error ? err.message : 'failed to load stream');
                }
            });
        return () => {
            cancelled = true;
        };
    }, [streamId]);

    // View start (once per stream per session) + a watch-time heartbeat every
    // 15s while the viewer stays mounted. The player is an Owncast iframe, so
    // wall-clock-on-page is the closest available proxy for watch time.
    useEffect(() => {
        if (!stream) return;
        const mode = stream.state === 'live' ? 'live' : 'replay';
        recordViewEvent(
            'stream_view_started',
            { streamId: stream.id, creatorId: stream.creatorId, mode },
            { dedupeKey: `stream-view:${stream.id}` }
        );
        const heartbeat = setInterval(() => {
            recordViewEvent('stream_view_heartbeat', {
                streamId: stream.id,
                creatorId: stream.creatorId,
                mode,
                seconds: 15,
            });
        }, 15_000);
        return () => clearInterval(heartbeat);
    }, [stream]);

    if (forbidden) {
        return (
            <section style={layoutStyle} data-shell-region="livestream-viewer">
                <p style={errorStyle} data-testid="livestream-viewer-forbidden">
                    Streaming isn’t available on your account yet.{' '}
                    <Link to={LIVE_PATH} style={{ color: 'var(--accent-primary, #3b82f6)' }}>
                        Back to Live
                    </Link>
                    .
                </p>
            </section>
        );
    }

    if (error) {
        return (
            <section style={layoutStyle} data-shell-region="livestream-viewer">
                <p style={errorStyle} data-testid="livestream-viewer-error">
                    {error}{' '}
                    <Link to={LIVE_PATH} style={{ color: 'var(--accent-primary, #3b82f6)' }}>
                        Back to Live
                    </Link>
                    .
                </p>
            </section>
        );
    }

    if (!stream) {
        return (
            <section style={layoutStyle} data-shell-region="livestream-viewer">
                <p style={errorStyle}>Loading stream…</p>
            </section>
        );
    }

    const creatorPath = CREATOR_STOREFRONT_PATH.replace(
        ':userId',
        encodeURIComponent(stream.creatorId)
    );

    return (
        <section
            style={layoutStyle}
            data-shell-region="livestream-viewer"
            data-stream-id={stream.id}
        >
            <header style={headerStyle}>
                <span style={breadcrumbStyle}>
                    <Link to={LIVE_PATH} style={{ color: 'inherit' }}>
                        Live
                    </Link>{' '}
                    /{' '}
                    <Link to={creatorPath} style={{ color: 'inherit' }}>
                        {stream.creatorId}
                    </Link>
                </span>
                <div style={titleRow}>
                    <h1 style={titleStyle}>{stream.title}</h1>
                    {stream.state === 'live' ? <span style={liveBadge}>● LIVE</span> : null}
                </div>
                {stream.tags.length > 0 ? (
                    <span style={breadcrumbStyle}>
                        {stream.tags.map((tag) => `#${tag}`).join(' · ')}
                    </span>
                ) : null}
            </header>
            <PlayerPane stream={stream} origin={origin} />
            {stream.extensions && stream.extensions.length > 0 ? (
                <Suspense fallback={null}>
                    <ExtensionPanelStackLazy streamId={stream.id} panels={stream.extensions} />
                </Suspense>
            ) : null}
            <div style={tipRowStyle} data-testid="livestream-tip-row">
                {stream.denId ? (
                    <Link
                        to={buildCommunitiesPath(null, stream.denId)}
                        style={chatCtaStyle}
                        data-testid="livestream-den-chat-link"
                        data-den-id={stream.denId}
                        onClick={() =>
                            // Instruments how often viewers leave the in-page
                            // embed for the standalone den. This click-through
                            // rate is the V1.1 decision input for whether the
                            // livestream needs a richer embedded chat overlay
                            // (Workstream D) or the deep link is sufficient.
                            recordViewEvent('livestream.deeplink.den_chat.click', {
                                streamId: stream.id,
                                denId: stream.denId,
                                creatorId: stream.creatorId,
                            })
                        }
                    >
                        Open full den ↗
                    </Link>
                ) : null}
                <Suspense fallback={null}>
                    <TipButtonLazy
                        recipientUserId={stream.creatorId}
                        recipientLabel={stream.creatorId}
                        contextKind="stream"
                        contextRef={stream.id}
                    />
                </Suspense>
            </div>
            {stream.denId ? (
                <Suspense fallback={null}>
                    <EmbeddedDenChatLazy denId={stream.denId} />
                </Suspense>
            ) : null}
            <Suspense fallback={null}>
                <ChannelPointsWidgetLazy channelId={stream.creatorId} />
            </Suspense>
            <Suspense fallback={null}>
                <StreamVodsLazy
                    streamId={stream.id}
                    canClip={ownUserId !== null && ownUserId === stream.creatorId}
                />
            </Suspense>
        </section>
    );
};

export default LivestreamViewer;
