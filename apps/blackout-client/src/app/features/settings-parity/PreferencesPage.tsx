import React, { useCallback, useEffect, useState } from 'react';
import {
    applySettingChange,
    type SettingsBucket,
    type SettingsScope,
    type SettingsValue,
} from '@blackout/sdk';

export type PreferencesFetcher = {
    fetchBucket: (
        scope: SettingsScope,
        category: 'preferences'
    ) => Promise<{ bucket: SettingsBucket }>;
    setSetting: (
        scope: SettingsScope,
        category: 'preferences',
        key: string,
        value: SettingsValue
    ) => Promise<unknown>;
};

type Props = {
    fetcher?: PreferencesFetcher;
};

const stub: PreferencesFetcher = {
    fetchBucket: async () => ({
        bucket: { scope: 'device', category: 'preferences', values: {} },
    }),
    setSetting: async () => ({}),
};

const SCOPES: SettingsScope[] = ['device', 'account'];

export function PreferencesPage({ fetcher = stub }: Props) {
    const [scope, setScope] = useState<SettingsScope>('device');
    const [bucket, setBucket] = useState<SettingsBucket>({
        scope: 'device',
        category: 'preferences',
        values: {},
    });
    const [loadError, setLoadError] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);
    const [pending, setPending] = useState<string | null>(null);
    const [draftKey, setDraftKey] = useState('');
    const [draftValue, setDraftValue] = useState('');

    const refresh = useCallback(
        async (nextScope: SettingsScope = scope) => {
            setLoadError(null);
            try {
                const response = await fetcher.fetchBucket(nextScope, 'preferences');
                setBucket(
                    response.bucket ?? {
                        scope: nextScope,
                        category: 'preferences',
                        values: {},
                    }
                );
            } catch (error) {
                setLoadError(
                    error instanceof Error ? error.message : 'Failed to load preferences.'
                );
            }
        },
        [fetcher, scope]
    );

    useEffect(() => {
        void refresh(scope);
    }, [refresh, scope]);

    const onSet = useCallback(
        async (key: string, value: SettingsValue) => {
            setActionError(null);
            setPending(key);
            try {
                await fetcher.setSetting(scope, 'preferences', key, value);
                // Optimistic local merge mirroring server's emitted envelope.
                setBucket((prev) =>
                    applySettingChange(prev, {
                        scope,
                        category: 'preferences',
                        key,
                        value,
                    })
                );
            } catch (error) {
                setActionError(
                    error instanceof Error ? error.message : `Failed to set ${key}.`
                );
            } finally {
                setPending(null);
            }
        },
        [fetcher, scope]
    );

    const onAddDraft = useCallback(
        async (event: React.FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            const key = draftKey.trim();
            if (!key) {
                setActionError('Key is required.');
                return;
            }
            await onSet(key, draftValue);
            setDraftKey('');
            setDraftValue('');
        },
        [draftKey, draftValue, onSet]
    );

    return (
        <main
            data-testid="preferences-page"
            style={{ padding: 16, display: 'grid', gap: 16 }}
        >
            <header>
                <h1 style={{ margin: 0 }}>Preferences</h1>
                <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
                    Per-scope user preferences. Backed by the BKL-007 settings SDK.
                </p>
            </header>

            <label style={{ display: 'grid', gap: 4 }}>
                Scope
                <select
                    data-testid="preferences-scope"
                    value={scope}
                    onChange={(event) => setScope(event.target.value as SettingsScope)}
                >
                    {SCOPES.map((value) => (
                        <option key={value} value={value}>
                            {value}
                        </option>
                    ))}
                </select>
            </label>

            {loadError ? (
                <p data-testid="preferences-load-error" role="alert">
                    {loadError}
                </p>
            ) : null}
            {actionError ? (
                <p data-testid="preferences-action-error" role="alert">
                    {actionError}
                </p>
            ) : null}

            <section
                data-testid="preferences-bucket"
                style={{
                    border: '1px solid var(--border-default)',
                    borderRadius: 10,
                    padding: 12,
                    display: 'grid',
                    gap: 6,
                }}
            >
                <strong>Current values ({scope})</strong>
                {Object.keys(bucket.values).length === 0 ? (
                    <p
                        data-testid="preferences-bucket-empty"
                        style={{ color: 'var(--text-secondary)' }}
                    >
                        No preference overrides at this scope.
                    </p>
                ) : (
                    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 4 }}>
                        {Object.entries(bucket.values).map(([key, value]) => (
                            <li
                                key={key}
                                data-testid={`preferences-row-${key}`}
                                style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    gap: 6,
                                }}
                            >
                                <span>
                                    <strong>{key}</strong>: <code>{JSON.stringify(value)}</code>
                                </span>
                                <button
                                    type="button"
                                    data-testid={`preferences-clear-${key}`}
                                    onClick={() => void onSet(key, null)}
                                    disabled={pending === key}
                                >
                                    {pending === key ? 'Clearing…' : 'Clear'}
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            <form
                data-testid="preferences-add-form"
                onSubmit={onAddDraft}
                style={{
                    border: '1px solid var(--border-default)',
                    borderRadius: 10,
                    padding: 12,
                    display: 'grid',
                    gap: 6,
                }}
            >
                <strong>Set a preference</strong>
                <label>
                    Key
                    <input
                        data-testid="preferences-draft-key"
                        value={draftKey}
                        onChange={(event) => setDraftKey(event.target.value)}
                    />
                </label>
                <label>
                    Value (string)
                    <input
                        data-testid="preferences-draft-value"
                        value={draftValue}
                        onChange={(event) => setDraftValue(event.target.value)}
                    />
                </label>
                <button
                    type="submit"
                    data-testid="preferences-draft-submit"
                    disabled={Boolean(pending)}
                >
                    Save
                </button>
            </form>
        </main>
    );
}

export default PreferencesPage;
