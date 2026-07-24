import { Link, isRouteErrorResponse, useRouteError } from 'react-router';

/**
 * Branded replacements for react-router's default "Unexpected Application
 * Error!" screen.
 *
 * `NotFoundPage` doubles as the `path: '*'` catch-all. Unknown URLs are not
 * always typos here: registry routes (e.g. `/profile/me`) only exist once the
 * capability fetch (`GET /v1/capabilities`) has hydrated, which in turn needs
 * the Matrix→Blackout token exchange — so a dead session or a slow boot makes
 * real destinations temporarily unmatchable. The copy and the reload button
 * account for that.
 */

const cardStyles = {
    main: {
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        background: 'var(--bg-surface, #111827)',
        color: 'var(--text-primary, #f8fafc)',
        padding: 24,
    },
    section: {
        width: 'min(560px, 100%)',
        border: '1px solid var(--border-default, #374151)',
        borderRadius: 12,
        background: 'var(--bg-input, #0f172a)',
        padding: 20,
        display: 'grid',
        gap: 12,
    },
    heading: { margin: 0, fontSize: 20 },
    body: { margin: 0, opacity: 0.9, color: 'var(--text-muted, #9ca3af)', fontSize: 14 },
    actions: { display: 'flex', gap: 8, flexWrap: 'wrap' },
    button: {
        width: 'fit-content',
        borderRadius: 8,
        border: '1px solid var(--border-default, #4b5563)',
        background: 'var(--bg-nav, #1f2937)',
        color: 'var(--text-primary, #f8fafc)',
        padding: '8px 12px',
        cursor: 'pointer',
        fontSize: 14,
        textDecoration: 'none',
        display: 'inline-block',
    },
    pre: {
        margin: 0,
        padding: '8px 10px',
        background: 'var(--bg-input, #111827)',
        border: '1px solid var(--border-default, #374151)',
        borderRadius: 8,
        color: 'var(--text-muted, #9ca3af)',
        fontSize: 12,
        whiteSpace: 'pre-wrap',
        overflow: 'auto',
    },
} as const;

const ErrorCard = ({
    testId,
    title,
    body,
    detail,
}: {
    testId: string;
    title: string;
    body: string;
    detail?: string;
}) => (
    <main data-shell="route-error" style={cardStyles.main}>
        <section role="alert" data-testid={testId} style={cardStyles.section}>
            <h1 style={cardStyles.heading}>{title}</h1>
            <p style={cardStyles.body}>{body}</p>
            {detail ? <pre style={cardStyles.pre}>{detail}</pre> : null}
            <div style={cardStyles.actions}>
                <Link to="/" style={cardStyles.button}>
                    Back to home
                </Link>
                <button
                    type="button"
                    onClick={() => window.location.reload()}
                    style={cardStyles.button}
                >
                    Reload
                </button>
            </div>
        </section>
    </main>
);

export const NotFoundPage = () => (
    <ErrorCard
        testId="route-not-found"
        title="Page not found"
        body="This page doesn't exist, or it isn't available right now — some destinations only appear once your session has finished loading. If you expected to find something here, try reloading or signing in again."
    />
);

/**
 * `errorElement` for the router root. Route-level 404s render the same card
 * as the `*` catch-all; anything else (a render crash that escaped the
 * per-plugin boundary, a thrown non-Response) gets a generic card with the
 * error message, mirroring `PluginRouteBoundary`'s fallback.
 */
export const RouteErrorFallback = () => {
    const error = useRouteError();

    if (isRouteErrorResponse(error) && error.status === 404) {
        return <NotFoundPage />;
    }

    const detail = isRouteErrorResponse(error)
        ? `${error.status} ${error.statusText}`
        : error instanceof Error
        ? error.message
        : String(error);

    return (
        <ErrorCard
            testId="route-error"
            title="Something went wrong"
            body="This view hit an unexpected error. The rest of the app should still be working — head back home or reload."
            detail={detail}
        />
    );
};
