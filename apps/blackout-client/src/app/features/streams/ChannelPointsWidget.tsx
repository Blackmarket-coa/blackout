import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import {
    fetchBalance,
    listRewards,
    redeemReward,
    type ChannelPointsReward,
} from './channelPointsClient';

/**
 * Viewer-facing channel-points widget for the LivestreamViewer. Shows the
 * viewer's balance on the stream's creator channel and the creator's active
 * rewards with redeem buttons. Self-hides when the channel has no rewards (or
 * the API is unavailable), so it's safe to always mount.
 */

const wrapStyle: CSSProperties = {
    padding: '8px 16px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
};

const headerRow: CSSProperties = {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 8,
};

const headingStyle: CSSProperties = { margin: 0, fontSize: 14, fontWeight: 700 };
const balanceStyle: CSSProperties = { fontSize: 13, color: 'var(--accent-primary, #1ABC9C)', fontWeight: 700 };

const rewardRow: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    padding: '8px 12px',
    border: '1px solid var(--border-default, #374151)',
    borderRadius: 8,
    background: 'var(--bg-input, #0f172a)',
    fontSize: 13,
};

const redeemBtn = (disabled: boolean): CSSProperties => ({
    padding: '4px 12px',
    borderRadius: 999,
    border: '1px solid var(--accent-primary, #1ABC9C)',
    background: disabled ? 'transparent' : 'var(--accent-primary, #1ABC9C)',
    color: disabled ? 'var(--text-muted, #9ca3af)' : '#04121d',
    fontSize: 12,
    fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
});

export const ChannelPointsWidget = ({
    channelId,
}: {
    channelId: string;
}): JSX.Element | null => {
    const [balance, setBalance] = useState<number | null>(null);
    const [rewards, setRewards] = useState<ChannelPointsReward[]>([]);
    const [notice, setNotice] = useState<string | null>(null);
    const [pendingId, setPendingId] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        Promise.all([
            listRewards(channelId),
            fetchBalance(channelId).catch(() => null),
        ])
            .then(([rewardsRes, balanceRes]) => {
                if (cancelled) return;
                setRewards(rewardsRes.rewards);
                if (balanceRes) setBalance(balanceRes.balance);
            })
            .catch(() => {
                /* non-fatal: widget self-hides */
            });
        return () => {
            cancelled = true;
        };
    }, [channelId]);

    const onRedeem = useCallback(
        async (reward: ChannelPointsReward) => {
            setNotice(null);
            setPendingId(reward.id);
            try {
                const res = await redeemReward(channelId, { rewardId: reward.id });
                setBalance(res.balance);
                setNotice(`Redeemed "${reward.title}".`);
            } catch (err) {
                setNotice(err instanceof Error ? err.message : 'Redemption failed.');
            } finally {
                setPendingId(null);
            }
        },
        [channelId],
    );

    if (rewards.length === 0) return null;

    return (
        <div style={wrapStyle} data-testid="channel-points-widget">
            <div style={headerRow}>
                <h2 style={headingStyle}>Channel points</h2>
                {balance !== null ? (
                    <span style={balanceStyle} data-testid="channel-points-balance">
                        {balance} pts
                    </span>
                ) : null}
            </div>
            {rewards.map((reward) => {
                const affordable = balance !== null && balance >= reward.cost;
                const disabled = pendingId !== null || !affordable;
                return (
                    <div key={reward.id} style={rewardRow} data-testid="channel-points-reward">
                        <span>
                            {reward.title}
                            <span style={{ color: 'var(--text-muted, #9ca3af)' }}> · {reward.cost} pts</span>
                        </span>
                        <button
                            type="button"
                            style={redeemBtn(disabled)}
                            disabled={disabled}
                            onClick={() => void onRedeem(reward)}
                            data-testid={`channel-points-redeem-${reward.id}`}
                        >
                            {pendingId === reward.id ? 'Redeeming…' : 'Redeem'}
                        </button>
                    </div>
                );
            })}
            {notice ? (
                <span style={{ fontSize: 12, color: 'var(--text-muted, #9ca3af)' }} data-testid="channel-points-notice">
                    {notice}
                </span>
            ) : null}
        </div>
    );
};

export default ChannelPointsWidget;
