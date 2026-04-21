import { type CSSProperties, useMemo } from 'react';
import type { Room } from 'matrix-js-sdk';
import type { CallMemberState, AudioLevelState } from './CallProvider';

const stripButtonStyle: CSSProperties = {
    border: '1px solid var(--border-default)',
    borderRadius: 8,
    background: 'var(--bg-input)',
    color: 'var(--text-primary)',
    padding: '4px 8px',
    fontSize: 11,
};

type VoiceStripProps = {
    enabled: boolean;
    joined: boolean;
    roomId: string | null;
    selectedRoomId: string | null;
    rooms: Room[];
    muted: boolean;
    deafened: boolean;
    membership: Record<string, CallMemberState>;
    audioLevels: Record<string, AudioLevelState>;
    audioDevices: MediaDeviceInfo[];
    selectedAudioDeviceId: string;
    onJoin: (roomId: string) => void;
    onLeave: () => void;
    onToggleMuted: () => void;
    onToggleDeafened: () => void;
    onSelectAudioDevice: (deviceId: string) => void;
};

export const VoiceStrip = ({
    enabled,
    joined,
    roomId,
    selectedRoomId,
    rooms,
    muted,
    deafened,
    membership,
    audioLevels,
    audioDevices,
    selectedAudioDeviceId,
    onJoin,
    onLeave,
    onToggleMuted,
    onToggleDeafened,
    onSelectAudioDevice,
}: VoiceStripProps) => {
    const activeRoomName = useMemo(
        () => rooms.find((room) => room.roomId === roomId)?.name ?? roomId ?? 'No active call',
        [roomId, rooms]
    );
    const speakingCount = useMemo(
        () => Object.values(audioLevels).filter((level) => level.speaking).length,
        [audioLevels]
    );
    const connectedCount = useMemo(
        () => Object.values(membership).filter((member) => member.membership === 'joined').length,
        [membership]
    );

    if (!enabled) return null;

    return (
        <section
            data-testid="voice-strip-shell"
            style={{
                borderTop: '1px solid var(--border-default)',
                padding: '8px 10px',
                background: 'var(--bg-surface)',
                display: 'grid',
                gap: 6,
            }}
        >
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                    fontSize: 11,
                }}
            >
                <div style={{ minWidth: 0 }}>
                    <strong
                        style={{
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            display: 'block',
                        }}
                    >
                        {joined ? activeRoomName : 'Voice idle'}
                    </strong>
                    <span style={{ color: 'var(--text-secondary)' }}>
                        {joined
                            ? `${connectedCount} connected${
                                  speakingCount > 0 ? ` • ${speakingCount} speaking` : ''
                              }`
                            : 'Join a room to start voice'}
                    </span>
                </div>
                <span
                    style={{
                        fontSize: 10,
                        borderRadius: 999,
                        padding: '2px 6px',
                        border: '1px solid var(--border-default)',
                        background: joined ? 'rgba(83, 240, 117, 0.2)' : 'var(--bg-input)',
                    }}
                >
                    {joined ? 'LIVE' : 'OFF'}
                </span>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                {joined ? (
                    <>
                        <button type="button" style={stripButtonStyle} onClick={onToggleMuted}>
                            {muted ? 'Unmute' : 'Mute'}
                        </button>
                        <button type="button" style={stripButtonStyle} onClick={onToggleDeafened}>
                            {deafened ? 'Undeafen' : 'Deafen'}
                        </button>
                        <label
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 6,
                                fontSize: 11,
                            }}
                        >
                            Mic
                            <select
                                aria-label="Select microphone"
                                value={selectedAudioDeviceId}
                                onChange={(event) => onSelectAudioDevice(event.target.value)}
                                style={{ ...stripButtonStyle, padding: '3px 6px' }}
                            >
                                {audioDevices.map((device) => (
                                    <option key={device.deviceId} value={device.deviceId}>
                                        {device.label ||
                                            `Microphone ${device.deviceId.slice(0, 6)}`}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <button
                            type="button"
                            style={{
                                ...stripButtonStyle,
                                background: 'var(--danger)',
                                color: '#fff',
                            }}
                            onClick={onLeave}
                        >
                            Leave
                        </button>
                    </>
                ) : (
                    <button
                        type="button"
                        style={stripButtonStyle}
                        disabled={!selectedRoomId}
                        onClick={() => {
                            if (selectedRoomId) onJoin(selectedRoomId);
                        }}
                    >
                        Join room voice
                    </button>
                )}
            </div>
        </section>
    );
};

export default VoiceStrip;
