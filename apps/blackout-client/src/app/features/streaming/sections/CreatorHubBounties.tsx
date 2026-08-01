import React, { type CSSProperties, useEffect, useMemo, useState } from 'react';
import type { Bounty, BountyCategory } from '@blackout/core';
import { applyToBounty, fetchRecommendedBounties } from '../../bounty/bountyClient';
import { interestTagsToBountyCategories } from '../../bounty/bountyInterestMatch';
import { useDiscoveryInterestTags } from '../../home/discoveryInterests';
import { HubSection, hubEmptyStyle } from '../components/HubSection';

const CATEGORY_LABELS: Record<BountyCategory, string> = {
    creator: 'Creator',
    coalition: 'Coalition',
    developer: 'Developer',
    tester: 'Tester',
    content: 'Content',
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

const metaColStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    minWidth: 0,
};

const labelStyle: CSSProperties = {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: 'var(--text-muted, #9ca3af)',
};

const titleStyle: CSSProperties = { fontSize: 14, fontWeight: 600 };
const rewardStyle: CSSProperties = { fontSize: 12, color: 'var(--text-muted, #9ca3af)' };

const applyButtonStyle: CSSProperties = {
    padding: '6px 14px',
    borderRadius: 999,
    border: '1px solid var(--accent-primary, #2EF2C5)',
    background: 'transparent',
    color: 'inherit',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
};

type ApplyStatus = 'idle' | 'applying' | 'applied' | 'error';

/**
 * Creator Hub growth panel: auto-matched producer bounties for the signed-in
 * creator. Recommendations are computed server-side (open bounties, minus the
 * creator's own posts and anything they already applied to, ranked by
 * creator-relevant categories). Each row carries an Apply action. The fetch
 * swallows its own error so an unavailable bounty service leaves the rest of
 * the hub usable (mirrors the other hub sections).
 */
export const CreatorHubBounties = (): JSX.Element => {
    const [bounties, setBounties] = useState<Bounty[] | null>(null);
    const [applied, setApplied] = useState<Record<string, ApplyStatus>>({});

    // Bias the server-side match toward the viewer's onboarding interests.
    const interestTags = useDiscoveryInterestTags();
    const categories = useMemo(() => interestTagsToBountyCategories(interestTags), [interestTags]);

    useEffect(() => {
        let cancelled = false;
        fetchRecommendedBounties(categories)
            .then((res) => {
                if (!cancelled) setBounties(res.bounties);
            })
            .catch(() => {
                if (!cancelled) setBounties([]);
            });
        return () => {
            cancelled = true;
        };
    }, [categories]);

    const onApply = (id: string) => {
        setApplied((prev) => ({ ...prev, [id]: 'applying' }));
        applyToBounty(id)
            .then(() => setApplied((prev) => ({ ...prev, [id]: 'applied' })))
            .catch(() => setApplied((prev) => ({ ...prev, [id]: 'error' })));
    };

    const list = bounties ?? [];

    return (
        <HubSection
            title="Matched bounties"
            subtitle="Producer bounties auto-matched to you — apply to start a collaboration."
            testId="creator-hub-bounties"
            shellRegion="creator-hub-bounties"
        >
            {bounties === null ? (
                <p style={hubEmptyStyle}>Loading matches…</p>
            ) : list.length === 0 ? (
                <p style={hubEmptyStyle} data-testid="creator-hub-bounties-empty">
                    No matched bounties right now. Check back as producers post work.
                </p>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {list.map((bounty) => {
                        const status = applied[bounty.id] ?? 'idle';
                        return (
                            <div
                                key={bounty.id}
                                style={rowStyle}
                                data-testid="creator-hub-bounty-row"
                            >
                                <span style={metaColStyle}>
                                    <span style={labelStyle}>
                                        {CATEGORY_LABELS[bounty.category]}
                                    </span>
                                    <span style={titleStyle}>{bounty.title}</span>
                                    <span style={rewardStyle}>{bounty.rewardSummary}</span>
                                </span>
                                <button
                                    type="button"
                                    style={applyButtonStyle}
                                    data-testid="creator-hub-bounty-apply"
                                    disabled={status === 'applying' || status === 'applied'}
                                    onClick={() => onApply(bounty.id)}
                                >
                                    {status === 'applied'
                                        ? 'Applied ✓'
                                        : status === 'applying'
                                        ? 'Applying…'
                                        : status === 'error'
                                        ? 'Retry'
                                        : 'Apply'}
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}
        </HubSection>
    );
};

export default CreatorHubBounties;
