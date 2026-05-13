// @vitest-environment jsdom
import React from 'react';
import ReactDOM from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GovernanceTreasury } from '../../../../src/app/features/governance/GovernanceTreasury';
import type { GovernanceTreasurySnapshotPayload } from '@blackout/protocol';

type SnapshotFetcher = {
    getTreasurySnapshot: ReturnType<typeof vi.fn>;
    listTreasurySnapshots: ReturnType<typeof vi.fn>;
};

const snapshot = (
    overrides: Partial<GovernanceTreasurySnapshotPayload> = {}
): GovernanceTreasurySnapshotPayload => ({
    snapshotId: 'snap-1',
    generatedAt: '2026-05-13T12:00:00.000Z',
    lines: [
        { asset: 'USDC', balance: '12345.678901', delta24h: '+12.34' },
        { asset: 'BTC', balance: '0.50000001', delta24h: '-0.001' },
        { asset: 'XMR', balance: '42.000000000001' },
    ],
    totalReference: { currency: 'USD', amount: '54321.987654321' },
    ...overrides,
});

const createFetcher = (overrides: Partial<SnapshotFetcher> = {}): SnapshotFetcher => ({
    getTreasurySnapshot: vi.fn(async () => snapshot()),
    listTreasurySnapshots: vi.fn(async () => ({ items: [snapshot()] })),
    ...overrides,
});

const mountPage = async (fetcher: SnapshotFetcher) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);

    await act(async () => {
        root.render(
            <GovernanceTreasury
                getTreasurySnapshot={
                    fetcher.getTreasurySnapshot as unknown as React.ComponentProps<
                        typeof GovernanceTreasury
                    >['getTreasurySnapshot']
                }
                listTreasurySnapshots={
                    fetcher.listTreasurySnapshots as unknown as React.ComponentProps<
                        typeof GovernanceTreasury
                    >['listTreasurySnapshots']
                }
            />
        );
        // Allow the initial refresh effect + setState to flush.
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
    });

    return { container, root };
};

beforeEach(() => {
    document.body.innerHTML = '';
});

describe('GovernanceTreasury (BKL-003 Port 2 — snapshot + paginated history)', () => {
    it('renders the empty-state when no snapshot has been published', async () => {
        const fetcher = createFetcher({
            getTreasurySnapshot: vi.fn(async () => {
                throw new Error('no snapshot');
            }),
            listTreasurySnapshots: vi.fn(async () => ({ items: [] })),
        });

        const { container } = await mountPage(fetcher);

        expect(container.querySelector('[data-testid="governance-treasury"]')).toBeTruthy();
        const latest = container.querySelector('[data-testid="governance-treasury-latest"]');
        expect(latest?.textContent).toContain('No treasury snapshot has been published yet.');
        expect(container.textContent).toContain('No history yet.');
    });

    it('renders the latest snapshot total + each line with precision-safe string balances', async () => {
        const fetcher = createFetcher();
        const { container } = await mountPage(fetcher);

        // Total reference renders the exact precision-safe strings — no toFixed
        // or numeric coercion in the rendered output.
        const latest = container.querySelector('[data-testid="governance-treasury-latest"]');
        expect(latest?.textContent).toContain('54321.987654321');
        expect(latest?.textContent).toContain('USD');

        // Each line preserves its full-precision balance and delta24h string.
        const tableText = latest?.textContent ?? '';
        expect(tableText).toContain('USDC');
        expect(tableText).toContain('12345.678901');
        expect(tableText).toContain('+12.34');
        expect(tableText).toContain('BTC');
        expect(tableText).toContain('0.50000001');
        expect(tableText).toContain('-0.001');
        expect(tableText).toContain('XMR');
        expect(tableText).toContain('42.000000000001');
        // Lines without delta24h render the em-dash placeholder.
        expect(tableText).toContain('—');
    });

    it('renders the history list and shows a Load more button only when nextCursor is set', async () => {
        const initialItems = [
            snapshot({ snapshotId: 'snap-a' }),
            snapshot({ snapshotId: 'snap-b', generatedAt: '2026-05-12T12:00:00.000Z' }),
        ];
        const fetcher = createFetcher({
            listTreasurySnapshots: vi.fn(async () => ({
                items: initialItems,
                nextCursor: 'cursor-page-2',
            })),
        });

        const { container } = await mountPage(fetcher);

        expect(
            container.querySelector('[data-testid="governance-treasury-row-snap-a"]')
        ).not.toBeNull();
        expect(
            container.querySelector('[data-testid="governance-treasury-row-snap-b"]')
        ).not.toBeNull();
        expect(
            container.querySelector('[data-testid="governance-treasury-load-more"]')
        ).not.toBeNull();
    });

    it('appends to history and updates the cursor when Load more is clicked', async () => {
        const listMock = vi
            .fn()
            // First call (initial refresh, limit: 10).
            .mockResolvedValueOnce({
                items: [snapshot({ snapshotId: 'snap-page1' })],
                nextCursor: 'cursor-page-2',
            })
            // Second call (Load more, with cursor).
            .mockResolvedValueOnce({
                items: [snapshot({ snapshotId: 'snap-page2' })],
                nextCursor: undefined,
            });

        const fetcher = createFetcher({ listTreasurySnapshots: listMock });
        const { container } = await mountPage(fetcher);

        const loadMore = container.querySelector(
            '[data-testid="governance-treasury-load-more"]'
        ) as HTMLButtonElement;
        expect(loadMore).not.toBeNull();

        await act(async () => {
            loadMore.click();
            await Promise.resolve();
            await Promise.resolve();
        });

        // Both pages now in the DOM.
        expect(
            container.querySelector('[data-testid="governance-treasury-row-snap-page1"]')
        ).not.toBeNull();
        expect(
            container.querySelector('[data-testid="governance-treasury-row-snap-page2"]')
        ).not.toBeNull();

        // Second listTreasurySnapshots call carried the cursor.
        const secondCallArgs = listMock.mock.calls[1][0] as { cursor?: string; limit?: number };
        expect(secondCallArgs.cursor).toBe('cursor-page-2');

        // Load-more disappears once nextCursor is undefined.
        expect(
            container.querySelector('[data-testid="governance-treasury-load-more"]')
        ).toBeNull();
    });

    it('toggles between list and garden view via the role-group buttons', async () => {
        const fetcher = createFetcher();
        const { container } = await mountPage(fetcher);

        const listBtn = container.querySelector(
            '[data-testid="treasury-view-list"]'
        ) as HTMLButtonElement;
        const gardenBtn = container.querySelector(
            '[data-testid="treasury-view-garden"]'
        ) as HTMLButtonElement;

        expect(listBtn.getAttribute('aria-pressed')).toBe('true');
        expect(gardenBtn.getAttribute('aria-pressed')).toBe('false');

        await act(async () => {
            gardenBtn.click();
            await Promise.resolve();
        });

        expect(listBtn.getAttribute('aria-pressed')).toBe('false');
        expect(gardenBtn.getAttribute('aria-pressed')).toBe('true');
    });

    it('surfaces history-load errors via role="alert"', async () => {
        const fetcher = createFetcher({
            listTreasurySnapshots: vi.fn(async () => {
                throw new Error('history unavailable');
            }),
        });

        const { container } = await mountPage(fetcher);

        const alerts = container.querySelectorAll('[role="alert"]');
        const messages = Array.from(alerts).map((el) => el.textContent ?? '');
        expect(messages.some((m) => m.includes('history unavailable'))).toBe(true);
    });
});
