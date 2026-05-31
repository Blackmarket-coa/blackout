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

            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 13 }}>
                Image metadata (EXIF/GPS) stripping and link tracking-parameter removal are now
                always on — they&apos;re privacy hygiene, not a toggle.
            </p>

            <div
                style={{ border: '1px solid var(--border-default)', borderRadius: 10, padding: 10 }}
            >
                <strong>Advanced privacy controls</strong>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
                    <input
                        type="checkbox"
                        checked={settings.avatarPerturbationEnabled}
                        disabled={!advancedEntitled}
                        onChange={(event) =>
                            setSettings((prev) => ({
                                ...prev,
                                avatarPerturbationEnabled: event.target.checked,
                            }))
                        }
                    />
                    Perturb avatars against facial recognition (Advanced, best-effort)
                </label>
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
