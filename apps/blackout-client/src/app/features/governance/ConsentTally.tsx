import { useMemo, useState } from 'react';
import { useAtomValue } from 'jotai';
import { userIdAtom } from '../../state/auth';
import { useCastConsent, useConsentReactions } from './useProposals';
import {
    CONSENT_KEYS,
    type ConsentKey,
    type ConsentReaction,
} from '../../../lib/bmc-core/consent';
import { BLACKOUT_TERMS } from '../../lib/blackoutTerminology';

/**
 * UI for a consent proposal:
 *   • Three reaction buttons (🌱 / 🌾 / 🪨) carrying the choice space
 *   • Inline note input for concerns (🌾) and a structured "what harm?" form
 *     for paramount objections (🪨)
 *   • Live tally — consents toward quorum, list of concerns & objections
 *   • A prominent "Blocked — needs a circle" banner the moment a 🪨 lands
 *
 * The banner appears immediately so the proposer can iterate, but
 * `computedStatus` only commits 'failed' at deadline (handled in
 * `useProposalResult`). The brief's S3 framing — "good enough for now,
 * safe enough to try" — lives in the copy here.
 */
export interface ConsentTallyProps {
    roomId: string;
    proposalId: string;
    quorum: number;
}

const KEY_LABELS: Record<ConsentKey, string> = {
    '🌱': BLACKOUT_TERMS.consent.safeToTry,
    '🌾': BLACKOUT_TERMS.consent.concern,
    '🪨': BLACKOUT_TERMS.consent.objection,
};

const KEY_HELPER: Record<ConsentKey, string> = {
    '🌱': 'Good enough for now, safe enough to try.',
    '🌾': "There's something we should resolve before trying this.",
    '🪨': "I anticipate harm we shouldn't risk. Open a circle.",
};

export const ConsentTally = ({ roomId, proposalId, quorum }: ConsentTallyProps) => {
    const myUserId = useAtomValue(userIdAtom);
    const reactionsState = useConsentReactions(proposalId, roomId);
    const castConsent = useCastConsent(roomId);
    const [drafting, setDrafting] = useState<ConsentKey | null>(null);
    const [draftNote, setDraftNote] = useState('');
    const [busy, setBusy] = useState<ConsentKey | null>(null);

    const myLatest = useMemo<ConsentReaction | null>(() => {
        if (!myUserId) return null;
        const mine = reactionsState.data.filter((r) => r.reactorId === myUserId);
        if (mine.length === 0) return null;
        return mine.reduce((latest, candidate) =>
            candidate.timestamp > latest.timestamp ? candidate : latest,
        );
    }, [myUserId, reactionsState.data]);

    const tally = useMemo(() => {
        // Inline mirror of tallyConsent so this component stays useful even
        // when rendered without the parent useProposalResult; the parent
        // computes the same thing for status logic.
        const latestByReactor = new Map<string, ConsentReaction>();
        for (const reaction of reactionsState.data) {
            const existing = latestByReactor.get(reaction.reactorId);
            if (!existing || reaction.timestamp > existing.timestamp) {
                latestByReactor.set(reaction.reactorId, reaction);
            }
        }
        const consents: ConsentReaction[] = [];
        const concerns: ConsentReaction[] = [];
        const objections: ConsentReaction[] = [];
        for (const r of latestByReactor.values()) {
            if (r.key === '🌱') consents.push(r);
            else if (r.key === '🌾') concerns.push(r);
            else if (r.key === '🪨') objections.push(r);
        }
        return { consents, concerns, objections };
    }, [reactionsState.data]);

    const blocked = tally.objections.length > 0;

    const onSubmitKey = async (key: ConsentKey) => {
        if (busy) return;
        if (key === '🌱') {
            setBusy('🌱');
            try {
                await castConsent({ proposalEventId: proposalId, key });
                setDrafting(null);
                setDraftNote('');
            } finally {
                setBusy(null);
            }
            return;
        }
        // Concerns and objections open the inline note input first.
        setDrafting(key);
        setDraftNote('');
    };

    const onSendNote = async () => {
        if (!drafting || busy) return;
        setBusy(drafting);
        try {
            await castConsent({
                proposalEventId: proposalId,
                key: drafting,
                note: draftNote,
            });
            setDrafting(null);
            setDraftNote('');
        } finally {
            setBusy(null);
        }
    };

    return (
        <section
            data-testid="consent-tally"
            style={{
                border: '1px solid var(--border-default)',
                borderRadius: 12,
                background: 'var(--bg-surface)',
                padding: 12,
                display: 'grid',
                gap: 10,
            }}
        >
            {blocked && (
                <div
                    role="alert"
                    style={{
                        border: '1px solid var(--danger, #EF5350)',
                        background: 'rgba(239,83,80,0.08)',
                        color: 'var(--text-primary)',
                        borderRadius: 10,
                        padding: '8px 10px',
                        fontSize: 13,
                    }}
                >
                    <strong>{BLACKOUT_TERMS.consent.blockedHeadline}.</strong>{' '}
                    Open a circle to resolve the harm raised before continuing.
                </div>
            )}

            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong>How does the circle feel?</strong>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    Consents: {tally.consents.length}/{quorum}
                </span>
            </header>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                {CONSENT_KEYS.map((key) => {
                    const isMine = myLatest?.key === key;
                    return (
                        <button
                            key={key}
                            type="button"
                            data-testid={`consent-button-${key}`}
                            onClick={() => void onSubmitKey(key)}
                            disabled={busy !== null}
                            style={{
                                display: 'grid',
                                gap: 4,
                                padding: '10px 8px',
                                borderRadius: 10,
                                border: `1px solid ${isMine ? 'var(--accent-primary)' : 'var(--border-default)'}`,
                                background: isMine ? 'var(--accent-muted)' : 'var(--bg-input)',
                                color: 'var(--text-primary)',
                                textAlign: 'center',
                            }}
                        >
                            <span style={{ fontSize: 22 }}>{key}</span>
                            <span style={{ fontSize: 12, fontWeight: 600 }}>{KEY_LABELS[key]}</span>
                            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                                {KEY_HELPER[key]}
                            </span>
                        </button>
                    );
                })}
            </div>

            {drafting && (
                <div style={{ display: 'grid', gap: 6 }}>
                    <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                        {drafting === '🪨'
                            ? 'What harm do you anticipate? Be specific.'
                            : 'What concern would you like the circle to hear?'}
                    </label>
                    <textarea
                        autoFocus
                        value={draftNote}
                        onChange={(event) => setDraftNote(event.target.value)}
                        rows={drafting === '🪨' ? 4 : 2}
                        style={{
                            border: '1px solid var(--border-default)',
                            borderRadius: 8,
                            background: 'var(--bg-input)',
                            color: 'var(--text-primary)',
                            padding: 8,
                        }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                        <button
                            type="button"
                            onClick={() => {
                                setDrafting(null);
                                setDraftNote('');
                            }}
                            disabled={busy !== null}
                            style={{
                                border: '1px solid var(--border-default)',
                                borderRadius: 8,
                                background: 'var(--bg-input)',
                                color: 'var(--text-primary)',
                                padding: '6px 10px',
                            }}
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={() => void onSendNote()}
                            disabled={busy !== null}
                            style={{
                                border: '1px solid var(--border-default)',
                                borderRadius: 8,
                                background: 'var(--accent-primary)',
                                color: 'var(--bg-surface)',
                                padding: '6px 10px',
                            }}
                        >
                            {busy ? 'Sending…' : 'Send'}
                        </button>
                    </div>
                </div>
            )}

            <section>
                <strong style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Concerns</strong>
                {tally.concerns.length === 0 ? (
                    <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
                        None raised yet.
                    </p>
                ) : (
                    <ul style={{ margin: '4px 0 0', paddingLeft: 18, fontSize: 13 }}>
                        {tally.concerns.map((c) => (
                            <li key={c.eventId}>
                                <span style={{ color: 'var(--text-secondary)' }}>{c.reactorId}</span>
                                {c.note ? ` — ${c.note}` : ''}
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            <section>
                <strong style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    Paramount objections
                </strong>
                {tally.objections.length === 0 ? (
                    <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
                        None.
                    </p>
                ) : (
                    <ul style={{ margin: '4px 0 0', paddingLeft: 18, fontSize: 13 }}>
                        {tally.objections.map((o) => (
                            <li key={o.eventId}>
                                <span style={{ color: 'var(--text-secondary)' }}>{o.reactorId}</span>
                                {o.note ? ` — ${o.note}` : ''}
                            </li>
                        ))}
                    </ul>
                )}
            </section>
        </section>
    );
};

export default ConsentTally;
