import { useEffect, useRef, useState } from 'react';
import {
    defaultHomeserverFromConfig,
    loadClientConfig,
    resolveHomeserver,
    useRegistrationProbe,
} from './homeserver';
import { LoginForm } from './LoginForm';
import { RegisterForm } from './RegisterForm';
import { ResetPasswordForm } from './ResetPasswordForm';
import { ServerPicker } from './ServerPicker';
import { errorTextStyle, tabBarStyle, tabStyle } from './styles';
import type { AuthTab, ResolvedHomeserver } from './types';

const FALLBACK_HOMESERVER_HOST = 'matrix.theblackout.app';

const TAB_PATHS: Record<AuthTab, string> = {
    login: '/login',
    register: '/register',
    reset: '/reset-password',
};

const tabFromPathname = (pathname: string): AuthTab => {
    if (pathname.startsWith('/register')) return 'register';
    if (pathname.startsWith('/reset-password')) return 'reset';
    return 'login';
};

const initialTab = (): AuthTab => {
    try {
        const params = new URLSearchParams(window.location.search);
        // An SSO callback always lands on the login tab regardless of which
        // path it returned to, so the token can be consumed.
        if (params.get('loginToken')) return 'login';
        return tabFromPathname(window.location.pathname);
    } catch {
        return 'login';
    }
};

const tabLabel: Record<AuthTab, string> = {
    login: 'Sign in',
    register: 'Create account',
    reset: 'Reset password',
};

export const LoginPage = () => {
    const [server, setServer] = useState<ResolvedHomeserver | null>(null);
    const [bootstrapError, setBootstrapError] = useState<string | null>(null);
    const [tab, setTabState] = useState<AuthTab>(initialTab());
    // Captured once at mount so the "signups disabled" notice still renders
    // after we `replaceState` the URL back to /login.
    const startedOnRegisterRef = useRef(initialTab() === 'register');
    // The probe POSTs an empty body to /register, which by Matrix UIA spec
    // is answered with 401 + flow data. Browsers render that 401 in the
    // network panel, so we only probe once the user actually heads to the
    // register surface (clicked the tab, or landed on /register directly).
    const probeServer = tab === 'register' || startedOnRegisterRef.current ? server : null;
    const registrationProbe = useRegistrationProbe(probeServer);
    const registrationAvailability = registrationProbe.state;

    // Keep the URL in sync with the active tab so links to `/register` work
    // and users can copy/share the active surface. `replaceState` avoids
    // adding history entries for every tab click.
    const setTab = (next: AuthTab) => {
        setTabState(next);
        try {
            const targetPath = TAB_PATHS[next];
            if (window.location.pathname !== targetPath) {
                const url = new URL(window.location.href);
                url.pathname = targetPath;
                window.history.replaceState(null, '', url.toString());
            }
        } catch {
            // history API unavailable (tests, embedded webviews) — ignore.
        }
    };

    // When `/register` was requested but the homeserver rejects signups,
    // fall back to the login tab + show an inline notice rather than
    // letting the user fill out a form that will never succeed.
    const registrationDisabled = registrationAvailability === 'disabled';
    useEffect(() => {
        if (tab === 'register' && registrationDisabled) {
            setTab('login');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [registrationDisabled]);

    useEffect(() => {
        let cancelled = false;
        const bootstrap = async () => {
            try {
                const cfg = await loadClientConfig();
                const host = defaultHomeserverFromConfig(cfg) || FALLBACK_HOMESERVER_HOST;
                const resolved = await resolveHomeserver(host);
                if (!cancelled) setServer(resolved);
            } catch (e) {
                if (cancelled) return;
                setBootstrapError(
                    e instanceof Error
                        ? e.message
                        : 'Could not connect to the default homeserver.'
                );
            }
        };
        void bootstrap();
        return () => {
            cancelled = true;
        };
    }, []);

    if (bootstrapError && !server) {
        return (
            <div style={{ display: 'grid', gap: 12 }}>
                <p role="alert" style={errorTextStyle}>
                    {bootstrapError}
                </p>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary, #94a3b8)' }}>
                    Try a different homeserver below.
                </p>
                <ServerPicker
                    server={{
                        rawInput: FALLBACK_HOMESERVER_HOST,
                        serverName: FALLBACK_HOMESERVER_HOST,
                        baseUrl: `https://${FALLBACK_HOMESERVER_HOST}`,
                    }}
                    onChange={(next) => {
                        setServer(next);
                        setBootstrapError(null);
                    }}
                />
            </div>
        );
    }

    if (!server) {
        return (
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary, #94a3b8)' }}>
                Connecting to homeserver…
            </p>
        );
    }

    const tabs: AuthTab[] = registrationDisabled
        ? ['login', 'reset']
        : ['login', 'register', 'reset'];
    const showRegistrationDisabledNotice =
        registrationDisabled && startedOnRegisterRef.current;

    return (
        <div style={{ display: 'grid', gap: 16 }}>
            <ServerPicker
                server={server}
                onChange={(next) => {
                    setServer(next);
                    setTab('login');
                }}
            />
            {showRegistrationDisabledNotice ? (
                <p
                    role="status"
                    data-testid="registration-disabled-notice"
                    style={{
                        margin: 0,
                        fontSize: 13,
                        color: 'var(--text-secondary, #94a3b8)',
                        border: '1px solid var(--border-default, #374151)',
                        borderRadius: 6,
                        padding: '8px 10px',
                    }}
                >
                    New signups are disabled on {server.serverName}. Sign in below if you
                    already have an account.
                </p>
            ) : null}
            <div style={tabBarStyle} role="tablist">
                {tabs.map((t) => (
                    <button
                        key={t}
                        type="button"
                        role="tab"
                        aria-selected={tab === t}
                        onClick={() => setTab(t)}
                        style={tabStyle(tab === t)}
                    >
                        {tabLabel[t]}
                    </button>
                ))}
            </div>
            {tab === 'login' ? (
                <LoginForm
                    server={server}
                    canRegister={!registrationDisabled}
                    onSwitchTab={(next) => setTab(next)}
                />
            ) : null}
            {tab === 'register' ? (
                <RegisterForm
                    server={server}
                    onSwitchTab={(next) => setTab(next)}
                    probe={registrationProbe}
                />
            ) : null}
            {tab === 'reset' ? (
                <ResetPasswordForm server={server} onSwitchTab={(next) => setTab(next)} />
            ) : null}
        </div>
    );
};
