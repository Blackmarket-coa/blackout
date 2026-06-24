import { useState } from 'react';
import { ObjectiveThermometer } from './ObjectiveThermometer';
import {
    useContributeToObjective,
    useObjectiveProgress,
    useSetObjective,
    type ObjectiveModel,
} from './useObjectives';

const btnStyle = {
    border: '1px solid var(--border-default)',
    borderRadius: 8,
    background: 'var(--bg-input)',
    color: 'var(--text-primary)',
    padding: '4px 10px',
    fontSize: 12,
} as const;

const inputStyle = {
    border: '1px solid var(--border-default)',
    borderRadius: 8,
    background: 'var(--bg-input)',
    color: 'var(--text-primary)',
    padding: '4px 8px',
    width: 96,
} as const;

/**
 * One shared objective: title/description, the aggregate thermometer, a
 * "Log progress" increment, and steward controls (mark met / archive).
 * Contributing logs an increment toward the *shared* goal — it grants no XP,
 * badge, or status, and the card never shows who contributed what.
 */
export function ObjectiveCard({ objective }: { objective: ObjectiveModel }) {
    const { roomId, objectiveId, target, unit, status } = objective;
    const progress = useObjectiveProgress(objectiveId, target, roomId);
    const contribute = useContributeToObjective(roomId);
    const setObjective = useSetObjective(roomId);

    const [amount, setAmount] = useState('');
    const [note, setNote] = useState('');
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    const active = status === 'active';

    const logProgress = async () => {
        const parsed = Number(amount);
        if (!Number.isFinite(parsed) || parsed <= 0) {
            setErr('Enter an amount greater than zero.');
            return;
        }
        setBusy(true);
        setErr(null);
        try {
            await contribute({ objectiveId, amount: parsed, note: note.trim() || undefined });
            setAmount('');
            setNote('');
        } catch (cause) {
            setErr(cause instanceof Error ? cause.message : String(cause));
        } finally {
            setBusy(false);
        }
    };

    const updateStatus = async (next: ObjectiveModel['status']) => {
        setBusy(true);
        setErr(null);
        try {
            await setObjective({
                ...objective,
                status: next,
                metAt: next === 'met' ? new Date().toISOString() : objective.metAt,
            });
        } catch (cause) {
            setErr(cause instanceof Error ? cause.message : String(cause));
        } finally {
            setBusy(false);
        }
    };

    return (
        <article
            style={{
                border: '1px solid var(--border-default)',
                borderRadius: 12,
                background: 'var(--bg-surface)',
                padding: 12,
                display: 'grid',
                gap: 8,
            }}
            data-testid="objective-card"
        >
            <div>
                <strong>{objective.title}</strong>
                {objective.description ? (
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                        {objective.description}
                    </div>
                ) : null}
            </div>

            <ObjectiveThermometer
                percent={progress.data.percent}
                current={progress.data.current}
                target={progress.data.target}
                unit={unit}
                contributorCount={progress.data.contributorCount}
                accent={objective.accent}
                met={progress.data.met}
            />

            {active ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                    <input
                        type="number"
                        min={0}
                        value={amount}
                        onChange={(event) => setAmount(event.target.value)}
                        placeholder={`+ ${unit}`}
                        style={inputStyle}
                        disabled={busy}
                        data-testid="objective-amount"
                        aria-label={`Amount of ${unit} to log`}
                    />
                    <input
                        value={note}
                        onChange={(event) => setNote(event.target.value)}
                        placeholder="Note (optional)"
                        style={{ ...inputStyle, width: 160 }}
                        disabled={busy}
                        aria-label="Optional note"
                    />
                    <button
                        type="button"
                        style={btnStyle}
                        onClick={() => void logProgress()}
                        disabled={busy}
                        data-testid="objective-log"
                    >
                        Log progress
                    </button>
                    <span style={{ flex: 1 }} />
                    <button
                        type="button"
                        style={btnStyle}
                        onClick={() => void updateStatus('met')}
                        disabled={busy}
                    >
                        Mark met
                    </button>
                    <button
                        type="button"
                        style={btnStyle}
                        onClick={() => void updateStatus('archived')}
                        disabled={busy}
                    >
                        Archive
                    </button>
                </div>
            ) : (
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    {status === 'met' ? 'Goal met — thank you, everyone.' : 'Archived.'}
                </div>
            )}

            {err ? (
                <p role="alert" style={{ color: 'var(--danger, #EF5350)', fontSize: 12, margin: 0 }}>
                    {err}
                </p>
            ) : null}
        </article>
    );
}

export default ObjectiveCard;
