import { useAtom } from 'jotai';
import { trackSettingsInteraction } from './settingsTelemetry';
import { voiceVideoSettingsAtom, type VoiceVideoSettingsState } from './settingsAtoms';

const VoiceVideoSettings = () => {
    const [settings, setSettings] = useAtom(voiceVideoSettingsAtom);

    const update = <K extends keyof VoiceVideoSettingsState>(key: K, value: VoiceVideoSettingsState[K]) => {
        setSettings((prev) => ({ ...prev, [key]: value }));
        trackSettingsInteraction('voice-video', key, String(value));
    };

    return (
        <section style={{ display: 'grid', gap: 12 }}>
            <h3 style={{ marginBottom: 6 }}>Voice &amp; Video</h3>
            <p style={{ marginTop: 0, color: 'var(--text-secondary)' }}>
                Configure devices and call audio processing.
            </p>

            <label>
                Preferred camera
                <select
                    value={settings.preferredCamera}
                    onChange={(event) => update('preferredCamera', event.target.value as VoiceVideoSettingsState['preferredCamera'])}
                >
                    <option value="system">System default</option>
                    <option value="front">Front camera</option>
                    <option value="rear">Rear camera</option>
                    <option value="virtual">Virtual camera</option>
                </select>
            </label>

            <label>
                Preferred microphone
                <select
                    value={settings.preferredMicrophone}
                    onChange={(event) => update('preferredMicrophone', event.target.value as VoiceVideoSettingsState['preferredMicrophone'])}
                >
                    <option value="system">System default</option>
                    <option value="headset">Headset mic</option>
                    <option value="built-in">Built-in mic</option>
                </select>
            </label>

            <label>
                Preferred speaker
                <select
                    value={settings.preferredSpeaker}
                    onChange={(event) => update('preferredSpeaker', event.target.value as VoiceVideoSettingsState['preferredSpeaker'])}
                >
                    <option value="system">System default</option>
                    <option value="headset">Headset speakers</option>
                    <option value="built-in">Built-in speakers</option>
                </select>
            </label>

            <label>
                Noise suppression
                <select
                    value={settings.noiseSuppression}
                    onChange={(event) => update('noiseSuppression', event.target.value as VoiceVideoSettingsState['noiseSuppression'])}
                >
                    <option value="off">Off</option>
                    <option value="standard">Standard</option>
                    <option value="aggressive">Aggressive</option>
                </select>
            </label>

            {(['echoCancellation', 'autoGainControl', 'mirrorPreview'] as const).map((key) => (
                <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                        type="checkbox"
                        checked={settings[key]}
                        onChange={(event) => update(key, event.target.checked)}
                    />
                    {key === 'echoCancellation'
                        ? 'Echo cancellation'
                        : key === 'autoGainControl'
                          ? 'Automatic gain control'
                          : 'Mirror local preview'}
                </label>
            ))}
        </section>
    );
};

export default VoiceVideoSettings;
