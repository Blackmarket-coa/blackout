import React, { useCallback, useEffect, useState } from 'react';
import {
    resolveLabsGate,
    type LabsFeatureDescriptor,
    type LabsGateState,
} from '@blackout/sdk';
import { useRegistryFetcher } from '../../core/features/RegistryFetcherProvider';

export type LabsFetcher = {
    fetchLabsFeatures: () => Promise<{ features: LabsFeatureDescriptor[] }>;
    setLabsFeatureEnabled: (featureId: string, enabled: boolean) => Promise<unknown>;
    fetchLabsGate: () => Promise<LabsGateState>;
    setDeveloperMode: (enabled: boolean) => Promise<unknown>;
};

type Props = {
    fetcher?: LabsFetcher;
};

const stub: LabsFetcher = {
    fetchLabsFeatures: async () => ({ features: [] }),
    setLabsFeatureEnabled: async () => ({}),
    fetchLabsGate: async () => ({
        visible: false,
        reason: 'developer_mode',
        breakdown: { configFlag: false, developerMode: false },
    }),
    setDeveloperMode: async () => ({}),
};

export function LabsPage({ fetcher: explicitFetcher }: Props) {
    const contextFetcher = useRegistryFetcher('labs');
    const fetcher = explicitFetcher ?? contextFetcher ?? stub;
    const [features, setFeatures] = useState<LabsFeatureDescriptor[]>([]);
    const [gate, setGate] = useState<LabsGateState>(
        resolveLabsGate({ configFlag: false, developerMode: false })
    );
    const [loadError, setLoadError] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);
    const [pending, setPending] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        setLoadError(null);
        try {
            const [featuresResponse, gateResponse] = await Promise.all([
                fetcher.fetchLabsFeatures(),
                fetcher.fetchLabsGate(),
            ]);
            setFeatures(featuresResponse.features ?? []);
            setGate(gateResponse);
        } catch (error) {
            setLoadError(error instanceof Error ? error.message : 'Failed to load labs.');
        }
    }, [fetcher]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const onToggleFeature = useCallback(
        async (feature: LabsFeatureDescriptor) => {
            setActionError(null);
            setPending(feature.id);
            try {
                await fetcher.setLabsFeatureEnabled(feature.id, !feature.enabled);
                await refresh();
            } catch (error) {
                setActionError(
                    error instanceof Error ? error.message : `Failed to toggle ${feature.id}.`
                );
            } finally {
                setPending(null);
            }
        },
        [fetcher, refresh]
    );

    const onToggleDeveloperMode = useCallback(async () => {
        const next = !gate.breakdown.developerMode;
        setActionError(null);
        setPending('developer-mode');
        try {
            await fetcher.setDeveloperMode(next);
            // Optimistic: derive the new gate from the existing breakdown.
            setGate(
                resolveLabsGate({
                    configFlag: gate.breakdown.configFlag,
                    developerMode: next,
                })
            );
        } catch (error) {
            setActionError(
                error instanceof Error ? error.message : 'Failed to toggle developer mode.'
            );
        } finally {
            setPending(null);
        }
    }, [fetcher, gate.breakdown.configFlag, gate.breakdown.developerMode]);

    return (
        <main
            data-testid="labs-page"
            style={{ padding: 16, display: 'grid', gap: 16 }}
        >
            <header>
                <h1 style={{ margin: 0 }}>Labs</h1>
                <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
                    Experimental + beta feature toggles. Visible only when the labs gate
                    resolves visible (`legacy.config.labs_gate` OR per-user developer mode).
                </p>
            </header>

            <section
                data-testid="labs-gate"
                style={{
                    border: '1px solid var(--border-default)',
                    borderRadius: 10,
                    padding: 12,
                    display: 'grid',
                    gap: 6,
                }}
            >
                <strong>Gate</strong>
                <small data-testid="labs-gate-summary">
                    Visible: <strong>{gate.visible ? 'yes' : 'no'}</strong> · reason:{' '}
                    <strong>{gate.reason}</strong> · config flag:{' '}
                    {gate.breakdown.configFlag ? 'on' : 'off'} · developer mode:{' '}
                    {gate.breakdown.developerMode ? 'on' : 'off'}
                </small>
                <button
                    type="button"
                    data-testid="labs-toggle-developer-mode"
                    onClick={() => void onToggleDeveloperMode()}
                    disabled={pending === 'developer-mode'}
                >
                    {gate.breakdown.developerMode
                        ? 'Disable developer mode'
                        : 'Enable developer mode'}
                </button>
            </section>

            {loadError ? (
                <p data-testid="labs-load-error" role="alert">
                    {loadError}
                </p>
            ) : null}
            {actionError ? (
                <p data-testid="labs-action-error" role="alert">
                    {actionError}
                </p>
            ) : null}

            {!gate.visible ? (
                <p
                    data-testid="labs-hidden-notice"
                    style={{ color: 'var(--text-secondary)' }}
                >
                    Labs are hidden by the gate. Enable developer mode (above) or ask an admin
                    to flip the config flag.
                </p>
            ) : (
                <section
                    data-testid="labs-features"
                    style={{
                        border: '1px solid var(--border-default)',
                        borderRadius: 10,
                        padding: 12,
                        display: 'grid',
                        gap: 6,
                    }}
                >
                    <strong>Features</strong>
                    {features.length === 0 ? (
                        <p
                            data-testid="labs-features-empty"
                            style={{ color: 'var(--text-secondary)' }}
                        >
                            No labs features available.
                        </p>
                    ) : (
                        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 4 }}>
                            {features.map((feature) => (
                                <li
                                    key={feature.id}
                                    data-testid={`labs-feature-${feature.id}`}
                                    style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        gap: 6,
                                    }}
                                >
                                    <span>
                                        {feature.label}
                                        {feature.beta ? ' · beta' : ''}
                                        {feature.group ? ` · ${feature.group}` : ''}
                                    </span>
                                    <button
                                        type="button"
                                        data-testid={`labs-toggle-${feature.id}`}
                                        onClick={() => void onToggleFeature(feature)}
                                        disabled={pending === feature.id}
                                    >
                                        {feature.enabled ? 'Disable' : 'Enable'}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>
            )}
        </main>
    );
}

export default LabsPage;
