import { useState } from 'react';
import { useAtom } from 'jotai';
import { notificationSettingsAtom, type NotificationMode } from './settingsAtoms';

const modeOptions: Array<{ value: NotificationMode; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'mentions', label: 'Mentions' },
  { value: 'muted', label: 'Muted' },
];

export const NotificationSettings = () => {
  const [settings, setSettings] = useAtom(notificationSettingsAtom);
  const [roomInput, setRoomInput] = useState('');

  const upsertRoomOverride = (roomId: string, mode: NotificationMode) => {
    const trimmed = roomId.trim();
    if (!trimmed) return;

    setSettings((prev) => {
      const existing = prev.perRoomOverrides.find((entry) => entry.roomId === trimmed);
      if (existing) {
        return {
          ...prev,
          perRoomOverrides: prev.perRoomOverrides.map((entry) => (entry.roomId === trimmed ? { ...entry, mode } : entry)),
        };
      }

      return {
        ...prev,
        perRoomOverrides: [...prev.perRoomOverrides, { roomId: trimmed, mode }],
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
              onClick={() => setSettings((prev) => ({ ...prev, globalMode: option.value }))}
              style={{
                border: settings.globalMode === option.value ? '1px solid var(--accent-primary)' : '1px solid var(--border-default)',
                borderRadius: 8,
                padding: '6px 10px',
                background: settings.globalMode === option.value ? 'var(--bg-surface-hover)' : 'var(--bg-input)',
                color: 'var(--text-primary)',
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h3>Per-room override list</h3>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
          <input
            value={roomInput}
            onChange={(event) => setRoomInput(event.target.value)}
            placeholder="!room:server"
            style={{ borderRadius: 8, border: '1px solid var(--border-default)', padding: '6px 8px', background: 'var(--bg-input)', color: 'var(--text-primary)' }}
          />
          <button type="button" onClick={() => { upsertRoomOverride(roomInput, 'mentions'); setRoomInput(''); }}>
            Add Mention-only
          </button>
        </div>
        <div style={{ display: 'grid', gap: 8 }}>
          {settings.perRoomOverrides.length === 0 ? <small>No room overrides yet.</small> : null}
          {settings.perRoomOverrides.map((item) => (
            <div key={item.roomId} style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between', border: '1px solid var(--border-default)', borderRadius: 8, padding: 8 }}>
              <code>{item.roomId}</code>
              <div style={{ display: 'flex', gap: 6 }}>
                {modeOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => upsertRoomOverride(item.roomId, option.value)}
                    style={{
                      border: item.mode === option.value ? '1px solid var(--accent-primary)' : '1px solid var(--border-default)',
                      borderRadius: 6,
                      padding: '4px 8px',
                    }}
                  >
                    {option.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() =>
                    setSettings((prev) => ({
                      ...prev,
                      perRoomOverrides: prev.perRoomOverrides.filter((entry) => entry.roomId !== item.roomId),
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

      <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          type="checkbox"
          checked={settings.desktopNotifications}
          onChange={(event) => setSettings((prev) => ({ ...prev, desktopNotifications: event.target.checked }))}
        />
        Desktop notifications
      </label>

      <section>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            checked={settings.soundEnabled}
            onChange={(event) => setSettings((prev) => ({ ...prev, soundEnabled: event.target.checked }))}
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
            onChange={(event) => setSettings((prev) => ({ ...prev, soundVolume: Number(event.target.value) }))}
          />
        </label>
      </section>

      <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          type="checkbox"
          checked={settings.flashTaskbar}
          onChange={(event) => setSettings((prev) => ({ ...prev, flashTaskbar: event.target.checked }))}
        />
        Flash taskbar on notification
      </label>
    </div>
  );
};

export default NotificationSettings;
