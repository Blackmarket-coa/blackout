// @vitest-environment jsdom
import React from 'react';
import ReactDOM from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
    MutualAidPage,
    type MutualAidFetcher,
} from '../../../../src/app/features/deaddrop';
import type { MutualAidThreadPayload } from '@blackout/sdk';

const setInputValue = (input: HTMLInputElement | HTMLTextAreaElement, value: string) => {
    const Proto =
        input instanceof HTMLTextAreaElement
            ? window.HTMLTextAreaElement.prototype
            : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(Proto, 'value')?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
};

const mount = async (ui: React.ReactElement) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    await act(async () => {
        root.render(ui);
        await Promise.resolve();
        await Promise.resolve();
    });
    return { container, root };
};

const thread = (overrides: Partial<MutualAidThreadPayload> = {}): MutualAidThreadPayload => ({
    threadId: 't-1',
    requester: '@a:srv',
    headline: 'Need a ride',
    status: 'open',
    openedAt: '2026-04-30T00:00:00.000Z',
    updatedAt: '2026-04-30T00:00:00.000Z',
    ...overrides,
});

beforeEach(() => {
    document.body.innerHTML = '';
});

describe('MutualAidPage (BKL-013 finished UI)', () => {
    it('hides resolved threads by default and reveals them when toggle flips', async () => {
        const fetcher: MutualAidFetcher = {
            listThreads: vi.fn(async () => ({
                threads: [
                    thread({ threadId: 'live', status: 'open' }),
                    thread({ threadId: 'gone', status: 'resolved' }),
                ],
            })),
            openThread: vi.fn(),
            updateThreadStatus: vi.fn(),
        };
        const { container } = await mount(<MutualAidPage fetcher={fetcher} />);
        expect(container.querySelector('[data-testid="mutual-aid-thread-live"]')).toBeTruthy();
        expect(container.querySelector('[data-testid="mutual-aid-thread-gone"]')).toBeNull();

        const toggle = container.querySelector(
            '[data-testid="mutual-aid-toggle-inactive"]'
        ) as HTMLInputElement;
        await act(async () => {
            toggle.click();
            await Promise.resolve();
        });
        expect(container.querySelector('[data-testid="mutual-aid-thread-gone"]')).toBeTruthy();
    });

    it('blocks open submission with empty headline', async () => {
        const fetcher: MutualAidFetcher = {
            listThreads: vi.fn(async () => ({ threads: [] })),
            openThread: vi.fn(),
            updateThreadStatus: vi.fn(),
        };
        const { container } = await mount(<MutualAidPage fetcher={fetcher} />);
        const form = container.querySelector(
            '[data-testid="mutual-aid-open-form"]'
        ) as HTMLFormElement;

        await act(async () => {
            form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
            await Promise.resolve();
        });

        expect(fetcher.openThread).not.toHaveBeenCalled();
        expect(
            container.querySelector('[data-testid="mutual-aid-action-error"]')?.textContent
        ).toContain('Headline is required');
    });

    it('opens a thread with body when provided and refreshes', async () => {
        const fetcher: MutualAidFetcher = {
            listThreads: vi.fn(async () => ({ threads: [] })),
            openThread: vi.fn(async () => ({})),
            updateThreadStatus: vi.fn(),
        };
        const { container } = await mount(<MutualAidPage fetcher={fetcher} />);

        await act(async () => {
            setInputValue(
                container.querySelector('[data-testid="mutual-aid-headline"]') as HTMLInputElement,
                'Need a ride'
            );
            setInputValue(
                container.querySelector('[data-testid="mutual-aid-body"]') as HTMLTextAreaElement,
                'East side, 6pm'
            );
            await Promise.resolve();
        });

        const form = container.querySelector(
            '[data-testid="mutual-aid-open-form"]'
        ) as HTMLFormElement;
        await act(async () => {
            form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
            await Promise.resolve();
            await Promise.resolve();
        });

        expect(fetcher.openThread).toHaveBeenCalledWith({
            headline: 'Need a ride',
            body: 'East side, 6pm',
        });
        expect(fetcher.listThreads).toHaveBeenCalledTimes(2);
    });

    it('updates a thread status and refreshes', async () => {
        const fetcher: MutualAidFetcher = {
            listThreads: vi.fn(async () => ({
                threads: [thread({ threadId: 'live', status: 'open' })],
            })),
            openThread: vi.fn(),
            updateThreadStatus: vi.fn(async () => ({})),
        };
        const { container } = await mount(<MutualAidPage fetcher={fetcher} />);

        const button = container.querySelector(
            '[data-testid="mutual-aid-status-live-resolved"]'
        ) as HTMLButtonElement;

        await act(async () => {
            button.click();
            await Promise.resolve();
            await Promise.resolve();
        });

        expect(fetcher.updateThreadStatus).toHaveBeenCalledWith('live', 'resolved');
        expect(fetcher.listThreads).toHaveBeenCalledTimes(2);
    });
});
