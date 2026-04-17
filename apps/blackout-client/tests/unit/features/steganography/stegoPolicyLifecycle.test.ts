import { describe, expect, it } from 'vitest';
import {
    applyStegoPolicyLifecycleAction,
    canExecuteStegoPolicyAction,
    DEFAULT_STEGO_ENTERPRISE_POLICY_STATE,
    enforceStegoPolicyConstraints,
} from '../../../../src/app/features/steganography/stegoPolicyLifecycle';

describe('stego enterprise policy lifecycle', () => {
    it('keeps plugin disabled by default so non-stego installs are unaffected', () => {
        expect(DEFAULT_STEGO_ENTERPRISE_POLICY_STATE.enabled).toBe(false);
        const decision = canExecuteStegoPolicyAction(
            DEFAULT_STEGO_ENTERPRISE_POLICY_STATE,
            'activate'
        );
        expect(decision.allowed).toBe(false);
    });

    it('enforces governance and permission envelopes before lifecycle actions', () => {
        const withPlugin = {
            ...DEFAULT_STEGO_ENTERPRISE_POLICY_STATE,
            enabled: true,
        };

        expect(canExecuteStegoPolicyAction(withPlugin, 'activate').allowed).toBe(false);

        const withApprovals = {
            ...withPlugin,
            governance: {
                ...withPlugin.governance,
                approvals: ['@chair:blackout'],
            },
            permission: {
                ...withPlugin.permission,
                scopes: [...withPlugin.permission.scopes, 'stego:policy:suspend'],
            },
        };

        expect(canExecuteStegoPolicyAction(withApprovals, 'activate').allowed).toBe(true);
        expect(canExecuteStegoPolicyAction(withApprovals, 'suspend').allowed).toBe(true);
        expect(canExecuteStegoPolicyAction(withApprovals, 'archive').allowed).toBe(false);
    });

    it('applies lifecycle transitions and emits auditable events', () => {
        const unlocked = {
            ...DEFAULT_STEGO_ENTERPRISE_POLICY_STATE,
            enabled: true,
            governance: {
                ...DEFAULT_STEGO_ENTERPRISE_POLICY_STATE.governance,
                approvals: ['@chair:blackout'],
            },
            permission: {
                ...DEFAULT_STEGO_ENTERPRISE_POLICY_STATE.permission,
                scopes: [
                    ...DEFAULT_STEGO_ENTERPRISE_POLICY_STATE.permission.scopes,
                    'stego:policy:suspend',
                ],
            },
        };

        const { next, audit } = applyStegoPolicyLifecycleAction(
            unlocked,
            'activate',
            'ready for launch',
            new Date('2026-04-17T00:00:00.000Z')
        );

        expect(next.status).toBe('active');
        expect(next.auditLog).toHaveLength(1);
        expect(audit.reason).toBe('ready for launch');
        expect(audit.at).toBe('2026-04-17T00:00:00.000Z');
    });

    it('enforces ephemeral controls from policy constraints', () => {
        const policy = {
            ...DEFAULT_STEGO_ENTERPRISE_POLICY_STATE,
            enabled: true,
        };

        expect(
            enforceStegoPolicyConstraints(policy, {
                ttlHours: 6,
                passphraseLength: 14,
                carrier: 'image',
            }).allowed
        ).toBe(true);

        expect(
            enforceStegoPolicyConstraints(policy, {
                ttlHours: 100,
                passphraseLength: 14,
                carrier: 'image',
            }).allowed
        ).toBe(false);

        expect(
            enforceStegoPolicyConstraints(policy, {
                ttlHours: 6,
                passphraseLength: 8,
                carrier: 'image',
            }).allowed
        ).toBe(false);
    });
});
