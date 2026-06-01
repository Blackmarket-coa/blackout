// @vitest-environment jsdom
import React from 'react';
import ReactDOM from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { describe, expect, it } from 'vitest';
import type { FbmVendorTrustContent } from '@blackout/protocol';
import { VendorTrustBadgeView } from '../../../../src/app/features/marketplace/VendorTrustBadge';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function trust(overrides: Partial<FbmVendorTrustContent> = {}): FbmVendorTrustContent {
    return {
        schemaVersion: 1,
        vendorId: 'vendor-1',
        verified: true,
        tier: 'verified',
        occurredAt: '2026-05-30T00:00:00Z',
        ...overrides,
    };
}

function render(node: React.ReactElement): { container: HTMLDivElement; root: ReactDOM.Root } {
    const container = document.createElement('div');
    const root = ReactDOM.createRoot(container);
    act(() => {
        root.render(node);
    });
    return { container, root };
}

describe('VendorTrustBadgeView', () => {
    it('labels each tier', () => {
        const cases: Array<[FbmVendorTrustContent['tier'], string]> = [
            ['trusted', 'Trusted vendor'],
            ['verified', 'Verified vendor'],
            ['unverified', 'Unverified vendor'],
            ['flagged', 'Flagged vendor'],
        ];
        for (const [tier, label] of cases) {
            const { container, root } = render(<VendorTrustBadgeView trust={trust({ tier })} />);
            expect(container.textContent).toContain(label);
            act(() => root.unmount());
        }
    });

    it('surfaces completion and dispute rates in the title', () => {
        const { container, root } = render(
            <VendorTrustBadgeView
                trust={trust({ tier: 'trusted', completionRate: 0.98, disputeRate: 0.01 })}
            />
        );
        const span = container.querySelector('span');
        expect(span?.getAttribute('title')).toContain('98% completion');
        expect(span?.getAttribute('title')).toContain('1% disputes');
        act(() => root.unmount());
    });
});
