// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';
import { SPATIAL_LAYER_KEYS, type SpatialLayerKey } from '@blackout/core';
import { MapLegend } from '../../../../src/app/features/coalition/map/MapLegend';

/**
 * Derived, not hardcoded: the legend is keyed to the taxonomy, so adding a
 * layer there (needs and resources, when they gained coordinates) must not
 * break these — it should just be counted.
 */
const LAYER_COUNT = SPATIAL_LAYER_KEYS.length;

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mountedRoots: ReactDOM.Root[] = [];

const render = (node: React.ReactElement) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    act(() => {
        root.render(node);
    });
    mountedRoots.push(root);
    return container;
};

const noop = () => undefined;

const defaults = {
    activeLayers: new Set<SpatialLayerKey>(['aid', 'events']),
    onToggleLayer: noop,
    onSetLayers: noop,
    countsByLayer: { aid: 3, events: 1 },
    timeMode: 'all' as const,
    onSetTimeMode: noop,
    showHeat: false,
    onToggleHeat: noop,
    nearby: false,
    onToggleNearby: noop,
    radiusKm: 5,
    radiusOptionsKm: [1, 5, 25],
    onSelectRadius: noop,
    open: true,
    onSetOpen: noop,
};

afterEach(() => {
    act(() => {
        mountedRoots.splice(0).forEach((root) => root.unmount());
    });
    document.body.innerHTML = '';
    vi.clearAllMocks();
});

describe('MapLegend', () => {
    it('collapses to a single puck so it can never eat the map', () => {
        const container = render(<MapLegend {...defaults} open={false} />);
        expect(container.querySelector('[data-testid="coalition-legend"]')).toBeNull();
        const puck = container.querySelector('[data-testid="coalition-legend-toggle"]');
        expect(puck).toBeTruthy();
        // The puck reports how much of the world is currently visible.
        expect(puck?.textContent).toContain(`2/${LAYER_COUNT}`);
    });

    it('lists every layer when open', () => {
        const container = render(<MapLegend {...defaults} />);
        const rows = container.querySelectorAll('[data-coalition-layer]');
        expect(rows).toHaveLength(LAYER_COUNT);
    });

    /**
     * The feed is fetched filtered by layer, so a hidden layer's real count is
     * unknown rather than zero. Showing "0" would be a lie.
     */
    it('shows a count for active layers and none for hidden ones', () => {
        const container = render(<MapLegend {...defaults} />);
        expect(
            container.querySelector('[data-testid="coalition-legend-layer-aid"]')?.textContent
        ).toContain('3');
        const hidden = container.querySelector('[data-testid="coalition-legend-layer-gardens"]');
        expect(hidden?.textContent).toBe('Gardens');
    });

    it('reports a layer toggle to the caller', () => {
        const onToggleLayer = vi.fn();
        const container = render(<MapLegend {...defaults} onToggleLayer={onToggleLayer} />);
        act(() => {
            (
                container.querySelector(
                    '[data-testid="coalition-legend-layer-gardens"]'
                ) as HTMLButtonElement
            ).click();
        });
        expect(onToggleLayer).toHaveBeenCalledWith('gardens');
    });

    it('marks the active time mode and reports a change', () => {
        const onSetTimeMode = vi.fn();
        const container = render(
            <MapLegend {...defaults} timeMode="today" onSetTimeMode={onSetTimeMode} />
        );
        expect(
            container
                .querySelector('[data-testid="coalition-legend-time-today"]')
                ?.getAttribute('aria-pressed')
        ).toBe('true');
        act(() => {
            (
                container.querySelector(
                    '[data-testid="coalition-legend-time-week"]'
                ) as HTMLButtonElement
            ).click();
        });
        expect(onSetTimeMode).toHaveBeenCalledWith('week');
    });

    it('hides radius until Near me is on, since it means nothing otherwise', () => {
        const off = render(<MapLegend {...defaults} nearby={false} />);
        expect(off.querySelector('[data-testid="coalition-map-radius-5"]')).toBeNull();

        const on = render(<MapLegend {...defaults} nearby />);
        expect(on.querySelector('[data-testid="coalition-map-radius-5"]')).toBeTruthy();
    });

    it('offers show-all and hide-all rather than one tap per layer', () => {
        const onSetLayers = vi.fn();
        const container = render(<MapLegend {...defaults} onSetLayers={onSetLayers} />);
        act(() => {
            (
                container.querySelector(
                    '[data-testid="coalition-legend-none"]'
                ) as HTMLButtonElement
            ).click();
        });
        expect(onSetLayers).toHaveBeenCalledWith([]);
        act(() => {
            (
                container.querySelector('[data-testid="coalition-legend-all"]') as HTMLButtonElement
            ).click();
        });
        expect(onSetLayers.mock.calls[1][0]).toHaveLength(LAYER_COUNT);
    });

    it('surfaces a location error inline', () => {
        const container = render(<MapLegend {...defaults} nearbyError="Location denied" />);
        expect(container.querySelector('[role="alert"]')?.textContent).toBe('Location denied');
    });
});
