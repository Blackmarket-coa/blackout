/**
 * Authoring SDK for code-plugin bundles. At runtime the bundle is loaded
 * inside the host's sandboxed iframe (see
 * `apps/blackout-client/src/app/features/monetization/install/sandbox/PluginSandboxHost.ts`).
 * The host bootstraps a tiny IIFE on `window` exposing
 * `parent.postMessage({ kind: 'rpc-request', ... })`; this package is the
 * typed authoring surface that compiles to those calls.
 */
import type { PluginCapability } from '@blackout/protocol';
export type {
    PluginArtifactKind,
    PluginCapability,
    PluginManifest,
    PluginProtocolVersion,
    PluginSignatureEnvelope,
    SignedPluginBundle,
    PluginEventType,
    PluginInstallEvent,
} from '@blackout/protocol';
export { PLUGINS_PROTOCOL_VERSION, PLUGIN_EVENT_TYPES } from '@blackout/protocol';
export declare function call<T>(method: PluginCapability | string, params?: unknown): Promise<T>;
export declare const messages: {
    read: <T = unknown>(params?: unknown) => Promise<T>;
    compose: <T = unknown>(params?: unknown) => Promise<T>;
};
export declare const storage: {
    read: <T = unknown>(params?: unknown) => Promise<T>;
    write: <T = unknown>(params?: unknown) => Promise<T>;
};
export declare const http: {
    fetch: <T = unknown>(params?: unknown) => Promise<T>;
};
export declare const panels: {
    read: <T = unknown>(params?: unknown) => Promise<T>;
    write: <T = unknown>(params?: unknown) => Promise<T>;
};
export declare const ai: {
    infer: <T = unknown>(params?: unknown) => Promise<T>;
};
//# sourceMappingURL=index.d.ts.map
