import type { RpcHandler } from './PluginSandboxHost';

/**
 * Default RPC handler map for code-plugin sandboxes. Method names mirror
 * the `REQUIRED_CAPABILITY` keys in `PluginSandboxHost.ts`. Capability
 * gating runs before any handler executes, so a plugin without the
 * declared capability is rejected with `capability-denied` and never
 * reaches the stub. Granted-but-unimplemented calls return a typed
 * `not-implemented` response so plugin authors can detect the host
 * hasn't surfaced the operation yet rather than getting a generic
 * `unknown-method` error.
 */
const notImplemented: RpcHandler = (params) => {
    return {
        ok: false as const,
        reason: 'not-implemented' as const,
        params,
    };
};

export function defaultHandlers(): Record<string, RpcHandler> {
    return {
        'message.read': notImplemented,
        'message.compose': notImplemented,
        'storage.read': notImplemented,
        'storage.write': notImplemented,
        'http.fetch': notImplemented,
        'shell.panel.read': notImplemented,
        'shell.panel.write': notImplemented,
    };
}
