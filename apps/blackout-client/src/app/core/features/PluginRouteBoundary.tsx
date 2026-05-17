import type { ReactNode } from 'react';
import { ErrorBoundary } from 'react-error-boundary';

type FallbackProps = {
    pluginId: string;
    error: Error;
};

const Fallback = ({ pluginId, error }: FallbackProps) => (
    <section
        role="alert"
        data-testid="plugin-route-error"
        data-plugin-id={pluginId}
        style={{
            padding: 20,
            color: 'var(--text-primary, #f8fafc)',
            background: 'var(--bg-surface, #0f172a)',
            height: '100%',
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
        }}
    >
        <h2 style={{ margin: 0, fontSize: 18 }}>This plugin crashed.</h2>
        <p style={{ margin: 0, color: 'var(--text-muted, #9ca3af)', fontSize: 13 }}>
            The rest of the app is still working. Try reopening this view, or
            disable the plugin from the Plugins page.
        </p>
        <pre
            style={{
                margin: 0,
                padding: '8px 10px',
                background: 'var(--bg-input, #111827)',
                border: '1px solid var(--border-default, #374151)',
                borderRadius: 8,
                color: 'var(--text-muted, #9ca3af)',
                fontSize: 12,
                whiteSpace: 'pre-wrap',
                overflow: 'auto',
            }}
        >
            {error.message}
        </pre>
    </section>
);

type PluginRouteBoundaryProps = {
    pluginId: string;
    children: ReactNode;
};

export const PluginRouteBoundary = ({ pluginId, children }: PluginRouteBoundaryProps) => (
    <ErrorBoundary
        fallbackRender={({ error }) => (
            <Fallback pluginId={pluginId} error={error as Error} />
        )}
    >
        {children}
    </ErrorBoundary>
);

export default PluginRouteBoundary;
