import { Link } from 'react-router';
import * as css from './ContextSidebar.css';
import { ContextModule } from './ContextModule';
import { bmcPalette } from '../../../styles/theme-engine';
import type { UnifiedFeedResult } from '../hooks/useUnifiedFeed';
import type { UnifiedFeedItem } from '../unifiedFeedModel';
import {
    MOCK_COMMUNITY_HEALTH,
    MOCK_UPCOMING_EVENTS,
    MOCK_VOLUNTEER_REQUESTS,
    deriveEcosystemPulse,
} from './contextMocks';

const SIDEBAR_LIMIT = 4;

const bySource = (items: readonly UnifiedFeedItem[], source: UnifiedFeedItem['source']) =>
    items.filter((item) => item.source === source).slice(0, SIDEBAR_LIMIT);

interface ContextSidebarProps {
    feed: UnifiedFeedResult;
}

/**
 * Right-hand "context & spatial awareness" column. Grounds the feed in place
 * and time: an ecosystem pulse up top, then live/nearby/den/debate modules
 * wired to the same `useUnifiedFeed` result the centre column uses, and
 * sample-data modules (events, community health, volunteer needs) below.
 */
export const ContextSidebar = ({ feed }: ContextSidebarProps): JSX.Element => {
    const ranked = feed.discover;
    const pulse = deriveEcosystemPulse(ranked, Date.now());
    const live = feed.liveRail.slice(0, SIDEBAR_LIMIT);
    const coalition = bySource(ranked, 'coalition');
    const dens = bySource(ranked, 'den');
    const debates = bySource(ranked, 'coliseum');

    return (
        <div className={css.sidebar} data-testid="home-context-sidebar">
            <ContextModule
                title="Ecosystem pulse"
                accent={bmcPalette.neonLeaf}
                testid="home-context-pulse"
            >
                <div className={css.pulseGrid}>
                    {pulse.map((stat) => (
                        <div key={stat.label} className={css.pulseCell}>
                            <span className={css.pulseValue}>{stat.value}</span>
                            <span className={css.pulseLabel}>{stat.label}</span>
                        </div>
                    ))}
                </div>
            </ContextModule>

            <ContextModule title="Live now" accent={bmcPalette.danger} testid="home-context-live">
                {live.length === 0 ? (
                    <span className={css.emptyNote}>No streams live right now.</span>
                ) : (
                    live.map((item) => (
                        <Link key={item.id} to={item.href} className={css.row}>
                            <span className={css.rowTitle}>
                                <span className={css.liveDot} aria-hidden="true" />
                                {item.title}
                            </span>
                            <span className={css.rowMeta}>{item.subtitle}</span>
                        </Link>
                    ))
                )}
            </ContextModule>

            <ContextModule
                title="Activity near you"
                accent={bmcPalette.solarMint}
                testid="home-context-nearby"
            >
                {coalition.length === 0 ? (
                    <span className={css.emptyNote}>Coalition activity will surface here.</span>
                ) : (
                    coalition.map((item) => (
                        <Link key={item.id} to={item.href} className={css.row}>
                            <span className={css.rowTitle}>{item.title}</span>
                            <span className={css.rowMeta}>{item.subtitle}</span>
                        </Link>
                    ))
                )}
            </ContextModule>

            <ContextModule title="Active dens" accent={bmcPalette.ember} testid="home-context-dens">
                {dens.length === 0 ? (
                    <span className={css.emptyNote}>Join a den to see its campfire here.</span>
                ) : (
                    dens.map((item) => (
                        <Link key={item.id} to={item.href} className={css.row}>
                            <span className={css.rowTitle}>{item.title}</span>
                            <span className={css.rowMeta}>{item.subtitle}</span>
                        </Link>
                    ))
                )}
            </ContextModule>

            <ContextModule
                title="Trending debates"
                accent={bmcPalette.warning}
                testid="home-context-debates"
            >
                {debates.length === 0 ? (
                    <span className={css.emptyNote}>No debates heating up yet.</span>
                ) : (
                    debates.map((item) => (
                        <Link key={item.id} to={item.href} className={css.row}>
                            <span className={css.rowTitle}>{item.title}</span>
                            <span className={css.rowMeta}>{item.subtitle}</span>
                        </Link>
                    ))
                )}
            </ContextModule>

            <ContextModule
                title="Upcoming events"
                accent={bmcPalette.forest}
                mock
                testid="home-context-events"
            >
                {MOCK_UPCOMING_EVENTS.map((event) => (
                    <div key={event.id} className={css.row}>
                        <span className={css.rowTitle}>{event.title}</span>
                        <span className={css.rowMeta}>
                            {event.when} · {event.place}
                        </span>
                    </div>
                ))}
            </ContextModule>

            <ContextModule
                title="Community health"
                accent={bmcPalette.solarMint}
                mock
                testid="home-context-health"
            >
                {MOCK_COMMUNITY_HEALTH.map((metric) => (
                    <div key={metric.label} className={css.healthRow}>
                        <div className={css.healthHeader}>
                            <span className={css.rowMeta}>{metric.label}</span>
                            <span className={css.rowTitle}>{metric.value}</span>
                        </div>
                        <div className={css.healthTrack}>
                            <div
                                className={css.healthFill}
                                style={{ width: `${Math.round(metric.fill * 100)}%` }}
                            />
                        </div>
                    </div>
                ))}
            </ContextModule>

            <ContextModule
                title="People looking for help"
                accent={bmcPalette.ember}
                mock
                testid="home-context-volunteer"
            >
                {MOCK_VOLUNTEER_REQUESTS.map((req) => (
                    <div key={req.id} className={css.row}>
                        <span className={css.rowTitle}>{req.title}</span>
                        <span className={css.rowMeta}>
                            {req.org} · {req.distance}
                        </span>
                    </div>
                ))}
            </ContextModule>
        </div>
    );
};

export default ContextSidebar;
