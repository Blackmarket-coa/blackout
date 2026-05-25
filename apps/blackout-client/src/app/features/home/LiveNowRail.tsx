import { Link } from 'react-router-dom';
import * as css from './LiveNowRail.css';
import type { StreamFeedItem } from './unifiedFeedModel';

/**
 * Pinned "Live now" rail of ambient live windows woven into the feed. Renders
 * nothing when no streams are live.
 */
export const LiveNowRail = ({ items }: { items: StreamFeedItem[] }): JSX.Element | null => {
    if (items.length === 0) return null;
    return (
        <section
            className={css.section}
            data-shell-region="home-live-rail"
            data-testid="home-live-rail"
        >
            <header className={css.label}>Live now</header>
            <div className={css.rail}>
                {items.map((item) => (
                    <Link
                        key={item.id}
                        to={item.href}
                        className={css.card}
                        data-testid="home-live-card"
                    >
                        <span className={css.liveTag}>
                            <span className={css.liveDot} aria-hidden="true" />
                            LIVE
                        </span>
                        <span className={css.title}>{item.title}</span>
                    </Link>
                ))}
            </div>
        </section>
    );
};

export default LiveNowRail;
