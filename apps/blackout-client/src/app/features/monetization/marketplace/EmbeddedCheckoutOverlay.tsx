import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useDismissOnOutsideOrEscape } from '../../room/useDismissOnOutsideOrEscape';

export interface EmbeddedCheckoutEvent {
    type: 'checkout.completed' | 'checkout.cancelled' | 'checkout.error';
    sessionId?: string;
    reason?: string;
}

export interface EmbeddedCheckoutOverlayProps {
    redirectUrl: string;
    sessionId: string;
    onCompleted: (event: EmbeddedCheckoutEvent) => void;
    onCancelled: (event: EmbeddedCheckoutEvent) => void;
    onError?: (event: EmbeddedCheckoutEvent) => void;
}

/**
 * Origin-restricted iframe overlay for in-app checkout. Listens for
 * postMessage events from the marketplace embed origin and relays
 * lifecycle transitions back to the host. Falls back to closing on
 * non-matching origins to keep the surface inert under attack.
 */
export function EmbeddedCheckoutOverlay(props: EmbeddedCheckoutOverlayProps) {
    const { redirectUrl, sessionId, onCompleted, onCancelled, onError } = props;
    const iframeRef = useRef<HTMLIFrameElement | null>(null);

    const expectedOrigin = useMemo(() => {
        try {
            return new URL(redirectUrl).origin;
        } catch {
            return null;
        }
    }, [redirectUrl]);

    useEffect(() => {
        if (!expectedOrigin) return;
        const handler = (event: MessageEvent) => {
            if (event.origin !== expectedOrigin) return;
            const data = event.data;
            if (!data || typeof data !== 'object' || typeof data.type !== 'string') return;
            if (data.sessionId && data.sessionId !== sessionId) return;
            const payload: EmbeddedCheckoutEvent = {
                type: data.type as EmbeddedCheckoutEvent['type'],
                sessionId: typeof data.sessionId === 'string' ? data.sessionId : sessionId,
                reason: typeof data.reason === 'string' ? data.reason : undefined,
            };
            if (payload.type === 'checkout.completed') onCompleted(payload);
            else if (payload.type === 'checkout.cancelled') onCancelled(payload);
            else if (payload.type === 'checkout.error') onError?.(payload);
        };
        window.addEventListener('message', handler);
        return () => window.removeEventListener('message', handler);
    }, [expectedOrigin, onCancelled, onCompleted, onError, sessionId]);

    const cancelFromEscape = useCallback(() => {
        onCancelled({ type: 'checkout.cancelled', sessionId, reason: 'escape' });
    }, [onCancelled, sessionId]);
    useDismissOnOutsideOrEscape(true, null, cancelFromEscape);

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-label="Marketplace checkout"
            style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0,0,0,0.6)',
                display: 'grid',
                placeItems: 'center',
                zIndex: 200,
            }}
            onClick={() =>
                onCancelled({ type: 'checkout.cancelled', sessionId, reason: 'backdrop' })
            }
        >
            <div
                onClick={(event) => event.stopPropagation()}
                style={{
                    width: 'min(960px, 96vw)',
                    height: 'min(680px, 92vh)',
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-default)',
                    borderRadius: 12,
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                }}
            >
                <header
                    style={{
                        padding: '8px 12px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        borderBottom: '1px solid var(--border-default)',
                        fontSize: 13,
                        color: 'var(--text-secondary)',
                    }}
                >
                    <span>
                        Secure checkout —{' '}
                        {expectedOrigin ? new URL(expectedOrigin).hostname : 'verifying…'}
                    </span>
                    <button
                        type="button"
                        onClick={() =>
                            onCancelled({
                                type: 'checkout.cancelled',
                                sessionId,
                                reason: 'closed',
                            })
                        }
                        style={{
                            background: 'transparent',
                            color: 'var(--text-secondary)',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: 14,
                        }}
                        aria-label="Close checkout"
                    >
                        Close
                    </button>
                </header>
                <iframe
                    ref={iframeRef}
                    title="Marketplace checkout"
                    src={redirectUrl}
                    sandbox="allow-scripts allow-forms allow-same-origin allow-top-navigation-by-user-activation"
                    referrerPolicy="strict-origin-when-cross-origin"
                    style={{ flex: 1, width: '100%', border: 0, background: '#fff' }}
                />
            </div>
        </div>
    );
}
