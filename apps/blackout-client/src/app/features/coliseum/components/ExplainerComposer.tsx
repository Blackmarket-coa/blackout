import React, { useState, type CSSProperties } from 'react';
import {
    COLISEUM_TOPIC_CATEGORIES,
    EXPLAINER_BODY_MAX_CHARS,
    EXPLAINER_MAX_COUNTERPOINTS,
    EXPLAINER_MAX_TAGS,
    EXPLAINER_TITLE_MAX_CHARS,
    type ColiseumExplainer,
    type ColiseumTopicCategoryKey,
} from '@blackout/core';
import { createColiseumExplainer } from '../coliseumClient';
import * as ui from './coliseumUi.css';

const fieldStyle: CSSProperties = {
    width: '100%',
    padding: '8px 12px',
    borderRadius: 8,
    border: '1px solid var(--border-default)',
    background: 'var(--bg-input)',
    color: 'var(--text-primary)',
    fontSize: 14,
    fontFamily: 'inherit',
};

const labelStyle: CSSProperties = {
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--text-secondary)',
};

const splitLines = (value: string, max: number): string[] =>
    value
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(0, max);

export interface ExplainerComposerProps {
    onPublished: (explainer: ColiseumExplainer) => void;
    onCancel: () => void;
}

/**
 * Inline authoring card for explainers — knowledge that doesn't need a fight
 * to exist. Counterpoints get their own field on purpose: acknowledging the
 * opposing view is the steel-man signal the archive ranks on.
 */
export function ExplainerComposer({ onPublished, onCancel }: ExplainerComposerProps) {
    const [title, setTitle] = useState('');
    const [body, setBody] = useState('');
    const [domain, setDomain] = useState<ColiseumTopicCategoryKey | ''>('');
    const [tags, setTags] = useState('');
    const [counterpoints, setCounterpoints] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const canSubmit = title.trim().length > 0 && body.trim().length > 0 && !submitting;

    const handleSubmit = () => {
        if (!canSubmit) return;
        setSubmitting(true);
        setError(null);
        createColiseumExplainer({
            title: title.trim(),
            body: body.trim(),
            domain: domain || undefined,
            tags: tags
                .split(',')
                .map((tag) => tag.trim())
                .filter(Boolean)
                .slice(0, EXPLAINER_MAX_TAGS),
            counterpoints: splitLines(counterpoints, EXPLAINER_MAX_COUNTERPOINTS),
        })
            .then(({ explainer }) => onPublished(explainer))
            .catch(() => setError('Could not publish — check your connection and try again.'))
            .finally(() => setSubmitting(false));
    };

    return (
        <form
            className={ui.card}
            data-testid="explainer-composer"
            onSubmit={(event) => {
                event.preventDefault();
                handleSubmit();
            }}
        >
            <h3 className={ui.cardTitle} style={{ margin: 0 }}>
                Write an explainer
            </h3>
            <label style={labelStyle}>
                Title
                <input
                    type="text"
                    value={title}
                    maxLength={EXPLAINER_TITLE_MAX_CHARS}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="What are you explaining?"
                    data-testid="explainer-title"
                    style={fieldStyle}
                />
            </label>
            <label style={labelStyle}>
                Explanation
                <textarea
                    value={body}
                    maxLength={EXPLAINER_BODY_MAX_CHARS}
                    onChange={(event) => setBody(event.target.value)}
                    placeholder="Lay it out clearly — cite sources where you can."
                    rows={6}
                    data-testid="explainer-body"
                    style={fieldStyle}
                />
            </label>
            <label style={labelStyle}>
                Domain
                <select
                    value={domain}
                    onChange={(event) =>
                        setDomain(event.target.value as ColiseumTopicCategoryKey | '')
                    }
                    data-testid="explainer-domain"
                    style={fieldStyle}
                >
                    <option value="">No domain</option>
                    {COLISEUM_TOPIC_CATEGORIES.map((category) => (
                        <option key={category.key} value={category.key}>
                            {category.label}
                        </option>
                    ))}
                </select>
            </label>
            <label style={labelStyle}>
                Tags (comma-separated)
                <input
                    type="text"
                    value={tags}
                    onChange={(event) => setTags(event.target.value)}
                    placeholder="batteries, recycling"
                    data-testid="explainer-tags"
                    style={fieldStyle}
                />
            </label>
            <label style={labelStyle}>
                Counterpoints you acknowledge (one per line)
                <textarea
                    value={counterpoints}
                    onChange={(event) => setCounterpoints(event.target.value)}
                    placeholder="Steel-man the other side — it raises your insight rank."
                    rows={3}
                    data-testid="explainer-counterpoints"
                    style={fieldStyle}
                />
            </label>
            {error ? (
                <p style={{ margin: 0, fontSize: 13, color: 'var(--danger, #f87171)' }}>{error}</p>
            ) : null}
            <div className={ui.actionRow}>
                <button
                    type="submit"
                    className={ui.actionButton}
                    disabled={!canSubmit}
                    data-testid="explainer-publish"
                >
                    {submitting ? 'Publishing…' : 'Publish'}
                </button>
                <button type="button" className={ui.actionButton} onClick={onCancel}>
                    Cancel
                </button>
            </div>
        </form>
    );
}

export default ExplainerComposer;
