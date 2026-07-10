import React, { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { createCreatorQuest, endQuest, fetchMyQuests, type MyQuestRecord } from '../../growth';

/**
 * Creator-authored quests (OSS gap-fill enhancement): unlike Discord's
 * platform-locked Quests/Orbs, any Blackout creator can define quests for
 * their community. The server forces attribution to the authoring creator,
 * so this panel only collects what a creator can legitimately set. Mounted
 * inside the Rewards section of the Creator Hub.
 */

const panelStyle: CSSProperties = {
    display: 'grid',
    gap: 10,
    padding: 16,
    border: '1px solid var(--border-default, #374151)',
    borderRadius: 14,
    background: 'var(--bg-input, #0f172a)',
};

const rowStyle: CSSProperties = {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    gap: 10,
    fontSize: 12,
};

const inputStyle: CSSProperties = {
    padding: '6px 8px',
    border: '1px solid var(--border-default, #374151)',
    borderRadius: 8,
    background: 'var(--bg-surface, #111827)',
    color: 'var(--text-primary, #f8fafc)',
    fontSize: 12,
};

const buttonStyle: CSSProperties = {
    padding: '6px 14px',
    borderRadius: 999,
    border: '1px solid var(--border-default, #374151)',
    background: 'transparent',
    color: 'inherit',
    fontSize: 12,
    cursor: 'pointer',
};

const questRowStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    padding: '8px 12px',
    border: '1px solid var(--border-default, #374151)',
    borderRadius: 10,
    fontSize: 12,
};

const isEnded = (quest: MyQuestRecord): boolean =>
    Boolean(quest.endsAt && Date.parse(quest.endsAt) <= Date.now());

export const CreatorQuestsPanel = (): JSX.Element => {
    const [quests, setQuests] = useState<MyQuestRecord[]>([]);
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [rewardDollars, setRewardDollars] = useState('1');
    const [submitting, setSubmitting] = useState(false);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        fetchMyQuests()
            .then((response) => {
                if (!cancelled) setQuests(response.items);
            })
            .catch(() => undefined);
        return () => {
            cancelled = true;
        };
    }, []);

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        const rewardCents = Math.round(Number(rewardDollars) * 100);
        if (!title.trim() || !description.trim()) {
            setError('Quests need a title and a description.');
            return;
        }
        if (!Number.isFinite(rewardCents) || rewardCents < 0) {
            setError('Reward must be zero or a positive amount.');
            return;
        }
        setSubmitting(true);
        setError(null);
        try {
            const { quest } = await createCreatorQuest({
                title: title.trim(),
                description: description.trim(),
                rewardKind: 'fbm_credit',
                rewardCents,
            });
            setQuests((prev) => [{ ...quest, completions: 0 }, ...prev]);
            setTitle('');
            setDescription('');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not create the quest.');
        } finally {
            setSubmitting(false);
        }
    };

    const end = async (questId: string) => {
        setBusyId(questId);
        try {
            const { quest } = await endQuest(questId);
            setQuests((prev) =>
                prev.map((row) => (row.id === quest.id ? { ...row, ...quest } : row))
            );
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not end the quest.');
        } finally {
            setBusyId(null);
        }
    };

    return (
        <div style={panelStyle} data-testid="creator-quests-panel">
            <strong style={{ fontSize: 13 }}>Your quests</strong>
            <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted, #9ca3af)' }}>
                Define quests for your community — completions earn FBM credit, attributed to you.
            </p>

            <form style={rowStyle} onSubmit={submit} data-testid="creator-quest-form">
                <label style={{ display: 'grid', gap: 2 }}>
                    Title
                    <input
                        style={{ ...inputStyle, width: 180 }}
                        value={title}
                        disabled={submitting}
                        onChange={(e) => setTitle(e.currentTarget.value)}
                        placeholder="Share your first clip"
                    />
                </label>
                <label style={{ display: 'grid', gap: 2 }}>
                    Description
                    <input
                        style={{ ...inputStyle, width: 240 }}
                        value={description}
                        disabled={submitting}
                        onChange={(e) => setDescription(e.currentTarget.value)}
                        placeholder="Post a clip from any of my replays"
                    />
                </label>
                <label style={{ display: 'grid', gap: 2 }}>
                    Reward ($)
                    <input
                        style={{ ...inputStyle, width: 70 }}
                        type="number"
                        min="0"
                        step="0.5"
                        value={rewardDollars}
                        disabled={submitting}
                        onChange={(e) => setRewardDollars(e.currentTarget.value)}
                    />
                </label>
                <button
                    type="submit"
                    style={buttonStyle}
                    disabled={submitting}
                    data-testid="creator-quest-submit"
                >
                    {submitting ? 'Creating…' : 'Create quest'}
                </button>
            </form>
            {error ? (
                <span
                    style={{ fontSize: 12, color: 'var(--text-danger, #f87171)' }}
                    data-testid="creator-quest-error"
                >
                    {error}
                </span>
            ) : null}

            {quests.length > 0 ? (
                <div style={{ display: 'grid', gap: 6 }}>
                    {quests.map((quest) => (
                        <div key={quest.id} style={questRowStyle} data-testid="creator-quest-row">
                            <span>
                                <strong>{quest.title}</strong>
                                <span style={{ color: 'var(--text-muted, #9ca3af)' }}>
                                    {' '}
                                    · {quest.completions} completion
                                    {quest.completions === 1 ? '' : 's'}
                                    {isEnded(quest) ? ' · ended' : ''}
                                </span>
                            </span>
                            {!isEnded(quest) ? (
                                <button
                                    type="button"
                                    style={buttonStyle}
                                    disabled={busyId === quest.id}
                                    data-testid="creator-quest-end"
                                    onClick={() => void end(quest.id)}
                                >
                                    End
                                </button>
                            ) : null}
                        </div>
                    ))}
                </div>
            ) : (
                <span style={{ fontSize: 12, color: 'var(--text-muted, #9ca3af)' }}>
                    No quests yet — your first one shows up for everyone in Rewards.
                </span>
            )}
        </div>
    );
};

export default CreatorQuestsPanel;
