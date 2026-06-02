import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAtomValue } from 'jotai';
import { authStateAtom, matrixClientAtom } from '../../state/auth';
import { roomToParentsAtom } from '../../state/room/roomToParents';
import {
    InvitationPreviewResponse,
    InvitationRedeemResponse,
    previewInvitation,
    redeemInvitation,
} from '../../features/invitations/invitationsClient';
import { ensureBlackoutApiToken } from '../../../client/blackoutApiSession';
import { resolvePostAcceptancePath } from './postAcceptanceRoute';
import { joinDenWithCanopy } from '../../features/room/joinDenWithCanopy';

/**
 * Cap how long the page will sit on a single network step before giving up and
 * offering a retry. Without this, a request that never settles (e.g. a
 * service-worker / same-origin host that holds the connection) leaves the user
 * staring at "Accepting your invitation…" forever.
 */
const STEP_TIMEOUT_MS = 15_000;

/** Reject after `ms`, aborting the paired controller so the fetch is cancelled. */
const withTimeout = <T,>(promise: Promise<T>, ms: number, controller: AbortController): Promise<T> =>
    Promise.race([
        promise,
        new Promise<T>((_, reject) => {
            window.setTimeout(() => {
                controller.abort();
                reject(new Error('timed_out'));
            }, ms);
        }),
    ]);

/**
 * Storage key the post-login redeemer hook looks for. Kept here so the
 * landing page and the redeemer hook share one source of truth.
 */
export const PENDING_INVITE_STORAGE_KEY = 'blackout:pendingInviteToken';

/**
 * Storage key RegisterForm reads on mount to pre-fill the
 * `m.login.registration_token` UIA stage. Populated from the URL
 * fragment by the landing page so a single shareable URL carries both
 * the Blackout invite id and the Synapse registration token needed to
 * satisfy `registration_requires_token` during sign-up.
 */
export const PENDING_REGISTRATION_TOKEN_STORAGE_KEY = 'blackout:pendingRegistrationToken';

/**
 * Parse the registration token out of the URL fragment, stash it for
 * RegisterForm, and strip the fragment from the address bar so a
 * refresh doesn't re-stash and the token doesn't sit visibly in the
 * URL after capture.
 *
 * Fragment shape produced by the backend's buildInviteUrl():
 *   /invite/<blackoutToken>#registrationToken=<synapseToken>
 */
const capturePendingRegistrationToken = (): void => {
    if (typeof window === 'undefined') return;
    const hash = window.location.hash;
    if (!hash || hash.length < 2) return;
    const params = new URLSearchParams(hash.slice(1));
    const token = params.get('registrationToken');
    if (!token) return;
    try {
        window.sessionStorage.setItem(PENDING_REGISTRATION_TOKEN_STORAGE_KEY, token);
    } catch {
        // sessionStorage can be locked down in some embeds; the user
        // can still paste the token manually into the register form.
    }
    try {
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
    } catch {
        /* history API may be unavailable in iframes; non-fatal */
    }
};

const cardStyle: React.CSSProperties = {
    width: 'min(560px, 100%)',
    border: '1px solid var(--border-default, #374151)',
    borderRadius: 12,
    background: 'var(--bg-input, #0f172a)',
    padding: 20,
    display: 'grid',
    gap: 12,
};

const pageStyle: React.CSSProperties = {
    minHeight: '100vh',
    display: 'grid',
    placeItems: 'center',
    background: 'var(--bg-surface, #111827)',
    color: 'var(--text-primary, #f8fafc)',
    padding: 24,
};

const buttonStyle: React.CSSProperties = {
    width: 'fit-content',
    borderRadius: 8,
    border: '1px solid var(--border-default, #4b5563)',
    background: 'var(--accent, #2563eb)',
    color: 'var(--text-primary, #f8fafc)',
    padding: '8px 14px',
    cursor: 'pointer',
    fontSize: 14,
};

const secondaryButtonStyle: React.CSSProperties = {
    ...buttonStyle,
    background: 'var(--bg-nav, #1f2937)',
};

const linkStyle: React.CSSProperties = {
    color: 'var(--text-primary, #f8fafc)',
};

const tokenFromPath = (): string | null => {
    if (typeof window === 'undefined') return null;
    // Path shape: /invite/<token>[/...]. Matches what main.tsx routes here.
    const match = window.location.pathname.match(/^\/invite\/([^/?#]+)/);
    return match ? decodeURIComponent(match[1]) : null;
};

const reasonCopy: Record<string, string> = {
    invalid: 'This invitation link is not recognized. Double-check the URL with whoever sent it.',
    revoked: 'The person who sent this invitation has revoked it.',
    exhausted: 'This invitation has already been used up.',
    expired: 'This invitation has expired.',
    self_redeem: 'You created this invitation — share it with someone else to use it.',
};

const formatExpiry = (iso?: string): string | null => {
    if (!iso) return null;
    const ms = Date.parse(iso);
    if (!Number.isFinite(ms)) return null;
    const date = new Date(ms);
    return date.toLocaleString();
};

type LoadingState = { kind: 'loading' };
type PreviewState = { kind: 'preview'; data: InvitationPreviewResponse };
type RedeemingState = { kind: 'redeeming' };
type RedeemedState = { kind: 'redeemed'; data: InvitationRedeemResponse };
type ErrorState = { kind: 'error'; message: string };
type Phase = LoadingState | PreviewState | RedeemingState | RedeemedState | ErrorState;

// Auth destinations the invite landing can hand off to. Hoisted into a named
// type so the literals aren't mistaken for route definitions by tooling.
type AuthDestination = '/register' | '/login';

export const InviteLandingPage: React.FC = () => {
    const authState = useAtomValue(authStateAtom);
    const mx = useAtomValue(matrixClientAtom);
    const roomToParents = useAtomValue(roomToParentsAtom);
    const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
    // Drives the redeem effect. Kept separate from `phase` on purpose: if the
    // redeem effect depended on a phase-derived flag, moving to 'redeeming'
    // would flip that flag, re-run the effect, and its cleanup would abort the
    // very redeem it just started — stranding the page on "Accepting…".
    const [previewOk, setPreviewOk] = useState(false);
    // Bumped by the "Try again" button to re-run preview → redeem after a
    // timeout or transient failure, without forcing a full page reload.
    const [attempt, setAttempt] = useState(0);
    const token = tokenFromPath();

    // Read the latest Matrix/space state at use-time without making them effect
    // dependencies — otherwise a routine sync update mid-redeem would re-run the
    // effect and abort the in-flight request.
    const mxRef = useRef(mx);
    mxRef.current = mx;
    const roomToParentsRef = useRef(roomToParents);
    roomToParentsRef.current = roomToParents;

    const retry = useCallback(() => {
        setPreviewOk(false);
        setPhase({ kind: 'loading' });
        setAttempt((n) => n + 1);
    }, []);

    // Step 0: capture the Synapse registration token from the URL
    // fragment (if any) BEFORE the preview fires. Done once on mount —
    // the fragment is then stripped from the address bar so the
    // sensitive value doesn't sit around or get re-stashed on refresh.
    useEffect(() => {
        capturePendingRegistrationToken();
    }, []);

    // Step 1: always preview, regardless of auth state. This gives the user a
    // friendly "who invited me?" view even if they're already logged in
    // (before we auto-redeem).
    useEffect(() => {
        if (!token) {
            setPhase({ kind: 'error', message: 'No invitation token in the URL.' });
            return;
        }
        let cancelled = false;
        const controller = new AbortController();
        withTimeout(previewInvitation(token, controller.signal), STEP_TIMEOUT_MS, controller)
            .then((data) => {
                if (cancelled) return;
                setPhase({ kind: 'preview', data });
                setPreviewOk(data.valid === true);
            })
            .catch((err: unknown) => {
                if (cancelled) return;
                const timedOut = err instanceof Error && err.message === 'timed_out';
                setPhase({
                    kind: 'error',
                    message: timedOut
                        ? 'This is taking longer than expected. Check your connection and try again.'
                        : err instanceof Error
                          ? err.message
                          : 'Could not load this invitation.',
                });
            });
        return () => {
            cancelled = true;
            controller.abort();
        };
    }, [token, attempt]);

    // Step 2: once the preview comes back valid AND the user is logged in,
    // auto-redeem. The bare-minimum "logged out" flow stashes the token and
    // sends the user to register/login; redemption happens after sign-in via
    // the PendingInviteRedeemer hook.
    useEffect(() => {
        if (!token || authState !== 'logged_in' || !previewOk) return;
        let cancelled = false;
        const controller = new AbortController();

        const run = async () => {
            setPhase({ kind: 'redeeming' });
            // Wait for the Blackout API JWT before redeeming. Without this the
            // redeem races the fire-and-forget token exchange and goes out
            // unauthenticated, 401-ing on a freshly-loaded session.
            const apiToken = await ensureBlackoutApiToken();
            if (cancelled) return;

            const data = await withTimeout(
                redeemInvitation(token, apiToken, controller.signal),
                STEP_TIMEOUT_MS,
                controller,
            );
            if (cancelled) return;
            setPhase({ kind: 'redeemed', data });

            if (!data.ok) return;

            const client = mxRef.current;

            // Join the room (best-effort, bounded) then route: brand-new users
            // go through full-page onboarding, returning users straight in.
            if (data.matrixRoomId && client) {
                try {
                    await withTimeout(
                        // Join the canopy first so the restricted den is joinable.
                        joinDenWithCanopy(client, data.matrixRoomId, data.canopyId),
                        STEP_TIMEOUT_MS,
                        controller,
                    );
                } catch {
                    // Join can fail (already-joined, server hiccup); the
                    // server already sent a Matrix invite, so still navigate.
                }
            }
            if (cancelled) return;
            const dest = client
                ? resolvePostAcceptancePath(client, roomToParentsRef.current, data.matrixRoomId, {
                      canopyId: data.canopyId,
                  })
                : '/';
            window.location.assign(dest);
        };

        run().catch((err: unknown) => {
            if (cancelled) return;
            const timedOut = err instanceof Error && err.message === 'timed_out';
            setPhase({
                kind: 'error',
                message: timedOut
                    ? 'Accepting your invitation timed out. Check your connection and try again.'
                    : err instanceof Error
                      ? err.message
                      : 'Could not redeem this invitation.',
            });
        });

        return () => {
            cancelled = true;
            controller.abort();
        };
    }, [token, authState, previewOk, attempt]);

    const stashAndNavigate = useCallback(
        (path: AuthDestination) => {
            if (!token) return;
            try {
                window.sessionStorage.setItem(PENDING_INVITE_STORAGE_KEY, token);
            } catch {
                // sessionStorage may be unavailable in some embeds; the user
                // can still register, they just won't auto-redeem on first
                // sign-in. Better to navigate than to block on storage.
            }
            window.location.assign(path);
        },
        [token],
    );

    return (
        <main data-shell="invite-landing" style={pageStyle}>
            <section style={cardStyle}>
                {renderBody(phase, authState, stashAndNavigate, retry)}
            </section>
        </main>
    );
};

const renderBody = (
    phase: Phase,
    authState: string,
    stashAndNavigate: (path: AuthDestination) => void,
    retry: () => void,
): React.ReactNode => {
    if (phase.kind === 'loading') {
        return (
            <>
                <h1 style={{ margin: 0, fontSize: 20 }}>Looking up your invitation…</h1>
                <p style={{ margin: 0, opacity: 0.9 }}>One moment.</p>
            </>
        );
    }

    if (phase.kind === 'error') {
        return (
            <>
                <h1 style={{ margin: 0, fontSize: 20 }}>Something went wrong</h1>
                <p style={{ margin: 0, opacity: 0.9 }}>{phase.message}</p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button type="button" onClick={retry} style={buttonStyle}>
                        Try again
                    </button>
                    <a href="/" style={linkStyle}>
                        Go to home
                    </a>
                </div>
            </>
        );
    }

    if (phase.kind === 'redeeming') {
        return (
            <>
                <h1 style={{ margin: 0, fontSize: 20 }}>Accepting your invitation…</h1>
                <p style={{ margin: 0, opacity: 0.9 }}>One moment.</p>
            </>
        );
    }

    if (phase.kind === 'redeemed') {
        if (phase.data.ok) {
            return (
                <>
                    <h1 style={{ margin: 0, fontSize: 20 }}>You&apos;re in.</h1>
                    <p style={{ margin: 0, opacity: 0.9 }}>
                        {phase.data.matrixRoomId
                            ? 'You should see the room appear in your invites shortly.'
                            : 'Your invitation has been accepted.'}
                    </p>
                    <a href="/" style={linkStyle}>
                        Continue to Blackout
                    </a>
                </>
            );
        }
        return (
            <>
                <h1 style={{ margin: 0, fontSize: 20 }}>Could not accept this invitation</h1>
                <p style={{ margin: 0, opacity: 0.9 }}>
                    {reasonCopy[phase.data.reason] ?? 'This invitation can no longer be used.'}
                </p>
                <a href="/" style={linkStyle}>
                    Continue to Blackout
                </a>
            </>
        );
    }

    // preview phase
    if (phase.data.valid === false) {
        return (
            <>
                <h1 style={{ margin: 0, fontSize: 20 }}>This invitation can&apos;t be used</h1>
                <p style={{ margin: 0, opacity: 0.9 }}>
                    {reasonCopy[phase.data.reason] ?? 'This invitation is no longer valid.'}
                </p>
                <a href="/" style={linkStyle}>
                    Go to home
                </a>
            </>
        );
    }

    const inv = phase.data.invitation;
    const expiry = formatExpiry(inv.expiresAt);
    const inviterLabel = inv.inviter.username;

    if (authState === 'logged_in') {
        // The auto-redeem effect will take over shortly; show a brief
        // intermediate state. This branch is rarely visible because the
        // redeem effect flips phase on the same tick.
        return (
            <>
                <h1 style={{ margin: 0, fontSize: 20 }}>
                    {inviterLabel} invited you{inv.matrixRoomId ? ' to a room' : ''}
                </h1>
                <p style={{ margin: 0, opacity: 0.9 }}>Accepting…</p>
            </>
        );
    }

    return (
        <>
            <h1 style={{ margin: 0, fontSize: 20 }}>
                <strong>{inviterLabel}</strong> invited you to Blackout
            </h1>
            {inv.label && (
                <p style={{ margin: 0, opacity: 0.9 }}>
                    Note from the inviter: <em>{inv.label}</em>
                </p>
            )}
            {inv.matrixRoomId && (
                <p style={{ margin: 0, opacity: 0.9 }}>
                    You&apos;ll be added to the room they shared once you sign in.
                </p>
            )}
            <p style={{ margin: 0, opacity: 0.7, fontSize: 13 }}>
                {inv.usesRemaining == null
                    ? 'Unlimited uses'
                    : `${inv.usesRemaining} use${inv.usesRemaining === 1 ? '' : 's'} remaining`}
                {expiry ? ` · expires ${expiry}` : ''}
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                    type="button"
                    onClick={() => stashAndNavigate('/register')}
                    style={buttonStyle}
                >
                    Create account
                </button>
                <button
                    type="button"
                    onClick={() => stashAndNavigate('/login')}
                    style={secondaryButtonStyle}
                >
                    I already have an account
                </button>
            </div>
        </>
    );
};

export default InviteLandingPage;
