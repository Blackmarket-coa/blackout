/* eslint-disable import/first */
import React from 'react';
import ReactDOM from 'react-dom/client';
import { enableMapSet } from 'immer';
import '@fontsource/inter/variable.css';
import 'folds/dist/style.css';
import { configClass, varsClass } from 'folds';
import { useAtomValue } from 'jotai';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { Provider as JotaiProvider } from 'jotai';
import { ThemeProvider } from './app/components/ThemeProvider';
import { MatrixBootstrapper } from './app/components/bmc/MatrixBootstrapper';
import { LoginForm } from './app/components/bmc/LoginForm';
import { RuntimeSettingsBridge } from './app/components/RuntimeSettingsBridge';
import { authStateAtom, cryptoInitErrorAtom } from './app/state/bmc-auth';
import GlobalHeaderInboxLauncher from './app/features/navigation/GlobalHeaderInboxLauncher';
import './index.css';
import './app/styles/theme.css.ts';
import './app/i18n';
import ClientLayout from './app/pages/client/ClientLayout';
import { DraupnirRoutePage } from './app/features/moderation/draupnir';
import { trimTrailingSlash } from './app/utils/common';
import { pushSessionToSW } from './sw-session';
import { getFallbackSession } from './app/state/sessions';

enableMapSet();
document.body.classList.add(configClass, varsClass);

if ('serviceWorker' in navigator) {
    const swUrl =
        import.meta.env.MODE === 'production'
            ? `${trimTrailingSlash(import.meta.env.BASE_URL)}/sw.js`
            : '/dev-sw.js?dev-sw';

    const sendSessionToSW = () => {
        const session = getFallbackSession();
        pushSessionToSW(session?.baseUrl, session?.accessToken);
    };

    navigator.serviceWorker.register(swUrl).then(sendSessionToSW);
    navigator.serviceWorker.ready.then(sendSessionToSW);

    navigator.serviceWorker.addEventListener('message', (ev) => {
        const { type } = ev.data ?? {};

        if (type === 'requestSession') {
            sendSessionToSW();
        }
    });
}

const queryClient = new QueryClient();

const router = createBrowserRouter([
    {
        path: '/',
        element: <ClientLayout />,
    },
    {
        path: '/room/:roomId',
        element: <ClientLayout />,
    },
    {
        path: '/moderation/draupnir',
        element: <DraupnirRoutePage />,
    },
]);

// eslint-disable-next-line react-refresh/only-export-components
const BootstrapStatus = () => {
    const authState = useAtomValue(authStateAtom);
    const cryptoInitError = useAtomValue(cryptoInitErrorAtom);

    if (authState === 'logged_in') {
        return (
            <>
                <GlobalHeaderInboxLauncher />
                <RouterProvider router={router} />
            </>
        );
    }

    const title =
        authState === 'crypto_initializing'
            ? 'Initializing secure crypto…'
            : authState === 'crypto_failed'
            ? 'Secure crypto unavailable'
            : authState === 'loading'
            ? 'Restoring session…'
            : 'Signed out';

    const details =
        authState === 'crypto_failed'
            ? cryptoInitError ?? 'Unable to initialize secure crypto features.'
            : authState === 'logged_out'
            ? 'Sign in to start syncing with Matrix.'
            : 'Please wait while startup completes.';

    return (
        <main
            style={{
                minHeight: '100vh',
                display: 'grid',
                placeItems: 'center',
                background: 'var(--bg-surface, #111827)',
                color: 'var(--text-primary, #f8fafc)',
                padding: 24,
            }}
        >
            <section
                style={{
                    width: 'min(560px, 100%)',
                    border: '1px solid var(--border-default, #374151)',
                    borderRadius: 12,
                    background: 'var(--bg-input, #0f172a)',
                    padding: 20,
                    display: 'grid',
                    gap: 12,
                }}
            >
                <h1 style={{ margin: 0, fontSize: 20 }}>{title}</h1>
                <p style={{ margin: 0, opacity: 0.9 }}>{details}</p>
                {authState === 'logged_out' ? <LoginForm /> : null}
                {authState === 'crypto_failed' ? (
                    <button
                        type="button"
                        onClick={() => window.location.reload()}
                        style={{
                            width: 'fit-content',
                            borderRadius: 8,
                            border: '1px solid var(--border-default, #4b5563)',
                            background: 'var(--bg-nav, #1f2937)',
                            color: 'var(--text-primary, #f8fafc)',
                            padding: '8px 12px',
                            cursor: 'pointer',
                        }}
                    >
                        Retry startup
                    </button>
                ) : null}
            </section>
        </main>
    );
};

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <React.StrictMode>
        <JotaiProvider>
            <ThemeProvider>
                <RuntimeSettingsBridge />
                <MatrixBootstrapper />
                <QueryClientProvider client={queryClient}>
                    <BootstrapStatus />
                </QueryClientProvider>
            </ThemeProvider>
        </JotaiProvider>
    </React.StrictMode>
);
