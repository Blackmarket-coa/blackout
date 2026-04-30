import React, { useCallback, useEffect, useState } from 'react';
import type { RevenueOpsSnapshotPayload } from '@blackout/sdk';
import { useRegistryFetcher } from '../../core/features/RegistryFetcherProvider';

export type RevenueOpsFetcher = {
    getRevenueSnapshot: () => Promise<RevenueOpsSnapshotPayload>;
    listRevenueSnapshots: (options?: {
        cursor?: string;
        limit?: number;
    }) => Promise<{ snapshots: RevenueOpsSnapshotPayload[] }>;
};

type Props = {
    fetcher?: RevenueOpsFetcher;
};

const stub: RevenueOpsFetcher = {
    getRevenueSnapshot: async () => {
        throw new Error('No revenue snapshot available.');
    },
    listRevenueSnapshots: async () => ({ snapshots: [] }),
};

export function RevenueOpsPage({ fetcher: explicitFetcher }: Props) {
    const contextFetcher = useRegistryFetcher('revenueOps');
    const fetcher = explicitFetcher ?? contextFetcher ?? stub;
    const [latest, setLatest] = useState<RevenueOpsSnapshotPayload | null>(null);
    const [history, setHistory] = useState<RevenueOpsSnapshotPayload[]>([]);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [latestError, setLatestError] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        setLoadError(null);
        try {
            const result = await fetcher.listRevenueSnapshots({ limit: 20 });
            setHistory(result.snapshots ?? []);
        } catch (error) {
            setLoadError(error instanceof Error ? error.message : 'Failed to load history.');
        }
    }, [fetcher]);

    const refreshLatest = useCallback(async () => {
        setLatestError(null);
        try {
            const snapshot = await fetcher.getRevenueSnapshot();
            setLatest(snapshot);
        } catch (error) {
            setLatest(null);
            setLatestError(
                error instanceof Error ? error.message : 'No revenue snapshot available.'
            );
        }
    }, [fetcher]);

    useEffect(() => {
        void refresh();
        void refreshLatest();
    }, [refresh, refreshLatest]);

    return (
        <main
            data-testid="revenue-ops-page"
            style={{ padding: 16, display: 'grid', gap: 16 }}
        >
            <header>
                <h1 style={{ margin: 0 }}>Revenue ops</h1>
                <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
                    Latest snapshot + recent history. Backed by `getRevenueSnapshot` /
                    `listRevenueSnapshots` and the BKL-010 snapshot envelope.
                </p>
            </header>

            <section
                data-testid="revenue-ops-latest"
                style={{
                    border: '1px solid var(--border-default)',
                    borderRadius: 10,
                    padding: 12,
                    display: 'grid',
                    gap: 6,
                }}
            >
                <strong>Latest snapshot</strong>
                {latestError ? (
                    <p data-testid="revenue-ops-latest-error" role="alert">
                        {latestError}
                    </p>
                ) : null}
                {latest ? (
                    <dl style={{ margin: 0, display: 'grid', gap: 4 }}>
                        <div>
                            <dt style={{ display: 'inline' }}>captured: </dt>
                            <dd style={{ display: 'inline' }}>{latest.capturedAt}</dd>
                        </div>
                        <div>
                            <dt style={{ display: 'inline' }}>currency: </dt>
                            <dd style={{ display: 'inline' }}>{latest.currency}</dd>
                        </div>
                        <div>
                            <dt style={{ display: 'inline' }}>gross: </dt>
                            <dd style={{ display: 'inline' }}>{latest.figures.gross}</dd>
                        </div>
                        <div>
                            <dt style={{ display: 'inline' }}>net: </dt>
                            <dd style={{ display: 'inline' }}>{latest.figures.net}</dd>
                        </div>
                        <div>
                            <dt style={{ display: 'inline' }}>refunds: </dt>
                            <dd style={{ display: 'inline' }}>{latest.figures.refunds}</dd>
                        </div>
                        <div>
                            <dt style={{ display: 'inline' }}>chargebacks: </dt>
                            <dd style={{ display: 'inline' }}>{latest.figures.chargebacks}</dd>
                        </div>
                    </dl>
                ) : null}
            </section>

            <section
                data-testid="revenue-ops-history"
                style={{
                    border: '1px solid var(--border-default)',
                    borderRadius: 10,
                    padding: 12,
                    display: 'grid',
                    gap: 6,
                }}
            >
                <strong>Recent snapshots</strong>
                {loadError ? (
                    <p data-testid="revenue-ops-load-error" role="alert">
                        {loadError}
                    </p>
                ) : null}
                {history.length === 0 ? (
                    <p
                        data-testid="revenue-ops-history-empty"
                        style={{ color: 'var(--text-secondary)' }}
                    >
                        No historical snapshots.
                    </p>
                ) : (
                    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 4 }}>
                        {history.map((snapshot) => (
                            <li
                                key={snapshot.snapshotId}
                                data-testid={`revenue-ops-snapshot-${snapshot.snapshotId}`}
                                style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    gap: 6,
                                }}
                            >
                                <span>
                                    <code>{snapshot.snapshotId}</code> · {snapshot.capturedAt}
                                </span>
                                <small>
                                    {snapshot.currency} {snapshot.figures.gross} gross
                                </small>
                            </li>
                        ))}
                    </ul>
                )}
            </section>
        </main>
    );
}

export default RevenueOpsPage;
