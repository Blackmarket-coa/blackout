import { useAtom } from 'jotai';
import { monetizationThemePacksSettingsAtom } from './settingsAtoms';
import { trackSettingsInteraction } from './settingsTelemetry';

const MonetizationThemePacksSettings = () => {
    const [settings, setSettings] = useAtom(monetizationThemePacksSettingsAtom);

    return (
        <section style={{ display: 'grid', gap: 12 }}>
            <header>
                <h3 style={{ marginBottom: 6 }}>Theme-pack commercialization</h3>
                <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
                    Control sales, drops, and visibility for commercial theme packs.
                </p>
            </header>

            {[
                ['allowThemePackSales', 'Allow paid theme-pack sales'],
                ['allowLimitedEditionDrops', 'Allow limited-edition drops'],
                ['showOwnedPacksInPicker', 'Show owned packs in theme picker'],
                ['enableRevenueShareBadges', 'Show revenue-share badges'],
            ].map(([key, label]) => (
                <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                        type="checkbox"
                        checked={settings[key as keyof typeof settings] as boolean}
                        onChange={(event) => {
                            const nextValue = event.target.checked;
                            setSettings((prev) => ({ ...prev, [key]: nextValue }));
                            trackSettingsInteraction('monetization-theme-packs', key, nextValue);
                        }}
                    />
                    {label}
                </label>
            ))}
        </section>
    );
};

export default MonetizationThemePacksSettings;
