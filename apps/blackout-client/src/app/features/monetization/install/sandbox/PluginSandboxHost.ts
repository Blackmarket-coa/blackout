import type { PluginCapability, PluginManifest } from '@blackout/sdk';

/**
 * Host-side controller for a code-plugin sandbox. The sandbox runs the
 * plugin's bundle inside a `srcdoc=""` sandboxed iframe with no DOM
 * access to the host. Communication is exclusively through a typed
 * postMessage RPC. Capabilities declared on the manifest are checked
 * here before any host-side action is dispatched.
 */
export interface SandboxRpcRequest {
    id: number;
    method: string;
    params?: unknown;
}

export interface SandboxRpcResponse {
    id: number;
    result?: unknown;
    error?: { code: string; message: string };
}

export type RpcHandler = (params: unknown) => unknown | Promise<unknown>;

const REQUIRED_CAPABILITY: Record<string, PluginCapability> = {
    'message.compose': 'message.compose',
    'message.read': 'message.read',
    'storage.read': 'storage.read',
    'storage.write': 'storage.write',
    'http.fetch': 'http.fetch',
    'shell.panel.read': 'shell.panel.read',
    'shell.panel.write': 'shell.panel.write',
};

export interface PluginSandboxOptions {
    manifest: PluginManifest;
    bundleBytes: Uint8Array;
    handlers?: Record<string, RpcHandler>;
}

export class PluginSandbox {
    private readonly iframe: HTMLIFrameElement;
    private readonly handlers: Map<string, RpcHandler>;
    private readonly listener: (event: MessageEvent) => void;
    private readonly capabilities: Set<PluginCapability>;
    private destroyed = false;

    constructor(private readonly options: PluginSandboxOptions) {
        this.handlers = new Map(Object.entries(options.handlers ?? {}));
        this.capabilities = new Set(options.manifest.capabilities);
        this.iframe = this.buildIframe();
        this.listener = (event) => this.onMessage(event);
        window.addEventListener('message', this.listener);
    }

    private buildIframe(): HTMLIFrameElement {
        const iframe = document.createElement('iframe');
        iframe.setAttribute('sandbox', 'allow-scripts');
        iframe.setAttribute('aria-hidden', 'true');
        iframe.style.display = 'none';
        iframe.title = `plugin-sandbox-${this.options.manifest.id}`;
        const bundleText = new TextDecoder().decode(this.options.bundleBytes);
        const safeBundle = bundleText
            .replace(/<\/script/g, '<\\/script')
            .replace(/<!--/g, '\\u003c!--');
        const html = `<!doctype html><html><head><meta charset="utf-8"></head><body><script>(function(){
            const sdk = (function(){
                const pending = new Map();
                let nextId = 1;
                function call(method, params){
                    const id = nextId++;
                    return new Promise((resolve, reject) => {
                        pending.set(id, { resolve, reject });
                        parent.postMessage({ kind:'rpc-request', id, method, params }, '*');
                    });
                }
                window.addEventListener('message', (e) => {
                    const data = e.data;
                    if (!data || data.kind !== 'rpc-response') return;
                    const entry = pending.get(data.id);
                    if (!entry) return;
                    pending.delete(data.id);
                    if (data.error) entry.reject(new Error(data.error.message));
                    else entry.resolve(data.result);
                });
                return { call };
            })();
            try { ${safeBundle} } catch (err) {
                parent.postMessage({ kind:'rpc-error', message: String(err && err.message ? err.message : err) }, '*');
            }
        })();<\/script></body></html>`;
        iframe.srcdoc = html;
        document.body.appendChild(iframe);
        return iframe;
    }

    private onMessage(event: MessageEvent): void {
        if (this.destroyed) return;
        if (event.source !== this.iframe.contentWindow) return;
        const data = event.data as SandboxRpcRequest | { kind: string };
        if (!data || (data as { kind?: string }).kind !== 'rpc-request') return;
        const request = data as SandboxRpcRequest;
        void this.dispatch(request);
    }

    private async dispatch(request: SandboxRpcRequest): Promise<void> {
        const required = REQUIRED_CAPABILITY[request.method];
        if (required && !this.capabilities.has(required)) {
            this.respond({
                id: request.id,
                error: { code: 'capability-denied', message: `Missing capability: ${required}` },
            });
            return;
        }
        const handler = this.handlers.get(request.method);
        if (!handler) {
            this.respond({
                id: request.id,
                error: { code: 'unknown-method', message: `No handler for ${request.method}` },
            });
            return;
        }
        try {
            const result = await handler(request.params);
            this.respond({ id: request.id, result });
        } catch (error) {
            this.respond({
                id: request.id,
                error: {
                    code: 'handler-error',
                    message: error instanceof Error ? error.message : String(error),
                },
            });
        }
    }

    private respond(response: SandboxRpcResponse): void {
        if (this.destroyed) return;
        this.iframe.contentWindow?.postMessage({ kind: 'rpc-response', ...response }, '*');
    }

    destroy(): void {
        if (this.destroyed) return;
        this.destroyed = true;
        window.removeEventListener('message', this.listener);
        this.iframe.parentElement?.removeChild(this.iframe);
    }
}
