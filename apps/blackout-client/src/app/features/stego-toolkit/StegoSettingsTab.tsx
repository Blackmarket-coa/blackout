import { createElement } from 'react';
import { useAtom } from 'jotai';
import { stegoSettingsAtom } from '../steganography/stegoAtoms';
import { StegoSettings } from '../steganography';

/**
 * Dedicated steganography settings tab — BKL-008.
 *
 * Mirrors the structure of `_port/src/components/views/settings/tabs/user/
 * SteganographyUserSettingsTab.tsx`: a single device-level opt-in section at
 * the top, then the full `StegoSettings` panel from the BKL-005 stego
 * module folded in below so operators can manage passphrases, advanced
 * controls, and enterprise policy lifecycle from the dedicated tab.
 *
 * Persistence is delegated to the existing
 * `blackout.settings.steganography.v1` `atomWithStorage` so toggling the
 * opt-in here is durable across reloads (matches the
 * `LEVELS_DEVICE_ONLY_SETTINGS` semantic from `_port`).
 */
export function StegoSettingsTab() {
    const [settings, setSettings] = useAtom(stegoSettingsAtom);

    return createElement(
        'section',
        {
            'data-testid': 'stego-settings-tab',
            style: { display: 'grid', gap: 16, padding: 16 },
        },
        createElement('h2', { style: { margin: 0 } }, 'Steganography'),
        createElement(
            'section',
            {
                'data-testid': 'stego-settings-tab-opt-in',
                style: {
                    border: '1px solid var(--border-default)',
                    borderRadius: 10,
                    padding: 12,
                    display: 'grid',
                    gap: 8,
                },
            },
            createElement('h3', { style: { margin: 0 } }, 'Hidden message detection'),
            createElement(
                'p',
                { style: { margin: 0, color: 'var(--text-secondary)' } },
                'Opt in to scan attachments for hidden messages. Stored on this device only; matches the legacy `_port` device-level setting.'
            ),
            createElement(
                'label',
                { style: { display: 'flex', gap: 8, alignItems: 'center' } },
                createElement('input', {
                    type: 'checkbox',
                    'data-testid': 'stego-settings-tab-opt-in-toggle',
                    checked: settings.enabled,
                    onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
                        setSettings((prev) => ({ ...prev, enabled: event.target.checked })),
                }),
                'Enable hidden message detection on this device'
            )
        ),
        createElement(StegoSettings)
    );
}

export default StegoSettingsTab;
