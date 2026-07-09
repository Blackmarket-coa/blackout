import React, { useCallback, useState } from 'react';
import { useAtom } from 'jotai';
import { useColiseumReel, useColiseumTopic, useColiseumVerdict } from '../hooks/useColiseumTopics';
import {
    coliseumReturnTabAtom,
    coliseumTabAtom,
    selectedColiseumTopicIdAtom,
} from '../../../state/coliseum';
import { ArgumentReel, type ArgumentReelItem } from '../components/ArgumentReel';
import { useArgumentShare } from '../components/useArgumentShare';
import {
    castColiseumVote as castColiseumVoteDefault,
    type CastColiseumVoteInput,
} from '../coliseumClient';
import * as css from './reel.css';

export type ReelTabClient = {
    castColiseumVote: (input: CastColiseumVoteInput) => Promise<unknown>;
};

const defaultClient: ReelTabClient = {
    castColiseumVote: (input) => castColiseumVoteDefault(input),
};

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

/** Hook up drill-in navigation into the debate thread from a reel item. */
function useOpenDebate() {
    const [, setSelectedTopicId] = useAtom(selectedColiseumTopicIdAtom);
    const [, setTab] = useAtom(coliseumTabAtom);
    const [, setReturnTab] = useAtom(coliseumReturnTabAtom);
    return useCallback(
        (topicId: string) => {
            setSelectedTopicId(topicId);
            setReturnTab('reel');
            setTab('debate');
        },
        [setSelectedTopicId, setReturnTab, setTab]
    );
}

function ReelMessage({ children, testId }: { children: React.ReactNode; testId?: string }) {
    return (
        <div className={css.messageState} data-testid={testId}>
            {children}
        </div>
    );
}

function TopicReel({
    topicId,
    client,
    onExitTopic,
}: {
    topicId: string;
    client: ReelTabClient;
    onExitTopic: () => void;
}) {
    const { data: topicData, loading, error, refetch } = useColiseumTopic(topicId);
    const { data: verdictData, refetch: refetchVerdict } = useColiseumVerdict(topicId);
    const openDebate = useOpenDebate();
    const { shareStatus, onShare } = useArgumentShare();
    const onAfter = useCallback(() => {
        refetch();
        refetchVerdict();
    }, [refetch, refetchVerdict]);
    const { flashes, onVote } = useReelVote(client, onAfter);

    if (loading && !topicData) {
        return <ReelMessage testId="coliseum-reel-loading">Loading reel…</ReelMessage>;
    }
    if (error) {
        return (
            <ReelMessage>
                <span style={{ color: 'var(--danger)' }}>Couldn't load: {error}</span>
                <button type="button" className={css.hintButton} onClick={refetch}>
                    Retry
                </button>
            </ReelMessage>
        );
    }
    if (!topicData) {
        return <ReelMessage>Topic not found.</ReelMessage>;
    }

    const { topic, arguments: args } = topicData;
    const winnerId = verdictData?.verdict?.winningArgumentId ?? null;

    if (args.length === 0) {
        return (
            <ReelMessage>
                No arguments yet. Be first to take a stance in the debate.
                <button
                    type="button"
                    className={css.hintButton}
                    onClick={() => openDebate(topicId)}
                >
                    Open the debate
                </button>
            </ReelMessage>
        );
    }

    const items: ArgumentReelItem[] = args.map((argument) => ({
        ...argument,
        topicTitle: topic.title,
    }));

    return (
        <div style={{ position: 'relative', height: '100%', minHeight: 0 }}>
            <button
                type="button"
                className={css.topicScopePill}
                data-testid="coliseum-reel-exit-topic"
                onClick={onExitTopic}
            >
                ✕ {topic.title}
            </button>
            <ArgumentReel
                items={items}
                winnerId={winnerId}
                flashes={flashes}
                onVote={onVote}
                onOpenTopic={(item) => openDebate(item.topicId)}
                onShare={(item) => void onShare(item.topicId, item.topicTitle ?? item.body)}
                shareStatus={shareStatus}
                data-testid="coliseum-reel"
            />
        </div>
    );
}

function GlobalReel({ client }: { client: ReelTabClient }) {
    const [, setTab] = useAtom(coliseumTabAtom);
    const { items, loading, error, hasMore, loadMore } = useColiseumReel(20);
    const openDebate = useOpenDebate();
    const { shareStatus, onShare } = useArgumentShare();
    // Votes here are fire-and-forget; don't refetch (it would reset pagination).
    const { flashes, onVote } = useReelVote(client, () => {});

    if (loading && items.length === 0) {
        return <ReelMessage testId="coliseum-reel-loading">Loading discourse reel…</ReelMessage>;
    }
    if (error && items.length === 0) {
        return (
            <ReelMessage>
                <span style={{ color: 'var(--danger)' }}>Couldn't load: {error}</span>
                <button type="button" className={css.hintButton} onClick={loadMore}>
                    Retry
                </button>
            </ReelMessage>
        );
    }

    if (items.length === 0) {
        return (
            <ReelMessage>
                No arguments to show yet — start a debate from a topic.
                <button type="button" className={css.hintButton} onClick={() => setTab('topics')}>
                    Browse topics
                </button>
            </ReelMessage>
        );
    }

    return (
        <ArgumentReel
            items={items}
            flashes={flashes}
            onVote={onVote}
            onOpenTopic={(item) => openDebate(item.topicId)}
            onShare={(item) => void onShare(item.topicId, item.topicTitle ?? item.body)}
            shareStatus={shareStatus}
            onEndReached={loadMore}
            hasMore={hasMore}
            loading={loading}
            data-testid="coliseum-reel-global"
        />
    );
}

export function ReelTab({ client = defaultClient }: { client?: ReelTabClient } = {}) {
    const [selectedTopicId, setSelectedTopicId] = useAtom(selectedColiseumTopicIdAtom);
    return selectedTopicId ? (
        <TopicReel
            topicId={selectedTopicId}
            client={client}
            onExitTopic={() => setSelectedTopicId(null)}
        />
    ) : (
        <GlobalReel client={client} />
    );
}

export default ReelTab;
