import React, { useCallback, useEffect, useState } from 'react';
import type { TownhallLifecyclePayload, TownhallLifecyclePhase } from '@blackout/sdk';
import { useRegistryFetcher } from '../../core/features/RegistryFetcherProvider';

export type TownhallFetcher = {
    listTownhalls: () => Promise<{ townhalls: TownhallLifecyclePayload[] }>;
    transitionTownhall: (
        townhallId: string,
        input: { phase: TownhallLifecyclePhase; cancellationReason?: string }
    ) => Promise<unknown>;
};

type Props = {
    fetcher?: TownhallFetcher;
};

const stub: TownhallFetcher = {
    listTownhalls: async () => ({ townhalls: [] }),
    transitionTownhall: async () => ({}),
};

const PHASES: TownhallLifecyclePhase[] = ['scheduled', 'live', 'archived', 'cancelled'];

export function TownhallPage({ fetcher: explicitFetcher }: Props) {
    const contextFetcher = useRegistryFetcher('townhall');
    const fetcher = explicitFetcher ?? contextFetcher ?? stub;
    const [townhalls, setTownhalls] = useState<TownhallLifecyclePayload[]>([]);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);
    const [pending, setPending] = useState<string | null>(null);
    const [phaseDraft, setPhaseDraft] = useState<Record<string, TownhallLifecyclePhase>>({});
    const [reasonDraft, setReasonDraft] = useState<Record<string, string>>({});

    const refresh = useCallback(async () => {
        setLoadError(null);
        try {
            const response = await fetcher.listTownhalls();
            setTownhalls(response.townhalls ?? []);
        } catch (error) {
            setLoadError(error instanceof Error ? error.message : 'Failed to load townhalls.');
        }
    }, [fetcher]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const onTransition = useCallback(
        async (townhallId: string) => {
            const phase = phaseDraft[townhallId] ?? 'live';
            const reason = reasonDraft[townhallId]?.trim();
            setActionError(null);
            setPending(townhallId);
            try {
                await fetcher.transitionTownhall(townhallId, {
                    phase,
                    ...(phase === 'cancelled' && reason ? { cancellationReason: reason } : {}),
                });
                await refresh();
            } catch (error) {
                setActionError(
                    error instanceof Error ? error.message : `Failed to transition ${townhallId}.`
                );
            } finally {
                setPending(null);
            }
        },
        [fetcher, phaseDraft, reasonDraft, refresh]
    );

    return (
        <main data-testid="townhall-page" style={{ padding: 16, display: 'grid', gap: 16 }}>
            <header>
                <h1 style={{ margin: 0 }}>Townhall ops</h1>
                <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
                    Townhall directory + phase transitions. Backed by `listTownhalls` /
                    `transitionTownhall` and the BKL-010 lifecycle envelope.
                </p>
            </header>

            {loadError ? (
                <p data-testid="townhall-load-error" role="alert">
                    {loadError}
                </p>
            ) : null}
            {actionError ? (
                <p data-testid="townhall-action-error" role="alert">
                    {actionError}
                </p>
            ) : null}

            {townhalls.length === 0 ? (
                <p data-testid="townhall-empty" style={{ color: 'var(--text-secondary)' }}>
                    No townhalls yet.
                </p>
            ) : (
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
                    {townhalls.map((townhall) => {
                        const id = townhall.townhallId;
                        const phase = phaseDraft[id] ?? 'live';
                        return (
                            <li
                                key={id}
                                data-testid={`townhall-row-${id}`}
                                data-current-phase={townhall.phase}
                                style={{
                                    border: '1px solid var(--border-default)',
                                    borderRadius: 10,
                                    padding: 10,
                                    display: 'grid',
                                    gap: 4,
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <strong>{townhall.topic}</strong>
                                    <small>
                                        {townhall.phase} · {townhall.occurredAt}
                                    </small>
                                </div>
                                <label>
                                    Next phase
                                    <select
                                        data-testid={`townhall-phase-${id}`}
                                        value={phase}
                                        onChange={(event) =>
                                            setPhaseDraft((prev) => ({
                                                ...prev,
                                                [id]: event.target.value as TownhallLifecyclePhase,
                                            }))
                                        }
                                    >
                                        {PHASES.map((value) => (
                                            <option key={value} value={value}>
                                                {value}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                                {phase === 'cancelled' ? (
                                    <label>
                                        Cancellation reason
                                        <input
                                            data-testid={`townhall-reason-${id}`}
                                            value={reasonDraft[id] ?? ''}
                                            onChange={(event) =>
                                                setReasonDraft((prev) => ({
                                                    ...prev,
                                                    [id]: event.target.value,
                                                }))
                                            }
                                        />
                                    </label>
                                ) : null}
                                <button
                                    type="button"
                                    data-testid={`townhall-transition-${id}`}
                                    onClick={() => void onTransition(id)}
                                    disabled={pending === id}
                                >
                                    {pending === id ? 'Transitioning…' : 'Transition'}
                                </button>
                            </li>
                        );
                    })}
                </ul>
            )}
        </main>
    );
}

export default TownhallPage;
