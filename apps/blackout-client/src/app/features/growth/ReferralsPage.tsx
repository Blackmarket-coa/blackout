import React from 'react';
import { ReferralBreakdown } from './ReferralBreakdown';

/**
 * Referrals dashboard route (`/growth/referrals`). Thin page shell around the
 * existing `ReferralBreakdown` ledger view — the growth backend + client
 * wrappers already shipped; this surfaces them as a navigable destination.
 */
export function ReferralsPage(): JSX.Element {
    return (
        <main data-testid="growth-referrals-page" style={{ padding: 16, display: 'grid', gap: 16 }}>
            <header>
                <h1 style={{ margin: 0 }}>Growth · Referrals</h1>
                <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
                    Who you’ve brought in and what they’ve generated.
                </p>
            </header>
            <ReferralBreakdown />
        </main>
    );
}

export default ReferralsPage;
