import React, { useCallback, useEffect, useState, type CSSProperties } from 'react';
import type { NotificationRulePayload } from '@blackout/protocol';
import type { NotificationRulesResponse } from '@blackout/sdk';
import {
    deleteNotificationRule as deleteNotificationRuleDefault,
    fetchNotificationRules as fetchNotificationRulesDefault,
    upsertNotificationRule as upsertNotificationRuleDefault,
} from './notificationsClient';

export interface NotificationRulesEditorProps {
    fetchNotificationRules?: typeof fetchNotificationRulesDefault;
    upsertNotificationRule?: typeof upsertNotificationRuleDefault;
    deleteNotificationRule?: typeof deleteNotificationRuleDefault;
}

const sectionStyle: CSSProperties = { display: 'grid', gap: 16, padding: 12 };
const cardStyle: CSSProperties = {
    display: 'grid',
    gap: 8,
    padding: 12,
    border: '1px solid var(--border-default)',
    borderRadius: 10,
    background: 'var(--bg-surface)',
};
const fieldStyle: CSSProperties = {
    display: 'grid',
    gap: 4,
    fontSize: 12,
    color: 'var(--text-secondary)',
};

const ruleKey = (rule: Pick<NotificationRulePayload, 'feature' | 'category'>): string =>
    `${rule.feature}:${rule.category}`;

const emptyForm = {
    feature: '',
    category: '',
    hardCapPerDay: 50,
    cooldownMinutes: 5,
    quietEnabled: false,
    quietStartUtc: '22:00',
    quietEndUtc: '07:00',
};

type FormState = typeof emptyForm;

export function NotificationRulesEditor({
    fetchNotificationRules = fetchNotificationRulesDefault,
    upsertNotificationRule = upsertNotificationRuleDefault,
    deleteNotificationRule = deleteNotificationRuleDefault,
}: NotificationRulesEditorProps = {}) {
    const [rules, setRules] = useState<NotificationRulePayload[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [submitPending, setSubmitPending] = useState(false);
    const [form, setForm] = useState<FormState>(emptyForm);

    const refresh = useCallback(async () => {
        setLoading(true);
        setLoadError(null);
        try {
            const response: NotificationRulesResponse = await fetchNotificationRules();
            setRules(response.rules);
        } catch (error) {
            setLoadError(
                error instanceof Error ? error.message : 'Failed to load notification rules.',
            );
        } finally {
            setLoading(false);
        }
    }, [fetchNotificationRules]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const onSubmit = useCallback(
        async (event: React.FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            setSubmitError(null);
            const feature = form.feature.trim();
            const category = form.category.trim();
            if (!feature || !category) {
                setSubmitError('Feature and category are required.');
                return;
            }
            const payload: NotificationRulePayload = {
                feature,
                category,
                hardCapPerDay: Math.max(0, form.hardCapPerDay | 0),
                cooldownMinutes: Math.max(0, form.cooldownMinutes | 0),
                ...(form.quietEnabled
                    ? {
                          quietHours: {
                              startUtc: form.quietStartUtc,
                              endUtc: form.quietEndUtc,
                          },
                      }
                    : {}),
            };
            setSubmitPending(true);
            // Optimistic local update: replace any existing rule with the
            // same key (feature:category) so the list updates without a page
            // refresh. Rolled back on SDK failure.
            const previous = rules;
            const key = ruleKey(payload);
            setRules((current) => {
                const others = current.filter((r) => ruleKey(r) !== key);
                return [...others, payload];
            });
            try {
                await upsertNotificationRule(payload);
                setForm(emptyForm);
            } catch (error) {
                setRules(previous);
                setSubmitError(
                    error instanceof Error ? error.message : 'Failed to save rule.',
                );
            } finally {
                setSubmitPending(false);
            }
        },
        [form, rules, upsertNotificationRule],
    );

    const onDelete = useCallback(
        async (rule: NotificationRulePayload) => {
            const key = ruleKey(rule);
            const previous = rules;
            setRules((current) => current.filter((r) => ruleKey(r) !== key));
            try {
                await deleteNotificationRule(rule.feature, rule.category);
            } catch {
                // Rollback on failure; surface via load error so the rest of
                // the UI stays usable.
                setRules(previous);
                setLoadError(`Failed to delete rule ${key}.`);
            }
        },
        [deleteNotificationRule, rules],
    );

    const onEdit = useCallback((rule: NotificationRulePayload) => {
        setForm({
            feature: rule.feature,
            category: rule.category,
            hardCapPerDay: rule.hardCapPerDay,
            cooldownMinutes: rule.cooldownMinutes,
            quietEnabled: Boolean(rule.quietHours),
            quietStartUtc: rule.quietHours?.startUtc ?? '22:00',
            quietEndUtc: rule.quietHours?.endUtc ?? '07:00',
        });
        setSubmitError(null);
    }, []);

    return (
        <section style={sectionStyle} data-testid="notification-rules-editor">
            <header>
                <h2 style={{ margin: 0 }}>Notification rules</h2>
                <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)' }}>
                    Per-feature rate limits and quiet hours. Each rule is keyed by{' '}
                    <code>feature:category</code>.
                </p>
            </header>

            <form
                style={cardStyle}
                onSubmit={(event) => {
                    void onSubmit(event);
                }}
                data-testid="notification-rules-form"
            >
                <strong>Add or update rule</strong>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <label style={fieldStyle}>
                        Feature
                        <input
                            data-testid="notification-rules-feature"
                            value={form.feature}
                            onChange={(event) =>
                                setForm({ ...form, feature: event.target.value })
                            }
                            placeholder="mentions"
                            required
                        />
                    </label>
                    <label style={fieldStyle}>
                        Category
                        <input
                            data-testid="notification-rules-category"
                            value={form.category}
                            onChange={(event) =>
                                setForm({ ...form, category: event.target.value })
                            }
                            placeholder="dm"
                            required
                        />
                    </label>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <label style={fieldStyle}>
                        Hard cap per day
                        <input
                            data-testid="notification-rules-hardcap"
                            type="number"
                            min={0}
                            value={form.hardCapPerDay}
                            onChange={(event) =>
                                setForm({
                                    ...form,
                                    hardCapPerDay:
                                        Number.parseInt(event.target.value, 10) || 0,
                                })
                            }
                        />
                    </label>
                    <label style={fieldStyle}>
                        Cooldown minutes
                        <input
                            data-testid="notification-rules-cooldown"
                            type="number"
                            min={0}
                            value={form.cooldownMinutes}
                            onChange={(event) =>
                                setForm({
                                    ...form,
                                    cooldownMinutes:
                                        Number.parseInt(event.target.value, 10) || 0,
                                })
                            }
                        />
                    </label>
                </div>
                <label
                    style={{
                        display: 'flex',
                        gap: 6,
                        alignItems: 'center',
                        fontSize: 12,
                        color: 'var(--text-secondary)',
                    }}
                >
                    <input
                        data-testid="notification-rules-quiet-toggle"
                        type="checkbox"
                        checked={form.quietEnabled}
                        onChange={(event) =>
                            setForm({ ...form, quietEnabled: event.target.checked })
                        }
                    />
                    Enable quiet hours
                </label>
                {form.quietEnabled ? (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        <label style={fieldStyle}>
                            Quiet start (UTC)
                            <input
                                data-testid="notification-rules-quiet-start"
                                value={form.quietStartUtc}
                                onChange={(event) =>
                                    setForm({ ...form, quietStartUtc: event.target.value })
                                }
                                placeholder="22:00"
                            />
                        </label>
                        <label style={fieldStyle}>
                            Quiet end (UTC)
                            <input
                                data-testid="notification-rules-quiet-end"
                                value={form.quietEndUtc}
                                onChange={(event) =>
                                    setForm({ ...form, quietEndUtc: event.target.value })
                                }
                                placeholder="07:00"
                            />
                        </label>
                    </div>
                ) : null}
                {submitError ? (
                    <p
                        role="alert"
                        data-testid="notification-rules-submit-error"
                        style={{ color: 'var(--danger)', margin: 0, fontSize: 12 }}
                    >
                        {submitError}
                    </p>
                ) : null}
                <button
                    type="submit"
                    data-testid="notification-rules-submit"
                    disabled={submitPending}
                    style={{
                        alignSelf: 'flex-start',
                        padding: '6px 14px',
                        borderRadius: 8,
                        border: '1px solid var(--accent-primary, #1ABC9C)',
                        background: 'var(--accent-primary, #1ABC9C)',
                        color: '#fff',
                        cursor: submitPending ? 'progress' : 'pointer',
                    }}
                >
                    {submitPending ? 'Saving…' : 'Save rule'}
                </button>
            </form>

            <section style={{ display: 'grid', gap: 8 }}>
                <header
                    style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                    }}
                >
                    <strong>Existing rules</strong>
                    <button
                        type="button"
                        onClick={() => void refresh()}
                        disabled={loading}
                        data-testid="notification-rules-refresh"
                    >
                        Refresh
                    </button>
                </header>
                {loadError ? (
                    <p
                        role="alert"
                        data-testid="notification-rules-load-error"
                        style={{ color: 'var(--danger)', margin: 0 }}
                    >
                        {loadError}
                    </p>
                ) : null}
                {loading && rules.length === 0 ? (
                    <p style={{ color: 'var(--text-secondary)' }}>Loading rules…</p>
                ) : rules.length === 0 ? (
                    <p
                        data-testid="notification-rules-empty"
                        style={{ color: 'var(--text-secondary)' }}
                    >
                        No notification rules configured yet.
                    </p>
                ) : (
                    <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 8 }}>
                        {rules.map((rule) => {
                            const key = ruleKey(rule);
                            return (
                                <li
                                    key={key}
                                    style={cardStyle}
                                    data-testid={`notification-rules-row-${key}`}
                                >
                                    <div
                                        style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                        }}
                                    >
                                        <strong>{key}</strong>
                                        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                                            cap {rule.hardCapPerDay}/day · cooldown{' '}
                                            {rule.cooldownMinutes}m
                                        </span>
                                    </div>
                                    {rule.quietHours ? (
                                        <small style={{ color: 'var(--text-secondary)' }}>
                                            Quiet {rule.quietHours.startUtc}–
                                            {rule.quietHours.endUtc} UTC
                                        </small>
                                    ) : null}
                                    <div style={{ display: 'flex', gap: 6 }}>
                                        <button
                                            type="button"
                                            data-testid={`notification-rules-edit-${key}`}
                                            onClick={() => onEdit(rule)}
                                        >
                                            Edit
                                        </button>
                                        <button
                                            type="button"
                                            data-testid={`notification-rules-delete-${key}`}
                                            onClick={() => void onDelete(rule)}
                                        >
                                            Delete
                                        </button>
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </section>
        </section>
    );
}

export default NotificationRulesEditor;
