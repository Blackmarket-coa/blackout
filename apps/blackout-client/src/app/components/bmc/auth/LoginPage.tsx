import { useEffect, useState } from 'react';
import { defaultHomeserverFromConfig, loadClientConfig, resolveHomeserver } from './homeserver';
import { LoginForm } from './LoginForm';
import { RegisterForm } from './RegisterForm';
import { ResetPasswordForm } from './ResetPasswordForm';
import { ServerPicker } from './ServerPicker';
import { errorTextStyle, tabBarStyle, tabStyle } from './styles';
import type { AuthTab, ResolvedHomeserver } from './types';

const FALLBACK_HOMESERVER_HOST = 'matrix.theblackout.app';

const initialTab = (): AuthTab => {
    try {
        const params = new URLSearchParams(window.location.search);
        if (params.get('loginToken')) return 'login';
    } catch {
        // ignore
    }
    return 'login';
};

const tabLabel: Record<AuthTab, string> = {
    login: 'Sign in',
    register: 'Create account',
    reset: 'Reset password',
};

export const LoginPage = () => {
    const [server, setServer] = useState<ResolvedHomeserver | null>(null);
    const [bootstrapError, setBootstrapError] = useState<string | null>(null);
    const [tab, setTab] = useState<AuthTab>(initialTab());

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

    return (
        <div style={{ display: 'grid', gap: 16 }}>
            <ServerPicker
                server={server}
                onChange={(next) => {
                    setServer(next);
                    setTab('login');
                }}
            />
            <div style={tabBarStyle} role="tablist">
                {(['login', 'register', 'reset'] as const).map((t) => (
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
                <LoginForm server={server} onSwitchTab={(next) => setTab(next)} />
            ) : null}
            {tab === 'register' ? (
                <RegisterForm server={server} onSwitchTab={(next) => setTab(next)} />
            ) : null}
            {tab === 'reset' ? (
                <ResetPasswordForm server={server} onSwitchTab={(next) => setTab(next)} />
            ) : null}
        </div>
    );
};
