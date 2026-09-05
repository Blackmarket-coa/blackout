// @vitest-environment jsdom
import React from 'react';
import ReactDOM from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchRelayChain = vi.fn();
vi.mock('../../../../src/app/features/circle-feed/circleFeedClient', () => ({
    fetchRelayChain: (...a: unknown[]) => fetchRelayChain(...a),
}));

const { default: RelayChainDialog } = await import(
    '../../../../src/app/features/circle-feed/RelayChainDialog'
);

const hop = (userId: string, overrides: Record<string, unknown> = {}) => ({
    relayId: `relay-${userId}`,
    userId,
    note: null,
    active: true,
    at: '2026-09-01T12:00:00.000Z',
    ...overrides,
});

const mount = async (ui: React.ReactElement) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    await act(async () => {
        ReactDOM.createRoot(container).render(ui);
        await Promise.resolve();
        await Promise.resolve();
    });
    return container;
};

beforeEach(() => {
    document.body.innerHTML = '';
    fetchRelayChain.mockReset();
});

describe('RelayChainDialog', () => {
    it('lists every person in the chain, nearest first', async () => {
        fetchRelayChain.mockResolvedValue({
            path: {
                hops: [hop('@nearest:s'), hop('@origin:s')],
                originAuthorId: '@author:s',
                length: 2,
            },
            subject: null,
            allRelayers: [hop('@nearest:s'), hop('@origin:s')],
        });
        const container = await mount(
            <RelayChainDialog relayId="relay-1" viewerId="@me:s" onClose={vi.fn()} />
        );
        const items = Array.from(container.querySelectorAll('li'));
        expect(items).toHaveLength(2);
        expect(items[0]?.textContent).toContain('nearest');
        expect(container.textContent).toContain('Originally posted by author');
    });

    it('shows a relay note, which is why the chain is worth opening', async () => {
        fetchRelayChain.mockResolvedValue({
            path: {
                hops: [hop('@alice:s', { note: 'relaying because the share is this weekend' })],
                originAuthorId: null,
                length: 1,
            },
            subject: null,
            allRelayers: [hop('@alice:s')],
        });
        const container = await mount(
            <RelayChainDialog relayId="relay-1" viewerId="@me:s" onClose={vi.fn()} />
        );
        expect(container.textContent).toContain('relaying because the share is this weekend');
    });

    it('marks a withdrawn hop rather than omitting it', async () => {
        fetchRelayChain.mockResolvedValue({
            path: { hops: [hop('@gone:s', { active: false })], originAuthorId: null, length: 1 },
            subject: null,
            allRelayers: [hop('@gone:s', { active: false })],
        });
        const container = await mount(
            <RelayChainDialog relayId="relay-1" viewerId="@me:s" onClose={vi.fn()} />
        );
        expect(container.textContent).toContain('withdrew this relay');
    });

    it('names the viewer as "You" when they are in the chain', async () => {
        fetchRelayChain.mockResolvedValue({
            path: { hops: [hop('@me:s')], originAuthorId: null, length: 1 },
            subject: null,
            allRelayers: [hop('@me:s')],
        });
        const container = await mount(
            <RelayChainDialog relayId="relay-1" viewerId="@me:s" onClose={vi.fn()} />
        );
        expect(container.querySelector('li')?.textContent).toContain('You');
    });

    it('reports a failure instead of hanging on "Loading…"', async () => {
        fetchRelayChain.mockRejectedValue(new Error('Could not load the chain'));
        const container = await mount(
            <RelayChainDialog relayId="relay-1" viewerId="@me:s" onClose={vi.fn()} />
        );
        expect(container.textContent).toContain('Could not load the chain');
    });

    it('closes on Escape and on backdrop click', async () => {
        fetchRelayChain.mockResolvedValue({
            path: { hops: [hop('@a:s')], originAuthorId: null, length: 1 },
            subject: null,
            allRelayers: [hop('@a:s')],
        });
        const onClose = vi.fn();
        const container = await mount(
            <RelayChainDialog relayId="relay-1" viewerId="@me:s" onClose={onClose} />
        );

        await act(async () => {
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
            await Promise.resolve();
        });
        expect(onClose).toHaveBeenCalled();

        await act(async () => {
            container.firstElementChild?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            await Promise.resolve();
        });
        expect(onClose.mock.calls.length).toBeGreaterThan(1);
    });
});
