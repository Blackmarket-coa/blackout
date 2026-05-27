import React, { useCallback, useState, type CSSProperties } from 'react';
import {
    COLISEUM_TOPIC_CATEGORIES,
    type ColiseumTopic,
    type ColiseumTopicCategoryKey,
} from '@blackout/core';
import { useColiseumTopics, type ColiseumScopeQuery } from '../hooks/useColiseumTopics';
import { createColiseumTopic } from '../coliseumClient';
import { coliseumTabAtom, selectedColiseumTopicIdAtom } from '../../../state/coliseum';
import { useAtom } from 'jotai';

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

const toolbarStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '12px 16px 0',
};

const inputStyle: CSSProperties = {
    padding: '8px 10px',
    borderRadius: 8,
    border: '1px solid var(--border-default)',
    background: 'var(--bg-input)',
    color: 'var(--text-primary)',
    fontSize: 14,
    width: '100%',
};

const labelStyle: CSSProperties = { fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 };

const primaryButtonStyle: CSSProperties = {
    padding: '8px 14px',
    borderRadius: 8,
    border: '1px solid var(--accent-primary, #1ABC9C)',
    background: 'var(--accent-primary, #1ABC9C)',
    color: '#04201b',
    fontWeight: 600,
    cursor: 'pointer',
};

const formCardStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    margin: '12px 16px 0',
    padding: 16,
    border: '1px solid var(--border-default)',
    borderRadius: 12,
    background: 'var(--bg-surface)',
};

const EMPTY_FORM = {
    title: '',
    headline: '',
    sourceUrl: '',
    publishedAt: '',
    tags: '',
    category: 'other' as ColiseumTopicCategoryKey,
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

function isLikelyUrl(value: string): boolean {
    try {
        const url = new URL(value);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
        return false;
    }
}

export function TopicsTab({ scope }: TopicsTabProps) {
    const { data, loading, error, refetch } = useColiseumTopics(scope, { limit: 50 });
    const [, setSelectedTopicId] = useAtom(selectedColiseumTopicIdAtom);
    const [, setTab] = useAtom(coliseumTabAtom);

    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState({ ...EMPTY_FORM });
    const [submitting, setSubmitting] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);

    const setField = useCallback(
        (key: keyof typeof EMPTY_FORM, value: string) =>
            setForm((prev) => ({ ...prev, [key]: value })),
        []
    );

    const handleSelect = useCallback(
        (topicId: string) => {
            setSelectedTopicId(topicId);
            setTab('debate');
        },
        [setSelectedTopicId, setTab]
    );

    const submit = useCallback(async () => {
        const title = form.title.trim();
        const headline = form.headline.trim();
        const sourceUrl = form.sourceUrl.trim();
        if (!title || !headline || !sourceUrl) {
            setFormError('Title, headline, and source link are required.');
            return;
        }
        if (!isLikelyUrl(sourceUrl)) {
            setFormError('Enter a valid http(s) source link.');
            return;
        }
        const publishedAtMs = form.publishedAt ? Date.parse(form.publishedAt) : Date.now();
        const tags = form.tags
            .split(',')
            .map((tag) => tag.trim())
            .filter(Boolean);
        setSubmitting(true);
        setFormError(null);
        try {
            const { topic } = await createColiseumTopic({
                title,
                newsAnchor: {
                    headline,
                    sourceUrl,
                    publishedAt: new Date(
                        Number.isNaN(publishedAtMs) ? Date.now() : publishedAtMs
                    ).toISOString(),
                },
                tags,
                category: form.category,
                canopyId: scope.canopyId,
                denId: scope.denId,
            });
            setForm({ ...EMPTY_FORM });
            setShowForm(false);
            refetch();
            handleSelect(topic.id);
        } catch (err) {
            setFormError(err instanceof Error ? err.message : 'Could not create topic.');
        } finally {
            setSubmitting(false);
        }
    }, [form, scope.canopyId, scope.denId, refetch, handleSelect]);

    const topics = data?.topics ?? [];

    return (
        <div data-testid="coliseum-topics-tab">
            <div style={toolbarStyle}>
                <strong style={{ flex: 1, fontSize: 18 }}>Topics</strong>
                <button
                    type="button"
                    style={primaryButtonStyle}
                    data-testid="coliseum-new-topic"
                    onClick={() => setShowForm((value) => !value)}
                >
                    {showForm ? 'Close' : '+ New topic'}
                </button>
            </div>

            {showForm ? (
                <div style={formCardStyle} data-testid="coliseum-topic-form">
                    <label style={labelStyle}>Debate question / title</label>
                    <input
                        style={inputStyle}
                        value={form.title}
                        onChange={(e) => setField('title', e.target.value)}
                        placeholder="Should…?"
                    />
                    <label style={labelStyle}>News headline</label>
                    <input
                        style={inputStyle}
                        value={form.headline}
                        onChange={(e) => setField('headline', e.target.value)}
                    />
                    <label style={labelStyle}>Source link</label>
                    <input
                        style={inputStyle}
                        value={form.sourceUrl}
                        onChange={(e) => setField('sourceUrl', e.target.value)}
                        inputMode="url"
                        placeholder="https://…"
                    />
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <div style={{ flex: 1, minWidth: 160 }}>
                            <label style={labelStyle}>Published</label>
                            <input
                                type="datetime-local"
                                style={inputStyle}
                                value={form.publishedAt}
                                onChange={(e) => setField('publishedAt', e.target.value)}
                            />
                        </div>
                        <div style={{ minWidth: 140 }}>
                            <label style={labelStyle}>Category</label>
                            <select
                                style={inputStyle}
                                value={form.category}
                                onChange={(e) => setField('category', e.target.value)}
                            >
                                {COLISEUM_TOPIC_CATEGORIES.map((category) => (
                                    <option key={category.key} value={category.key}>
                                        {category.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <label style={labelStyle}>Tags (comma-separated, optional)</label>
                    <input
                        style={inputStyle}
                        value={form.tags}
                        onChange={(e) => setField('tags', e.target.value)}
                        placeholder="housing, policy"
                    />
                    {formError ? (
                        <span
                            role="alert"
                            data-testid="coliseum-topic-form-error"
                            style={{ color: 'var(--danger, #e74c3c)', fontSize: 13 }}
                        >
                            {formError}
                        </span>
                    ) : null}
                    <div>
                        <button
                            type="button"
                            style={primaryButtonStyle}
                            data-testid="coliseum-topic-form-submit"
                            onClick={submit}
                            disabled={submitting}
                        >
                            {submitting ? 'Creating…' : 'Create topic'}
                        </button>
                    </div>
                </div>
            ) : null}

            {loading && !data ? <div style={{ padding: 24 }}>Loading topics...</div> : null}
            {error ? (
                <div style={{ padding: 24, color: 'var(--danger)' }}>Couldn't load: {error}</div>
            ) : null}
            {!loading && !error && topics.length === 0 ? (
                <div style={{ padding: 24, color: 'var(--text-secondary)' }}>
                    No active debates yet. Use <strong>+ New topic</strong> to curate one from a
                    recent headline.
                </div>
            ) : null}

            {topics.length > 0 ? (
                <div style={listStyle} data-testid="coliseum-topics">
                    {topics.map((topic) => (
                        <TopicCard key={topic.id} topic={topic} onSelect={handleSelect} />
                    ))}
                </div>
            ) : null}
        </div>
    );
}

export default TopicsTab;
