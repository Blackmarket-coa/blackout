import React, { useCallback, useMemo, useState } from 'react';
import { useStore } from 'jotai';
import { Link, Outlet, useNavigate } from 'react-router';
import { EMBED_PATH } from '../../pages/paths';
import { signOutPanel } from '../../../client/auth';
import { restoreActiveSession } from '../../../client/sessionManager';
import { EmbedLinkGuard } from './EmbedLinkGuard';
import {
    linkStyle,
    mutedTextStyle,
    panelHeaderStyle,
    panelMainStyle,
    panelRootStyle,
} from './embedStyles';

/**
 * Frame of the Black Mask chat panel: a one-line header and the current panel
 * page. No app navigation (rail, tab bar, Town Square, settings) is rendered —
 * the only way out is "Open Blackout", which opens a normal Blackout tab.
 */
export const EmbedLayout = () => {
    const navigate = useNavigate();
    const onInPanel = useCallback((path: string) => navigate(path), [navigate]);
    return (
        <EmbedLinkGuard onInPanel={onInPanel}>
            <div data-embed-root="" data-testid="embed-root" style={panelRootStyle}>
                <EmbedHeader />
                <EmbedSessionBar />
                <main style={panelMainStyle}>
                    <Outlet />
                </main>
            </div>
        </EmbedLinkGuard>
    );
};

const formatSessionEnd = (endsAt: number): string =>
    new Date(endsAt).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    });

/**
 * Signed-in panel only (launch-plan B3): when this panel's session ends, and
 * the way to end it now. The panel has its own session, separate from the
 * full app's, so signing out of Blackout in a tab does not sign it out — this
 * button does.
 */
export const EmbedSessionBar = () => {
    const store = useStore();
    const [busy, setBusy] = useState(false);
    const session = useMemo(() => restoreActiveSession(), []);
    const until =
        session?.sessionEndsAt !== undefined
            ? `Signed in until ${formatSessionEnd(session.sessionEndsAt)}`
            : session?.sessionLength === 'until_sign_out'
            ? 'Signed in until you sign out'
            : null;
    return (
        <div
            data-testid="embed-session-bar"
            style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
                padding: '6px 12px',
                borderBottom: '1px solid var(--border-default, #374151)',
                fontSize: 12,
            }}
        >
            <span style={mutedTextStyle} data-testid="embed-session-until">
                {until ?? ''}
            </span>
            <button
                type="button"
                data-testid="embed-sign-out"
                disabled={busy}
                onClick={() => {
                    setBusy(true);
                    void signOutPanel(store).finally(() => setBusy(false));
                }}
                style={{
                    ...linkStyle,
                    fontSize: 12,
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                }}
            >
                {busy ? 'Signing out…' : 'Sign out'}
            </button>
        </div>
    );
};

export const EmbedHeader = ({ signedIn = true }: { signedIn?: boolean }) => (
    <header style={panelHeaderStyle}>
        {signedIn ? (
            <Link
                to={EMBED_PATH}
                style={{ color: 'inherit', fontWeight: 600, textDecoration: 'none' }}
            >
                Blackout chat
            </Link>
        ) : (
            <strong>Blackout chat</strong>
        )}
        {/*
         * target/rel are a fallback for when the link guard is not in play:
         * even then this opens a new top-level tab instead of navigating the
         * panel's frame.
         */}
        <a
            href="/"
            target="_blank"
            rel="noopener noreferrer"
            style={{ ...linkStyle, fontSize: 13 }}
            data-testid="embed-open-blackout"
        >
            Open Blackout
        </a>
    </header>
);

export default EmbedLayout;
