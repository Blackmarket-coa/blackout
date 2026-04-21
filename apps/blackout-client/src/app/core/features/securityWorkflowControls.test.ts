import { describe, expect, it } from 'vitest';
import {
    resolveSecurityWorkflowBundleState,
    SECURITY_CORE_WORKFLOW_CONTROL_IDS,
    SECURITY_CORE_WORKFLOW_CONTROLS,
} from './securityWorkflowControls';

const fullCapabilityMap = Object.fromEntries(
    SECURITY_CORE_WORKFLOW_CONTROLS.map((control) => [control.capabilityKey, true])
);

describe('security workflow bundle controls', () => {
    it('keeps baseline auth/session flows stable when premium bundle is disabled', () => {
        const state = resolveSecurityWorkflowBundleState({
            securityCoreBundleEnabled: false,
            releaseGateClosed: true,
            capabilityMap: fullCapabilityMap,
        });

        expect(state.baselineAuthStable).toBe(true);
        expect(state.bundleEnabled).toBe(false);
        expect(state.controls.every((control) => !control.executable)).toBe(true);
        expect(state.controls.map((control) => control.id)).toEqual(SECURITY_CORE_WORKFLOW_CONTROL_IDS);
        expect(state.controls.map((control) => control.id)).toContain('matrix_client_arch');
        expect(state.controls.map((control) => control.id)).toContain('homeserver_discovery');
        expect(state.controls.map((control) => control.id)).toContain('e2ee_defaults');
        expect(state.controls.map((control) => control.id)).toContain('matrix_bootstrap');
    });

    it('makes all security-core controls executable only when bundle and gate are enabled', () => {
        const state = resolveSecurityWorkflowBundleState({
            securityCoreBundleEnabled: true,
            releaseGateClosed: true,
            capabilityMap: fullCapabilityMap,
        });

        expect(state.controls.every((control) => control.executable)).toBe(true);
        expect(state.controls.every((control) => control.enabledByCapability)).toBe(true);
    });

    it('enforces capability + release gate checks for on/off behavior', () => {
        const state = resolveSecurityWorkflowBundleState({
            securityCoreBundleEnabled: true,
            releaseGateClosed: false,
            capabilityMap: {
                ...fullCapabilityMap,
                'security.oidc_delegated_auth': false,
            },
        });

        const oidcControl = state.controls.find((control) => control.id === 'oidc_delegated_auth');
        expect(oidcControl).toEqual({
            id: 'oidc_delegated_auth',
            executable: false,
            enabledByBundle: true,
            enabledByCapability: false,
            enabledByReleaseGate: false,
        });

        expect(state.controls.every((control) => !control.executable)).toBe(true);
    });
});
