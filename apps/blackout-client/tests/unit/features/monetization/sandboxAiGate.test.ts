// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PluginManifest } from '@blackout/sdk';
import {
    mountSandbox,
    unmountSandbox,
} from '../../../../src/app/features/monetization/install/sandbox/sandboxRegistry';

const STUB_BUNDLE = new TextEncoder().encode('/* noop plugin */');
const PLUGIN_ID = 'ai.plugin';

const manifestWith = (caps: string[]): PluginManifest =>
    ({
        id: PLUGIN_ID,
        version: '0.0.1',
        name: 'ai-stub',
        artifactKind: 'code_plugin',
        listing: { providerId: 'freeblackmarket', providerListingId: 'x' },
        capabilities: caps,
        sha256: 'deadbeef',
    }) as unknown as PluginManifest;

function iframeWindow(): Window {
    const iframe = document.querySelector(
        `iframe[title="plugin-sandbox-${PLUGIN_ID}"]`,
    ) as HTMLIFrameElement;
    return iframe.contentWindow as Window;
}

/** Drive one RPC request into the mounted sandbox and resolve its response. */
async function callRpc(method: string): Promise<{ result?: unknown; error?: { code: string } }> {
    const win = iframeWindow();
    const captured = vi.fn();
    vi.spyOn(win, 'postMessage').mockImplementation((msg: unknown) => captured(msg));
    window.dispatchEvent(
        new MessageEvent('message', {
            source: win,
            data: { kind: 'rpc-request', id: 1, method, params: {} },
        }),
    );
    await Promise.resolve();
    await Promise.resolve();
    const response = captured.mock.calls.at(-1)?.[0] as
        | { result?: unknown; error?: { code: string } }
        | undefined;
    return response ?? {};
}

describe('sandbox AI runtime gate', () => {
    afterEach(() => {
        unmountSandbox(PLUGIN_ID);
        document.body.innerHTML = '';
        vi.restoreAllMocks();
    });

    it('hard-denies ai.inference when the den does not permit AI (aiAllowed=false)', async () => {
        mountSandbox(manifestWith(['ai.inference']), STUB_BUNDLE, ['ai.inference'], false);
        const res = await callRpc('ai.inference');
        expect(res.error?.code).toBe('ai-denied');
    });

    it('allows ai.inference through to the handler in an AI den (aiAllowed=true)', async () => {
        mountSandbox(manifestWith(['ai.inference']), STUB_BUNDLE, ['ai.inference'], true);
        const res = await callRpc('ai.inference');
        // Reaches the (unimplemented) handler rather than being gated.
        expect(res.error?.code).not.toBe('ai-denied');
        expect(res.result).toMatchObject({ ok: false, reason: 'not-implemented' });
    });

    it('still capability-denies ai.inference when the capability was not granted', async () => {
        mountSandbox(manifestWith([]), STUB_BUNDLE, [], true);
        const res = await callRpc('ai.inference');
        expect(res.error?.code).toBe('capability-denied');
    });
});
