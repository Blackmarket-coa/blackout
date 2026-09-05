import { mxIdToDisplayName } from '../../utils/matrix';
import classNames from 'classnames';
import { useEffect, useState } from 'react';
import * as css from './RelayChainDialog.css';
import { fetchRelayChain, type RelayChainResponse } from './circleFeedClient';

interface RelayChainDialogProps {
    relayId: string;
    viewerId: string | null;
    onClose: () => void;
    displayNameFor?: (userId: string) => string;
}

const formatWhen = (iso: string): string => {
    const parsed = Date.parse(iso);
    return Number.isNaN(parsed) ? iso : new Date(parsed).toLocaleString();
};

/**
 * The full relay chain: every person who carried this, when, and why.
 *
 * Withdrawn relayers are listed and marked rather than removed — the item did
 * travel through them, and a chain with a hole in it would be a lie about how it
 * arrived.
 */
export const RelayChainDialog = ({
    relayId,
    viewerId,
    onClose,
    displayNameFor = mxIdToDisplayName,
}: RelayChainDialogProps) => {
    const [chain, setChain] = useState<RelayChainResponse | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        fetchRelayChain(relayId)
            .then((result) => {
                if (!cancelled) setChain(result);
            })
            .catch((cause: unknown) => {
                if (!cancelled) {
                    setError(cause instanceof Error ? cause.message : 'Could not load the chain');
                }
            });
        return () => {
            cancelled = true;
        };
    }, [relayId]);

    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    return (
        <div
            className={css.backdrop}
            role="presentation"
            onClick={(event) => {
                if (event.target === event.currentTarget) onClose();
            }}
        >
            <div
                className={css.panel}
                role="dialog"
                aria-modal="true"
                aria-label="Relay chain"
                data-testid="relay-chain-dialog"
            >
                <h2 className={css.title}>How this reached you</h2>
                <p className={css.subtitle}>
                    Every person who chose to relay it, nearest to you first.
                </p>

                {error ? <p className={css.hopMeta}>{error}</p> : null}
                {!chain && !error ? <p className={css.hopMeta}>Loading…</p> : null}

                {chain ? (
                    <>
                        <ol className={css.list}>
                            {chain.path.hops.map((hop) => (
                                <li key={hop.relayId} className={css.hopRow}>
                                    <span
                                        className={classNames(
                                            css.hopName,
                                            !hop.active && css.withdrawn
                                        )}
                                    >
                                        {viewerId && hop.userId === viewerId
                                            ? 'You'
                                            : displayNameFor(hop.userId)}
                                    </span>
                                    <span className={css.hopMeta}>
                                        {formatWhen(hop.at)}
                                        {hop.active ? '' : ' · withdrew this relay'}
                                    </span>
                                    {hop.note ? <p className={css.note}>“{hop.note}”</p> : null}
                                </li>
                            ))}
                        </ol>

                        <p className={css.origin}>
                            {chain.path.originAuthorId
                                ? `Originally posted by ${displayNameFor(
                                      chain.path.originAuthorId
                                  )}.`
                                : 'The original poster is not recorded for this item.'}
                            {chain.allRelayers.length > chain.path.hops.length
                                ? ` ${chain.allRelayers.length} people have relayed it in total.`
                                : ''}
                        </p>
                    </>
                ) : null}

                <button type="button" className={css.closeButton} onClick={onClose}>
                    Close
                </button>
            </div>
        </div>
    );
};

export default RelayChainDialog;
