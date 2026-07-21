import React, { useCallback, useEffect, useState } from 'react';
import { applySettingChange, type SettingsBucket, type SettingsValue } from '@blackout/sdk';
import { useRegistryFetcher } from '../../core/features/RegistryFetcherProvider';

export type SidebarFetcher = {
    fetchBucket: (scope: 'account', category: 'sidebar') => Promise<{ bucket: SettingsBucket }>;
    setSetting: (
        scope: 'account',
        category: 'sidebar',
        key: string,
        value: SettingsValue
    ) => Promise<unknown>;
};

type Props = {
    fetcher?: SidebarFetcher;
};

const stub: SidebarFetcher = {
    fetchBucket: async () => ({
        bucket: { scope: 'account', category: 'sidebar', values: {} },
    }),
    setSetting: async () => ({}),
};

/**
 * Mirrors `_port`'s `SidebarUserSettingsTab` meta-space toggles. The
 * canonical settings key is `Spaces.enabledMetaSpaces.<MetaSpace>`,
 * stored as a boolean. Defaults match `_port`'s defaults so existing
 * profiles keep their current visibility.
 */
const META_SPACES: Array<{ id: string; label: string; defaultEnabled: boolean }> = [
    { id: 'Home', label: 'Town Square', defaultEnabled: true },
    { id: 'Favourites', label: 'Favourites', defaultEnabled: false },
    { id: 'People', label: 'People', defaultEnabled: false },
    { id: 'Orphans', label: 'Orphans', defaultEnabled: false },
    { id: 'VideoRooms', label: 'Video rooms', defaultEnabled: false },
];

const settingKey = (metaSpaceId: string) => `Spaces.enabledMetaSpaces.${metaSpaceId}`;

export function SidebarPage({ fetcher: explicitFetcher }: Props) {
    const contextFetcher = useRegistryFetcher('sidebarSettings');
    const fetcher = explicitFetcher ?? contextFetcher ?? stub;
    const [bucket, setBucket] = useState<SettingsBucket>({
        scope: 'account',
        category: 'sidebar',
        values: {},
    });
    const [loadError, setLoadError] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);
    const [pending, setPending] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        setLoadError(null);
        try {
            const response = await fetcher.fetchBucket('account', 'sidebar');
            setBucket(response.bucket ?? { scope: 'account', category: 'sidebar', values: {} });
        } catch (error) {
            setLoadError(
                error instanceof Error ? error.message : 'Failed to load sidebar settings.'
            );
        }
    }, [fetcher]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const onToggle = useCallback(
        async (metaSpaceId: string, enabled: boolean) => {
            const key = settingKey(metaSpaceId);
            setActionError(null);
            setPending(key);
            try {
                await fetcher.setSetting('account', 'sidebar', key, enabled);
                setBucket((prev) =>
                    applySettingChange(prev, {
                        scope: 'account',
                        category: 'sidebar',
                        key,
                        value: enabled,
                    })
                );
            } catch (error) {
                setActionError(error instanceof Error ? error.message : `Failed to set ${key}.`);
            } finally {
                setPending(null);
            }
        },
        [fetcher]
    );

    const isEnabled = (metaSpaceId: string, fallback: boolean): boolean => {
        const value = bucket.values[settingKey(metaSpaceId)];
        return typeof value === 'boolean' ? value : fallback;
    };

    return (
        <main data-testid="sidebar-page" style={{ padding: 16, display: 'grid', gap: 16 }}>
            <header>
                <h1 style={{ margin: 0 }}>Sidebar</h1>
                <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
                    Meta-space toggles. Mirrors `_port`'s `SidebarUserSettingsTab`. Backed by
                    `setSetting` against the `Spaces.enabledMetaSpaces.*` keys.
                </p>
            </header>

            {loadError ? (
                <p data-testid="sidebar-load-error" role="alert">
                    {loadError}
                </p>
            ) : null}
            {actionError ? (
                <p data-testid="sidebar-action-error" role="alert">
                    {actionError}
                </p>
            ) : null}

            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
                {META_SPACES.map((space) => {
                    const enabled = isEnabled(space.id, space.defaultEnabled);
                    const key = settingKey(space.id);
                    return (
                        <li
                            key={space.id}
                            data-testid={`sidebar-row-${space.id}`}
                            style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                gap: 6,
                                border: '1px solid var(--border-default)',
                                borderRadius: 10,
                                padding: 8,
                            }}
                        >
                            <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                <input
                                    data-testid={`sidebar-toggle-${space.id}`}
                                    type="checkbox"
                                    checked={enabled}
                                    onChange={(event) =>
                                        void onToggle(space.id, event.target.checked)
                                    }
                                    disabled={pending === key}
                                />
                                {space.label}
                            </label>
                            {pending === key ? <small>Saving…</small> : null}
                        </li>
                    );
                })}
            </ul>
        </main>
    );
}

export default SidebarPage;
