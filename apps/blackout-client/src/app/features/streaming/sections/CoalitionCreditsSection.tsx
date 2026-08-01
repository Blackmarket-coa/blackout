import React, { type CSSProperties, useEffect, useState } from 'react';
import { fetchCoalitionCredits, type CoalitionCreditsResponse } from '../creditsClient';
import {
    HubSection,
    hubCardLabelStyle,
    hubCardMetaStyle,
    hubEmptyStyle,
    hubGridStyle,
} from '../components/HubSection';

const statCardStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    padding: 16,
    border: '1px solid var(--border-default, #374151)',
    borderRadius: 14,
    background: 'var(--bg-input, #0f172a)',
};

const statValueStyle: CSSProperties = { fontSize: 22, fontWeight: 800 };

const sectionTitleStyle: CSSProperties = { margin: '20px 0 10px', fontSize: 14, fontWeight: 700 };
const listStackStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 8 };

const rowStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: '12px 14px',
    border: '1px solid var(--border-default, #374151)',
    borderRadius: 12,
    background: 'var(--bg-input, #0f172a)',
};

const chipRowStyle: CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 8 };

const chipBaseStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 12px',
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 700,
    border: '1px solid var(--border-default, #374151)',
    background: 'var(--bg-input, #0f172a)',
    color: 'var(--text-muted, #9ca3af)',
};

const chipEligibleStyle: CSSProperties = {
    ...chipBaseStyle,
    border: '1px solid var(--accent-primary, #2EF2C5)',
    color: 'var(--accent-primary, #2EF2C5)',
};

/**
 * Format a minor-units integer to its major-unit string, suffixed with the
 * currency code the API returned (e.g. "1,250.00 CC"). Coalition Credits use a
 * non-ISO "CC" code, so we deliberately avoid `Intl` currency styling (which
 * would throw on "CC") and never inject a hardcoded symbol.
 */
const formatMinorUnits = (minorUnits: number, currency?: string): string => {
    const major = new Intl.NumberFormat(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(minorUnits / 100);
    return currency ? `${major} ${currency}` : major;
};

const formatSettlement = (iso: string | null): string => {
    if (!iso) return 'Settlement date TBD';
    const parsed = new Date(iso);
    if (Number.isNaN(parsed.getTime())) return 'Settlement date TBD';
    return `Expected ${parsed.toLocaleDateString()}`;
};

/**
 * Coalition Credits earnings panel (Creator Hub → Earnings → Coalition
 * Credits). Reads the creator's Coalition Credits balance, pending payouts, and
 * reward-program eligibility from the FBM entitlements service via
 * `/v1/coalition-credits`.
 *
 * Self-degrading like the sibling hub sections: when the service isn't
 * configured (or the call fails) the API returns `available: false`, and this
 * panel shows a subtle "not set up yet" note rather than a misleading zero
 * balance.
 */
export const CoalitionCreditsSection = (): JSX.Element => {
    const [data, setData] = useState<CoalitionCreditsResponse | null>(null);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            try {
                const res = await fetchCoalitionCredits();
                if (!cancelled) setData(res);
            } catch {
                // Treat a transport error the same as an unconfigured service.
                if (!cancelled) setData({ available: false });
            }
        };
        void load();
        return () => {
            cancelled = true;
        };
    }, []);

    if (data === null) {
        return (
            <HubSection
                title="Coalition Credits"
                testId="coalition-credits-section"
                shellRegion="coalition-credits-section"
            >
                <p style={hubEmptyStyle}>Loading Coalition Credits…</p>
            </HubSection>
        );
    }

    if (!data.available) {
        return (
            <HubSection
                title="Coalition Credits"
                testId="coalition-credits-section"
                shellRegion="coalition-credits-section"
            >
                <p style={hubEmptyStyle} data-testid="coalition-credits-unavailable">
                    Coalition Credits aren’t set up for your account yet. When your coalition’s
                    ledger is connected, your balance and payouts will appear here.
                </p>
            </HubSection>
        );
    }

    const balanceMinorUnits = data.balanceMinorUnits ?? 0;
    const payouts = data.pendingPayouts ?? [];
    const eligibility = data.rewardEligibility ?? [];

    return (
        <HubSection
            title="Coalition Credits"
            subtitle="Your Coalition Credits balance, pending payouts, and reward-program standing."
            testId="coalition-credits-section"
            shellRegion="coalition-credits-section"
        >
            <div style={hubGridStyle} data-testid="coalition-credits-stats">
                <div style={statCardStyle}>
                    <span style={hubCardLabelStyle}>Balance</span>
                    <span style={statValueStyle} data-testid="coalition-credits-balance">
                        {formatMinorUnits(balanceMinorUnits, data.currency)}
                    </span>
                    <span style={hubCardMetaStyle}>Available Coalition Credits</span>
                </div>
            </div>

            <h2 style={sectionTitleStyle}>Pending payouts</h2>
            {payouts.length === 0 ? (
                <p style={hubEmptyStyle} data-testid="coalition-credits-payouts-empty">
                    No pending payouts right now.
                </p>
            ) : (
                <div style={listStackStyle} data-testid="coalition-credits-payouts">
                    {payouts.map((payout, index) => (
                        <div
                            key={`${payout.currency}-${
                                payout.expectedSettlementAt ?? 'tbd'
                            }-${index}`}
                            style={rowStyle}
                            data-testid="coalition-credits-payout-row"
                        >
                            <strong style={{ fontSize: 14 }}>
                                {formatMinorUnits(payout.amountMinorUnits, payout.currency)}
                            </strong>
                            <span style={hubCardMetaStyle}>
                                {formatSettlement(payout.expectedSettlementAt)}
                            </span>
                        </div>
                    ))}
                </div>
            )}

            {eligibility.length > 0 ? (
                <>
                    <h2 style={sectionTitleStyle}>Reward programs</h2>
                    <div style={chipRowStyle} data-testid="coalition-credits-eligibility">
                        {eligibility.map((program) => (
                            <span
                                key={program.programKey}
                                style={program.eligible ? chipEligibleStyle : chipBaseStyle}
                                data-testid="coalition-credits-eligibility-chip"
                            >
                                {program.programKey} ·{' '}
                                {program.eligible ? 'Eligible' : 'Not eligible'}
                            </span>
                        ))}
                    </div>
                </>
            ) : null}
        </HubSection>
    );
};

export default CoalitionCreditsSection;
