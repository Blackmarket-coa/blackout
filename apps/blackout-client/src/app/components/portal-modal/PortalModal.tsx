import React, { type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

// Hand-rolled overlay that bypasses Folds' Overlay/OverlayCenter/OverlayBackdrop.
// Three rounds of inline-style band-aids on the Folds primitives failed to
// keep the create-room / create-space wizards above the WelcomeScreen and
// pointer-event-capturing. Mirrors the proven HomeTourOverlay pattern: raw
// createPortal to document.body, explicit fixed-position dim backdrop, a
// centered content layer.

const rootStyle: CSSProperties = {
    position: 'fixed',
    inset: 0,
    zIndex: 9999,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
};

const backdropStyle: CSSProperties = {
    position: 'absolute',
    inset: 0,
    background: 'rgba(0, 0, 0, 0.55)',
    pointerEvents: 'auto',
};

const contentStyle: CSSProperties = {
    position: 'relative',
    zIndex: 1,
    maxWidth: '100vw',
    maxHeight: '100vh',
    display: 'flex',
    pointerEvents: 'auto',
};

export interface PortalModalProps {
    onClose: () => void;
    children: ReactNode;
    backdropTestId?: string;
}

export const PortalModal = ({
    onClose,
    children,
    backdropTestId,
}: PortalModalProps): JSX.Element => {
    const tree = (
        <div style={rootStyle} role="presentation">
            <div
                style={backdropStyle}
                onMouseDown={onClose}
                data-testid={backdropTestId}
                aria-hidden
            />
            <div style={contentStyle} onMouseDown={(e) => e.stopPropagation()}>
                {children}
            </div>
        </div>
    );

    if (typeof document === 'undefined') return tree;
    return createPortal(tree, document.body);
};

export default PortalModal;
