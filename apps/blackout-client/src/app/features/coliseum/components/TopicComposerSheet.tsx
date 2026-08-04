import React, { useCallback, useState, type CSSProperties } from 'react';
import {
    COLISEUM_TOPIC_CATEGORIES,
    type ColiseumTopicCategoryKey,
    type ColiseumTopicSeed,
    type ColiseumTopicSeedKind,
} from '@blackout/core';
import { Sheet } from '@blackout/ui/primitives';
import { coliseumSheetTheme } from '../coliseumArenaTheme.css';
import { createColiseumTopic } from '../coliseumClient';
import { cx } from './cx';
import * as ui from './coliseumUi.css';
import type { ColiseumScopeQuery } from '../hooks/useColiseumTopics';

const EMPTY_FORM = {
    title: '',
    headline: '',
    sourceUrl: '',
    publishedAt: '',
    mediaMxc: '',
    opponentId: '',
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

/** Each form is a way of saying "here is a thing worth arguing about". */
const KINDS: ReadonlyArray<{
    kind: ColiseumTopicSeedKind;
    label: string;
    titleLabel: string;
    titlePlaceholder: string;
    cta: string;
}> = [
    {
        kind: 'text',
        label: '💬 Question',
        titleLabel: 'Your question',
        titlePlaceholder: 'Should…?',
        cta: 'Ask it',
    },
    {
        kind: 'link',
        label: '📰 Link',
        titleLabel: 'Debate question',
        titlePlaceholder: 'Should…?',
        cta: 'Start debate',
    },
    {
        kind: 'media',
        label: '🎥 Take',
        titleLabel: 'What is your take?',
        titlePlaceholder: 'Say it in one line',
        cta: 'Post take',
    },
    {
        kind: 'challenge',
        label: '⚔️ Challenge',
        titleLabel: 'The proposition',
        titlePlaceholder: 'I say that…',
        cta: 'Issue challenge',
    },
];

function isLikelyUrl(value: string): boolean {
    try {
        const url = new URL(value);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
        return false;
    }
}

/**
 * Bottom-sheet composer for a proposed topic.
 *
 * Four forms, one entity. Previously this sheet required a title, a headline
 * and a source URL before it would submit anything at all, which made a bare
 * question impossible to ask and pushed video takes and callouts out into
 * separate features.
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
    const [kind, setKind] = useState<ColiseumTopicSeedKind>('text');
    const [form, setForm] = useState({ ...EMPTY_FORM });
    const [submitting, setSubmitting] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);

    const active = KINDS.find((entry) => entry.kind === kind) ?? KINDS[0];

    const setField = useCallback(
        (key: keyof typeof EMPTY_FORM, value: string) =>
            setForm((prev) => ({ ...prev, [key]: value })),
        []
    );

    /** Build the seed for the picked form, or explain what is missing. */
    const buildSeed = useCallback((): ColiseumTopicSeed | string => {
        if (kind === 'text') return { kind: 'text' };
        if (kind === 'link') {
            const headline = form.headline.trim();
            const sourceUrl = form.sourceUrl.trim();
            if (!headline || !sourceUrl) return 'A link topic needs a headline and a source link.';
            if (!isLikelyUrl(sourceUrl)) return 'Enter a valid http(s) source link.';
            const parsedMs = form.publishedAt ? Date.parse(form.publishedAt) : Date.now();
            return {
                kind: 'link',
                sourceUrl,
                headline,
                publishedAt: new Date(Number.isNaN(parsedMs) ? Date.now() : parsedMs).toISOString(),
            };
        }
        if (kind === 'media') {
            const mxc = form.mediaMxc.trim();
            if (!mxc.startsWith('mxc://')) return 'Attach a video or image first.';
            return { kind: 'media', media: { kind: 'video', mxc } };
        }
        const opponentId = form.opponentId.trim();
        return opponentId ? { kind: 'challenge', opponentId } : { kind: 'challenge', open: true };
    }, [kind, form]);

    const submit = useCallback(async () => {
        const title = form.title.trim();
        if (!title) {
            setFormError('Say what the topic is.');
            return;
        }
        const seed = buildSeed();
        if (typeof seed === 'string') {
            setFormError(seed);
            return;
        }
        const tags = form.tags
            .split(',')
            .map((tag) => tag.trim())
            .filter(Boolean);
        setSubmitting(true);
        setFormError(null);
        try {
            const { topic } = await createColiseumTopic({
                title,
                seed,
                tags,
                category: form.category,
                canopyId: scope.canopyId,
                denId: scope.denId,
            });
            setForm({ ...EMPTY_FORM });
            setKind('text');
            onClose();
            onCreated(topic.id);
        } catch (err) {
            setFormError(err instanceof Error ? err.message : 'Could not create topic.');
        } finally {
            setSubmitting(false);
        }
    }, [form, buildSeed, scope.canopyId, scope.denId, onClose, onCreated]);

    return (
        <Sheet open={open} onClose={onClose} title="Propose a topic" className={coliseumSheetTheme}>
            <div
                style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
                data-testid="coliseum-topic-form"
            >
                <div
                    className={ui.chipRow}
                    style={{ padding: '0 0 4px' }}
                    role="group"
                    aria-label="How are you proposing this?"
                >
                    {KINDS.map((entry) => (
                        <button
                            key={entry.kind}
                            type="button"
                            className={cx(kind === entry.kind ? ui.chipActive : ui.chip)}
                            aria-pressed={kind === entry.kind}
                            data-testid={`coliseum-topic-kind-${entry.kind}`}
                            onClick={() => {
                                setKind(entry.kind);
                                setFormError(null);
                            }}
                        >
                            {entry.label}
                        </button>
                    ))}
                </div>

                <label style={labelStyle}>{active.titleLabel}</label>
                <input
                    style={inputStyle}
                    value={form.title}
                    onChange={(e) => setField('title', e.target.value)}
                    placeholder={active.titlePlaceholder}
                    data-testid="coliseum-topic-title"
                />

                {kind === 'link' ? (
                    <>
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
                        <label style={labelStyle}>Published</label>
                        <input
                            type="datetime-local"
                            style={inputStyle}
                            value={form.publishedAt}
                            onChange={(e) => setField('publishedAt', e.target.value)}
                        />
                    </>
                ) : null}

                {kind === 'media' ? (
                    <>
                        <label style={labelStyle}>Media reference (mxc://…)</label>
                        <input
                            style={inputStyle}
                            value={form.mediaMxc}
                            onChange={(e) => setField('mediaMxc', e.target.value)}
                            placeholder="mxc://server/id"
                            data-testid="coliseum-topic-media"
                        />
                    </>
                ) : null}

                {kind === 'challenge' ? (
                    <>
                        <label style={labelStyle}>
                            Opponent (leave empty for an open challenge)
                        </label>
                        <input
                            style={inputStyle}
                            value={form.opponentId}
                            onChange={(e) => setField('opponentId', e.target.value)}
                            placeholder="@rival:server"
                            data-testid="coliseum-topic-opponent"
                        />
                    </>
                ) : null}

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
                        {submitting ? 'Posting…' : active.cta}
                    </button>
                </div>
            </div>
        </Sheet>
    );
}

export default TopicComposerSheet;
