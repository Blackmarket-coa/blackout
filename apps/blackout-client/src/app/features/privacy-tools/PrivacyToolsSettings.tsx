import { useAtom, useAtomValue } from 'jotai';
import { privacyToolsEntitledAtom, privacyToolsSettingsAtom } from './privacyToolsAtoms';
import { openPrivacyUpgradeFlow } from './privacyToolsTelemetry';

type PrivacyToolsSettingsProps = {
    requestClose?: () => void;
};

export function PrivacyToolsSettings({ requestClose }: PrivacyToolsSettingsProps = {}) {
    const [settings, setSettings] = useAtom(privacyToolsSettingsAtom);
    const advancedEntitled = useAtomValue(privacyToolsEntitledAtom);

    return (
        <section style={{ display: 'grid', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0 }}>Privacy Tools</h3>
                {requestClose ? (
                    <button type="button" onClick={requestClose}>
                        Close
                    </button>
                ) : null}
            </div>

            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                    type="checkbox"
                    checked={settings.exifStripEnabled}
                    onChange={(event) =>
                        setSettings((prev) => ({ ...prev, exifStripEnabled: event.target.checked }))
                    }
                />
                Strip metadata (EXIF/GPS) from images before upload
            </label>

            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                    type="checkbox"
                    checked={settings.linkSanitizeEnabled}
                    onChange={(event) =>
                        setSettings((prev) => ({
                            ...prev,
                            linkSanitizeEnabled: event.target.checked,
                        }))
                    }
                />
                Remove tracking parameters from links in messages
            </label>

            <div
                style={{ border: '1px solid var(--border-default)', borderRadius: 10, padding: 10 }}
            >
                <strong>Advanced privacy controls</strong>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
                    <input
                        type="checkbox"
                        checked={settings.advancedOptions.nonStrippableWarning}
                        disabled={!advancedEntitled}
                        onChange={(event) =>
                            setSettings((prev) => ({
                                ...prev,
                                advancedOptions: {
                                    ...prev.advancedOptions,
                                    nonStrippableWarning: event.target.checked,
                                },
                            }))
                        }
                    />
                    Warn when a file type can&apos;t be stripped (Advanced)
                </label>
                <button
                    type="button"
                    style={{ marginTop: 8 }}
                    disabled={advancedEntitled}
                    onClick={() => openPrivacyUpgradeFlow('settings_privacy_tools')}
                >
                    {advancedEntitled ? 'Advanced unlocked' : 'Upgrade for Advanced'}
                </button>
            </div>
        </section>
    );
}

export default PrivacyToolsSettings;
