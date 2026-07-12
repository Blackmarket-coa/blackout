import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Room, RoomMember } from 'matrix-js-sdk';
import { CallProvider, useCall } from '../call/CallProvider';
import { CallControls } from '../call/CallControls';
import { CallWidget } from '../call/CallWidget';
import { SpeakingIndicator } from '../call/SpeakingIndicator';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useLegacyRoomTimelineAdapter as useRoomTimeline } from '../../plugins/matrix-adapters/hooks/useLegacyTimelineAdapter';
import {
    STAGE_HAND_EVENT_TYPE,
    STAGE_MODERATOR_PL,
    buildStageHandContent,
    collectRaisedHands,
    stageHandSignalFromEvent,
} from './stageHands';

const avatarLabel = (member: RoomMember) =>
    (member.name || member.userId).slice(0, 2).toUpperCase();

const avatarCircle = (size: number, fontSize: number) => ({
    width: size,
    height: size,
    borderRadius: '50%',
    background: 'var(--accent-muted)',
    display: 'grid' as const,
    placeItems: 'center' as const,
    fontSize,
});

/**
 * Stage surface — a voice presentation room split into Speakers (members
 * currently in the call) and Audience (joined members not in the call). It
 * reuses the existing LiveKit call stack (`useCall` / `CallControls` /
 * `CallWidget` / `SpeakingIndicator`) wholesale; the only difference from
 * `VoiceChannel` is the two-tier layout.
 *
 * v1 caveat: a stage is a normal voice room, so anyone who joins becomes a
 * speaker — the speaker/audience split is presentational (in-call vs not),
 * not an enforced mute. Real raise-to-speak would need RTC-level gating.
 */
const StageStage = ({ room }: { room: Room }) => {
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

    const roomId = room.roomId;
    const members = useMemo(() => room.getJoinedMembers(), [room]);
    const onStage = activeCallRoomId === roomId && joined;

    const { speakers, audience } = useMemo(() => {
        const speaking: RoomMember[] = [];
        const listening: RoomMember[] = [];
        members.forEach((member) => {
            if (membership[member.userId]?.membership === 'joined') speaking.push(member);
            else listening.push(member);
        });
        return { speakers: speaking, audience: listening };
    }, [members, membership]);

    // Raise-hand queue: co.bmc.stage.hand timeline signals folded into an
    // oldest-first queue (see stageHands.ts for the rules).
    const client = useMatrixClient();
    const selfUserId = client.getUserId?.() ?? '';
    const { data: timelineEvents } = useRoomTimeline(roomId);
    const isModerator = useCallback(
        (userId: string) => (room.getMember(userId)?.powerLevel ?? 0) >= STAGE_MODERATOR_PL,
        [room]
    );
    const raisedHands = useMemo(() => {
        const signals = (timelineEvents ?? [])
            .map((event) => stageHandSignalFromEvent(event, isModerator))
            .filter((signal): signal is NonNullable<typeof signal> => signal !== null);
        const speakerIds = new Set(speakers.map((member) => member.userId));
        return collectRaisedHands(signals, speakerIds);
    }, [timelineEvents, isModerator, speakers]);
    const ownHandRaised = raisedHands.includes(selfUserId);
    const selfIsModerator = isModerator(selfUserId);

    const sendHandSignal = useCallback(
        (raised: boolean, subject?: string) => {
            void (
                client as unknown as {
                    sendEvent: (
                        rid: string,
                        type: string,
                        content: Record<string, unknown>
                    ) => Promise<unknown>;
                }
            )
                .sendEvent(roomId, STAGE_HAND_EVENT_TYPE, {
                    ...buildStageHandContent(raised, subject),
                })
                .catch(() => undefined);
        },
        [client, roomId]
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
        if (activeCallRoomId && activeCallRoomId !== roomId) {
            void leaveCall();
        }
    }, [activeCallRoomId, roomId, leaveCall]);

    return (
        <section
            data-testid="stage-surface"
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
                    <strong>🎤 {room.name}</strong>
                    <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                        {speakers.length} on stage • {audience.length} in audience
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    {!onStage ? (
                        <button
                            type="button"
                            data-testid="stage-raise-hand"
                            onClick={() => sendHandSignal(!ownHandRaised)}
                            style={{
                                border: '1px solid var(--border-default)',
                                borderRadius: 8,
                                background: ownHandRaised
                                    ? 'var(--accent-muted)'
                                    : 'var(--bg-input)',
                                color: 'var(--text-primary)',
                                padding: '6px 10px',
                            }}
                        >
                            {ownHandRaised ? '✋ Lower hand' : '✋ Raise hand'}
                        </button>
                    ) : null}
                    <button
                        type="button"
                        data-testid="stage-join"
                        onClick={() => void (onStage ? leaveCall() : joinCall(roomId))}
                        style={{
                            border: '1px solid var(--border-default)',
                            borderRadius: 8,
                            background: onStage ? 'var(--bg-input)' : 'var(--accent-primary)',
                            color: onStage ? 'var(--text-primary)' : 'var(--bg-surface)',
                            padding: '6px 10px',
                        }}
                    >
                        {onStage ? 'Leave stage' : 'Join stage'}
                    </button>
                </div>
            </header>

            {focusStatus !== 'healthy' ? (
                <div
                    data-testid="stage-degraded"
                    style={{
                        marginBottom: 10,
                        border: '1px solid var(--warning-border, #b38b2e)',
                        background: 'var(--warning-bg, rgba(179, 139, 46, 0.15))',
                        borderRadius: 8,
                        padding: '8px 10px',
                        fontSize: 12,
                    }}
                >
                    {focusMessage}
                </div>
            ) : null}

            {onStage ? (
                <CallWidget roomId={roomId} mode={focusStatus === 'healthy' ? 'sdk' : 'widget'} />
            ) : null}

            <div style={sectionLabelStyle}>Speakers — {speakers.length}</div>
            {speakers.length === 0 ? (
                <small style={{ color: 'var(--text-muted)' }}>
                    No one is on stage yet. Join to start speaking.
                </small>
            ) : (
                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                        gap: 8,
                    }}
                >
                    {speakers.map((member) => {
                        const audioLevel = audioLevels[member.userId]?.level ?? 0;
                        const speaking = audioLevels[member.userId]?.speaking ?? false;
                        return (
                            <div
                                key={member.userId}
                                data-testid="stage-speaker"
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
                                    <div style={avatarCircle(36, 14)}>{avatarLabel(member)}</div>
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
            )}

            {raisedHands.length > 0 ? (
                <>
                    <div style={sectionLabelStyle}>Raised hands — {raisedHands.length}</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {raisedHands.map((userId, index) => {
                            const member = room.getMember(userId);
                            const name = member?.name || userId;
                            return (
                                <div
                                    key={userId}
                                    data-testid="stage-raised-hand"
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 8,
                                        border: '1px solid var(--border-default)',
                                        borderRadius: 10,
                                        padding: '4px 8px',
                                    }}
                                >
                                    <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                                        {index + 1}.
                                    </span>
                                    <span aria-hidden>✋</span>
                                    <span
                                        style={{
                                            fontSize: 13,
                                            flex: 1,
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            whiteSpace: 'nowrap',
                                        }}
                                    >
                                        {name}
                                    </span>
                                    {selfIsModerator && userId !== selfUserId ? (
                                        <button
                                            type="button"
                                            data-testid="stage-lower-hand"
                                            onClick={() => sendHandSignal(false, userId)}
                                            style={{
                                                border: 'none',
                                                background: 'transparent',
                                                color: 'var(--text-secondary)',
                                                cursor: 'pointer',
                                                fontSize: 12,
                                            }}
                                        >
                                            Lower
                                        </button>
                                    ) : null}
                                </div>
                            );
                        })}
                    </div>
                </>
            ) : null}

            <div style={sectionLabelStyle}>Audience — {audience.length}</div>
            {audience.length === 0 ? (
                <small style={{ color: 'var(--text-muted)' }}>No one listening yet.</small>
            ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {audience.map((member) => (
                        <div
                            key={member.userId}
                            data-testid="stage-audience"
                            title={member.name || member.userId}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                                position: 'relative',
                            }}
                        >
                            <div style={avatarCircle(24, 11)}>{avatarLabel(member)}</div>
                            {raisedHands.includes(member.userId) ? (
                                <span
                                    aria-label={`${member.name || member.userId} raised their hand`}
                                    style={{
                                        position: 'absolute',
                                        top: -6,
                                        right: -4,
                                        fontSize: 11,
                                    }}
                                >
                                    ✋
                                </span>
                            ) : null}
                        </div>
                    ))}
                </div>
            )}

            {onStage ? (
                <div style={{ marginTop: 12 }}>
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

const sectionLabelStyle = {
    fontSize: 11,
    fontWeight: 700 as const,
    letterSpacing: 0.6,
    textTransform: 'uppercase' as const,
    color: 'var(--text-muted)',
    padding: '14px 0 6px',
};

export const StageSurface = ({ room }: { room: Room }) => (
    <CallProvider>
        <StageStage room={room} />
    </CallProvider>
);

export default StageSurface;
