import { useEffect } from 'react';
import { useAtom } from 'jotai';
import { monetizationBillingSettingsAtom } from './settingsAtoms';
import { getMonetizationRouteMetadata } from './monetizationTelemetry';
import { trackMonetizationTelemetry, trackSettingsInteraction } from './settingsTelemetry';

const MonetizationBillingSettings = () => {
    const [settings, setSettings] = useAtom(monetizationBillingSettingsAtom);

    useEffect(() => {
        const route = getMonetizationRouteMetadata('monetization-billing');
        trackMonetizationTelemetry({ name: 'monetization_checkout_open', route, checkoutSurface: 'settings' });
        return () => {
            trackMonetizationTelemetry({ name: 'monetization_checkout_close', route, checkoutSurface: 'settings' });
        };
    }, []);

    return (
        <section style={{ display: 'grid', gap: 12 }}>
            <header>
                <h3 style={{ marginBottom: 6 }}>Billing experience</h3>
                <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
                    Set defaults for checkout and invoice interactions.
                </p>
            </header>

            <label style={{ display: 'grid', gap: 6 }}>
                Default billing cycle
                <select
                    value={settings.defaultBillingCycle}
                    onChange={(event) => {
                        const nextValue = event.target.value as typeof settings.defaultBillingCycle;
                        setSettings((prev) => ({ ...prev, defaultBillingCycle: nextValue }));
                        trackSettingsInteraction('monetization-billing', 'default-billing-cycle', nextValue);
                    }}
                >
                    <option value="monthly">Monthly</option>
                    <option value="yearly">Yearly</option>
                </select>
            </label>

            {[
                ['showTaxInclusivePricing', 'Show tax-inclusive pricing labels'],
                ['autoOpenInvoices', 'Auto-open invoice after purchase'],
                ['confirmBeforeCheckout', 'Require confirmation before checkout'],
            ].map(([key, label]) => (
                <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                        type="checkbox"
                        checked={settings[key as keyof typeof settings] as boolean}
                        onChange={(event) => {
                            const nextValue = event.target.checked;
                            setSettings((prev) => ({ ...prev, [key]: nextValue }));
                            trackSettingsInteraction('monetization-billing', key, nextValue);
                        }}
                    />
                    {label}
                </label>
            ))}
        </section>
    );
};

export default MonetizationBillingSettings;
