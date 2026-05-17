import { useUserQuests, useDismissQuests } from './useQuests';
import {
    QUEST_IDS,
    type QuestId,
} from '@blackout/protocol';

/**
 * The onboarding quest sheet (J3).
 *
 * Per-user, one-time, dismissable. Renders a small card with the four
 * onboarding quests; each row marks complete the moment the underlying
 * action has happened. The brief is firm: gamification stops at the
 * onboarding boundary — no streaks, no XP, no leaderboards. The card
 * disappears when all four are done or when the user dismisses.
 *
 * Auto-detection runs upstream of this component (see questDetection.ts);
 * the host that mounts the sheet should call `useCompleteQuest` for each
 * detected completion. The sheet itself only handles dismissal.
 */
export interface QuestSheetProps {
    /** Optional callback fired when the user dismisses the sheet. */
    onDismiss?: () => void;
}

const QUEST_LABELS: Record<QuestId, { title: string; helper: string }> = {
    'first-round': {
        title: 'Open a Round',
        helper: 'Tap the Radial wheel → Round, ask the circle a question.',
    },
    'first-consent': {
        title: 'Cast your first 🌱',
        helper: 'React 🌱 / 🌾 / 🪨 on a consent proposal.',
    },
    'first-role-nomination': {
        title: 'Take on a role',
        helper: 'Nominate yourself (or someone) for a role and run the election.',
    },
    'first-domain': {
        title: 'Write a domain sentence',
        helper: 'One sentence in the playbook reveal — what does this circle decide?',
    },
};

const styles = {
    card: {
        border: '1px solid var(--border-default)',
        borderRadius: 12,
        background: 'var(--bg-surface)',
        padding: 12,
        display: 'grid',
        gap: 8,
    } as const,
    head: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
    } as const,
    row: (done: boolean) => ({
        display: 'flex',
        gap: 8,
        padding: '6px 0',
        opacity: done ? 0.55 : 1,
    }),
    checkbox: (done: boolean) => ({
        display: 'inline-block',
        width: 16,
        height: 16,
        borderRadius: 4,
        border: `1px solid ${done ? 'var(--accent-primary)' : 'var(--border-default)'}`,
        background: done ? 'var(--accent-primary)' : 'transparent',
        color: 'var(--bg-surface)',
        textAlign: 'center' as const,
        lineHeight: '14px',
        fontSize: 12,
    }),
    helper: { fontSize: 11, color: 'var(--text-secondary)' } as const,
    dismiss: {
        border: '1px solid var(--border-default)',
        borderRadius: 999,
        background: 'var(--bg-input)',
        color: 'var(--text-primary)',
        fontSize: 11,
        padding: '2px 8px',
        cursor: 'pointer',
    } as const,
};

export function QuestSheet({ onDismiss }: QuestSheetProps = {}) {
    const { payload, allComplete, dismissed } = useUserQuests();
    const dismiss = useDismissQuests();

    if (dismissed || allComplete) return null;

    const isDone = (id: QuestId) => payload.completedQuests.some((c) => c.id === id);

    const onDismissClick = async () => {
        await dismiss();
        onDismiss?.();
    };

    return (
        <section data-testid="quest-sheet" style={styles.card}>
            <header style={styles.head}>
                <div>
                    <strong>Find your feet</strong>
                    <div style={styles.helper}>
                        Four light steps to get the hang of this den. Skip anytime.
                    </div>
                </div>
                <button
                    type="button"
                    data-testid="quest-sheet-dismiss"
                    onClick={() => void onDismissClick()}
                    style={styles.dismiss}
                >
                    Dismiss
                </button>
            </header>
            <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                {QUEST_IDS.map((id) => {
                    const done = isDone(id);
                    return (
                        <li
                            key={id}
                            data-testid={`quest-row-${id}`}
                            style={styles.row(done)}
                        >
                            <span style={styles.checkbox(done)}>{done ? '✓' : ''}</span>
                            <div>
                                <div style={{ fontWeight: 600, fontSize: 13 }}>
                                    {QUEST_LABELS[id].title}
                                </div>
                                <div style={styles.helper}>{QUEST_LABELS[id].helper}</div>
                            </div>
                        </li>
                    );
                })}
            </ul>
        </section>
    );
}

export default QuestSheet;
