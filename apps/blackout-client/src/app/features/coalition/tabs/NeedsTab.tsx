import React, { useCallback, useState, type CSSProperties } from 'react';
import {
    NEED_STATUSES,
    SUGGESTED_NEED_KINDS,
    describePlace,
    type CoalitionPlace,
    type NeedStatus,
} from '@blackout/core';
import { useCoalitionNeeds, type CoalitionScopeQuery } from '../hooks/useCoalitionFeed';
import { createCoalitionNeed, updateCoalitionNeed } from '../coalitionClient';
import { PlacePicker } from '../map/PlacePicker';

export interface NeedsTabProps {
    scope: CoalitionScopeQuery;
}

const STATUS_LABEL: Record<NeedStatus, string> = {
    open: 'Open',
    claimed: 'Claimed',
    fulfilled: 'Fulfilled',
    closed: 'Closed',
};

const containerStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    padding: 16,
    height: '100%',
    minHeight: 0,
    overflowY: 'auto',
};

const cardStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    padding: 12,
    borderRadius: 10,
    border: '1px solid var(--border-default)',
    background: 'var(--bg-surface)',
};

const inputStyle: CSSProperties = {
    flex: 1,
    padding: 8,
    borderRadius: 8,
    border: '1px solid var(--border-default)',
    background: 'var(--bg-input)',
    color: 'var(--text-primary)',
};

const badgeStyle: CSSProperties = {
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    padding: '2px 8px',
    borderRadius: 999,
    border: '1px solid var(--border-default)',
    color: 'var(--text-secondary)',
};

const selectStyle: CSSProperties = {
    padding: 8,
    borderRadius: 8,
    border: '1px solid var(--border-default)',
    background: 'var(--bg-input)',
    color: 'var(--text-primary)',
};

export function NeedsTab({ scope }: NeedsTabProps) {
    const { data, loading, error, refetch } = useCoalitionNeeds(scope);
    const [title, setTitle] = useState('');
    const [kind, setKind] = useState<string>(SUGGESTED_NEED_KINDS[0]);
    const [place, setPlace] = useState<CoalitionPlace | null>(null);
    const [pending, setPending] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);

    const onAdd = useCallback(
        async (event: React.FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            const trimmed = title.trim();
            if (!trimmed || !scope.canopyId || pending) return;
            setPending(true);
            setSubmitError(null);
            try {
                await createCoalitionNeed({
                    canopyId: scope.canopyId,
                    kind,
                    title: trimmed,
                    place: place ?? undefined,
                });
                setTitle('');
                setPlace(null);
                refetch();
            } catch (err: unknown) {
                // A rejected request used to be an unhandled rejection: the
                // button re-enabled and nothing else happened, so a mistyped
                // coordinate looked like the form was simply broken.
                setSubmitError(err instanceof Error ? err.message : 'Could not post that need.');
            } finally {
                setPending(false);
            }
        },
        [title, kind, place, scope.canopyId, pending, refetch]
    );

    const onStatus = useCallback(
        async (id: string, status: NeedStatus) => {
            await updateCoalitionNeed(id, { status });
            refetch();
        },
        [refetch]
    );

    if (!scope.canopyId) {
        return (
            <div style={{ padding: 24, color: 'var(--text-secondary)' }}>
                Open a coalition to see its needs board.
            </div>
        );
    }

    const needs = data?.needs ?? [];

    return (
        <div style={containerStyle} data-testid="coalition-needs">
            <form
                onSubmit={onAdd}
                style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
                data-testid="coalition-need-composer"
            >
                <div style={{ display: 'flex', gap: 8 }}>
                    <select
                        value={kind}
                        onChange={(event) => setKind(event.target.value)}
                        style={selectStyle}
                        aria-label="Need kind"
                    >
                        {SUGGESTED_NEED_KINDS.map((k) => (
                            <option key={k} value={k}>
                                {k}
                            </option>
                        ))}
                    </select>
                    <input
                        value={title}
                        onChange={(event) => setTitle(event.target.value)}
                        placeholder="What does this coalition need?"
                        data-testid="coalition-need-input"
                        style={inputStyle}
                    />
                    <button
                        type="submit"
                        disabled={pending || title.trim().length === 0}
                        style={{
                            padding: '8px 14px',
                            borderRadius: 8,
                            border: '1px solid var(--accent-primary, #1ABC9C)',
                            background: 'var(--accent-primary, #1ABC9C)',
                            color: '#fff',
                            cursor: pending ? 'progress' : 'pointer',
                        }}
                    >
                        Post
                    </button>
                </div>
                {/*
                 * Optional by design: "we need a developer" has no location, and
                 * a required picker would scatter fictional pins on the map.
                 */}
                <PlacePicker
                    value={place}
                    onChange={setPlace}
                    label="Where?"
                    testId="coalition-need-place"
                />
                {submitError ? (
                    <span
                        style={{ fontSize: 12, color: 'var(--danger, #E74C3C)' }}
                        role="alert"
                        data-testid="coalition-need-submit-error"
                    >
                        {submitError}
                    </span>
                ) : null}
            </form>

            {error ? (
                <div style={{ color: 'var(--danger)', fontSize: 13 }}>
                    Couldn't load needs: {error}
                </div>
            ) : null}
            {loading && !data ? (
                <div style={{ color: 'var(--text-secondary)' }}>Loading…</div>
            ) : null}
            {!loading && needs.length === 0 ? (
                <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                    No needs posted yet. Be the first to ask for what the coalition needs.
                </div>
            ) : null}

            {needs.map((need) => (
                <article
                    key={need.id}
                    style={cardStyle}
                    data-testid="coalition-need-card"
                    data-need-id={need.id}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={badgeStyle}>{need.kind}</span>
                        <span style={{ fontSize: 14, fontWeight: 600, flex: 1 }}>{need.title}</span>
                        <span style={badgeStyle}>{STATUS_LABEL[need.status]}</span>
                    </div>
                    {need.description ? (
                        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
                            {need.description}
                        </p>
                    ) : null}
                    {need.place ? (
                        <span
                            style={{ fontSize: 12, color: 'var(--text-secondary)' }}
                            data-testid="coalition-need-place-line"
                        >
                            {need.place.kind === 'area' ? '◎' : '📍'} {describePlace(need.place)}
                        </span>
                    ) : null}
                    <select
                        value={need.status}
                        onChange={(event) => onStatus(need.id, event.target.value as NeedStatus)}
                        style={{ ...selectStyle, alignSelf: 'flex-start' }}
                        aria-label="Update need status"
                    >
                        {NEED_STATUSES.map((status) => (
                            <option key={status} value={status}>
                                {STATUS_LABEL[status]}
                            </option>
                        ))}
                    </select>
                </article>
            ))}
        </div>
    );
}

export default NeedsTab;
