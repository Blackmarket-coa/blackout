import type { Bounty, BountyCategory } from '@blackout/core';
import * as css from './BountyBoard.css';

const CATEGORY_LABELS: Record<BountyCategory, string> = {
    creator: 'Creator',
    coalition: 'Coalition',
    developer: 'Developer',
    tester: 'Tester',
    content: 'Content',
};

/**
 * Bounty Board rail woven into the home feed — the ecosystem's "there is work
 * available" surface. Blackout-home presents the community-and-creation
 * categories (creator / coalition / developer / tester / content); the same
 * engine drives FBM-home with producer/vendor categories. Renders nothing when
 * there are no open bounties, so it stays invisible until the board has content.
 */
export const BountyBoard = ({ items }: { items: Bounty[] }): JSX.Element | null => {
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
                    <article
                        key={bounty.id}
                        className={css.card}
                        data-testid="home-bounty-card"
                        data-bounty-category={bounty.category}
                    >
                        <span className={css.categoryTag}>{CATEGORY_LABELS[bounty.category]}</span>
                        <span className={css.title}>{bounty.title}</span>
                        <span className={css.reward}>{bounty.rewardSummary}</span>
                    </article>
                ))}
            </div>
        </section>
    );
};

export default BountyBoard;
