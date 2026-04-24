import { useEffect, useState, type FormEvent } from 'react';
import { useAtom, useStore } from 'jotai';
import { loginWithPassword, type PasswordLoginIdentifier } from '../../../client/auth';
import { MatrixInitError } from '../../../client/initMatrix';
import { loginErrorAtom } from '../../state/bmc-auth';
import { getMxIdLocalPart, getMxIdServer, isUserId } from '../../utils/matrix';
import { EMAIL_REGEX } from '../../utils/regex';

const FALLBACK_HOMESERVER_URL =
    (import.meta.env.VITE_MATRIX_HOMESERVER_URL as string | undefined) ??
    'https://matrix.theblackout.app';

type RuntimeClientConfig = {
    defaultHomeserver?: number;
    homeserverList?: string[];
};

const loadDefaultHomeserver = async (): Promise<string> => {
    try {
        const response = await fetch('/config.json', { cache: 'no-cache' });
        if (!response.ok) return FALLBACK_HOMESERVER_URL;
        const cfg = (await response.json()) as RuntimeClientConfig;
        const host = cfg.homeserverList?.[cfg.defaultHomeserver ?? 0];
        return host ? `https://${host}` : FALLBACK_HOMESERVER_URL;
    } catch {
        return FALLBACK_HOMESERVER_URL;
    }
};

const resolveLogin = (
    username: string,
    baseUrl: string
): { baseUrl: string; identifier: PasswordLoginIdentifier } | { error: string } => {
    const trimmed = username.trim();

    // Full Matrix ID: @user:server — use the server from the mxid as baseUrl.
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

    // Email identifier.
    if (EMAIL_REGEX.test(trimmed)) {
        return {
            baseUrl,
            identifier: { type: 'm.id.thirdparty', medium: 'email', address: trimmed },
        };
    }

    // Plain username on the selected homeserver.
    return {
        baseUrl,
        identifier: { type: 'm.id.user', user: trimmed },
    };
};

export const LoginForm = () => {
    const store = useStore();
    const [baseUrl, setBaseUrl] = useState(FALLBACK_HOMESERVER_URL);
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useAtom(loginErrorAtom);

    useEffect(() => {
        let cancelled = false;
        void loadDefaultHomeserver().then((url) => {
            if (!cancelled) setBaseUrl((prev) => (prev === FALLBACK_HOMESERVER_URL ? url : prev));
        });
        return () => {
            cancelled = true;
        };
    }, []);

    const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setError(null);
        const resolved = resolveLogin(username, baseUrl.trim());
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

    const fieldStyle: React.CSSProperties = {
        display: 'grid',
        gap: 4,
        fontSize: 13,
    };
    const inputStyle: React.CSSProperties = {
        background: 'var(--bg-surface, #0b0f1a)',
        color: 'var(--text-primary, #f8fafc)',
        border: '1px solid var(--border-default, #374151)',
        borderRadius: 6,
        padding: '8px 10px',
        fontSize: 14,
    };

    return (
        <form
            onSubmit={onSubmit}
            style={{ display: 'grid', gap: 12 }}
            aria-label="Sign in to Matrix"
        >
            <label style={fieldStyle}>
                <span>Homeserver URL</span>
                <input
                    type="url"
                    name="baseUrl"
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    required
                    autoComplete="url"
                    style={inputStyle}
                />
            </label>
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
                <span>Password</span>
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
            {error ? (
                <p role="alert" style={{ margin: 0, color: '#fca5a5', fontSize: 13 }}>
                    {error}
                </p>
            ) : null}
            <button
                type="submit"
                disabled={submitting}
                style={{
                    width: 'fit-content',
                    borderRadius: 8,
                    border: '1px solid var(--border-default, #4b5563)',
                    background: 'var(--bg-nav, #1f2937)',
                    color: 'var(--text-primary, #f8fafc)',
                    padding: '8px 14px',
                    cursor: submitting ? 'progress' : 'pointer',
                    opacity: submitting ? 0.7 : 1,
                }}
            >
                {submitting ? 'Signing in…' : 'Sign in'}
            </button>
        </form>
    );
};
