import React, { useCallback, useMemo, useState, type CSSProperties } from 'react';
import {
    buildDialpadIntent,
    dialpadCall as dialpadCallDefault,
    type CallBootstrapDescriptor,
} from './mediaCallClient';

export interface DialpadFormProps {
    dialpadCall?: typeof dialpadCallDefault;
}

const containerStyle: CSSProperties = { display: 'grid', gap: 16, padding: 16 };
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

const dialpadGridStyle: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 6,
};

const padButtonStyle: CSSProperties = {
    padding: '12px 0',
    fontSize: 18,
    borderRadius: 8,
    border: '1px solid var(--border-default)',
    background: 'var(--bg-input)',
    color: 'var(--text-primary)',
    cursor: 'pointer',
};

const DIAL_KEYS: ReadonlyArray<string> = [
    '1', '2', '3',
    '4', '5', '6',
    '7', '8', '9',
    '*', '0', '#',
];

const E164_RE = /^\+[1-9]\d{6,14}$/;

const sanitize = (raw: string): string => raw.replace(/[\s\-().]/g, '');

/**
 * Validates an E.164 phone number. Allows display formatting (spaces, dashes,
 * parens, dots) but the sanitized result must match `+[1-9]\d{6,14}`.
 */
const isValidE164 = (raw: string): boolean => {
    const sanitized = sanitize(raw);
    return E164_RE.test(sanitized);
};

export function DialpadForm({ dialpadCall = dialpadCallDefault }: DialpadFormProps = {}) {
    const [target, setTarget] = useState('');
    const [pending, setPending] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [descriptor, setDescriptor] = useState<CallBootstrapDescriptor | null>(null);

    const sanitized = useMemo(() => sanitize(target), [target]);
    const isValid = useMemo(() => E164_RE.test(sanitized), [sanitized]);

    const onPress = useCallback((key: string) => {
        setTarget((current) => {
            // Normalize: only a leading + and digits/*/# are meaningful. The
            // sanitized version is what gets sent, but we preserve user-typed
            // separators by appending the raw key.
            return current + key;
        });
        setSubmitError(null);
    }, []);

    const onBackspace = useCallback(() => {
        setTarget((current) => current.slice(0, -1));
        setSubmitError(null);
    }, []);

    const onClear = useCallback(() => {
        setTarget('');
        setSubmitError(null);
        setDescriptor(null);
    }, []);

    const onSubmit = useCallback(
        async (event: React.FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            setSubmitError(null);
            setDescriptor(null);
            if (!isValidE164(target)) {
                setSubmitError(
                    'Enter a valid E.164 number (e.g. +14155550100). Sanitized digits must be 7–15 long.',
                );
                return;
            }
            // buildDialpadIntent strips formatting and auto-generates intentId
            // + issuedAt when not provided. We hand it the raw user input so
            // the contract-level sanitization is the single source of truth.
            const intent = buildDialpadIntent(target);
            setPending(true);
            try {
                const result = await dialpadCall({
                    target: intent.target,
                    intentId: intent.intentId,
                    issuedAt: intent.issuedAt,
                    ...(intent.metadata ? { metadata: intent.metadata } : {}),
                });
                setDescriptor(result);
                // Clear the dialed input so the next call starts fresh.
                setTarget('');
            } catch (error) {
                setSubmitError(
                    error instanceof Error ? error.message : 'Failed to launch dialpad call.',
                );
            } finally {
                setPending(false);
            }
        },
        [dialpadCall, target],
    );

    return (
        <main style={containerStyle} data-testid="dialpad-form">
            <header>
                <h1 style={{ margin: 0 }}>Dialpad</h1>
                <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)' }}>
                    Place a PSTN call via the canonical launch bootstrap. Enter the destination
                    in E.164 format — formatting characters are stripped before submission.
                </p>
            </header>

            <form
                style={cardStyle}
                onSubmit={onSubmit}
                data-testid="dialpad-form-form"
            >
                <label style={fieldStyle}>
                    Number
                    <input
                        data-testid="dialpad-target-input"
                        value={target}
                        onChange={(event) => {
                            setTarget(event.target.value);
                            setSubmitError(null);
                        }}
                        placeholder="+14155550100"
                        inputMode="tel"
                        autoComplete="off"
                        spellCheck={false}
                        required
                    />
                </label>
                <small
                    data-testid="dialpad-sanitized-preview"
                    style={{ color: 'var(--text-secondary)' }}
                >
                    Sanitized: <code>{sanitized || '—'}</code>
                </small>
                <div
                    role="group"
                    aria-label="Dialpad keys"
                    style={dialpadGridStyle}
                    data-testid="dialpad-keys"
                >
                    {DIAL_KEYS.map((key) => (
                        <button
                            key={key}
                            type="button"
                            data-testid={`dialpad-key-${key}`}
                            onClick={() => onPress(key)}
                            style={padButtonStyle}
                        >
                            {key}
                        </button>
                    ))}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                    <button
                        type="button"
                        data-testid="dialpad-backspace"
                        onClick={onBackspace}
                        disabled={target.length === 0}
                    >
                        ⌫ Backspace
                    </button>
                    <button
                        type="button"
                        data-testid="dialpad-clear"
                        onClick={onClear}
                        disabled={target.length === 0 && descriptor === null}
                    >
                        Clear
                    </button>
                </div>
                {submitError ? (
                    <p
                        role="alert"
                        data-testid="dialpad-submit-error"
                        style={{ color: 'var(--danger)', margin: 0 }}
                    >
                        {submitError}
                    </p>
                ) : null}
                <button
                    type="submit"
                    data-testid="dialpad-submit"
                    disabled={pending || !isValid}
                    style={{
                        alignSelf: 'flex-start',
                        padding: '6px 14px',
                        borderRadius: 8,
                        border: '1px solid var(--accent-primary, #1ABC9C)',
                        background: isValid && !pending ? 'var(--accent-primary, #1ABC9C)' : 'var(--bg-input)',
                        color: isValid && !pending ? '#fff' : 'var(--text-secondary)',
                        cursor: pending ? 'progress' : isValid ? 'pointer' : 'not-allowed',
                    }}
                >
                    {pending ? 'Launching…' : 'Call'}
                </button>
            </form>

            {descriptor ? (
                <section
                    style={cardStyle}
                    data-testid="dialpad-descriptor"
                    data-intent-id={descriptor.intentId}
                >
                    <strong>Call launched</strong>
                    <small style={{ color: 'var(--text-secondary)' }}>
                        Intent <code>{descriptor.intentId}</code> · kind{' '}
                        <code>{descriptor.kind}</code>
                    </small>
                    <small style={{ color: 'var(--text-secondary)' }}>
                        Transport:{' '}
                        <code data-testid="dialpad-transport-url">
                            {descriptor.transportUrl}
                        </code>
                    </small>
                </section>
            ) : null}
        </main>
    );
}

export default DialpadForm;
