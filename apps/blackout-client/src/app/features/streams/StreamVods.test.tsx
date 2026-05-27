// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';

const fetchVodsMock = vi.fn();

vi.mock('./streamsClient', () => ({
    fetchStreamVods: (...args: unknown[]) => fetchVodsMock(...args),
}));

import StreamVods from './StreamVods';

const flush = async () => {
    await Promise.resolve();
    await Promise.resolve();
};

const mount = async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    await act(async () => {
        root.render(<StreamVods streamId="s1" />);
        await flush();
    });
    return container;
};

describe('StreamVods', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        fetchVodsMock.mockReset();
    });

    it('renders nothing when there are no past broadcasts', async () => {
        fetchVodsMock.mockResolvedValue({ items: [] });
        const container = await mount();
        expect(container.querySelector('[data-testid="stream-vods"]')).toBeNull();
    });

    it('renders one item per VOD linking to its replay pointer', async () => {
        fetchVodsMock.mockResolvedValue({
            items: [
                {
                    id: 'v1',
                    streamId: 's1',
                    startedAt: '2026-05-10T12:00:00Z',
                    endedAt: '2026-05-10T13:00:00Z',
                    replayPointer: 'mxc://vod/new',
                    durationSeconds: 3600,
                },
            ],
        });
        const container = await mount();
        const items = container.querySelectorAll('[data-testid="stream-vod-item"]');
        expect(items.length).toBe(1);
        expect(items[0]?.getAttribute('href')).toBe('mxc://vod/new');
        expect(container.textContent).toContain('1h 0m');
    });

    it('stays silent when the fetch fails', async () => {
        fetchVodsMock.mockRejectedValue(new Error('boom'));
        const container = await mount();
        expect(container.querySelector('[data-testid="stream-vods"]')).toBeNull();
    });
});
