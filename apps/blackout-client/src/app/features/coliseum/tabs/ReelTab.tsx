import React, { useCallback, useRef, useState, type CSSProperties } from 'react';
import { useAtom } from 'jotai';
import type { ColiseumStance, RankedColiseumArgument } from '@blackout/core';
import { useColiseumReel, useColiseumTopic, useColiseumVerdict } from '../hooks/useColiseumTopics';
import {
    coliseumReturnTabAtom,
    coliseumTabAtom,
    selectedColiseumTopicIdAtom,
} from '../../../state/coliseum';
import { useMatrixClientOrNull } from '../../../hooks/useMatrixClient';
import { mxcUrlToHttp } from '../../../utils/matrix';
import ColiseumCitationChip from '../ColiseumCitationChip';
import {
    castColiseumVote as castColiseumVoteDefault,
    type CastColiseumVoteInput,
} from '../coliseumClient';

export type ReelTabClient = {
    castColiseumVote: (input: CastColiseumVoteInput) => Promise<unknown>;
};

const defaultClient: ReelTabClient = {
    castColiseumVote: (input) => castColiseumVoteDefault(input),
};

const STANCE_LABEL: Record<ColiseumStance, string> = {
    for: 'For',
    against: 'Against',
    nuance: 'Nuance',
};

const STANCE_COLOR: Record<ColiseumStance, string> = {
    for: '#1ABC9C',
    against: '#E74C3C',
    nuance: '#F1C40F',
};

/** Horizontal travel (px) past which a swipe counts as a vote. */
const SWIPE_THRESHOLD = 60;

const reelContainerStyle: CSSProperties = {
    height: '100%',
    minHeight: 0,
    overflowY: 'auto',
    scrollSnapType: 'y mandatory',
    background: '#000',
};

const cardStyle: CSSProperties = {
    position: 'relative',
    height: '100%',
    minHeight: 0,
    scrollSnapAlign: 'start',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'flex-end',
    overflow: 'hidden',
    color: '#fff',
    touchAction: 'pan-y',
};

const videoStyle: CSSProperties = {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    background: '#000',
};

const overlayStyle: CSSProperties = {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    padding: 20,
    background: 'linear-gradient(to top, rgba(0,0,0,0.85), rgba(0,0,0,0))',
};

const stanceTagStyle = (stance: ColiseumStance): CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    padding: '2px 10px',
    borderRadius: 999,
    background: `${STANCE_COLOR[stance]}33`,
    color: STANCE_COLOR[stance],
    fontSize: 12,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
});

const voteButtonStyle: CSSProperties = {
    padding: '8px 16px',
    borderRadius: 999,
    border: '1px solid rgba(255,255,255,0.4)',
    background: 'rgba(255,255,255,0.12)',
    color: '#fff',
    cursor: 'pointer',
    fontSize: 14,
};

function ReelCard({
    argument,
    isWinner,
    onVote,
    flash,
    topicTitle,
    onOpenTopic,
}: {
    argument: RankedColiseumArgument;
    isWinner: boolean;
    onVote: (argumentId: string, direction: 'up' | 'down') => void;
    flash: 'up' | 'down' | null;
    topicTitle?: string;
    onOpenTopic?: () => void;
}) {
    const mx = useMatrixClientOrNull();
    const touchStart = useRef<{ x: number; y: number } | null>(null);

    const videoSrc = argument.media && mx ? mxcUrlToHttp(mx, argument.media.mxc, true) : null;
    const posterSrc =
        argument.media?.posterMxc && mx ? mxcUrlToHttp(mx, argument.media.posterMxc, true) : null;

    const onTouchStart = useCallback((event: React.TouchEvent) => {
        const touch = event.touches[0];
        touchStart.current = { x: touch.clientX, y: touch.clientY };
    }, []);

    const onTouchEnd = useCallback(
        (event: React.TouchEvent) => {
            const start = touchStart.current;
            touchStart.current = null;
            if (!start) return;
            const touch = event.changedTouches[0];
            const dx = touch.clientX - start.x;
            const dy = touch.clientY - start.y;
            // Horizontal intent only: vertical swipes fall through to native
            // scroll-snap (scroll up = next argument = neutral).
            if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > SWIPE_THRESHOLD) {
                onVote(argument.id, dx > 0 ? 'up' : 'down');
            }
        },
        [argument.id, onVote]
    );

    return (
        <article
            style={cardStyle}
            data-testid="coliseum-reel-card"
            data-coliseum-argument-id={argument.id}
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
        >
            {videoSrc ? (
                <video
                    style={videoStyle}
                    src={videoSrc}
                    poster={posterSrc ?? undefined}
                    playsInline
                    muted
                    loop
                    controls={false}
                    data-testid="coliseum-reel-video"
                />
            ) : (
                <div
                    style={{
                        ...videoStyle,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 32,
                        background: 'radial-gradient(circle at 50% 30%, #1c2733, #05080c)',
                    }}
                >
                    <p
                        style={{
                            margin: 0,
                            fontSize: 22,
                            lineHeight: 1.4,
                            fontWeight: 600,
                            textAlign: 'center',
                            maxWidth: 640,
                        }}
                    >
                        {argument.body}
                    </p>
                </div>
            )}

            {flash ? (
                <div
                    aria-hidden
                    data-testid={`coliseum-reel-flash-${flash}`}
                    style={{
                        position: 'absolute',
                        inset: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 96,
                        background:
                            flash === 'up' ? 'rgba(26,188,156,0.18)' : 'rgba(231,76,60,0.18)',
                    }}
                >
                    {flash === 'up' ? '👍' : '👎'}
                </div>
            ) : null}

            <div style={overlayStyle}>
                {topicTitle ? (
                    <button
                        type="button"
                        data-testid="coliseum-reel-topic-chip"
                        onClick={onOpenTopic}
                        style={{
                            alignSelf: 'flex-start',
                            padding: '2px 10px',
                            borderRadius: 999,
                            border: '1px solid rgba(255,255,255,0.3)',
                            background: 'rgba(255,255,255,0.1)',
                            color: '#fff',
                            cursor: onOpenTopic ? 'pointer' : 'default',
                            fontSize: 12,
                        }}
                    >
                        From: {topicTitle} →
                    </button>
                ) : null}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={stanceTagStyle(argument.stance)}>
                        {STANCE_LABEL[argument.stance]}
                    </span>
                    {argument.parentArgumentId ? (
                        <span
                            data-testid="coliseum-reel-rebuttal"
                            style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)' }}
                        >
                            ↪ rebuttal
                        </span>
                    ) : null}
                    {isWinner ? (
                        <span style={{ fontSize: 12, fontWeight: 700 }}>🏆 Winner</span>
                    ) : null}
                    <span
                        style={{
                            marginLeft: 'auto',
                            fontSize: 12,
                            color: 'rgba(255,255,255,0.75)',
                        }}
                    >
                        {Math.round(argument.voteScore * 100)}% support · consensus{' '}
                        {Math.round(argument.nuanceScore * 100)}%
                    </span>
                </div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)' }}>
                    {argument.authorId}
                </div>
                {videoSrc ? (
                    <p style={{ margin: 0, fontSize: 15, lineHeight: 1.4 }}>{argument.body}</p>
                ) : null}
                {argument.citations.length > 0 ? (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {argument.citations.map((citation, index) => (
                            <ColiseumCitationChip key={index} citation={citation} />
                        ))}
                    </div>
                ) : null}
                <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                    <button
                        type="button"
                        data-testid={`coliseum-reel-vote-up-${argument.id}`}
                        style={voteButtonStyle}
                        onClick={() => onVote(argument.id, 'up')}
                    >
                        👍 Agree
                    </button>
                    <button
                        type="button"
                        data-testid={`coliseum-reel-vote-down-${argument.id}`}
                        style={voteButtonStyle}
                        onClick={() => onVote(argument.id, 'down')}
                    >
                        👎 Disagree
                    </button>
                </div>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
                    Swipe right to agree · left to disagree · up for next
                </span>
            </div>
        </article>
    );
}

/** Shared flash + fire-and-forget vote handling for both reel modes. */
function useReelVote(client: ReelTabClient, onAfter: () => void) {
    const [flashes, setFlashes] = useState<Record<string, 'up' | 'down' | null>>({});
    const onVote = useCallback(
        (argumentId: string, direction: 'up' | 'down') => {
            setFlashes((prev) => ({ ...prev, [argumentId]: direction }));
            window.setTimeout(() => {
                setFlashes((prev) => ({ ...prev, [argumentId]: null }));
            }, 450);
            void (async () => {
                try {
                    await client.castColiseumVote({ argumentId, direction });
                    onAfter();
                } catch {
                    // Reel is fire-and-forget; the next refetch reconciles state.
                }
            })();
        },
        [client, onAfter]
    );
    return { flashes, onVote };
}

function TopicReel({ topicId, client }: { topicId: string; client: ReelTabClient }) {
    const { data: topicData, loading, error, refetch } = useColiseumTopic(topicId);
    const { data: verdictData, refetch: refetchVerdict } = useColiseumVerdict(topicId);
    const onAfter = useCallback(() => {
        refetch();
        refetchVerdict();
    }, [refetch, refetchVerdict]);
    const { flashes, onVote } = useReelVote(client, onAfter);

    if (loading && !topicData) {
        return <div style={{ padding: 24 }}>Loading reel...</div>;
    }
    if (error) {
        return <div style={{ padding: 24, color: 'var(--danger)' }}>Couldn't load: {error}</div>;
    }
    if (!topicData) {
        return <div style={{ padding: 24 }}>Topic not found.</div>;
    }

    const { arguments: args } = topicData;
    const winnerId = verdictData?.verdict?.winningArgumentId ?? null;

    if (args.length === 0) {
        return (
            <div style={{ padding: 24, color: 'var(--text-secondary)' }}>
                No arguments yet. Be first to take a stance on the Debate tab.
            </div>
        );
    }

    return (
        <div style={reelContainerStyle} data-testid="coliseum-reel">
            {args.map((argument) => (
                <ReelCard
                    key={argument.id}
                    argument={argument}
                    isWinner={argument.id === winnerId}
                    onVote={onVote}
                    flash={flashes[argument.id] ?? null}
                />
            ))}
        </div>
    );
}

function GlobalReel({ client }: { client: ReelTabClient }) {
    const [, setSelectedTopicId] = useAtom(selectedColiseumTopicIdAtom);
    const [, setTab] = useAtom(coliseumTabAtom);
    const [, setReturnTab] = useAtom(coliseumReturnTabAtom);
    const { items, loading, error, hasMore, loadMore } = useColiseumReel(20);
    // Votes here are fire-and-forget; don't refetch (it would reset pagination).
    const { flashes, onVote } = useReelVote(client, () => {});

    // Pull the next page when the user scrolls within ~2 cards of the end.
    const onScroll = useCallback(
        (event: React.UIEvent<HTMLDivElement>) => {
            if (!hasMore) return;
            const el = event.currentTarget;
            if (el.scrollTop + el.clientHeight >= el.scrollHeight - el.clientHeight * 2) {
                loadMore();
            }
        },
        [hasMore, loadMore]
    );

    if (loading && items.length === 0) {
        return <div style={{ padding: 24 }}>Loading discourse reel...</div>;
    }
    if (error && items.length === 0) {
        return <div style={{ padding: 24, color: 'var(--danger)' }}>Couldn't load: {error}</div>;
    }

    if (items.length === 0) {
        return (
            <div style={{ padding: 24, color: 'var(--text-secondary)' }}>
                No arguments to show yet. Start a debate from the{' '}
                <button
                    type="button"
                    onClick={() => setTab('topics')}
                    style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--accent-primary, #1ABC9C)',
                        cursor: 'pointer',
                        padding: 0,
                        fontSize: 'inherit',
                    }}
                >
                    Topics
                </button>{' '}
                tab.
            </div>
        );
    }

    return (
        <div style={reelContainerStyle} data-testid="coliseum-reel-global" onScroll={onScroll}>
            {items.map((item) => (
                <ReelCard
                    key={item.id}
                    argument={item}
                    isWinner={false}
                    onVote={onVote}
                    flash={flashes[item.id] ?? null}
                    topicTitle={item.topicTitle}
                    onOpenTopic={() => {
                        setSelectedTopicId(item.topicId);
                        setReturnTab('reel');
                        setTab('debate');
                    }}
                />
            ))}
        </div>
    );
}

export function ReelTab({ client = defaultClient }: { client?: ReelTabClient } = {}) {
    const [selectedTopicId] = useAtom(selectedColiseumTopicIdAtom);
    return selectedTopicId ? (
        <TopicReel topicId={selectedTopicId} client={client} />
    ) : (
        <GlobalReel client={client} />
    );
}

export default ReelTab;
