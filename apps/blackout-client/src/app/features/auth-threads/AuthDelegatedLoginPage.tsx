import React, { useCallback, useState } from 'react';
import {
    isSessionExpired,
    type AuthSessionContinuationReason,
    type AuthSessionContinuedPayload,
    type OidcBootstrapDescriptor,
} from '@blackout/sdk';
import { useRegistryFetcher } from '../../core/features/RegistryFetcherProvider';

export type AuthFetcher = {
    beginOidcLogin: (input: { redirectUri: string; scopes?: string[] }) => Promise<OidcBootstrapDescriptor>;
    continueOidcSession: (input: {
        reason: AuthSessionContinuationReason;
        idToken?: string;
    }) => Promise<{ payload: AuthSessionContinuedPayload }>;
    signOut: () => Promise<unknown>;
};

type Props = {
    fetcher?: AuthFetcher;
    /** ISO timestamp used by `isSessionExpired`. Defaults to now. Tests inject a fixed clock. */
    nowIso?: string;
};

const stub: AuthFetcher = {
    beginOidcLogin: async () => ({
        authorizationUrl: '',
        scopes: [],
    }),
    continueOidcSession: async () => ({
        payload: {
            subject: '',
            issuer: '',
            issuedAt: '',
            expiresAt: '',
            reason: 'login',
        },
    }),
    signOut: async () => ({}),
};

export function AuthDelegatedLoginPage({ fetcher: explicitFetcher, nowIso }: Props) {
    const contextFetcher = useRegistryFetcher('auth');
    const fetcher = explicitFetcher ?? contextFetcher ?? stub;
    const [redirectUri, setRedirectUri] = useState(
        typeof window !== 'undefined' ? `${window.location.origin}/auth/callback` : ''
    );
    const [pending, setPending] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);
    const [bootstrap, setBootstrap] = useState<OidcBootstrapDescriptor | null>(null);
    const [session, setSession] = useState<AuthSessionContinuedPayload | null>(null);

    const onBegin = useCallback(async () => {
        setActionError(null);
        setPending('begin');
        try {
            const result = await fetcher.beginOidcLogin({ redirectUri });
            setBootstrap(result);
        } catch (error) {
            setActionError(error instanceof Error ? error.message : 'Failed to start OIDC login.');
        } finally {
            setPending(null);
        }
    }, [fetcher, redirectUri]);

    const onContinue = useCallback(
        async (reason: AuthSessionContinuationReason) => {
            setActionError(null);
            setPending('continue');
            try {
                const result = await fetcher.continueOidcSession({ reason });
                setSession(result.payload ?? null);
            } catch (error) {
                setActionError(
                    error instanceof Error ? error.message : 'Failed to continue session.'
                );
            } finally {
                setPending(null);
            }
        },
        [fetcher]
    );

    const onSignOut = useCallback(async () => {
        setActionError(null);
        setPending('sign-out');
        try {
            await fetcher.signOut();
            setSession(null);
            setBootstrap(null);
        } catch (error) {
            setActionError(error instanceof Error ? error.message : 'Failed to sign out.');
        } finally {
            setPending(null);
        }
    }, [fetcher]);

    const expired = isSessionExpired(session, nowIso ?? new Date().toISOString());

    return (
        <main
            data-testid="auth-delegated-login-page"
            style={{ padding: 16, display: 'grid', gap: 16 }}
        >
            <header>
                <h1 style={{ margin: 0 }}>Delegated login</h1>
                <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
                    OIDC bootstrap + session continuation. Backed by `beginOidcLogin` /
                    `continueOidcSession` / `signOut` and the BKL-011 session-continued
                    envelope.
                </p>
            </header>

            {actionError ? (
                <p data-testid="auth-action-error" role="alert">
                    {actionError}
                </p>
            ) : null}

            <section
                data-testid="auth-begin-section"
                style={{
                    border: '1px solid var(--border-default)',
                    borderRadius: 10,
                    padding: 12,
                    display: 'grid',
                    gap: 6,
                }}
            >
                <strong>Start OIDC login</strong>
                <label>
                    Redirect URI
                    <input
                        data-testid="auth-redirect-uri"
                        value={redirectUri}
                        onChange={(event) => setRedirectUri(event.target.value)}
                    />
                </label>
                <button
                    type="button"
                    data-testid="auth-begin-submit"
                    onClick={() => void onBegin()}
                    disabled={pending === 'begin'}
                >
                    {pending === 'begin' ? 'Starting…' : 'Begin login'}
                </button>
                {bootstrap?.authorizationUrl ? (
                    <small data-testid="auth-bootstrap-url">
                        IDP redirect:{' '}
                        <a href={bootstrap.authorizationUrl}>{bootstrap.authorizationUrl}</a>
                    </small>
                ) : null}
            </section>

            <section
                data-testid="auth-session-section"
                style={{
                    border: '1px solid var(--border-default)',
                    borderRadius: 10,
                    padding: 12,
                    display: 'grid',
                    gap: 6,
                }}
            >
                <strong>Session</strong>
                {session ? (
                    <small data-testid="auth-session-summary">
                        subject: {session.subject} · issuer: {session.issuer} · expires:{' '}
                        {session.expiresAt} · reason: {session.reason} ·{' '}
                        <strong>{expired ? 'expired' : 'active'}</strong>
                    </small>
                ) : (
                    <small data-testid="auth-session-empty">
                        No active session.
                    </small>
                )}
                <div style={{ display: 'flex', gap: 6 }}>
                    <button
                        type="button"
                        data-testid="auth-continue-refresh"
                        onClick={() => void onContinue('refresh')}
                        disabled={pending === 'continue'}
                    >
                        Refresh session
                    </button>
                    <button
                        type="button"
                        data-testid="auth-sign-out"
                        onClick={() => void onSignOut()}
                        disabled={pending === 'sign-out'}
                    >
                        Sign out
                    </button>
                </div>
            </section>
        </main>
    );
}

export default AuthDelegatedLoginPage;
