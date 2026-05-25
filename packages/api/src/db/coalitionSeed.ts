import { deriveSpatialEventStatus } from '@blackout/core';
import type { CoalitionAidPostRecord, CoalitionSpatialItemRecord } from './types';

const SEED_NOW_ISO = '2026-05-01T00:00:00Z';

// A window that is "live" relative to wall-clock now, so the demo map always
// has at least one pulsing pin regardless of when it is opened.
const liveStart = new Date(Date.now() - 60 * 60 * 1000).toISOString();
const liveEnd = new Date(Date.now() + 60 * 60 * 1000).toISOString();

function spatial(
  item: Omit<CoalitionSpatialItemRecord, 'status' | 'createdAt' | 'updatedAt'>,
): CoalitionSpatialItemRecord {
  return {
    ...item,
    status: deriveSpatialEventStatus({ startsAt: item.startsAt, endsAt: item.endsAt }),
    createdAt: SEED_NOW_ISO,
    updatedAt: SEED_NOW_ISO,
  };
}

export const COALITION_SPATIAL_SEED: CoalitionSpatialItemRecord[] = [
  spatial({
    id: 'spatial-vendor-1',
    layer: 'vendors',
    title: 'Sunrise Farm Stand pop-up',
    latitude: 40.7128,
    longitude: -74.006,
    visibility: 'public',
    eventType: 'farm',
    startsAt: '2026-05-03T13:00:00Z',
    endsAt: '2026-05-03T18:00:00Z',
    activityLevel: 0.4,
    source: 'medusa',
  }),
  spatial({
    id: 'spatial-aid-1',
    layer: 'aid',
    title: 'Diaper bank restock',
    latitude: 40.7185,
    longitude: -74.012,
    visibility: 'community',
    eventType: 'aid',
    startsAt: '2026-05-02T09:00:00Z',
    endsAt: '2026-05-02T17:00:00Z',
    severity: 'moderate',
    source: 'gateway',
  }),
  spatial({
    id: 'spatial-vote-1',
    layer: 'votes',
    title: 'Block proposal #BMC-019',
    latitude: 40.7079,
    longitude: -74.011,
    visibility: 'community',
    eventType: 'community_event',
    startsAt: '2026-05-02T18:30:00Z',
    endsAt: '2026-05-02T20:30:00Z',
    source: 'blackout',
  }),
  // --- new layers introduced by the Living Map iteration ---
  spatial({
    id: 'spatial-event-1',
    layer: 'events',
    title: 'Repair café & skill share',
    latitude: 40.7152,
    longitude: -74.002,
    visibility: 'public',
    eventType: 'community_event',
    startsAt: liveStart,
    endsAt: liveEnd,
    activityLevel: 0.7,
    denId: '!demo-events:server',
    source: 'blackout',
  }),
  spatial({
    id: 'spatial-stream-1',
    layer: 'streams',
    title: 'Live: assembly floor walkthrough',
    latitude: 40.7101,
    longitude: -74.009,
    visibility: 'public',
    eventType: 'community_event',
    startsAt: liveStart,
    endsAt: liveEnd,
    activityLevel: 0.9,
    streamId: 'demo-stream-assembly',
    denId: '!demo-den-governance:server',
    source: 'blackout',
  }),
  spatial({
    id: 'spatial-den-1',
    layer: 'dens',
    title: 'Lower East Side organizing den',
    latitude: 40.7158,
    longitude: -73.984,
    visibility: 'community',
    eventType: 'other',
    startsAt: SEED_NOW_ISO,
    activityLevel: 0.6,
    denId: '!demo-den-les:server',
    source: 'blackout',
  }),
  spatial({
    id: 'spatial-project-1',
    layer: 'projects',
    title: 'Community garden build',
    latitude: 40.7203,
    longitude: -73.997,
    visibility: 'public',
    eventType: 'farm',
    startsAt: '2026-05-04T15:00:00Z',
    endsAt: '2026-05-04T19:00:00Z',
    activityLevel: 0.5,
    denId: '!demo-den-gardens:server',
    source: 'blackout',
  }),
  spatial({
    id: 'spatial-community-1',
    layer: 'communities',
    title: 'Manhattan Solidarity Network',
    latitude: 40.7069,
    longitude: -74.0,
    visibility: 'public',
    eventType: 'other',
    startsAt: SEED_NOW_ISO,
    activityLevel: 0.3,
    canopyId: 'demo-canopy',
    source: 'blackout',
  }),
];

export const COALITION_AID_SEED: CoalitionAidPostRecord[] = [
  {
    id: 'aidp_seed_1',
    customerId: '@vine:server',
    type: 'need',
    category: 'food',
    title: 'Diapers size 3 needed',
    description: 'Looking for a pack to tide a family over until Friday.',
    location: { latitude: 40.7185, longitude: -74.012 },
    displayRadiusMeters: 500,
    urgency: 'high',
    status: 'open',
    denId: '!demo-aid:server',
    createdAt: SEED_NOW_ISO,
  },
  {
    id: 'aidp_seed_2',
    customerId: '@oak:server',
    type: 'offer',
    category: 'transport',
    title: 'Free rides to clinic Tuesday',
    description: 'Rides 9am-3pm within 5 miles. DM to coordinate.',
    location: { latitude: 40.7128, longitude: -74.006 },
    displayRadiusMeters: 8000,
    urgency: 'medium',
    status: 'open',
    denId: '!demo-aid:server',
    createdAt: SEED_NOW_ISO,
  },
];
