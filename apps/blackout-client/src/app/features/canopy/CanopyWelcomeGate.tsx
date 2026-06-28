import { type CSSProperties, useState } from 'react';
import type { Room } from 'matrix-js-sdk';
import { useRoomNavigate } from '../../hooks/useRoomNavigate';
import { BLACKOUT_TERMS } from '../../lib/blackoutTerminology';
import { WelcomeScreen } from '../welcome/WelcomeScreen';
import { WELCOME_EVENT_TYPE, useCanopyWelcomeSeen } from '../welcome/useWelcome';

const OVERLAY_STYLE: CSSProperties = {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.6)',
    zIndex: 45,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
};

const CARD_STYLE: CSSProperties = {
    width: 'min(560px, 100%)',
    maxHeight: 'min(80vh, 720px)',
    overflow: 'auto',
    position: 'relative',
    borderRadius: 14,
    background: 'var(--bg-surface)',
    boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
};

const closeButtonStyle: CSSProperties = {
    position: 'absolute',
    top: 8,
    right: 8,
    zIndex: 1,
    width: 30,
    height: 30,
    borderRadius: 999,
    border: '1px solid var(--border-default)',
    background: 'rgba(0,0,0,0.4)',
    color: '#fff',
    fontSize: 18,
    lineHeight: 1,
    cursor: 'pointer',
};

/**
 * Shows a canopy's configured welcome screen once, the first time the viewer
 * opens it. Renders nothing unless an admin has set a `co.bmc.welcome` state
 * event (the welcome content hook fills name-based defaults, so we check the
 * raw event to distinguish "configured" from "absent"). Mount keyed by
 * `canopy.roomId` so the per-mount `dismissed` flag resets between canopies.
 */
export const CanopyWelcomeGate = ({ canopy }: { canopy: Room }) => {
    const { navigateRoom } = useRoomNavigate();
    const { seen, markSeen } = useCanopyWelcomeSeen(canopy.roomId);
    const [dismissed, setDismissed] = useState(false);

    const configured = Boolean(canopy.currentState?.getStateEvents(WELCOME_EVENT_TYPE, ''));
    if (!configured || seen || dismissed) return null;

    const close = () => {
        void markSeen();
        setDismissed(true);
    };

    return (
        <div
            style={OVERLAY_STYLE}
            role="dialog"
            aria-modal="true"
            aria-label={`${canopy.name} welcome`}
            data-testid="canopy-welcome-overlay"
            onClick={close}
        >
            <div style={CARD_STYLE} onClick={(event) => event.stopPropagation()}>
                <button
                    type="button"
                    aria-label="Close welcome"
                    data-testid="canopy-welcome-close"
                    onClick={close}
                    style={closeButtonStyle}
                >
                    ×
                </button>
                <WelcomeScreen
                    spaceId={canopy.roomId}
                    actionLabel={`Explore ${BLACKOUT_TERMS.den.plural}`}
                    onPickChannel={(roomId) => {
                        void markSeen();
                        navigateRoom(roomId);
                        setDismissed(true);
                    }}
                    onJoinOrExplore={close}
                />
            </div>
        </div>
    );
};

export default CanopyWelcomeGate;
