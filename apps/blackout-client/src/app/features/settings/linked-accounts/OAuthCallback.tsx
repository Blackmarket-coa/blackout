import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
    completeCallback,
    isLinkedAccountProvider,
    parseCallbackUrl,
    type LinkedAccountProvider,
} from './linkedAccountsClient';

/**
 * Standalone OAuth callback page. Mounted at `/oauth/:provider/callback`,
 * outside the AppShell, so OAuth providers can redirect a popup window
 * directly here. Replaces the paste-back UX in LinkedAccounts:
 *
 *   1. Read `?code=...&state=...` (or `?error=...`) from the URL.
 *   2. POST to /v1/linked-accounts/:provider/callback.
 *   3. postMessage the outcome to `window.opener` so the parent settings
 *      page can refresh its list and surface the result inline.
 *   4. window.close() — no further interaction needed.
 *
 * Same-origin postMessage only (we explicitly target the API origin); the
 * opener's listener should always verify event.origin before trusting the
 * payload.
 *
 * If the user lands here without `window.opener` (e.g., the popup got
 * de-popped into its own tab, or a returning user with the redirect URL
 * bookmarked), we render a human-readable status page instead of trying
 * to close the window.
 */

export const POSTMESSAGE_TYPE = 'blackout-oauth-callback';

export interface CallbackResultMessage {
    type: typeof POSTMESSAGE_TYPE;
    provider: LinkedAccountProvider;
    ok: boolean;
    /** Set when ok=false. */
    error?: string;
    /** Set when ok=true. */
    providerUserId?: string;
    providerUsername?: string;
}

type Status =
    | { kind: 'idle' }
    | { kind: 'pending' }
    | { kind: 'ok'; providerUsername?: string }
    | { kind: 'error'; message: string };

export function OAuthCallback() {
    const { provider: rawProvider } = useParams<{ provider: string }>();
    const [searchParams] = useSearchParams();
    const [status, setStatus] = useState<Status>({ kind: 'idle' });

    useEffect(() => {
        const run = async () => {
            const provider = rawProvider ?? '';
            if (!isLinkedAccountProvider(provider)) {
                setStatus({ kind: 'error', message: `Unknown provider "${provider}".` });
                return;
            }

            // Reconstruct a parseable URL out of just the query so we can
            // reuse `parseCallbackUrl` (which understands the OAuth `error`
            // envelope) instead of re-implementing the param dance.
            const queryString = searchParams.toString();
            const parsed = parseCallbackUrl(`http://x.test/?${queryString}`);
            if (!parsed) {
                setStatus({
                    kind: 'error',
                    message: 'Callback URL is missing the `code` and `state` params.',
                });
                postOutcome({ provider, ok: false, error: 'missing_params' });
                return;
            }
            if ('error' in parsed) {
                const msg = parsed.description
                    ? `${parsed.error}: ${parsed.description}`
                    : parsed.error;
                setStatus({ kind: 'error', message: msg });
                postOutcome({ provider, ok: false, error: parsed.error });
                return;
            }

            setStatus({ kind: 'pending' });
            try {
                const res = await completeCallback(provider, {
                    code: parsed.code,
                    state: parsed.state,
                });
                setStatus({ kind: 'ok', providerUsername: res.providerUsername });
                postOutcome({
                    provider,
                    ok: true,
                    providerUserId: res.providerUserId,
                    providerUsername: res.providerUsername,
                });
                // Auto-close after a beat so the user sees confirmation in
                // the popup before it disappears.
                if (window.opener) {
                    setTimeout(() => window.close(), 400);
                }
            } catch (err) {
                const message = (err as Error).message ?? String(err);
                setStatus({ kind: 'error', message });
                postOutcome({ provider, ok: false, error: message });
            }
        };
        void run();
        // Only run on mount; downstream effects come via postMessage / close.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <main
            style={{
                minHeight: '100vh',
                display: 'grid',
                placeItems: 'center',
                background: 'var(--bg-surface, #111827)',
                color: 'var(--text-primary, #f8fafc)',
                padding: 24,
                fontFamily: 'system-ui, sans-serif',
            }}
        >
            <section
                style={{
                    width: 'min(420px, 100%)',
                    border: '1px solid var(--border-default, #374151)',
                    borderRadius: 12,
                    padding: 20,
                    display: 'grid',
                    gap: 12,
                    textAlign: 'center',
                }}
            >
                {status.kind === 'idle' && <p>Preparing…</p>}
                {status.kind === 'pending' && <p>Finishing OAuth link…</p>}
                {status.kind === 'ok' && (
                    <>
                        <h1 style={{ fontSize: 18, margin: 0 }}>Linked.</h1>
                        <p style={{ margin: 0, opacity: 0.85 }}>
                            {status.providerUsername
                                ? `Connected as ${status.providerUsername}.`
                                : 'Connection saved.'}{' '}
                            You can close this window if it doesn’t close on its own.
                        </p>
                    </>
                )}
                {status.kind === 'error' && (
                    <>
                        <h1 style={{ fontSize: 18, margin: 0 }}>Could not finish linking.</h1>
                        <p style={{ margin: 0, opacity: 0.85 }}>{status.message}</p>
                        <p style={{ margin: 0, opacity: 0.6, fontSize: 13 }}>
                            Close this window and try again from Settings → Account → Linked accounts.
                        </p>
                    </>
                )}
            </section>
        </main>
    );
}

const postOutcome = (
    outcome: Omit<CallbackResultMessage, 'type'>,
): void => {
    if (typeof window === 'undefined' || !window.opener) return;
    const payload: CallbackResultMessage = { type: POSTMESSAGE_TYPE, ...outcome };
    try {
        // Restrict to same-origin so a malicious page in another tab can't
        // sniff the outcome by listening from a different origin.
        window.opener.postMessage(payload, window.location.origin);
    } catch {
        /* opener may be cross-origin or closed; nothing actionable here */
    }
};

export default OAuthCallback;
