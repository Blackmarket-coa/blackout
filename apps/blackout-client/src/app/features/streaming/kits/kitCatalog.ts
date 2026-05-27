import {
    COALITION_PATH,
    CREATOR_DASHBOARD_PATH,
    CREATOR_LISTINGS_PATH,
    EVENTS_PATH,
    MONETIZATION_SUBSCRIPTIONS_PLANS_PATH,
    PROFILE_SELF_PATH,
} from '../../../pages/paths';
import type { BmcProfileEvent } from '../../profile/profileTypes';

/**
 * Creator Kits — installable presets that orient a new creator around a
 * workflow (educator / streamer / organizer / musician). Each kit describes
 * what it configures and deep-links to the underlying surfaces, and (via the
 * optional `apply` spec) carries concrete, additive payloads that
 * `applyKit.ts` provisions in one click against existing mutation clients
 * (profile merge, den creation, subscription tiers, aid pools). Secret-minting
 * stream tooling (OBS-WS / widget alerts / simulcast keys) stays deep-linked —
 * minting credentials should be an explicit, visible action — and stream
 * encoder presets have no server endpoint, so they remain informational.
 */

export interface KitDeepLink {
    label: string;
    to: string;
}

/** A den the kit creates. Maps to `createRoom` (Matrix room). */
export interface KitDenSpec {
    name: string;
    topic?: string;
    /** Defaults to `private` (invite-only) when omitted. */
    kind?: 'public' | 'private' | 'restricted';
}

/** A creator subscription tier the kit creates. Maps to `creatorSubsApi.createTier`. */
export interface KitTierSpec {
    name: string;
    description?: string;
    priceCents: number;
    currency: string;
}

/** An aid pool the kit creates. Maps to `aidPoolsApi.create`. */
export interface KitAidPoolSpec {
    title: string;
    goalCents: number;
    currency: string;
}

/**
 * Concrete, additive resources a kit provisions on apply. Every field is
 * optional; `applyKit` runs only the areas that are present and reports a
 * per-step result. Payloads are intentionally modest starting points the
 * creator edits afterwards.
 */
export interface KitApplySpec {
    /** Merged into the creator's existing profile event (never clobbers). */
    profile?: BmcProfileEvent;
    dens?: KitDenSpec[];
    tiers?: KitTierSpec[];
    aidPools?: KitAidPoolSpec[];
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
    /** Surfaces the creator visits to set the kit up by hand. */
    deepLinks: KitDeepLink[];
    /** Concrete resources provisioned by one-click apply. */
    apply?: KitApplySpec;
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
        apply: {
            profile: { status: { text: 'Office hours — DM to book a session', emoji: '🎓' } },
            dens: [
                { name: 'Q&A', topic: 'Ask questions and get help', kind: 'public' },
                { name: 'Workshop coordination', topic: 'Plan and run workshops', kind: 'private' },
            ],
            tiers: [
                {
                    name: 'Course access',
                    description: 'Membership tier for course and workshop access',
                    priceCents: 1000,
                    currency: 'USD',
                },
            ],
        },
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
        apply: {
            profile: { status: { text: 'Live soon — follow for alerts', emoji: '🎮' } },
            dens: [
                { name: 'Fan den', topic: 'Persistent community for the stream', kind: 'public' },
                { name: 'Mods only', topic: 'Private mod coordination', kind: 'private' },
            ],
            tiers: [
                {
                    name: 'Supporter',
                    description: 'Subscriber-only perks and alerts',
                    priceCents: 500,
                    currency: 'USD',
                },
            ],
        },
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
        apply: {
            profile: { status: { text: 'Organizing locally — join in', emoji: '🌱' } },
            dens: [
                { name: 'Coordination', topic: 'Plan coalition action', kind: 'private' },
                {
                    name: 'Volunteer onboarding',
                    topic: 'Welcome and onboard volunteers',
                    kind: 'public',
                },
            ],
            aidPools: [{ title: 'Community aid pool', goalCents: 50000, currency: 'USD' }],
        },
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
        apply: {
            profile: { status: { text: 'New release out now', emoji: '🎵' } },
            dens: [
                { name: 'Listening party', topic: 'Listen to releases together', kind: 'public' },
                { name: 'Supporters', topic: 'For paying supporters', kind: 'private' },
            ],
            tiers: [
                {
                    name: 'Supporter',
                    description: 'Membership tier for supporters',
                    priceCents: 700,
                    currency: 'USD',
                },
            ],
        },
    },
];
