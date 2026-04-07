import { useAtom } from 'jotai';
import { keybindsSettingsAtom } from './settingsAtoms';
import { trackSettingsInteraction } from './settingsTelemetry';

const KeybindsSettings = () => {
    const [settings, setSettings] = useAtom(keybindsSettingsAtom);

    const update = (key: keyof typeof settings, value: string) => {
        setSettings((prev) => ({ ...prev, [key]: value }));
        trackSettingsInteraction('keybinds', key, value);
    };

    return (
        <section style={{ display: 'grid', gap: 12 }}>
            <header>
                <h3 style={{ marginBottom: 6 }}>Keybinds</h3>
                <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
                    Customize keyboard shortcuts used in chat.
                </p>
            </header>

            {Object.entries(settings).map(([key, value]) => (
                <label key={key} style={{ display: 'grid', gap: 6 }}>
                    <span>{key}</span>
                    <input
                        value={value}
                        onChange={(event) => update(key as keyof typeof settings, event.target.value)}
                    />
                </label>
            ))}
        </section>
    );
};

export default KeybindsSettings;
