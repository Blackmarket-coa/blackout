import React, { type CSSProperties } from 'react';
import { useAtom } from 'jotai';
import type { ColiseumCitation } from '@blackout/core';
import { useColiseumTopic } from '../hooks/useColiseumTopics';
import { coliseumTabAtom, selectedColiseumTopicIdAtom } from '../../../state/coliseum';
import ColiseumCitationChip from '../ColiseumCitationChip';

const containerStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    padding: 16,
};

const sectionStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    padding: 16,
    border: '1px solid var(--border-default)',
    borderRadius: 12,
    background: 'var(--bg-surface)',
};

const headingStyle: CSSProperties = {
    margin: 0,
    fontSize: 13,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: 'var(--text-secondary)',
};

const SOURCE_KINDS: ReadonlyArray<{ kind: ColiseumCitation['kind']; heading: string }> = [
    { kind: 'article', heading: 'News articles' },
    { kind: 'audio', heading: 'Audio clips' },
    { kind: 'proposal', heading: 'Linked proposals' },
];

export function SourcesTab() {
    const [selectedTopicId] = useAtom(selectedColiseumTopicIdAtom);
    const [, setTab] = useAtom(coliseumTabAtom);
    const { data, loading, error } = useColiseumTopic(selectedTopicId);

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
                tab to see its citations.
            </div>
        );
    }
    if (loading && !data) return <div style={{ padding: 24 }}>Loading sources...</div>;
    if (error) return <div style={{ padding: 24, color: 'var(--danger)' }}>Couldn't load: {error}</div>;
    if (!data) return null;

    const allCitations: ColiseumCitation[] = data.arguments.flatMap((arg) => arg.citations);

    if (allCitations.length === 0) {
        return (
            <div style={{ padding: 24, color: 'var(--text-secondary)' }}>
                Arguments on this topic don't cite any sources yet.
            </div>
        );
    }

    const grouped = SOURCE_KINDS.map(({ kind, heading }) => ({
        heading,
        kind,
        citations: allCitations.filter((c) => c.kind === kind),
    })).filter((group) => group.citations.length > 0);

    return (
        <div style={containerStyle} data-testid="coliseum-sources">
            <article style={sectionStyle}>
                <h3 style={headingStyle}>Anchor news</h3>
                <a
                    href={data.topic.newsAnchor.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: 14, color: 'var(--text-primary)' }}
                >
                    📰 {data.topic.newsAnchor.headline}
                </a>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    Published {new Date(data.topic.newsAnchor.publishedAt).toLocaleString()}
                </span>
            </article>

            {grouped.map((group) => (
                <article key={group.kind} style={sectionStyle}>
                    <h3 style={headingStyle}>{group.heading}</h3>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {group.citations.map((citation, index) => (
                            <ColiseumCitationChip key={index} citation={citation} />
                        ))}
                    </div>
                </article>
            ))}
        </div>
    );
}

export default SourcesTab;
