import React, { type CSSProperties } from 'react';
import { useAtom } from 'jotai';
import type { ColiseumCitation, RankedColiseumArgument } from '@blackout/core';
import { useColiseumTopic } from '../hooks/useColiseumTopics';
import { coliseumTabAtom, selectedColiseumTopicIdAtom } from '../../../state/bmc-coliseum';
import ColiseumCitationChip from '../ColiseumCitationChip';

const containerStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    padding: 16,
};

const cardStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    padding: 16,
    border: '1px solid var(--border-default)',
    borderRadius: 12,
    background: 'var(--bg-surface)',
};

const LIVE_KINDS: ReadonlySet<ColiseumCitation['kind']> = new Set(['live', 'townhall', 'subscription']);

function liveCitations(arg: RankedColiseumArgument): ColiseumCitation[] {
    return arg.citations.filter((c) => LIVE_KINDS.has(c.kind));
}

export function LiveTab() {
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
                tab to see linked Lives, town-halls, and subscriptions.
            </div>
        );
    }
    if (loading && !data) return <div style={{ padding: 24 }}>Loading live links...</div>;
    if (error) return <div style={{ padding: 24, color: 'var(--danger)' }}>Couldn't load: {error}</div>;
    if (!data) return null;

    const liveArgs = data.arguments
        .map((arg) => ({ arg, live: liveCitations(arg) }))
        .filter((entry) => entry.live.length > 0);

    if (liveArgs.length === 0) {
        return (
            <div style={{ padding: 24, color: 'var(--text-secondary)' }}>
                No Lives, town-halls, or subscriptions are cited yet on this topic.
            </div>
        );
    }

    return (
        <div style={containerStyle} data-testid="coliseum-live">
            {liveArgs.map(({ arg, live }) => (
                <article key={arg.id} style={cardStyle}>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                        From {arg.authorId} ·{' '}
                        <span style={{ color: 'var(--text-primary)' }}>{arg.stance}</span>
                    </div>
                    <p style={{ margin: 0, fontSize: 14 }}>{arg.body}</p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {live.map((citation, index) => (
                            <ColiseumCitationChip key={index} citation={citation} />
                        ))}
                    </div>
                </article>
            ))}
        </div>
    );
}

export default LiveTab;
