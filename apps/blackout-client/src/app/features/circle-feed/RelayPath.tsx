import classNames from 'classnames';
import * as css from './RelayPath.css';
import { relayPathLabels } from './circleFeedModel';
import type { RelayHopView } from './circleFeedClient';

interface RelayPathProps {
    hops: readonly RelayHopView[];
    viewerId: string | null;
    /** Count of other people who also relayed this, named on tap. */
    alsoRelayedByCount?: number;
    displayNameFor?: (userId: string) => string;
    /** Opens the full chain. Every hop is already shown; this adds who/when/why. */
    onOpenChain?: () => void;
}

const defaultDisplayName = (userId: string): string => {
    const localpart = /^@([^:\s]+):/.exec(userId)?.[1];
    return localpart ?? userId;
};

/**
 * The visible provenance line: `You → alice → bob`.
 *
 * Every hop in the chain is rendered — never collapsed to "last booster only" —
 * and a relayer who has withdrawn stays in the line, struck through, because the
 * item really did travel through them.
 */
export const RelayPath = ({
    hops,
    viewerId,
    alsoRelayedByCount = 0,
    displayNameFor = defaultDisplayName,
    onOpenChain,
}: RelayPathProps) => {
    const labels = relayPathLabels(hops, viewerId);

    return (
        <button
            type="button"
            className={css.path}
            data-testid="relay-path"
            onClick={onOpenChain}
            // The line already names everyone; the control reveals when each
            // person relayed and any note they left.
            title="See everyone in this chain"
        >
            {labels.map((label, index) => (
                <span key={`${label.userId}-${index}`}>
                    {index > 0 ? <span className={css.arrow}> → </span> : null}
                    <span
                        className={classNames(
                            css.hop,
                            label.isViewer && css.viewerHop,
                            !label.active && css.withdrawnHop
                        )}
                        title={label.active ? undefined : 'This person withdrew their relay'}
                    >
                        {label.isViewer ? 'You' : displayNameFor(label.userId)}
                    </span>
                </span>
            ))}
            {alsoRelayedByCount > 0 ? (
                <span className={css.alsoRelayed} data-testid="relay-path-also">
                    +{alsoRelayedByCount} other{alsoRelayedByCount === 1 ? '' : 's'}
                </span>
            ) : null}
        </button>
    );
};

export default RelayPath;
