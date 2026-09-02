import { useState } from 'react';
import { relayOutOfRing } from './coalitionClient';

interface CrewRelayOutProps {
    ringId: string;
    onRelayed?: () => void;
}

const inputStyle: React.CSSProperties = {
    padding: '8px 10px',
    borderRadius: 8,
    border: '1px solid var(--border-default)',
    background: 'var(--bg-input)',
    color: 'var(--text-primary)',
    fontSize: 14,
};

/**
 * Carry something out of a crew into the wider network.
 *
 * A crew is a small private pod, so nothing said inside one leaves by default.
 * This is a deliberate publish rather than a forward: it takes **your own**
 * words, posts them under your name, and mints your relay so they travel to
 * your Circle like anything else.
 *
 * The consent rule is structural — the API stamps authorship from the caller's
 * token and offers no way to publish someone else's message — so this control
 * is worded to match: it composes, it does not forward.
 */
export const CrewRelayOut = ({ ringId, onRelayed }: CrewRelayOutProps): JSX.Element => {
    const [title, setTitle] = useState('');
    const [body, setBody] = useState('');
    const [note, setNote] = useState('');
    const [busy, setBusy] = useState(false);
    const [done, setDone] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const submit = async () => {
        if (!title.trim()) return;
        setBusy(true);
        setError(null);
        try {
            await relayOutOfRing(ringId, {
                title: title.trim(),
                body: body.trim() || undefined,
                note: note.trim() || undefined,
            });
            setTitle('');
            setBody('');
            setNote('');
            setDone(true);
            onRelayed?.();
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Could not carry this out');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div style={{ display: 'grid', gap: 6 }} data-testid="crew-relay-out">
            <span style={{ fontSize: 12, opacity: 0.8 }}>Carry something out to your Circle</span>
            <small style={{ opacity: 0.75 }}>
                Posts in your name, outside the crew. You can only carry out your own words.
            </small>
            <input
                style={inputStyle}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="What are you carrying out?"
                aria-label="Title"
                maxLength={200}
            />
            <textarea
                style={{ ...inputStyle, minHeight: 60 }}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="More, if it needs it (optional)"
                aria-label="Body"
                maxLength={2000}
            />
            <input
                style={inputStyle}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Relaying because— (optional)"
                aria-label="Relay note"
                maxLength={280}
            />
            <button
                type="button"
                onClick={submit}
                disabled={busy || !title.trim()}
                data-testid="crew-relay-out-submit"
            >
                {busy ? 'Carrying out…' : 'Carry out to my Circle'}
            </button>
            {done ? <small style={{ opacity: 0.8 }}>Carried out.</small> : null}
            {error ? <small style={{ color: 'var(--danger)' }}>{error}</small> : null}
        </div>
    );
};

export default CrewRelayOut;
