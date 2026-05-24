import { parseCustomizationBundle, serializeCustomizationBundle } from '../../../lib/bmc-core';
import { useAtom, useAtomValue } from 'jotai';
import React, { useMemo, useState } from 'react';
import { StegoSettings } from '../steganography';
import { CreatorStudio } from './creator-studio';
import {
    accessibilitySettingsAtom,
    appearanceSettingsAtom,
    developerSettingsAtom,
    keybindsSettingsAtom,
    notificationSettingsAtom,
    privacySettingsAtom,
    voiceVideoSettingsAtom,
} from './settingsAtoms';
import { trackSettingsInteraction } from './settingsTelemetry';
import {
    createClientCustomizationBundle,
    customizationAtom,
    customizationStateFromBundle,
} from '../../state/customization';
import { themePreferenceAtom } from '../../state/theme-atoms';
import { downloadDebugBundle } from './debugBundle';

const DeveloperSettings = () => {
    const [settings, setSettings] = useAtom(developerSettingsAtom);
    const [customization, setCustomization] = useAtom(customizationAtom);
    const [appearance, setAppearance] = useAtom(appearanceSettingsAtom);
    const notifications = useAtomValue(notificationSettingsAtom);
    const privacy = useAtomValue(privacySettingsAtom);
    const accessibility = useAtomValue(accessibilitySettingsAtom);
    const voiceVideo = useAtomValue(voiceVideoSettingsAtom);
    const keybinds = useAtomValue(keybindsSettingsAtom);
    const [, setThemePreference] = useAtom(themePreferenceAtom);
    const [bundleGeneratedAt, setBundleGeneratedAt] = useState<string | null>(null);
    const [customizationBundleRaw, setCustomizationBundleRaw] = useState('');
    const [customizationTransferStatus, setCustomizationTransferStatus] = useState<string | null>(
        null,
    );

    const bundleOptions = useMemo(
        () => ({
            settings: {
                appearance,
                notifications,
                privacy,
                accessibility,
                voiceVideo,
                keybinds,
            },
            includeLocalStorage: settings.includeLocalStorageInBundle,
            includeFeatureFlags: settings.includeFeatureFlagsInBundle,
            featureFlags: {
                settingsFramework: true,
                developerDiagnostics: settings.diagnosticsEnabled,
            },
        }),
        [
            accessibility,
            appearance,
            keybinds,
            notifications,
            privacy,
            settings.diagnosticsEnabled,
            settings.includeFeatureFlagsInBundle,
            settings.includeLocalStorageInBundle,
            voiceVideo,
        ],
    );

    const downloadBundle = () => {
        downloadDebugBundle(bundleOptions);
        setBundleGeneratedAt(new Date().toISOString());
        trackSettingsInteraction('developer', 'download-debug-bundle', true);
    };

    const transferBundle = useMemo(
        () =>
            createClientCustomizationBundle({
                activePreset: customization.activePreset,
                features: customization.features,
                theme: appearance.theme,
            }),
        [appearance.theme, customization.activePreset, customization.features],
    );

    const exportCustomizationBundle = () => {
        const raw = serializeCustomizationBundle(transferBundle);
        setCustomizationBundleRaw(raw);
        setCustomizationTransferStatus(`Customization bundle ready (${transferBundle.activePreset}).`);
        trackSettingsInteraction('developer', 'export-customization-bundle', true);
    };

    const importCustomizationBundle = () => {
        const parsed = parseCustomizationBundle(customizationBundleRaw);
        if (!parsed) {
            setCustomizationTransferStatus('Customization bundle is invalid or unsupported.');
            trackSettingsInteraction('developer', 'import-customization-bundle', false);
            return;
        }

        setCustomization(customizationStateFromBundle(parsed));
        setAppearance((previous) => ({ ...previous, theme: parsed.theme }));
        setThemePreference(parsed.theme);
        setCustomizationBundleRaw(serializeCustomizationBundle(parsed));
        setCustomizationTransferStatus(
            `Imported ${parsed.source} customization bundle (${parsed.activePreset}).`,
        );
        trackSettingsInteraction('developer', 'import-customization-bundle', true);
    };

    return (
        <div style={{ display: 'grid', gap: 16 }}>
            <section style={{ display: 'grid', gap: 10 }}>
                <header>
                    <h3 style={{ marginBottom: 6 }}>Developer</h3>
                    <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
                        Diagnostics tools are gated and disabled by default.
                    </p>
                </header>

                <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                        type="checkbox"
                        checked={settings.diagnosticsEnabled}
                        onChange={(event) => {
                            setSettings((prev) => ({
                                ...prev,
                                diagnosticsEnabled: event.target.checked,
                            }));
                            trackSettingsInteraction(
                                'developer',
                                'diagnostics-enabled',
                                event.target.checked,
                            );
                        }}
                    />
                    Enable diagnostics
                </label>

                {settings.diagnosticsEnabled ? (
                    <>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <input
                                type="checkbox"
                                checked={settings.includeLocalStorageInBundle}
                                onChange={(event) =>
                                    setSettings((prev) => ({
                                        ...prev,
                                        includeLocalStorageInBundle: event.target.checked,
                                    }))
                                }
                            />
                            Include local storage keys
                        </label>

                        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <input
                                type="checkbox"
                                checked={settings.includeFeatureFlagsInBundle}
                                onChange={(event) =>
                                    setSettings((prev) => ({
                                        ...prev,
                                        includeFeatureFlagsInBundle: event.target.checked,
                                    }))
                                }
                            />
                            Include feature flags
                        </label>

                        <button type="button" onClick={downloadBundle} style={{ width: 'fit-content' }}>
                            Export debug bundle
                        </button>

                        <small style={{ color: 'var(--text-secondary)' }}>
                            {bundleGeneratedAt
                                ? `Last exported: ${bundleGeneratedAt}`
                                : 'No debug bundle exported yet.'}
                        </small>
                    </>
                ) : (
                    <small style={{ color: 'var(--text-secondary)' }}>
                        Enable diagnostics to access export and internal state tools.
                    </small>
                )}
            </section>

            <section style={{ display: 'grid', gap: 10 }}>
                <header>
                    <h3 style={{ marginBottom: 6 }}>Customization transfer</h3>
                    <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
                        Import bundles from Blackout Web and export the active client customization.
                    </p>
                </header>

                <div
                    style={{
                        border: '1px solid var(--border-default)',
                        borderRadius: 10,
                        padding: 12,
                        display: 'grid',
                        gap: 10,
                    }}
                >
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        <button
                            type="button"
                            onClick={exportCustomizationBundle}
                            style={{ width: 'fit-content' }}
                        >
                            Export customization bundle
                        </button>
                        <button
                            type="button"
                            onClick={importCustomizationBundle}
                            style={{ width: 'fit-content' }}
                        >
                            Import customization bundle
                        </button>
                    </div>

                    <textarea
                        value={customizationBundleRaw}
                        onChange={(event) => setCustomizationBundleRaw(event.target.value)}
                        placeholder="Paste a customization bundle from Blackout Web, or export the current client customization."
                        rows={12}
                        style={{
                            width: '100%',
                            borderRadius: 8,
                            border: '1px solid var(--border-default)',
                            background: 'var(--bg-input)',
                            color: 'var(--text-primary)',
                            padding: 10,
                            fontFamily: 'monospace',
                            resize: 'vertical',
                        }}
                    />

                    <small style={{ color: 'var(--text-secondary)' }}>
                        Active preset: {customization.activePreset}. Active theme: {appearance.theme}.
                    </small>
                    <small style={{ color: 'var(--text-secondary)' }}>
                        {customizationTransferStatus ??
                            'No customization bundle imported or exported yet.'}
                    </small>
                </div>
            </section>
            <StegoSettings />

            {settings.creatorStudioEnabled ? <CreatorStudio /> : null}

            <section style={{ display: 'grid', gap: 8 }}>
                <header>
                    <h3 style={{ marginBottom: 4 }}>Creator Studio</h3>
                    <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
                        Author themes, manifest plugins, code plugins, and asset packs and
                        publish them to a connected marketplace.
                    </p>
                </header>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                        type="checkbox"
                        checked={settings.creatorStudioEnabled}
                        onChange={(event) => {
                            setSettings((prev) => ({
                                ...prev,
                                creatorStudioEnabled: event.target.checked,
                            }));
                            trackSettingsInteraction(
                                'developer',
                                'creator-studio-enabled',
                                event.target.checked,
                            );
                        }}
                    />
                    Enable Creator Studio
                </label>
            </section>
        </div>
    );
};

export default DeveloperSettings;
