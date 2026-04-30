import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    compareFederationSeverity,
    type FederationAlertStatusPayload,
} from '@blackout/sdk';
import { useRegistryFetcher } from '../../core/features/RegistryFetcherProvider';

export type FederationHealthFetcher = {
    listAlerts: () => Promise<{ alerts: FederationAlertStatusPayload[] }>;
    acknowledgeAlert: (alertId: string) => Promise<unknown>;
};

type Props = {
    fetcher?: FederationHealthFetcher;
};

const stub: FederationHealthFetcher = {
    listAlerts: async () => ({ alerts: [] }),
    acknowledgeAlert: async () => ({}),
};

export function FederationHealthPage({ fetcher: explicitFetcher }: Props) {
    const contextFetcher = useRegistryFetcher('federationHealth');
    const fetcher = explicitFetcher ?? contextFetcher ?? stub;
    const [alerts, setAlerts] = useState<FederationAlertStatusPayload[]>([]);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);
    const [pending, setPending] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        setLoadError(null);
        try {
            const response = await fetcher.listAlerts();
            setAlerts(response.alerts ?? []);
        } catch (error) {
            setLoadError(error instanceof Error ? error.message : 'Failed to load alerts.');
        }
    }, [fetcher]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const onAcknowledge = useCallback(
        async (alertId: string) => {
            setActionError(null);
            setPending(alertId);
            try {
                await fetcher.acknowledgeAlert(alertId);
                setAlerts((prev) => prev.filter((alert) => alert.alertId !== alertId));
            } catch (error) {
                setActionError(
                    error instanceof Error ? error.message : `Failed to acknowledge ${alertId}.`
                );
            } finally {
                setPending(null);
            }
        },
        [fetcher]
    );

    const sorted = useMemo(
        () =>
            [...alerts]
                .filter((alert) => alert.active)
                .sort((a, b) => compareFederationSeverity(a.severity, b.severity)),
        [alerts]
    );

    return (
        <main
            data-testid="federation-health-page"
            style={{ padding: 16, display: 'grid', gap: 16 }}
        >
            <header>
                <h1 style={{ margin: 0 }}>Federation health</h1>
                <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
                    Active federation alerts ordered critical → warning → info. Backed by
                    `listAlerts` / `acknowledgeAlert` and the BKL-010 alert envelope.
                </p>
            </header>

            {loadError ? (
                <p data-testid="federation-load-error" role="alert">
                    {loadError}
                </p>
            ) : null}
            {actionError ? (
                <p data-testid="federation-action-error" role="alert">
                    {actionError}
                </p>
            ) : null}

            {sorted.length === 0 ? (
                <p
                    data-testid="federation-empty"
                    style={{ color: 'var(--text-secondary)' }}
                >
                    No active federation alerts.
                </p>
            ) : (
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
                    {sorted.map((alert) => (
                        <li
                            key={alert.alertId}
                            data-testid={`federation-alert-${alert.alertId}`}
                            data-severity={alert.severity}
                            style={{
                                border: '1px solid var(--border-default)',
                                borderRadius: 10,
                                padding: 10,
                                display: 'grid',
                                gap: 4,
                            }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <strong>
                                    [{alert.severity}] {alert.headline}
                                </strong>
                                <small>{alert.publishedAt}</small>
                            </div>
                            {alert.homeserver ? (
                                <small style={{ color: 'var(--text-secondary)' }}>
                                    homeserver: {alert.homeserver}
                                </small>
                            ) : null}
                            <button
                                type="button"
                                data-testid={`federation-ack-${alert.alertId}`}
                                onClick={() => void onAcknowledge(alert.alertId)}
                                disabled={pending === alert.alertId}
                            >
                                {pending === alert.alertId ? 'Acknowledging…' : 'Acknowledge'}
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </main>
    );
}

export default FederationHealthPage;
