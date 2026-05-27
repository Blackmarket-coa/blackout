import { type CSSProperties, useMemo } from 'react';
import { useCall } from './CallProvider';
import { usePushToTalk } from './usePushToTalk';

const controlButtonStyle: CSSProperties = {
    border: '1px solid var(--border-default)',
    borderRadius: 8,
    background: 'var(--bg-input)',
    color: 'var(--text-primary)',
    padding: '6px 10px',
};

export const CallControls = ({
    onDisconnect,
    audioDevices = [],
    videoDevices = [],
    selectedAudioDevice,
    selectedVideoDevice,
    onSelectAudioDevice,
    onSelectVideoDevice,
}: {
    onDisconnect: () => void;
    audioDevices?: MediaDeviceInfo[];
    videoDevices?: MediaDeviceInfo[];
    selectedAudioDevice?: string;
    selectedVideoDevice?: string;
    onSelectAudioDevice?: (deviceId: string) => void;
    onSelectVideoDevice?: (deviceId: string) => void;
}) => {
    const {
        muted,
        deafened,
        cameraEnabled,
        screenSharing,
        setMuted,
        setDeafened,
        setCameraEnabled,
        setScreenSharing,
    } = useCall();

    usePushToTalk();

    const audioOptions = useMemo(
        () =>
            audioDevices.map((device) => ({
                id: device.deviceId,
                label: device.label || `Microphone ${device.deviceId.slice(0, 6)}`,
            })),
        [audioDevices],
    );

    const videoOptions = useMemo(
        () =>
            videoDevices.map((device) => ({
                id: device.deviceId,
                label: device.label || `Camera ${device.deviceId.slice(0, 6)}`,
            })),
        [videoDevices],
    );

    return (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <button type="button" style={controlButtonStyle} onClick={() => setMuted(!muted)}>
                {muted ? 'Unmute Mic' : 'Mute Mic'}
            </button>
            <button
                type="button"
                style={controlButtonStyle}
                onClick={() => setCameraEnabled(!cameraEnabled)}
            >
                {cameraEnabled ? 'Camera Off' : 'Camera On'}
            </button>
            <button
                type="button"
                style={controlButtonStyle}
                onClick={() => setScreenSharing(!screenSharing)}
            >
                {screenSharing ? 'Stop Share' : 'Share Screen'}
            </button>
            <button type="button" style={controlButtonStyle} onClick={() => setDeafened(!deafened)}>
                {deafened ? 'Undeafen' : 'Deafen'}
            </button>
            <button
                type="button"
                style={{ ...controlButtonStyle, background: 'var(--danger)', color: '#fff' }}
                onClick={onDisconnect}
            >
                Disconnect
            </button>

            <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 12 }}>
                Audio
                <select
                    value={selectedAudioDevice}
                    onChange={(event) => onSelectAudioDevice?.(event.target.value)}
                    style={{ ...controlButtonStyle, padding: '4px 8px' }}
                >
                    <option value="">Default</option>
                    {audioOptions.map((device) => (
                        <option key={device.id} value={device.id}>
                            {device.label}
                        </option>
                    ))}
                </select>
            </label>

            <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 12 }}>
                Video
                <select
                    value={selectedVideoDevice}
                    onChange={(event) => onSelectVideoDevice?.(event.target.value)}
                    style={{ ...controlButtonStyle, padding: '4px 8px' }}
                >
                    <option value="">Default</option>
                    {videoOptions.map((device) => (
                        <option key={device.id} value={device.id}>
                            {device.label}
                        </option>
                    ))}
                </select>
            </label>
        </div>
    );
};

export default CallControls;
