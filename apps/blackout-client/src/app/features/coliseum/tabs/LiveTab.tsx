import React, { useEffect, useMemo, useState } from 'react';
import { useAtom } from 'jotai';
import {
    isGrantedSpeaker,
    isValidLiveRoomId,
    type ColiseumCitation,
    type ColiseumLiveSession,
    type RankedColiseumArgument,
} from '@blackout/core';
import { EmptyState } from '@blackout/ui/primitives';
import { useColiseumTopic } from '../hooks/useColiseumTopics';
import { useColiseumLive } from '../hooks/useColiseumLive';
import { coliseumTabAtom, selectedColiseumTopicIdAtom } from '../../../state/coliseum';
import { useMatrixClientOrNull } from '../../../hooks/useMatrixClient';
import { useOptionalCall } from '../../call/CallProvider';
import ColiseumCitationChip from '../ColiseumCitationChip';
import { AuthorLine } from '../components/AuthorLine';
import { StanceBadge } from '../components/StanceBadge';
import * as ui from '../components/coliseumUi.css';

const LIVE_KINDS: ReadonlySet<ColiseumCitation['kind']> = new Set([
    'live',
    'townhall',
    'subscription',
]);

function liveCitations(arg: RankedColiseumArgument): ColiseumCitation[] {
    return arg.citations.filter((c) => LIVE_KINDS.has(c.kind));
}

/** Small uppercase subheading inside cards (no shared class covers this size). */
function SubHeading({ children }: { children: React.ReactNode }) {
    return (
        <h3
            className={ui.mutedText}
            style={{
                margin: 0,
                fontSize: 12,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: 0.5,
            }}
        >
            {children}
        </h3>
    );
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
        <article className={ui.card} data-testid="coliseum-live-start">
            <h3 className={ui.cardTitle}>Start a live debate</h3>
            <p className={ui.mutedText} style={{ margin: 0 }}>
                Open a real-time room for this topic with a moderated speaking queue.
            </p>
            <input
                data-testid="coliseum-live-room-input"
                value={roomId}
                onChange={(event) => setRoomId(event.target.value)}
                placeholder="!debate:your-server"
                style={{
                    padding: '10px 14px',
                    borderRadius: 999,
                    border: '1px solid var(--border-default)',
                    background: 'var(--bg-input)',
                    color: 'var(--text-primary)',
                    fontSize: 14,
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
                className={ui.chipActive}
                style={{ alignSelf: 'flex-start' }}
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
            <SubHeading>Speaking queue</SubHeading>
            {active.length === 0 ? (
                <EmptyState
                    title="No one is in the queue yet"
                    description={
                        canRequest
                            ? 'Request to speak and the moderator can bring you on mic.'
                            : 'Speakers who request the mic will show up here.'
                    }
                />
            ) : (
                active.map((slot) => (
                    <div key={slot.userId} data-testid={`coliseum-live-slot-${slot.userId}`}>
                        <AuthorLine userId={slot.userId}>
                            <span className={ui.tagChip}>{slot.state}</span>
                            <span
                                style={{
                                    marginLeft: 'auto',
                                    display: 'flex',
                                    gap: 6,
                                    alignItems: 'center',
                                }}
                            >
                                {isModerator && slot.state === 'requested' ? (
                                    <button
                                        type="button"
                                        data-testid={`coliseum-live-grant-${slot.userId}`}
                                        onClick={() => void onGrant(slot.userId)}
                                        className={ui.chipActive}
                                    >
                                        Grant
                                    </button>
                                ) : null}
                                {isModerator && slot.state === 'granted' ? (
                                    <button
                                        type="button"
                                        data-testid={`coliseum-live-revoke-${slot.userId}`}
                                        onClick={() => void onRevoke(slot.userId)}
                                        className={ui.chip}
                                    >
                                        Revoke
                                    </button>
                                ) : null}
                            </span>
                        </AuthorLine>
                    </div>
                ))
            )}
            {canRequest ? (
                <button
                    type="button"
                    data-testid="coliseum-live-request-speak"
                    onClick={() => void onRequest()}
                    className={ui.chipActive}
                    style={{ alignSelf: 'flex-start' }}
                >
                    🎙️ Request to speak
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
            <SubHeading>Pinned evidence</SubHeading>
            <div className={ui.tagRow}>
                {session.pinnedEvidence.map((evidence, index) => {
                    if (evidence.kind === 'citation') {
                        return <ColiseumCitationChip key={index} citation={evidence.citation} />;
                    }
                    const arg = argumentsById.get(evidence.argumentId);
                    return (
                        <span
                            key={index}
                            data-testid="coliseum-live-pinned-argument"
                            className={ui.tagChip}
                            style={{ fontSize: 13, padding: '4px 10px' }}
                        >
                            📌 {arg ? arg.body : `Argument ${evidence.argumentId}`}
                        </span>
                    );
                })}
            </div>
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
        <article
            className={ui.card}
            style={{
                borderColor: 'var(--danger, #ff5247)',
                background: 'color-mix(in srgb, var(--danger, #ff5247) 6%, var(--bg-surface))',
            }}
            data-testid="coliseum-live-session"
        >
            <div className={ui.cardHeaderRow}>
                <span className={ui.liveDot} aria-hidden />
                <strong
                    style={{
                        fontSize: 12,
                        fontWeight: 800,
                        letterSpacing: 1,
                        color: 'var(--danger, #ff5247)',
                    }}
                >
                    LIVE
                </strong>
                <span className={ui.mutedText} style={{ fontSize: 12 }}>
                    {session.roomId} · {session.status}
                </span>
                <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                    {call ? (
                        joinedHere ? (
                            <button
                                type="button"
                                data-testid="coliseum-live-leave"
                                onClick={() => void call.leaveCall()}
                                className={ui.chip}
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
                                className={ui.chipActive}
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
                            className={ui.chip}
                        >
                            End session
                        </button>
                    ) : null}
                </span>
            </div>

            {call && joinedHere ? (
                canPublish ? (
                    <div className={ui.actionRow} data-testid="coliseum-live-publish-controls">
                        <span className={ui.mutedText}>🎙️ On mic</span>
                        <button
                            type="button"
                            data-testid="coliseum-live-toggle-mic"
                            onClick={() => call.setMuted(!call.muted)}
                            className={ui.actionButton}
                        >
                            {call.muted ? 'Unmute' : 'Mute'}
                        </button>
                        <button
                            type="button"
                            data-testid="coliseum-live-toggle-camera"
                            onClick={() => call.setCameraEnabled(!call.cameraEnabled)}
                            className={ui.actionButton}
                        >
                            {call.cameraEnabled ? 'Stop video' : 'Start video'}
                        </button>
                    </div>
                ) : (
                    <p
                        data-testid="coliseum-live-audience-note"
                        className={ui.mutedText}
                        style={{ margin: 0 }}
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
                    <SubHeading>Pin an argument</SubHeading>
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
                                className={ui.actionButton}
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
            <EmptyState
                title="No topic selected"
                description="Pick a topic in the arena to host or join a live debate with a moderated speaking queue."
                action={
                    <button
                        type="button"
                        className={ui.chipActive}
                        onClick={() => setTab('topics')}
                    >
                        Browse topics
                    </button>
                }
            />
        );
    }
    if (loading && !data) {
        return (
            <div className={ui.feedColumn} aria-busy="true">
                <div className={ui.skeleton} style={{ height: 160 }} aria-hidden />
                <div className={ui.skeleton} style={{ height: 120 }} aria-hidden />
            </div>
        );
    }
    if (error)
        return <div style={{ padding: 24, color: 'var(--danger)' }}>Couldn't load: {error}</div>;
    if (!data) return null;

    const topicArguments = data.arguments;
    const liveArgs = topicArguments
        .map((arg) => ({ arg, live: liveCitations(arg) }))
        .filter((entry) => entry.live.length > 0);

    return (
        <div className={ui.feedColumn} data-testid="coliseum-live">
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

            <h3 className={ui.sectionTitle}>Cited Lives, town-halls &amp; subscriptions</h3>
            {liveArgs.length === 0 ? (
                <EmptyState
                    title="No live citations yet"
                    description="Arguments that cite Lives, town-halls, or subscriptions will show up here."
                    action={
                        <button
                            type="button"
                            className={ui.chipActive}
                            onClick={() => setTab('debate')}
                        >
                            Go to the debate
                        </button>
                    }
                />
            ) : (
                liveArgs.map(({ arg, live: cites }) => (
                    <article key={arg.id} className={ui.card}>
                        <AuthorLine userId={arg.authorId} timestamp={arg.createdAt}>
                            <span style={{ marginLeft: 'auto' }}>
                                <StanceBadge stance={arg.stance} />
                            </span>
                        </AuthorLine>
                        <p style={{ margin: 0, fontSize: 15, lineHeight: 1.5 }}>{arg.body}</p>
                        <div className={ui.tagRow}>
                            {cites.map((citation, index) => (
                                <ColiseumCitationChip key={index} citation={citation} />
                            ))}
                        </div>
                    </article>
                ))
            )}
        </div>
    );
}

export default LiveTab;
