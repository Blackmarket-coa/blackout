import React, { type CSSProperties, useState } from 'react';
import {
    BOUNTY_CATEGORIES,
    BOUNTY_REWARD_TYPES,
    type BountyCategory,
    type BountyRewardType,
} from '@blackout/core';
import { createBounty } from '../../bounty/bountyClient';
import { HubSection } from '../components/HubSection';

const CATEGORY_LABELS: Record<BountyCategory, string> = {
    creator: 'Creator',
    coalition: 'Coalition',
    developer: 'Developer',
    tester: 'Tester',
    content: 'Content',
};

const REWARD_LABELS: Record<BountyRewardType, string> = {
    cash: 'Cash',
    revenue_share: 'Revenue share',
    product_token: 'Product token',
    store_credit: 'Store credit',
    digital_product: 'Digital product',
};

const fieldStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4 };
const labelStyle: CSSProperties = {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: 'var(--text-muted, #9ca3af)',
};
const inputStyle: CSSProperties = {
    padding: '8px 10px',
    borderRadius: 10,
    border: '1px solid var(--border-default, #374151)',
    background: 'var(--bg-input, #0f172a)',
    color: 'inherit',
    font: 'inherit',
};
const rowStyle: CSSProperties = { display: 'flex', gap: 12, flexWrap: 'wrap' };
const submitStyle: CSSProperties = {
    alignSelf: 'flex-start',
    padding: '8px 18px',
    borderRadius: 999,
    border: '1px solid var(--accent-primary, #2EF2C5)',
    background: 'var(--accent-primary, #2EF2C5)',
    color: '#06231d',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
};

type SubmitState = 'idle' | 'submitting' | 'success' | 'error';

/** Split a textarea into trimmed, non-empty lines. */
const lines = (value: string): string[] =>
    value
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);

/**
 * Creator Hub "Post a bounty" composer — the supply side of the bounty loop.
 * Lets a creator/producer publish a bounty that then appears on the home board
 * and in other creators' auto-matched recommendations. Minimal by design:
 * category, reward, title, summary, description, and optional
 * requirements/deliverables (one per line).
 */
export const CreatorHubPostBounty = (): JSX.Element => {
    const [category, setCategory] = useState<BountyCategory>('creator');
    const [rewardType, setRewardType] = useState<BountyRewardType>('cash');
    const [title, setTitle] = useState('');
    const [rewardSummary, setRewardSummary] = useState('');
    const [description, setDescription] = useState('');
    const [requirements, setRequirements] = useState('');
    const [deliverables, setDeliverables] = useState('');
    const [state, setState] = useState<SubmitState>('idle');

    const canSubmit =
        title.trim().length > 0 &&
        description.trim().length > 0 &&
        rewardSummary.trim().length > 0 &&
        state !== 'submitting';

    const onSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!canSubmit) return;
        setState('submitting');
        createBounty({
            category,
            rewardType,
            title: title.trim(),
            rewardSummary: rewardSummary.trim(),
            description: description.trim(),
            requirements: lines(requirements),
            deliverables: lines(deliverables),
        })
            .then(() => {
                setState('success');
                setTitle('');
                setRewardSummary('');
                setDescription('');
                setRequirements('');
                setDeliverables('');
            })
            .catch(() => setState('error'));
    };

    return (
        <HubSection
            title="Post a bounty"
            subtitle="Publish work for the community — it appears on the home board and in matched creators' feeds."
            testId="creator-hub-post-bounty"
            shellRegion="creator-hub-post-bounty"
        >
            <form
                style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 640 }}
                onSubmit={onSubmit}
                data-testid="post-bounty-form"
            >
                <div style={rowStyle}>
                    <label style={{ ...fieldStyle, flex: 1 }}>
                        <span style={labelStyle}>Category</span>
                        <select
                            style={inputStyle}
                            value={category}
                            data-testid="post-bounty-category"
                            onChange={(e) => setCategory(e.target.value as BountyCategory)}
                        >
                            {BOUNTY_CATEGORIES.map((c) => (
                                <option key={c} value={c}>
                                    {CATEGORY_LABELS[c]}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label style={{ ...fieldStyle, flex: 1 }}>
                        <span style={labelStyle}>Reward type</span>
                        <select
                            style={inputStyle}
                            value={rewardType}
                            data-testid="post-bounty-reward-type"
                            onChange={(e) => setRewardType(e.target.value as BountyRewardType)}
                        >
                            {BOUNTY_REWARD_TYPES.map((r) => (
                                <option key={r} value={r}>
                                    {REWARD_LABELS[r]}
                                </option>
                            ))}
                        </select>
                    </label>
                </div>
                <label style={fieldStyle}>
                    <span style={labelStyle}>Title</span>
                    <input
                        style={inputStyle}
                        value={title}
                        data-testid="post-bounty-title"
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="Need a TikTok campaign for tomato seedlings"
                    />
                </label>
                <label style={fieldStyle}>
                    <span style={labelStyle}>Reward summary</span>
                    <input
                        style={inputStyle}
                        value={rewardSummary}
                        data-testid="post-bounty-reward-summary"
                        onChange={(e) => setRewardSummary(e.target.value)}
                        placeholder="$50 + 10% revenue share"
                    />
                </label>
                <label style={fieldStyle}>
                    <span style={labelStyle}>Description</span>
                    <textarea
                        style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }}
                        value={description}
                        data-testid="post-bounty-description"
                        onChange={(e) => setDescription(e.target.value)}
                    />
                </label>
                <div style={rowStyle}>
                    <label style={{ ...fieldStyle, flex: 1 }}>
                        <span style={labelStyle}>Requirements (one per line)</span>
                        <textarea
                            style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }}
                            value={requirements}
                            data-testid="post-bounty-requirements"
                            onChange={(e) => setRequirements(e.target.value)}
                        />
                    </label>
                    <label style={{ ...fieldStyle, flex: 1 }}>
                        <span style={labelStyle}>Deliverables (one per line)</span>
                        <textarea
                            style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }}
                            value={deliverables}
                            data-testid="post-bounty-deliverables"
                            onChange={(e) => setDeliverables(e.target.value)}
                        />
                    </label>
                </div>
                <button
                    type="submit"
                    style={submitStyle}
                    data-testid="post-bounty-submit"
                    disabled={!canSubmit}
                >
                    {state === 'submitting' ? 'Posting…' : 'Post bounty'}
                </button>
                {state === 'success' ? (
                    <span data-testid="post-bounty-success" style={{ color: 'var(--accent-primary, #2EF2C5)' }}>
                        Bounty posted ✓
                    </span>
                ) : null}
                {state === 'error' ? (
                    <span data-testid="post-bounty-error" style={{ color: 'var(--danger, #ff5d5d)' }}>
                        Couldn&apos;t post the bounty. Try again.
                    </span>
                ) : null}
            </form>
        </HubSection>
    );
};

export default CreatorHubPostBounty;
