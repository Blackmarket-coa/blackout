import { useMemo } from 'react';
import type { Room } from 'matrix-js-sdk';
import { useStateEvent } from '../../hooks/useStateEvent';
import { StateEvent } from '../../../types/matrix/room';
import {
    STAGE_MODERATOR_POWER,
    STAGE_STATE_EVENT_TYPE,
    type StageConfig,
    canSpeak,
    parseStageConfig,
    promoteToPresenter,
    removeFromStage,
    resolveStageRoster,
    toggleRequest,
} from './stageState';

const buttonStyle: React.CSSProperties = {
    border: '1px solid var(--border-default)',
    borderRadius: 8,
    background: 'var(--bg-surface)',
    color: 'var(--text-primary)',
    padding: '4px 10px',
    cursor: 'pointer',
    fontSize: 12,
};

export const StageChannelWidget = ({ room }: { room: Room }) => {
    const mx = room.client;
    const myId = mx.getUserId() ?? '';
    const event = useStateEvent(room, STAGE_STATE_EVENT_TYPE as StateEvent);
    const config = useMemo(
        () => parseStageConfig(event?.getContent<Record<string, unknown>>()),
        [event]
    );

    const members = useMemo(
        () =>
            room
                .getJoinedMembers()
                .map((member) => ({ userId: member.userId, powerLevel: member.powerLevel })),
        [room]
    );

    const myPower = room.getMember(myId)?.powerLevel ?? 0;
    const isModerator = myPower >= STAGE_MODERATOR_POWER;
    const roster = useMemo(() => resolveStageRoster(config, members), [config, members]);
    const iCanSpeak = canSpeak(config, myId, myPower);

    const persist = async (next: StageConfig) => {
        await mx.sendStateEvent(room.roomId, STAGE_STATE_EVENT_TYPE as never, { ...next } as never, '');
    };

    return (
        <section aria-label="Stage channel" style={{ display: 'grid', gap: 10, padding: 12 }}>
            <header>
                <strong>Stage</strong>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>
                    Presenters speak; everyone else listens. Microphone enforcement is applied in
                    the call layer.
                </p>
            </header>

            <div>
                <strong style={{ fontSize: 12 }}>Speakers</strong>
                <ul style={{ margin: '4px 0', paddingLeft: 16 }}>
                    {roster.speakers.map((userId) => (
                        <li key={userId} style={{ fontSize: 13, display: 'flex', gap: 8 }}>
                            <span>{userId}</span>
                            {isModerator && config.presenters.includes(userId) ? (
                                <button
                                    type="button"
                                    style={buttonStyle}
                                    onClick={() => void persist(removeFromStage(config, userId))}
                                >
                                    Remove
                                </button>
                            ) : null}
                        </li>
                    ))}
                    {roster.speakers.length === 0 ? (
                        <li style={{ fontSize: 12, color: 'var(--text-secondary)' }}>No speakers.</li>
                    ) : null}
                </ul>
            </div>

            <div>
                <strong style={{ fontSize: 12 }}>Audience</strong>
                <ul style={{ margin: '4px 0', paddingLeft: 16 }}>
                    {roster.audience.map((userId) => (
                        <li key={userId} style={{ fontSize: 13, display: 'flex', gap: 8 }}>
                            <span>
                                {userId}
                                {config.requests.includes(userId) ? ' ✋' : ''}
                            </span>
                            {isModerator ? (
                                <button
                                    type="button"
                                    style={buttonStyle}
                                    onClick={() => void persist(promoteToPresenter(config, userId))}
                                >
                                    Invite to speak
                                </button>
                            ) : null}
                        </li>
                    ))}
                    {roster.audience.length === 0 ? (
                        <li style={{ fontSize: 12, color: 'var(--text-secondary)' }}>No audience.</li>
                    ) : null}
                </ul>
            </div>

            {!iCanSpeak ? (
                <button
                    type="button"
                    style={{ ...buttonStyle, justifySelf: 'start' }}
                    onClick={() => void persist(toggleRequest(config, myId))}
                >
                    {config.requests.includes(myId) ? 'Cancel request to speak' : 'Request to speak'}
                </button>
            ) : null}
        </section>
    );
};

export default StageChannelWidget;
