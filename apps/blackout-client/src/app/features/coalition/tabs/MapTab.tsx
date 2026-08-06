import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAtom } from 'jotai';
import {
    AID_POST_CATEGORIES,
    AID_POST_TYPES,
    AID_POST_URGENCY,
    SPATIAL_LAYER_DEFINITIONS,
    URGENCY_RANK,
    deriveSpatialEventStatus,
    haversineDistanceMeters,
    normalizeSpatialLayerKey,
    spatialHeatWeight,
    type AidPost,
    type CoalitionNeed,
    type CoalitionPlace,
    type CoalitionProject,
    type CoalitionResource,
    type CoalitionTabId,
    type SellerLocation,
    type SpatialEventStatus,
    type SpatialFeedItem,
    type SpatialLayerKey,
} from '@blackout/core';
import type { CoalitionFeedItem } from '@blackout/core';
import {
    useCoalitionFeed,
    useCoalitionNeeds,
    useCoalitionProjects,
    useCoalitionResources,
    useMutualAid,
    useSellerLocations,
    useSpatialFeed,
    type CoalitionScopeQuery,
} from '../hooks/useCoalitionFeed';
import { createCoalitionAidPost, type NearbyQuery } from '../coalitionClient';
import { VideoReel, useVideoShare } from './VideoReel';
import { VideoComposer } from '../composer/VideoComposer';
import MapLegend from '../map/MapLegend';
import PinActionSheet from '../map/PinActionSheet';
import { listLocalVideos, localVideoVaultSupported } from '../../../../platform/localVideoVault';
import { layerStyleFor, SOLARPUNK_CONTROL_ACTIVE, SOLARPUNK_PANEL_GLOW } from './solarpunkMap';
import { MyceliumLayer, useMyceliumGraph } from './mycelium';
import {
    coalitionMapHeatAtom,
    coalitionMapLayersAtom,
    coalitionMapRadiusKmAtom,
    coalitionMapTimeModeAtom,
} from '../../../state/coalition';
import { useViewportWidth } from '../../../hooks/useViewportWidth';
import { isMobileViewport } from '../../../pages/client/layoutMetrics';
import { LocationConsentDialog } from '../../location/LocationConsentDialog';
import { coarsenCoordinate, useLocationConsentFlow } from '../../location/locationConsent';

const CoalitionMap = React.lazy(() => import('./CoalitionMap'));

// The layer glyph moved to `../map/MapLegend`, which owns layer presentation now.

export interface MapTabProps {
    scope: CoalitionScopeQuery;
    /**
     * Put a tool-bag board in the viewer's hand. Tapping a need, project or
     * resource pin opens its board, where claiming, supporting and booking
     * already live with their composers.
     */
    onOpenTool?: (tool: CoalitionTabId) => void;
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
    /** Present on `video` pins — tapping the pin opens the story reel (Snap Map style). */
    mediaUrl?: string;
    /**
     * Area of operations, in metres. Absent means the pin is an address; present
     * means the coordinates are a centre and this is the actual claim, drawn on
     * the map as a circle.
     */
    radiusMeters?: number;
}

// The selectable labels live with the legend that renders them (`MAP_TIME_MODES`).
type TemporalMode = 'now' | 'today' | 'week' | 'all';

const RADIUS_OPTIONS_KM = [1, 5, 25] as const;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * How far a viewer is from the *nearest part* of a pin, in metres.
 *
 * For an address this is just the distance to it. For an area of operations it
 * is the distance to the edge of the circle, and zero when the viewer is inside
 * — which is the whole point of drawing one. Measuring an area from its centre
 * would rank a crew that covers your street below a pin two blocks away, and
 * would hide a 20km-radius group whose centre sits outside your search.
 */
function edgeDistance(pin: PinDetails, viewer: { latitude: number; longitude: number }): number {
    const separation = haversineDistanceMeters(
        { latitude: pin.latitude, longitude: pin.longitude },
        viewer
    );
    return Math.max(0, separation - (pin.radiusMeters ?? 0));
}

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
                    background: SOLARPUNK_CONTROL_ACTIVE.bg,
                    color: SOLARPUNK_CONTROL_ACTIVE.ink,
                }}
            >
                {busy ? 'Posting…' : 'Post aid'}
            </button>
        </div>
    );
}

export function MapTab({ scope, onOpenTool }: MapTabProps) {
    // Persisted: a layer you switch off stays off across visits. See
    // `state/coalition.ts` for the read-time guards.
    const [activeLayers, setActiveLayers] = useAtom(coalitionMapLayersAtom);
    const [selectedPin, setSelectedPin] = useState<PinDetails | null>(null);
    const [nearby, setNearby] = useState<NearbyQuery | undefined>(undefined);
    const [nearbyError, setNearbyError] = useState<string | null>(null);
    // Set when the viewer taps "Near me" without location consent yet; the
    // disclosure opens and we locate them only once they confirm.
    const [locatePending, setLocatePending] = useState(false);
    const locationConsent = useLocationConsentFlow();
    const [temporalMode, setTemporalMode] = useAtom(coalitionMapTimeModeAtom);
    const [radiusKm, setRadiusKm] = useAtom(coalitionMapRadiusKmAtom);
    const [showHeat, setShowHeat] = useAtom(coalitionMapHeatAtom);
    const [showAidForm, setShowAidForm] = useState(false);
    // Legend starts closed on a phone, where an open panel would cover the map
    // it is meant to explain; open on desktop, where there is room for both.
    const [legendOpen, setLegendOpen] = useState<boolean>(
        () => !isMobileViewport(typeof window === 'undefined' ? 1280 : window.innerWidth)
    );
    const viewportWidth = useViewportWidth();
    const mobile = isMobileViewport(viewportWidth);
    // Results list starts collapsed on phones, where it would otherwise cover the map.
    const [listExpanded, setListExpanded] = useState<boolean>(
        () => !isMobileViewport(typeof window === 'undefined' ? 1280 : window.innerWidth)
    );

    const [reelStartId, setReelStartId] = useState<string | null>(null);
    /** Full reel including non-geo-tagged stories (map pins carry only tagged ones). */
    const [allReelOpen, setAllReelOpen] = useState(false);
    const [showVideoComposer, setShowVideoComposer] = useState(false);
    /** Vault original to preload into the composer (the reel's repost path). */
    const [composerVaultId, setComposerVaultId] = useState<string | null>(null);
    /** feedItemId → vault entry id for originals this device has posted. */
    const [repostVaultMap, setRepostVaultMap] = useState<ReadonlyMap<string, string>>(new Map());
    const { shareStatus, onShare } = useVideoShare();

    const refreshRepostables = useCallback(async () => {
        if (!localVideoVaultSupported()) return;
        try {
            const entries = await listLocalVideos();
            const map = new Map<string, string>();
            for (const entry of entries) {
                if (entry.lastPostedFeedItemId) map.set(entry.lastPostedFeedItemId, entry.id);
            }
            setRepostVaultMap(map);
        } catch {
            // The vault is an enhancement; a broken IndexedDB never breaks the map.
        }
    }, []);

    useEffect(() => {
        void refreshRepostables();
    }, [refreshRepostables]);

    const repostableIds = useMemo(() => new Set(repostVaultMap.keys()), [repostVaultMap]);

    // A story whose server copy expired: reopen the composer preloaded with
    // the on-device original so the creator can post it again.
    const onRepostFromDevice = useCallback(
        (feedItemId: string) => {
            const vaultId = repostVaultMap.get(feedItemId);
            if (!vaultId) return;
            setReelStartId(null);
            setAllReelOpen(false);
            setComposerVaultId(vaultId);
            setShowVideoComposer(true);
        },
        [repostVaultMap]
    );

    const layersArray = useMemo(() => [...activeLayers], [activeLayers]);

    /*
     * Every source is gated on its own legend switch.
     *
     * Only the spatial feed used to be — the rest loaded whether or not their
     * layer was showing, so hiding one stopped it being drawn but not fetched.
     * A toggle that still pays for the thing it hides is a filter, not a
     * toggle.
     */
    const spatialState = useSpatialFeed(scope, layersArray);
    const aidState = useMutualAid(scope, nearby, activeLayers.has('aid'));
    const sellerState = useSellerLocations(nearby, activeLayers.has('vendors'));
    const videosVisible = activeLayers.has('video');
    const videoState = useCoalitionFeed(scope, {
        kind: 'video',
        limit: 20,
        enabled: videosVisible,
    });

    // Only geo-tagged videos belong on the map; others stay in the standalone reel.
    const videoItems = useMemo<CoalitionFeedItem[]>(
        () =>
            (videoState.data?.items ?? []).filter(
                (item) => Number.isFinite(item.latitude) && Number.isFinite(item.longitude)
            ),
        [videoState.data]
    );
    // Needs, projects and resources are canopy-scoped boards, not spatial-feed
    // layers, so they are fetched from their own endpoints and merged in — the
    // same shape aid, sellers and stories already take.
    const needsState = useCoalitionNeeds(scope, activeLayers.has('needs'));
    const projectsState = useCoalitionProjects(scope, activeLayers.has('projects'));
    const resourcesState = useCoalitionResources(scope, activeLayers.has('resources'));

    const requestNearby = (km: number) => {
        if (!navigator.geolocation) {
            setNearbyError('Location is unavailable on this device.');
            return;
        }
        navigator.geolocation.getCurrentPosition(
            (position) => {
                setNearbyError(null);
                // Coarsen to a ~1.1 km grid before the position leaves the
                // device — this feeds the nearby server queries and honours the
                // "~1 km-coarse position" promise in the consent disclosure.
                setNearby({
                    lat: coarsenCoordinate(position.coords.latitude),
                    lng: coarsenCoordinate(position.coords.longitude),
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
        // Location is off by default: the first tap opens the two-step
        // disclosure and locates the viewer only after they confirm.
        if (!locationConsent.granted) {
            setLocatePending(true);
            locationConsent.requestEnable();
            return;
        }
        requestNearby(radiusKm);
    };

    // Once consent is granted from the disclosure, honour the tap that opened it.
    useEffect(() => {
        if (locationConsent.granted && locatePending) {
            setLocatePending(false);
            requestNearby(radiusKm);
        }
        // requestNearby closes over the latest radiusKm; re-run when consent flips.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [locationConsent.granted, locatePending, radiusKm]);

    const selectRadius = (km: number) => {
        setRadiusKm(km);
        if (nearby) {
            setNearby({ ...nearby, radiusKm: km });
        }
    };

    const allPins = useMemo(
        () =>
            pinList({
                spatial: spatialState.data?.items ?? [],
                aid: aidState.data?.posts ?? [],
                sellers: sellerState.data?.locations ?? [],
                videos: videosVisible ? videoItems : [],
                needs: needsState.data?.needs ?? [],
                projects: projectsState.data?.projects ?? [],
                resources: resourcesState.data?.resources ?? [],
            }),
        [
            spatialState.data,
            aidState.data,
            sellerState.data,
            videosVisible,
            videoItems,
            needsState.data,
            projectsState.data,
            resourcesState.data,
        ]
    );

    // Apply the temporal window, then (when "Near me" is active) sort by distance.
    const pins = useMemo(() => {
        const nowMs = Date.now();
        const filtered = allPins.filter((pin) => passesTemporal(pin, temporalMode, nowMs));
        if (!nearby) return filtered;
        const viewer = { latitude: nearby.lat, longitude: nearby.lng };
        return [...filtered].sort((a, b) => edgeDistance(a, viewer) - edgeDistance(b, viewer));
    }, [allPins, temporalMode, nearby]);

    const nearbyCount = useMemo(() => {
        if (!nearby) return pins.length;
        const viewer = { latitude: nearby.lat, longitude: nearby.lng };
        const radiusMeters = nearby.radiusKm * 1000;
        return pins.filter(
            (pin) =>
                Number.isFinite(pin.latitude) &&
                Number.isFinite(pin.longitude) &&
                edgeDistance(pin, viewer) <= radiusMeters
        ).length;
    }, [pins, nearby]);

    /**
     * Per-layer pin counts for the legend. Derived from the pins actually on
     * the map, so a hidden layer simply has no entry — the feed is fetched
     * filtered by layer, which means a hidden layer's real count is unknown
     * rather than zero, and the legend renders nothing rather than a lie.
     */
    const countsByLayer = useMemo(() => {
        const counts: Partial<Record<SpatialLayerKey, number>> = {};
        for (const pin of pins) {
            const key = normalizeSpatialLayerKey(pin.layer);
            if (!key) continue;
            counts[key] = (counts[key] ?? 0) + 1;
        }
        return counts;
    }, [pins]);

    const myceliumGraph = useMyceliumGraph();
    const myceliumActive = activeLayers.has('mycelium');

    // The persisted atom's setter takes a value, not an updater — derive the
    // next set from the current one rather than passing a function.
    const toggleLayer = (key: SpatialLayerKey) => {
        const next = new Set(activeLayers);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        setActiveLayers(next);
    };

    // A video pin opens the story reel (Snap Map tap-to-play); any other pin
    // selects normally and shows its detail card.
    const selectPin = (pin: PinDetails) => {
        if (pin.layer === 'video') {
            setReelStartId(pin.id);
            return;
        }
        setSelectedPin(pin);
    };

    // Reel ordered so the tapped story leads, then the rest of the nearby stories.
    // The "Stories" control opens the full feed instead — including videos
    // posted without a location, which never surface as pins.
    const reelItems = useMemo<CoalitionFeedItem[]>(() => {
        if (allReelOpen) return videoState.data?.items ?? [];
        if (!reelStartId) return [];
        const start = videoItems.filter((item) => item.id === reelStartId);
        const rest = videoItems.filter((item) => item.id !== reelStartId);
        return [...start, ...rest];
    }, [allReelOpen, videoState.data, reelStartId, videoItems]);

    return (
        <div style={{ height: mobile ? 'min(82vh, 820px)' : 'min(72vh, 820px)' }}>
            <section
                style={{
                    position: 'relative',
                    height: '100%',
                    background: SOLARPUNK_PANEL_GLOW,
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
                            if (pin) selectPin(pin);
                        }}
                        onDeselect={() => setSelectedPin(null)}
                    />
                </Suspense>

                {/*
                 * The legend, top-left: what is on the map and what you can see.
                 * It replaces a flex row of thirteen layer chips plus Near-me,
                 * radius, time and heat that ran off the right edge of a phone
                 * and overlapped the row beneath it.
                 */}
                <MapLegend
                    activeLayers={activeLayers}
                    onToggleLayer={toggleLayer}
                    onSetLayers={(keys: SpatialLayerKey[]) => setActiveLayers(new Set(keys))}
                    countsByLayer={countsByLayer}
                    timeMode={temporalMode}
                    onSetTimeMode={setTemporalMode}
                    showHeat={showHeat}
                    onToggleHeat={() => setShowHeat((value) => !value)}
                    nearby={Boolean(nearby)}
                    onToggleNearby={toggleNearby}
                    radiusKm={radiusKm}
                    radiusOptionsKm={RADIUS_OPTIONS_KM}
                    onSelectRadius={selectRadius}
                    nearbyError={nearbyError}
                    open={legendOpen}
                    onSetOpen={setLegendOpen}
                />

                {/*
                 * Create verbs, top-right. Kept apart from the legend so the
                 * two clusters can never collide: left is what you see, right
                 * is what you add, bottom-right is what you carry.
                 */}
                <div
                    style={{
                        position: 'absolute',
                        top: 12,
                        right: 12,
                        zIndex: 3,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'flex-end',
                        gap: 6,
                    }}
                    data-testid="coalition-map-actions"
                >
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
                                ? SOLARPUNK_CONTROL_ACTIVE.bg
                                : 'var(--bg-surface)',
                            color: showAidForm
                                ? SOLARPUNK_CONTROL_ACTIVE.ink
                                : 'var(--text-primary)',
                            cursor: 'pointer',
                        }}
                    >
                        ➕ Post aid
                    </button>
                    <button
                        type="button"
                        onClick={() => setShowVideoComposer((v) => !v)}
                        aria-pressed={showVideoComposer}
                        data-testid="coalition-map-post-video"
                        title="Record or upload a video story"
                        style={{
                            border: '1px solid var(--border-default)',
                            borderRadius: 999,
                            padding: '4px 10px',
                            fontSize: 12,
                            background: showVideoComposer
                                ? SOLARPUNK_CONTROL_ACTIVE.bg
                                : 'var(--bg-surface)',
                            color: showVideoComposer
                                ? SOLARPUNK_CONTROL_ACTIVE.ink
                                : 'var(--text-primary)',
                            cursor: 'pointer',
                        }}
                    >
                        🎥 Post video
                    </button>
                    {(videoState.data?.items.length ?? 0) > 0 ? (
                        <button
                            type="button"
                            onClick={() => setAllReelOpen(true)}
                            data-testid="coalition-map-stories"
                            title="Watch all video stories, including ones without a map pin"
                            style={{
                                border: '1px solid var(--border-default)',
                                borderRadius: 999,
                                padding: '4px 10px',
                                fontSize: 12,
                                background: 'var(--bg-surface)',
                                color: 'var(--text-primary)',
                                cursor: 'pointer',
                            }}
                        >
                            ▶ Stories
                        </button>
                    ) : null}
                </div>

                {showAidForm ? (
                    <AidPostForm
                        scope={scope}
                        defaultLocation={nearby ? { lat: nearby.lat, lng: nearby.lng } : undefined}
                        onPosted={() => aidState.refetch()}
                        onClose={() => setShowAidForm(false)}
                    />
                ) : null}

                {showVideoComposer ? (
                    <VideoComposer
                        scope={scope}
                        initialVaultEntryId={composerVaultId ?? undefined}
                        onPosted={() => {
                            videoState.refetch();
                            void refreshRepostables();
                            setShowVideoComposer(false);
                            setComposerVaultId(null);
                            setAllReelOpen(true);
                        }}
                        onClose={() => {
                            setShowVideoComposer(false);
                            setComposerVaultId(null);
                        }}
                    />
                ) : null}

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
                                            onClick={() => selectPin(pin)}
                                            aria-current={active}
                                            style={{
                                                width: '100%',
                                                textAlign: 'left',
                                                border: active
                                                    ? '1px solid var(--accent-primary, #1ABC9C)'
                                                    : '1px solid var(--border-default)',
                                                borderRadius: 8,
                                                background: active
                                                    ? 'rgba(214,154,46,0.16)'
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

                {/*
                 * Every selected pin gets its verbs, not just the ones whose
                 * coordinates failed to parse — the old detail card only
                 * rendered in that fallback case and offered a single link.
                 */}
                {selectedPin ? (
                    <PinActionSheet
                        pin={selectedPin}
                        onClose={() => setSelectedPin(null)}
                        onWatch={(pinId) => {
                            setSelectedPin(null);
                            setReelStartId(pinId);
                        }}
                        onOpenBoard={
                            onOpenTool
                                ? (tool) => {
                                      setSelectedPin(null);
                                      onOpenTool(tool);
                                  }
                                : undefined
                        }
                    />
                ) : null}

                {(reelStartId || allReelOpen) && reelItems.length > 0 ? (
                    <div
                        data-testid="coalition-map-reel"
                        style={{
                            position: 'absolute',
                            inset: 0,
                            zIndex: 6,
                            background: '#000',
                        }}
                    >
                        <button
                            type="button"
                            onClick={() => {
                                setReelStartId(null);
                                setAllReelOpen(false);
                            }}
                            aria-label="Close stories"
                            data-testid="coalition-map-reel-close"
                            style={{
                                position: 'absolute',
                                top: 12,
                                right: 12,
                                zIndex: 2,
                                border: '1px solid rgba(255,255,255,0.3)',
                                borderRadius: 999,
                                background: 'rgba(0,0,0,0.55)',
                                color: '#fff',
                                padding: '4px 12px',
                                fontSize: 13,
                                cursor: 'pointer',
                            }}
                        >
                            ✕ Map
                        </button>
                        <VideoReel
                            items={reelItems}
                            onShare={onShare}
                            shareStatus={shareStatus}
                            height="100%"
                            repostableIds={repostableIds}
                            onRepost={onRepostFromDevice}
                        />
                    </div>
                ) : null}

                <LocationConsentDialog
                    open={locationConsent.disclosureOpen}
                    onConfirm={locationConsent.confirmEnable}
                    onCancel={() => {
                        setLocatePending(false);
                        locationConsent.cancelEnable();
                    }}
                />
            </section>
        </div>
    );
}

/**
 * Turn a place into the coordinate fields a pin carries. Returns null for a
 * record with no place — plenty of needs are genuinely placeless, and a pin at
 * `0,0` in the Gulf of Guinea is worse than no pin at all.
 */
function placePinFields(
    place: CoalitionPlace | undefined
): Pick<PinDetails, 'latitude' | 'longitude' | 'radiusMeters'> | null {
    if (!place) return null;
    return {
        latitude: place.latitude,
        longitude: place.longitude,
        radiusMeters: place.kind === 'area' ? place.radiusMeters : undefined,
    };
}

interface PinSources {
    spatial: SpatialFeedItem[];
    aid: AidPost[];
    sellers: SellerLocation[];
    videos: CoalitionFeedItem[];
    needs: CoalitionNeed[];
    projects: CoalitionProject[];
    resources: CoalitionResource[];
}

function pinList({
    spatial,
    aid,
    sellers,
    videos,
    needs,
    projects,
    resources,
}: PinSources): PinDetails[] {
    const nowMs = Date.now();
    const pins: PinDetails[] = [];
    for (const item of videos) {
        if (!Number.isFinite(item.latitude) || !Number.isFinite(item.longitude)) continue;
        pins.push({
            id: item.id,
            title: item.title,
            subtitle: `Story · ${item.authorId ?? 'Coalition'}`,
            layer: 'video',
            latitude: item.latitude as number,
            longitude: item.longitude as number,
            denId: item.denId,
            mediaUrl: item.mediaUrl,
        });
    }
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
    // Needs, projects and resources: real-world things that had no coordinates
    // until `CoalitionPlace`, so the map could not show them and they were
    // reachable only from the tool bag. Records without a place stay off it.
    for (const need of needs) {
        const fields = placePinFields(need.place);
        if (!fields) continue;
        pins.push({
            id: need.id,
            title: need.title,
            subtitle: `Need · ${need.kind} · ${need.status}`,
            layer: 'needs',
            denId: undefined,
            ...fields,
        });
    }
    for (const project of projects) {
        const fields = placePinFields(project.place);
        if (!fields) continue;
        pins.push({
            id: project.id,
            title: project.title,
            subtitle: `Project · ${project.category} · ${project.status}`,
            layer: 'projects',
            ...fields,
        });
    }
    for (const resource of resources) {
        const fields = placePinFields(resource.place);
        if (!fields) continue;
        pins.push({
            id: resource.id,
            title: resource.name,
            subtitle: `Resource · ${resource.kind} · ${resource.availability}`,
            layer: 'resources',
            ...fields,
        });
    }
    return pins;
}

export default MapTab;
