// @vitest-environment jsdom
import React from 'react';
import ReactDOM from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { StegoLifecyclePage } from '../../../../src/app/features/stego-toolkit';
import type { StegoLifecycleFetcher } from '../../../../src/app/features/stego-toolkit';
import type { StegoChannelSnapshot } from '@blackout/sdk';

const channel = (overrides: Partial<StegoChannelSnapshot> = {}): StegoChannelSnapshot => ({
    channelId: 'ch-1',
    name: 'broadcast',
    audience: 'general',
    carrier: 'image',
    ephemeralMode: 'persistent',
    rotationDays: 14,
    createdAt: '2026-04-30T00:00:00.000Z',
    rotationIndex: 0,
    ...overrides,
});

const setInputValue = (input: HTMLInputElement, value: string) => {
    const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
    )?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
};

const setSelectValue = (select: HTMLSelectElement, value: string) => {
    const setter = Object.getOwnPropertyDescriptor(
        window.HTMLSelectElement.prototype,
        'value'
    )?.set;
    setter?.call(select, value);
    select.dispatchEvent(new Event('change', { bubbles: true }));
};

const mountPage = async (fetcher: StegoLifecycleFetcher) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);

    await act(async () => {
        root.render(<StegoLifecyclePage fetcher={fetcher} />);
        await Promise.resolve();
        await Promise.resolve();
    });

    return { container, root };
};

beforeEach(() => {
    document.body.innerHTML = '';
});

describe('StegoLifecyclePage (BKL-005 finished UI)', () => {
    it('renders empty-state when there are no active channels', async () => {
        const fetcher: StegoLifecycleFetcher = {
            listChannels: vi.fn(async () => ({ channels: [] })),
            rotateChannel: vi.fn(),
            expireChannel: vi.fn(),
        };

        const { container } = await mountPage(fetcher);

        expect(container.querySelector('[data-testid="stego-lifecycle-page"]')).toBeTruthy();
        expect(container.querySelector('[data-testid="stego-lifecycle-empty"]')).toBeTruthy();
    });

    it('hides expired channels from the active list', async () => {
        const fetcher: StegoLifecycleFetcher = {
            listChannels: vi.fn(async () => ({
                channels: [
                    channel({ channelId: 'active', name: 'live' }),
                    channel({
                        channelId: 'gone',
                        name: 'gone',
                        expiredAt: '2026-04-30T00:00:00.000Z',
                        expiryReason: 'operator_revoked',
                    }),
                ],
            })),
            rotateChannel: vi.fn(),
            expireChannel: vi.fn(),
        };

        const { container } = await mountPage(fetcher);
        expect(container.querySelector('[data-testid="stego-lifecycle-row-active"]')).toBeTruthy();
        expect(container.querySelector('[data-testid="stego-lifecycle-row-gone"]')).toBeNull();
    });

    it('blocks rotate when passphrase is empty', async () => {
        const fetcher: StegoLifecycleFetcher = {
            listChannels: vi.fn(async () => ({
                channels: [channel({ channelId: 'active' })],
            })),
            rotateChannel: vi.fn(),
            expireChannel: vi.fn(),
        };

        const { container } = await mountPage(fetcher);
        const rotate = container.querySelector(
            '[data-testid="stego-lifecycle-rotate-active"]'
        ) as HTMLButtonElement;

        await act(async () => {
            rotate.click();
            await Promise.resolve();
        });

        expect(fetcher.rotateChannel).not.toHaveBeenCalled();
        const error = container.querySelector('[data-testid="stego-lifecycle-action-error"]');
        expect(error?.textContent).toContain('passphrase required');
    });

    it('rotates with the entered passphrase and refreshes', async () => {
        const fetcher: StegoLifecycleFetcher = {
            listChannels: vi.fn(async () => ({
                channels: [channel({ channelId: 'active' })],
            })),
            rotateChannel: vi.fn(async () => ({})),
            expireChannel: vi.fn(),
        };

        const { container } = await mountPage(fetcher);
        const passphrase = container.querySelector(
            '[data-testid="stego-lifecycle-passphrase-active"]'
        ) as HTMLInputElement;
        const rotate = container.querySelector(
            '[data-testid="stego-lifecycle-rotate-active"]'
        ) as HTMLButtonElement;

        await act(async () => {
            setInputValue(passphrase, 'next-secret');
            await Promise.resolve();
        });
        await act(async () => {
            rotate.click();
            await Promise.resolve();
            await Promise.resolve();
        });

        expect(fetcher.rotateChannel).toHaveBeenCalledWith('active', { passphrase: 'next-secret' });
        // listChannels: once on mount, once after rotate.
        expect(fetcher.listChannels).toHaveBeenCalledTimes(2);
    });

    it('expires with the selected reason and refreshes', async () => {
        const fetcher: StegoLifecycleFetcher = {
            listChannels: vi.fn(async () => ({
                channels: [channel({ channelId: 'active' })],
            })),
            rotateChannel: vi.fn(),
            expireChannel: vi.fn(async () => ({})),
        };

        const { container } = await mountPage(fetcher);
        const reason = container.querySelector(
            '[data-testid="stego-lifecycle-reason-active"]'
        ) as HTMLSelectElement;
        const expire = container.querySelector(
            '[data-testid="stego-lifecycle-expire-active"]'
        ) as HTMLButtonElement;

        await act(async () => {
            setSelectValue(reason, 'policy_archived');
            await Promise.resolve();
        });
        await act(async () => {
            expire.click();
            await Promise.resolve();
            await Promise.resolve();
        });

        expect(fetcher.expireChannel).toHaveBeenCalledWith('active', { reason: 'policy_archived' });
        expect(fetcher.listChannels).toHaveBeenCalledTimes(2);
    });

    it('renders a load-error region when listChannels rejects', async () => {
        const fetcher: StegoLifecycleFetcher = {
            listChannels: vi.fn(async () => {
                throw new Error('boom');
            }),
            rotateChannel: vi.fn(),
            expireChannel: vi.fn(),
        };

        const { container } = await mountPage(fetcher);
        expect(container.querySelector('[data-testid="stego-lifecycle-load-error"]')?.textContent).toContain(
            'boom'
        );
    });
});
