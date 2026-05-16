import React, { useCallback, useState, type CSSProperties } from 'react';
import type { CallLaunchIntentPayload } from '@blackout/protocol';
import {
    launchCall as launchCallDefault,
    type CallBootstrapDescriptor,
} from './mediaCallClient';

export interface ElementCallLauncherProps {
    launchCall?: typeof launchCallDefault;
    /**
     * Whether the canonical Element Call transport is available in this
     * runtime. When false the launcher renders an unsupported-capability
     * fallback instead of the launch form. Defaults to true — production
     * callers will compute this from the runtime capability context.
     */
    capabilityAvailable?: boolean;
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

const MATRIX_ROOM_ID_RE = /^![A-Za-z0-9._=/+-]+:[A-Za-z0-9.\-]+$/;

const generateIntentId = (): string =>
    `element-call-${Math.random().toString(36).slice(2, 12)}-${Date.now()}`;

const isValidRoomId = (raw: string): boolean => MATRIX_ROOM_ID_RE.test(raw.trim());

export function ElementCallLauncher({
    launchCall = launchCallDefault,
    capabilityAvailable = true,
}: ElementCallLauncherProps = {}) {
    const [target, setTarget] = useState('');
    const [pending, setPending] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [descriptor, setDescriptor] = useState<CallBootstrapDescriptor | null>(null);
    const [emittedIntent, setEmittedIntent] = useState<CallLaunchIntentPayload | null>(null);

    const onSubmit = useCallback(
        async (event: React.FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            setSubmitError(null);
            setDescriptor(null);
            setEmittedIntent(null);
            const room = target.trim();
            if (!isValidRoomId(room)) {
                setSubmitError(
                    'Enter a valid Matrix room id (e.g. !abc:example.org).',
                );
                return;
            }
            const intent: CallLaunchIntentPayload = {
                intentId: generateIntentId(),
                kind: 'element-call',
                target: room,
                issuedAt: new Date().toISOString(),
            };
            setPending(true);
            try {
                const result = await launchCall(intent);
                setDescriptor(result);
                setEmittedIntent(intent);
                setTarget('');
            } catch (error) {
                setSubmitError(
                    error instanceof Error
                        ? error.message
                        : 'Failed to launch Element Call.',
                );
            } finally {
                setPending(false);
            }
        },
        [launchCall, target],
    );

    if (!capabilityAvailable) {
        return (
            <main style={containerStyle} data-testid="element-call-launcher">
                <header>
                    <h1 style={{ margin: 0 }}>Element Call</h1>
                </header>
                <section
                    style={{
                        ...cardStyle,
                        border: '1px dashed var(--border-default)',
                    }}
                    data-testid="element-call-unsupported"
                >
                    <strong>Element Call is not available</strong>
                    <small style={{ color: 'var(--text-secondary)' }}>
                        This client does not have the canonical Element Call transport
                        capability. Ask an admin to enable the <code>call.element.launch</code>{' '}
                        capability and the <code>mediaCall</code> feature flag, or use the
                        Matrix RTC fallback from your room timeline.
                    </small>
                </section>
            </main>
        );
    }

    return (
        <main style={containerStyle} data-testid="element-call-launcher">
            <header>
                <h1 style={{ margin: 0 }}>Element Call</h1>
                <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)' }}>
                    Launch a federated Element Call session for a Matrix room. Returns the
                    transport URL the launcher should connect to; the server emits a
                    <code> blackout.call.launch.intent </code>envelope for receivers.
                </p>
            </header>

            <form
                style={cardStyle}
                onSubmit={onSubmit}
                data-testid="element-call-form"
            >
                <label style={fieldStyle}>
                    Room id
                    <input
                        data-testid="element-call-target-input"
                        value={target}
                        onChange={(event) => {
                            setTarget(event.target.value);
                            setSubmitError(null);
                        }}
                        placeholder="!room:example.org"
                        autoComplete="off"
                        spellCheck={false}
                        required
                    />
                </label>
                {submitError ? (
                    <p
                        role="alert"
                        data-testid="element-call-submit-error"
                        style={{ color: 'var(--danger)', margin: 0 }}
                    >
                        {submitError}
                    </p>
                ) : null}
                <button
                    type="submit"
                    data-testid="element-call-submit"
                    disabled={pending || !isValidRoomId(target)}
                    style={{
                        alignSelf: 'flex-start',
                        padding: '6px 14px',
                        borderRadius: 8,
                        border: '1px solid var(--accent-primary, #1ABC9C)',
                        background:
                            isValidRoomId(target) && !pending
                                ? 'var(--accent-primary, #1ABC9C)'
                                : 'var(--bg-input)',
                        color:
                            isValidRoomId(target) && !pending
                                ? '#fff'
                                : 'var(--text-secondary)',
                        cursor: pending
                            ? 'progress'
                            : isValidRoomId(target)
                            ? 'pointer'
                            : 'not-allowed',
                    }}
                >
                    {pending ? 'Launching…' : 'Launch Element Call'}
                </button>
            </form>

            {descriptor ? (
                <section
                    style={cardStyle}
                    data-testid="element-call-descriptor"
                    data-intent-id={descriptor.intentId}
                >
                    <strong>Element Call ready</strong>
                    <small style={{ color: 'var(--text-secondary)' }}>
                        Intent <code>{descriptor.intentId}</code> · kind{' '}
                        <code>{descriptor.kind}</code>
                    </small>
                    <small style={{ color: 'var(--text-secondary)' }}>
                        Transport:{' '}
                        <a
                            href={descriptor.transportUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            data-testid="element-call-transport-url"
                        >
                            {descriptor.transportUrl}
                        </a>
                    </small>
                    {emittedIntent ? (
                        <small
                            style={{ color: 'var(--text-secondary)' }}
                            data-testid="element-call-emitted-intent"
                            data-intent-target={emittedIntent.target}
                            data-intent-kind={emittedIntent.kind}
                        >
                            Emitted intent for room <code>{emittedIntent.target}</code>
                        </small>
                    ) : null}
                </section>
            ) : null}
        </main>
    );
}

export default ElementCallLauncher;
