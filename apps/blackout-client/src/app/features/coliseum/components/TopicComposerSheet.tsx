import React, { useCallback, useState, type CSSProperties } from 'react';
import { COLISEUM_TOPIC_CATEGORIES, type ColiseumTopicCategoryKey } from '@blackout/core';
import { Sheet } from '@blackout/ui/primitives';
import { coliseumSheetTheme } from '../coliseumArenaTheme.css';
import { createColiseumTopic } from '../coliseumClient';
import type { ColiseumScopeQuery } from '../hooks/useColiseumTopics';

const EMPTY_FORM = {
    title: '',
    headline: '',
    sourceUrl: '',
    publishedAt: '',
    tags: '',
    category: 'other' as ColiseumTopicCategoryKey,
};

const inputStyle: CSSProperties = {
    padding: '10px 12px',
    borderRadius: 10,
    border: '1px solid var(--border-default)',
    background: 'var(--bg-input)',
    color: 'var(--text-primary)',
    fontSize: 14,
    width: '100%',
    boxSizing: 'border-box',
};

const labelStyle: CSSProperties = { fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 };

const submitStyle: CSSProperties = {
    padding: '10px 18px',
    borderRadius: 999,
    border: 'none',
    background: 'var(--accent-primary, #1ABC9C)',
    color: '#fff',
    fontWeight: 700,
    fontSize: 14,
    cursor: 'pointer',
};

function isLikelyUrl(value: string): boolean {
    try {
        const url = new URL(value);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
        return false;
    }
}

/**
 * Bottom-sheet composer for a new debate topic (was an inline form on the
 * Topics tab). Field order and testids are unchanged so existing flows and
 * tests keep working.
 */
export function TopicComposerSheet({
    open,
    onClose,
    scope,
    onCreated,
}: {
    open: boolean;
    onClose: () => void;
    scope: ColiseumScopeQuery;
    onCreated: (topicId: string) => void;
}) {
    const [form, setForm] = useState({ ...EMPTY_FORM });
    const [submitting, setSubmitting] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);

    const setField = useCallback(
        (key: keyof typeof EMPTY_FORM, value: string) =>
            setForm((prev) => ({ ...prev, [key]: value })),
        []
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
            onClose();
            onCreated(topic.id);
        } catch (err) {
            setFormError(err instanceof Error ? err.message : 'Could not create topic.');
        } finally {
            setSubmitting(false);
        }
    }, [form, scope.canopyId, scope.denId, onClose, onCreated]);

    return (
        <Sheet open={open} onClose={onClose} title="Start a debate" className={coliseumSheetTheme}>
            <div
                style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
                data-testid="coliseum-topic-form"
            >
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
                <div style={{ marginTop: 4 }}>
                    <button
                        type="button"
                        style={{ ...submitStyle, opacity: submitting ? 0.6 : 1 }}
                        data-testid="coliseum-topic-form-submit"
                        onClick={submit}
                        disabled={submitting}
                    >
                        {submitting ? 'Creating…' : 'Start debate'}
                    </button>
                </div>
            </div>
        </Sheet>
    );
}

export default TopicComposerSheet;
