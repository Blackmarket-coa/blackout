import React, { Suspense, useMemo, useState } from 'react';
import {
    AID_POST_CATEGORIES,
    AID_POST_TYPES,
    AID_POST_URGENCY,
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
import { createCoalitionAidPost, type NearbyQuery } from '../coalitionClient';
import { MyceliumLayer, useMyceliumGraph } from './mycelium';
import { buildCommunitiesPath } from '../../../pages/paths';
import { useViewportWidth } from '../../../hooks/useViewportWidth';
import { isMobileViewport } from '../../../pages/client/layoutMetrics';

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

/**
 * Compact mutual-aid composer surfaced from the map toolbar. Pre-fills the
 * viewer's coordinates when "Near me" is active; posting requires sign-in (the
 * API gates it) and errors are surfaced inline.
 */
function AidPostForm({
    scope,
    defaultLocation,
    onPosted,
    onClose,
}: {
    scope: CoalitionScopeQuery;
    defaultLocation?: { lat: number; lng: number };
    onPosted: () => void;
    onClose: () => void;
}): React.ReactElement {
    const [type, setType] = useState<AidPost['type']>(AID_POST_TYPES[0]);
    const [category, setCategory] = useState<AidPost['category']>(AID_POST_CATEGORIES[0]);
    const [urgency, setUrgency] = useState<AidPost['urgency']>('medium');
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [latitude, setLatitude] = useState(defaultLocation ? String(defaultLocation.lat) : '');
    const [longitude, setLongitude] = useState(defaultLocation ? String(defaultLocation.lng) : '');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fieldStyle: React.CSSProperties = {
        padding: '6px 8px',
        borderRadius: 8,
        border: '1px solid var(--border-default)',
        background: 'var(--bg-input)',
        color: 'var(--text-primary)',
        fontSize: 13,
        width: '100%',
    };

    const submit = async () => {
        const lat = Number.parseFloat(latitude);
        const lng = Number.parseFloat(longitude);
        if (!title.trim() || !description.trim()) {
            setError('Title and description are required.');
            return;
        }
        if (Number.isNaN(lat) || Number.isNaN(lng)) {
            setError('A valid latitude and longitude are required.');
            return;
        }
        setBusy(true);
        setError(null);
        try {
            await createCoalitionAidPost({
                type,
                category,
                urgency,
                title: title.trim(),
                description: description.trim(),
                location: { latitude: lat, longitude: lng },
                denId: scope.denId,
            });
            onPosted();
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not post aid.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div
            data-testid="coalition-aid-form"
            style={{
                position: 'absolute',
                top: 84,
                left: 12,
                zIndex: 4,
                width: 'min(280px, calc(100vw - 24px))',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                padding: 12,
                borderRadius: 10,
                border: '1px solid var(--border-default)',
                background: 'var(--bg-surface)',
                boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <strong style={{ flex: 1, fontSize: 14 }}>Post mutual aid</strong>
                <button
                    type="button"
                    onClick={onClose}
                    style={{ ...fieldStyle, width: 'auto', cursor: 'pointer' }}
                >
                    ✕
                </button>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
                <select
                    style={fieldStyle}
                    value={type}
                    onChange={(e) => setType(e.target.value as AidPost['type'])}
                >
                    {AID_POST_TYPES.map((t) => (
                        <option key={t} value={t}>
                            {t}
                        </option>
                    ))}
                </select>
                <select
                    style={fieldStyle}
                    value={category}
                    onChange={(e) => setCategory(e.target.value as AidPost['category'])}
                >
                    {AID_POST_CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>
                            {cat}
                        </option>
                    ))}
                </select>
            </div>
            <select
                style={fieldStyle}
                value={urgency}
                onChange={(e) => setUrgency(e.target.value as AidPost['urgency'])}
            >
                {AID_POST_URGENCY.map((u) => (
                    <option key={u} value={u}>
                        urgency: {u}
                    </option>
                ))}
            </select>
            <input
                style={fieldStyle}
                placeholder="Title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
            />
            <textarea
                style={{ ...fieldStyle, minHeight: 48 }}
                placeholder="Description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
            />
            <div style={{ display: 'flex', gap: 6 }}>
                <input
                    style={fieldStyle}
                    placeholder="Latitude"
                    inputMode="decimal"
                    value={latitude}
                    onChange={(e) => setLatitude(e.target.value)}
                />
                <input
                    style={fieldStyle}
                    placeholder="Longitude"
                    inputMode="decimal"
                    value={longitude}
                    onChange={(e) => setLongitude(e.target.value)}
                />
            </div>
            {error ? (
                <span style={{ color: 'var(--danger, #e74c3c)', fontSize: 12 }}>{error}</span>
            ) : null}
            <button
                type="button"
                onClick={submit}
                disabled={busy}
                style={{
                    ...fieldStyle,
                    cursor: 'pointer',
                    fontWeight: 600,
                    background: 'var(--accent-primary, #1ABC9C)',
                    color: '#04201b',
                }}
            >
                {busy ? 'Posting…' : 'Post aid'}
            </button>
        </div>
    );
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
    const [showAidForm, setShowAidForm] = useState(false);
    const viewportWidth = useViewportWidth();
    const mobile = isMobileViewport(viewportWidth);
    // Results list starts collapsed on phones, where it would otherwise cover the map.
    const [listExpanded, setListExpanded] = useState<boolean>(
        () => !isMobileViewport(typeof window === 'undefined' ? 1280 : window.innerWidth)
    );

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
        <div style={{ height: mobile ? 'min(82vh, 820px)' : 'min(72vh, 820px)' }}>
            <section
                style={{
                    position: 'relative',
                    height: '100%',
                    background:
                        'radial-gradient(circle at 30% 30%, rgba(26,188,156,0.08), transparent 60%), var(--bg-input)',
                    overflow: 'hidden',
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
                        overlayInsets={{ top: 96, bottom: listExpanded ? 200 : 52 }}
                        onSelectPin={(id) => {
                            const pin = pins.find((candidate) => candidate.id === id);
                            if (pin) setSelectedPin(pin);
                        }}
                        onDeselect={() => setSelectedPin(null)}
                    />
                </Suspense>

                <div
                    style={{
                        position: 'absolute',
                        top: 12,
                        left: 12,
                        right: 12,
                        zIndex: 2,
                        display: 'flex',
                        gap: 6,
                        flexWrap: mobile ? 'nowrap' : 'wrap',
                        overflowX: mobile ? 'auto' : 'visible',
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
                    <button
                        type="button"
                        onClick={() => setShowAidForm((v) => !v)}
                        aria-pressed={showAidForm}
                        data-testid="coalition-map-post-aid"
                        title="Post a mutual-aid request or offer"
                        style={{
                            border: '1px solid var(--border-default)',
                            borderRadius: 999,
                            padding: '4px 10px',
                            fontSize: 12,
                            background: showAidForm
                                ? 'var(--accent-primary, #1ABC9C)'
                                : 'var(--bg-surface)',
                            color: showAidForm ? '#0a1a0f' : 'var(--text-primary)',
                            cursor: 'pointer',
                        }}
                    >
                        ➕ Post aid
                    </button>
                </div>

                {showAidForm ? (
                    <AidPostForm
                        scope={scope}
                        defaultLocation={nearby ? { lat: nearby.lat, lng: nearby.lng } : undefined}
                        onPosted={() => aidState.refetch()}
                        onClose={() => setShowAidForm(false)}
                    />
                ) : null}

                <div
                    style={{
                        position: 'absolute',
                        top: 48,
                        left: 12,
                        right: 12,
                        zIndex: 2,
                        display: 'flex',
                        gap: 6,
                        flexWrap: mobile ? 'nowrap' : 'wrap',
                        overflowX: mobile ? 'auto' : 'visible',
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
                        bottom: 12,
                        left: 12,
                        right: mobile ? 12 : 'auto',
                        width: mobile ? undefined : 'min(360px, calc(100% - 24px))',
                        zIndex: 2,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 6,
                    }}
                >
                    <button
                        type="button"
                        onClick={() => setListExpanded((value) => !value)}
                        aria-expanded={listExpanded}
                        data-testid="coalition-map-discovery-count"
                        style={{
                            alignSelf: 'flex-start',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            fontSize: 12,
                            fontWeight: 600,
                            color: 'var(--text-primary)',
                            background: 'var(--bg-surface)',
                            border: '1px solid var(--border-default)',
                            borderRadius: 999,
                            padding: '4px 10px',
                            cursor: 'pointer',
                        }}
                    >
                        <span>
                            {nearby
                                ? `${nearbyCount} happening within ${radiusKm}km`
                                : `${pins.length} on the map`}
                        </span>
                        <span aria-hidden>{listExpanded ? '▾' : '▸'}</span>
                    </button>
                    {listExpanded ? (
                        <ul
                            style={{
                                listStyle: 'none',
                                margin: 0,
                                padding: 0,
                                display: 'grid',
                                gap: 4,
                                maxHeight: mobile ? 160 : 220,
                                overflowY: 'auto',
                            }}
                        >
                            {pins.map((pin) => {
                                const active = selectedPin?.id === pin.id;
                                return (
                                    <li key={`${pin.layer}-${pin.id}`}>
                                        <button
                                            type="button"
                                            onClick={() => setSelectedPin(pin)}
                                            aria-current={active}
                                            style={{
                                                width: '100%',
                                                textAlign: 'left',
                                                border: active
                                                    ? '1px solid var(--accent-primary, #1ABC9C)'
                                                    : '1px solid var(--border-default)',
                                                borderRadius: 8,
                                                background: active
                                                    ? 'rgba(26,188,156,0.16)'
                                                    : 'var(--bg-surface)',
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
                                );
                            })}
                        </ul>
                    ) : null}
                </div>

                {selectedPin &&
                !(
                    Number.isFinite(selectedPin.latitude) && Number.isFinite(selectedPin.longitude)
                ) ? (
                    <div
                        onClick={() => setSelectedPin(null)}
                        style={{
                            position: 'absolute',
                            inset: 0,
                            zIndex: 5,
                            background: 'rgba(0,0,0,0.35)',
                            display: 'grid',
                            placeItems: 'center',
                            padding: 16,
                        }}
                    >
                        <div
                            onClick={(event) => event.stopPropagation()}
                            style={{
                                width: 'min(280px, 100%)',
                                background: 'var(--bg-surface)',
                                border: '1px solid var(--border-default)',
                                borderRadius: 12,
                                padding: 16,
                                display: 'grid',
                                gap: 8,
                                boxShadow: '0 12px 32px rgba(0,0,0,0.4)',
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <strong style={{ flex: 1 }}>{selectedPin.title}</strong>
                                <button
                                    type="button"
                                    onClick={() => setSelectedPin(null)}
                                    aria-label="Close details"
                                    style={{
                                        border: '1px solid var(--border-default)',
                                        borderRadius: 8,
                                        background: 'var(--bg-input)',
                                        color: 'var(--text-primary)',
                                        cursor: 'pointer',
                                        padding: '2px 8px',
                                    }}
                                >
                                    ✕
                                </button>
                            </div>
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
                        </div>
                    </div>
                ) : null}
            </section>
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
