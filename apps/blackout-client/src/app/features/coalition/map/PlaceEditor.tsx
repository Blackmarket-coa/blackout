import React, { useCallback, useState, type CSSProperties } from 'react';
import { describePlace, type CoalitionPlace } from '@blackout/core';
import { PlacePicker } from './PlacePicker';

const rowStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    fontSize: 12,
    color: 'var(--text-secondary)',
};

const linkButtonStyle: CSSProperties = {
    background: 'none',
    border: 'none',
    padding: 0,
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--accent-primary, #1ABC9C)',
    cursor: 'pointer',
    textDecoration: 'underline',
};

const saveButtonStyle: CSSProperties = {
    padding: '4px 12px',
    borderRadius: 999,
    border: '1px solid var(--accent-primary, #1ABC9C)',
    background: 'var(--accent-primary, #1ABC9C)',
    color: '#fff',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
};

export interface PlaceEditorProps {
    place?: CoalitionPlace;
    /** `null` takes it off the map. Rejects to report why it could not save. */
    onSave: (place: CoalitionPlace | null) => Promise<void>;
    /** Prefix for `data-testid` hooks. */
    testId: string;
}

/**
 * Where this is, and a way to change it.
 *
 * A place could only be set when the record was created. Everything behind
 * that — the API's patch, the client call, the first-writer semantics — already
 * existed and was tested; only the affordance was missing, so a resource that
 * moved or a need someone forgot to place was stuck that way for good.
 *
 * Collapsed to a single line until asked, because most cards are read, not
 * edited, and a picker on every row would bury the list it belongs to.
 *
 * The control is offered to everyone rather than gated on ownership: the record
 * carries an author id from the API's own token, which the client cannot map to
 * the signed-in Matrix user with any confidence. The API enforces it and a
 * refusal is reported, which is the same bargain the status and availability
 * controls beside it already make.
 */
export function PlaceEditor({ place, onSave, testId }: PlaceEditorProps) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState<CoalitionPlace | null>(place ?? null);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const open = useCallback(() => {
        setDraft(place ?? null);
        setError(null);
        setEditing(true);
    }, [place]);

    const save = useCallback(async () => {
        setSaving(true);
        setError(null);
        try {
            await onSave(draft);
            setEditing(false);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Could not save that location.');
        } finally {
            setSaving(false);
        }
    }, [draft, onSave]);

    if (!editing) {
        return (
            <div style={rowStyle} data-testid={`${testId}-summary`}>
                {place ? (
                    <span>
                        {place.kind === 'area' ? '◎' : '📍'} {describePlace(place)}
                    </span>
                ) : (
                    <span style={{ color: 'var(--text-muted)' }}>Not on the map</span>
                )}
                <button
                    type="button"
                    onClick={open}
                    style={linkButtonStyle}
                    data-testid={`${testId}-edit`}
                >
                    {place ? 'Change' : 'Put it on the map'}
                </button>
            </div>
        );
    }

    return (
        <div
            style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
            data-testid={`${testId}-form`}
        >
            <PlacePicker value={draft} onChange={setDraft} testId={`${testId}-picker`} />
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button
                    type="button"
                    onClick={save}
                    disabled={saving}
                    style={saveButtonStyle}
                    data-testid={`${testId}-save`}
                >
                    {saving ? 'Saving…' : 'Save location'}
                </button>
                <button
                    type="button"
                    onClick={() => setEditing(false)}
                    style={linkButtonStyle}
                    data-testid={`${testId}-cancel`}
                >
                    Cancel
                </button>
            </div>
            {error ? (
                <span
                    style={{ fontSize: 12, color: 'var(--danger, #E74C3C)' }}
                    role="alert"
                    data-testid={`${testId}-error`}
                >
                    {error}
                </span>
            ) : null}
        </div>
    );
}

export default PlaceEditor;
