import { describe, expect, it } from 'vitest';
import { selectRadialActions, type RadialContext } from '@blackout/core';

const labels = (actions: ReturnType<typeof selectRadialActions>) => actions.map((a) => a.label);

describe('selectRadialActions', () => {
    it('returns a slim 4-wedge layout for casual dens (no playbook context)', () => {
        const result = selectRadialActions();
        expect(labels(result)).toEqual(['Message', 'People', 'Settings', 'Search']);
    });

    it('also returns the slim layout when playbookActive is explicitly false', () => {
        const result = selectRadialActions({ playbookActive: false });
        expect(labels(result)).toEqual(['Message', 'People', 'Settings', 'Search']);
    });

    it('includes Propose / Consent / Settings even with minimal flags', () => {
        const result = selectRadialActions({
            playbookActive: true,
            features: { governanceActive: true },
        });
        // governanceActive alone gives Message + People + Propose + Consent + Settings.
        expect(labels(result)).toContain('Propose');
        expect(labels(result)).toContain('Consent');
    });

    it('adds Round when rounds flag is set', () => {
        const result = selectRadialActions({
            playbookActive: true,
            features: { governanceActive: true, rounds: true },
        });
        expect(labels(result)).toContain('Round');
    });

    it('adds Role when roles flag is set', () => {
        const result = selectRadialActions({
            playbookActive: true,
            features: { governanceActive: true, roles: true },
        });
        expect(labels(result)).toContain('Role');
    });

    it('adds Treasury when treasury flag is set', () => {
        const result = selectRadialActions({
            playbookActive: true,
            features: { governanceActive: true, treasury: true },
        });
        expect(labels(result)).toContain('Treasury');
    });

    it('adds Party only when memberCount >= 3', () => {
        const baseCtx: RadialContext = {
            playbookActive: true,
            features: { governanceActive: true },
        };
        expect(labels(selectRadialActions({ ...baseCtx, memberCount: 2 }))).not.toContain('Party');
        expect(labels(selectRadialActions({ ...baseCtx, memberCount: 3 }))).toContain('Party');
    });

    it('pulses Consent wedge when awaitsMe is true', () => {
        const result = selectRadialActions({
            playbookActive: true,
            features: { governanceActive: true },
            awaitsMe: true,
        });
        const consent = result.find((a) => a.label === 'Consent');
        expect(consent?.pulses).toBe(true);
    });

    it('does not pulse Consent when awaitsMe is false', () => {
        const result = selectRadialActions({
            playbookActive: true,
            features: { governanceActive: true },
            awaitsMe: false,
        });
        const consent = result.find((a) => a.label === 'Consent');
        expect(consent?.pulses).toBe(false);
    });

    it('distributes wedge angles evenly around the wheel', () => {
        const result = selectRadialActions({
            playbookActive: true,
            features: { governanceActive: true, rounds: true, roles: true, treasury: true },
        });
        const step = 360 / result.length;
        result.forEach((action, index) => {
            expect(action.angle).toBe(Math.round(index * step));
        });
    });
});
