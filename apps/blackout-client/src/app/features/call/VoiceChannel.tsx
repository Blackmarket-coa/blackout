import { useEffect, useMemo, useState } from 'react';
import type { RoomMember } from 'matrix-js-sdk';
import { useCall } from './CallProvider';
import { CallControls } from './CallControls';
import { ScreenSharePreview } from './ScreenSharePreview';
import { CallWidget } from './CallWidget';
import { SpeakingIndicator } from './SpeakingIndicator';

const avatarLabel = (member: RoomMember) =>
    (member.name || member.userId).slice(0, 2).toUpperCase();

export const VoiceChannel = ({
    roomId,
    title,
    members,
    activeRoomId,
}: {
    roomId: string;
    title: string;
    members: RoomMember[];
    activeRoomId: string | null;
}) => {
    const {
        roomId: activeCallRoomId,
        joined,
        joinCall,
        leaveCall,
        membership,
        audioLevels,
        focusStatus,
        focusMessage,
    } = useCall();
    const [selectedAudioDevice, setSelectedAudioDevice] = useState('');
    const [selectedVideoDevice, setSelectedVideoDevice] = useState('');
    const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
    const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);

    const connectedUsers = useMemo(() => {
        const joinedMap = new Map<string, RoomMember>();
        members.forEach((member) => {
            const state = membership[member.userId];
            if (state?.membership === 'joined') {
                joinedMap.set(member.userId, member);
            }
        });
        return [...joinedMap.values()];
    }, [members, membership]);
    const speakingCount = useMemo(
        () =>
            connectedUsers.filter((member) => {
                const state = audioLevels[member.userId];
                return Boolean(state?.speaking);
            }).length,
        [audioLevels, connectedUsers]
    );

    useEffect(() => {
        if (!navigator.mediaDevices?.enumerateDevices) return;

        const loadDevices = async () => {
            const devices = await navigator.mediaDevices.enumerateDevices();
            setAudioDevices(devices.filter((item) => item.kind === 'audioinput'));
            setVideoDevices(devices.filter((item) => item.kind === 'videoinput'));
        };

        void loadDevices();
    }, []);

    useEffect(() => {
        if (activeCallRoomId && activeRoomId && activeCallRoomId !== activeRoomId) {
            void leaveCall();
        }
    }, [activeCallRoomId, activeRoomId, leaveCall]);

    return (
        <section
            style={{
                border: '1px solid var(--border-default)',
                borderRadius: 12,
                padding: 12,
                background: 'var(--bg-surface)',
            }}
        >
            <header
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 8,
                }}
            >
                <div>
                    <strong>{title}</strong>
                    <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                        {connectedUsers.length} connected
                    </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {joined && activeCallRoomId === roomId ? (
                        <span
                            style={{
                                fontSize: 10,
                                border: '1px solid var(--border-default)',
                                borderRadius: 999,
                                padding: '2px 6px',
                                background: 'rgba(83, 240, 117, 0.2)',
                            }}
                            data-testid="voice-room-live-badge"
                        >
                            LIVE{speakingCount > 0 ? ` • ${speakingCount} speaking` : ''}
                        </span>
                    ) : null}
                    <button
                        type="button"
                        onClick={() => void joinCall(roomId)}
                        style={{
                            border: '1px solid var(--border-default)',
                            borderRadius: 8,
                            background: 'var(--accent-primary)',
                            color: 'var(--bg-surface)',
                            padding: '6px 10px',
                        }}
                    >
                        {joined && activeCallRoomId === roomId ? 'Connected' : 'Join Voice'}
                    </button>
                </div>
            </header>

            {focusStatus !== 'healthy' ? (
                <div
                    style={{
                        marginBottom: 10,
                        border: '1px solid var(--warning-border, #b38b2e)',
                        background: 'var(--warning-bg, rgba(179, 139, 46, 0.15))',
                        borderRadius: 8,
                        padding: '8px 10px',
                        fontSize: 12,
                    }}
                    data-testid="call-provider-degraded"
                >
                    {focusMessage}
                </div>
            ) : null}

            {joined && activeCallRoomId === roomId ? (
                <CallWidget roomId={roomId} mode={focusStatus === 'healthy' ? 'sdk' : 'widget'} />
            ) : null}

            <div
                style={{
                    marginTop: 10,
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                    gap: 8,
                }}
            >
                {connectedUsers.map((member) => {
                    const audioLevel = audioLevels[member.userId]?.level ?? 0;
                    const speaking = audioLevels[member.userId]?.speaking ?? false;
                    return (
                        <div
                            key={member.userId}
                            style={{
                                display: 'flex',
                                gap: 8,
                                alignItems: 'center',
                                border: '1px solid var(--border-default)',
                                borderRadius: 10,
                                padding: 6,
                            }}
                        >
                            <SpeakingIndicator
                                speaking={speaking}
                                audioLevel={audioLevel}
                                showStateBadge
                            >
                                <div
                                    style={{
                                        width: 30,
                                        height: 30,
                                        borderRadius: '50%',
                                        background: 'var(--accent-muted)',
                                        display: 'grid',
                                        placeItems: 'center',
                                        fontSize: 12,
                                    }}
                                >
                                    {avatarLabel(member)}
                                </div>
                            </SpeakingIndicator>
                            <div style={{ minWidth: 0 }}>
                                <div
                                    style={{
                                        fontSize: 13,
                                        whiteSpace: 'nowrap',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                    }}
                                >
                                    {member.name || member.userId}
                                </div>
                                <div style={{ color: 'var(--text-secondary)', fontSize: 11 }}>
                                    {speaking ? 'Speaking' : 'Idle'}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {joined && activeCallRoomId === roomId ? (
                <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
                    <ScreenSharePreview />
                    <CallControls
                        onDisconnect={() => void leaveCall()}
                        audioDevices={audioDevices}
                        videoDevices={videoDevices}
                        selectedAudioDevice={selectedAudioDevice}
                        selectedVideoDevice={selectedVideoDevice}
                        onSelectAudioDevice={setSelectedAudioDevice}
                        onSelectVideoDevice={setSelectedVideoDevice}
                    />
                </div>
            ) : null}
        </section>
    );
};

export default VoiceChannel;
