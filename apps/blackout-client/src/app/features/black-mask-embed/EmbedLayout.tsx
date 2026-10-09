import React, { useCallback } from 'react';
import { Link, Outlet, useNavigate } from 'react-router';
import { EMBED_PATH } from '../../pages/paths';
import { EmbedLinkGuard } from './EmbedLinkGuard';
import { linkStyle, panelHeaderStyle, panelMainStyle, panelRootStyle } from './embedStyles';

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
                <main style={panelMainStyle}>
                    <Outlet />
                </main>
            </div>
        </EmbedLinkGuard>
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
