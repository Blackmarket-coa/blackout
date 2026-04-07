import { useAtom } from 'jotai';
import { accessibilitySettingsAtom } from './settingsAtoms';
import { trackSettingsInteraction } from './settingsTelemetry';

const AccessibilitySettings = () => {
    const [settings, setSettings] = useAtom(accessibilitySettingsAtom);

    const onToggle = (key: keyof typeof settings, value: boolean) => {
        setSettings((prev) => ({ ...prev, [key]: value }));
        trackSettingsInteraction('accessibility', key, value);
    };

    return (
        <section style={{ display: 'grid', gap: 12 }}>
            <header>
                <h3 style={{ marginBottom: 6 }}>Accessibility</h3>
                <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
                    Improve readability and reduce sensory load.
                </p>
            </header>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                    type="checkbox"
                    checked={settings.reducedMotion}
                    onChange={(event) => onToggle('reducedMotion', event.target.checked)}
                />
                Reduced motion
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                    type="checkbox"
                    checked={settings.highContrast}
                    onChange={(event) => onToggle('highContrast', event.target.checked)}
                />
                High contrast
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                    type="checkbox"
                    checked={settings.screenReaderHints}
                    onChange={(event) => onToggle('screenReaderHints', event.target.checked)}
                />
                Screen reader hints
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                    type="checkbox"
                    checked={settings.dyslexiaFriendlyFont}
                    onChange={(event) => onToggle('dyslexiaFriendlyFont', event.target.checked)}
                />
                Dyslexia-friendly font
            </label>
        </section>
    );
};

export default AccessibilitySettings;
