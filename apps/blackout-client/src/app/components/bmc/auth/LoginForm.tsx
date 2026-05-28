import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useStore } from 'jotai';
import { createClient } from 'matrix-js-sdk';
import type { ILoginFlowsResponse, ISSOFlow } from 'matrix-js-sdk/lib/@types/auth';
import {
    beginSsoRedirect,
    loginWithPassword,
    loginWithToken,
    type PasswordLoginIdentifier,
} from '../../../../client/auth';
import { MatrixInitError } from '../../../../client/initMatrix';
import {
    createAnonymousAccount,
    loginWithAccountNumber,
} from '../../../../client/accountNumberAuth';
import { formatAccountNumber } from '@blackout/core';
import { getMxIdLocalPart, getMxIdServer, isUserId } from '../../../utils/matrix';
import { EMAIL_REGEX } from '../../../utils/regex';
import {
    dividerLineStyle,
    dividerStyle,
    errorTextStyle,
    fieldStyle,
    inputStyle,
    linkButtonStyle,
    primaryButtonStyle,
    secondaryButtonStyle,
} from './styles';
import type { LoginFlowsState, ResolvedHomeserver } from './types';

const SSO_RETURN_KEY = 'blackout.sso.pending';
type SsoPending = { baseUrl: string };

const buildSsoRedirectUrl = (): string => {
    const url = new URL(window.location.href);
    // Strip auth callback params so delegated auth handoff cannot loop or leak
    // stale state into a new SSO request.
    url.searchParams.delete('loginToken');
    url.searchParams.delete('code');
    url.searchParams.delete('state');
    url.searchParams.delete('id_token');
    url.searchParams.delete('access_token');
    url.searchParams.delete('error');
    url.searchParams.delete('error_description');
    return url.toString();
};

const resolveLoginIdentifier = (
    username: string,
    fallbackBaseUrl: string
): { baseUrl: string; identifier: PasswordLoginIdentifier } | { error: string } => {
    const trimmed = username.trim();

    if (isUserId(trimmed)) {
        const server = getMxIdServer(trimmed);
        const localPart = getMxIdLocalPart(trimmed);
        if (!server || !localPart) {
            return { error: 'Invalid Matrix ID.' };
        }
        return {
            baseUrl: `https://${server}`,
            identifier: { type: 'm.id.user', user: localPart },
        };
    }

    if (EMAIL_REGEX.test(trimmed)) {
        return {
            baseUrl: fallbackBaseUrl,
            identifier: { type: 'm.id.thirdparty', medium: 'email', address: trimmed },
        };
    }

    return {
        baseUrl: fallbackBaseUrl,
        identifier: { type: 'm.id.user', user: trimmed },
    };
};

type LoginFormProps = {
    server: ResolvedHomeserver;
    canRegister: boolean;
    onSwitchTab: (tab: 'register' | 'reset') => void;
};

export const LoginForm = ({ server, canRegister, onSwitchTab }: LoginFormProps) => {
    const store = useStore();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [flows, setFlows] = useState<LoginFlowsState | null>(null);
    const [flowsLoading, setFlowsLoading] = useState(true);
    const [tokenLoading, setTokenLoading] = useState(false);
    // No-PII account-number signup/sign-in.
    const [accountNumberInput, setAccountNumberInput] = useState('');
    const [anonBusy, setAnonBusy] = useState(false);
    const [createdNumber, setCreatedNumber] = useState<string | null>(null);

    const handleCreateAnonymous = async () => {
        setAnonBusy(true);
        setError(null);
        try {
            setCreatedNumber(await createAnonymousAccount());
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not create an account.');
        } finally {
            setAnonBusy(false);
        }
    };

    const handleAccountNumberLogin = async (number: string) => {
        setAnonBusy(true);
        setError(null);
        try {
            await loginWithAccountNumber(store, server.baseUrl, number);
        } catch (e) {
            setError(
                e instanceof MatrixInitError || e instanceof Error
                    ? e.message
                    : 'Could not sign in with that account number.',
            );
        } finally {
            setAnonBusy(false);
        }
    };

    // Load login flows from the homeserver whenever the server changes.
    useEffect(() => {
        let cancelled = false;
        setFlowsLoading(true);
        setError(null);
        const mx = createClient({ baseUrl: server.baseUrl });
        mx.loginFlows()
            .then((response: ILoginFlowsResponse) => {
                if (cancelled) return;
                const sso = response.flows.find(
                    (f) => f.type === 'm.login.sso' || f.type === 'm.login.cas'
                ) as ISSOFlow | undefined;
                setFlows({
                    flows: response.flows,
                    sso,
                    hasPassword: response.flows.some((f) => f.type === 'm.login.password'),
                    hasToken: response.flows.some((f) => f.type === 'm.login.token'),
                });
            })
            .catch(() => {
                if (cancelled) return;
                // If discovery fails, keep token/SSO options visible so token/SSO-only
                // homeservers are still reachable.
                setFlows({
                    flows: [{ type: 'm.login.sso' }, { type: 'm.login.token' }],
                    sso: { type: 'm.login.sso' },
                    hasPassword: false,
                    hasToken: true,
                    discoveryFailed: true,
                });
            })
            .finally(() => {
                if (!cancelled) setFlowsLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [server.baseUrl]);

    // Handle SSO callback: if we land here with ?loginToken=... and a stored
    // pending entry, trade the token for a session.
    useEffect(() => {
        const url = new URL(window.location.href);
        const token = url.searchParams.get('loginToken');
        const errorCode = url.searchParams.get('error');
        const errorDescription = url.searchParams.get('error_description');

        let pending: SsoPending | null = null;
        try {
            const raw = window.sessionStorage.getItem(SSO_RETURN_KEY);
            pending = raw ? (JSON.parse(raw) as SsoPending) : null;
        } catch {
            pending = null;
        }

        if (!token) {
            // IdP denial/cancel returns without a login token.
            if (pending && errorCode) {
                const isAccessDenied = errorCode === 'access_denied';
                const message =
                    errorDescription ??
                    (isAccessDenied
                        ? 'Sign-in was cancelled at the identity provider.'
                        : `Identity provider sign-in failed (${errorCode}).`);
                setError(message);
                window.sessionStorage.removeItem(SSO_RETURN_KEY);
                url.searchParams.delete('error');
                url.searchParams.delete('error_description');
                window.history.replaceState(null, '', url.toString());
            }
            return;
        }

        const baseUrl = pending?.baseUrl ?? server.baseUrl;

        setTokenLoading(true);
        setError(null);
        loginWithToken(store, { baseUrl, token })
            .catch((err: unknown) => {
                const message =
                    err instanceof MatrixInitError
                        ? err.message
                        : err instanceof Error
                          ? err.message
                          : 'SSO login failed.';
                setError(message);
            })
            .finally(() => {
                setTokenLoading(false);
                window.sessionStorage.removeItem(SSO_RETURN_KEY);
                url.searchParams.delete('loginToken');
                window.history.replaceState(null, '', url.toString());
            });
        // We only run this on mount or if the server changes; identity of `store` is stable.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [server.baseUrl]);

    const onPasswordSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setError(null);
        const resolved = resolveLoginIdentifier(username, server.baseUrl);
        if ('error' in resolved) {
            setError(resolved.error);
            return;
        }
        setSubmitting(true);
        try {
            await loginWithPassword(store, {
                baseUrl: resolved.baseUrl,
                identifier: resolved.identifier,
                password,
            });
        } catch (err) {
            const message =
                err instanceof MatrixInitError
                    ? err.message
                    : err instanceof Error
                      ? err.message
                      : 'Sign-in failed.';
            setError(message);
        } finally {
            setSubmitting(false);
        }
    };

    const onSsoClick = (idpId?: string) => {
        try {
            window.sessionStorage.setItem(
                SSO_RETURN_KEY,
                JSON.stringify({ baseUrl: server.baseUrl } satisfies SsoPending)
            );
        } catch {
            // session storage may be blocked; SSO will still work but we'll fall
            // back to the displayed homeserver in the callback.
        }
        const redirectUrl = buildSsoRedirectUrl();
        const ssoUrl = beginSsoRedirect(server.baseUrl, redirectUrl, 'sso', idpId);
        window.location.href = ssoUrl;
    };

    const ssoIdps = useMemo(() => {
        const sso = flows?.sso;
        if (!sso || !Array.isArray(sso.identity_providers)) return [];
        return sso.identity_providers;
    }, [flows]);

    if (flowsLoading || tokenLoading) {
        return (
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary, #94a3b8)' }}>
                {tokenLoading ? 'Completing SSO sign-in…' : 'Loading sign-in options…'}
            </p>
        );
    }

    if (!flows?.hasPassword && !flows?.sso && !flows?.hasToken) {
        return (
            <p role="alert" style={errorTextStyle}>
                This homeserver does not advertise a supported sign-in method.
            </p>
        );
    }

    return (
        <div style={{ display: 'grid', gap: 12 }}>
            {flows.discoveryFailed ? (
                <p role="alert" style={errorTextStyle}>
                    Couldn’t load supported flows; try SSO or switch homeserver.
                </p>
            ) : null}

            {flows.hasToken && !flows.hasPassword && !flows.sso ? (
                <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary, #94a3b8)' }}>
                    This homeserver uses token sign-in. Start SSO from your identity provider or
                    switch homeserver.
                </p>
            ) : null}

            {error ? (
                <p role="alert" style={errorTextStyle}>
                    {error}
                </p>
            ) : null}

            {flows.hasPassword ? (
                <form
                    onSubmit={onPasswordSubmit}
                    style={{ display: 'grid', gap: 12 }}
                    aria-label="Sign in with password"
                >
                    <label style={fieldStyle}>
                        <span>Username, Matrix ID or email</span>
                        <input
                            type="text"
                            name="username"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            required
                            autoComplete="username"
                            placeholder="user / @user:example.org / user@example.org"
                            style={inputStyle}
                        />
                    </label>
                    <label style={fieldStyle}>
                        <div
                            style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'baseline',
                            }}
                        >
                            <span>Password</span>
                            <button
                                type="button"
                                onClick={() => onSwitchTab('reset')}
                                style={linkButtonStyle}
                            >
                                Forgot password?
                            </button>
                        </div>
                        <input
                            type="password"
                            name="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            autoComplete="current-password"
                            style={inputStyle}
                        />
                    </label>
                    <button type="submit" disabled={submitting} style={primaryButtonStyle}>
                        {submitting ? 'Signing in…' : 'Sign in'}
                    </button>
                </form>
            ) : null}

            {flows.hasPassword && flows.sso ? (
                <div style={dividerStyle}>
                    <span style={dividerLineStyle} />
                    <span>or</span>
                    <span style={dividerLineStyle} />
                </div>
            ) : null}

            {flows.sso ? (
                <div style={{ display: 'grid', gap: 8 }}>
                    {ssoIdps.length > 0 ? (
                        ssoIdps.map((idp) => (
                            <button
                                key={idp.id}
                                type="button"
                                onClick={() => onSsoClick(idp.id)}
                                style={secondaryButtonStyle}
                            >
                                Continue with {idp.name ?? idp.id}
                            </button>
                        ))
                    ) : (
                        <button
                            type="button"
                            onClick={() => onSsoClick()}
                            style={secondaryButtonStyle}
                        >
                            Continue with SSO
                        </button>
                    )}
                </div>
            ) : null}

            <div style={dividerStyle}>
                <span style={dividerLineStyle} />
                <span>or use an account number</span>
                <span style={dividerLineStyle} />
            </div>

            {createdNumber ? (
                <div style={{ display: 'grid', gap: 10 }}>
                    <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary, #94a3b8)' }}>
                        This is your account number — your <strong>only</strong> credential. There is
                        no email and no recovery. Save it somewhere safe before continuing.
                    </p>
                    <code
                        style={{
                            display: 'block',
                            padding: 10,
                            borderRadius: 8,
                            border: '1px solid var(--border-default, #334155)',
                            fontSize: 16,
                            letterSpacing: 1,
                            wordBreak: 'break-all',
                        }}
                    >
                        {formatAccountNumber(createdNumber)}
                    </code>
                    <button
                        type="button"
                        disabled={anonBusy}
                        onClick={() => void handleAccountNumberLogin(createdNumber)}
                        style={primaryButtonStyle}
                    >
                        {anonBusy ? 'Signing in…' : "I've saved it — sign in"}
                    </button>
                </div>
            ) : (
                <div style={{ display: 'grid', gap: 8 }}>
                    <button
                        type="button"
                        disabled={anonBusy}
                        onClick={() => void handleCreateAnonymous()}
                        style={secondaryButtonStyle}
                    >
                        {anonBusy ? 'Creating…' : 'Create an anonymous account (no email)'}
                    </button>
                    <form
                        onSubmit={(e) => {
                            e.preventDefault();
                            void handleAccountNumberLogin(accountNumberInput);
                        }}
                        style={{ display: 'grid', gap: 8 }}
                        aria-label="Sign in with account number"
                    >
                        <input
                            type="text"
                            name="account-number"
                            value={accountNumberInput}
                            onChange={(e) => setAccountNumberInput(e.target.value)}
                            autoComplete="off"
                            placeholder="Account number"
                            style={inputStyle}
                        />
                        <button
                            type="submit"
                            disabled={anonBusy || accountNumberInput.trim().length === 0}
                            style={secondaryButtonStyle}
                        >
                            Sign in with account number
                        </button>
                    </form>
                </div>
            )}

            {canRegister ? (
                <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary, #94a3b8)' }}>
                    New to {server.serverName}?{' '}
                    <button
                        type="button"
                        onClick={() => onSwitchTab('register')}
                        style={linkButtonStyle}
                    >
                        Create an account
                    </button>
                </p>
            ) : (
                <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary, #94a3b8)' }}>
                    Account creation is disabled on {server.serverName}. Contact your server admin.
                </p>
            )}
        </div>
    );
};
