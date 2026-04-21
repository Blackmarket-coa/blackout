export const SECURITY_CORE_WORKFLOW_CONTROL_IDS = [
    'matrix_client_arch',
    'homeserver_discovery',
    'e2ee_defaults',
    'oidc_delegated_auth',
    'matrix_bootstrap',
] as const;

export type SecurityWorkflowControlId = (typeof SECURITY_CORE_WORKFLOW_CONTROL_IDS)[number];

export interface SecurityWorkflowControlDefinition {
    id: SecurityWorkflowControlId;
    label: string;
    capabilityKey: `security.${SecurityWorkflowControlId}`;
    description: string;
}

export interface SecurityWorkflowControlState {
    id: SecurityWorkflowControlId;
    executable: boolean;
    enabledByBundle: boolean;
    enabledByCapability: boolean;
    enabledByReleaseGate: boolean;
}

export interface SecurityWorkflowBundleInput {
    securityCoreBundleEnabled: boolean;
    releaseGateClosed: boolean;
    capabilityMap?: Partial<Record<`security.${SecurityWorkflowControlId}`, boolean>>;
}

export interface SecurityWorkflowBundleState {
    bundleEnabled: boolean;
    releaseGateClosed: boolean;
    baselineAuthStable: boolean;
    controls: SecurityWorkflowControlState[];
}

export const SECURITY_CORE_WORKFLOW_CONTROLS: readonly SecurityWorkflowControlDefinition[] = [
    {
        id: 'matrix_client_arch',
        label: 'Matrix client architecture',
        capabilityKey: 'security.matrix_client_arch',
        description: 'Advanced auth client architecture orchestration and lifecycle controls.',
    },
    {
        id: 'homeserver_discovery',
        label: 'Homeserver discovery',
        capabilityKey: 'security.homeserver_discovery',
        description: 'Discovery controls for homeserver metadata and delegated auth resolution.',
    },
    {
        id: 'e2ee_defaults',
        label: 'E2EE defaults',
        capabilityKey: 'security.e2ee_defaults',
        description: 'Secure-by-default encryption profile controls for bootstrap and session setup.',
    },
    {
        id: 'oidc_delegated_auth',
        label: 'OIDC delegated auth',
        capabilityKey: 'security.oidc_delegated_auth',
        description: 'OIDC delegated authentication workflow controls and fallback policy.',
    },
    {
        id: 'matrix_bootstrap',
        label: 'Matrix bootstrap',
        capabilityKey: 'security.matrix_bootstrap',
        description: 'Initial Matrix bootstrap workflow controls and hardened recovery defaults.',
    },
] as const;

export const resolveSecurityWorkflowBundleState = (
    input: SecurityWorkflowBundleInput
): SecurityWorkflowBundleState => {
    const controls: SecurityWorkflowControlState[] = SECURITY_CORE_WORKFLOW_CONTROLS.map((control) => {
        const enabledByCapability = input.capabilityMap?.[control.capabilityKey] ?? false;
        const enabledByBundle = input.securityCoreBundleEnabled;
        const enabledByReleaseGate = input.releaseGateClosed;

        return {
            id: control.id,
            enabledByBundle,
            enabledByCapability,
            enabledByReleaseGate,
            executable: enabledByBundle && enabledByCapability && enabledByReleaseGate,
        };
    });

    return {
        bundleEnabled: input.securityCoreBundleEnabled,
        releaseGateClosed: input.releaseGateClosed,
        baselineAuthStable: true,
        controls,
    };
};
