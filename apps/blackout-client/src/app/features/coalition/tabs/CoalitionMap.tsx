import React, { useEffect, useRef } from 'react';
import maplibregl, { type LngLatLike, type StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

export interface CoalitionMapPin {
    id: string;
    title: string;
    layer: string;
    latitude: number;
    longitude: number;
    /** Drives the "alive" pulse — `live` pins glow. */
    status?: 'upcoming' | 'live' | 'past';
    /** Activity-heat weight (0..1); feeds the heat overlay and the pulse threshold. */
    heat?: number;
}

export interface CoalitionMapProps {
    pins: CoalitionMapPin[];
    /** Viewer position when the "Near me" filter is active; rendered as a distinct marker. */
    viewerLocation?: { lat: number; lng: number } | null;
    /** Pin to fly to / highlight (e.g. the one selected in the side panel or list). */
    focusPinId?: string | null;
    /** When true, render the activity-heat overlay weighted by each pin's `heat`. */
    showHeat?: boolean;
    onSelectPin: (id: string) => void;
}

/** Per-layer marker colors, keyed by `SpatialLayerKey`. */
const LAYER_COLORS: Record<string, string> = {
    vendors: '#1ABC9C',
    jobs: '#3498DB',
    gardens: '#2ECC71',
    votes: '#9B59B6',
    aid: '#E74C3C',
    infra: '#F39C12',
    events: '#D7FF3F',
    dens: '#2EF2C5',
    streams: '#FF6B6B',
    projects: '#E67E22',
    communities: '#5DADE2',
    mycelium: '#8E44AD',
};
const DEFAULT_MARKER_COLOR = '#1ABC9C';

const HEAT_SOURCE_ID = 'coalition-heat';
const HEAT_LAYER_ID = 'coalition-heat-layer';
const PULSE_STYLE_ID = 'coalition-pulse-keyframes';
/** Pins at or above this heat radiate the ambient pulse even when not live. */
const PULSE_HEAT_THRESHOLD = 0.7;

/** Inject the pulse keyframes once so live/high-activity markers can glow. */
function ensurePulseKeyframes(): void {
    if (typeof document === 'undefined') return;
    if (document.getElementById(PULSE_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = PULSE_STYLE_ID;
    style.textContent = [
        '@keyframes coalition-pulse {',
        '  0% { box-shadow: 0 0 0 0 var(--coalition-pulse-color); }',
        '  70% { box-shadow: 0 0 0 12px rgba(0,0,0,0); }',
        '  100% { box-shadow: 0 0 0 0 rgba(0,0,0,0); }',
        '}',
    ].join('\n');
    document.head.appendChild(style);
}

/** Convert a `#rrggbb` marker color to an rgba() string with the given alpha. */
function hexToRgba(hex: string, alpha: number): string {
    const value = hex.replace('#', '');
    const r = parseInt(value.slice(0, 2), 16);
    const g = parseInt(value.slice(2, 4), 16);
    const b = parseInt(value.slice(4, 6), 16);
    if ([r, g, b].some((channel) => Number.isNaN(channel))) return hex;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * No-key raster fallback so the map renders real geography out of the box.
 * Operators should set `VITE_MAPLIBRE_STYLE_URL` to their own vector/raster
 * style (e.g. a self-hosted tile server) to avoid hitting the public OSM tiles.
 */
const OSM_RASTER_STYLE: StyleSpecification = {
    version: 8,
    sources: {
        osm: {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '© OpenStreetMap contributors',
        },
    },
    layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
};

function resolveStyle(): string | StyleSpecification {
    const env = (import.meta as unknown as { env?: { VITE_MAPLIBRE_STYLE_URL?: string } }).env;
    const url = env?.VITE_MAPLIBRE_STYLE_URL;
    return url && url.length > 0 ? url : OSM_RASTER_STYLE;
}

function buildMarkerElement(
    color: string,
    label: string,
    options: { pulsing?: boolean } = {}
): HTMLButtonElement {
    const el = document.createElement('button');
    el.type = 'button';
    el.setAttribute('data-testid', 'coalition-map-marker');
    el.setAttribute('aria-label', label);
    el.style.cssText = [
        'width:18px',
        'height:18px',
        'border-radius:50%',
        `background:${color}`,
        'border:2px solid #fff',
        'box-shadow:0 1px 4px rgba(0,0,0,0.4)',
        'cursor:pointer',
        'padding:0',
        'display:block',
    ].join(';');
    if (options.pulsing) {
        ensurePulseKeyframes();
        el.dataset.pulsing = 'true';
        el.style.setProperty('--coalition-pulse-color', hexToRgba(color, 0.7));
        el.style.animation = 'coalition-pulse 1.8s ease-out infinite';
    }
    return el;
}

/** A pin should glow when it is happening now or has high participation density. */
function isPinPulsing(pin: CoalitionMapPin): boolean {
    return pin.status === 'live' || (pin.heat ?? 0) >= PULSE_HEAT_THRESHOLD;
}

/** Build a GeoJSON FeatureCollection of geocoded pins weighted by heat. */
function heatGeoJson(pins: CoalitionMapPin[]) {
    return {
        type: 'FeatureCollection' as const,
        features: pins
            .filter((pin) => Number.isFinite(pin.latitude) && Number.isFinite(pin.longitude))
            .map((pin) => ({
                type: 'Feature' as const,
                properties: { heat: Math.max(0.05, pin.heat ?? 0) },
                geometry: {
                    type: 'Point' as const,
                    coordinates: [pin.longitude, pin.latitude],
                },
            })),
    };
}

export function CoalitionMap({
    pins,
    viewerLocation,
    focusPinId,
    showHeat = false,
    onSelectPin,
}: CoalitionMapProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<maplibregl.Map | null>(null);
    const readyRef = useRef(false);
    const markersRef = useRef<maplibregl.Marker[]>([]);
    const viewerMarkerRef = useRef<maplibregl.Marker | null>(null);
    // Keep the latest callback without re-running the marker effect on every render.
    const onSelectRef = useRef(onSelectPin);
    onSelectRef.current = onSelectPin;

    useEffect(() => {
        if (!containerRef.current) return undefined;
        const map = new maplibregl.Map({
            container: containerRef.current,
            style: resolveStyle(),
            center: [0, 20],
            zoom: 1.3,
            attributionControl: { compact: true },
        });
        map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
        map.on('load', () => {
            readyRef.current = true;
        });
        mapRef.current = map;
        return () => {
            readyRef.current = false;
            map.remove();
            mapRef.current = null;
        };
    }, []);

    // Render markers and fit the viewport whenever the pin set changes.
    useEffect(() => {
        const map = mapRef.current;
        if (!map) return;

        markersRef.current.forEach((marker) => marker.remove());
        markersRef.current = [];

        const bounds = new maplibregl.LngLatBounds();
        let plotted = 0;
        for (const pin of pins) {
            if (!Number.isFinite(pin.latitude) || !Number.isFinite(pin.longitude)) continue;
            const color = LAYER_COLORS[pin.layer] ?? DEFAULT_MARKER_COLOR;
            const el = buildMarkerElement(color, pin.title, { pulsing: isPinPulsing(pin) });
            el.addEventListener('click', (event) => {
                event.stopPropagation();
                onSelectRef.current(pin.id);
            });
            const coords: LngLatLike = [pin.longitude, pin.latitude];
            const marker = new maplibregl.Marker({ element: el }).setLngLat(coords).addTo(map);
            markersRef.current.push(marker);
            bounds.extend(coords);
            plotted += 1;
        }

        if (viewerLocation) {
            bounds.extend([viewerLocation.lng, viewerLocation.lat]);
        }

        if (plotted === 0 && !viewerLocation) return;
        if (plotted === 1 && !viewerLocation) {
            map.easeTo({ center: bounds.getCenter(), zoom: 12, duration: 400 });
        } else {
            map.fitBounds(bounds, { padding: 56, maxZoom: 14, duration: 400 });
        }
    }, [pins, viewerLocation]);

    // "You are here" marker for the nearby filter.
    useEffect(() => {
        const map = mapRef.current;
        if (!map) return;
        viewerMarkerRef.current?.remove();
        viewerMarkerRef.current = null;
        if (!viewerLocation) return;
        viewerMarkerRef.current = new maplibregl.Marker({ color: '#2D6CDF' })
            .setLngLat([viewerLocation.lng, viewerLocation.lat])
            .addTo(map);
    }, [viewerLocation]);

    // Fly to the focused pin (selected in the side panel / list).
    useEffect(() => {
        const map = mapRef.current;
        if (!map || !focusPinId) return;
        const pin = pins.find((candidate) => candidate.id === focusPinId);
        if (!pin || !Number.isFinite(pin.latitude) || !Number.isFinite(pin.longitude)) return;
        map.flyTo({ center: [pin.longitude, pin.latitude], zoom: Math.max(map.getZoom(), 13) });
    }, [focusPinId, pins]);

    // Activity-heat overlay: a native MapLibre heatmap weighted by each pin's heat.
    useEffect(() => {
        const map = mapRef.current;
        if (!map) return undefined;

        const apply = () => {
            if (typeof map.isStyleLoaded === 'function' && !map.isStyleLoaded()) return;
            const data = heatGeoJson(pins);
            const existing = map.getSource(HEAT_SOURCE_ID) as
                | { setData?: (value: unknown) => void }
                | undefined;
            if (!showHeat) {
                if (map.getLayer?.(HEAT_LAYER_ID)) map.removeLayer(HEAT_LAYER_ID);
                if (existing) map.removeSource(HEAT_SOURCE_ID);
                return;
            }
            if (existing?.setData) {
                existing.setData(data);
                return;
            }
            map.addSource(HEAT_SOURCE_ID, { type: 'geojson', data } as never);
            map.addLayer({
                id: HEAT_LAYER_ID,
                type: 'heatmap',
                source: HEAT_SOURCE_ID,
                paint: {
                    'heatmap-weight': ['get', 'heat'],
                    'heatmap-intensity': 1.2,
                    'heatmap-radius': 36,
                    'heatmap-opacity': 0.65,
                },
            } as never);
        };

        if (readyRef.current) apply();
        else map.on('load', apply);
        return () => {
            map.off?.('load', apply);
        };
    }, [pins, showHeat]);

    return (
        <div
            ref={containerRef}
            data-testid="coalition-map-gl"
            style={{ position: 'absolute', inset: 0 }}
        />
    );
}

export default CoalitionMap;
