import React, { useMemo } from 'react';
import { useAtomValue } from 'jotai';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { authStateAtom, cryptoInitErrorAtom, type AuthState } from '../../state/auth';
import { LoginPage } from '../../components/bmc/auth';
import { SpecVersionsBootstrap } from '../../components/SpecVersionsBootstrap';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useBindAllRoomsAtom } from '../../state/rooms';
import { useBindAtoms } from '../../state/hooks/useBindAtoms';
import { embedRoutes } from './embedRoutes';
import { EmbedHeader } from './EmbedLayout';
import { EmbedLinkGuard } from './EmbedLinkGuard';
import { cardStyle, mutedTextStyle, panelMainStyle, panelRootStyle } from './embedStyles';

/**
 * Binds the Matrix-derived atoms the panel reads: the joined-room list, the
 * space-parent map, `m.direct`, and the live unread map. A subset of what the
 * full app binds — none of the app's hydrators (capabilities, plugins,
 * profile, invite redemption) run in the panel.
 */
const EmbedAtomBinders = () => {
    const mx = useMatrixClient();
    useBindAllRoomsAtom(mx);
    useBindAtoms(mx);
    return null;
};

const EmbedRouter = () => {
    // Built once: the panel's routes do not depend on capabilities or flags.
    const router = useMemo(() => createBrowserRouter(embedRoutes), []);
    return <RouterProvider router={router} />;
};

const statusText = (authState: AuthState, cryptoInitError: string | null): string => {
    if (authState === 'crypto_initializing') return 'Starting…';
    if (authState === 'crypto_failed') {
        return cryptoInitError ?? 'This browser could not start Blackout’s encryption support.';
    }
    if (authState === 'loading') return 'Restoring your session…';
    return '';
};

/**
 * Signed-out (or still-starting) panel: the app's own sign-in, inside the
 * panel's frame, with no links out to the rest of the app. Session length
 * (launch-plan step B3) is not offered here: the panel signs in exactly like
 * the full app does today.
 */
export const EmbedSignedOut = ({
    authState,
    cryptoInitError,
}: {
    authState: AuthState;
    cryptoInitError: string | null;
}) => (
    <EmbedLinkGuard>
        <div
            data-embed-root=""
            data-testid="embed-signed-out"
            data-bootstrap-state={authState}
            style={panelRootStyle}
        >
            <EmbedHeader signedIn={false} />
            <main style={panelMainStyle}>
                <section style={cardStyle}>
                    {authState === 'logged_out' ? (
                        <>
                            <p style={{ margin: 0 }}>
                                Sign in to Blackout to see your canopies, dens and direct messages
                                here.
                            </p>
                            <LoginPage embedded />
                        </>
                    ) : (
                        <p style={mutedTextStyle} role="status">
                            {statusText(authState, cryptoInitError)}
                        </p>
                    )}
                    {authState === 'crypto_failed' ? (
                        <button
                            type="button"
                            onClick={() => window.location.reload()}
                            style={{ width: 'fit-content' }}
                        >
                            Retry
                        </button>
                    ) : null}
                </section>
            </main>
        </div>
    </EmbedLinkGuard>
);

/**
 * Entry point for the Black Mask chat panel (`/embed`, launch-plan step B1).
 * Mounted by `main.tsx` in place of the full app when the page loads on a
 * panel path, so the full app's router, AppShell and hydrators never mount
 * inside the panel's frame.
 */
export const EmbedApp = () => {
    const authState = useAtomValue(authStateAtom);
    const cryptoInitError = useAtomValue(cryptoInitErrorAtom);

    if (authState === 'logged_in') {
        return (
            <SpecVersionsBootstrap>
                <EmbedAtomBinders />
                <EmbedRouter />
            </SpecVersionsBootstrap>
        );
    }
    return <EmbedSignedOut authState={authState} cryptoInitError={cryptoInitError} />;
};

export default EmbedApp;
