import React, { useState } from 'react';
import { useAtom } from 'jotai';
import { notificationSettingsAtom, type NotificationMode } from './settingsAtoms';
import { trackSettingsInteraction } from './settingsTelemetry';
import { BLACKOUT_TERMS } from '../../lib/blackoutTerminology';

const modeOptions: Array<{ value: NotificationMode; label: string }> = [
    { value: 'all', label: 'All' },
    { value: 'mentions', label: 'Mentions' },
    { value: 'muted', label: 'Muted' },
];

const toMuteUntil = (hours: number): number => Date.now() + (hours * 60 * 60 * 1000);

export const NotificationSettings = () => {
    const [settings, setSettings] = useAtom(notificationSettingsAtom);
    const updateSettings = <K extends keyof typeof settings>(key: K, value: (typeof settings)[K]) => {
        setSettings((prev) => ({ ...prev, [key]: value }));
        trackSettingsInteraction('notifications', key, String(value));
    };

    const [roomInput, setRoomInput] = useState('');
    const [canopyInput, setCanopyInput] = useState('');

    const upsertRoomOverride = (roomId: string, mode: NotificationMode) => {
        const trimmed = roomId.trim();
        if (!trimmed) return;

        setSettings((prev) => {
            const existing = prev.perRoomOverrides.find((entry) => entry.roomId === trimmed);
            if (existing) {
                return {
                    ...prev,
                    perRoomOverrides: prev.perRoomOverrides.map((entry) =>
                        entry.roomId === trimmed ? { ...entry, mode } : entry,
                    ),
                };
            }

            return {
                ...prev,
                perRoomOverrides: [...prev.perRoomOverrides, { roomId: trimmed, mode }],
            };
        });
    };

    const upsertCanopyOverride = (canopyId: string, mode: NotificationMode) => {
        const trimmed = canopyId.trim();
        if (!trimmed) return;

        setSettings((prev) => {
            const existing = prev.perCanopyOverrides.find((entry) => entry.canopyId === trimmed);
            if (existing) {
                return {
                    ...prev,
                    perCanopyOverrides: prev.perCanopyOverrides.map((entry) =>
                        entry.canopyId === trimmed ? { ...entry, mode } : entry,
                    ),
                };
            }

            return {
                ...prev,
                perCanopyOverrides: [...prev.perCanopyOverrides, { canopyId: trimmed, mode }],
            };
        });
    };

    return (
        <div style={{ display: 'grid', gap: 18 }}>
            <section>
                <h3>Global notification rules</h3>
                <div style={{ display: 'flex', gap: 8 }}>
                    {modeOptions.map((option) => (
                        <button
                            key={option.value}
                            type="button"
                            onClick={() => updateSettings('globalMode', option.value)}
                            style={{
                                border:
                                    settings.globalMode === option.value
                                        ? '1px solid var(--accent-primary)'
                                        : '1px solid var(--border-default)',
                                borderRadius: 8,
                                padding: '6px 10px',
                                background:
                                    settings.globalMode === option.value
                                        ? 'var(--bg-surface-hover)'
                                        : 'var(--bg-input)',
                                color: 'var(--text-primary)',
                            }}
                        >
                            {option.label}
                        </button>
                    ))}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <button type="button" onClick={() => updateSettings('muteUntil', toMuteUntil(1))}>Mute 1h</button>
                    <button type="button" onClick={() => updateSettings('muteUntil', toMuteUntil(8))}>Mute 8h</button>
                    <button type="button" onClick={() => updateSettings('muteUntil', undefined)}>Clear mute</button>
                </div>
            </section>

            <section>
                <h3>Per-{BLACKOUT_TERMS.den.singular} override list</h3>
                <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                    <input
                        value={roomInput}
                        onChange={(event) => setRoomInput(event.target.value)}
                        placeholder={BLACKOUT_TERMS.matrixDenIdHint}
                        style={{
                            borderRadius: 8,
                            border: '1px solid var(--border-default)',
                            padding: '6px 8px',
                            background: 'var(--bg-input)',
                            color: 'var(--text-primary)',
                        }}
                    />
                    <button
                        type="button"
                        onClick={() => {
                            upsertRoomOverride(roomInput, 'mentions');
                            setRoomInput('');
                        }}
                    >
                        Add Mention-only
                    </button>
                </div>
                <div style={{ display: 'grid', gap: 8 }}>
                    {settings.perRoomOverrides.length === 0 ? (
                        <small>No {BLACKOUT_TERMS.den.singular} overrides yet.</small>
                    ) : null}
                    {settings.perRoomOverrides.map((item) => (
                        <div
                            key={item.roomId}
                            style={{
                                display: 'flex',
                                gap: 8,
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                border: '1px solid var(--border-default)',
                                borderRadius: 8,
                                padding: 8,
                            }}
                        >
                            <code>{item.roomId}</code>
                            <div style={{ display: 'flex', gap: 6 }}>
                                {modeOptions.map((option) => (
                                    <button
                                        key={option.value}
                                        type="button"
                                        onClick={() => upsertRoomOverride(item.roomId, option.value)}
                                    >
                                        {option.label}
                                    </button>
                                ))}
                                <button
                                    type="button"
                                    onClick={() =>
                                        setSettings((prev) => ({
                                            ...prev,
                                            perRoomOverrides: prev.perRoomOverrides.filter(
                                                (entry) => entry.roomId !== item.roomId,
                                            ),
                                        }))
                                    }
                                >
                                    Remove
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            <section>
                <h3>Per-canopy overrides</h3>
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                    <input
                        value={canopyInput}
                        onChange={(event) => setCanopyInput(event.target.value)}
                        placeholder="canopy id"
                    />
                    <button
                        type="button"
                        onClick={() => {
                            upsertCanopyOverride(canopyInput, 'mentions');
                            setCanopyInput('');
                        }}
                    >
                        Add canopy override
                    </button>
                </div>
                {settings.perCanopyOverrides.map((item) => (
                    <div key={item.canopyId} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <code>{item.canopyId}</code>
                        {modeOptions.map((option) => (
                            <button
                                key={option.value}
                                type="button"
                                onClick={() => upsertCanopyOverride(item.canopyId, option.value)}
                            >
                                {option.label}
                            </button>
                        ))}
                        <button
                            type="button"
                            onClick={() =>
                                setSettings((prev) => ({
                                    ...prev,
                                    perCanopyOverrides: prev.perCanopyOverrides.filter(
                                        (entry) => entry.canopyId !== item.canopyId,
                                    ),
                                }))
                            }
                        >
                            Remove
                        </button>
                    </div>
                ))}
            </section>

            <section>
                <h3>Quiet hours</h3>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                        type="checkbox"
                        checked={settings.quietHours.enabled}
                        onChange={(event) =>
                            updateSettings('quietHours', { ...settings.quietHours, enabled: event.target.checked })
                        }
                    />
                    Enable quiet hours
                </label>
                <div style={{ display: 'flex', gap: 8 }}>
                    <input
                        type="time"
                        value={settings.quietHours.start}
                        onChange={(event) =>
                            updateSettings('quietHours', { ...settings.quietHours, start: event.target.value })
                        }
                    />
                    <input
                        type="time"
                        value={settings.quietHours.end}
                        onChange={(event) =>
                            updateSettings('quietHours', { ...settings.quietHours, end: event.target.value })
                        }
                    />
                </div>
            </section>

            <section>
                <h3>Event controls</h3>
                {[
                    ['mentions', 'Mentions'],
                    ['replies', 'Replies'],
                    ['subscriptionEvents', 'Subscription events'],
                    ['modAlerts', 'Mod alerts'],
                ].map(([key, label]) => (
                    <label key={key} style={{ display: 'flex', gap: 8 }}>
                        <input
                            type="checkbox"
                            checked={settings.eventToggles[key as keyof typeof settings.eventToggles]}
                            onChange={(event) =>
                                updateSettings('eventToggles', {
                                    ...settings.eventToggles,
                                    [key]: event.target.checked,
                                })
                            }
                        />
                        {label}
                    </label>
                ))}
            </section>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                    type="checkbox"
                    checked={settings.desktopNotifications}
                    onChange={(event) => updateSettings('desktopNotifications', event.target.checked)}
                />
                Desktop notifications
            </label>

            <section>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                        type="checkbox"
                        checked={settings.soundEnabled}
                        onChange={(event) => updateSettings('soundEnabled', event.target.checked)}
                    />
                    Sound notifications
                </label>
                <label style={{ display: 'block', marginTop: 8 }}>
                    Volume ({settings.soundVolume}%)
                    <input
                        type="range"
                        min={0}
                        max={100}
                        value={settings.soundVolume}
                        disabled={!settings.soundEnabled}
                        onChange={(event) => updateSettings('soundVolume', Number(event.target.value))}
                    />
                </label>
            </section>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                    type="checkbox"
                    checked={settings.flashTaskbar}
                    onChange={(event) => updateSettings('flashTaskbar', event.target.checked)}
                />
                Flash taskbar on notification
            </label>
        </div>
    );
};

export default NotificationSettings;
