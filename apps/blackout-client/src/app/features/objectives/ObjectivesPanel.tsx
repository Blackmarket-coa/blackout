import { useState } from 'react';
import { ObjectiveCard } from './ObjectiveCard';
import { ObjectiveComposer } from './ObjectiveComposer';
import { useDenObjectives } from './useObjectives';

/**
 * Den-level "Shared goals" surface: the list of objectives the den is
 * advancing together, plus a composer to add one. Opt-in by design — a den
 * with no objectives renders a quiet prompt, never a nag.
 */
export function ObjectivesPanel({ roomId }: { roomId: string }) {
    const { data: objectives, loading } = useDenObjectives(roomId);
    const [composing, setComposing] = useState(false);

    return (
        <section style={{ display: 'grid', gap: 8 }} data-testid="objectives-panel">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <h3 style={{ margin: 0 }}>Shared goals</h3>
                <button
                    type="button"
                    onClick={() => setComposing((prev) => !prev)}
                    style={{
                        border: '1px solid var(--border-default)',
                        borderRadius: 8,
                        background: 'var(--bg-input)',
                        color: 'var(--text-primary)',
                        padding: '4px 10px',
                        fontSize: 12,
                    }}
                    data-testid="objectives-toggle-composer"
                >
                    {composing ? 'Close' : 'Add a goal'}
                </button>
            </div>

            {composing ? (
                <ObjectiveComposer roomId={roomId} onCreated={() => setComposing(false)} />
            ) : null}

            {objectives.map((objective) => (
                <ObjectiveCard key={objective.objectiveId} objective={objective} />
            ))}

            {!loading && objectives.length === 0 && !composing ? (
                <div style={{ color: 'var(--text-secondary)', fontSize: 12, padding: 4 }}>
                    No shared goals yet. Add one the whole den can advance together.
                </div>
            ) : null}
        </section>
    );
}

export default ObjectivesPanel;
