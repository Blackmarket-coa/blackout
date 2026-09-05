// @vitest-environment jsdom
import React from 'react';
import ReactDOM from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import RelayPath from '../../../../src/app/features/circle-feed/RelayPath';
import type { RelayHopView } from '../../../../src/app/features/circle-feed/circleFeedClient';

const hop = (userId: string, overrides: Partial<RelayHopView> = {}): RelayHopView => ({
    relayId: `relay-${userId}`,
    userId,
    note: null,
    active: true,
    at: '2026-09-01T00:00:00.000Z',
    ...overrides,
});

const mount = async (ui: React.ReactElement) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    await act(async () => {
        ReactDOM.createRoot(container).render(ui);
        await Promise.resolve();
    });
    return container;
};

beforeEach(() => {
    document.body.innerHTML = '';
});

describe('RelayPath', () => {
    it('renders every hop, viewer first, never collapsed to the last relayer', async () => {
        const container = await mount(
            <RelayPath
                hops={[hop('@nearest:s'), hop('@middle:s'), hop('@origin:s')]}
                viewerId="@me:s"
            />
        );
        const text = container.querySelector('[data-testid="relay-path"]')?.textContent ?? '';
        // The whole promise of the feature: all three carriers are named.
        expect(text).toContain('You');
        expect(text).toContain('nearest');
        expect(text).toContain('middle');
        expect(text).toContain('origin');
    });

    it('marks a withdrawn relayer instead of dropping them from the line', async () => {
        const container = await mount(
            <RelayPath hops={[hop('@gone:s', { active: false })]} viewerId="@me:s" />
        );
        const withdrawn = Array.from(container.querySelectorAll('span')).find(
            (el) => el.textContent === 'gone'
        );
        // Still rendered — the item really did travel through them.
        expect(withdrawn).toBeTruthy();
        expect(withdrawn?.getAttribute('title')).toContain('withdrew');
    });

    it('names how many others carried it, rather than hiding them', async () => {
        const container = await mount(
            <RelayPath hops={[hop('@a:s')]} viewerId="@me:s" alsoRelayedByCount={3} />
        );
        expect(container.querySelector('[data-testid="relay-path-also"]')?.textContent).toContain(
            '3'
        );
    });

    it('omits the "+N others" pill when nobody else relayed it', async () => {
        const container = await mount(<RelayPath hops={[hop('@a:s')]} viewerId="@me:s" />);
        expect(container.querySelector('[data-testid="relay-path-also"]')).toBeNull();
    });

    it('opens the full chain when the path is activated', async () => {
        const onOpenChain = vi.fn();
        const container = await mount(
            <RelayPath hops={[hop('@a:s')]} viewerId="@me:s" onOpenChain={onOpenChain} />
        );
        await act(async () => {
            container
                .querySelector('[data-testid="relay-path"]')
                ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            await Promise.resolve();
        });
        expect(onOpenChain).toHaveBeenCalledOnce();
    });
});
