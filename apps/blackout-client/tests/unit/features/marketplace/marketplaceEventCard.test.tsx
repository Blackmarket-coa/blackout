// @vitest-environment jsdom
import React from 'react';
import ReactDOM from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { describe, expect, it } from 'vitest';
import {
    FBM_BARTER_EVENT_TYPE,
    FBM_CREDITS_EVENT_TYPE,
    FBM_CYCLE_EVENT_TYPE,
    FBM_DISPUTE_EVENT_TYPE,
    FBM_FLASH_SALE_EVENT_TYPE,
    FBM_LEDGER_EVENT_TYPE,
    FBM_LOGISTICS_EVENT_TYPE,
    FBM_ORDER_EVENT_TYPE,
} from '@blackout/protocol';
import {
    normalizeMarketplaceEventContent,
    type NormalizedMarketplaceEvent,
} from '../../../../src/app/features/marketplace/marketplaceEventSchemas';
import { MarketplaceEventCard } from '../../../../src/app/features/marketplace/MarketplaceEventCard';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('normalizeMarketplaceEventContent', () => {
    it('detects an embedded order block', () => {
        const result = normalizeMarketplaceEventContent({
            msgtype: 'm.notice',
            body: 'New order',
            [FBM_ORDER_EVENT_TYPE]: {
                schemaVersion: 1,
                kind: 'created',
                orderId: 'ord_1',
                vendorId: 'v',
                buyerAlias: 'buyer~abc123',
                items: [{ sku: 's', title: 'Kale', qty: 2, priceCents: 300 }],
                totalCents: 600,
                currency: 'USD',
                occurredAt: '2026-05-30T00:00:00Z',
            },
        });
        expect(result?.kind).toBe('order');
        expect(result?.kind === 'order' && result.data.orderId).toBe('ord_1');
    });

    it('detects ledger, dispute, cycle, logistics, flash_sale blocks', () => {
        const cases: Array<[string, Record<string, unknown>, NormalizedMarketplaceEvent['kind']]> =
            [
                [
                    FBM_LEDGER_EVENT_TYPE,
                    {
                        schemaVersion: 1,
                        kind: 'escrow_released',
                        vendorId: 'v',
                        amountMinorUnits: 4200,
                        currency: 'USD',
                        ledgerTxId: 'tx',
                        occurredAt: 'x',
                    },
                    'ledger',
                ],
                [
                    FBM_DISPUTE_EVENT_TYPE,
                    {
                        schemaVersion: 1,
                        disputeId: 'd',
                        vendorId: 'v',
                        status: 'open',
                        occurredAt: 'x',
                    },
                    'dispute',
                ],
                [
                    FBM_CYCLE_EVENT_TYPE,
                    {
                        schemaVersion: 1,
                        kind: 'open',
                        vendorId: 'v',
                        cycleId: 'c',
                        name: 'Spring',
                        occurredAt: 'x',
                    },
                    'cycle',
                ],
                [
                    FBM_LOGISTICS_EVENT_TYPE,
                    {
                        schemaVersion: 1,
                        kind: 'delivered',
                        vendorId: 'v',
                        orderId: 'o',
                        occurredAt: 'x',
                    },
                    'logistics',
                ],
                [
                    FBM_FLASH_SALE_EVENT_TYPE,
                    {
                        schemaVersion: 1,
                        vendorId: 'v',
                        saleId: 's',
                        name: 'Sale',
                        discount: '30%',
                        durationSeconds: 900,
                        endsAt: 'x',
                        occurredAt: 'x',
                    },
                    'flash_sale',
                ],
            ];
        for (const [key, block, expected] of cases) {
            const result = normalizeMarketplaceEventContent({ msgtype: 'm.notice', [key]: block });
            expect(result?.kind, `key ${key}`).toBe(expected);
        }
    });

    it('detects barter and credits blocks', () => {
        const barter = normalizeMarketplaceEventContent({
            msgtype: 'm.notice',
            [FBM_BARTER_EVENT_TYPE]: {
                schemaVersion: 1,
                kind: 'offer_created',
                barterId: 'bt_1',
                vendorId: 'v',
                offered: [{ title: 'Tomatoes', qty: 5 }],
                requested: [{ title: 'Basil', qty: 2 }],
                occurredAt: 'x',
            },
        });
        expect(barter?.kind).toBe('barter');

        const credits = normalizeMarketplaceEventContent({
            msgtype: 'm.notice',
            [FBM_CREDITS_EVENT_TYPE]: {
                schemaVersion: 1,
                kind: 'earned',
                unit: 'xp',
                amount: 50,
                reason: 'Order completed',
                occurredAt: 'x',
            },
        });
        expect(credits?.kind).toBe('credits');
    });

    it('returns null for plain messages and malformed blocks', () => {
        expect(normalizeMarketplaceEventContent({ msgtype: 'm.text', body: 'hi' })).toBeNull();
        expect(normalizeMarketplaceEventContent(null)).toBeNull();
        // wrong shape under the order key → rejected by the guard
        expect(
            normalizeMarketplaceEventContent({ [FBM_ORDER_EVENT_TYPE]: { kind: 'created' } })
        ).toBeNull();
    });
});

describe('MarketplaceEventCard', () => {
    const render = (normalized: NormalizedMarketplaceEvent): string => {
        const container = document.createElement('div');
        const root = ReactDOM.createRoot(container);
        act(() => {
            root.render(<MarketplaceEventCard normalized={normalized} />);
        });
        const text = container.textContent ?? '';
        act(() => root.unmount());
        return text;
    };

    it('renders an order card with ref, alias, and total', () => {
        const text = render({
            kind: 'order',
            data: {
                schemaVersion: 1,
                kind: 'created',
                orderId: 'ord_8f3a',
                vendorId: 'v',
                buyerAlias: 'buyer~abc123',
                items: [{ sku: 's', title: 'Kale', qty: 2, priceCents: 300 }],
                totalCents: 600,
                currency: 'USD',
                occurredAt: 'x',
            },
        });
        expect(text).toContain('8F3A');
        expect(text).toContain('buyer~abc123');
        expect(text).toContain('2× Kale');
        expect(text).toContain('$6.00');
    });

    it('renders a ledger card with the labelled amount', () => {
        const text = render({
            kind: 'ledger',
            data: {
                schemaVersion: 1,
                kind: 'escrow_released',
                vendorId: 'v',
                orderId: 'ord_1',
                amountMinorUnits: 4200,
                currency: 'USD',
                occurredAt: 'x',
            },
        });
        expect(text).toContain('Escrow released');
        expect(text).toContain('$42.00');
    });

    it('renders a barter card with offered and requested items', () => {
        const text = render({
            kind: 'barter',
            data: {
                schemaVersion: 1,
                kind: 'offer_created',
                barterId: 'bt_42',
                vendorId: 'v',
                counterpartyAlias: 'buyer~abc123',
                offered: [{ title: 'Tomatoes', qty: 5 }],
                requested: [{ title: 'Basil', qty: 2 }],
                occurredAt: 'x',
            },
        });
        expect(text).toContain('5× Tomatoes');
        expect(text).toContain('2× Basil');
        expect(text).toContain('buyer~abc123');
    });

    it('renders a credits card with amount, unit, and balance', () => {
        const text = render({
            kind: 'credits',
            data: {
                schemaVersion: 1,
                kind: 'earned',
                unit: 'xp',
                amount: 50,
                reason: 'Order completed',
                balance: 1250,
                occurredAt: 'x',
            },
        });
        expect(text).toContain('Earned 50 XP');
        expect(text).toContain('Order completed');
        expect(text).toContain('1250 XP');
    });

    it('renders a flash-sale card with discount', () => {
        const text = render({
            kind: 'flash_sale',
            data: {
                schemaVersion: 1,
                vendorId: 'v',
                saleId: 's',
                name: 'Tomato blowout',
                discount: '30%',
                durationSeconds: 900,
                endsAt: 'soon',
                occurredAt: 'x',
            },
        });
        expect(text).toContain('Tomato blowout');
        expect(text).toContain('30%');
    });
});
