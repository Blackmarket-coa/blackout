// @vitest-environment jsdom
import React from 'react';
import ReactDOM from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { StegoToolkitPage } from '../../../../src/app/features/stego-toolkit';
import type { StegoToolkitFetcher } from '../../../../src/app/features/stego-toolkit';
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

const mountPage = async (fetcher: StegoToolkitFetcher) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);

    await act(async () => {
        root.render(<StegoToolkitPage fetcher={fetcher} />);
        // Allow the initial listChannels effect + setState to flush.
        await Promise.resolve();
        await Promise.resolve();
    });

    return { container, root };
};

beforeEach(() => {
    document.body.innerHTML = '';
});

describe('StegoToolkitPage (BKL-005 finished UI)', () => {
    it('renders the empty-state when listChannels returns no channels', async () => {
        const fetcher: StegoToolkitFetcher = {
            listChannels: vi.fn(async () => ({ channels: [] })),
            createChannel: vi.fn(async () => ({})),
        };

        const { container } = await mountPage(fetcher);

        expect(container.querySelector('[data-testid="stego-toolkit-page"]')).toBeTruthy();
        expect(container.querySelector('[data-testid="stego-toolkit-empty"]')).toBeTruthy();
        expect(fetcher.listChannels).toHaveBeenCalled();
    });

    it('renders each channel snapshot with its expiry summary', async () => {
        const fetcher: StegoToolkitFetcher = {
            listChannels: vi.fn(async () => ({
                channels: [
                    channel({ channelId: 'persistent', name: 'broadcast' }),
                    channel({
                        channelId: 'expiring',
                        name: 'flash',
                        ephemeralMode: 'expire_after_hours',
                        ttlHours: 24,
                    }),
                    channel({
                        channelId: 'oneshot',
                        name: 'onetime',
                        ephemeralMode: 'delete_on_read',
                    }),
                ],
            })),
            createChannel: vi.fn(),
        };

        const { container } = await mountPage(fetcher);

        expect(container.querySelector('[data-testid="stego-channel-persistent"]')?.textContent).toContain(
            'Persistent'
        );
        expect(container.querySelector('[data-testid="stego-channel-expiring"]')?.textContent).toContain(
            'Auto-expires'
        );
        expect(container.querySelector('[data-testid="stego-channel-oneshot"]')?.textContent).toContain(
            'Delete on read'
        );
    });

    it('shows an id preview that matches normalizeStegoChannelId as the user types', async () => {
        const fetcher: StegoToolkitFetcher = {
            listChannels: vi.fn(async () => ({ channels: [] })),
            createChannel: vi.fn(),
        };

        const { container } = await mountPage(fetcher);

        const nameInput = container.querySelector(
            '[data-testid="stego-toolkit-create-name"]'
        ) as HTMLInputElement;

        await act(async () => {
            const setter = Object.getOwnPropertyDescriptor(
                window.HTMLInputElement.prototype,
                'value'
            )?.set;
            setter?.call(nameInput, 'Broadcast / General #1');
            nameInput.dispatchEvent(new Event('input', { bubbles: true }));
            await Promise.resolve();
        });

        const preview = container.querySelector('[data-testid="stego-toolkit-create-id-preview"]');
        expect(preview?.textContent).toContain('broadcast-general-1');
    });

    it('blocks submission when name or passphrase is empty', async () => {
        const fetcher: StegoToolkitFetcher = {
            listChannels: vi.fn(async () => ({ channels: [] })),
            createChannel: vi.fn(),
        };

        const { container } = await mountPage(fetcher);

        const form = container.querySelector(
            '[data-testid="stego-toolkit-create-form"]'
        ) as HTMLFormElement;

        // The HTML5 `required` validation will block the submit event before
        // our handler runs, so dispatch via requestSubmit() bypassing the
        // validation to exercise the handler's own guard.
        await act(async () => {
            form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
            await Promise.resolve();
        });

        const error = container.querySelector('[data-testid="stego-toolkit-create-error"]');
        expect(error?.textContent).toContain('Name and passphrase are required.');
        expect(fetcher.createChannel).not.toHaveBeenCalled();
    });

    it('calls createChannel with the right payload and refreshes the list', async () => {
        const created = vi.fn(async () => ({}));
        const list = vi.fn(async () => ({ channels: [] as StegoChannelSnapshot[] }));
        const fetcher: StegoToolkitFetcher = {
            listChannels: list,
            createChannel: created,
        };

        const { container } = await mountPage(fetcher);

        const setValue = (testId: string, value: string) => {
            const input = container.querySelector(`[data-testid="${testId}"]`) as HTMLInputElement;
            const setter = Object.getOwnPropertyDescriptor(
                window.HTMLInputElement.prototype,
                'value'
            )?.set;
            setter?.call(input, value);
            input.dispatchEvent(new Event('input', { bubbles: true }));
        };

        await act(async () => {
            setValue('stego-toolkit-create-name', 'broadcast');
            setValue('stego-toolkit-create-passphrase', 'super-secret');
            await Promise.resolve();
        });

        const form = container.querySelector(
            '[data-testid="stego-toolkit-create-form"]'
        ) as HTMLFormElement;

        await act(async () => {
            form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
            await Promise.resolve();
            await Promise.resolve();
        });

        expect(created).toHaveBeenCalledTimes(1);
        const payload = created.mock.calls[0][0];
        expect(payload.name).toBe('broadcast');
        expect(payload.passphrase).toBe('super-secret');
        expect(payload.carrier).toBe('image');
        expect(payload.ephemeralMode).toBe('persistent');
        expect(payload).not.toHaveProperty('ttlHours'); // persistent strips TTL
        // listChannels is called once on mount + once after create.
        expect(list).toHaveBeenCalledTimes(2);
    });

    it('forwards ttlHours only when ephemeralMode = expire_after_hours', async () => {
        const created = vi.fn(async () => ({}));
        const fetcher: StegoToolkitFetcher = {
            listChannels: vi.fn(async () => ({ channels: [] })),
            createChannel: created,
        };

        const { container } = await mountPage(fetcher);

        const modeSelect = container.querySelector(
            '[data-testid="stego-toolkit-create-mode"]'
        ) as HTMLSelectElement;
        await act(async () => {
            const setter = Object.getOwnPropertyDescriptor(
                window.HTMLSelectElement.prototype,
                'value'
            )?.set;
            setter?.call(modeSelect, 'expire_after_hours');
            modeSelect.dispatchEvent(new Event('change', { bubbles: true }));
            await Promise.resolve();
        });

        const setValue = (testId: string, value: string) => {
            const input = container.querySelector(`[data-testid="${testId}"]`) as HTMLInputElement;
            const setter = Object.getOwnPropertyDescriptor(
                window.HTMLInputElement.prototype,
                'value'
            )?.set;
            setter?.call(input, value);
            input.dispatchEvent(new Event('input', { bubbles: true }));
        };

        await act(async () => {
            setValue('stego-toolkit-create-name', 'flash');
            setValue('stego-toolkit-create-passphrase', 'p');
            setValue('stego-toolkit-create-ttl', '12');
            await Promise.resolve();
        });

        const form = container.querySelector(
            '[data-testid="stego-toolkit-create-form"]'
        ) as HTMLFormElement;

        await act(async () => {
            form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
            await Promise.resolve();
            await Promise.resolve();
        });

        const payload = created.mock.calls[0][0];
        expect(payload.ephemeralMode).toBe('expire_after_hours');
        expect(payload.ttlHours).toBe(12);
    });

    it('renders a load-error region when listChannels rejects', async () => {
        const fetcher: StegoToolkitFetcher = {
            listChannels: vi.fn(async () => {
                throw new Error('boom');
            }),
            createChannel: vi.fn(),
        };

        const { container } = await mountPage(fetcher);

        expect(container.querySelector('[data-testid="stego-toolkit-load-error"]')?.textContent).toContain(
            'boom'
        );
    });
});
