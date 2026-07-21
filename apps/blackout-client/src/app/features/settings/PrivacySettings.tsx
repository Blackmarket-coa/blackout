import React from 'react';
import { useAtom } from 'jotai';
import { privacySettingsAtom, type DmPermission } from './settingsAtoms';
import { trackSettingsInteraction } from './settingsTelemetry';
import { BLACKOUT_TERMS } from '../../lib/blackoutTerminology';
import { DataRetentionSection } from './DataRetentionSection';
import { LocationServicesSection } from '../location/LocationServicesSection';

const dmOptions: Array<{ value: DmPermission; label: string }> = [
    { value: 'everyone', label: 'Everyone' },
    { value: 'friends', label: 'Friends' },
    { value: 'mutual-spaces', label: `Mutual ${BLACKOUT_TERMS.canopy.titlePlural}` },
    { value: 'nobody', label: 'Nobody' },
];

export const PrivacySettings = () => {
    const [settings, setSettings] = useAtom(privacySettingsAtom);
    const updateSettings = <K extends keyof typeof settings>(key: K, value: typeof settings[K]) => {
        setSettings((prev) => ({ ...prev, [key]: value }));
        trackSettingsInteraction('privacy', key, String(value));
    };

    return (
        <div style={{ display: 'grid', gap: 18 }}>
            <section>
                <h3>Blocked users</h3>
                <div style={{ display: 'grid', gap: 8 }}>
                    {settings.blockedUsers.length === 0 ? <small>No blocked users.</small> : null}
                    {settings.blockedUsers.map((user) => (
                        <div
                            key={user.id}
                            style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                border: '1px solid var(--border-default)',
                                borderRadius: 8,
                                padding: 8,
                            }}
                        >
                            <div>
                                <strong>{user.displayName}</strong>
                                <div>
                                    <code>{user.id}</code>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() =>
                                    setSettings((prev) => ({
                                        ...prev,
                                        blockedUsers: prev.blockedUsers.filter(
                                            (entry) => entry.id !== user.id
                                        ),
                                    }))
                                }
                            >
                                Unblock
                            </button>
                        </div>
                    ))}
                </div>
            </section>

            <section>
                <h3>Direct message permissions</h3>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {dmOptions.map((option) => (
                        <button
                            key={option.value}
                            type="button"
                            onClick={() => updateSettings('dmPermissions', option.value)}
                            style={{
                                border:
                                    settings.dmPermissions === option.value
                                        ? '1px solid var(--accent-primary)'
                                        : '1px solid var(--border-default)',
                                borderRadius: 8,
                                padding: '6px 10px',
                                background:
                                    settings.dmPermissions === option.value
                                        ? 'var(--bg-surface-hover)'
                                        : 'var(--bg-input)',
                                color: 'var(--text-primary)',
                            }}
                        >
                            {option.label}
                        </button>
                    ))}
                </div>
            </section>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                    type="checkbox"
                    checked={settings.showReadReceipts}
                    onChange={(event) => updateSettings('showReadReceipts', event.target.checked)}
                />
                Read receipt visibility
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                    type="checkbox"
                    checked={settings.showTypingIndicators}
                    onChange={(event) =>
                        updateSettings('showTypingIndicators', event.target.checked)
                    }
                />
                Typing indicator visibility
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                    type="checkbox"
                    checked={settings.sendReadReceipts !== false}
                    onChange={(event) => updateSettings('sendReadReceipts', event.target.checked)}
                />
                Send read receipts (off = others can&apos;t see when you&apos;ve read; your unread
                counts still work)
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                    type="checkbox"
                    checked={settings.sendTypingNotifications !== false}
                    onChange={(event) =>
                        updateSettings('sendTypingNotifications', event.target.checked)
                    }
                />
                Send typing notifications (off = others can&apos;t see when you&apos;re typing)
            </label>

            <LocationServicesSection />

            <DataRetentionSection />
        </div>
    );
};

export default PrivacySettings;
