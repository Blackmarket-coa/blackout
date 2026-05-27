// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';

const listClipsMock = vi.fn();

vi.mock('../../streams', () => ({
    listClips: (...args: unknown[]) => listClipsMock(...args),
}));
// ClipViewer pulls in Matrix media helpers; stub it so the directory test
// stays jsdom-self-contained.
vi.mock('./ClipViewer', () => ({
    default: ({ initialClipId }: { initialClipId?: string }) => (
        <div data-testid="stub-clip-viewer" data-initial-clip-id={initialClipId} />
    ),
}));
// The grid resolves `mxc://` thumbnails through the Matrix client; mock both
// the hook and the resolver so the test controls availability without pulling
// in the real matrix-js-sdk media stack.
let matrixClientMock: object | null = null;
vi.mock('../../../hooks/useMatrixClient', () => ({
    useMatrixClientOrNull: () => matrixClientMock,
}));
vi.mock('../../../utils/matrix', () => ({
    mxcUrlToHttp: (_mx: unknown, pointer: string) =>
        `https://media.example/${pointer.replace('mxc://', '')}`,
}));

import ClipsDirectory from './ClipsDirectory';

const flush = async () => {
    await Promise.resolve();
    await Promise.resolve();
};

const mount = async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    await act(async () => {
        root.render(<ClipsDirectory />);
        await flush();
    });
    return { container };
};

const clip = (id: string, overrides: Record<string, unknown> = {}) => ({
    id,
    creatorId: 'creator-1',
    title: `Clip ${id}`,
    mediaPointer: `mxc://blackout/${id}`,
    durationSeconds: 30,
    visibility: 'public',
    tags: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
});

describe('ClipsDirectory', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        listClipsMock.mockReset();
        matrixClientMock = null;
    });

    it('shows the empty state when no clips are returned', async () => {
        listClipsMock.mockResolvedValue({ items: [] });
        const { container } = await mount();
        expect(container.querySelector('[data-testid="clips-directory-empty"]')).not.toBeNull();
    });

    it('renders one card per clip', async () => {
        listClipsMock.mockResolvedValue({ items: [clip('a'), clip('b')] });
        const { container } = await mount();
        const cards = Array.from(
            container.querySelectorAll('[data-testid="clips-directory-card"]')
        );
        expect(cards.map((c) => c.getAttribute('data-clip-id'))).toEqual(['a', 'b']);
    });

    it('opens the viewer at the tapped clip', async () => {
        listClipsMock.mockResolvedValue({ items: [clip('a'), clip('b')] });
        const { container } = await mount();
        const card = container.querySelector<HTMLButtonElement>('[data-clip-id="b"]');
        await act(async () => {
            card?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            await flush();
        });
        const viewer = container.querySelector('[data-testid="stub-clip-viewer"]');
        expect(viewer).not.toBeNull();
        expect(viewer?.getAttribute('data-initial-clip-id')).toBe('b');
    });

    it('resolves mxc:// thumbnails to an image when a Matrix client is available', async () => {
        matrixClientMock = {};
        listClipsMock.mockResolvedValue({
            items: [clip('a', { thumbnailPointer: 'mxc://blackout/thumb-a' })],
        });
        const { container } = await mount();
        const img = container.querySelector<HTMLImageElement>(
            '[data-clip-id="a"] img'
        );
        expect(img).not.toBeNull();
        expect(img?.getAttribute('src')).toBe('https://media.example/blackout/thumb-a');
    });

    it('falls back to a placeholder for mxc:// thumbnails with no Matrix client', async () => {
        matrixClientMock = null;
        listClipsMock.mockResolvedValue({
            items: [clip('a', { thumbnailPointer: 'mxc://blackout/thumb-a' })],
        });
        const { container } = await mount();
        expect(container.querySelector('[data-clip-id="a"] img')).toBeNull();
    });

    it('shows a graceful permission state on 403', async () => {
        const forbidden = Object.assign(new Error('Request failed (403)'), { status: 403 });
        listClipsMock.mockRejectedValue(forbidden);
        const { container } = await mount();
        expect(container.querySelector('[data-testid="clips-directory-forbidden"]')).not.toBeNull();
    });
});
