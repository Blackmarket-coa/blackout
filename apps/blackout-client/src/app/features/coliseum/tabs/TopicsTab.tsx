import React, { type CSSProperties } from 'react';
import { useAtom } from 'jotai';
import type { ColiseumTopic } from '@blackout/core';
import { useColiseumTopics, type ColiseumScopeQuery } from '../hooks/useColiseumTopics';
import { coliseumTabAtom, selectedColiseumTopicIdAtom } from '../../../state/bmc-coliseum';

export interface TopicsTabProps {
    scope: ColiseumScopeQuery;
}

const listStyle: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: 16,
    padding: 16,
};

const cardStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    padding: 16,
    border: '1px solid var(--border-default)',
    borderRadius: 12,
    background: 'var(--bg-surface)',
    color: 'var(--text-primary)',
    cursor: 'pointer',
    textAlign: 'left',
};

const heatBadgeStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 11,
    fontWeight: 700,
    color: '#0d1f14',
    background: 'var(--accent-primary, #1ABC9C)',
    padding: '2px 8px',
    borderRadius: 999,
};

const statusBadgeStyle: CSSProperties = {
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--text-secondary)',
    border: '1px solid var(--border-default)',
    padding: '2px 8px',
    borderRadius: 999,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
};

const tagStyle: CSSProperties = {
    fontSize: 11,
    color: 'var(--text-secondary)',
    background: 'var(--bg-input)',
    border: '1px solid var(--border-default)',
    padding: '2px 6px',
    borderRadius: 999,
};

function formatHeat(value: number): string {
    return `${Math.round(value * 100)}°`;
}

function TopicCard({
    topic,
    onSelect,
}: {
    topic: ColiseumTopic;
    onSelect: (topicId: string) => void;
}) {
    const { newsAnchor, tags, debateHeat, status } = topic;
    return (
        <button
            type="button"
            style={cardStyle}
            onClick={() => onSelect(topic.id)}
            data-coliseum-topic-id={topic.id}
        >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span style={heatBadgeStyle}>🔥 {formatHeat(debateHeat)}</span>
                <span style={statusBadgeStyle}>{status}</span>
            </div>
            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>{topic.title}</h3>
            <a
                href={newsAnchor.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(event) => event.stopPropagation()}
                style={{
                    fontSize: 13,
                    color: 'var(--text-secondary)',
                    textDecoration: 'none',
                }}
            >
                📰 {newsAnchor.headline}
            </a>
            {tags.length > 0 ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {tags.slice(0, 6).map((tag) => (
                        <span key={tag} style={tagStyle}>
                            #{tag}
                        </span>
                    ))}
                </div>
            ) : null}
        </button>
    );
}

export function TopicsTab({ scope }: TopicsTabProps) {
    const { data, loading, error } = useColiseumTopics(scope, { limit: 50 });
    const [, setSelectedTopicId] = useAtom(selectedColiseumTopicIdAtom);
    const [, setTab] = useAtom(coliseumTabAtom);

    const handleSelect = (topicId: string) => {
        setSelectedTopicId(topicId);
        setTab('debate');
    };

    if (loading && !data) {
        return <div style={{ padding: 24 }}>Loading topics...</div>;
    }
    if (error) {
        return <div style={{ padding: 24, color: 'var(--danger)' }}>Couldn't load: {error}</div>;
    }
    const topics = data?.topics ?? [];
    if (topics.length === 0) {
        return (
            <div style={{ padding: 24, color: 'var(--text-secondary)' }}>
                No active debates yet. Curate a topic from a recent headline to get started.
            </div>
        );
    }

    return (
        <div style={listStyle} data-testid="coliseum-topics">
            {topics.map((topic) => (
                <TopicCard key={topic.id} topic={topic} onSelect={handleSelect} />
            ))}
        </div>
    );
}

export default TopicsTab;
