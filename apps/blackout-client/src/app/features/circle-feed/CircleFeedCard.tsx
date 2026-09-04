import { mxIdToDisplayName } from '../../utils/matrix';
import classNames from 'classnames';
import { useState } from 'react';
import * as css from './CircleFeedCard.css';
import RelayPath from './RelayPath';
import { provenanceSummary } from './circleFeedModel';
import { relayItem, withdrawRelay, type CircleFeedItem } from './circleFeedClient';

interface CircleFeedCardProps {
    item: CircleFeedItem;
    viewerId: string | null;
    /** The viewer's own relay of this subject, when they have one. */
    myRelayId?: string | null;
    onOpenChain?: (relayId: string) => void;
    onRelayChanged?: () => void;
    displayNameFor?: (userId: string) => string;
}

/**
 * One item in the Circle/Reach feed, with the human chain that delivered it.
 *
 * The relay control is a genuine curatorial act rather than a throwaway button:
 * it carries an optional note, and it passes `viaRelayId` so the next person's
 * chain records the path this viewer actually saw rather than inventing a
 * shorter one.
 */
export const CircleFeedCard = ({
    item,
    viewerId,
    myRelayId = null,
    onOpenChain,
    onRelayChanged,
    displayNameFor = mxIdToDisplayName,
}: CircleFeedCardProps) => {
    const [note, setNote] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const nearestRelayId = item.path?.hops[0]?.relayId ?? null;
    const relayed = myRelayId !== null;

    const toggleRelay = async () => {
        if (!item.subject) return;
        setBusy(true);
        setError(null);
        try {
            if (relayed && myRelayId) {
                await withdrawRelay(myRelayId);
            } else {
                await relayItem({
                    subjectSource: item.subject.source,
                    subjectId: item.subject.id,
                    // Record the edge this viewer saw it through, so the chain
                    // they pass on stays truthful.
                    viaRelayId: nearestRelayId,
                    note: note.trim() || null,
                });
                setNote('');
            }
            onRelayChanged?.();
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Could not update your relay');
        } finally {
            setBusy(false);
        }
    };

    return (
        <article className={css.card} data-testid="circle-feed-card" data-ring={item.ring}>
            <div className={css.header}>
                <span className={css.ringBadge}>{item.ring}</span>
                <span>{provenanceSummary(item, displayNameFor)}</span>
            </div>

            {item.subject ? (
                <>
                    <h3 className={css.title}>{item.subject.title}</h3>
                    {item.subject.body ? <p className={css.body}>{item.subject.body}</p> : null}
                </>
            ) : (
                // The post is gone, but the chain that carried it is still real,
                // so the card stays rather than silently vanishing.
                <p className={css.unavailable} data-testid="circle-feed-card-unavailable">
                    This post is no longer available, but you can still see how it reached you.
                </p>
            )}

            {item.path ? (
                <RelayPath
                    hops={item.path.hops}
                    viewerId={viewerId}
                    alsoRelayedByCount={item.alsoRelayedBy.length}
                    displayNameFor={displayNameFor}
                    onOpenChain={nearestRelayId ? () => onOpenChain?.(nearestRelayId) : undefined}
                />
            ) : null}

            {item.subject ? (
                <div className={css.actions}>
                    {!relayed ? (
                        <input
                            className={css.noteInput}
                            value={note}
                            onChange={(event) => setNote(event.target.value)}
                            placeholder="Relaying because— (optional)"
                            maxLength={280}
                            aria-label="Relay note"
                        />
                    ) : null}
                    <button
                        type="button"
                        className={classNames(css.relayButton, relayed && css.relayButtonActive)}
                        onClick={toggleRelay}
                        disabled={busy}
                        data-testid="circle-feed-relay"
                        aria-pressed={relayed}
                    >
                        {relayed ? 'Boosted' : 'Boost'}
                    </button>
                </div>
            ) : null}

            {error ? <p className={css.error}>{error}</p> : null}
        </article>
    );
};

export default CircleFeedCard;
