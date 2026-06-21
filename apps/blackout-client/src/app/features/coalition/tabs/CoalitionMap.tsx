import React, { useEffect, useRef } from 'react';
import maplibregl, { type LngLatLike, type StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { buildCommunitiesPath } from '../../../pages/paths';
import {
    buildLayerIconSvg,
    ensureSolarpunkMapStyles,
    layerStyleFor,
    MARKER_RING,
    SOLARPUNK_HEAT_RAMP,
    SOLARPUNK_MAP_CLASS,
    VIEWER_MARKER_COLOR,
    type SolarpunkLayerStyle,
} from './solarpunkMap';

export interface CoalitionMapPin {
    id: string;
    title: string;
    layer: string;
    latitude: number;
    longitude: number;
    /** Secondary line shown in the marker popup (e.g. "communities · live"). */
    subtitle?: string;
    /** Associated den, surfaced as a link in the popup when present. */
    denId?: string;
    /** Drives the "alive" pulse — `live` pins glow. */
    status?: 'upcoming' | 'live' | 'past';
    /** Activity-heat weight (0..1); feeds the heat overlay and the pulse threshold. */
    heat?: number;
}

/** Map padding (px) reserved for the overlays floating above the canvas. */
export interface MapOverlayInsets {
    top: number;
    bottom: number;
}

const DEFAULT_OVERLAY_INSETS: MapOverlayInsets = { top: 96, bottom: 56 };

export interface CoalitionMapProps {
    pins: CoalitionMapPin[];
    /** Viewer position when the "Near me" filter is active; rendered as a distinct marker. */
    viewerLocation?: { lat: number; lng: number } | null;
    /** Pin to fly to / highlight; opens a popup anchored to its marker. */
    focusPinId?: string | null;
    /** When true, render the activity-heat overlay weighted by each pin's `heat`. */
    showHeat?: boolean;
    /** Padding kept clear of the floating toolbar (top) and results list (bottom). */
    overlayInsets?: MapOverlayInsets;
    onSelectPin: (id: string) => void;
    /** Called when the user dismisses the marker popup, so selection can clear. */
    onDeselect?: () => void;
}

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

/**
 * A solarpunk marker: a warm botanical/solar glyph in a layer-colored badge
 * ringed in cream. The glyph (SVG) carries the layer's identity; the hue gives
 * it family warmth. Live / high-activity pins keep the ambient pulse.
 */
function buildMarkerElement(
    style: SolarpunkLayerStyle,
    label: string,
    options: { pulsing?: boolean } = {}
): HTMLButtonElement {
    const el = document.createElement('button');
    el.type = 'button';
    el.setAttribute('data-testid', 'coalition-map-marker');
    el.setAttribute('aria-label', label);
    el.style.cssText = [
        'width:26px',
        'height:26px',
        'border-radius:50%',
        `background:${style.color}`,
        `border:2px solid ${MARKER_RING}`,
        'box-shadow:0 1px 5px rgba(31,90,71,0.45)',
        'cursor:pointer',
        'padding:0',
        'display:flex',
        'align-items:center',
        'justify-content:center',
    ].join(';');
    el.appendChild(buildLayerIconSvg(style));
    if (options.pulsing) {
        ensurePulseKeyframes();
        el.dataset.pulsing = 'true';
        el.style.setProperty('--coalition-pulse-color', hexToRgba(style.color, 0.7));
        el.style.animation = 'coalition-pulse 2.4s ease-out infinite';
    }
    return el;
}

/**
 * Build the popup body for a selected marker. Uses DOM nodes (not innerHTML) so
 * user-authored titles/subtitles can't inject markup.
 */
function buildPopupContent(pin: CoalitionMapPin): HTMLElement {
    const root = document.createElement('div');
    root.style.cssText = 'display:grid;gap:4px;min-width:150px;max-width:240px';
    const title = document.createElement('strong');
    title.textContent = pin.title;
    title.style.cssText = 'font-size:13px;color:#1B130A';
    root.appendChild(title);
    if (pin.subtitle) {
        const subtitle = document.createElement('small');
        subtitle.textContent = pin.subtitle;
        subtitle.style.cssText = 'font-size:11px;color:#6B5A4A';
        root.appendChild(subtitle);
    }
    if (pin.denId) {
        const link = document.createElement('a');
        link.href = buildCommunitiesPath(null, pin.denId);
        link.textContent = 'Open associated den →';
        link.style.cssText = 'font-size:12px;font-weight:600;color:#C66A2B';
        root.appendChild(link);
    }
    return root;
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
    overlayInsets,
    onSelectPin,
    onDeselect,
}: CoalitionMapProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<maplibregl.Map | null>(null);
    const readyRef = useRef(false);
    const markersRef = useRef<maplibregl.Marker[]>([]);
    const viewerMarkerRef = useRef<maplibregl.Marker | null>(null);
    const popupRef = useRef<maplibregl.Popup | null>(null);
    // Distinguishes our own popup.remove() from a user-initiated close.
    const popupClosingRef = useRef(false);
    // Keep the latest callbacks/insets without re-running effects every render.
    const onSelectRef = useRef(onSelectPin);
    onSelectRef.current = onSelectPin;
    const onDeselectRef = useRef(onDeselect);
    onDeselectRef.current = onDeselect;
    const insetsRef = useRef<MapOverlayInsets>(overlayInsets ?? DEFAULT_OVERLAY_INSETS);
    insetsRef.current = overlayInsets ?? DEFAULT_OVERLAY_INSETS;

    useEffect(() => {
        if (!containerRef.current) return undefined;
        ensureSolarpunkMapStyles();
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
            const el = buildMarkerElement(layerStyleFor(pin.layer), pin.title, {
                pulsing: isPinPulsing(pin),
            });
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
        const insets = insetsRef.current;
        const padding = { top: insets.top, bottom: insets.bottom, left: 24, right: 24 };
        if (plotted === 1 && !viewerLocation) {
            map.easeTo({ center: bounds.getCenter(), zoom: 12, padding, duration: 400 });
        } else {
            map.fitBounds(bounds, { padding, maxZoom: 14, duration: 400 });
        }
    }, [pins, viewerLocation]);

    // "You are here" marker for the nearby filter.
    useEffect(() => {
        const map = mapRef.current;
        if (!map) return;
        viewerMarkerRef.current?.remove();
        viewerMarkerRef.current = null;
        if (!viewerLocation) return;
        viewerMarkerRef.current = new maplibregl.Marker({ color: VIEWER_MARKER_COLOR })
            .setLngLat([viewerLocation.lng, viewerLocation.lat])
            .addTo(map);
    }, [viewerLocation]);

    // Fly to the focused pin and open a popup anchored to its marker.
    useEffect(() => {
        const map = mapRef.current;
        if (!map) return;

        const closePopup = () => {
            if (!popupRef.current) return;
            popupClosingRef.current = true;
            popupRef.current.remove();
            popupClosingRef.current = false;
            popupRef.current = null;
        };

        const pin = focusPinId ? pins.find((candidate) => candidate.id === focusPinId) : undefined;
        if (!pin || !Number.isFinite(pin.latitude) || !Number.isFinite(pin.longitude)) {
            closePopup();
            return;
        }

        const insets = insetsRef.current;
        map.flyTo({
            center: [pin.longitude, pin.latitude],
            zoom: Math.max(map.getZoom(), 13),
            padding: { top: insets.top, bottom: insets.bottom, left: 24, right: 24 },
        });

        closePopup();
        const popup = new maplibregl.Popup({ closeButton: true, closeOnClick: false, offset: 16 })
            .setLngLat([pin.longitude, pin.latitude])
            .setDOMContent(buildPopupContent(pin))
            .addTo(map);
        popup.on('close', () => {
            if (popupClosingRef.current) return;
            popupRef.current = null;
            onDeselectRef.current?.();
        });
        popupRef.current = popup;

        return closePopup;
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
                    'heatmap-radius': 38,
                    'heatmap-opacity': 0.55,
                    'heatmap-color': SOLARPUNK_HEAT_RAMP,
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
            className={SOLARPUNK_MAP_CLASS}
            style={{ position: 'absolute', inset: 0 }}
        />
    );
}

export default CoalitionMap;
