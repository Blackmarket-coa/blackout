// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';

import {
    DenHeaderStrip,
    DenSignatureBadge,
    LeadershipGlyph,
    PhenologyBar,
} from '../../../../src/app/components/den-signature';
import type { DenPlaybookPayload } from '@blackout/protocol';

const flush = async () => {
    for (let i = 0; i < 4; i++) {
        await Promise.resolve();
    }
};

const mountTo = async (element: React.ReactElement) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    await act(async () => {
        root.render(element);
        await flush();
    });
    return container;
};

beforeEach(() => {
    document.body.innerHTML = '';
});

describe('DenSignatureBadge', () => {
    it('renders an SVG with an aria-label naming the structure', async () => {
        const container = await mountTo(<DenSignatureBadge shape="palmate" accent="moss" />);
        const badge = container.querySelector('[role="img"]');
        expect(badge).not.toBeNull();
        expect(badge?.getAttribute('aria-label')).toContain('palmate');
        expect(container.querySelector('svg')).not.toBeNull();
    });

    it('falls back to the moss accent when the token is unknown', async () => {
        const container = await mountTo(
            // @ts-expect-error force an unknown token to exercise the fallback
            <DenSignatureBadge shape="flat" accent="not-a-real-accent" />,
        );
        // Still renders an SVG — the badge never crashes on a stale accent.
        expect(container.querySelector('svg')).not.toBeNull();
    });
});

describe('LeadershipGlyph', () => {
    it('renders a stroked glyph for each leadership kind', async () => {
        const kinds = [
            'appointed',
            'elected',
            'rotating',
            'sortition',
            'consent',
            'consensus',
            'majority',
            'liquid',
        ] as const;
        for (const kind of kinds) {
            const container = await mountTo(<LeadershipGlyph kind={kind} />);
            const glyph = container.querySelector('[role="img"]');
            expect(glyph?.getAttribute('aria-label')).toContain(kind);
            expect(container.querySelector('svg')).not.toBeNull();
        }
    });
});

describe('PhenologyBar', () => {
    it('renders five segments and tags the active phase via aria-label', async () => {
        const container = await mountTo(<PhenologyBar phase="autumn" />);
        const bar = container.querySelector('[role="img"]');
        expect(bar?.getAttribute('aria-label')).toMatch(/turning|active|leaf|dormant|composted/i);
        const segments = bar?.querySelectorAll('span');
        expect(segments?.length).toBe(5);
    });
});

describe('DenHeaderStrip', () => {
    const basePayload: DenPlaybookPayload = {
        playbookId: 'circle',
        name: 'Tuesday Potluck',
        structure: 'flat',
        leadership: 'consent',
        phase: 'spring',
        domain: 'shared meals',
        features: {
            governanceActive: true,
            treasury: true,
            rounds: true,
            roles: false,
            voiceNotesOnRounds: false,
            documents: true,
        },
        accent: 'fern',
        mode: 'trial',
        trialStartedAt: '2026-05-01T00:00:00Z',
        createdAt: '2026-05-01T00:00:00Z',
        updatedAt: '2026-05-01T00:00:00Z',
    };

    it('renders strip with playbook name, trial badge, and domain when governance is active', async () => {
        const container = await mountTo(<DenHeaderStrip playbook={basePayload} />);
        const strip = container.querySelector('[aria-label*="Tuesday Potluck signature"]');
        expect(strip).not.toBeNull();
        expect(strip?.textContent).toContain('Tuesday Potluck');
        expect(strip?.textContent).toContain('14-day try');
        expect(strip?.textContent).toContain('shared meals');
    });

    it('renders nothing for casual playbooks (governanceActive=false)', async () => {
        const casual: DenPlaybookPayload = {
            ...basePayload,
            features: { ...basePayload.features, governanceActive: false },
        };
        const container = await mountTo(<DenHeaderStrip playbook={casual} />);
        expect(container.querySelector('[aria-label$="signature"]')).toBeNull();
    });
});
