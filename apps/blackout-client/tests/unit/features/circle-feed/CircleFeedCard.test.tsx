// @vitest-environment jsdom
import React from 'react';
import ReactDOM from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const relayItem = vi.fn();
const withdrawRelay = vi.fn();
vi.mock('../../../../src/app/features/circle-feed/circleFeedClient', () => ({
    relayItem: (...a: unknown[]) => relayItem(...a),
    withdrawRelay: (...a: unknown[]) => withdrawRelay(...a),
}));

const { default: CircleFeedCard } = await import(
    '../../../../src/app/features/circle-feed/CircleFeedCard'
);
type Item = Parameters<typeof CircleFeedCard>[0]['item'];

const item = (overrides: Partial<Item> = {}): Item =>
    ({
        key: 'coalition_feed:item-1',
        ring: 'reach',
        at: '2026-09-01T00:00:00.000Z',
        subject: {
            source: 'coalition_feed',
            id: 'item-1',
            title: 'Produce share',
            body: 'Saturday morning.',
            authorId: '@author:s',
            createdAt: '2026-09-01T00:00:00.000Z',
            mediaUrl: null,
            tags: [],
        },
        path: {
            hops: [
                {
                    relayId: 'relay-1',
                    userId: '@alice:s',
                    note: null,
                    active: true,
                    at: '2026-09-01T00:00:00.000Z',
                },
            ],
            originAuthorId: '@author:s',
            length: 1,
        },
        alsoRelayedBy: [],
        ...overrides,
    } as Item);

const mount = async (ui: React.ReactElement) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    await act(async () => {
        ReactDOM.createRoot(container).render(ui);
        await Promise.resolve();
    });
    return container;
};

const click = async (el: Element | null) => {
    await act(async () => {
        el?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await Promise.resolve();
        await Promise.resolve();
    });
};

beforeEach(() => {
    document.body.innerHTML = '';
    relayItem.mockReset().mockResolvedValue({ relay: { id: 'new-relay' } });
    withdrawRelay.mockReset().mockResolvedValue({ relay: { id: 'relay-1' } });
});

describe('CircleFeedCard', () => {
    it('shows the subject and which ring delivered it', async () => {
        const container = await mount(<CircleFeedCard item={item()} viewerId="@me:s" />);
        expect(container.textContent).toContain('Produce share');
        expect(
            container.querySelector('[data-testid="circle-feed-card"]')?.getAttribute('data-ring')
        ).toBe('reach');
    });

    it('relays via the edge the viewer actually saw it through', async () => {
        const container = await mount(<CircleFeedCard item={item()} viewerId="@me:s" />);
        await click(container.querySelector('[data-testid="circle-feed-relay"]'));

        // viaRelayId is what keeps the next person's chain truthful.
        expect(relayItem).toHaveBeenCalledWith(
            expect.objectContaining({ subjectId: 'item-1', viaRelayId: 'relay-1' })
        );
    });

    it('carries the relay note when one is written', async () => {
        const container = await mount(<CircleFeedCard item={item()} viewerId="@me:s" />);
        const input = container.querySelector('input') as HTMLInputElement;
        await act(async () => {
            const setter = Object.getOwnPropertyDescriptor(
                window.HTMLInputElement.prototype,
                'value'
            )?.set;
            setter?.call(input, 'relaying because—');
            input.dispatchEvent(new Event('input', { bubbles: true }));
            await Promise.resolve();
        });
        await click(container.querySelector('[data-testid="circle-feed-relay"]'));
        expect(relayItem).toHaveBeenCalledWith(
            expect.objectContaining({ note: 'relaying because—' })
        );
    });

    it('withdraws an existing relay instead of minting a second one', async () => {
        const container = await mount(
            <CircleFeedCard item={item()} viewerId="@me:s" myRelayId="mine-1" />
        );
        const button = container.querySelector('[data-testid="circle-feed-relay"]');
        expect(button?.getAttribute('aria-pressed')).toBe('true');

        await click(button);
        expect(withdrawRelay).toHaveBeenCalledWith('mine-1');
        expect(relayItem).not.toHaveBeenCalled();
    });

    it('keeps the chain visible when the subject can no longer be loaded', async () => {
        const container = await mount(
            <CircleFeedCard item={item({ subject: null })} viewerId="@me:s" />
        );
        // The relay that carried it is real even when the post is gone.
        expect(
            container.querySelector('[data-testid="circle-feed-card-unavailable"]')
        ).not.toBeNull();
        expect(container.querySelector('[data-testid="relay-path"]')).not.toBeNull();
        // Nothing to relay onward, so no Boost control.
        expect(container.querySelector('[data-testid="circle-feed-relay"]')).toBeNull();
    });

    it('surfaces a failed relay rather than silently doing nothing', async () => {
        relayItem.mockRejectedValueOnce(new Error('network is down'));
        const container = await mount(<CircleFeedCard item={item()} viewerId="@me:s" />);
        await click(container.querySelector('[data-testid="circle-feed-relay"]'));
        expect(container.textContent).toContain('network is down');
    });
});
