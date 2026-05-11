import { useMemo } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import type { Room } from 'matrix-js-sdk';
import {
    type RoundOpenedPayload,
} from '@blackout/protocol';
import { userIdAtom } from '../../state/auth';
import { roomIdToReplyDraftAtomFamily } from '../../state/room/roomInputDrafts';
import { useDenPlaybook } from '../playbook/usePlaybook';
import { useRoundContributions } from './useRounds';
import { BLACKOUT_TERMS } from '../../lib/blackoutTerminology';

/**
 * Inline timeline card for an open round. Renders a three-row turn queue —
 * yet-to-speak / speaking-now / spoken — under the prompt. Silence is
 * visible without shaming anyone: the brief is firm that step-up indicators
 * are user-private at v1.
 *
 * Tap-your-avatar seeds the room composer's reply draft against the round
 * event so the next message you send becomes your contribution. Voice notes
 * use the existing MSC3245 composer path — when `allowVoice` is true and the
 * den's playbook has `voiceNotesOnRounds`, we hint the user to record.
 *
 * The "Rehearsal" badge appears whenever the den's playbook is in trial
 * mode (work-stream J1). Contributions still post, the prompt still reads,
 * but the result is a rehearsal — not a binding decision.
 */
export interface RoundCardProps {
    roomId: string;
    eventId: string;
    payload: RoundOpenedPayload;
    senderId: string;
    room: Room | null;
}

const styles = {
    card: {
        border: '1px solid var(--border-default)',
        borderRadius: 12,
        background: 'var(--bg-surface)',
        padding: 12,
        display: 'grid',
        gap: 10,
    } as const,
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } as const,
    pillRow: { display: 'flex', gap: 6, flexWrap: 'wrap' } as const,
    avatar: {
        width: 28,
        height: 28,
        borderRadius: 999,
        background: 'var(--bg-input)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 11,
        color: 'var(--text-primary)',
        border: '1px solid var(--border-default)',
        cursor: 'pointer',
    } as const,
    avatarSelf: {
        borderColor: 'var(--accent-primary)',
        background: 'var(--accent-muted)',
    } as const,
    rowLabel: { fontSize: 11, color: 'var(--text-muted)', minWidth: 110 } as const,
};

function shortLabel(userId: string): string {
    const at = userId.startsWith('@') ? userId.slice(1) : userId;
    const colon = at.indexOf(':');
    const local = colon === -1 ? at : at.slice(0, colon);
    return local.slice(0, 2).toUpperCase();
}

export function RoundCard({ roomId, eventId, payload, senderId, room }: RoundCardProps) {
    const myUserId = useAtomValue(userIdAtom);
    const playbook = useDenPlaybook(roomId);
    const contributions = useRoundContributions(roomId, eventId);
    const setReplyDraft = useSetAtom(roomIdToReplyDraftAtomFamily(roomId));

    /**
     * The expected speakers are either the explicit invitee list or — when
     * no invitees are given — every joined member of the room. We render
     * unknown contributors (showing up via reply without being on the
     * roster) as "guests" in the spoken row.
     */
    const roster = useMemo<string[]>(() => {
        if (payload.invitees && payload.invitees.length > 0) return payload.invitees;
        if (!room) return [];
        const members = room.getJoinedMembers?.() ?? [];
        return members.map((member) => member.userId);
    }, [payload.invitees, room]);

    const { spokenSet, voiceSet } = useMemo(() => {
        const spoken = new Set<string>();
        const voice = new Set<string>();
        for (const contribution of contributions.data) {
            spoken.add(contribution.contributorId);
            if (contribution.isVoice) voice.add(contribution.contributorId);
        }
        return { spokenSet: spoken, voiceSet: voice };
    }, [contributions.data]);

    const yetToSpeak = roster.filter((id) => !spokenSet.has(id) && id !== senderId);
    // Facilitator is always "in queue" rather than expected to speak in their
    // own round — keep them as a small indicator instead of in the speak row.
    const speakingNow = myUserId && !spokenSet.has(myUserId) && roster.includes(myUserId) ? myUserId : null;
    const spoken = [...spokenSet];

    const trial = playbook?.mode === 'trial';

    const tapToSpeak = () => {
        setReplyDraft({
            userId: senderId,
            eventId,
            body: `[${BLACKOUT_TERMS.round.title}] ${payload.prompt}`,
        });
    };

    return (
        <section data-testid="round-card" style={styles.card}>
            <header style={styles.header}>
                <strong>{BLACKOUT_TERMS.round.title} — {payload.facilitator.split(':')[0].replace('@', '')}</strong>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    {payload.allowVoice ? 'Voice notes welcome' : 'Text replies only'}
                    {trial ? ' · Rehearsal' : ''}
                </span>
            </header>

            <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{payload.prompt}</p>

            <section style={{ display: 'grid', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={styles.rowLabel}>Yet to speak</span>
                    <div style={styles.pillRow}>
                        {yetToSpeak.length === 0 ? (
                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>—</span>
                        ) : (
                            yetToSpeak.map((id) => (
                                <span
                                    key={id}
                                    style={styles.avatar}
                                    title={id}
                                    aria-label={`${id}, yet to speak`}
                                >
                                    {shortLabel(id)}
                                </span>
                            ))
                        )}
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={styles.rowLabel}>Speaking now</span>
                    <div style={styles.pillRow}>
                        {speakingNow ? (
                            <button
                                type="button"
                                data-testid="round-tap-to-speak"
                                onClick={tapToSpeak}
                                style={{ ...styles.avatar, ...styles.avatarSelf }}
                                title={`Tap to add your ${BLACKOUT_TERMS.round.singular} reply`}
                                aria-label="Tap to speak"
                            >
                                {shortLabel(speakingNow)}
                            </button>
                        ) : (
                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                {myUserId && spokenSet.has(myUserId)
                                    ? 'You spoke already'
                                    : 'Waiting for the circle'}
                            </span>
                        )}
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={styles.rowLabel}>Spoken</span>
                    <div style={styles.pillRow}>
                        {spoken.length === 0 ? (
                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>—</span>
                        ) : (
                            spoken.map((id) => (
                                <span
                                    key={id}
                                    style={styles.avatar}
                                    title={`${id}${voiceSet.has(id) ? ' · voice note' : ''}`}
                                    aria-label={`${id} spoke${voiceSet.has(id) ? ' with a voice note' : ''}`}
                                >
                                    {voiceSet.has(id) ? '🎙' : shortLabel(id)}
                                </span>
                            ))
                        )}
                    </div>
                </div>
            </section>
        </section>
    );
}

export default RoundCard;
