import { useState } from 'react';
import {
    PLAYBOOK_ACCENT_PALETTE,
    type DenObjectivePayload,
    type PlaybookAccentToken,
} from '@blackout/protocol';
import { useSetObjective } from './useObjectives';

/**
 * Build a fresh objective payload. Pure helper so tests can assert the shape
 * without React. New objectives always start `active`; status only ever moves
 * forward through steward action (mark met / archive).
 */
export function buildNewObjective(input: {
    title: string;
    target: number;
    unit: string;
    accent?: PlaybookAccentToken;
    createdAt: string;
    objectiveId: string;
    description?: string;
}): DenObjectivePayload {
    return {
        objectiveId: input.objectiveId,
        title: input.title.trim(),
        description: input.description?.trim() || undefined,
        unit: input.unit.trim() || 'units',
        target: input.target,
        status: 'active',
        accent: input.accent,
        createdAt: input.createdAt,
    };
}

const fieldStyle = {
    border: '1px solid var(--border-default)',
    borderRadius: 8,
    background: 'var(--bg-input)',
    color: 'var(--text-primary)',
    padding: '6px 10px',
} as const;

const labelStyle = { fontSize: 12, color: 'var(--text-secondary)', display: 'grid', gap: 4 } as const;

/**
 * Inline form to create a shared objective on a den. Targets are effort/count
 * numbers with a free-text unit (e.g. 40 "hours"); money-precision goals are a
 * deliberate follow-up.
 */
export function ObjectiveComposer({
    roomId,
    onCreated,
}: {
    roomId: string;
    onCreated?: () => void;
}) {
    const setObjective = useSetObjective(roomId);
    const [title, setTitle] = useState('');
    const [target, setTarget] = useState('');
    const [unit, setUnit] = useState('');
    const [accent, setAccent] = useState<PlaybookAccentToken>('moss');
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    const submit = async () => {
        const parsedTarget = Number(target);
        if (!title.trim()) {
            setErr('Give the goal a name.');
            return;
        }
        if (!Number.isFinite(parsedTarget) || parsedTarget <= 0) {
            setErr('Target must be greater than zero.');
            return;
        }
        setBusy(true);
        setErr(null);
        try {
            await setObjective(
                buildNewObjective({
                    title,
                    target: parsedTarget,
                    unit,
                    accent,
                    createdAt: new Date().toISOString(),
                    objectiveId: crypto.randomUUID(),
                }),
            );
            setTitle('');
            setTarget('');
            setUnit('');
            onCreated?.();
        } catch (cause) {
            setErr(cause instanceof Error ? cause.message : String(cause));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div
            style={{
                border: '1px solid var(--border-default)',
                borderRadius: 12,
                background: 'var(--bg-surface)',
                padding: 12,
                display: 'grid',
                gap: 8,
            }}
            data-testid="objective-composer"
        >
            <label style={labelStyle}>
                Shared goal
                <input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="e.g. Log mutual-aid hours"
                    style={fieldStyle}
                    disabled={busy}
                    data-testid="objective-new-title"
                />
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <label style={{ ...labelStyle, flex: 1, minWidth: 90 }}>
                    Target
                    <input
                        type="number"
                        min={1}
                        value={target}
                        onChange={(event) => setTarget(event.target.value)}
                        placeholder="40"
                        style={fieldStyle}
                        disabled={busy}
                        data-testid="objective-new-target"
                    />
                </label>
                <label style={{ ...labelStyle, flex: 1, minWidth: 90 }}>
                    Unit
                    <input
                        value={unit}
                        onChange={(event) => setUnit(event.target.value)}
                        placeholder="hours"
                        style={fieldStyle}
                        disabled={busy}
                        data-testid="objective-new-unit"
                    />
                </label>
                <label style={{ ...labelStyle, minWidth: 90 }}>
                    Accent
                    <select
                        value={accent}
                        onChange={(event) => setAccent(event.target.value as PlaybookAccentToken)}
                        style={fieldStyle}
                        disabled={busy}
                    >
                        {PLAYBOOK_ACCENT_PALETTE.map((token) => (
                            <option key={token} value={token}>
                                {token}
                            </option>
                        ))}
                    </select>
                </label>
            </div>
            {err ? (
                <p role="alert" style={{ color: 'var(--danger, #EF5350)', fontSize: 12, margin: 0 }}>
                    {err}
                </p>
            ) : null}
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                    type="button"
                    onClick={() => void submit()}
                    disabled={busy}
                    style={{
                        border: '1px solid var(--border-default)',
                        borderRadius: 8,
                        background: 'var(--accent-primary)',
                        color: 'var(--bg-surface)',
                        padding: '6px 12px',
                    }}
                    data-testid="objective-create"
                >
                    {busy ? 'Adding…' : 'Add shared goal'}
                </button>
            </div>
        </div>
    );
}

export default ObjectiveComposer;
