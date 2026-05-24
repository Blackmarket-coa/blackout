import React, { ReactNode, useCallback, useEffect, useState } from 'react';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { isRecoverySkipActive, skipRecoverySetup } from '../../state/recoverySetup';
import {
    RecoveryKeyDisplay,
    SetupVerification,
} from '../DeviceVerificationSetup';

type ProbeState = 'probing' | 'needs_setup' | 'has_backup';

const probeRecoveryState = async (
    crypto: ReturnType<ReturnType<typeof useMatrixClient>['getCrypto']>
): Promise<ProbeState> => {
    if (!crypto) return 'needs_setup';
    try {
        const version = await crypto.getActiveSessionBackupVersion();
        return version ? 'has_backup' : 'needs_setup';
    } catch {
        return 'needs_setup';
    }
};

type PostLoginRecoveryGateProps = {
    children: ReactNode;
};

export const PostLoginRecoveryGate = ({ children }: PostLoginRecoveryGateProps) => {
    const mx = useMatrixClient();
    const [probeState, setProbeState] = useState<ProbeState>('probing');
    const [mode, setMode] = useState<'menu' | 'setup'>('menu');
    const [recoveryKey, setRecoveryKey] = useState<string>();
    const [dismissed, setDismissed] = useState(() => isRecoverySkipActive());

    useEffect(() => {
        let cancelled = false;
        void probeRecoveryState(mx.getCrypto()).then((next) => {
            if (!cancelled) setProbeState(next);
        });
        return () => {
            cancelled = true;
        };
    }, [mx]);

    const handleSkip = useCallback(() => {
        skipRecoverySetup();
        setDismissed(true);
    }, []);

    const handleSetupComplete = useCallback((key: string) => {
        setRecoveryKey(key);
    }, []);

    const handleDone = useCallback(() => {
        setProbeState('has_backup');
    }, []);

    if (probeState === 'probing') return null;
    if (probeState === 'has_backup' || dismissed) {
        return <>{children}</>;
    }

    return (
        <main
            data-shell="recovery-gate"
            style={{
                minHeight: '100vh',
                display: 'grid',
                placeItems: 'center',
                background: 'var(--bg-surface, #111827)',
                color: 'var(--text-primary, #f8fafc)',
                padding: 24,
            }}
        >
            <section
                style={{
                    width: 'min(560px, 100%)',
                    border: '1px solid var(--border-default, #374151)',
                    borderRadius: 12,
                    background: 'var(--bg-input, #0f172a)',
                    padding: 24,
                    display: 'grid',
                    gap: 16,
                }}
            >
                {mode === 'menu' && !recoveryKey && (
                    <>
                        <h1 style={{ margin: 0, fontSize: 20 }}>Set up message recovery</h1>
                        <p style={{ margin: 0, opacity: 0.9, lineHeight: 1.5 }}>
                            Encrypted messages can only be read on devices you&apos;ve signed in to.
                            Set up a recovery key now so you don&apos;t lose access to your history
                            if you sign out or switch devices.
                        </p>
                        <button
                            type="button"
                            onClick={() => setMode('setup')}
                            style={buttonPrimaryStyle}
                        >
                            Set up new recovery
                        </button>
                        <button type="button" onClick={handleSkip} style={buttonSecondaryStyle}>
                            Skip for now
                        </button>
                        <p style={{ margin: 0, fontSize: 13, opacity: 0.7, lineHeight: 1.5 }}>
                            Already have a recovery key from another device? Skip this, then go to{' '}
                            <i>Settings &rarr; Devices</i> to verify manually.
                        </p>
                    </>
                )}

                {mode === 'setup' && !recoveryKey && (
                    <SetupVerification onComplete={handleSetupComplete} />
                )}

                {mode === 'setup' && recoveryKey && (
                    <>
                        <RecoveryKeyDisplay recoveryKey={recoveryKey} />
                        <button type="button" onClick={handleDone} style={buttonPrimaryStyle}>
                            I&apos;ve saved my recovery key
                        </button>
                    </>
                )}
            </section>
        </main>
    );
};

const buttonPrimaryStyle: React.CSSProperties = {
    width: '100%',
    padding: '12px 16px',
    borderRadius: 8,
    border: 'none',
    background: 'var(--accent-primary, #2dd4bf)',
    color: 'var(--bg-surface, #111827)',
    fontWeight: 600,
    cursor: 'pointer',
};

const buttonSecondaryStyle: React.CSSProperties = {
    width: '100%',
    padding: '12px 16px',
    borderRadius: 8,
    border: '1px solid var(--border-default, #4b5563)',
    background: 'var(--bg-nav, #1f2937)',
    color: 'var(--text-primary, #f8fafc)',
    cursor: 'pointer',
};

const buttonGhostStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 16px',
    borderRadius: 8,
    border: 'none',
    background: 'transparent',
    color: 'var(--text-secondary, #9ca3af)',
    cursor: 'pointer',
};
