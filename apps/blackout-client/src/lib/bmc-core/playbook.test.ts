import { describe, expect, it } from 'vitest';
import {
    PLAYBOOK_CATALOG,
    PLAYBOOK_IDS,
    isDenPlaybookPayload,
} from '@blackout/protocol';
import {
    PLAYBOOK_PICKER_TABLE,
    createPlaybookPayload,
    phaseFromActivity,
    resolvePlaybookFromPicker,
    type PickerDecisions,
    type PickerResources,
    type PickerSize,
} from './playbook';

const SIZES: readonly PickerSize[] = ['trio', 'small', 'medium', 'constellation'];
const DECISIONS: readonly PickerDecisions[] = [
    'one_trusted',
    'few_elected',
    'all_vote',
    'all_agree',
    'just_hang_out',
];
const RESOURCES: readonly PickerResources[] = ['no_money', 'kitty', 'treasury', 'legal_entity'];

describe('PLAYBOOK_PICKER_TABLE', () => {
    it('covers every one of the 4 * 5 * 4 = 80 picker cells', () => {
        const keys = Object.keys(PLAYBOOK_PICKER_TABLE);
        expect(keys).toHaveLength(80);
    });

    it('every cell resolves to a defined playbook id', () => {
        for (const size of SIZES) {
            for (const decisions of DECISIONS) {
                for (const resources of RESOURCES) {
                    const playbookId = resolvePlaybookFromPicker({ size, decisions, resources });
                    expect(PLAYBOOK_IDS).toContain(playbookId);
                    expect(PLAYBOOK_CATALOG[playbookId]).toBeDefined();
                }
            }
        }
    });

    it('"just_hang_out" always resolves to hearth regardless of size or resources', () => {
        for (const size of SIZES) {
            for (const resources of RESOURCES) {
                expect(
                    resolvePlaybookFromPicker({ size, decisions: 'just_hang_out', resources })
                ).toBe('hearth');
            }
        }
    });

    it('"one_trusted" + legal_entity resolves to order at any non-trio size', () => {
        for (const size of ['small', 'medium', 'constellation'] as const) {
            expect(
                resolvePlaybookFromPicker({
                    size,
                    decisions: 'one_trusted',
                    resources: 'legal_entity',
                })
            ).toBe('order');
        }
    });

    it('constellation + all_agree resolves to stream (liquid-style delegation)', () => {
        for (const resources of RESOURCES) {
            expect(
                resolvePlaybookFromPicker({
                    size: 'constellation',
                    decisions: 'all_agree',
                    resources,
                })
            ).toBe('stream');
        }
    });
});

describe('createPlaybookPayload', () => {
    it('produces a payload that passes the protocol guard for every playbook id', () => {
        const now = new Date('2026-05-10T12:00:00.000Z');
        for (const id of PLAYBOOK_IDS) {
            const payload = createPlaybookPayload(id, now);
            expect(isDenPlaybookPayload(payload)).toBe(true);
            expect(payload.playbookId).toBe(id);
            expect(payload.mode).toBe('trial');
            expect(payload.trialStartedAt).toBe(now.toISOString());
            expect(payload.createdAt).toBe(now.toISOString());
            expect(payload.phase).toBe('spring');
        }
    });

    it('respects field-level overrides', () => {
        const payload = createPlaybookPayload('circle', new Date('2026-05-10T00:00:00Z'), {
            name: 'Tuesday potluck',
            domain: 'shared meals and weeknight care',
            mode: 'committed',
        });
        expect(payload.name).toBe('Tuesday potluck');
        expect(payload.domain).toBe('shared meals and weeknight care');
        expect(payload.mode).toBe('committed');
    });

    it('carries the Grove playbook onboarding credit grant for childcare-pilot readiness', () => {
        const payload = createPlaybookPayload('grove');
        expect(payload.onboardingCreditGrant).toEqual({
            amount: '4',
            currency: 'FBM-HOUR',
        });
    });
});

describe('phaseFromActivity', () => {
    const DAY = 86_400_000;

    it('composted dens always resolve to compost regardless of recency', () => {
        expect(
            phaseFromActivity({ msSinceLastEvent: 0, decisionsLast30d: 5, composted: true })
        ).toBe('compost');
    });

    it('quiet > 42 days resolves to winter (dormant, not dead)', () => {
        expect(
            phaseFromActivity({
                msSinceLastEvent: 60 * DAY,
                decisionsLast30d: 0,
                composted: false,
            })
        ).toBe('winter');
    });

    it('quiet > 14 days resolves to autumn (turning)', () => {
        expect(
            phaseFromActivity({
                msSinceLastEvent: 20 * DAY,
                decisionsLast30d: 0,
                composted: false,
            })
        ).toBe('autumn');
    });

    it('active recent + many decisions resolves to summer', () => {
        expect(
            phaseFromActivity({
                msSinceLastEvent: 1 * DAY,
                decisionsLast30d: 5,
                composted: false,
            })
        ).toBe('summer');
    });

    it('very recent + few decisions resolves to spring', () => {
        expect(
            phaseFromActivity({
                msSinceLastEvent: 2 * 60 * 60 * 1000,
                decisionsLast30d: 0,
                composted: false,
            })
        ).toBe('spring');
    });
});
