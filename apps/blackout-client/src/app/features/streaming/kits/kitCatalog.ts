import {
    COALITION_PATH,
    CREATOR_DASHBOARD_PATH,
    CREATOR_LISTINGS_PATH,
    EVENTS_PATH,
    MONETIZATION_SUBSCRIPTIONS_PLANS_PATH,
    PROFILE_SELF_PATH,
} from '../../../pages/paths';

/**
 * Creator Kits — installable presets that orient a new creator around a
 * workflow (educator / streamer / organizer / musician). MVP is a static
 * catalog: each kit describes what it configures and deep-links to the
 * underlying surfaces the creator sets up by hand. One-click apply is a
 * deliberate follow-up (it would couple to many profile/monetization
 * mutation clients), so the catalog stays declarative for now.
 */

export interface KitDeepLink {
    label: string;
    to: string;
}

export interface CreatorKit {
    id: string;
    name: string;
    /** Short emoji glyph used as the card avatar. */
    glyph: string;
    tagline: string;
    /** What installing this kit sets up, grouped for the detail panel. */
    configures: {
        profile: string[];
        dens: string[];
        monetization: string[];
        streamTools: string[];
    };
    /** Surfaces the creator visits to set the kit up by hand (MVP). */
    deepLinks: KitDeepLink[];
}

export const CREATOR_KITS: CreatorKit[] = [
    {
        id: 'educator',
        name: 'Educator Kit',
        glyph: '🎓',
        tagline: 'Teach, run workshops, and build a learning community.',
        configures: {
            profile: ['Course/portfolio showcase layout', 'Office-hours status widget'],
            dens: ['Q&A den', 'Workshop coordination den'],
            monetization: ['Paid workshop tickets', 'Membership tiers for course access'],
            streamTools: ['Low-latency lecture preset', 'Screen-share friendly layout'],
        },
        deepLinks: [
            { label: 'Customize profile', to: PROFILE_SELF_PATH },
            { label: 'Set up events', to: EVENTS_PATH },
            { label: 'Subscription tiers', to: MONETIZATION_SUBSCRIPTIONS_PLANS_PATH },
        ],
    },
    {
        id: 'streamer',
        name: 'Streamer Kit',
        glyph: '🎮',
        tagline: 'Go live, simulcast, and grow a persistent audience.',
        configures: {
            profile: ['Stream archive + clips showcase', 'Live-now banner'],
            dens: ['Persistent fan den', 'Mods-only side room'],
            monetization: ['Tips & alerts', 'Subscriber-only tiers'],
            streamTools: ['Simulcast destinations', 'OBS-WS + widget alerts'],
        },
        deepLinks: [
            { label: 'Creator dashboard', to: CREATOR_DASHBOARD_PATH },
            { label: 'Customize profile', to: PROFILE_SELF_PATH },
        ],
    },
    {
        id: 'organizer',
        name: 'Organizer Kit',
        glyph: '🌱',
        tagline: 'Coordinate coalitions, meetups, and real-world action.',
        configures: {
            profile: ['Coalition activity feed', 'Local-events showcase'],
            dens: ['Coordination den', 'Volunteer onboarding den'],
            monetization: ['Aid pools', 'Event tickets'],
            streamTools: ['Town-hall stream preset'],
        },
        deepLinks: [
            { label: 'Open Coalition', to: COALITION_PATH },
            { label: 'Set up events', to: EVENTS_PATH },
        ],
    },
    {
        id: 'musician',
        name: 'Musician Kit',
        glyph: '🎵',
        tagline: 'Perform, sell merch, and release to your community.',
        configures: {
            profile: ['Discography + pinned media shelf', 'Tour-dates widget'],
            dens: ['Listening-party den', 'Supporters den'],
            monetization: ['Merch storefront listings', 'Membership tiers'],
            streamTools: ['High-quality audio stream preset'],
        },
        deepLinks: [
            { label: 'Manage listings', to: CREATOR_LISTINGS_PATH },
            { label: 'Customize profile', to: PROFILE_SELF_PATH },
            { label: 'Subscription tiers', to: MONETIZATION_SUBSCRIPTIONS_PLANS_PATH },
        ],
    },
];
