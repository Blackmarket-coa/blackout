import React, { useState, type CSSProperties } from 'react';
import { PortalModal } from '../components/portal-modal/PortalModal';

// Playwright harness for the PortalModal primitive. The full
// CreateRoomModal / CreateSpaceModal flows pull in matrix-js-sdk,
// jotai stores, react-query, and ~12 providers — too heavy to drive
// from a browser test that runs against `vite preview` with no backend.
//
// The bug we regressed three times in a row was always the portal
// overlay layer itself: pointer events leaking past the backdrop, the
// modal sitting behind sibling page content, the backdrop not dimming.
// All of that lives in PortalModal. This harness exercises that layer
// against a real DOM, in a real browser, so the regression cannot
// silently come back.
//
// Loaded only when the page navigates to /__dev__/portal-modal (see
// main.tsx). The dynamic import keeps the static bundle from paying the
// cost up front; production users never reach the route by accident.

const pageStyle: CSSProperties = {
    minHeight: '100vh',
    display: 'grid',
    placeItems: 'center',
    background: 'var(--bg-surface, #111827)',
    color: 'var(--text-primary, #f8fafc)',
    padding: 24,
};

const cardStyle: CSSProperties = {
    width: 'min(640px, 100%)',
    border: '1px solid var(--border-default, #374151)',
    borderRadius: 12,
    background: 'var(--bg-input, #0f172a)',
    padding: 20,
    display: 'grid',
    gap: 12,
};

const dialogStyle: CSSProperties = {
    width: 'min(420px, 90vw)',
    background: 'var(--bg-surface, #1f2937)',
    color: 'var(--text-primary, #f8fafc)',
    border: '1px solid var(--border-default, #374151)',
    borderRadius: 12,
    padding: 24,
    display: 'grid',
    gap: 12,
};

export const PortalModalHarness = (): JSX.Element => {
    const [open, setOpen] = useState(false);
    const [clicks, setClicks] = useState(0);

    return (
        <main style={pageStyle} data-testid="harness-page">
            <section style={cardStyle} data-testid="page-bg">
                <h1 style={{ margin: 0, fontSize: 20 }}>PortalModal harness</h1>
                <p style={{ margin: 0, opacity: 0.8 }}>
                    The button below is the WelcomeScreen stand-in. When the overlay is open it must
                    be obscured by the dimmed backdrop and unable to receive clicks.
                </p>
                <button
                    type="button"
                    data-testid="page-bg-btn"
                    onClick={() => setClicks((n) => n + 1)}
                    style={{
                        padding: '8px 12px',
                        borderRadius: 8,
                        border: '1px solid var(--border-default, #374151)',
                        background: 'var(--accent-primary, #3b82f6)',
                        color: 'var(--bg-surface, #0f172a)',
                        cursor: 'pointer',
                    }}
                >
                    background button (clicks: {clicks})
                </button>
                <button
                    type="button"
                    data-testid="harness-open"
                    onClick={() => setOpen(true)}
                    style={{
                        padding: '8px 12px',
                        borderRadius: 8,
                        border: '1px solid var(--border-default, #374151)',
                        background: 'var(--bg-nav, #1f2937)',
                        color: 'var(--text-primary, #f8fafc)',
                        cursor: 'pointer',
                    }}
                >
                    Open modal
                </button>
            </section>

            {open ? (
                <PortalModal onClose={() => setOpen(false)} backdropTestId="harness-backdrop">
                    <div
                        data-testid="harness-dialog"
                        role="dialog"
                        aria-modal
                        aria-label="Harness dialog"
                        style={dialogStyle}
                    >
                        <h2 style={{ margin: 0, fontSize: 18 }}>Modal content</h2>
                        <p style={{ margin: 0 }}>
                            This sits above the page background. Clicks on the backdrop close it;
                            clicks on this content do not.
                        </p>
                        <button
                            type="button"
                            data-testid="harness-dialog-btn"
                            onClick={() => setClicks((n) => n + 100)}
                            style={{
                                padding: '8px 12px',
                                borderRadius: 8,
                                border: '1px solid var(--border-default, #374151)',
                                background: 'var(--accent-primary, #3b82f6)',
                                color: 'var(--bg-surface, #0f172a)',
                                cursor: 'pointer',
                            }}
                        >
                            modal button (+100)
                        </button>
                    </div>
                </PortalModal>
            ) : null}
        </main>
    );
};

export default PortalModalHarness;
