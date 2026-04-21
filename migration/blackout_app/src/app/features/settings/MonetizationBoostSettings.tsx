import { useEffect } from 'react';
import { useAtom } from 'jotai';
import { monetizationBoostSettingsAtom } from './settingsAtoms';
import { getMonetizationRouteMetadata } from './monetizationTelemetry';
import { trackMonetizationTelemetry, trackSettingsInteraction } from './settingsTelemetry';

const MonetizationBoostSettings = () => {
    const [settings, setSettings] = useAtom(monetizationBoostSettingsAtom);

    useEffect(() => {
        trackMonetizationTelemetry({
            name: 'monetization_quest_state_transition',
            route: getMonetizationRouteMetadata('monetization-boost'),
            previousState: 'available',
            nextState: 'in_progress',
        });
    }, []);

    return (
        <section style={{ display: 'grid', gap: 12 }}>
            <header>
                <h3 style={{ marginBottom: 6 }}>Boost preferences</h3>
                <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
                    Define defaults for promotion surfaces and lifecycle reminders.
                </p>
            </header>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                    type="checkbox"
                    checked={settings.showBoostEntryPoints}
                    onChange={(event) => {
                        setSettings((prev) => ({ ...prev, showBoostEntryPoints: event.target.checked }));
                        trackSettingsInteraction('monetization-boost', 'show-boost-entry-points', event.target.checked);
                    }}
                />
                Show boost entry points in composer
            </label>

            <label style={{ display: 'grid', gap: 6 }}>
                Default boost audience
                <select
                    value={settings.defaultBoostAudience}
                    onChange={(event) => {
                        const nextValue = event.target.value as typeof settings.defaultBoostAudience;
                        setSettings((prev) => ({ ...prev, defaultBoostAudience: nextValue }));
                        trackSettingsInteraction('monetization-boost', 'default-boost-audience', nextValue);
                    }}
                >
                    <option value="public">Public</option>
                    <option value="supporters">Supporters</option>
                    <option value="private">Private</option>
                </select>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                    type="checkbox"
                    checked={settings.remindBeforeBoostExpiry}
                    onChange={(event) => {
                        setSettings((prev) => ({ ...prev, remindBeforeBoostExpiry: event.target.checked }));
                        trackSettingsInteraction('monetization-boost', 'remind-before-boost-expiry', event.target.checked);
                    }}
                />
                Remind me before boost expires
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                    type="checkbox"
                    checked={settings.boostAutoRenew}
                    onChange={(event) => {
                        setSettings((prev) => ({ ...prev, boostAutoRenew: event.target.checked }));
                        trackSettingsInteraction('monetization-boost', 'boost-auto-renew', event.target.checked);
                    }}
                />
                Auto-renew eligible boosts
            </label>
        </section>
    );
};

export default MonetizationBoostSettings;
