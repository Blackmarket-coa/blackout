import { useEffect } from 'react';
import { useAtom } from 'jotai';
import { monetizationPlanSettingsAtom } from './settingsAtoms';
import { getMonetizationRouteMetadata } from './monetizationTelemetry';
import { trackMonetizationTelemetry, trackSettingsInteraction } from './settingsTelemetry';

const MonetizationPlanSettings = () => {
    const [settings, setSettings] = useAtom(monetizationPlanSettingsAtom);

    useEffect(() => {
        const route = getMonetizationRouteMetadata('monetization-plan');
        trackMonetizationTelemetry({ name: 'monetization_plan_view', route });
        trackMonetizationTelemetry({ name: 'monetization_plan_open', route });
    }, []);

    return (
        <section style={{ display: 'grid', gap: 12 }}>
            <header>
                <h3 style={{ marginBottom: 6 }}>Plan visibility & trial</h3>
                <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
                    Control how premium plans and trial state are presented.
                </p>
            </header>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                    type="checkbox"
                    checked={settings.showPlanVisibility}
                    onChange={(event) => {
                        setSettings((prev) => ({ ...prev, showPlanVisibility: event.target.checked }));
                        trackSettingsInteraction('monetization-plan', 'show-plan-visibility', event.target.checked);
                    }}
                />
                Show active plan banner
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                    type="checkbox"
                    checked={settings.showTrialUpsell}
                    onChange={(event) => {
                        setSettings((prev) => ({ ...prev, showTrialUpsell: event.target.checked }));
                        trackSettingsInteraction('monetization-plan', 'show-trial-upsell', event.target.checked);
                        if (event.target.checked) {
                            trackMonetizationTelemetry({
                                name: 'monetization_upgrade_intent',
                                route: getMonetizationRouteMetadata('monetization-plan'),
                                targetFeatureId: 'premium_plan',
                            });
                        }
                    }}
                />
                Show trial upsell callouts
            </label>

            <label style={{ display: 'grid', gap: 6 }}>
                Trial state
                <select
                    value={settings.trialState}
                    onChange={(event) => {
                        const nextValue = event.target.value as typeof settings.trialState;
                        setSettings((prev) => ({ ...prev, trialState: nextValue }));
                        trackSettingsInteraction('monetization-plan', 'trial-state', nextValue);
                        if (nextValue === 'active') {
                            trackMonetizationTelemetry({
                                name: 'monetization_trial_start',
                                route: getMonetizationRouteMetadata('monetization-plan'),
                                trialType: 'free',
                            });
                        }
                        if (nextValue === 'expired') {
                            trackMonetizationTelemetry({
                                name: 'monetization_trial_expire',
                                route: getMonetizationRouteMetadata('monetization-plan'),
                                trialType: 'free',
                            });
                        }
                    }}
                >
                    <option value="inactive">Inactive</option>
                    <option value="active">Active</option>
                    <option value="expired">Expired</option>
                </select>
            </label>
        </section>
    );
};

export default MonetizationPlanSettings;
