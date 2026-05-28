// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';

const mocks = vi.hoisted(() => {
    const markerInstances: Array<{
        element?: HTMLElement;
        lngLat?: [number, number];
        color?: string;
        removed: boolean;
    }> = [];
    const popupInstances: Array<{
        lngLat?: [number, number];
        content?: HTMLElement;
        removed: boolean;
        closeHandlers: Array<() => void>;
    }> = [];
    const sources = new Map<string, { setData: (value: unknown) => void }>();
    const layers = new Set<string>();
    const mapInstance = {
        addControl: vi.fn(),
        on: vi.fn((event: string, cb: () => void) => {
            if (event === 'load') cb();
        }),
        off: vi.fn(),
        remove: vi.fn(),
        fitBounds: vi.fn(),
        easeTo: vi.fn(),
        flyTo: vi.fn(),
        getZoom: vi.fn(() => 10),
        isStyleLoaded: vi.fn(() => true),
        addSource: vi.fn((id: string) => {
            sources.set(id, { setData: vi.fn() });
        }),
        getSource: vi.fn((id: string) => sources.get(id)),
        removeSource: vi.fn((id: string) => {
            sources.delete(id);
        }),
        addLayer: vi.fn((layer: { id: string }) => {
            layers.add(layer.id);
        }),
        getLayer: vi.fn((id: string) => (layers.has(id) ? { id } : undefined)),
        removeLayer: vi.fn((id: string) => {
            layers.delete(id);
        }),
    };
    return { markerInstances, popupInstances, mapInstance };
});

vi.mock('maplibre-gl/dist/maplibre-gl.css', () => ({}));
vi.mock('maplibre-gl', () => {
    class Marker {
        element?: HTMLElement;
        lngLat?: [number, number];
        color?: string;
        removed = false;
        constructor(opts?: { element?: HTMLElement; color?: string }) {
            this.element = opts?.element;
            this.color = opts?.color;
            mocks.markerInstances.push(this);
        }
        setLngLat(coords: [number, number]) {
            this.lngLat = coords;
            return this;
        }
        addTo() {
            return this;
        }
        remove() {
            this.removed = true;
        }
    }
    class LngLatBounds {
        coords: Array<[number, number]> = [];
        extend(c: [number, number]) {
            this.coords.push(c);
            return this;
        }
        getCenter() {
            return this.coords[0] ?? [0, 0];
        }
    }
    class NavigationControl {}
    class Popup {
        lngLat?: [number, number];
        content?: HTMLElement;
        removed = false;
        closeHandlers: Array<() => void> = [];
        constructor() {
            mocks.popupInstances.push(this);
        }
        setLngLat(coords: [number, number]) {
            this.lngLat = coords;
            return this;
        }
        setDOMContent(node: HTMLElement) {
            this.content = node;
            return this;
        }
        addTo() {
            return this;
        }
        on(event: string, cb: () => void) {
            if (event === 'close') this.closeHandlers.push(cb);
            return this;
        }
        remove() {
            this.removed = true;
        }
    }
    class Map {
        constructor() {
            return mocks.mapInstance as unknown as Map;
        }
    }
    return { default: { Map, Marker, LngLatBounds, NavigationControl, Popup } };
});

// eslint-disable-next-line import/first
import { CoalitionMap } from '../../../../src/app/features/coalition/tabs/CoalitionMap';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mountedRoots: ReactDOM.Root[] = [];

const render = (element: React.ReactElement) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    act(() => {
        root.render(element);
    });
    mountedRoots.push(root);
    return container;
};

afterEach(() => {
    act(() => {
        mountedRoots.splice(0).forEach((root) => root.unmount());
    });
    document.body.innerHTML = '';
    mocks.markerInstances.length = 0;
    mocks.popupInstances.length = 0;
    vi.clearAllMocks();
});

describe('CoalitionMap', () => {
    const pins = [
        { id: 'a', title: 'Farm stand', layer: 'vendors', latitude: 40.1, longitude: -74.2 },
        { id: 'b', title: 'Food drive', layer: 'aid', latitude: 40.2, longitude: -74.3 },
        // Non-geocoded pin (e.g. mycelium node) — must be skipped, not plotted.
        {
            id: 'c',
            title: 'No coords',
            layer: 'mycelium',
            latitude: Number.NaN,
            longitude: Number.NaN,
        },
    ];

    it('plots one marker per geocoded pin and skips non-finite coords', () => {
        render(<CoalitionMap pins={pins} onSelectPin={vi.fn()} />);
        expect(mocks.markerInstances).toHaveLength(2);
        expect(mocks.markerInstances[0].lngLat).toEqual([-74.2, 40.1]);
        // >1 pin → viewport is fit to the marker bounds.
        expect(mocks.mapInstance.fitBounds).toHaveBeenCalled();
    });

    it('invokes onSelectPin with the pin id when a marker is clicked', () => {
        const onSelectPin = vi.fn();
        render(<CoalitionMap pins={pins} onSelectPin={onSelectPin} />);
        act(() => {
            mocks.markerInstances[1].element?.click();
        });
        expect(onSelectPin).toHaveBeenCalledWith('b');
    });

    it('adds a distinct viewer marker when a nearby location is active', () => {
        render(
            <CoalitionMap
                pins={pins}
                viewerLocation={{ lat: 40.0, lng: -74.0 }}
                onSelectPin={vi.fn()}
            />
        );
        // 2 pin markers + 1 colored viewer marker.
        expect(mocks.markerInstances).toHaveLength(3);
        expect(mocks.markerInstances.some((marker) => marker.color === '#2D6CDF')).toBe(true);
    });

    it('flies to the focused pin', () => {
        render(<CoalitionMap pins={pins} focusPinId="b" onSelectPin={vi.fn()} />);
        expect(mocks.mapInstance.flyTo).toHaveBeenCalledWith(
            expect.objectContaining({ center: [-74.3, 40.2] })
        );
    });

    it('opens a popup with details anchored to the focused geocoded pin', () => {
        render(<CoalitionMap pins={pins} focusPinId="b" onSelectPin={vi.fn()} />);
        expect(mocks.popupInstances).toHaveLength(1);
        expect(mocks.popupInstances[0].lngLat).toEqual([-74.3, 40.2]);
        expect(mocks.popupInstances[0].content?.textContent).toContain('Food drive');
    });

    it('does not open a popup for a focused pin without coordinates', () => {
        render(<CoalitionMap pins={pins} focusPinId="c" onSelectPin={vi.fn()} />);
        expect(mocks.popupInstances).toHaveLength(0);
    });

    it('clears the selection when the user closes the popup', () => {
        const onDeselect = vi.fn();
        render(
            <CoalitionMap
                pins={pins}
                focusPinId="b"
                onSelectPin={vi.fn()}
                onDeselect={onDeselect}
            />
        );
        act(() => {
            mocks.popupInstances[0].closeHandlers.forEach((cb) => cb());
        });
        expect(onDeselect).toHaveBeenCalledTimes(1);
    });

    it('pulses live and high-heat pins but not quiet ones', () => {
        render(
            <CoalitionMap
                pins={[
                    {
                        id: 'live',
                        title: 'Live now',
                        layer: 'events',
                        latitude: 40.1,
                        longitude: -74.2,
                        status: 'live',
                    },
                    {
                        id: 'hot',
                        title: 'Busy den',
                        layer: 'dens',
                        latitude: 40.2,
                        longitude: -74.3,
                        heat: 0.85,
                    },
                    {
                        id: 'quiet',
                        title: 'Past',
                        layer: 'vendors',
                        latitude: 40.3,
                        longitude: -74.4,
                        status: 'past',
                    },
                ]}
                onSelectPin={vi.fn()}
            />
        );
        const pulsing = mocks.markerInstances.filter(
            (marker) => marker.element?.dataset.pulsing === 'true'
        );
        expect(pulsing).toHaveLength(2);
    });

    it('adds a native heatmap layer when heat is enabled', () => {
        render(<CoalitionMap pins={pins} showHeat onSelectPin={vi.fn()} />);
        expect(mocks.mapInstance.addSource).toHaveBeenCalledWith(
            'coalition-heat',
            expect.objectContaining({ type: 'geojson' })
        );
        expect(mocks.mapInstance.addLayer).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'coalition-heat-layer', type: 'heatmap' })
        );
    });
});
