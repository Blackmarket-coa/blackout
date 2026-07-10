// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';

const fetchVodsMock = vi.fn();
const createClipFromSessionMock = vi.fn();

vi.mock('./streamsClient', () => ({
    fetchStreamVods: (...args: unknown[]) => fetchVodsMock(...args),
    createClipFromSession: (...args: unknown[]) => createClipFromSessionMock(...args),
}));

import StreamVods from './StreamVods';

const flush = async () => {
    await Promise.resolve();
    await Promise.resolve();
};

const mount = async (canClip = false) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    await act(async () => {
        root.render(<StreamVods streamId="s1" canClip={canClip} />);
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

    it('hides the Clip affordance for non-owners', async () => {
        fetchVodsMock.mockResolvedValue({
            items: [{ id: 'v1', streamId: 's1', startedAt: '2026-05-10T12:00:00Z' }],
        });
        const container = await mount(false);
        expect(container.querySelector('[data-testid="stream-vod-clip-toggle"]')).toBeNull();
    });

    it('lets the owner cut a clip from a replay', async () => {
        fetchVodsMock.mockResolvedValue({
            items: [{ id: 'session-1', streamId: 's1', startedAt: '2026-05-10T12:00:00Z' }],
        });
        createClipFromSessionMock.mockResolvedValue({ id: 'clip-1' });
        const container = await mount(true);

        const toggle = container.querySelector<HTMLButtonElement>(
            '[data-testid="stream-vod-clip-toggle"]'
        );
        expect(toggle).not.toBeNull();
        await act(async () => {
            toggle!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
            await flush();
        });

        const form = container.querySelector<HTMLFormElement>(
            '[data-testid="stream-vod-clip-form"]'
        );
        expect(form).not.toBeNull();

        const inputs = form!.querySelectorAll('input');
        const setValue = (input: HTMLInputElement, value: string) => {
            const setter = Object.getOwnPropertyDescriptor(
                window.HTMLInputElement.prototype,
                'value'
            )!.set!;
            setter.call(input, value);
            input.dispatchEvent(new Event('input', { bubbles: true }));
        };
        await act(async () => {
            setValue(inputs[0] as HTMLInputElement, 'Best moment');
            setValue(inputs[1] as HTMLInputElement, '30');
            setValue(inputs[2] as HTMLInputElement, '45');
            await flush();
        });
        await act(async () => {
            form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
            await flush();
        });

        expect(createClipFromSessionMock).toHaveBeenCalledWith('s1', 'session-1', {
            title: 'Best moment',
            startSeconds: 30,
            durationSeconds: 45,
        });
        expect(
            container.querySelector('[data-testid="stream-vod-clip-message"]')?.textContent
        ).toContain('Clip created');
    });
});
