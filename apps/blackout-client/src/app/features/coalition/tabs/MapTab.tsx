import React, { Suspense, useMemo, useState } from 'react';
import {
    SPATIAL_LAYER_DEFINITIONS,
    URGENCY_RANK,
    deriveSpatialEventStatus,
    haversineDistanceMeters,
    spatialHeatWeight,
    type AidPost,
    type SellerLocation,
    type SpatialEventStatus,
    type SpatialFeedItem,
    type SpatialLayerKey,
} from '@blackout/core';
import {
    useMutualAid,
    useSellerLocations,
    useSpatialFeed,
    type CoalitionScopeQuery,
} from '../hooks/useCoalitionFeed';
import type { NearbyQuery } from '../coalitionClient';
import { MyceliumLayer, useMyceliumGraph } from './mycelium';
import { buildCommunitiesPath } from '../../../pages/paths';

const CoalitionMap = React.lazy(() => import('./CoalitionMap'));

export interface MapTabProps {
    scope: CoalitionScopeQuery;
}

interface PinDetails {
    id: string;
    title: string;
    subtitle: string;
    layer: SpatialLayerKey | 'aid' | 'vendors';
    latitude: number;
    longitude: number;
    denId?: string;
    status?: SpatialEventStatus;
    heat?: number;
    /** Event start (ISO) for temporal filtering; absent for standing pins (aid, vendors). */
    startsAt?: string;
}

type TemporalMode = 'now' | 'today' | 'week' | 'all';

const TEMPORAL_FILTERS: ReadonlyArray<{ key: TemporalMode; label: string }> = [
    { key: 'now', label: 'Now' },
    { key: 'today', label: 'Today' },
    { key: 'week', label: 'This week' },
    { key: 'all', label: 'All' },
];

const RADIUS_OPTIONS_KM = [1, 5, 25] as const;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Whether a pin belongs in the selected time window. Standing pins (no
 * `startsAt`, e.g. mutual-aid offers and vendor locations) are always present;
 * time-boxed pins are matched against the window.
 */
function passesTemporal(pin: PinDetails, mode: TemporalMode, nowMs: number): boolean {
    if (mode === 'all') return true;
    if (!pin.startsAt) return true;
    const startMs = Date.parse(pin.startsAt);
    if (Number.isNaN(startMs)) return true;
    if (mode === 'now') return pin.status === 'live';
    const startOfToday = new Date(nowMs);
    startOfToday.setHours(0, 0, 0, 0);
    const horizon = mode === 'today' ? startOfToday.getTime() + DAY_MS : nowMs + 7 * DAY_MS;
    // Live pins always belong to "today" and "this week".
    return pin.status === 'live' || (startMs >= startOfToday.getTime() && startMs <= horizon);
}

export function MapTab({ scope }: MapTabProps) {
    const [activeLayers, setActiveLayers] = useState<Set<SpatialLayerKey>>(
        () => new Set(SPATIAL_LAYER_DEFINITIONS.map((definition) => definition.key))
    );
    const [selectedPin, setSelectedPin] = useState<PinDetails | null>(null);
    const [nearby, setNearby] = useState<NearbyQuery | undefined>(undefined);
    const [nearbyError, setNearbyError] = useState<string | null>(null);
    const [temporalMode, setTemporalMode] = useState<TemporalMode>('all');
    const [radiusKm, setRadiusKm] = useState<number>(5);
    const [showHeat, setShowHeat] = useState(false);

    const layersArray = useMemo(() => [...activeLayers], [activeLayers]);
    const spatialState = useSpatialFeed(scope, layersArray);
    const aidState = useMutualAid(scope, nearby);
    const sellerState = useSellerLocations(nearby);

    const requestNearby = (km: number) => {
        if (!navigator.geolocation) {
            setNearbyError('Location is unavailable on this device.');
            return;
        }
        navigator.geolocation.getCurrentPosition(
            (position) => {
                setNearbyError(null);
                setNearby({
                    lat: position.coords.latitude,
                    lng: position.coords.longitude,
                    radiusKm: km,
                });
            },
            () => setNearbyError('Could not get your location.')
        );
    };

    const toggleNearby = () => {
        if (nearby) {
            setNearby(undefined);
            setNearbyError(null);
            return;
        }
        requestNearby(radiusKm);
    };

    const selectRadius = (km: number) => {
        setRadiusKm(km);
        if (nearby) {
            setNearby({ ...nearby, radiusKm: km });
        }
    };

    const allPins = useMemo(
        () =>
            pinList(
                spatialState.data?.items ?? [],
                aidState.data?.posts ?? [],
                sellerState.data?.locations ?? []
            ),
        [spatialState.data, aidState.data, sellerState.data]
    );

    // Apply the temporal window, then (when "Near me" is active) sort by distance.
    const pins = useMemo(() => {
        const nowMs = Date.now();
        const filtered = allPins.filter((pin) => passesTemporal(pin, temporalMode, nowMs));
        if (!nearby) return filtered;
        const viewer = { latitude: nearby.lat, longitude: nearby.lng };
        return [...filtered].sort((a, b) => {
            const da = haversineDistanceMeters(
                { latitude: a.latitude, longitude: a.longitude },
                viewer
            );
            const db = haversineDistanceMeters(
                { latitude: b.latitude, longitude: b.longitude },
                viewer
            );
            return da - db;
        });
    }, [allPins, temporalMode, nearby]);

    const nearbyCount = useMemo(() => {
        if (!nearby) return pins.length;
        const viewer = { latitude: nearby.lat, longitude: nearby.lng };
        const radiusMeters = nearby.radiusKm * 1000;
        return pins.filter(
            (pin) =>
                Number.isFinite(pin.latitude) &&
                Number.isFinite(pin.longitude) &&
                haversineDistanceMeters(
                    { latitude: pin.latitude, longitude: pin.longitude },
                    viewer
                ) <= radiusMeters
        ).length;
    }, [pins, nearby]);

    const myceliumGraph = useMyceliumGraph();
    const myceliumActive = activeLayers.has('mycelium');

    const toggleLayer = (key: SpatialLayerKey) => {
        setActiveLayers((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    };

    return (
        <div
            style={{
                display: 'grid',
                gridTemplateColumns: '1fr 280px',
                height: 'min(72vh, 820px)',
            }}
        >
            <section
                style={{
                    position: 'relative',
                    background:
                        'radial-gradient(circle at 30% 30%, rgba(26,188,156,0.08), transparent 60%), var(--bg-input)',
                    overflow: 'hidden',
                    borderRight: '1px solid var(--border-default)',
                }}
                data-testid="coalition-map-canvas"
            >
                <Suspense
                    fallback={
                        <div
                            style={{
                                position: 'absolute',
                                inset: 0,
                                display: 'grid',
                                placeItems: 'center',
                                color: 'var(--text-secondary)',
                                fontSize: 12,
                            }}
                        >
                            Loading map…
                        </div>
                    }
                >
                    <CoalitionMap
                        pins={pins}
                        viewerLocation={nearby ? { lat: nearby.lat, lng: nearby.lng } : null}
                        focusPinId={selectedPin?.id ?? null}
                        showHeat={showHeat}
                        onSelectPin={(id) => {
                            const pin = pins.find((candidate) => candidate.id === id);
                            if (pin) setSelectedPin(pin);
                        }}
                    />
                </Suspense>

                <div
                    style={{
                        position: 'absolute',
                        top: 12,
                        left: 12,
                        zIndex: 2,
                        display: 'flex',
                        gap: 6,
                        flexWrap: 'wrap',
                    }}
                >
                    {SPATIAL_LAYER_DEFINITIONS.map((definition) => {
                        const active = activeLayers.has(definition.key);
                        return (
                            <button
                                key={definition.key}
                                type="button"
                                onClick={() => toggleLayer(definition.key)}
                                aria-pressed={active}
                                style={{
                                    border: '1px solid var(--border-default)',
                                    borderRadius: 999,
                                    padding: '4px 10px',
                                    fontSize: 12,
                                    background: active
                                        ? 'var(--accent-primary, #1ABC9C)'
                                        : 'var(--bg-surface)',
                                    color: active ? '#0a1a0f' : 'var(--text-primary)',
                                    cursor: 'pointer',
                                }}
                            >
                                {definition.label}
                            </button>
                        );
                    })}
                    <button
                        type="button"
                        onClick={toggleNearby}
                        aria-pressed={Boolean(nearby)}
                        data-testid="coalition-map-nearby"
                        title={
                            nearby
                                ? `Showing activity within ${radiusKm}km`
                                : 'Filter to nearby activity'
                        }
                        style={{
                            border: '1px solid var(--border-default)',
                            borderRadius: 999,
                            padding: '4px 10px',
                            fontSize: 12,
                            background: nearby
                                ? 'var(--accent-primary, #1ABC9C)'
                                : 'var(--bg-surface)',
                            color: nearby ? '#0a1a0f' : 'var(--text-primary)',
                            cursor: 'pointer',
                        }}
                    >
                        📍 Near me{nearby ? ' ✓' : ''}
                    </button>
                    {RADIUS_OPTIONS_KM.map((km) => (
                        <button
                            key={km}
                            type="button"
                            onClick={() => selectRadius(km)}
                            aria-pressed={radiusKm === km}
                            data-testid={`coalition-map-radius-${km}`}
                            title={`Search radius ${km}km`}
                            style={{
                                border: '1px solid var(--border-default)',
                                borderRadius: 999,
                                padding: '4px 8px',
                                fontSize: 12,
                                background:
                                    radiusKm === km
                                        ? 'var(--accent-primary, #1ABC9C)'
                                        : 'var(--bg-surface)',
                                color: radiusKm === km ? '#0a1a0f' : 'var(--text-primary)',
                                cursor: 'pointer',
                            }}
                        >
                            {km}km
                        </button>
                    ))}
                    {nearbyError ? (
                        <span style={{ fontSize: 11, color: 'var(--danger)', alignSelf: 'center' }}>
                            {nearbyError}
                        </span>
                    ) : null}
                </div>

                <div
                    style={{
                        position: 'absolute',
                        top: 48,
                        left: 12,
                        zIndex: 2,
                        display: 'flex',
                        gap: 6,
                        flexWrap: 'wrap',
                    }}
                    data-testid="coalition-map-temporal"
                >
                    {TEMPORAL_FILTERS.map((filter) => {
                        const active = temporalMode === filter.key;
                        return (
                            <button
                                key={filter.key}
                                type="button"
                                onClick={() => setTemporalMode(filter.key)}
                                aria-pressed={active}
                                data-testid={`coalition-map-temporal-${filter.key}`}
                                style={{
                                    border: '1px solid var(--border-default)',
                                    borderRadius: 999,
                                    padding: '4px 10px',
                                    fontSize: 12,
                                    background: active
                                        ? 'var(--accent-primary, #1ABC9C)'
                                        : 'var(--bg-surface)',
                                    color: active ? '#0a1a0f' : 'var(--text-primary)',
                                    cursor: 'pointer',
                                }}
                            >
                                {filter.label}
                            </button>
                        );
                    })}
                    <button
                        type="button"
                        onClick={() => setShowHeat((value) => !value)}
                        aria-pressed={showHeat}
                        data-testid="coalition-map-heat"
                        title="Toggle the activity-heat overlay"
                        style={{
                            border: '1px solid var(--border-default)',
                            borderRadius: 999,
                            padding: '4px 10px',
                            fontSize: 12,
                            background: showHeat
                                ? 'var(--accent-primary, #1ABC9C)'
                                : 'var(--bg-surface)',
                            color: showHeat ? '#0a1a0f' : 'var(--text-primary)',
                            cursor: 'pointer',
                        }}
                    >
                        🔥 Heat{showHeat ? ' ✓' : ''}
                    </button>
                </div>

                {myceliumActive && (
                    <div
                        style={{
                            position: 'absolute',
                            inset: 60,
                            display: 'grid',
                            placeItems: 'center',
                            pointerEvents: 'none',
                            zIndex: 2,
                        }}
                        data-testid="mycelium-overlay-wrap"
                    >
                        <div style={{ width: '100%', height: '100%', pointerEvents: 'auto' }}>
                            <MyceliumLayer
                                graph={myceliumGraph}
                                onSelectNode={(nodeId) =>
                                    setSelectedPin({
                                        id: nodeId,
                                        title:
                                            myceliumGraph.nodes.find((n) => n.id === nodeId)
                                                ?.label ?? nodeId,
                                        subtitle: `mycelium · ${
                                            myceliumGraph.nodes.find((n) => n.id === nodeId)
                                                ?.memberCount ?? 0
                                        } members`,
                                        layer: 'mycelium',
                                        latitude: Number.NaN,
                                        longitude: Number.NaN,
                                        denId: nodeId,
                                    })
                                }
                            />
                        </div>
                    </div>
                )}

                <div
                    style={{
                        position: 'absolute',
                        bottom: 200,
                        left: 12,
                        zIndex: 2,
                        fontSize: 12,
                        fontWeight: 600,
                        color: 'var(--text-primary)',
                        background: 'var(--bg-surface)',
                        border: '1px solid var(--border-default)',
                        borderRadius: 999,
                        padding: '4px 10px',
                    }}
                    data-testid="coalition-map-discovery-count"
                >
                    {nearby
                        ? `${nearbyCount} happening within ${radiusKm}km`
                        : `${pins.length} on the map`}
                </div>

                <ul
                    style={{
                        position: 'absolute',
                        bottom: 12,
                        left: 12,
                        right: 12,
                        listStyle: 'none',
                        margin: 0,
                        padding: 0,
                        display: 'grid',
                        gap: 4,
                        maxHeight: 180,
                        overflowY: 'auto',
                        zIndex: 2,
                    }}
                >
                    {pins.map((pin) => (
                        <li key={`${pin.layer}-${pin.id}`}>
                            <button
                                type="button"
                                onClick={() => setSelectedPin(pin)}
                                style={{
                                    width: '100%',
                                    textAlign: 'left',
                                    border: '1px solid var(--border-default)',
                                    borderRadius: 8,
                                    background: 'var(--bg-surface)',
                                    color: 'var(--text-primary)',
                                    padding: '6px 8px',
                                    cursor: 'pointer',
                                }}
                            >
                                <strong style={{ fontSize: 12 }}>{pin.title}</strong>
                                <span
                                    style={{
                                        marginLeft: 8,
                                        fontSize: 11,
                                        color: 'var(--text-secondary)',
                                    }}
                                >
                                    {pin.subtitle}
                                </span>
                            </button>
                        </li>
                    ))}
                </ul>
            </section>

            <aside style={{ padding: 12, overflowY: 'auto' }}>
                {selectedPin ? (
                    <article style={{ display: 'grid', gap: 8 }}>
                        <strong>{selectedPin.title}</strong>
                        <small style={{ color: 'var(--text-secondary)' }}>
                            {selectedPin.subtitle}
                        </small>
                        {selectedPin.denId ? (
                            <a
                                href={buildCommunitiesPath(null, selectedPin.denId)}
                                style={{ color: 'var(--accent-primary, #1ABC9C)' }}
                            >
                                Open associated den →
                            </a>
                        ) : null}
                    </article>
                ) : (
                    <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                        Tap a pin to see details, jump to the associated den, or coordinate aid.
                    </div>
                )}
            </aside>
        </div>
    );
}

function pinList(
    spatial: SpatialFeedItem[],
    aid: AidPost[],
    sellers: SellerLocation[]
): PinDetails[] {
    const nowMs = Date.now();
    const pins: PinDetails[] = [];
    for (const item of spatial) {
        const status =
            item.status ??
            deriveSpatialEventStatus({ startsAt: item.startsAt, endsAt: item.endsAt }, nowMs);
        pins.push({
            id: item.id,
            title: item.title,
            subtitle: `${item.layer} · ${status}`,
            layer: item.layer,
            latitude: item.latitude,
            longitude: item.longitude,
            denId: item.denId,
            status,
            heat: spatialHeatWeight({ ...item, status }, nowMs),
            startsAt: item.startsAt,
        });
    }
    for (const post of aid) {
        pins.push({
            id: post.id,
            title: post.title,
            subtitle: `${post.type === 'need' ? 'Need' : 'Offer'} · ${post.urgency}`,
            layer: 'aid',
            latitude: post.location.latitude,
            longitude: post.location.longitude,
            denId: post.denId,
            heat: URGENCY_RANK[post.urgency],
        });
    }
    for (const seller of sellers) {
        pins.push({
            id: seller.id,
            title: seller.addressLine || seller.sellerId,
            subtitle: `${seller.locationType} · ${seller.city}`,
            layer: 'vendors',
            latitude: seller.coordinates.latitude,
            longitude: seller.coordinates.longitude,
        });
    }
    return pins;
}

export default MapTab;
