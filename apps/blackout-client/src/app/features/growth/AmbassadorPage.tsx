import React, { useCallback, useEffect, useState } from 'react';
import { applyAsAmbassador, fetchMyAmbassador, type AmbassadorRecord } from './growthClient';

const cardStyle: React.CSSProperties = {
    display: 'grid',
    gap: 10,
    padding: 12,
    borderRadius: 10,
    border: '1px solid var(--border-default, rgba(255,255,255,0.1))',
};

/**
 * Ambassador application route (`/growth/ambassadors`). Drives the existing
 * `fetchMyAmbassador` / `applyAsAmbassador` growth-client wrappers: shows the
 * current ambassador record when present, otherwise an application CTA.
 */
export function AmbassadorPage(): JSX.Element {
    const [ambassador, setAmbassador] = useState<AmbassadorRecord | null>(null);
    const [loading, setLoading] = useState(true);
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        setError(null);
        try {
            const res = await fetchMyAmbassador();
            setAmbassador(res.ambassador);
        } catch {
            setError('Could not load your ambassador status.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const onApply = useCallback(async () => {
        setPending(true);
        setError(null);
        try {
            const res = await applyAsAmbassador();
            setAmbassador(res.ambassador);
        } catch {
            setError('Could not submit your application.');
        } finally {
            setPending(false);
        }
    }, []);

    return (
        <main data-testid="growth-ambassador-page" style={{ padding: 16, display: 'grid', gap: 16 }}>
            <header>
                <h1 style={{ margin: 0 }}>Growth · Ambassador</h1>
                <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
                    Grow the canopy and earn commission on the dens you seed.
                </p>
            </header>

            {error ? (
                <p role="alert" data-testid="growth-ambassador-error" style={{ color: 'var(--danger, #e74c3c)' }}>
                    {error}
                </p>
            ) : null}

            {loading ? (
                <p data-testid="growth-ambassador-loading">Loading…</p>
            ) : ambassador ? (
                <section data-testid="growth-ambassador-status" style={cardStyle}>
                    <strong>You’re an ambassador</strong>
                    <dl
                        style={{
                            display: 'grid',
                            gridTemplateColumns: 'auto 1fr',
                            gap: '4px 12px',
                            margin: 0,
                        }}
                    >
                        <dt>Tier</dt>
                        <dd data-testid="growth-ambassador-tier" style={{ margin: 0 }}>
                            {ambassador.tier}
                        </dd>
                        <dt>Status</dt>
                        <dd style={{ margin: 0 }}>{ambassador.status}</dd>
                        <dt>Commission</dt>
                        <dd style={{ margin: 0 }}>{(ambassador.commissionBps / 100).toFixed(2)}%</dd>
                        <dt>Active canopies</dt>
                        <dd style={{ margin: 0 }}>{ambassador.quotaCanopiesActive}</dd>
                    </dl>
                </section>
            ) : (
                <section data-testid="growth-ambassador-apply" style={cardStyle}>
                    <p style={{ margin: 0 }}>You’re not an ambassador yet.</p>
                    <button
                        type="button"
                        data-testid="growth-ambassador-apply-button"
                        disabled={pending}
                        onClick={() => void onApply()}
                    >
                        {pending ? 'Submitting…' : 'Apply to become an ambassador'}
                    </button>
                </section>
            )}
        </main>
    );
}

export default AmbassadorPage;
