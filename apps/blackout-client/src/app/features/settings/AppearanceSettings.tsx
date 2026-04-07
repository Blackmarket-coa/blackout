import { useAtom } from 'jotai';
import { BLACKOUT_THEMES } from '@blackout/core';
import {
    appearanceSettingsAtom,
    type ChatDensityOption,
    type EmojiStyleOption,
    type TimestampVisibility,
} from './settingsAtoms';
import { trackSettingsInteraction } from './settingsTelemetry';
import { themePreferenceAtom } from '../../state/theme-atoms';
import { themePreviews } from './theme-previews';

const Segmented = <T extends string>({
    value,
    onChange,
    options,
}: {
    value: T;
    onChange: (next: T) => void;
    options: Array<{ value: T; label: string }>;
}) => (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {options.map((option) => (
            <button
                key={option.value}
                type="button"
                onClick={() => onChange(option.value)}
                style={{
                    border:
                        value === option.value
                            ? '1px solid var(--accent-primary)'
                            : '1px solid var(--border-default)',
                    borderRadius: 8,
                    background:
                        value === option.value ? 'var(--bg-surface-hover)' : 'var(--bg-input)',
                    color: 'var(--text-primary)',
                    padding: '6px 10px',
                }}
            >
                {option.label}
            </button>
        ))}
    </div>
);

export const AppearanceSettings = () => {
    const [settings, setSettings] = useAtom(appearanceSettingsAtom);
    const [, setThemePreference] = useAtom(themePreferenceAtom);

    const updateSetting = <K extends keyof typeof settings>(key: K, value: (typeof settings)[K]) => {
        setSettings((prev) => ({ ...prev, [key]: value }));
        trackSettingsInteraction('appearance', key, String(value));
    };

    return (
        <div style={{ display: 'grid', gap: 18 }}>
            <section>
                <h3>Theme</h3>
                <div
                    style={{
                        display: 'grid',
                        gap: 10,
                        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                    }}
                >
                    {themePreviews.map((theme) => (
                        <button
                            key={theme.value}
                            type="button"
                            onClick={() => {
                                updateSetting('theme', theme.value);
                                setThemePreference(theme.value);
                            }}
                            style={{
                                border:
                                    settings.theme === theme.value
                                        ? '1px solid var(--accent-primary)'
                                        : '1px solid var(--border-default)',
                                borderRadius: 10,
                                background: 'var(--bg-input)',
                                padding: 8,
                                textAlign: 'left',
                            }}
                        >
                            <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
                                {theme.swatches.map((swatch) => (
                                    <span
                                        key={swatch}
                                        style={{
                                            width: 28,
                                            height: 20,
                                            borderRadius: 6,
                                            background: swatch,
                                            display: 'inline-block',
                                        }}
                                    />
                                ))}
                            </div>
                            <strong style={{ color: 'var(--text-primary)' }}>{theme.label}</strong>
                        </button>
                    ))}
                </div>
                <p style={{ marginTop: 8, color: 'var(--text-muted)', fontSize: 13 }}>
                    Available themes: {BLACKOUT_THEMES.map((theme) => theme.label).join(', ')}.
                </p>
            </section>

            <label>
                <h3>Accent color</h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <input
                        type="color"
                        value={settings.accentColor}
                        onChange={(event) =>
                            updateSetting('accentColor', event.target.value)
                        }
                    />
                    <code>{settings.accentColor.toUpperCase()}</code>
                </div>
            </label>

            <label>
                <h3>Font size ({settings.fontScale}%)</h3>
                <input
                    type="range"
                    min={75}
                    max={150}
                    value={settings.fontScale}
                    onChange={(event) =>
                        updateSetting('fontScale', Number(event.target.value))
                    }
                />
            </label>

            <section>
                <h3>Chat density</h3>
                <Segmented<ChatDensityOption>
                    value={settings.chatDensity}
                    onChange={(chatDensity) => updateSetting('chatDensity', chatDensity)}
                    options={[
                        { value: 'compact', label: 'Compact' },
                        { value: 'cozy', label: 'Cozy' },
                    ]}
                />
            </section>

            <section>
                <h3>Emoji style</h3>
                <Segmented<EmojiStyleOption>
                    value={settings.emojiStyle}
                    onChange={(emojiStyle) => updateSetting('emojiStyle', emojiStyle)}
                    options={[
                        { value: 'system', label: 'System' },
                        { value: 'twemoji', label: 'Twemoji' },
                    ]}
                />
            </section>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                    type="checkbox"
                    checked={settings.messageGrouping}
                    onChange={(event) =>
                        updateSetting('messageGrouping', event.target.checked)
                    }
                />
                Message grouping
            </label>

            <section>
                <h3>Show timestamps</h3>
                <Segmented<TimestampVisibility>
                    value={settings.showTimestamps}
                    onChange={(showTimestamps) =>
                        updateSetting('showTimestamps', showTimestamps)
                    }
                    options={[
                        { value: 'always', label: 'Always' },
                        { value: 'hover', label: 'Hover' },
                        { value: 'never', label: 'Never' },
                    ]}
                />
            </section>
        </div>
    );
};

export default AppearanceSettings;
