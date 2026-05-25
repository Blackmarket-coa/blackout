import React, { useMemo, useState } from 'react';
import {
    SPATIAL_LAYER_DEFINITIONS,
    type AidPost,
    type SellerLocation,
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

export interface MapTabProps {
    scope: CoalitionScopeQuery;
}

interface PinDetails {
    id: string;
    title: string;
    subtitle: string;
    layer: SpatialLayerKey | 'aid' | 'vendors';
    denId?: string;
}

export function MapTab({ scope }: MapTabProps) {
    const [activeLayers, setActiveLayers] = useState<Set<SpatialLayerKey>>(
        () => new Set(SPATIAL_LAYER_DEFINITIONS.map((definition) => definition.key)),
    );
    const [selectedPin, setSelectedPin] = useState<PinDetails | null>(null);
    const [nearby, setNearby] = useState<NearbyQuery | undefined>(undefined);
    const [nearbyError, setNearbyError] = useState<string | null>(null);

    const layersArray = useMemo(() => [...activeLayers], [activeLayers]);
    const spatialState = useSpatialFeed(scope, layersArray);
    const aidState = useMutualAid(scope, nearby);
    const sellerState = useSellerLocations(nearby);

    const toggleNearby = () => {
        if (nearby) {
            setNearby(undefined);
            setNearbyError(null);
            return;
        }
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
                    radiusKm: 5,
                });
            },
            () => setNearbyError('Could not get your location.'),
        );
    };

    const spatialItems = spatialState.data?.items ?? [];
    const aidPosts = aidState.data?.posts ?? [];
    const sellerLocations = sellerState.data?.locations ?? [];
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
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', height: 'min(72vh, 820px)' }}>
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
                <div
                    style={{
                        position: 'absolute',
                        top: 12,
                        left: 12,
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
                        title={nearby ? 'Showing activity within 5km' : 'Filter to nearby activity'}
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
                    {nearbyError ? (
                        <span style={{ fontSize: 11, color: 'var(--danger)', alignSelf: 'center' }}>
                            {nearbyError}
                        </span>
                    ) : null}
                </div>

                <div
                    style={{
                        position: 'absolute',
                        inset: 60,
                        border: '1px dashed var(--border-default)',
                        borderRadius: 12,
                        padding: 12,
                        color: 'var(--text-secondary)',
                        fontSize: 12,
                    }}
                >
                    Map preview · attach <code>maplibre-gl</code> to render real tiles. Pin list
                    shows the current scope.
                </div>

                {myceliumActive && (
                    <div
                        style={{
                            position: 'absolute',
                            inset: 60,
                            display: 'grid',
                            placeItems: 'center',
                            pointerEvents: 'none',
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
                                        denId: nodeId,
                                    })
                                }
                            />
                        </div>
                    </div>
                )}

                <ul style={{ position: 'absolute', bottom: 12, left: 12, right: 12, listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 4, maxHeight: 180, overflowY: 'auto' }}>
                    {pinList(spatialItems, aidPosts, sellerLocations).map((pin) => (
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
                                <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-secondary)' }}>
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
                        <small style={{ color: 'var(--text-secondary)' }}>{selectedPin.subtitle}</small>
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
    sellers: SellerLocation[],
): PinDetails[] {
    const pins: PinDetails[] = [];
    for (const item of spatial) {
        pins.push({
            id: item.id,
            title: item.title,
            subtitle: `${item.layer} · ${item.status}`,
            layer: item.layer,
        });
    }
    for (const post of aid) {
        pins.push({
            id: post.id,
            title: post.title,
            subtitle: `${post.type === 'need' ? 'Need' : 'Offer'} · ${post.urgency}`,
            layer: 'aid',
            denId: post.denId,
        });
    }
    for (const seller of sellers) {
        pins.push({
            id: seller.id,
            title: seller.addressLine || seller.sellerId,
            subtitle: `${seller.locationType} · ${seller.city}`,
            layer: 'vendors',
        });
    }
    return pins;
}

export default MapTab;
