import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    completeQuest,
    fetchActiveQuests,
    fetchMyQuestCompletions,
    type QuestCompletionRecord,
    type QuestDefinitionRecord,
} from './growthClient';

const rowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '10px 12px',
    borderRadius: 8,
    border: '1px solid var(--border-default, rgba(255,255,255,0.1))',
};

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/**
 * Quests route (`/growth/quests`). Drives the existing `fetchActiveQuests` /
 * `fetchMyQuestCompletions` / `completeQuest` growth-client wrappers: lists
 * active quests and lets the viewer mark uncompleted ones complete.
 */
export function QuestsPage(): JSX.Element {
    const [quests, setQuests] = useState<QuestDefinitionRecord[]>([]);
    const [completions, setCompletions] = useState<QuestCompletionRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [pending, setPending] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        setError(null);
        try {
            const [active, mine] = await Promise.all([
                fetchActiveQuests(),
                fetchMyQuestCompletions(),
            ]);
            setQuests(active.items);
            setCompletions(mine.items);
        } catch {
            setError('Could not load quests.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const completedIds = useMemo(
        () => new Set(completions.map((completion) => completion.questId)),
        [completions]
    );

    const onComplete = useCallback(async (questId: string) => {
        setPending(questId);
        setError(null);
        try {
            const res = await completeQuest(questId);
            setCompletions((prev) => [...prev, res.completion]);
        } catch {
            setError('Could not complete that quest.');
        } finally {
            setPending(null);
        }
    }, []);

    return (
        <main data-testid="growth-quests-page" style={{ padding: 16, display: 'grid', gap: 16 }}>
            <header>
                <h1 style={{ margin: 0 }}>Growth · Quests</h1>
                <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
                    Complete quests to earn tips and FBM credit.
                </p>
            </header>

            {error ? (
                <p role="alert" data-testid="growth-quests-error" style={{ color: 'var(--danger, #e74c3c)' }}>
                    {error}
                </p>
            ) : null}

            {loading ? (
                <p data-testid="growth-quests-loading">Loading…</p>
            ) : quests.length === 0 ? (
                <p data-testid="growth-quests-empty" style={{ color: 'var(--text-secondary)' }}>
                    No active quests right now.
                </p>
            ) : (
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
                    {quests.map((quest) => {
                        const done = completedIds.has(quest.id);
                        return (
                            <li key={quest.id} data-testid="growth-quest-row" style={rowStyle}>
                                <div style={{ flex: 1 }}>
                                    <strong>{quest.title}</strong>
                                    <p style={{ margin: '2px 0', color: 'var(--text-secondary)' }}>
                                        {quest.description}
                                    </p>
                                    <small>
                                        Reward: {money(quest.rewardCents)} · {quest.rewardKind}
                                    </small>
                                </div>
                                <button
                                    type="button"
                                    data-testid={`growth-quest-complete-${quest.id}`}
                                    disabled={done || pending === quest.id}
                                    onClick={() => void onComplete(quest.id)}
                                >
                                    {done
                                        ? 'Completed'
                                        : pending === quest.id
                                          ? 'Completing…'
                                          : 'Mark complete'}
                                </button>
                            </li>
                        );
                    })}
                </ul>
            )}
        </main>
    );
}

export default QuestsPage;
