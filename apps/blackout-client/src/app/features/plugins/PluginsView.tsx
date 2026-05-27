import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import type { PluginCapability, PluginManifest } from '@blackout/protocol';
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
import {
    installedPluginsAtom,
    type InstalledPluginRecord,
} from '../monetization/install/installedPluginsAtom';
import {
    pendingPluginInstallAtom,
    type PendingPluginInstall,
} from '../monetization/install/pendingPluginInstallAtom';
import {
    installEntitlement,
    uninstallPlugin,
} from '../monetization/install/pluginInstaller';
import { remountSandbox } from '../monetization/install/sandbox/sandboxRegistry';
import { useConfirm } from '../../components/confirm-dialog';

const RUNTIME_FLAG_KEYS = new Set<keyof FeatureFlags>(
    Object.values(runtimePluginFeatureFlags),
);

const CAPABILITY_LABELS: Record<PluginCapability, string> = {
    'shell.panel.read': 'Read shell panels',
    'shell.panel.write': 'Modify shell panels',
    'message.read': 'Read messages',
    'message.compose': 'Compose messages',
    'storage.read': 'Read local storage',
    'storage.write': 'Write local storage',
    'http.fetch': 'Make network requests',
    'ai.inference': 'Run AI inference (AI dens only)',
    'twitch.ext.identityShare': 'Request your Twitch identity',
    'twitch.ext.subscriptionStatus': 'Read your subscription status',
};

const CAPABILITY_DESCRIPTIONS: Record<PluginCapability, string> = {
    'shell.panel.read':
        'Lets the plugin see which panels and tabs are currently mounted in the app shell.',
    'shell.panel.write':
        'Lets the plugin add or modify panels in the app shell (sidebar, mobile tabs, right panel).',
    'message.read':
        'Lets the plugin read the contents of messages in dens you have joined.',
    'message.compose':
        'Lets the plugin draft and send messages on your behalf in dens you have joined.',
    'storage.read':
        'Lets the plugin read values it has previously stored in your local browser.',
    'storage.write':
        'Lets the plugin store data in your local browser. Data stays on this device.',
    'http.fetch':
        'Lets the plugin make outbound network requests. Use caution — the plugin can talk to any URL.',
    'ai.inference':
        'Lets the plugin run AI inference. Permitted only inside AI dens — the host blocks these calls everywhere else.',
    'twitch.ext.identityShare':
        'Lets a Twitch-compat extension request your real Twitch identity. Shared only after you opt in.',
    'twitch.ext.subscriptionStatus':
        'Lets a Twitch-compat extension read whether you subscribe to the channel.',
};

const HIGH_RISK_CAPABILITIES = new Set<PluginCapability>([
    'http.fetch',
    'message.compose',
    'storage.write',
    'shell.panel.write',
]);

const isHighRisk = (cap: PluginCapability): boolean => HIGH_RISK_CAPABILITIES.has(cap);

const summariseRiskTier = (capabilities: readonly PluginCapability[]): string => {
    if (capabilities.length === 0) return 'This plugin requests no special permissions.';
    const flags = {
        network: capabilities.includes('http.fetch'),
        compose: capabilities.includes('message.compose'),
        readMessages: capabilities.includes('message.read'),
        writeStorage: capabilities.includes('storage.write'),
        writeShell: capabilities.includes('shell.panel.write'),
    };
    const fragments: string[] = [];
    if (flags.readMessages) fragments.push('read your messages');
    if (flags.compose) fragments.push('send messages on your behalf');
    if (flags.network) fragments.push('make network requests');
    if (flags.writeStorage) fragments.push('store data on this device');
    if (flags.writeShell) fragments.push('modify the app shell');
    if (fragments.length === 0) return 'This plugin only requests read-only access to local data.';
    return `This plugin can ${fragments.join(', ')}.`;
};

const describeCapabilities = (capabilities: readonly PluginCapability[]): string => {
    if (capabilities.length === 0) return 'No special permissions';
    return capabilities.map((cap) => CAPABILITY_LABELS[cap] ?? cap).join(' · ');
};

const describeSurfaces = (manifest: {
    homepageCard?: unknown;
    pinnedNav?: unknown;
    rightPanel?: unknown;
    mobileTab?: unknown;
}): string | null => {
    const parts: string[] = [];
    if (manifest.homepageCard) parts.push('home card');
    if (manifest.pinnedNav) parts.push('pinned nav');
    if (manifest.rightPanel) parts.push('right panel');
    if (manifest.mobileTab) parts.push('mobile tab');
    return parts.length === 0 ? null : parts.join(' · ');
};

type PluginRow = {
    moduleId: string;
    name: string;
    flagKey?: keyof FeatureFlags;
    enabled: boolean;
    runtime: boolean;
};

const chipBaseStyle: React.CSSProperties = {
    border: '1px solid var(--border-default)',
    borderRadius: 999,
    padding: '2px 10px',
    fontSize: 11,
    cursor: 'pointer',
};

const InstallApprovalDialog = ({
    pending,
    onApprove,
    onCancel,
}: {
    pending: PendingPluginInstall;
    onApprove: (granted: PluginCapability[]) => Promise<void> | void;
    onCancel: () => void;
}) => {
    const manifest = pending.bundle.manifest;
    const declared = manifest.capabilities;
    const [selected, setSelected] = useState<Set<PluginCapability>>(
        () => new Set(declared),
    );
    const [showLowRisk, setShowLowRisk] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const highRiskCaps = declared.filter(isHighRisk);
    const lowRiskCaps = declared.filter((cap) => !isHighRisk(cap));
    const riskTier = summariseRiskTier(declared);

    const toggle = (cap: PluginCapability) => {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(cap)) next.delete(cap);
            else next.add(cap);
            return next;
        });
    };

    const handleApprove = async () => {
        setSubmitting(true);
        setError(null);
        try {
            await onApprove(declared.filter((cap) => selected.has(cap)));
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
            setSubmitting(false);
        }
    };

    const surfaces = describeSurfaces(manifest);

    return (
        <div
            role="alertdialog"
            aria-labelledby="plugin-install-title"
            aria-describedby="plugin-install-desc"
            data-testid="plugin-install-dialog"
            style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0,0,0,.5)',
                display: 'grid',
                placeItems: 'center',
                zIndex: 100,
            }}
            onClick={() => {
                if (!submitting) onCancel();
            }}
        >
            <div
                onClick={(event) => event.stopPropagation()}
                style={{
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-default)',
                    borderRadius: 12,
                    padding: 20,
                    maxWidth: 520,
                    width: 'min(520px, calc(100vw - 32px))',
                    color: 'var(--text-primary)',
                }}
            >
                <h3 id="plugin-install-title" style={{ marginTop: 0 }}>
                    Install {manifest.name}?
                </h3>
                <p
                    id="plugin-install-desc"
                    style={{ color: 'var(--text-muted)', marginTop: 0 }}
                >
                    <code>{manifest.id}@{manifest.version}</code> from{' '}
                    {manifest.listing.providerId}
                </p>
                {manifest.description ? (
                    <p style={{ marginTop: 8 }}>{manifest.description}</p>
                ) : null}

                <h4 style={{ marginTop: 16, marginBottom: 4 }}>Permissions</h4>
                <p
                    data-testid="plugin-install-risk-tier"
                    style={{
                        margin: '0 0 8px 0',
                        fontSize: 13,
                        color: 'var(--text-primary)',
                    }}
                >
                    {riskTier}
                </p>
                {declared.length === 0 ? null : (
                    <ul
                        style={{ listStyle: 'none', padding: 0, margin: 0 }}
                        data-testid="plugin-install-permissions"
                    >
                        {highRiskCaps.map((cap) => (
                            <li
                                key={cap}
                                style={{
                                    display: 'flex',
                                    gap: 10,
                                    alignItems: 'flex-start',
                                    padding: '6px 0',
                                    borderBottom: '1px solid var(--border-default)',
                                }}
                            >
                                <input
                                    type="checkbox"
                                    checked={selected.has(cap)}
                                    onChange={() => toggle(cap)}
                                    aria-label={CAPABILITY_LABELS[cap]}
                                    data-testid={`plugin-install-perm-${cap}`}
                                    style={{ marginTop: 3 }}
                                />
                                <span style={{ display: 'flex', flexDirection: 'column' }}>
                                    <strong style={{ fontSize: 13 }}>
                                        {CAPABILITY_LABELS[cap]}
                                    </strong>
                                    <small style={{ color: 'var(--text-muted)' }}>
                                        {CAPABILITY_DESCRIPTIONS[cap]}
                                    </small>
                                </span>
                            </li>
                        ))}
                        {lowRiskCaps.length > 0 && (
                            <li
                                style={{
                                    padding: '6px 0',
                                    borderBottom: showLowRisk
                                        ? '1px solid var(--border-default)'
                                        : 'none',
                                }}
                            >
                                <button
                                    type="button"
                                    onClick={() => setShowLowRisk((v) => !v)}
                                    aria-expanded={showLowRisk}
                                    data-testid="plugin-install-low-risk-toggle"
                                    style={{
                                        background: 'transparent',
                                        border: 'none',
                                        color: 'var(--text-muted)',
                                        fontSize: 12,
                                        cursor: 'pointer',
                                        padding: 0,
                                    }}
                                >
                                    {showLowRisk
                                        ? `Hide ${lowRiskCaps.length} read-only permission${lowRiskCaps.length === 1 ? '' : 's'}`
                                        : `Show ${lowRiskCaps.length} read-only permission${lowRiskCaps.length === 1 ? '' : 's'}`}
                                </button>
                            </li>
                        )}
                        {showLowRisk &&
                            lowRiskCaps.map((cap) => (
                                <li
                                    key={cap}
                                    style={{
                                        display: 'flex',
                                        gap: 10,
                                        alignItems: 'flex-start',
                                        padding: '6px 0',
                                        borderBottom: '1px solid var(--border-default)',
                                    }}
                                >
                                    <input
                                        type="checkbox"
                                        checked={selected.has(cap)}
                                        onChange={() => toggle(cap)}
                                        aria-label={CAPABILITY_LABELS[cap]}
                                        data-testid={`plugin-install-perm-${cap}`}
                                        style={{ marginTop: 3 }}
                                    />
                                    <span style={{ display: 'flex', flexDirection: 'column' }}>
                                        <strong style={{ fontSize: 13 }}>
                                            {CAPABILITY_LABELS[cap]}
                                        </strong>
                                        <small style={{ color: 'var(--text-muted)' }}>
                                            {CAPABILITY_DESCRIPTIONS[cap]}
                                        </small>
                                    </span>
                                </li>
                            ))}
                    </ul>
                )}

                {surfaces ? (
                    <>
                        <h4 style={{ marginTop: 16, marginBottom: 4 }}>Surfaces</h4>
                        <p
                            style={{ color: 'var(--text-muted)', fontSize: 13, margin: 0 }}
                            data-testid="plugin-install-surfaces"
                        >
                            This plugin will appear in: {surfaces}.
                        </p>
                    </>
                ) : null}

                {error ? (
                    <p
                        style={{ color: 'var(--danger, #b3261e)', marginTop: 12 }}
                        role="alert"
                    >
                        {error}
                    </p>
                ) : null}

                <div
                    style={{
                        display: 'flex',
                        gap: 8,
                        justifyContent: 'flex-end',
                        marginTop: 20,
                    }}
                >
                    <button
                        type="button"
                        onClick={onCancel}
                        disabled={submitting}
                        style={{
                            border: '1px solid var(--border-default)',
                            borderRadius: 6,
                            padding: '6px 14px',
                            background: 'var(--bg-input)',
                            color: 'var(--text-primary)',
                            cursor: submitting ? 'not-allowed' : 'pointer',
                        }}
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={handleApprove}
                        disabled={submitting}
                        data-testid="plugin-install-approve"
                        style={{
                            border: '1px solid var(--accent-primary)',
                            borderRadius: 6,
                            padding: '6px 14px',
                            background: 'var(--accent-primary)',
                            color: 'var(--bg-surface)',
                            cursor: submitting ? 'not-allowed' : 'pointer',
                        }}
                    >
                        {submitting ? 'Installing…' : 'Approve & install'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export const PluginsView = () => {
    const [ctx, setCtx] = useAtom(capabilityContextAtom);
    const [pendingToggle, setPendingToggle] = useState<keyof FeatureFlags | null>(null);
    const [installed, setInstalled] = useAtom(installedPluginsAtom);
    const confirm = useConfirm();
    const [pendingInstall, setPendingInstall] = useAtom(pendingPluginInstallAtom);
    const setInstalledList = useSetAtom(installedPluginsAtom);
    const [allPlugins, setAllPlugins] = useState(() => getAllFeaturePlugins());
    useEffect(() => subscribeFeaturePlugins(setAllPlugins), []);

    // The pendingToggle confirmation overlay is hand-rolled (no FocusTrap),
    // so capture the trigger when it opens and restore focus on close.
    const toggleTriggerRef = useRef<HTMLElement | null>(null);
    useEffect(() => {
        if (pendingToggle) {
            toggleTriggerRef.current = document.activeElement as HTMLElement | null;
            return;
        }
        const target = toggleTriggerRef.current;
        if (target && typeof target.focus === 'function') {
            target.focus();
        }
        toggleTriggerRef.current = null;
    }, [pendingToggle]);

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

    const handleApproveInstall = async (granted: PluginCapability[]) => {
        if (!pendingInstall) return;
        const bundle = pendingInstall.bundle;
        const result = await installEntitlement(pendingInstall.entitlement, {
            fetchSignedBundle: async () => bundle,
            approvedCapabilities: granted,
        });
        setInstalledList((prev) => {
            const next = prev.filter(
                (r) => r.entitlementId !== result.record.entitlementId,
            );
            next.push(result.record);
            return next;
        });
        setPendingInstall(null);
    };

    const toggleCapability = (
        record: InstalledPluginRecord,
        capability: PluginCapability,
    ) => {
        const granted = new Set(record.grantedCapabilities);
        if (granted.has(capability)) granted.delete(capability);
        else granted.add(capability);
        const nextGranted = record.manifest.capabilities.filter((cap) =>
            granted.has(cap),
        );
        const nextRecord: InstalledPluginRecord = {
            ...record,
            grantedCapabilities: nextGranted,
        };
        setInstalled((prev) =>
            prev.map((r) => (r.entitlementId === record.entitlementId ? nextRecord : r)),
        );
        if (
            nextRecord.manifest.artifactKind === 'code_plugin' &&
            nextRecord.status === 'enabled'
        ) {
            remountSandbox(nextRecord.manifest, nextGranted);
        }
    };

    const removePlugin = async (record: InstalledPluginRecord) => {
        const confirmed = await confirm({
            title: 'Uninstall plugin?',
            description: (
                <>
                    Are you sure you want to uninstall{' '}
                    <strong>{record.manifest.name || record.manifest.id}</strong>?
                    This removes its data and disables the feature for this account.
                </>
            ),
            confirmLabel: 'Uninstall',
        });
        if (!confirmed) return;
        uninstallPlugin(record);
        setInstalled((prev) =>
            prev.filter((r) => r.entitlementId !== record.entitlementId),
        );
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
                        {installed.map((record) => {
                            const grantedSet = new Set(record.grantedCapabilities);
                            return (
                                <li key={record.entitlementId} style={{ padding: '6px 0' }}>
                                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                        <strong>{record.manifest.name}</strong>
                                        <code style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                            {record.manifest.id}@{record.manifest.version}
                                        </code>
                                        <span
                                            aria-label={
                                                record.lastError
                                                    ? `${record.status} (with error)`
                                                    : record.status
                                            }
                                            style={{
                                                fontSize: 11,
                                                padding: '1px 6px',
                                                borderRadius: 999,
                                                background: record.lastError
                                                    ? 'var(--danger, #b3261e)'
                                                    : record.status === 'enabled'
                                                      ? 'var(--accent-primary, #4ECDC4)'
                                                      : 'var(--text-muted, #888)',
                                                color: '#fff',
                                            }}
                                        >
                                            {record.lastError ? '⚠ ' : ''}
                                            {record.status}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => void removePlugin(record)}
                                            data-testid={`plugin-remove-${record.manifest.id}`}
                                            style={{
                                                marginLeft: 'auto',
                                                border: '1px solid var(--danger, #b3261e)',
                                                background: 'transparent',
                                                color: 'var(--danger, #b3261e)',
                                                borderRadius: 6,
                                                padding: '2px 10px',
                                                fontSize: 11,
                                                cursor: 'pointer',
                                            }}
                                        >
                                            Remove
                                        </button>
                                    </div>
                                    <small style={{ color: 'var(--text-muted)' }}>
                                        {record.manifest.artifactKind} ·{' '}
                                        {record.manifest.listing.providerId}
                                        {record.manifest.listing.publicSlug
                                            ? ` · /${record.manifest.listing.publicSlug}`
                                            : ''}
                                    </small>
                                    <small
                                        data-testid={`plugin-permissions-${record.manifest.id}`}
                                        style={{
                                            display: 'block',
                                            color: 'var(--text-muted)',
                                            fontSize: 11,
                                            marginTop: 4,
                                        }}
                                    >
                                        Permissions: {describeCapabilities(record.manifest.capabilities)}
                                    </small>
                                    {record.manifest.capabilities.length > 0 ? (
                                        <div
                                            data-testid={`plugin-capability-chips-${record.manifest.id}`}
                                            style={{
                                                display: 'flex',
                                                flexWrap: 'wrap',
                                                gap: 6,
                                                marginTop: 6,
                                            }}
                                        >
                                            {record.manifest.capabilities.map((cap) => {
                                                const granted = grantedSet.has(cap);
                                                return (
                                                    <button
                                                        key={cap}
                                                        type="button"
                                                        onClick={() => toggleCapability(record, cap)}
                                                        aria-pressed={granted}
                                                        title={CAPABILITY_DESCRIPTIONS[cap]}
                                                        data-testid={`plugin-cap-${record.manifest.id}-${cap}`}
                                                        style={{
                                                            ...chipBaseStyle,
                                                            background: granted
                                                                ? 'var(--accent-primary)'
                                                                : 'var(--bg-input)',
                                                            color: granted
                                                                ? 'var(--bg-surface)'
                                                                : 'var(--text-primary)',
                                                        }}
                                                    >
                                                        {CAPABILITY_LABELS[cap] ?? cap}
                                                        {granted ? '' : ' (revoked)'}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    ) : null}
                                    {describeSurfaces(record.manifest) ? (
                                        <small
                                            data-testid={`plugin-surfaces-${record.manifest.id}`}
                                            style={{
                                                display: 'block',
                                                color: 'var(--text-muted)',
                                                fontSize: 11,
                                                marginTop: 4,
                                            }}
                                        >
                                            Surfaces: {describeSurfaces(record.manifest)}
                                        </small>
                                    ) : null}
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
                            );
                        })}
                    </ul>
                )}
            </div>

            {pendingInstall ? (
                <InstallApprovalDialog
                    pending={pendingInstall}
                    onApprove={handleApproveInstall}
                    onCancel={() => setPendingInstall(null)}
                />
            ) : null}

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
