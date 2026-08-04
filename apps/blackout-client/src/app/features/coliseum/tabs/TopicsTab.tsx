import React, { useCallback, useState } from 'react';
import { useNavigate } from 'react-router';
import {
    COLISEUM_TOPIC_CATEGORIES,
    type ColiseumTopic,
    type ColiseumTopicCategoryKey,
} from '@blackout/core';
import { useAtom } from 'jotai';
import { EmptyState } from '@blackout/ui/primitives';
import { useColiseumTopics, type ColiseumScopeQuery } from '../hooks/useColiseumTopics';
import { coliseumReturnTabAtom, selectedColiseumTopicIdAtom } from '../../../state/coliseum';
import { buildColiseumTopicPath } from '../../../pages/paths';
import { HeatBadge } from '../components/HeatBadge';
import { RelativeTime } from '../components/RelativeTime';
import { ColiseumFab } from '../components/ColiseumFab';
import { TopicComposerSheet } from '../components/TopicComposerSheet';
import { TopicSeedLine } from '../components/TopicSeedLine';
import { cx } from '../components/cx';
import * as ui from '../components/coliseumUi.css';

export interface TopicsTabProps {
    scope: ColiseumScopeQuery;
}

type CategoryFilter = ColiseumTopicCategoryKey | 'all';

function TopicCard({
    topic,
    onSelect,
}: {
    topic: ColiseumTopic;
    onSelect: (topicId: string) => void;
}) {
    const { seed, newsAnchor, tags, debateHeat, status } = topic;
    const categoryLabel = COLISEUM_TOPIC_CATEGORIES.find(
        (category) => category.key === topic.category
    )?.label;
    return (
        <button
            type="button"
            className={ui.cardInteractive}
            onClick={() => onSelect(topic.id)}
            data-coliseum-topic-id={topic.id}
        >
            <div className={ui.cardHeaderRow}>
                <HeatBadge heat={debateHeat} />
                {categoryLabel ? <span className={ui.tagChip}>{categoryLabel}</span> : null}
                <span className={ui.tagChip} style={{ textTransform: 'uppercase' }}>
                    {status}
                </span>
                <span style={{ marginLeft: 'auto' }}>
                    <RelativeTime timestamp={topic.createdAt} />
                </span>
            </div>
            <h3 className={ui.cardTitle}>{topic.title}</h3>
            {/* The card is itself a button, so the link must not be clickable
                here — a nested anchor would swallow the tap that opens the topic. */}
            <TopicSeedLine seed={seed} newsAnchor={newsAnchor} inert />
            {tags.length > 0 ? (
                <div className={ui.tagRow}>
                    {tags.slice(0, 6).map((tag) => (
                        <span key={tag} className={ui.tagChip}>
                            #{tag}
                        </span>
                    ))}
                </div>
            ) : null}
            <span className={ui.mutedText}>Join the debate →</span>
        </button>
    );
}

function TopicSkeleton() {
    return <div className={ui.skeleton} style={{ height: 140 }} aria-hidden />;
}

export function TopicsTab({ scope }: TopicsTabProps) {
    const [category, setCategory] = useState<CategoryFilter>('all');
    const { data, loading, error, refetch } = useColiseumTopics(scope, {
        limit: 50,
        category: category === 'all' ? undefined : category,
    });
    const [, setSelectedTopicId] = useAtom(selectedColiseumTopicIdAtom);
    const [, setReturnTab] = useAtom(coliseumReturnTabAtom);
    const [composerOpen, setComposerOpen] = useState(false);
    const navigate = useNavigate();

    const handleSelect = useCallback(
        (topicId: string) => {
            // The atom still backs the reused section bodies, but the URL is
            // what a topic *is* now — so a deep dive can be linked and shared.
            setSelectedTopicId(topicId);
            setReturnTab('topics');
            navigate(buildColiseumTopicPath(topicId));
        },
        [setSelectedTopicId, setReturnTab, navigate]
    );

    const onCreated = useCallback(
        (topicId: string) => {
            refetch();
            handleSelect(topicId);
        },
        [refetch, handleSelect]
    );

    const topics = data?.topics ?? [];

    return (
        <div data-testid="coliseum-topics-tab" style={{ minHeight: '100%' }}>
            <div className={ui.chipRow} role="group" aria-label="Filter topics by category">
                <button
                    type="button"
                    className={cx(category === 'all' ? ui.chipActive : ui.chip)}
                    onClick={() => setCategory('all')}
                    aria-pressed={category === 'all'}
                >
                    All
                </button>
                {COLISEUM_TOPIC_CATEGORIES.map((entry) => (
                    <button
                        key={entry.key}
                        type="button"
                        className={cx(category === entry.key ? ui.chipActive : ui.chip)}
                        onClick={() => setCategory(entry.key)}
                        aria-pressed={category === entry.key}
                        data-coliseum-category={entry.key}
                    >
                        {entry.label}
                    </button>
                ))}
            </div>

            {loading && !data ? (
                <div className={ui.feedColumn} aria-busy="true">
                    <TopicSkeleton />
                    <TopicSkeleton />
                    <TopicSkeleton />
                </div>
            ) : null}

            {error ? (
                <EmptyState
                    title="Couldn't load topics"
                    description={error}
                    action={
                        <button type="button" className={ui.chipActive} onClick={refetch}>
                            Retry
                        </button>
                    }
                />
            ) : null}

            {!loading && !error && topics.length === 0 ? (
                <EmptyState
                    title={category === 'all' ? 'No debates yet' : 'Nothing in this category yet'}
                    description="Curate a debate from a recent headline and let the arena decide."
                    action={
                        <button
                            type="button"
                            className={ui.chipActive}
                            onClick={() => setComposerOpen(true)}
                        >
                            Start a debate
                        </button>
                    }
                />
            ) : null}

            {topics.length > 0 ? (
                <div className={ui.feedColumn} data-testid="coliseum-topics" role="feed">
                    {topics.map((topic) => (
                        <TopicCard key={topic.id} topic={topic} onSelect={handleSelect} />
                    ))}
                </div>
            ) : null}

            <ColiseumFab
                label="Start a debate"
                data-testid="coliseum-new-topic"
                onClick={() => setComposerOpen(true)}
            />
            <TopicComposerSheet
                open={composerOpen}
                onClose={() => setComposerOpen(false)}
                scope={scope}
                onCreated={onCreated}
            />
        </div>
    );
}

export default TopicsTab;
