// @vitest-environment jsdom
import React from 'react';
import ReactDOM from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
    FederationHealthPage,
    RevenueOpsPage,
    TownhallPage,
    type FederationHealthFetcher,
    type RevenueOpsFetcher,
    type TownhallFetcher,
} from '../../../../src/app/features/federated-ops';
import type {
    FederationAlertStatusPayload,
    RevenueOpsSnapshotPayload,
    TownhallLifecyclePayload,
} from '@blackout/sdk';

const setSelectValue = (select: HTMLSelectElement, value: string) => {
    const setter = Object.getOwnPropertyDescriptor(
        window.HTMLSelectElement.prototype,
        'value'
    )?.set;
    setter?.call(select, value);
    select.dispatchEvent(new Event('change', { bubbles: true }));
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

beforeEach(() => {
    document.body.innerHTML = '';
});

describe('FederationHealthPage (BKL-010 finished UI)', () => {
    const alert = (overrides: Partial<FederationAlertStatusPayload> = {}): FederationAlertStatusPayload => ({
        alertId: 'a-1',
        severity: 'info',
        headline: 'baseline',
        publishedAt: '2026-04-30T00:00:00.000Z',
        active: true,
        ...overrides,
    });

    it('orders alerts by severity (critical → warning → info)', async () => {
        const fetcher: FederationHealthFetcher = {
            listAlerts: vi.fn(async () => ({
                alerts: [
                    alert({ alertId: 'i', severity: 'info', headline: 'info-1' }),
                    alert({ alertId: 'c', severity: 'critical', headline: 'critical-1' }),
                    alert({ alertId: 'w', severity: 'warning', headline: 'warning-1' }),
                ],
            })),
            acknowledgeAlert: vi.fn(),
        };

        const { container } = await mount(<FederationHealthPage fetcher={fetcher} />);
        const items = Array.from(
            container.querySelectorAll('[data-testid^="federation-alert-"]')
        );
        expect(items.map((el) => (el as HTMLElement).dataset.severity)).toEqual([
            'critical',
            'warning',
            'info',
        ]);
    });

    it('hides resolved (active=false) alerts', async () => {
        const fetcher: FederationHealthFetcher = {
            listAlerts: vi.fn(async () => ({
                alerts: [
                    alert({ alertId: 'live', active: true }),
                    alert({ alertId: 'gone', active: false }),
                ],
            })),
            acknowledgeAlert: vi.fn(),
        };
        const { container } = await mount(<FederationHealthPage fetcher={fetcher} />);
        expect(container.querySelector('[data-testid="federation-alert-live"]')).toBeTruthy();
        expect(container.querySelector('[data-testid="federation-alert-gone"]')).toBeNull();
    });

    it('acknowledges and removes the alert optimistically', async () => {
        const fetcher: FederationHealthFetcher = {
            listAlerts: vi.fn(async () => ({ alerts: [alert({ alertId: 'a-1' })] })),
            acknowledgeAlert: vi.fn(async () => ({})),
        };
        const { container } = await mount(<FederationHealthPage fetcher={fetcher} />);
        const button = container.querySelector(
            '[data-testid="federation-ack-a-1"]'
        ) as HTMLButtonElement;

        await act(async () => {
            button.click();
            await Promise.resolve();
            await Promise.resolve();
        });

        expect(fetcher.acknowledgeAlert).toHaveBeenCalledWith('a-1');
        expect(container.querySelector('[data-testid="federation-alert-a-1"]')).toBeNull();
    });
});

describe('TownhallPage (BKL-010 finished UI)', () => {
    const townhall = (
        overrides: Partial<TownhallLifecyclePayload> = {}
    ): TownhallLifecyclePayload => ({
        townhallId: 'th-1',
        phase: 'scheduled',
        topic: 'Q1 review',
        occurredAt: '2026-04-30T00:00:00.000Z',
        ...overrides,
    });

    it('renders empty-state when there are no townhalls', async () => {
        const fetcher: TownhallFetcher = {
            listTownhalls: vi.fn(async () => ({ townhalls: [] })),
            transitionTownhall: vi.fn(),
        };
        const { container } = await mount(<TownhallPage fetcher={fetcher} />);
        expect(container.querySelector('[data-testid="townhall-empty"]')).toBeTruthy();
    });

    it('transitions to a non-cancelled phase without a reason', async () => {
        const fetcher: TownhallFetcher = {
            listTownhalls: vi.fn(async () => ({ townhalls: [townhall()] })),
            transitionTownhall: vi.fn(async () => ({})),
        };
        const { container } = await mount(<TownhallPage fetcher={fetcher} />);
        const transition = container.querySelector(
            '[data-testid="townhall-transition-th-1"]'
        ) as HTMLButtonElement;

        await act(async () => {
            transition.click();
            await Promise.resolve();
            await Promise.resolve();
        });

        expect(fetcher.transitionTownhall).toHaveBeenCalledWith('th-1', { phase: 'live' });
    });

    it('reveals a reason input when phase = cancelled and forwards it', async () => {
        const fetcher: TownhallFetcher = {
            listTownhalls: vi.fn(async () => ({ townhalls: [townhall()] })),
            transitionTownhall: vi.fn(async () => ({})),
        };
        const { container } = await mount(<TownhallPage fetcher={fetcher} />);

        const phaseSelect = container.querySelector(
            '[data-testid="townhall-phase-th-1"]'
        ) as HTMLSelectElement;

        await act(async () => {
            setSelectValue(phaseSelect, 'cancelled');
            await Promise.resolve();
        });

        const reason = container.querySelector(
            '[data-testid="townhall-reason-th-1"]'
        ) as HTMLInputElement;
        expect(reason).toBeTruthy();

        // Set a reason via the native setter pattern.
        const setter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype,
            'value'
        )?.set;
        await act(async () => {
            setter?.call(reason, 'venue closed');
            reason.dispatchEvent(new Event('input', { bubbles: true }));
            await Promise.resolve();
        });

        const transition = container.querySelector(
            '[data-testid="townhall-transition-th-1"]'
        ) as HTMLButtonElement;
        await act(async () => {
            transition.click();
            await Promise.resolve();
            await Promise.resolve();
        });

        expect(fetcher.transitionTownhall).toHaveBeenCalledWith('th-1', {
            phase: 'cancelled',
            cancellationReason: 'venue closed',
        });
    });
});

describe('RevenueOpsPage (BKL-010 finished UI)', () => {
    it('renders the latest snapshot + history', async () => {
        const snapshot = (id: string): RevenueOpsSnapshotPayload => ({
            snapshotId: id,
            capturedAt: '2026-04-30T00:00:00.000Z',
            currency: 'USD',
            figures: { gross: '1000', net: '900', refunds: '50', chargebacks: '50' },
        });
        const fetcher: RevenueOpsFetcher = {
            getRevenueSnapshot: vi.fn(async () => snapshot('latest')),
            listRevenueSnapshots: vi.fn(async () => ({
                snapshots: [snapshot('h-1'), snapshot('h-2')],
            })),
        };

        const { container } = await mount(<RevenueOpsPage fetcher={fetcher} />);
        expect(container.querySelector('[data-testid="revenue-ops-latest"]')?.textContent).toContain(
            'gross'
        );
        expect(container.querySelector('[data-testid="revenue-ops-snapshot-h-1"]')).toBeTruthy();
        expect(container.querySelector('[data-testid="revenue-ops-snapshot-h-2"]')).toBeTruthy();
    });

    it('renders an error region when getRevenueSnapshot rejects', async () => {
        const fetcher: RevenueOpsFetcher = {
            getRevenueSnapshot: vi.fn(async () => {
                throw new Error('no snapshot');
            }),
            listRevenueSnapshots: vi.fn(async () => ({ snapshots: [] })),
        };
        const { container } = await mount(<RevenueOpsPage fetcher={fetcher} />);
        expect(
            container.querySelector('[data-testid="revenue-ops-latest-error"]')?.textContent
        ).toContain('no snapshot');
    });
});
