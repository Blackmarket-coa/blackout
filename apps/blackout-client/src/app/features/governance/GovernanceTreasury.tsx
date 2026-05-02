import React, { useCallback, useEffect, useState, type CSSProperties } from 'react';
import type { GovernanceTreasurySnapshotPayload } from '@blackout/protocol';
import {
    getTreasurySnapshot as getTreasurySnapshotDefault,
    listTreasurySnapshots as listTreasurySnapshotsDefault,
} from './governanceClient';

export interface GovernanceTreasuryProps {
    getTreasurySnapshot?: typeof getTreasurySnapshotDefault;
    listTreasurySnapshots?: typeof listTreasurySnapshotsDefault;
}

const containerStyle: CSSProperties = { display: 'grid', gap: 16, padding: 16 };
const cardStyle: CSSProperties = {
    display: 'grid',
    gap: 8,
    padding: 12,
    border: '1px solid var(--border-default)',
    borderRadius: 10,
    background: 'var(--bg-surface)',
};

export function GovernanceTreasury({
    getTreasurySnapshot = getTreasurySnapshotDefault,
    listTreasurySnapshots = listTreasurySnapshotsDefault,
}: GovernanceTreasuryProps = {}) {
    const [latest, setLatest] = useState<GovernanceTreasurySnapshotPayload | null>(null);
    const [history, setHistory] = useState<GovernanceTreasurySnapshotPayload[]>([]);
    const [nextCursor, setNextCursor] = useState<string | undefined>(undefined);
    const [loading, setLoading] = useState(true);
    const [historyError, setHistoryError] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        setLoading(true);
        setHistoryError(null);
        try {
            const [latestResult, list] = await Promise.allSettled([
                getTreasurySnapshot(),
                listTreasurySnapshots({ limit: 10 }),
            ]);
            if (latestResult.status === 'fulfilled') {
                setLatest(latestResult.value);
            } else {
                setLatest(null);
            }
            if (list.status === 'fulfilled') {
                setHistory(list.value.items);
                setNextCursor(list.value.nextCursor);
            } else {
                setHistory([]);
                setHistoryError(
                    list.reason instanceof Error
                        ? list.reason.message
                        : 'Failed to load history.',
                );
            }
        } finally {
            setLoading(false);
        }
    }, [getTreasurySnapshot, listTreasurySnapshots]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const onLoadMore = useCallback(async () => {
        if (!nextCursor) return;
        try {
            const more = await listTreasurySnapshots({ limit: 10, cursor: nextCursor });
            setHistory((prev) => [...prev, ...more.items]);
            setNextCursor(more.nextCursor);
        } catch (err) {
            setHistoryError(err instanceof Error ? err.message : 'Failed to load page.');
        }
    }, [listTreasurySnapshots, nextCursor]);

    return (
        <main style={containerStyle} data-testid="governance-treasury">
            <header>
                <h1 style={{ margin: 0 }}>Governance Treasury</h1>
                <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)' }}>
                    Latest snapshot and rolling history of treasury balances.
                </p>
            </header>

            <section style={cardStyle} data-testid="governance-treasury-latest">
                <header
                    style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                    }}
                >
                    <strong>Latest snapshot</strong>
                    <button type="button" onClick={() => void refresh()} disabled={loading}>
                        Refresh
                    </button>
                </header>
                {loading && !latest ? (
                    <p style={{ color: 'var(--text-secondary)' }}>Loading…</p>
                ) : !latest ? (
                    <p style={{ color: 'var(--text-secondary)' }}>
                        No treasury snapshot has been published yet.
                    </p>
                ) : (
                    <>
                        <small style={{ color: 'var(--text-secondary)' }}>
                            Generated {new Date(latest.generatedAt).toLocaleString()} ·{' '}
                            {latest.snapshotId}
                        </small>
                        {latest.totalReference ? (
                            <strong style={{ fontSize: 18 }}>
                                {latest.totalReference.amount} {latest.totalReference.currency}
                            </strong>
                        ) : null}
                        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                            <thead>
                                <tr style={{ textAlign: 'left' }}>
                                    <th>Asset</th>
                                    <th>Balance</th>
                                    <th>Δ 24h</th>
                                </tr>
                            </thead>
                            <tbody>
                                {latest.lines.map((line) => (
                                    <tr key={line.asset}>
                                        <td>{line.asset}</td>
                                        <td>{line.balance}</td>
                                        <td>{line.delta24h ?? '—'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </>
                )}
            </section>

            <section style={{ display: 'grid', gap: 8 }}>
                <strong>History</strong>
                {historyError ? (
                    <p role="alert" style={{ color: 'var(--danger)' }}>
                        {historyError}
                    </p>
                ) : null}
                {history.length === 0 && !loading ? (
                    <p style={{ color: 'var(--text-secondary)' }}>No history yet.</p>
                ) : (
                    <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 8 }}>
                        {history.map((snapshot) => (
                            <li
                                key={snapshot.snapshotId}
                                style={cardStyle}
                                data-testid={`governance-treasury-row-${snapshot.snapshotId}`}
                            >
                                <strong>
                                    {snapshot.totalReference?.amount ?? '—'}{' '}
                                    {snapshot.totalReference?.currency ?? ''}
                                </strong>
                                <small style={{ color: 'var(--text-secondary)' }}>
                                    {new Date(snapshot.generatedAt).toLocaleString()} ·{' '}
                                    {snapshot.snapshotId}
                                </small>
                            </li>
                        ))}
                    </ul>
                )}
                {nextCursor ? (
                    <button
                        type="button"
                        data-testid="governance-treasury-load-more"
                        onClick={() => void onLoadMore()}
                    >
                        Load more
                    </button>
                ) : null}
            </section>
        </main>
    );
}

export default GovernanceTreasury;
