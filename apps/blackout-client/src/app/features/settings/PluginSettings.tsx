import React, { useMemo } from 'react';
import { useAtom } from 'jotai';
import { customizationAtom } from '../../state/customization';
import {
    runtimePluginFeatureFlags,
    type FeatureFlags,
} from '../../core/features/featureFlags';
import { buildRuntimePluginManifest } from '../../plugins/manifest';

const PLUGIN_LABELS: Record<string, { label: string; description: string }> = {
    'shell.legacy-layout': {
        label: 'Legacy shell layout',
        description: 'Restore the pre-canonical shell columns. Disable for the modern layout.',
    },
    'theme.legacy-overrides': {
        label: 'Legacy theme overrides',
        description: 'Allow legacy theme tokens to override the canonical palette.',
    },
    'composer.quick-actions': {
        label: 'Composer quick actions',
        description: 'Adds quick action chips to the message composer.',
    },
    'navigation.space-hierarchy': {
        label: 'Space hierarchy navigation',
        description: 'Renders nested canopy/den hierarchy in navigation.',
    },
    'notifications.adapter': {
        label: 'Notifications adapter',
        description: 'Enable the notifications adapter plugin.',
    },
    'right-panel.slots': {
        label: 'Right-panel plugin slots',
        description: 'Allow plugins to mount panes in the right panel.',
    },
    'live-interaction.bundle': {
        label: 'Live interaction bundle',
        description: 'Reactions, replies, threading, typing, read receipts.',
    },
};

export function PluginSettings() {
    const [customization, setCustomization] = useAtom(customizationAtom);

    const plugins = useMemo(
        () => buildRuntimePluginManifest(customization.features as FeatureFlags),
        [customization.features],
    );

    const togglePlugin = (flagKey: keyof FeatureFlags, next: boolean) => {
        setCustomization({
            ...customization,
            features: {
                ...customization.features,
                [flagKey]: next,
            },
        });
    };

    return (
        <section style={{ padding: 16, display: 'grid', gap: 12 }}>
            <header>
                <h2 style={{ margin: 0 }}>Plugins</h2>
                <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: 13 }}>
                    Toggle runtime plugins that extend the client. Changes apply immediately and
                    persist across sessions.
                </p>
            </header>

            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
                {plugins.map((plugin) => {
                    const flagKey = runtimePluginFeatureFlags[plugin.id];
                    const meta = PLUGIN_LABELS[plugin.id] ?? {
                        label: plugin.id,
                        description: '',
                    };
                    return (
                        <li
                            key={plugin.id}
                            style={{
                                border: '1px solid var(--border-default)',
                                borderRadius: 10,
                                padding: 12,
                                background: 'var(--bg-surface)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 12,
                            }}
                        >
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: 600 }}>{meta.label}</div>
                                <div
                                    style={{
                                        color: 'var(--text-secondary)',
                                        fontSize: 12,
                                        marginTop: 2,
                                    }}
                                >
                                    {meta.description}
                                </div>
                                <div
                                    style={{
                                        color: 'var(--text-secondary)',
                                        fontSize: 11,
                                        marginTop: 4,
                                        opacity: 0.7,
                                    }}
                                >
                                    {plugin.id}
                                </div>
                            </div>
                            <label
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 6,
                                    cursor: 'pointer',
                                }}
                            >
                                <input
                                    type="checkbox"
                                    checked={plugin.enabled}
                                    onChange={(event) =>
                                        togglePlugin(flagKey, event.target.checked)
                                    }
                                    aria-label={`Toggle plugin ${meta.label}`}
                                />
                                <span style={{ fontSize: 12 }}>
                                    {plugin.enabled ? 'Enabled' : 'Disabled'}
                                </span>
                            </label>
                        </li>
                    );
                })}
            </ul>
        </section>
    );
}

export default PluginSettings;
