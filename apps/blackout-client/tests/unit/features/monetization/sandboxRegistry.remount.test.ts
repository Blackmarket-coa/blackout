// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import type { PluginManifest } from '@blackout/sdk';
import {
    getSandbox,
    mountSandbox,
    unmountSandbox,
} from '../../../../src/app/features/monetization/install/sandbox/sandboxRegistry';

const STUB_BUNDLE = new TextEncoder().encode('/* noop plugin */');

const baseManifest = (id: string): PluginManifest =>
    ({
        id,
        version: '0.0.1',
        protocol: 1,
        name: 'stub',
        artifact: { kind: 'code', sha256: 'deadbeef' },
        capabilities: [],
        signature: { algorithm: 'hmac-sha256', publisher: 'test', signature: 'x' },
    }) as unknown as PluginManifest;

const iframeCount = (id: string) =>
    document.querySelectorAll(`iframe[title="plugin-sandbox-${id}"]`).length;

describe('mountSandbox: build-before-destroy', () => {
    afterEach(() => {
        unmountSandbox('test.plugin');
        document.body.innerHTML = '';
    });

    it('does not leave the host without a sandbox between successive mount calls', () => {
        const manifest = baseManifest('test.plugin');
        const first = mountSandbox(manifest, STUB_BUNDLE, []);
        expect(getSandbox('test.plugin')).toBe(first);
        expect(iframeCount('test.plugin')).toBe(1);

        const second = mountSandbox(manifest, STUB_BUNDLE, []);
        expect(second).not.toBe(first);
        // After remount only the newly-built sandbox remains; the previous
        // one has been destroyed (its iframe removed from the DOM).
        expect(getSandbox('test.plugin')).toBe(second);
        expect(iframeCount('test.plugin')).toBe(1);
    });

    it('keeps the previous sandbox alive when build throws', () => {
        const manifest = baseManifest('test.plugin');
        const first = mountSandbox(manifest, STUB_BUNDLE, []);
        expect(iframeCount('test.plugin')).toBe(1);

        // Force buildSandbox -> PluginSandbox constructor to throw by
        // feeding a manifest the constructor can't decode. The capability
        // intersection logic reads .capabilities; passing a non-array
        // surfaces a TypeError before the iframe is built.
        const broken = { ...manifest, capabilities: null } as unknown as PluginManifest;
        expect(() => mountSandbox(broken, STUB_BUNDLE, [])).toThrow();

        // Previous sandbox still registered, still has its iframe.
        expect(getSandbox('test.plugin')).toBe(first);
        expect(iframeCount('test.plugin')).toBe(1);
    });
});
