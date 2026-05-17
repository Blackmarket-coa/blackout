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

interface SandboxWindow {
    postMessage: (message: unknown, targetOrigin: string) => void;
}

interface PluginSdkGlobal {
    call: <T>(method: string, params?: unknown) => Promise<T>;
}

interface SandboxScope {
    parent: SandboxWindow;
    addEventListener: (
        type: 'message',
        listener: (event: MessageEvent) => void,
    ) => void;
}

declare const window: SandboxScope & { __blackoutPluginSdk?: PluginSdkGlobal };

let cachedSdk: PluginSdkGlobal | null = null;

function getSdk(): PluginSdkGlobal {
    if (cachedSdk) return cachedSdk;
    if (typeof window !== 'undefined' && window.__blackoutPluginSdk) {
        cachedSdk = window.__blackoutPluginSdk;
        return cachedSdk;
    }
    const pending = new Map<
        number,
        { resolve: (value: unknown) => void; reject: (reason: unknown) => void }
    >();
    let nextId = 1;
    if (typeof window !== 'undefined') {
        window.addEventListener('message', (event) => {
            const data = event.data as
                | { kind: string; id: number; result?: unknown; error?: { message: string } }
                | undefined;
            if (!data || data.kind !== 'rpc-response') return;
            const entry = pending.get(data.id);
            if (!entry) return;
            pending.delete(data.id);
            if (data.error) entry.reject(new Error(data.error.message));
            else entry.resolve(data.result);
        });
    }
    cachedSdk = {
        call<T>(method: string, params?: unknown): Promise<T> {
            const id = nextId++;
            return new Promise<T>((resolve, reject) => {
                pending.set(id, {
                    resolve: (value) => resolve(value as T),
                    reject,
                });
                window.parent.postMessage(
                    { kind: 'rpc-request', id, method, params },
                    '*',
                );
            });
        },
    };
    return cachedSdk;
}

export function call<T>(method: PluginCapability | string, params?: unknown): Promise<T> {
    return getSdk().call<T>(method, params);
}

export const messages = {
    read: <T = unknown>(params?: unknown) => call<T>('message.read', params),
    compose: <T = unknown>(params?: unknown) => call<T>('message.compose', params),
};

export const storage = {
    read: <T = unknown>(params?: unknown) => call<T>('storage.read', params),
    write: <T = unknown>(params?: unknown) => call<T>('storage.write', params),
};

export const http = {
    fetch: <T = unknown>(params?: unknown) => call<T>('http.fetch', params),
};

export const panels = {
    read: <T = unknown>(params?: unknown) => call<T>('shell.panel.read', params),
    write: <T = unknown>(params?: unknown) => call<T>('shell.panel.write', params),
};
