import React from 'react';
import { useAtom } from 'jotai';
import { resolveTopicSeed, type ColiseumCitation } from '@blackout/core';
import { EmptyState } from '@blackout/ui/primitives';
import { useColiseumTopic } from '../hooks/useColiseumTopics';
import { coliseumTabAtom, selectedColiseumTopicIdAtom } from '../../../state/coliseum';
import ColiseumCitationChip from '../ColiseumCitationChip';
import * as ui from '../components/coliseumUi.css';

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
            <EmptyState
                title="No topic selected"
                description="Pick a topic in the arena to see every source its arguments cite."
                action={
                    <button
                        type="button"
                        className={ui.chipActive}
                        onClick={() => setTab('topics')}
                    >
                        Browse topics
                    </button>
                }
            />
        );
    }
    if (loading && !data) {
        return (
            <div className={ui.feedColumn} aria-busy="true">
                <div className={ui.skeleton} style={{ height: 110 }} aria-hidden />
                <div className={ui.skeleton} style={{ height: 90 }} aria-hidden />
            </div>
        );
    }
    if (error)
        return <div style={{ padding: 24, color: 'var(--danger)' }}>Couldn't load: {error}</div>;
    if (!data) return null;

    const allCitations: ColiseumCitation[] = data.arguments.flatMap((arg) => arg.citations);
    const topicSeed = resolveTopicSeed(data.topic);

    if (allCitations.length === 0) {
        return (
            <EmptyState
                title="No sources cited yet"
                description="When arguments cite articles, audio, or proposals, they'll be collected here."
                action={
                    <button
                        type="button"
                        className={ui.chipActive}
                        onClick={() => setTab('debate')}
                    >
                        Go to the debate
                    </button>
                }
            />
        );
    }

    const grouped = SOURCE_KINDS.map(({ kind, heading }) => ({
        heading,
        kind,
        citations: allCitations.filter((c) => c.kind === kind),
    })).filter((group) => group.citations.length > 0);

    return (
        <div className={ui.feedColumn} data-testid="coliseum-sources">
            {/* Only a link-seeded topic has an article behind it. A topic
                proposed as a bare question, a video, or a challenge has no
                anchor to show — its citations below are the whole story.
                Resolved rather than read directly so a topic from a server
                that predates seeds still shows its headline. */}
            {topicSeed.kind === 'link' ? (
                <article className={ui.card} data-testid="coliseum-sources-anchor">
                    <h3 className={ui.cardTitle}>Anchor news</h3>
                    <a
                        href={topicSeed.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={ui.mutedLink}
                        style={{ fontSize: 14, color: 'var(--text-primary)' }}
                    >
                        📰 {topicSeed.headline}
                    </a>
                    <span className={ui.mutedText} style={{ fontSize: 12 }}>
                        Published {new Date(topicSeed.publishedAt).toLocaleString()}
                    </span>
                </article>
            ) : null}

            {grouped.map((group) => (
                <article key={group.kind} className={ui.card}>
                    <h3 className={ui.cardTitle}>{group.heading}</h3>
                    <div className={ui.tagRow}>
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
