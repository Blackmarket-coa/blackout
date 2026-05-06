import { createElement, useCallback, useEffect, useState } from 'react';
import { runtimeFeatureFlags } from '../../../core/features/featureFlags';
import {
    completeQuest,
    fetchActiveQuests,
    fetchMyQuestCompletions,
    type QuestCompletionRecord,
    type QuestDefinitionRecord,
} from '../../growth';

const placeholderRows = [
    { title: 'Welcome streak', status: 'Completed', walletState: 'Reward settled' },
    { title: 'Creator referral', status: 'In progress', walletState: 'Pending validation' },
    { title: 'Seasonal challenge', status: 'Claimable', walletState: 'Ready to transfer' },
];

const cardStyle = {
    border: '1px solid var(--border-default)',
    borderRadius: 10,
    background: 'var(--bg-input)',
    padding: 10,
    display: 'grid',
    gap: 4,
} as const;

const PlaceholderQuests = () =>
    createElement(
        'section',
        { style: { display: 'grid', gap: 10 } },
        createElement(
            'p',
            { style: { margin: 0, color: 'var(--text-secondary)' } },
            'Expose quest lifecycle states together with wallet-facing payout status.'
        ),
        createElement(
            'div',
            { style: { display: 'grid', gap: 8 } },
            ...placeholderRows.map((quest) =>
                createElement(
                    'div',
                    { key: quest.title, style: cardStyle },
                    createElement('strong', undefined, quest.title),
                    createElement(
                        'small',
                        { style: { color: 'var(--text-secondary)' } },
                        `Lifecycle: ${quest.status}`
                    ),
                    createElement(
                        'small',
                        { style: { color: 'var(--text-secondary)' } },
                        `Wallet: ${quest.walletState}`
                    )
                )
            )
        )
    );

const formatRewardCents = (rewardCents: number, kind: string): string => {
    if (kind === 'fbm_credit') return `${(rewardCents / 100).toFixed(2)} FBM credit`;
    return `$${(rewardCents / 100).toFixed(2)}`;
};

const LiveQuests = () => {
    const [quests, setQuests] = useState<QuestDefinitionRecord[]>([]);
    const [completions, setCompletions] = useState<Map<string, QuestCompletionRecord>>(new Map());
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [claimingId, setClaimingId] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        setError(null);
        try {
            const [questResp, completionResp] = await Promise.all([
                fetchActiveQuests(),
                fetchMyQuestCompletions(),
            ]);
            setQuests(questResp.items);
            const map = new Map<string, QuestCompletionRecord>();
            for (const c of completionResp.items) map.set(c.questId, c);
            setCompletions(map);
        } catch (err) {
            setError('Unable to load active quests.');
            console.warn('[quests] refresh failed', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const handleClaim = useCallback(
        async (questId: string) => {
            setClaimingId(questId);
            try {
                await completeQuest(questId);
                await refresh();
            } catch (err) {
                setError('Could not claim quest reward.');
                console.warn('[quests] claim failed', err);
            } finally {
                setClaimingId(null);
            }
        },
        [refresh]
    );

    if (loading) {
        return createElement(
            'section',
            { style: { display: 'grid', gap: 10 } },
            createElement(
                'p',
                { style: { margin: 0, color: 'var(--text-secondary)' } },
                'Loading active quests…'
            )
        );
    }

    return createElement(
        'section',
        { style: { display: 'grid', gap: 10 } },
        createElement(
            'p',
            { style: { margin: 0, color: 'var(--text-secondary)' } },
            'Live quest ledger — claim a reward when you have completed the criteria.'
        ),
        error
            ? createElement('p', { style: { margin: 0, color: 'var(--accent-warning)' } }, error)
            : null,
        quests.length === 0
            ? createElement(
                  'p',
                  { style: { margin: 0, color: 'var(--text-secondary)' } },
                  'No active quests right now. Check back later.'
              )
            : createElement(
                  'div',
                  { style: { display: 'grid', gap: 8 } },
                  ...quests.map((quest) => {
                      const completion = completions.get(quest.id);
                      const settled = completion?.rewardTipId != null;
                      const walletState = settled
                          ? 'Reward settled'
                          : completion
                          ? 'Claimed — awaiting webhook'
                          : 'Available to claim';
                      return createElement(
                          'div',
                          { key: quest.id, style: cardStyle },
                          createElement('strong', undefined, quest.title),
                          createElement(
                              'small',
                              { style: { color: 'var(--text-secondary)' } },
                              quest.description
                          ),
                          createElement(
                              'small',
                              { style: { color: 'var(--text-secondary)' } },
                              `Reward: ${formatRewardCents(quest.rewardCents, quest.rewardKind)}`
                          ),
                          createElement(
                              'small',
                              { style: { color: 'var(--text-secondary)' } },
                              `Wallet: ${walletState}`
                          ),
                          completion
                              ? null
                              : createElement(
                                    'button',
                                    {
                                        type: 'button',
                                        onClick: () => {
                                            void handleClaim(quest.id);
                                        },
                                        disabled: claimingId === quest.id,
                                        style: {
                                            justifySelf: 'start',
                                            marginTop: 6,
                                            padding: '4px 12px',
                                            borderRadius: 6,
                                            border: '1px solid var(--border-default)',
                                            background: 'var(--bg-surface)',
                                            color: 'var(--text-primary)',
                                            cursor: claimingId === quest.id ? 'wait' : 'pointer',
                                        },
                                    },
                                    claimingId === quest.id ? 'Claiming…' : 'Claim'
                                )
                      );
                  })
              )
    );
};

export const QuestsSlice = () =>
    runtimeFeatureFlags.growthQuestsUi
        ? createElement(LiveQuests)
        : createElement(PlaceholderQuests);
