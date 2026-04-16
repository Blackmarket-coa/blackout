import { useAtom } from 'jotai';
import { monetizationMarketplaceSettingsAtom } from './settingsAtoms';
import { trackSettingsInteraction } from './settingsTelemetry';

const MonetizationMarketplaceSettings = () => {
    const [settings, setSettings] = useAtom(monetizationMarketplaceSettingsAtom);

    return (
        <section style={{ display: 'grid', gap: 12 }}>
            <header>
                <h3 style={{ marginBottom: 6 }}>Marketplace & seller controls</h3>
                <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
                    Manage storefront visibility and seller operating defaults.
                </p>
            </header>

            {[
                ['marketplaceVisible', 'Show marketplace in navigation'],
                ['showSellerProfile', 'Display seller profile publicly'],
                ['allowDirectMessages', 'Allow buyer direct messages'],
                ['autoApproveRepeatBuyers', 'Auto-approve repeat buyer requests'],
                ['vacationMode', 'Enable vacation mode'],
            ].map(([key, label]) => (
                <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                        type="checkbox"
                        checked={settings[key as keyof typeof settings] as boolean}
                        onChange={(event) => {
                            const nextValue = event.target.checked;
                            setSettings((prev) => ({ ...prev, [key]: nextValue }));
                            trackSettingsInteraction('monetization-marketplace', key, nextValue);
                        }}
                    />
                    {label}
                </label>
            ))}
        </section>
    );
};

export default MonetizationMarketplaceSettings;
