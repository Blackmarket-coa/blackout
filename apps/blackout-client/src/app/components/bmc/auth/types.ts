import type { ISSOFlow, LoginFlow } from 'matrix-js-sdk/lib/@types/auth';

export type ResolvedHomeserver = {
    /** What the user typed (e.g. "matrix.org" or full URL). */
    rawInput: string;
    /** Server name as a hostname (used for display + mxid construction). */
    serverName: string;
    /** Resolved Matrix client base URL (always includes scheme). */
    baseUrl: string;
};

export type LoginFlowsState = {
    flows: LoginFlow[];
    sso?: ISSOFlow;
    hasPassword: boolean;
    hasToken: boolean;
    discoveryFailed?: boolean;
};

export type AuthTab = 'login' | 'register' | 'reset';
