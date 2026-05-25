import type { UnifiedFeedItem } from '../unifiedFeedModel';
import type { TimeOfDayPhase } from '../useTimeOfDay';

/**
 * Placeholder data for context-sidebar modules that have no backend yet
 * (weather, community health, volunteer requests). Isolated here and clearly
 * labelled so each block can be swapped for a real client/endpoint later
 * without touching the sidebar layout. Everything below is SAMPLE data.
 */

export interface MockWeather {
    condition: string;
    temp: string;
    note: string;
    icon: string;
}

export const mockWeatherForPhase = (phase: TimeOfDayPhase): MockWeather => {
    switch (phase) {
        case 'dawn':
            return { condition: 'Clear skies', temp: '14°', note: 'Cool morning air', icon: '🌅' };
        case 'day':
            return {
                condition: 'Sunny',
                temp: '22°',
                note: 'Good light for the garden',
                icon: '☀️',
            };
        case 'dusk':
            return { condition: 'Golden hour', temp: '19°', note: 'Warm winds easing', icon: '🌇' };
        case 'night':
        default:
            return { condition: 'Clear night', temp: '12°', note: 'Calm and quiet', icon: '🌙' };
    }
};

export interface CommunityHealthMetric {
    label: string;
    value: string;
    trend: 'up' | 'steady' | 'down';
    /** 0..1 fill for the little bar. */
    fill: number;
}

export const MOCK_COMMUNITY_HEALTH: CommunityHealthMetric[] = [
    { label: 'New members this week', value: '+38', trend: 'up', fill: 0.72 },
    { label: 'Mutual-aid fulfilled', value: '91%', trend: 'up', fill: 0.91 },
    { label: 'Active contributors', value: '210', trend: 'steady', fill: 0.6 },
];

export interface VolunteerRequest {
    id: string;
    title: string;
    org: string;
    distance: string;
}

export const MOCK_VOLUNTEER_REQUESTS: VolunteerRequest[] = [
    {
        id: 'v1',
        title: 'Tool-library repair afternoon',
        org: 'Maple St. Workshop',
        distance: '0.6 km',
    },
    { id: 'v2', title: 'Seed-swap table hosts', org: 'Riverside Grove', distance: '1.2 km' },
    { id: 'v3', title: 'Solar install helpers', org: 'Eastside Coalition', distance: '2.4 km' },
];

export interface UpcomingEvent {
    id: string;
    title: string;
    when: string;
    place: string;
}

export const MOCK_UPCOMING_EVENTS: UpcomingEvent[] = [
    { id: 'e1', title: 'Neighbourhood repair café', when: 'Today · 6pm', place: 'Commons Hall' },
    {
        id: 'e2',
        title: 'Coalition planning circle',
        when: 'Tomorrow · 11am',
        place: 'Riverside Grove',
    },
    { id: 'e3', title: 'Rooftop garden workshop', when: 'Sat · 2pm', place: 'Eastside Den' },
];

export interface EcosystemPulseStat {
    label: string;
    value: number;
}

/**
 * Real-ish "community nervous system" reading derived from the live feed:
 * counts of the activity already loaded on the page. Not mocked — reflects the
 * actual `useUnifiedFeed` result — but lives here next to its sidebar siblings.
 */
export const deriveEcosystemPulse = (items: readonly UnifiedFeedItem[]): EcosystemPulseStat[] => {
    let dens = 0;
    let live = 0;
    let debates = 0;
    let actions = 0;
    for (const item of items) {
        if (item.source === 'den') dens += 1;
        else if (item.source === 'stream' && item.live) live += 1;
        else if (item.source === 'coliseum') debates += 1;
        else if (item.source === 'coalition') actions += 1;
    }
    return [
        { label: 'Active dens', value: dens },
        { label: 'Live now', value: live },
        { label: 'Open debates', value: debates },
        { label: 'Coalition actions', value: actions },
    ];
};
