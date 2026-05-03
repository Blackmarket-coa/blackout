/* eslint-disable import/first */
import React from 'react';
import ReactDOM from 'react-dom/client';
import { enableMapSet } from 'immer';
import '@fontsource/inter/variable.css';
import 'folds/dist/style.css';
import { configClass, varsClass } from 'folds';
import { useAtomValue } from 'jotai';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createBrowserRouter, Outlet, RouterProvider } from 'react-router-dom';
import { Provider as JotaiProvider } from 'jotai';
import { ThemeProvider } from './app/components/ThemeProvider';
import { MatrixBootstrapper } from './app/components/bmc/MatrixBootstrapper';
import { LoginPage } from './app/components/bmc/auth';
import { RuntimeSettingsBridge } from './app/components/RuntimeSettingsBridge';
import { authStateAtom, cryptoInitErrorAtom } from './app/state/bmc-auth';
import { capabilityContextAtom } from './app/core/features/capabilityContext';
import {
    buildCapabilityContextValue,
    resolveDevCapabilitySeed,
} from './app/core/features/capabilityHydration';
import { runtimeFeatureFlags } from './app/core/features/featureFlags';
import { buildRegistryRouteObjects } from './app/core/features/RegistryRouteList';
import { RegistryFetcherProvider } from './app/core/features/RegistryFetcherProvider';
import { buildRegistryFetchers } from './app/core/features/registryFetchers';
import { createFetchApiClient } from '@blackout/sdk';
import { useStore } from 'jotai';
import './index.css';
import './app/styles/theme.css.ts';
import './app/i18n';
import ClientLayout from './app/pages/client/ClientLayout';
import { DraupnirRoutePage } from './app/features/moderation/draupnir';
import { trimTrailingSlash } from './app/utils/common';
import { pushSessionToSW } from './sw-session';
import { getFallbackSession } from './app/state/sessions';
import { initDesktopBridge } from './platform/initDesktopBridge';
import { LifecycleSyncBroker } from './platform/LifecycleSyncBroker';
import { NativeBridgeListener } from './platform/NativeBridgeListener';
import { NotificationTokenBroker } from './platform/NotificationTokenBroker';
import { UnreadCountBroadcaster } from './platform/UnreadCountBroadcaster';

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

/**
 * Production fetcher bag — built once at boot from the canonical
 * `ApiClient`. The base URL is read from `import.meta.env.VITE_BLACKOUT_API_BASE`
 * when present; otherwise calls go through the page's relative URL
 * (matches the existing dev proxy setup). Hydration token wiring is
 * deferred to a future bootstrap pass; the headers slot is open for it.
 */
const apiBaseUrl =
    typeof import.meta !== 'undefined'
        ? ((import.meta as { env?: Record<string, string | undefined> }).env
              ?.VITE_BLACKOUT_API_BASE ?? undefined)
        : undefined;
const apiClient = createFetchApiClient({ baseUrl: apiBaseUrl });
const registryFetchers = buildRegistryFetchers(apiClient);

void initDesktopBridge();

// eslint-disable-next-line react-refresh/only-export-components
const DevCapabilitySeeder = () => {
    const store = useStore();
    React.useEffect(() => {
        const env = (import.meta.env ?? {}) as Record<string, string | undefined>;
        const devSeed = resolveDevCapabilitySeed(env);
        if (devSeed.length === 0) return;
        const current = store.get(capabilityContextAtom);
        const next = buildCapabilityContextValue({
            fetched: current.capabilities,
            devSeed,
            flags: runtimeFeatureFlags,
        });
        store.set(capabilityContextAtom, next);
    }, [store]);
    return null;
};

const RouterRoot = () => (
    <>
        <NativeBridgeListener />
        <Outlet />
    </>
);

const buildAppRouter = (capabilityContext: {
    capabilities: string[];
    flags: Record<string, boolean>;
}) =>
    createBrowserRouter([
        {
            element: <RouterRoot />,
            children: [
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
                ...buildRegistryRouteObjects({
                    capabilities: capabilityContext.capabilities,
                    flags: capabilityContext.flags as never,
                }),
            ],
        },
    ]);

// eslint-disable-next-line react-refresh/only-export-components
const BootstrapStatus = () => {
    const authState = useAtomValue(authStateAtom);
    const cryptoInitError = useAtomValue(cryptoInitErrorAtom);
    const capabilityContext = useAtomValue(capabilityContextAtom);

    const router = React.useMemo(
        () => buildAppRouter(capabilityContext),
        // Capability + flag fingerprints capture every meaningful registry-route
        // input; changes (auth → capability fetch, env-flag toggle) rebuild the
        // router so newly-granted feature surfaces become navigable.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [
            capabilityContext.capabilities.join('|'),
            JSON.stringify(capabilityContext.flags),
        ]
    );

    if (authState === 'logged_in') {
        return <RouterProvider router={router} />;
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
                {authState === 'logged_out' ? <LoginPage /> : null}
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
                <DevCapabilitySeeder />
                <MatrixBootstrapper />
                <NotificationTokenBroker />
                <UnreadCountBroadcaster />
                <LifecycleSyncBroker />
                <QueryClientProvider client={queryClient}>
                    <RegistryFetcherProvider fetchers={registryFetchers}>
                        <BootstrapStatus />
                    </RegistryFetcherProvider>
                </QueryClientProvider>
            </ThemeProvider>
        </JotaiProvider>
    </React.StrictMode>
);
