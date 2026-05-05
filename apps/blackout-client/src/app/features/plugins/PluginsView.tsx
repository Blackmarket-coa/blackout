import React, { useEffect, useMemo, useState } from 'react';
import { useAtom, useAtomValue } from 'jotai';
import { capabilityContextAtom } from '../../core/features/capabilityContext';
import { coreFeatureModules } from '../../core/features/coreModules';
import {
    featurePlugins,
    getAllFeaturePlugins,
    subscribeFeaturePlugins,
} from '../../core/features/plugins';
import {
    runtimePluginFeatureFlags,
    type FeatureFlags,
} from '../../core/features/featureFlags';
import { installedPluginsAtom } from '../monetization/install/installedPluginsAtom';

const RUNTIME_FLAG_KEYS = new Set<keyof FeatureFlags>(
    Object.values(runtimePluginFeatureFlags),
);

type PluginRow = {
    moduleId: string;
    name: string;
    flagKey?: keyof FeatureFlags;
    enabled: boolean;
    runtime: boolean;
};

export const PluginsView = () => {
    const [ctx, setCtx] = useAtom(capabilityContextAtom);
    const [pendingToggle, setPendingToggle] = useState<keyof FeatureFlags | null>(null);
    const installed = useAtomValue(installedPluginsAtom);
    const [allPlugins, setAllPlugins] = useState(() => getAllFeaturePlugins());
    useEffect(() => subscribeFeaturePlugins(setAllPlugins), []);

    const rows = useMemo<PluginRow[]>(
        () =>
            coreFeatureModules.map((module) => {
                const flagKey = module.flag as keyof FeatureFlags | undefined;
                const enabled = flagKey ? Boolean(ctx.flags[flagKey]) : true;
                return {
                    moduleId: module.feature.id,
                    name: module.feature.name,
                    flagKey,
                    enabled,
                    runtime: flagKey ? RUNTIME_FLAG_KEYS.has(flagKey) : false,
                };
            }),
        [ctx.flags],
    );

    const applyToggle = (key: keyof FeatureFlags, next: boolean) => {
        setCtx((prev) => ({
            ...prev,
            flags: { ...prev.flags, [key]: next },
        }));
    };

    const requestToggle = (row: PluginRow) => {
        if (!row.flagKey) return;
        if (row.runtime && row.enabled) {
            setPendingToggle(row.flagKey);
            return;
        }
        applyToggle(row.flagKey, !row.enabled);
    };

    const confirmToggle = () => {
        if (!pendingToggle) return;
        applyToggle(pendingToggle, false);
        setPendingToggle(null);
    };

    return (
        <section
            data-testid="plugins-view"
            data-shell-region="room"
            style={{
                height: '100%',
                width: '100%',
                display: 'flex',
                flexDirection: 'column',
                background: 'var(--bg-surface)',
                color: 'var(--text-primary)',
                overflow: 'hidden',
            }}
        >
            <header
                style={{
                    padding: '16px 20px',
                    borderBottom: '1px solid var(--border-default)',
                }}
            >
                <h1 style={{ margin: 0, fontSize: 20 }}>Plugins</h1>
                <p style={{ margin: '4px 0 0 0', color: 'var(--text-muted)', fontSize: 13 }}>
                    Browse registered feature modules and toggle their availability for this
                    session. Runtime shell plugins require confirmation before disabling.
                </p>
            </header>

            <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '16px 20px' }}>
                <table
                    aria-label="Registered plugins"
                    style={{
                        width: '100%',
                        borderCollapse: 'collapse',
                        fontSize: 14,
                    }}
                >
                    <thead>
                        <tr style={{ textAlign: 'left', color: 'var(--text-muted)' }}>
                            <th style={{ padding: '8px 0' }}>Plugin</th>
                            <th style={{ padding: '8px 0' }}>Flag</th>
                            <th style={{ padding: '8px 0' }}>Type</th>
                            <th style={{ padding: '8px 0', width: 120 }}>State</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row) => (
                            <tr
                                key={row.moduleId}
                                style={{ borderTop: '1px solid var(--border-default)' }}
                            >
                                <td style={{ padding: '10px 0' }}>
                                    <div style={{ fontWeight: 500 }}>{row.name}</div>
                                    <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                                        {row.moduleId}
                                    </div>
                                </td>
                                <td
                                    style={{
                                        padding: '10px 0',
                                        fontFamily:
                                            'JetBrains Mono, ui-monospace, monospace',
                                        fontSize: 12,
                                    }}
                                >
                                    {row.flagKey ?? '—'}
                                </td>
                                <td style={{ padding: '10px 0', fontSize: 12 }}>
                                    {row.runtime ? 'Runtime shell' : 'Feature'}
                                </td>
                                <td style={{ padding: '10px 0' }}>
                                    <button
                                        type="button"
                                        onClick={() => requestToggle(row)}
                                        disabled={!row.flagKey}
                                        aria-pressed={row.enabled}
                                        style={{
                                            border: '1px solid var(--border-default)',
                                            borderRadius: 999,
                                            padding: '4px 12px',
                                            background: row.enabled
                                                ? 'var(--accent-primary)'
                                                : 'var(--bg-input)',
                                            color: row.enabled
                                                ? 'var(--bg-surface)'
                                                : 'var(--text-primary)',
                                            cursor: row.flagKey ? 'pointer' : 'not-allowed',
                                            fontSize: 12,
                                        }}
                                    >
                                        {row.enabled ? 'On' : 'Off'}
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                <h2 style={{ marginTop: 32, fontSize: 16 }}>Module plugins</h2>
                {allPlugins.length === 0 ? (
                    <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                        No feature module plugins registered. Static plugins are added
                        through <code>featurePlugins</code>; marketplace installs appear
                        here once they have been verified and registered.
                    </p>
                ) : (
                    <ul style={{ paddingLeft: 20 }}>
                        {allPlugins.map((plugin) => (
                            <li key={plugin.id} style={{ padding: '4px 0' }}>
                                <code>{plugin.id}</code> — {plugin.modules.length} module(s)
                                {featurePlugins.find((p) => p.id === plugin.id)
                                    ? null
                                    : ' (marketplace)'}
                            </li>
                        ))}
                    </ul>
                )}

                <h2 style={{ marginTop: 32, fontSize: 16 }}>Marketplace installs</h2>
                {installed.length === 0 ? (
                    <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                        No marketplace plugins installed yet. Purchases from the
                        marketplace appear here once their signed bundles are verified.
                    </p>
                ) : (
                    <ul style={{ paddingLeft: 20 }}>
                        {installed.map((record) => (
                            <li key={record.entitlementId} style={{ padding: '6px 0' }}>
                                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                    <strong>{record.manifest.name}</strong>
                                    <code style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                        {record.manifest.id}@{record.manifest.version}
                                    </code>
                                    <span
                                        style={{
                                            fontSize: 11,
                                            padding: '1px 6px',
                                            borderRadius: 999,
                                            background:
                                                record.status === 'enabled'
                                                    ? 'var(--accent-primary, #4ECDC4)'
                                                    : 'var(--text-muted, #888)',
                                            color: '#fff',
                                        }}
                                    >
                                        {record.status}
                                    </span>
                                </div>
                                <small style={{ color: 'var(--text-muted)' }}>
                                    {record.manifest.artifactKind} ·{' '}
                                    {record.manifest.listing.providerId}
                                    {record.manifest.listing.publicSlug
                                        ? ` · /${record.manifest.listing.publicSlug}`
                                        : ''}
                                </small>
                                {record.lastError ? (
                                    <div
                                        style={{
                                            color: 'var(--danger, #b3261e)',
                                            fontSize: 12,
                                        }}
                                    >
                                        {record.lastError}
                                    </div>
                                ) : null}
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            {pendingToggle ? (
                <div
                    role="alertdialog"
                    aria-labelledby="plugin-toggle-title"
                    aria-describedby="plugin-toggle-desc"
                    style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(0,0,0,.5)',
                        display: 'grid',
                        placeItems: 'center',
                        zIndex: 100,
                    }}
                    onClick={() => setPendingToggle(null)}
                >
                    <div
                        onClick={(event) => event.stopPropagation()}
                        style={{
                            background: 'var(--bg-surface)',
                            border: '1px solid var(--border-default)',
                            borderRadius: 12,
                            padding: 20,
                            maxWidth: 420,
                            color: 'var(--text-primary)',
                        }}
                    >
                        <h3 id="plugin-toggle-title" style={{ marginTop: 0 }}>
                            Disable runtime plugin?
                        </h3>
                        <p id="plugin-toggle-desc" style={{ color: 'var(--text-muted)' }}>
                            <code>{pendingToggle}</code> drives shell-level behavior. Disabling it
                            will remount the affected surfaces and may interrupt your session.
                        </p>
                        <div
                            style={{
                                display: 'flex',
                                gap: 8,
                                justifyContent: 'flex-end',
                                marginTop: 16,
                            }}
                        >
                            <button
                                type="button"
                                onClick={() => setPendingToggle(null)}
                                style={{
                                    border: '1px solid var(--border-default)',
                                    borderRadius: 6,
                                    padding: '6px 14px',
                                    background: 'var(--bg-input)',
                                    color: 'var(--text-primary)',
                                    cursor: 'pointer',
                                }}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={confirmToggle}
                                style={{
                                    border: '1px solid var(--danger)',
                                    borderRadius: 6,
                                    padding: '6px 14px',
                                    background: 'var(--danger)',
                                    color: '#fff',
                                    cursor: 'pointer',
                                }}
                            >
                                Disable
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </section>
    );
};

export default PluginsView;
