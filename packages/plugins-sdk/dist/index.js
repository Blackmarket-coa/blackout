export { PLUGINS_PROTOCOL_VERSION, PLUGIN_EVENT_TYPES } from '@blackout/protocol';
let cachedSdk = null;
function getSdk() {
    if (cachedSdk) return cachedSdk;
    if (typeof window !== 'undefined' && window.__blackoutPluginSdk) {
        cachedSdk = window.__blackoutPluginSdk;
        return cachedSdk;
    }
    const pending = new Map();
    let nextId = 1;
    if (typeof window !== 'undefined') {
        window.addEventListener('message', (event) => {
            const data = event.data;
            if (!data || data.kind !== 'rpc-response') return;
            const entry = pending.get(data.id);
            if (!entry) return;
            pending.delete(data.id);
            if (data.error) entry.reject(new Error(data.error.message));
            else entry.resolve(data.result);
        });
    }
    cachedSdk = {
        call(method, params) {
            const id = nextId++;
            return new Promise((resolve, reject) => {
                pending.set(id, {
                    resolve: (value) => resolve(value),
                    reject,
                });
                window.parent.postMessage({ kind: 'rpc-request', id, method, params }, '*');
            });
        },
    };
    return cachedSdk;
}
export function call(method, params) {
    return getSdk().call(method, params);
}
export const messages = {
    read: (params) => call('message.read', params),
    compose: (params) => call('message.compose', params),
};
export const storage = {
    read: (params) => call('storage.read', params),
    write: (params) => call('storage.write', params),
};
export const http = {
    fetch: (params) => call('http.fetch', params),
};
export const panels = {
    read: (params) => call('shell.panel.read', params),
    write: (params) => call('shell.panel.write', params),
};
// Requires the `ai.inference` capability AND an AI den; the host sandbox
// hard-denies this RPC with `{ code: 'ai-denied' }` anywhere else.
export const ai = {
    infer: (params) => call('ai.inference', params),
};
//# sourceMappingURL=index.js.map
