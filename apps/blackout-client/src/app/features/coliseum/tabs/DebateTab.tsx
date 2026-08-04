import React, { useCallback, useMemo, useState } from 'react';
import { useAtom } from 'jotai';
import {
    buildColiseumArgumentTree,
    type ColiseumArgumentTreeNode,
    type RankedColiseumArgument,
} from '@blackout/core';
import { useColiseumTopic, useColiseumVerdict } from '../hooks/useColiseumTopics';
import { coliseumTabAtom, selectedColiseumTopicIdAtom } from '../../../state/coliseum';
import { useMatrixClientOrNull } from '../../../hooks/useMatrixClient';
import { uploadMedia } from '../../media/utils/matrixMedia';
import ColiseumCitationChip from '../ColiseumCitationChip';
import { StanceBadge } from '../components/StanceBadge';
import { StanceBar } from '../components/StanceBar';
import { AuthorLine } from '../components/AuthorLine';
import { TopicSeedLine } from '../components/TopicSeedLine';
import { ArgumentComposerSheet } from '../components/ArgumentComposerSheet';
import { useArgumentShare } from '../components/useArgumentShare';
import { STANCE_COLOR } from '../components/stance';
import * as ui from '../components/coliseumUi.css';
import {
    castColiseumVote as castColiseumVoteDefault,
    createColiseumArgument as createColiseumArgumentDefault,
    type CastColiseumVoteInput,
    type CreateColiseumArgumentInput,
} from '../coliseumClient';

export type DebateTabClient = {
    castColiseumVote: (input: CastColiseumVoteInput) => Promise<unknown>;
    createColiseumArgument: (input: CreateColiseumArgumentInput) => Promise<unknown>;
    /** Uploads a recorded/picked video and resolves its `mxc://` URI. */
    uploadArgumentVideo?: (file: File) => Promise<string>;
};

const defaultClient: DebateTabClient = {
    castColiseumVote: (input) => castColiseumVoteDefault(input),
    createColiseumArgument: (input) => createColiseumArgumentDefault(input),
};

/** Maximum indentation steps so deep rebuttal chains don't run off-screen. */
const MAX_THREAD_INDENT = 5;

function ArgumentCard({
    argument,
    isWinner,
    onVote,
    onRebut,
    onShare,
    pendingDirection,
}: {
    argument: RankedColiseumArgument;
    isWinner: boolean;
    onVote: (argumentId: string, direction: 'up' | 'down') => Promise<void>;
    onRebut: (argument: RankedColiseumArgument) => void;
    onShare?: (argument: RankedColiseumArgument) => void;
    pendingDirection: 'up' | 'down' | null;
}) {
    return (
        <article
            className={ui.card}
            style={isWinner ? { outline: `2px solid ${STANCE_COLOR[argument.stance]}` } : undefined}
            data-coliseum-argument-id={argument.id}
        >
            <AuthorLine userId={argument.authorId} timestamp={argument.createdAt}>
                <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
                    {isWinner ? (
                        <span
                            style={{
                                fontSize: 12,
                                color: 'var(--accent-primary, #1ABC9C)',
                                fontWeight: 700,
                            }}
                        >
                            🏆 Winner
                        </span>
                    ) : null}
                    <StanceBadge stance={argument.stance} />
                </span>
            </AuthorLine>
            <p style={{ margin: 0, fontSize: 15, lineHeight: 1.5 }}>{argument.body}</p>
            {argument.citations.length > 0 ? (
                <div className={ui.tagRow}>
                    {argument.citations.map((citation, index) => (
                        <ColiseumCitationChip key={index} citation={citation} />
                    ))}
                </div>
            ) : null}
            <div className={ui.actionRow} data-testid="coliseum-debate-vote-controls">
                <button
                    type="button"
                    className={ui.actionButton}
                    data-testid={`coliseum-vote-up-${argument.id}`}
                    onClick={() => void onVote(argument.id, 'up')}
                    disabled={pendingDirection !== null}
                    aria-label="Agree"
                >
                    {pendingDirection === 'up' ? 'Voting…' : '👍 Agree'}
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {Math.round(argument.voteScore * 100)}%
                    </span>
                </button>
                <button
                    type="button"
                    className={ui.actionButton}
                    data-testid={`coliseum-vote-down-${argument.id}`}
                    onClick={() => void onVote(argument.id, 'down')}
                    disabled={pendingDirection !== null}
                    aria-label="Disagree"
                >
                    {pendingDirection === 'down' ? 'Voting…' : '👎 Disagree'}
                </button>
                <button
                    type="button"
                    className={ui.actionButton}
                    data-testid={`coliseum-rebut-${argument.id}`}
                    onClick={() => onRebut(argument)}
                >
                    ↪ Rebut
                </button>
                {onShare ? (
                    <button
                        type="button"
                        className={ui.actionButton}
                        data-testid={`coliseum-share-${argument.id}`}
                        onClick={() => onShare(argument)}
                        aria-label="Share"
                    >
                        ↗ Share
                    </button>
                ) : null}
                <span className={ui.mutedText} style={{ marginLeft: 'auto' }}>
                    consensus {Math.round(argument.nuanceScore * 100)}%
                </span>
            </div>
        </article>
    );
}

function ThreadedArgument({
    node,
    winnerId,
    onVote,
    onRebut,
    onShare,
    pendingVotes,
}: {
    node: ColiseumArgumentTreeNode<RankedColiseumArgument>;
    winnerId: string | null;
    onVote: (argumentId: string, direction: 'up' | 'down') => Promise<void>;
    onRebut: (argument: RankedColiseumArgument) => void;
    onShare?: (argument: RankedColiseumArgument) => void;
    pendingVotes: Record<string, 'up' | 'down' | null>;
}) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <ArgumentCard
                argument={node.argument}
                isWinner={node.argument.id === winnerId}
                onVote={onVote}
                onRebut={onRebut}
                onShare={onShare}
                pendingDirection={pendingVotes[node.argument.id] ?? null}
            />
            {node.replies.length > 0 ? (
                <div
                    className={node.depth < MAX_THREAD_INDENT ? ui.threadChildren : undefined}
                    style={
                        node.depth >= MAX_THREAD_INDENT
                            ? { display: 'flex', flexDirection: 'column', gap: 12 }
                            : undefined
                    }
                >
                    {node.replies.map((reply) => (
                        <ThreadedArgument
                            key={reply.argument.id}
                            node={reply}
                            winnerId={winnerId}
                            onVote={onVote}
                            onRebut={onRebut}
                            onShare={onShare}
                            pendingVotes={pendingVotes}
                        />
                    ))}
                </div>
            ) : null}
        </div>
    );
}

export function DebateTab({ client = defaultClient }: { client?: DebateTabClient } = {}) {
    const [selectedTopicId] = useAtom(selectedColiseumTopicIdAtom);
    const [, setTab] = useAtom(coliseumTabAtom);
    const {
        data: topicData,
        loading,
        error,
        refetch: refetchTopic,
    } = useColiseumTopic(selectedTopicId);
    const { data: verdictData, refetch: refetchVerdict } = useColiseumVerdict(selectedTopicId);
    const [pendingVotes, setPendingVotes] = useState<Record<string, 'up' | 'down' | null>>({});
    const [voteError, setVoteError] = useState<string | null>(null);
    const [replyingTo, setReplyingTo] = useState<{ id: string; authorId: string } | null>(null);
    const [composerOpen, setComposerOpen] = useState(false);
    const { shareStatus, onShare } = useArgumentShare();
    const mx = useMatrixClientOrNull();

    const onRebut = useCallback((argument: RankedColiseumArgument) => {
        setReplyingTo({ id: argument.id, authorId: argument.authorId });
        setComposerOpen(true);
    }, []);

    const uploadVideo = useMemo<((file: File) => Promise<string>) | undefined>(() => {
        if (client.uploadArgumentVideo) return client.uploadArgumentVideo;
        if (mx) return (file: File) => uploadMedia(mx, file);
        return undefined;
    }, [client, mx]);

    const onVote = useCallback(
        async (argumentId: string, direction: 'up' | 'down') => {
            setVoteError(null);
            setPendingVotes((prev) => ({ ...prev, [argumentId]: direction }));
            try {
                await client.castColiseumVote({ argumentId, direction });
                refetchTopic();
                refetchVerdict();
            } catch (err) {
                setVoteError(err instanceof Error ? err.message : 'Vote failed.');
            } finally {
                setPendingVotes((prev) => ({ ...prev, [argumentId]: null }));
            }
        },
        [client, refetchTopic, refetchVerdict]
    );

    const onCreateArgument = useCallback(
        async (input: CreateColiseumArgumentInput) => {
            await client.createColiseumArgument(input);
            refetchTopic();
            refetchVerdict();
        },
        [client, refetchTopic, refetchVerdict]
    );

    const closeComposer = useCallback(() => {
        setComposerOpen(false);
        setReplyingTo(null);
    }, []);

    if (!selectedTopicId) {
        return (
            <div style={{ padding: 24, color: 'var(--text-secondary)' }}>
                Pick a topic on the{' '}
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
                tab to start the debate.
            </div>
        );
    }

    if (loading && !topicData) {
        return (
            <div className={ui.feedColumn} aria-busy="true">
                <div className={ui.skeleton} style={{ height: 120 }} aria-hidden />
                <div className={ui.skeleton} style={{ height: 160 }} aria-hidden />
                <div className={ui.skeleton} style={{ height: 160 }} aria-hidden />
            </div>
        );
    }
    if (error) {
        return <div style={{ padding: 24, color: 'var(--danger)' }}>Couldn't load: {error}</div>;
    }
    if (!topicData) {
        return <div style={{ padding: 24 }}>Topic not found.</div>;
    }

    const { topic, arguments: args } = topicData;
    const verdict = verdictData?.verdict ?? null;
    const hasVerdict = Boolean(
        verdict?.winningArgumentId && (verdict?.consensusArgumentIds.length ?? 0) > 0
    );
    const winnerId = verdict?.winningArgumentId ?? null;

    return (
        <div
            style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}
            data-testid="coliseum-debate"
        >
            <div className={ui.feedColumn} style={{ flex: 1, paddingBottom: 16 }}>
                <header className={ui.card}>
                    <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, lineHeight: 1.3 }}>
                        {topic.title}
                    </h2>
                    <TopicSeedLine seed={topic.seed} newsAnchor={topic.newsAnchor} />
                    <StanceBar items={args} />
                    <span className={ui.mutedText}>
                        {args.length} argument{args.length === 1 ? '' : 's'}
                    </span>
                </header>

                {hasVerdict ? (
                    <section
                        className={ui.card}
                        style={{
                            borderColor: 'var(--accent-primary, #1ABC9C)',
                            background: 'rgba(26, 188, 156, 0.08)',
                        }}
                        data-testid="coliseum-debate-verdict"
                    >
                        <strong>Community verdict</strong>
                        <span className={ui.mutedText}>
                            Highest cross-cluster consensus among{' '}
                            {verdict!.consensusArgumentIds.length} broadly-endorsed argument
                            {verdict!.consensusArgumentIds.length === 1 ? '' : 's'}.
                        </span>
                    </section>
                ) : args.length > 0 ? (
                    <span className={ui.mutedText} data-testid="coliseum-debate-no-verdict">
                        No community verdict yet — voting continues.
                    </span>
                ) : null}

                {voteError ? (
                    <div
                        role="alert"
                        data-testid="coliseum-debate-vote-error"
                        style={{ color: 'var(--danger)', fontSize: 12 }}
                    >
                        {voteError}
                    </div>
                ) : null}

                {shareStatus ? (
                    <div role="status" className={ui.mutedText}>
                        {shareStatus}
                    </div>
                ) : null}

                {args.length === 0 ? (
                    <div className={ui.card} style={{ alignItems: 'flex-start' }}>
                        <strong>No arguments yet.</strong>
                        <span className={ui.mutedText}>
                            Be first to take a stance — every debate starts with one voice.
                        </span>
                    </div>
                ) : (
                    buildColiseumArgumentTree(args).map((node) => (
                        <ThreadedArgument
                            key={node.argument.id}
                            node={node}
                            winnerId={winnerId}
                            onVote={onVote}
                            onRebut={onRebut}
                            onShare={(argument) => void onShare(argument.topicId, topic.title)}
                            pendingVotes={pendingVotes}
                        />
                    ))
                )}
            </div>

            <div className={ui.stickyComposerBar}>
                <button
                    type="button"
                    className={ui.composerBarPrompt}
                    data-testid="coliseum-debate-composer-open"
                    onClick={() => setComposerOpen(true)}
                >
                    Make your case…
                </button>
            </div>

            <ArgumentComposerSheet
                open={composerOpen}
                onClose={closeComposer}
                topicId={selectedTopicId}
                onCreate={onCreateArgument}
                onUploadVideo={uploadVideo}
                replyingTo={replyingTo}
                onCancelReply={() => setReplyingTo(null)}
            />
        </div>
    );
}

export default DebateTab;
