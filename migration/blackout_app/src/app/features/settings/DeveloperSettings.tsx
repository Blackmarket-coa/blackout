import { useAtom, useAtomValue } from 'jotai';
import { useMemo, useState } from 'react';
import { StegoSettings } from '../steganography';
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

const DeveloperSettings = () => {
    const [settings, setSettings] = useAtom(developerSettingsAtom);
    const appearance = useAtomValue(appearanceSettingsAtom);
    const notifications = useAtomValue(notificationSettingsAtom);
    const privacy = useAtomValue(privacySettingsAtom);
    const accessibility = useAtomValue(accessibilitySettingsAtom);
    const voiceVideo = useAtomValue(voiceVideoSettingsAtom);
    const keybinds = useAtomValue(keybindsSettingsAtom);
    const [bundleGeneratedAt, setBundleGeneratedAt] = useState<string | null>(null);

    const diagnostics = useMemo(
        () => ({
            generatedAt: new Date().toISOString(),
            url: typeof window !== 'undefined' ? window.location.href : 'unknown',
            userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
            viewport:
                typeof window !== 'undefined'
                    ? { width: window.innerWidth, height: window.innerHeight }
                    : { width: 0, height: 0 },
            settings: {
                appearance,
                notifications,
                privacy,
                accessibility,
                voiceVideo,
                keybinds,
            },
            localStorage:
                settings.includeLocalStorageInBundle && typeof window !== 'undefined'
                    ? Object.fromEntries(
                          Object.keys(window.localStorage)
                              .filter((key) => key.startsWith('blackout.'))
                              .map((key) => [key, window.localStorage.getItem(key)]),
                      )
                    : undefined,
            featureFlags: settings.includeFeatureFlagsInBundle
                ? {
                      settingsFramework: true,
                      developerDiagnostics: settings.diagnosticsEnabled,
                  }
                : undefined,
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
        const blob = new Blob([JSON.stringify(diagnostics, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `blackout-debug-bundle-${Date.now()}.json`;
        anchor.click();
        URL.revokeObjectURL(url);
        setBundleGeneratedAt(new Date().toISOString());
        trackSettingsInteraction('developer', 'download-debug-bundle', true);
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
            <StegoSettings />
        </div>
    );
};

export default DeveloperSettings;
