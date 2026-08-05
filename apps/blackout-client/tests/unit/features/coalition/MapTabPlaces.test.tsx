// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';
import type { CoalitionNeed, CoalitionProject, CoalitionResource } from '@blackout/core';

/**
 * Needs, projects and resources had no coordinates, so the map could not show
 * them and they were reachable only from the tool bag. These pin the merge:
 * placed records become map pins, placeless ones stay off, and an area of
 * operations is carried through as a radius rather than flattened to a dot.
 */

const emptyState = { data: null, loading: false, error: null, refetch: vi.fn() };

const boards: {
    needs: CoalitionNeed[];
    projects: CoalitionProject[];
    resources: CoalitionResource[];
} = { needs: [], projects: [], resources: [] };

const state = <T,>(data: T) => ({ data, loading: false, error: null, refetch: vi.fn() });

vi.mock('../../../../src/app/features/coalition/hooks/useCoalitionFeed', () => ({
    useCoalitionFeed: () => state({ generatedAt: '', items: [] }),
    useSpatialFeed: () => emptyState,
    useMutualAid: () => emptyState,
    useSellerLocations: () => emptyState,
    useCoalitionNeeds: () => state({ needs: boards.needs }),
    useCoalitionProjects: () => state({ projects: boards.projects }),
    useCoalitionResources: () => state({ resources: boards.resources }),
    useCoalitionVideoEngagement: () => ({
        likes: emptyState,
        comments: emptyState,
        toggleLike: vi.fn(),
        addComment: vi.fn(),
    }),
}));

/** Capture what MapTab actually hands the map. */
const mapPins: { current: Array<Record<string, unknown>> } = { current: [] };
vi.mock('../../../../src/app/features/coalition/tabs/CoalitionMap', () => ({
    default: (props: { pins: Array<Record<string, unknown>> }) => {
        mapPins.current = props.pins;
        return <div data-testid="mock-map" />;
    },
}));
vi.mock('../../../../src/app/features/coalition/tabs/mycelium', () => ({
    MyceliumLayer: () => null,
    useMyceliumGraph: () => ({ data: null, loading: false, error: null }),
}));
vi.mock('../../../../src/app/features/coalition/composer/VideoComposer', () => ({
    VideoComposer: () => null,
}));
vi.mock('../../../../src/platform/localVideoVault', () => ({
    localVideoVaultSupported: () => false,
    listLocalVideos: async () => [],
}));
vi.mock('../../../../src/app/features/location/LocationConsentDialog', () => ({
    LocationConsentDialog: () => null,
}));

const MapTab = (await import('../../../../src/app/features/coalition/tabs/MapTab')).default;

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const SEATTLE = { latitude: 47.6062, longitude: -122.3321 };

const need = (over: Partial<CoalitionNeed> = {}): CoalitionNeed => ({
    id: 'need-1',
    canopyId: '!c:server',
    kind: 'compost',
    title: 'Compost',
    status: 'open',
    authorId: '@ari:server',
    createdAt: '2026-05-02T11:00:00Z',
    updatedAt: '2026-05-02T11:00:00Z',
    ...over,
});

const project = (over: Partial<CoalitionProject> = {}): CoalitionProject => ({
    id: 'project-1',
    canopyId: '!c:server',
    title: 'Community garden',
    category: 'community_garden',
    status: 'active',
    leadId: '@bo:server',
    raisedCents: 0,
    supporterCount: 0,
    milestones: [],
    createdAt: '2026-05-02T11:00:00Z',
    updatedAt: '2026-05-02T11:00:00Z',
    ...over,
});

const resource = (over: Partial<CoalitionResource> = {}): CoalitionResource => ({
    id: 'resource-1',
    canopyId: '!c:server',
    name: 'Greenhouse',
    kind: 'greenhouse',
    availability: 'available',
    stewardId: '@cy:server',
    createdAt: '2026-05-02T11:00:00Z',
    updatedAt: '2026-05-02T11:00:00Z',
    ...over,
});

const mountedRoots: ReactDOM.Root[] = [];

const render = async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    await act(async () => {
        root.render(<MapTab scope={{ canopyId: '!c:server' }} />);
    });
    mountedRoots.push(root);
    return container;
};

const pinFor = (id: string) => mapPins.current.find((pin) => pin.id === id);

beforeEach(() => {
    boards.needs = [];
    boards.projects = [];
    boards.resources = [];
    mapPins.current = [];
    act(() => {
        mountedRoots.splice(0).forEach((root) => root.unmount());
    });
    document.body.innerHTML = '';
});

describe('MapTab — the boards that gained coordinates', () => {
    it('puts a pinned need, project and resource on the map', async () => {
        boards.needs = [need({ place: { kind: 'pin', ...SEATTLE } })];
        boards.projects = [project({ place: { kind: 'pin', ...SEATTLE } })];
        boards.resources = [resource({ place: { kind: 'pin', ...SEATTLE } })];
        await render();

        expect(pinFor('need-1')).toMatchObject({ layer: 'needs', ...SEATTLE });
        expect(pinFor('project-1')).toMatchObject({ layer: 'projects' });
        expect(pinFor('resource-1')).toMatchObject({ layer: 'resources' });
    });

    /**
     * "We need a developer" has no location. A pin at 0,0 in the Gulf of Guinea
     * is worse than no pin at all.
     */
    it('leaves placeless records off the map entirely', async () => {
        boards.needs = [need({ id: 'placeless' })];
        boards.projects = [project({ id: 'placeless-project' })];
        await render();

        expect(pinFor('placeless')).toBeUndefined();
        expect(pinFor('placeless-project')).toBeUndefined();
    });

    it('carries an area through as a radius, not a bare dot', async () => {
        boards.resources = [
            resource({
                id: 'mobile',
                name: 'Mobile tool library',
                place: { kind: 'area', ...SEATTLE, radiusMeters: 5000 },
            }),
        ];
        await render();

        // Without the radius the marker reads as an address, and the circle the
        // steward drew never gets rendered.
        expect(pinFor('mobile')).toMatchObject({ radiusMeters: 5000 });
    });

    it('leaves a pin with no radius, so it is drawn as an address', async () => {
        boards.resources = [resource({ place: { kind: 'pin', ...SEATTLE } })];
        await render();
        expect(pinFor('resource-1')?.radiusMeters).toBeUndefined();
    });

    it('describes each pin by what it is and where it stands', async () => {
        boards.needs = [
            need({ kind: 'compost', status: 'claimed', place: { kind: 'pin', ...SEATTLE } }),
        ];
        await render();
        expect(pinFor('need-1')?.subtitle).toBe('Need · compost · claimed');
    });
});
