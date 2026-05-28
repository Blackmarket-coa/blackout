/* eslint-disable import/first */
import { installConsoleCapture } from './app/lib/diagnostics/consoleCapture';

// Install the console ring buffer before any other import emits, so the
// "Report a bug" diagnostics opt-in can attach the most recent 50 lines.
installConsoleCapture();

import React from 'react';
import ReactDOM from 'react-dom/client';
import { enableMapSet } from 'immer';
import '@fontsource/inter/variable.css';
import 'folds/dist/style.css';
import { configClass, varsClass } from 'folds';
import { useAtomValue } from 'jotai';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createBrowserRouter, Navigate, Outlet, RouterProvider } from 'react-router-dom';
import { Provider as JotaiProvider } from 'jotai';
import { ThemeProvider } from './app/components/ThemeProvider';
import { MatrixBootstrapper } from './app/components/bmc/MatrixBootstrapper';
import { PluginEntitlementHydrator } from './app/features/monetization/install/PluginEntitlementHydrator';
import { useMatrixClient } from './app/hooks/useMatrixClient';
import { useBindAllRoomsAtom } from './app/state/rooms';
import { RuntimeSettingsBridge } from './app/components/RuntimeSettingsBridge';
import { authStateAtom, cryptoInitErrorAtom } from './app/state/auth';
import { capabilityContextAtom } from './app/core/features/capabilityContext';
import {
    buildCapabilityContextValue,
    hydrateCapabilityContext,
    resolveDevCapabilitySeed,
} from './app/core/features/capabilityHydration';
import { runtimeFeatureFlags } from './app/core/features/featureFlags';
import { buildRegistryRouteObjects } from './app/core/features/RegistryRouteList';
import { RegistryFetcherProvider } from './app/core/features/RegistryFetcherProvider';
import { buildRegistryFetchers } from './app/core/features/registryFetchers';
import { createCapabilityActions } from '@blackout/sdk';
import { createAuthorizedApiClient } from './app/sdk/client';
import { useStore } from 'jotai';
import './index.css';
import './app/styles/theme.css.ts';
import './app/i18n';
// Lazy-loaded to avoid pulling matrix-js-sdk's top-level WASM await
// into the main module graph. The bypass mode never needs these.
const ClientLayout = React.lazy(() => import('./app/pages/client/ClientLayout'));
const AppShellLazy = React.lazy(() => import('./app/pages/shell/AppShell').then(m => ({ default: m.AppShell })));
const LoginPageLazy = React.lazy(() => import('./app/components/bmc/auth').then(m => ({ default: m.LoginPage })));
const OAuthCallbackLazy = React.lazy(() => import('./app/features/settings/linked-accounts/OAuthCallback').then(m => ({ default: m.OAuthCallback })));
const InviteLandingPageLazy = React.lazy(() => import('./app/components/invite-landing').then(m => ({ default: m.InviteLandingPage })));
const PendingInviteRedeemerLazy = React.lazy(() => import('./app/components/invite-landing').then(m => ({ default: m.PendingInviteRedeemer })));
const OnboardingPageLazy = React.lazy(() => import('./app/features/welcome/OnboardingPage').then(m => ({ default: m.OnboardingPage })));
const PublicDirectoryLazy = React.lazy(() => import('./app/features/discovery/PublicDirectory').then(m => ({ default: m.PublicDirectory })));
import { ONBOARDING_PATH } from './app/pages/paths';
import { trimTrailingSlash } from './app/utils/common';

// HomeFeed is gated behind two flags and a small Matrix-tied data path
// (`joinedRoomsAtom`); keeping it lazy avoids dragging the
// matrix-js-sdk crypto chain into registry-load tests when the flag is
// off — the same pattern PR 1 adopted for ClientLayout in
// CommunitiesRoute.
const HomeFeedLazy = React.lazy(() => import('./app/features/home/HomeFeed'));
import { pushSessionToSW } from './sw-session';
import { getFallbackSession } from './app/state/sessions';
import { initDesktopBridge } from './platform/initDesktopBridge';
import { LifecycleSyncBroker } from './platform/LifecycleSyncBroker';
import { NativeBridgeListener } from './platform/NativeBridgeListener';
import { NotificationTokenBroker } from './platform/NotificationTokenBroker';
import { UnreadCountBroadcaster } from './platform/UnreadCountBroadcaster';
import { ConfirmProvider } from './app/components/confirm-dialog';
import { CrashBoundary } from './app/components/CrashBoundary';
import { ClientConfigLoader } from './app/hooks/ClientConfigLoader';

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
 * Production fetcher bag — built once at boot from the canonical authorized
 * `ApiClient`, which lazily resolves the Matrix→Blackout JWT (and retries once
 * on 401) so every registry `/v1/*` fetcher (thread activity, capability
 * hydration, …) is authenticated instead of hitting the API anonymously. The
 * base URL (same-origin in production) is owned by `app/sdk/client`.
 */
const apiClient = createAuthorizedApiClient(null);
const registryFetchers = buildRegistryFetchers(apiClient);
const fetchCapabilities = createCapabilityActions(apiClient).fetchCapabilities;

void initDesktopBridge();

// Sentry client capture. No-ops when the DSN is empty or @sentry/browser
// isn't installed. Reads from the same Vite env as the API base URL so
// ops can flip it on per-environment without rebuilding.
void (async () => {
    const env = (import.meta as { env?: Record<string, string | undefined> }).env ?? {};
    const dsn = env.VITE_SENTRY_DSN;
    if (!dsn) return;
    const { initSentry } = await import('./app/lib/sentry/init');
    await initSentry({
        dsn,
        release: env.VITE_APP_VERSION,
        environment: env.MODE,
    });
})();

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

// Boot-time capability hydration. Mounted only once the viewer is logged in (so
// the Matrix→Blackout token exchange can resolve), this fetches the canonical
// capability set from `GET /v1/capabilities` and writes it into
// `capabilityContextAtom`. `BootstrapStatus` rebuilds the router whenever that
// atom changes, so newly-granted registry surfaces (e.g. `/profile/me`) become
// navigable without a reload.
// eslint-disable-next-line react-refresh/only-export-components
const CapabilityHydrator = () => {
    const store = useStore();
    React.useEffect(() => {
        // The helper accepts any structural `{ get, set }` store; jotai's store
        // has a stricter generic shape than that loose contract, so cast.
        void hydrateCapabilityContext(store as never, fetchCapabilities);
    }, [store]);
    return null;
};

const RouterRoot = () => (
    <ConfirmProvider>
        <NativeBridgeListener />
        <Outlet />
    </ConfirmProvider>
);

const buildAppRouter = (capabilityContext: {
    capabilities: string[];
    flags: Record<string, boolean>;
}) => {
    const shellEnabled = capabilityContext.flags.shellAppShell === true;
    const homeFeedEnabled = shellEnabled && capabilityContext.flags.discoveryHomeFeed === true;
    const registryRoutes = buildRegistryRouteObjects({
        capabilities: capabilityContext.capabilities,
        flags: capabilityContext.flags as never,
    });

    // PR 2 routing matrix: when both `shellAppShell` and
    // `discoveryHomeFeed` are on, `/` mounts HomeFeed (a chronological
    // merge of joined dens). Either flag off keeps the legacy
    // ClientLayout — HomeFeed depends on the AppShell chrome for
    // navigation, so we never mount it without the shell wrapper.
    const homeElement = homeFeedEnabled ? (
        <React.Suspense fallback={null}>
            <HomeFeedLazy />
        </React.Suspense>
    ) : (
        <ClientLayout />
    );

    // Note: the legacy `/room/:roomId` route was retired in PR-10
    // alongside the `shellAppShell` default-on flip. The canonical
    // room URL is `/communities/:canopyId/dens/:denId`. Deep links
    // hitting the old form will 404 after the year-long grace
    // window from PR 1.
    // Auth deep-link paths are valid URLs when logged out (the LoginPage
    // reads `window.location.pathname` to pick the active tab). Once
    // the user is logged in the router takes over, so we redirect each
    // of them to the canonical landing page rather than 404.
    const authRedirectRoutes = [
        { path: '/login', element: <Navigate to="/" replace /> },
        { path: '/register', element: <Navigate to="/" replace /> },
        { path: '/reset-password', element: <Navigate to="/" replace /> },
    ];

    const destinationRoutes = [
        {
            path: '/',
            element: homeElement,
        },
        // Invite landing — handled here for the logged-in case so an
        // already-signed-in recipient gets the auto-redeem flow. The
        // logged-out case is intercepted in BootstrapStatus before this
        // router ever mounts (see below).
        { path: '/invite/:token', element: <React.Suspense fallback={null}><InviteLandingPageLazy /></React.Suspense> },
        // Full-page onboarding host. Invite acceptance routes brand-new users
        // here (with the invited room as `?room=`) before dropping them into
        // the room; otherwise the wizard only ever shows as a ClientLayout modal.
        { path: ONBOARDING_PATH, element: <React.Suspense fallback={null}><OnboardingPageLazy /></React.Suspense> },
        ...authRedirectRoutes,
        ...registryRoutes,
    ];

    return createBrowserRouter([
        {
            element: <RouterRoot />,
            children: [
                // OAuth popup landing page. Mounted OUTSIDE the AppShell so
                // a popup window doesn't render the full app chrome before
                // it auto-closes itself.
                { path: '/oauth/:provider/callback', element: <React.Suspense fallback={null}><OAuthCallbackLazy /></React.Suspense> },
                ...(shellEnabled
                    ? [{ element: <React.Suspense fallback={null}><AppShellLazy /></React.Suspense>, children: destinationRoutes }]
                    : destinationRoutes),
            ],
        },
    ]);
};

// eslint-disable-next-line react-refresh/only-export-components
const RoomsAtomBinder = () => {
    const mx = useMatrixClient();
    useBindAllRoomsAtom(mx);
    return null;
};

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
        [capabilityContext.capabilities.join('|'), JSON.stringify(capabilityContext.flags)]
    );

    if (authState === 'logged_in') {
        return (
            <>
                <RoomsAtomBinder />
                <CapabilityHydrator />
                <PluginEntitlementHydrator />
                <React.Suspense fallback={null}><PendingInviteRedeemerLazy /></React.Suspense>
                <RouterProvider router={router} />
            </>
        );
    }

    // The router only mounts for logged_in users (see above), so any
    // unauthenticated request to /invite/:token would otherwise fall
    // through to the LoginPage card. Render the landing page directly
    // here so the recipient sees who invited them — they can then choose
    // "Create account" or "Sign in" and the token-stash → post-login
    // redemption hook takes over.
    if (
        typeof window !== 'undefined' &&
        window.location.pathname.startsWith('/invite/') &&
        authState !== 'crypto_initializing' &&
        authState !== 'crypto_failed'
    ) {
        return <React.Suspense fallback={null}><InviteLandingPageLazy /></React.Suspense>;
    }

    // Public room directory is browsable without an account. The full router
    // (which maps /explore onto discovery) only mounts once logged in, so
    // intercept the logged-out case here and render the standalone, session-less
    // directory instead of dropping the visitor on the sign-in card.
    if (
        typeof window !== 'undefined' &&
        window.location.pathname.startsWith('/explore') &&
        authState === 'logged_out'
    ) {
        return <React.Suspense fallback={null}><PublicDirectoryLazy /></React.Suspense>;
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
            data-shell="bootstrap"
            data-bootstrap-state={authState}
            style={{
                minHeight: '100vh',
                display: 'grid',
                gridTemplateRows: '1fr auto',
                placeItems: 'center',
                background: 'var(--bg-surface, #111827)',
                color: 'var(--text-primary, #f8fafc)',
                padding: 24,
                gap: 16,
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
                {authState === 'logged_out' ? <React.Suspense fallback={null}><LoginPageLazy /></React.Suspense> : null}
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
            <nav
                aria-label="Bootstrap escape routes"
                data-shell-region="bootstrap-nav"
                style={{
                    display: 'flex',
                    gap: 16,
                    fontSize: 13,
                    color: 'var(--text-secondary, #94a3b8)',
                    flexWrap: 'wrap',
                    justifyContent: 'center',
                }}
            >
                <a
                    href="/home"
                    aria-label="Home"
                    data-testid="bootstrap-home"
                    style={{ color: 'inherit' }}
                >
                    Home
                </a>
                <a
                    href="/explore"
                    aria-label="Browse public rooms"
                    data-testid="bootstrap-explore"
                    style={{ color: 'inherit' }}
                >
                    Browse rooms
                </a>
                <a href="https://theblackout.app" rel="noreferrer" style={{ color: 'inherit' }}>
                    About
                </a>
                <a
                    href="https://github.com/Blackmarket-coa/blackout#readme"
                    rel="noreferrer"
                    style={{ color: 'inherit' }}
                >
                    Help
                </a>
            </nav>
        </main>
    );
};

// Playwright regression harness for the PortalModal overlay primitive,
// mounted before the auth/matrix bootstrap chain so the browser test can
// drive the overlay layer without spinning up a real Matrix session.
// Reachable only by explicit navigation to /__dev__/portal-modal; the
// module is loaded via dynamic import so the static bundle never pays
// the cost up front.
const HARNESS_PATH = '/__dev__/portal-modal';
const harnessActive = typeof window !== 'undefined' && window.location.pathname === HARNESS_PATH;

if (harnessActive) {
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    import('./app/dev/PortalModalHarness').then(({ PortalModalHarness }) => {
        ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
            <React.StrictMode>
                <ThemeProvider>
                    <PortalModalHarness />
                </ThemeProvider>
            </React.StrictMode>
        );
    });
} else {
    ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
        <React.StrictMode>
            <JotaiProvider>
                <ThemeProvider>
                    <ClientConfigLoader>
                        <CrashBoundary>
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
                        </CrashBoundary>
                    </ClientConfigLoader>
                </ThemeProvider>
            </JotaiProvider>
        </React.StrictMode>
    );
}
