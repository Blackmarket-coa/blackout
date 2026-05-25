import React, { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useAtom } from 'jotai';
import {
    isGrantedSpeaker,
    isValidLiveRoomId,
    type ColiseumCitation,
    type ColiseumLiveSession,
    type RankedColiseumArgument,
} from '@blackout/core';
import { useColiseumTopic } from '../hooks/useColiseumTopics';
import { useColiseumLive } from '../hooks/useColiseumLive';
import { coliseumTabAtom, selectedColiseumTopicIdAtom } from '../../../state/coliseum';
import { useMatrixClientOrNull } from '../../../hooks/useMatrixClient';
import { useOptionalCall } from '../../call/CallProvider';
import ColiseumCitationChip from '../ColiseumCitationChip';

const containerStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    padding: 16,
};

const cardStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    padding: 16,
    border: '1px solid var(--border-default)',
    borderRadius: 12,
    background: 'var(--bg-surface)',
};

const sessionCardStyle: CSSProperties = {
    ...cardStyle,
    border: '1px solid var(--accent-primary, #1ABC9C)',
    background: 'rgba(26, 188, 156, 0.06)',
};

const pillButtonStyle: CSSProperties = {
    padding: '6px 14px',
    borderRadius: 999,
    border: '1px solid var(--border-default)',
    background: 'transparent',
    color: 'var(--text-primary)',
    cursor: 'pointer',
    fontSize: 13,
};

const primaryButtonStyle: CSSProperties = {
    ...pillButtonStyle,
    border: '1px solid var(--accent-primary, #1ABC9C)',
    background: 'var(--accent-primary, #1ABC9C)',
    color: '#fff',
};

const headingStyle: CSSProperties = {
    margin: 0,
    fontSize: 13,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: 'var(--text-secondary)',
};

const LIVE_KINDS: ReadonlySet<ColiseumCitation['kind']> = new Set([
    'live',
    'townhall',
    'subscription',
]);

function liveCitations(arg: RankedColiseumArgument): ColiseumCitation[] {
    return arg.citations.filter((c) => LIVE_KINDS.has(c.kind));
}

function StartSession({ onStart }: { onStart: (roomId: string) => Promise<void> }) {
    const [roomId, setRoomId] = useState('');
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const submit = async () => {
        const trimmed = roomId.trim();
        if (!isValidLiveRoomId(trimmed)) {
            setError('Enter a Matrix room id, e.g. !debate:server');
            return;
        }
        setPending(true);
        setError(null);
        try {
            await onStart(trimmed);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not start the session.');
        } finally {
            setPending(false);
        }
    };

    return (
        <article style={cardStyle} data-testid="coliseum-live-start">
            <h3 style={headingStyle}>Start a live debate</h3>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>
                Open a real-time room for this topic with a moderated speaking queue.
            </p>
            <input
                data-testid="coliseum-live-room-input"
                value={roomId}
                onChange={(event) => setRoomId(event.target.value)}
                placeholder="!debate:your-server"
                style={{
                    padding: 8,
                    borderRadius: 8,
                    border: '1px solid var(--border-default)',
                    background: 'var(--bg-input)',
                    color: 'var(--text-primary)',
                }}
            />
            {error ? (
                <p role="alert" style={{ margin: 0, color: 'var(--danger)', fontSize: 12 }}>
                    {error}
                </p>
            ) : null}
            <button
                type="button"
                data-testid="coliseum-live-start-button"
                onClick={() => void submit()}
                disabled={pending}
                style={{ ...primaryButtonStyle, alignSelf: 'flex-start' }}
            >
                {pending ? 'Starting…' : 'Start live debate'}
            </button>
        </article>
    );
}

function SpeakingQueue({
    session,
    currentUserId,
    isModerator,
    onRequest,
    onGrant,
    onRevoke,
}: {
    session: ColiseumLiveSession;
    currentUserId: string | null;
    isModerator: boolean;
    onRequest: () => Promise<void>;
    onGrant: (userId: string) => Promise<void>;
    onRevoke: (userId: string) => Promise<void>;
}) {
    const active = session.speakingQueue.filter((slot) => slot.state !== 'revoked');
    const mine = currentUserId
        ? session.speakingQueue.find((slot) => slot.userId === currentUserId)
        : undefined;
    const canRequest = !isModerator && (!mine || mine.state === 'revoked');

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <h3 style={headingStyle}>Speaking queue</h3>
            {active.length === 0 ? (
                <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>
                    No one is in the queue yet.
                </p>
            ) : (
                active.map((slot) => (
                    <div
                        key={slot.userId}
                        data-testid={`coliseum-live-slot-${slot.userId}`}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}
                    >
                        <span style={{ flex: 1 }}>
                            {slot.userId}{' '}
                            <em style={{ color: 'var(--text-secondary)' }}>· {slot.state}</em>
                        </span>
                        {isModerator && slot.state === 'requested' ? (
                            <button
                                type="button"
                                data-testid={`coliseum-live-grant-${slot.userId}`}
                                onClick={() => void onGrant(slot.userId)}
                                style={pillButtonStyle}
                            >
                                Grant
                            </button>
                        ) : null}
                        {isModerator && slot.state === 'granted' ? (
                            <button
                                type="button"
                                data-testid={`coliseum-live-revoke-${slot.userId}`}
                                onClick={() => void onRevoke(slot.userId)}
                                style={pillButtonStyle}
                            >
                                Revoke
                            </button>
                        ) : null}
                    </div>
                ))
            )}
            {canRequest ? (
                <button
                    type="button"
                    data-testid="coliseum-live-request-speak"
                    onClick={() => void onRequest()}
                    style={{ ...pillButtonStyle, alignSelf: 'flex-start' }}
                >
                    Request to speak
                </button>
            ) : null}
        </div>
    );
}

function PinnedEvidencePanel({
    session,
    argumentsById,
}: {
    session: ColiseumLiveSession;
    argumentsById: Map<string, RankedColiseumArgument>;
}) {
    if (session.pinnedEvidence.length === 0) return null;
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <h3 style={headingStyle}>Pinned evidence</h3>
            {session.pinnedEvidence.map((evidence, index) => {
                if (evidence.kind === 'citation') {
                    return <ColiseumCitationChip key={index} citation={evidence.citation} />;
                }
                const arg = argumentsById.get(evidence.argumentId);
                return (
                    <div
                        key={index}
                        data-testid="coliseum-live-pinned-argument"
                        style={{
                            fontSize: 13,
                            padding: 8,
                            border: '1px solid var(--border-default)',
                            borderRadius: 8,
                        }}
                    >
                        📌 {arg ? arg.body : `Argument ${evidence.argumentId}`}
                    </div>
                );
            })}
        </div>
    );
}

function ActiveSession({
    session,
    topicArguments,
    onRefetch,
    onRequestSpeak,
    onGrant,
    onRevoke,
    onPin,
    onEnd,
}: {
    session: ColiseumLiveSession;
    topicArguments: RankedColiseumArgument[];
    onRefetch: () => void;
    onRequestSpeak: () => Promise<void>;
    onGrant: (userId: string) => Promise<void>;
    onRevoke: (userId: string) => Promise<void>;
    onPin: (argumentId: string) => Promise<void>;
    onEnd: () => Promise<void>;
}) {
    const mx = useMatrixClientOrNull();
    const call = useOptionalCall();
    const currentUserId = mx?.getUserId() ?? null;
    const isModerator = currentUserId ? session.moderatorIds.includes(currentUserId) : false;
    const joinedHere = Boolean(call?.joined && call.roomId === session.roomId);

    // Single transport: media flows over matrixRTC broadcast mode (presenters
    // publish, audience subscribes). The speaking queue is the control plane —
    // moderators and granted speakers may publish; everyone else is receive-only.
    // matrixRTC has no per-participant SFU publish gate here, so audience members
    // are held muted client-side rather than enforced at the server.
    const canPublish =
        isModerator || (currentUserId ? isGrantedSpeaker(session, currentUserId) : false);

    // Keep audience receive-only: if this user can't publish while joined here,
    // force mic and camera off (covers a speaker whose slot was just revoked).
    useEffect(() => {
        if (!call || !joinedHere || canPublish) return;
        if (!call.muted) call.setMuted(true);
        if (call.cameraEnabled) call.setCameraEnabled(false);
    }, [call, joinedHere, canPublish]);

    const argumentsById = useMemo(
        () => new Map(topicArguments.map((arg) => [arg.id, arg])),
        [topicArguments]
    );

    return (
        <article style={sessionCardStyle} data-testid="coliseum-live-session">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <strong>🔴 Live debate</strong>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    {session.roomId} · {session.status}
                </span>
                <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                    {call ? (
                        joinedHere ? (
                            <button
                                type="button"
                                data-testid="coliseum-live-leave"
                                onClick={() => void call.leaveCall()}
                                style={pillButtonStyle}
                            >
                                Leave
                            </button>
                        ) : (
                            <button
                                type="button"
                                data-testid="coliseum-live-join"
                                onClick={() =>
                                    void call.joinCall(session.roomId, { mode: 'broadcast' })
                                }
                                style={primaryButtonStyle}
                            >
                                Join
                            </button>
                        )
                    ) : null}
                    {isModerator ? (
                        <button
                            type="button"
                            data-testid="coliseum-live-end"
                            onClick={() => void onEnd().then(onRefetch)}
                            style={pillButtonStyle}
                        >
                            End session
                        </button>
                    ) : null}
                </span>
            </div>

            {call && joinedHere ? (
                canPublish ? (
                    <div
                        data-testid="coliseum-live-publish-controls"
                        style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}
                    >
                        <span style={{ color: 'var(--text-secondary)' }}>🎙️ On mic</span>
                        <button
                            type="button"
                            data-testid="coliseum-live-toggle-mic"
                            onClick={() => call.setMuted(!call.muted)}
                            style={pillButtonStyle}
                        >
                            {call.muted ? 'Unmute' : 'Mute'}
                        </button>
                        <button
                            type="button"
                            data-testid="coliseum-live-toggle-camera"
                            onClick={() => call.setCameraEnabled(!call.cameraEnabled)}
                            style={pillButtonStyle}
                        >
                            {call.cameraEnabled ? 'Stop video' : 'Start video'}
                        </button>
                    </div>
                ) : (
                    <p
                        data-testid="coliseum-live-audience-note"
                        style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}
                    >
                        👂 You're in the audience (receive-only). Request to speak to go on mic.
                    </p>
                )
            ) : null}

            <SpeakingQueue
                session={session}
                currentUserId={currentUserId}
                isModerator={isModerator}
                onRequest={onRequestSpeak}
                onGrant={onGrant}
                onRevoke={onRevoke}
            />

            <PinnedEvidencePanel session={session} argumentsById={argumentsById} />

            {isModerator && topicArguments.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <h3 style={headingStyle}>Pin an argument</h3>
                    {topicArguments.slice(0, 6).map((arg) => (
                        <div
                            key={arg.id}
                            style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}
                        >
                            <span
                                style={{
                                    flex: 1,
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                }}
                            >
                                {arg.body}
                            </span>
                            <button
                                type="button"
                                data-testid={`coliseum-live-pin-${arg.id}`}
                                onClick={() => void onPin(arg.id)}
                                style={pillButtonStyle}
                            >
                                📌 Pin
                            </button>
                        </div>
                    ))}
                </div>
            ) : null}
        </article>
    );
}

export function LiveTab() {
    const [selectedTopicId] = useAtom(selectedColiseumTopicIdAtom);
    const [, setTab] = useAtom(coliseumTabAtom);
    const { data, loading, error } = useColiseumTopic(selectedTopicId);
    const live = useColiseumLive(selectedTopicId);

    if (!selectedTopicId) {
        return (
            <div style={{ padding: 24, color: 'var(--text-secondary)' }}>
                Pick a topic on the{' '}
                <button
                    type="button"
                    onClick={() => setTab('topics')}
                    style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--accent-primary, #1ABC9C)',
                        cursor: 'pointer',
                        padding: 0,
                        fontSize: 'inherit',
                    }}
                >
                    Topics
                </button>{' '}
                tab to host or join a live debate.
            </div>
        );
    }
    if (loading && !data) return <div style={{ padding: 24 }}>Loading live debate...</div>;
    if (error)
        return <div style={{ padding: 24, color: 'var(--danger)' }}>Couldn't load: {error}</div>;
    if (!data) return null;

    const topicArguments = data.arguments;
    const liveArgs = topicArguments
        .map((arg) => ({ arg, live: liveCitations(arg) }))
        .filter((entry) => entry.live.length > 0);

    return (
        <div style={containerStyle} data-testid="coliseum-live">
            {live.session ? (
                <ActiveSession
                    session={live.session}
                    topicArguments={topicArguments}
                    onRefetch={live.refetch}
                    onRequestSpeak={live.requestSpeak}
                    onGrant={live.grantSpeak}
                    onRevoke={live.revokeSpeak}
                    onPin={(argumentId) => live.pin({ kind: 'argument', argumentId })}
                    onEnd={live.end}
                />
            ) : (
                <StartSession onStart={live.start} />
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <h3 style={headingStyle}>Cited Lives, town-halls &amp; subscriptions</h3>
                {liveArgs.length === 0 ? (
                    <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>
                        No Lives, town-halls, or subscriptions are cited yet on this topic.
                    </p>
                ) : (
                    liveArgs.map(({ arg, live: cites }) => (
                        <article key={arg.id} style={cardStyle}>
                            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                                From {arg.authorId} ·{' '}
                                <span style={{ color: 'var(--text-primary)' }}>{arg.stance}</span>
                            </div>
                            <p style={{ margin: 0, fontSize: 14 }}>{arg.body}</p>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                {cites.map((citation, index) => (
                                    <ColiseumCitationChip key={index} citation={citation} />
                                ))}
                            </div>
                        </article>
                    ))
                )}
            </div>
        </div>
    );
}

export default LiveTab;
