import React, { useCallback, useEffect, useRef, useState } from 'react';

type IframeState = 'loading' | 'loaded' | 'error';

const PIGGPIN_PATH = 'https://app.piggpin.space';

export function PiggPinView() {
    const [state, setState] = useState<IframeState>('loading');
    const failTimer = useRef<ReturnType<typeof setTimeout>>();

    useEffect(() => {
        failTimer.current = setTimeout(() => {
            setState((prev) => (prev === 'loading' ? 'error' : prev));
        }, 15_000);
        return () => clearTimeout(failTimer.current);
    }, []);

    const handleLoad = useCallback(() => {
        clearTimeout(failTimer.current);
        setState('loaded');
    }, []);

    const handleRetry = useCallback(() => {
        setState('loading');
        failTimer.current = setTimeout(() => {
            setState((prev) => (prev === 'loading' ? 'error' : prev));
        }, 15_000);
    }, []);

    return (
        <div
            style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                background: 'var(--bg-surface, #1a1a2e)',
            }}
        >
            {state === 'loading' && (
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        height: '100%',
                        fontSize: '14px',
                        opacity: 0.6,
                    }}
                >
                    <div style={{ textAlign: 'center' }}>
                        <div
                            style={{
                                width: '32px',
                                height: '32px',
                                border: '3px solid var(--border, #2a2a4a)',
                                borderTopColor: 'var(--accent, #6366f1)',
                                borderRadius: '50%',
                                animation: 'spin 0.8s linear infinite',
                                margin: '0 auto 12px',
                            }}
                        />
                        Loading map...
                        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                    </div>
                </div>
            )}

            {state === 'error' && (
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        height: '100%',
                        fontSize: '14px',
                    }}
                >
                    <div style={{ textAlign: 'center', opacity: 0.7 }}>
                        <div style={{ fontSize: '48px', marginBottom: '12px', lineHeight: 1 }}>
                            &#x1F5FA;
                        </div>
                        <div style={{ marginBottom: '8px' }}>Map unavailable</div>
                        <button
                            onClick={handleRetry}
                            style={{
                                background: 'var(--accent, #6366f1)',
                                color: '#fff',
                                border: 'none',
                                borderRadius: '6px',
                                padding: '8px 20px',
                                fontSize: '13px',
                                cursor: 'pointer',
                            }}
                            type="button"
                        >
                            Retry
                        </button>
                    </div>
                </div>
            )}

            <iframe
                src={PIGGPIN_PATH}
                title="Decentralized Map"
                onLoad={handleLoad}
                allow="geolocation;serial;bluetooth;camera"
                style={{
                    width: '100%',
                    height: '100%',
                    border: 'none',
                    display: state === 'loaded' ? 'block' : 'none',
                }}
            />
        </div>
    );
}
