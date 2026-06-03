import React, { type CSSProperties, useEffect, useState } from 'react';
import {
    fetchMyBountyRewards,
    type BountyReward,
    type BountyRewardSummary,
} from '../../bounty/bountyClient';
import { HubSection, hubEmptyStyle } from '../components/HubSection';

const statRowStyle: CSSProperties = { display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 };
const statCardStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    padding: 16,
    minWidth: 140,
    border: '1px solid var(--border-default, #374151)',
    borderRadius: 14,
    background: 'var(--bg-input, #0f172a)',
};
const statValueStyle: CSSProperties = { fontSize: 22, fontWeight: 800 };
const statLabelStyle: CSSProperties = {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: 'var(--text-muted, #9ca3af)',
};
const rowStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    flexWrap: 'wrap',
    padding: '12px 14px',
    border: '1px solid var(--border-default, #374151)',
    borderRadius: 12,
    background: 'var(--bg-input, #0f172a)',
};
const statusStyle: CSSProperties = {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: 'var(--text-muted, #9ca3af)',
};

const usd = (cents: number): string => `$${(cents / 100).toFixed(2)}`;

/**
 * Creator Hub rewards dashboard panel for bounty earnings. Reads the economic
 * truth recorded when bounties the creator completed are marked done
 * (`/v1/bounties/rewards/me`): a count, total earned, and settled-so-far, plus
 * the per-bounty list. Self-degrading like the other hub sections.
 */
export const CreatorHubBountyRewards = (): JSX.Element => {
    const [rewards, setRewards] = useState<BountyReward[] | null>(null);
    const [summary, setSummary] = useState<BountyRewardSummary>({
        count: 0,
        earnedCents: 0,
        settledCents: 0,
    });

    useEffect(() => {
        let cancelled = false;
        fetchMyBountyRewards()
            .then((res) => {
                if (cancelled) return;
                setRewards(res.rewards);
                setSummary(res.summary);
            })
            .catch(() => {
                if (!cancelled) setRewards([]);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    const list = rewards ?? [];

    return (
        <HubSection
            title="Bounty earnings"
            subtitle="Rewards recorded when bounties you completed are marked done."
            testId="creator-hub-bounty-rewards"
            shellRegion="creator-hub-bounty-rewards"
        >
            <div style={statRowStyle}>
                <div style={statCardStyle}>
                    <span style={statValueStyle} data-testid="bounty-rewards-count">
                        {summary.count}
                    </span>
                    <span style={statLabelStyle}>Bounties completed</span>
                </div>
                <div style={statCardStyle}>
                    <span style={statValueStyle} data-testid="bounty-rewards-earned">
                        {usd(summary.earnedCents)}
                    </span>
                    <span style={statLabelStyle}>Earned</span>
                </div>
                <div style={statCardStyle}>
                    <span style={statValueStyle} data-testid="bounty-rewards-settled">
                        {usd(summary.settledCents)}
                    </span>
                    <span style={statLabelStyle}>Settled</span>
                </div>
            </div>
            {rewards === null ? (
                <p style={hubEmptyStyle}>Loading earnings…</p>
            ) : list.length === 0 ? (
                <p style={hubEmptyStyle} data-testid="bounty-rewards-empty">
                    No bounty earnings yet. Complete a matched bounty to start earning.
                </p>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {list.map((reward) => (
                        <div key={reward.id} style={rowStyle} data-testid="bounty-reward-row">
                            <span style={{ fontSize: 13, fontWeight: 600 }}>
                                {reward.rewardSummary}
                            </span>
                            <span style={statusStyle}>{reward.status}</span>
                        </div>
                    ))}
                </div>
            )}
        </HubSection>
    );
};

export default CreatorHubBountyRewards;
