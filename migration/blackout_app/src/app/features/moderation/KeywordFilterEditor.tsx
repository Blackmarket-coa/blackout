import { useMemo, useState } from 'react';
import type { KeywordFilterAction, KeywordFilterRule, KeywordFilterType } from './AutoModPanel';

const wildcardToRegex = (value: string): RegExp => {
    const escaped = value
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.');
    return new RegExp(`^${escaped}$`, 'i');
};

const testRule = (rule: KeywordFilterRule, sample: string): boolean => {
    if (!rule.pattern.trim()) return false;

    if (rule.type === 'exact') {
        return sample.toLowerCase().includes(rule.pattern.toLowerCase());
    }

    if (rule.type === 'wildcard') {
        return wildcardToRegex(rule.pattern).test(sample);
    }

    try {
        return new RegExp(rule.pattern, 'i').test(sample);
    } catch {
        return false;
    }
};

const blankRule = (): KeywordFilterRule => ({ pattern: '', type: 'exact', action: 'warn' });

const triggerDownload = (filename: string, text: string) => {
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
};

const FILTER_TYPES: KeywordFilterType[] = ['exact', 'wildcard', 'regex'];
const ACTIONS: KeywordFilterAction[] = ['warn', 'redact', 'kick', 'ban'];

export const KeywordFilterEditor = ({
    rules,
    onChange,
}: {
    rules: KeywordFilterRule[];
    onChange: (rules: KeywordFilterRule[]) => void;
}) => {
    const [sampleText, setSampleText] = useState('paste sample chat text to test matching');
    const [importText, setImportText] = useState('');
    const [importError, setImportError] = useState<string | null>(null);

    const testResults = useMemo(
        () => rules.map((rule) => ({ rule, matched: testRule(rule, sampleText) })),
        [rules, sampleText],
    );

    return (
        <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong>Keyword rules</strong>
                <button
                    type="button"
                    onClick={() => onChange([...rules, blankRule()])}
                    style={{
                        border: '1px solid var(--border-default)',
                        borderRadius: 8,
                        background: 'var(--bg-input)',
                        padding: '4px 8px',
                    }}
                >
                    Add rule
                </button>
            </div>

            {rules.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    No rules yet. Add your first filter rule.
                </div>
            ) : null}

            {rules.map((rule, index) => (
                <article
                    key={`${index}-${rule.pattern}`}
                    style={{
                        border: '1px solid var(--border-default)',
                        borderRadius: 10,
                        padding: 10,
                        display: 'grid',
                        gap: 6,
                    }}
                >
                    <div style={{ display: 'grid', gap: 4 }}>
                        <label style={{ fontSize: 12 }}>Pattern</label>
                        <input
                            value={rule.pattern}
                            onChange={(event) =>
                                onChange(
                                    rules.map((candidate, candidateIndex) =>
                                        candidateIndex === index
                                            ? { ...candidate, pattern: event.target.value }
                                            : candidate,
                                    ),
                                )
                            }
                            placeholder="keyword, wildcard (*), or regex"
                        />
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <label style={{ display: 'grid', gap: 2, fontSize: 12 }}>
                            Type
                            <select
                                value={rule.type}
                                onChange={(event) =>
                                    onChange(
                                        rules.map((candidate, candidateIndex) =>
                                            candidateIndex === index
                                                ? {
                                                      ...candidate,
                                                      type: event.target.value as KeywordFilterType,
                                                  }
                                                : candidate,
                                        ),
                                    )
                                }
                            >
                                {FILTER_TYPES.map((type) => (
                                    <option key={type} value={type}>
                                        {type}
                                    </option>
                                ))}
                            </select>
                        </label>

                        <label style={{ display: 'grid', gap: 2, fontSize: 12 }}>
                            Action
                            <select
                                value={rule.action}
                                onChange={(event) =>
                                    onChange(
                                        rules.map((candidate, candidateIndex) =>
                                            candidateIndex === index
                                                ? {
                                                      ...candidate,
                                                      action: event.target
                                                          .value as KeywordFilterAction,
                                                  }
                                                : candidate,
                                        ),
                                    )
                                }
                            >
                                {ACTIONS.map((action) => (
                                    <option key={action} value={action}>
                                        {action}
                                    </option>
                                ))}
                            </select>
                        </label>

                        <button
                            type="button"
                            onClick={() =>
                                onChange(
                                    rules.filter((_, candidateIndex) => candidateIndex !== index),
                                )
                            }
                            style={{
                                marginTop: 18,
                                border: '1px solid var(--border-default)',
                                borderRadius: 8,
                                background: 'var(--danger)',
                                color: '#fff',
                                padding: '4px 8px',
                            }}
                        >
                            Remove
                        </button>
                    </div>
                </article>
            ))}

            <fieldset
                style={{ border: '1px solid var(--border-default)', borderRadius: 10, padding: 10 }}
            >
                <legend style={{ fontSize: 12 }}>Test patterns</legend>
                <textarea
                    rows={3}
                    value={sampleText}
                    onChange={(event) => setSampleText(event.target.value)}
                />
                <div style={{ marginTop: 8, display: 'grid', gap: 4 }}>
                    {testResults.map(({ rule, matched }, index) => (
                        <div
                            key={`${index}-${rule.pattern}`}
                            style={{
                                fontSize: 12,
                                color: matched ? 'var(--danger)' : 'var(--text-secondary)',
                            }}
                        >
                            {matched ? 'Matched' : 'No match'} · <code>{rule.type}</code> ·{' '}
                            <code>{rule.action}</code> · {rule.pattern || '(empty)'}
                        </div>
                    ))}
                </div>
            </fieldset>

            <fieldset
                style={{ border: '1px solid var(--border-default)', borderRadius: 10, padding: 10 }}
            >
                <legend style={{ fontSize: 12 }}>Import / Export</legend>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button
                        type="button"
                        onClick={() =>
                            triggerDownload(
                                'automod-keyword-filters.json',
                                JSON.stringify(rules, null, 2),
                            )
                        }
                        style={{
                            border: '1px solid var(--border-default)',
                            borderRadius: 8,
                            background: 'var(--bg-input)',
                            padding: '4px 8px',
                        }}
                    >
                        Export JSON
                    </button>
                    <input
                        type="file"
                        accept="application/json"
                        onChange={(event) => {
                            const file = event.currentTarget.files?.[0];
                            if (!file) return;
                            void file.text().then((text) => setImportText(text));
                        }}
                    />
                </div>
                <textarea
                    rows={5}
                    placeholder="Paste keyword list JSON"
                    value={importText}
                    onChange={(event) => setImportText(event.target.value)}
                    style={{ marginTop: 8 }}
                />
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                    <button
                        type="button"
                        onClick={() => {
                            try {
                                const parsed = JSON.parse(importText) as unknown;
                                if (!Array.isArray(parsed))
                                    throw new Error(
                                        'Import payload must be an array of keyword rules.',
                                    );

                                const next = parsed
                                    .map((item) => {
                                        if (!item || typeof item !== 'object') return null;
                                        const record = item as Record<string, unknown>;
                                        if (typeof record.pattern !== 'string') return null;
                                        if (
                                            record.type !== 'exact' &&
                                            record.type !== 'wildcard' &&
                                            record.type !== 'regex'
                                        )
                                            return null;
                                        if (
                                            record.action !== 'warn' &&
                                            record.action !== 'redact' &&
                                            record.action !== 'kick' &&
                                            record.action !== 'ban'
                                        )
                                            return null;
                                        return {
                                            pattern: record.pattern,
                                            type: record.type,
                                            action: record.action,
                                        };
                                    })
                                    .filter((item): item is KeywordFilterRule => item !== null);

                                onChange(next);
                                setImportError(null);
                            } catch (error) {
                                setImportError(
                                    error instanceof Error ? error.message : 'Import failed.',
                                );
                            }
                        }}
                        style={{
                            border: '1px solid var(--border-default)',
                            borderRadius: 8,
                            background: 'var(--accent-primary)',
                            color: 'var(--bg-surface)',
                            padding: '4px 8px',
                        }}
                    >
                        Import JSON
                    </button>
                    {importError ? (
                        <span style={{ color: 'var(--danger)', fontSize: 12 }}>{importError}</span>
                    ) : null}
                </div>
            </fieldset>
        </div>
    );
};
