import { useMemo, useState } from 'react';
import { useAtom } from 'jotai';
import { notificationSettingsAtom, type NotificationMode } from './settingsAtoms';
import { trackSettingsInteraction } from './settingsTelemetry';
import {
  useLowPriorityDigestSettings,
  useNotificationPreferencesAccountData,
  useSpaceNotificationPreset,
  useTemporaryMute,
  useValidateNotificationSemanticMapping,
  type SpaceNotificationPreset,
} from '../../hooks/useNotifications';

const modeOptions: Array<{ value: NotificationMode; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'mentions', label: 'Mentions' },
  { value: 'muted', label: 'Muted' },
];

const spacePresetOptions: Array<{ value: SpaceNotificationPreset; label: string }> = [
  { value: 'all', label: 'All activity' },
  { value: 'mentions', label: 'Mentions only' },
  { value: 'none', label: 'No alerts' },
];

export const NotificationSettings = () => {
  const [settings, setSettings] = useAtom(notificationSettingsAtom);
  const [roomInput, setRoomInput] = useState('');
  const [spaceIdInput, setSpaceIdInput] = useState('');
  const [muteTargetInput, setMuteTargetInput] = useState('');
  const [customMuteHours, setCustomMuteHours] = useState('48');

  const { preset: activeSpacePreset, setPreset: setSpacePreset } =
    useSpaceNotificationPreset(spaceIdInput || '!example-space:server');
  const { mute, setMute, clearMute } = useTemporaryMute(muteTargetInput || '!example-room:server');
  const { settings: digestSettings, setSettings: setDigestSettings } = useLowPriorityDigestSettings();
  const accountDataPayload = useNotificationPreferencesAccountData();
  const validateSemantics = useValidateNotificationSemanticMapping();

  const mappingValidation = useMemo(
    () =>
      validateSemantics({
        accountData: accountDataPayload,
        receiptsTouched: false,
        unreadCounterMutated: false,
      }),
    [accountDataPayload, validateSemantics]
  );

  const updateSettings = <K extends keyof typeof settings>(key: K, value: (typeof settings)[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    trackSettingsInteraction('notifications', key, String(value));
  };

  const upsertRoomOverride = (roomId: string, mode: NotificationMode) => {
    const trimmed = roomId.trim();
    if (!trimmed) return;

    setSettings((prev) => {
      const existing = prev.perRoomOverrides.find((entry) => entry.roomId === trimmed);
      if (existing) {
        return {
          ...prev,
          perRoomOverrides: prev.perRoomOverrides.map((entry) =>
            entry.roomId === trimmed ? { ...entry, mode } : entry
          ),
        };
      }

      return {
        ...prev,
        perRoomOverrides: [...prev.perRoomOverrides, { roomId: trimmed, mode }],
      };
    });
  };

  const parsedCustomHours = Number(customMuteHours);

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
      </section>

      <section>
        <h3>Per-space preset</h3>
        <div style={{ display: 'grid', gap: 8 }}>
          <input
            value={spaceIdInput}
            onChange={(event) => setSpaceIdInput(event.target.value)}
            placeholder="!space:server"
            style={{
              borderRadius: 8,
              border: '1px solid var(--border-default)',
              padding: '6px 8px',
              background: 'var(--bg-input)',
              color: 'var(--text-primary)',
            }}
          />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {spacePresetOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setSpacePreset(option.value)}
                style={{
                  border:
                    activeSpacePreset === option.value
                      ? '1px solid var(--accent-primary)'
                      : '1px solid var(--border-default)',
                  borderRadius: 8,
                  padding: '6px 10px',
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
          <small>
            Presets are serialized into account-data-compatible shape and do not write receipts.
          </small>
        </div>
      </section>

      <section>
        <h3>Temporary mutes</h3>
        <div style={{ display: 'grid', gap: 8 }}>
          <input
            value={muteTargetInput}
            onChange={(event) => setMuteTargetInput(event.target.value)}
            placeholder="!room-or-space:server"
            style={{
              borderRadius: 8,
              border: '1px solid var(--border-default)',
              padding: '6px 8px',
              background: 'var(--bg-input)',
              color: 'var(--text-primary)',
            }}
          />
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button type="button" onClick={() => setMute('1h')}>
              Mute 1h
            </button>
            <button type="button" onClick={() => setMute('8h')}>
              Mute 8h
            </button>
            <button type="button" onClick={() => setMute('24h')}>
              Mute 24h
            </button>
            <input
              value={customMuteHours}
              onChange={(event) => setCustomMuteHours(event.target.value)}
              type="number"
              min={1}
              style={{ width: 72 }}
            />
            <button
              type="button"
              onClick={() =>
                setMute('custom', {
                  customDurationMs: Number.isFinite(parsedCustomHours)
                    ? parsedCustomHours * 60 * 60 * 1000
                    : 0,
                })
              }
            >
              Apply custom
            </button>
            <button type="button" onClick={clearMute}>
              Clear mute
            </button>
          </div>
          <small>
            {mute
              ? `Muted until ${new Date(mute.mutedUntil).toLocaleString()}`
              : 'No active temporary mute for this target.'}
          </small>
        </div>
      </section>

      <section>
        <h3>Low-priority digest</h3>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            checked={digestSettings.enabled}
            onChange={(event) => setDigestSettings({ enabled: event.target.checked })}
          />
          Group low-priority alerts into digest batches
        </label>
        <label style={{ display: 'block', marginTop: 8 }}>
          Digest interval (minutes)
          <input
            type="number"
            min={5}
            value={digestSettings.intervalMinutes}
            onChange={(event) =>
              setDigestSettings({ intervalMinutes: Math.max(5, Number(event.target.value || 5)) })
            }
          />
        </label>
      </section>

      <section>
        <h3>Per-room override list</h3>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
          <input
            value={roomInput}
            onChange={(event) => setRoomInput(event.target.value)}
            placeholder="!room:server"
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
          {settings.perRoomOverrides.length === 0 ? <small>No room overrides yet.</small> : null}
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
                    style={{
                      border:
                        item.mode === option.value
                          ? '1px solid var(--accent-primary)'
                          : '1px solid var(--border-default)',
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
                      perRoomOverrides: prev.perRoomOverrides.filter(
                        (entry) => entry.roomId !== item.roomId
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

      <small>
        Semantic mapping validation:{' '}
        {mappingValidation.valid ? 'ok (account-data + receipts safe)' : mappingValidation.reason}
      </small>
    </div>
  );
};

export default NotificationSettings;
