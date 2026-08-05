import React, { useEffect, useRef } from 'react';
import { SPATIAL_LAYER_DEFINITIONS, type SpatialLayerKey } from '@blackout/core';
import { buildLayerIconSvg, layerStyleFor } from '../tabs/solarpunkMap';
import * as css from './MapLegend.css';

/** The map's time filter, mirroring the modes MapTab already supported. */
export type MapTimeMode = 'now' | 'today' | 'week' | 'all';

export const MAP_TIME_MODES: ReadonlyArray<{ key: MapTimeMode; label: string }> = [
    { key: 'now', label: 'Now' },
    { key: 'today', label: 'Today' },
    { key: 'week', label: 'This week' },
    { key: 'all', label: 'All' },
];

function LayerGlyph({ layer, active }: { layer: SpatialLayerKey; active: boolean }) {
    const ref = useRef<HTMLSpanElement>(null);
    useEffect(() => {
        const host = ref.current;
        if (!host) return;
        const style = layerStyleFor(layer);
        host.replaceChildren(buildLayerIconSvg(style, active ? style.ink : style.color));
    }, [layer, active]);
    return (
        <span
            ref={ref}
            aria-hidden="true"
            style={{ display: 'inline-flex', width: 18, justifyContent: 'center' }}
        />
    );
}

export interface MapLegendProps {
    activeLayers: ReadonlySet<SpatialLayerKey>;
    onToggleLayer: (layer: SpatialLayerKey) => void;
    onSetLayers: (layers: SpatialLayerKey[]) => void;
    /**
     * Live pin count per layer. Only meaningful for *active* layers — the feed
     * is fetched filtered by layer, so a hidden layer's true count is unknown
     * rather than zero, and the legend shows nothing rather than lying.
     */
    countsByLayer: Readonly<Partial<Record<SpatialLayerKey, number>>>;
    timeMode: MapTimeMode;
    onSetTimeMode: (mode: MapTimeMode) => void;
    showHeat: boolean;
    onToggleHeat: () => void;
    nearby: boolean;
    onToggleNearby: () => void;
    /** Radius controls, revealed only while Near me is on. */
    radiusKm: number;
    radiusOptionsKm: readonly number[];
    onSelectRadius: (km: number) => void;
    nearbyError?: string | null;
    open: boolean;
    onSetOpen: (open: boolean) => void;
}

/**
 * The world's key.
 *
 * Before this, thirteen layer chips plus Near-me, radius, time modes and Heat
 * all lived in one absolutely-positioned flex row across the top of the map.
 * On a phone that row ran off the right edge and overlapped the one beneath it.
 *
 * Here they are a legend: a collapsible panel that names every pin type, shows
 * how many of each are on the map right now, and toggles them. It scrolls
 * internally and collapses to a single puck, so it can never eat the map.
 */
export function MapLegend({
    activeLayers,
    onToggleLayer,
    onSetLayers,
    countsByLayer,
    timeMode,
    onSetTimeMode,
    showHeat,
    onToggleHeat,
    nearby,
    onToggleNearby,
    radiusKm,
    radiusOptionsKm,
    onSelectRadius,
    nearbyError,
    open,
    onSetOpen,
}: MapLegendProps) {
    const activeCount = activeLayers.size;
    const allKeys = SPATIAL_LAYER_DEFINITIONS.map((definition) => definition.key);

    if (!open) {
        return (
            <div className={css.dock}>
                <button
                    type="button"
                    className={css.puck}
                    onClick={() => onSetOpen(true)}
                    aria-expanded={false}
                    data-testid="coalition-legend-toggle"
                >
                    🗺️ Legend
                    <span className={css.layerCount}>
                        {activeCount}/{allKeys.length}
                    </span>
                </button>
            </div>
        );
    }

    return (
        <div className={css.dock}>
            <div className={css.panel} data-testid="coalition-legend">
                <div className={css.panelHeader}>
                    <div className={css.headerRow}>
                        <span className={css.title}>Legend</span>
                        <button
                            type="button"
                            className={css.puck}
                            style={{ padding: '2px 8px', fontSize: 12, boxShadow: 'none' }}
                            onClick={() => onSetOpen(false)}
                            aria-expanded
                            data-testid="coalition-legend-toggle"
                        >
                            ✕
                        </button>
                    </div>

                    {/* Time, proximity and heat live in the legend header rather
                        than forming a second row that overlaps this one. */}
                    <div className={css.headerRow} role="group" aria-label="Time window">
                        {MAP_TIME_MODES.map((mode) => (
                            <button
                                key={mode.key}
                                type="button"
                                className={timeMode === mode.key ? css.control.on : css.control.off}
                                aria-pressed={timeMode === mode.key}
                                onClick={() => onSetTimeMode(mode.key)}
                                data-testid={`coalition-legend-time-${mode.key}`}
                            >
                                {mode.label}
                            </button>
                        ))}
                    </div>

                    <div className={css.headerRow}>
                        <button
                            type="button"
                            className={nearby ? css.control.on : css.control.off}
                            aria-pressed={nearby}
                            onClick={onToggleNearby}
                            data-testid="coalition-map-nearby"
                        >
                            📍 Near me
                        </button>
                        <button
                            type="button"
                            className={showHeat ? css.control.on : css.control.off}
                            aria-pressed={showHeat}
                            onClick={onToggleHeat}
                            data-testid="coalition-map-heat"
                        >
                            🔥 Heat
                        </button>
                    </div>

                    {/* Radius only means something while Near me is on, so it
                        appears with it instead of always taking up a row. */}
                    {nearby ? (
                        <div className={css.headerRow} role="group" aria-label="Search radius">
                            {radiusOptionsKm.map((km) => (
                                <button
                                    key={km}
                                    type="button"
                                    className={radiusKm === km ? css.control.on : css.control.off}
                                    aria-pressed={radiusKm === km}
                                    onClick={() => onSelectRadius(km)}
                                    data-testid={`coalition-map-radius-${km}`}
                                >
                                    {km}km
                                </button>
                            ))}
                        </div>
                    ) : null}

                    {nearbyError ? (
                        <span style={{ fontSize: 11, color: 'var(--danger)' }} role="alert">
                            {nearbyError}
                        </span>
                    ) : null}
                </div>

                <div className={css.layerList} role="group" aria-label="Map layers">
                    {SPATIAL_LAYER_DEFINITIONS.map((definition) => {
                        const active = activeLayers.has(definition.key);
                        const style = layerStyleFor(definition.key);
                        return (
                            <button
                                key={definition.key}
                                type="button"
                                className={`${css.layerRow} ${active ? '' : css.layerRowMuted}`}
                                aria-pressed={active}
                                onClick={() => onToggleLayer(definition.key)}
                                data-coalition-layer={definition.key}
                                data-testid={`coalition-legend-layer-${definition.key}`}
                            >
                                <span
                                    className={css.swatch}
                                    style={{ background: style.color }}
                                    aria-hidden
                                />
                                <LayerGlyph layer={definition.key} active={active} />
                                <span className={css.layerLabel}>{definition.label}</span>
                                {active ? (
                                    <span className={css.layerCount}>
                                        {countsByLayer[definition.key] ?? 0}
                                    </span>
                                ) : null}
                            </button>
                        );
                    })}
                </div>

                <div className={css.footerRow}>
                    <button
                        type="button"
                        className={css.footerButton}
                        onClick={() => onSetLayers(allKeys)}
                        data-testid="coalition-legend-all"
                    >
                        Show all
                    </button>
                    <button
                        type="button"
                        className={css.footerButton}
                        onClick={() => onSetLayers([])}
                        data-testid="coalition-legend-none"
                    >
                        Hide all
                    </button>
                </div>
            </div>
        </div>
    );
}

export default MapLegend;
