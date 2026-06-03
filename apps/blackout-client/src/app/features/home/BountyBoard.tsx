import { useState } from 'react';
import type { Bounty } from '@blackout/core';
import { applyToBounty } from '../bounty/bountyClient';
import { BOUNTY_CATEGORY_LABELS } from './bountyCategoryLabels';
import { BountyDetailPanel } from './BountyDetailPanel';
import * as css from './BountyBoard.css';

type ApplyState = 'idle' | 'applying' | 'applied' | 'error';

/** A single bounty card: a quick Apply action plus a Details button that opens the panel. */
const BountyCard = ({
    bounty,
    onOpenDetails,
}: {
    bounty: Bounty;
    onOpenDetails: (bounty: Bounty) => void;
}): JSX.Element => {
    const [state, setState] = useState<ApplyState>('idle');

    const onApply = () => {
        setState('applying');
        applyToBounty(bounty.id)
            .then(() => setState('applied'))
            .catch(() => setState('error'));
    };

    return (
        <article
            className={css.card}
            data-testid="home-bounty-card"
            data-bounty-category={bounty.category}
        >
            <span className={css.categoryTag}>{BOUNTY_CATEGORY_LABELS[bounty.category]}</span>
            <span className={css.title}>{bounty.title}</span>
            <span className={css.reward}>{bounty.rewardSummary}</span>
            <div className={css.cardActions}>
                <button
                    type="button"
                    className={css.applyButton}
                    data-testid="home-bounty-apply"
                    disabled={state === 'applying' || state === 'applied'}
                    onClick={onApply}
                >
                    {state === 'applied'
                        ? 'Applied ✓'
                        : state === 'applying'
                        ? 'Applying…'
                        : state === 'error'
                        ? 'Retry'
                        : 'Apply'}
                </button>
                <button
                    type="button"
                    className={css.detailsButton}
                    data-testid="home-bounty-details"
                    onClick={() => onOpenDetails(bounty)}
                >
                    Details
                </button>
            </div>
        </article>
    );
};

/**
 * Bounty Board rail woven into the home feed — the ecosystem's "there is work
 * available" surface, and the entry point for producer↔creator matching: each
 * card carries an Apply action and a Details button that opens a panel (the
 * poster sees applicants to accept; everyone else can apply). Blackout-home
 * presents the community-and-creation categories; the same engine drives
 * FBM-home with producer/vendor categories. Renders nothing when there are no
 * open bounties, so it stays invisible until the board has content.
 */
export const BountyBoard = ({ items }: { items: Bounty[] }): JSX.Element | null => {
    const [selected, setSelected] = useState<Bounty | null>(null);
    if (items.length === 0) return null;
    return (
        <section
            className={css.section}
            data-shell-region="home-bounty-board"
            data-testid="home-bounty-board"
        >
            <header className={css.label}>Bounty board</header>
            <div className={css.rail}>
                {items.map((bounty) => (
                    <BountyCard key={bounty.id} bounty={bounty} onOpenDetails={setSelected} />
                ))}
            </div>
            {selected ? (
                <BountyDetailPanel bounty={selected} onClose={() => setSelected(null)} />
            ) : null}
        </section>
    );
};

export default BountyBoard;
