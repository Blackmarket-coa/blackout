import { describe, expect, it, vi } from 'vitest';
import {
    createExtension,
    isValidBundleUrl,
    isValidExtensionLabel,
    listExtensions,
    updateExtension,
} from './twitchExtensionsClient';

describe('twitchExtensionsClient validators', () => {
    it('accepts 1–120 char labels, rejects empty/oversized', () => {
        expect(isValidExtensionLabel('Sound Alerts')).toBe(true);
        expect(isValidExtensionLabel('   ')).toBe(false);
        expect(isValidExtensionLabel('x'.repeat(121))).toBe(false);
    });

    it('only accepts https bundle URLs', () => {
        expect(isValidBundleUrl('https://cdn.example.com/ext.js')).toBe(true);
        expect(isValidBundleUrl('http://insecure.example.com/ext.js')).toBe(false);
        expect(isValidBundleUrl('not a url')).toBe(false);
        expect(isValidBundleUrl('')).toBe(false);
    });
});

describe('twitchExtensionsClient requests', () => {
    it('routes CRUD through the injected api client with the right method/path', async () => {
        const apiClient = vi.fn().mockResolvedValue({ items: [] });
        await listExtensions({ apiClient });
        expect(apiClient).toHaveBeenCalledWith({ method: 'GET', path: '/v1/streaming/extensions' });

        apiClient.mockResolvedValue({ id: 'p1' });
        await createExtension(
            { label: 'L', bundleUrl: 'https://x/ext.js', capabilities: ['twitch.ext.identityShare'] },
            { apiClient },
        );
        expect(apiClient).toHaveBeenLastCalledWith({
            method: 'POST',
            path: '/v1/streaming/extensions',
            body: { label: 'L', bundleUrl: 'https://x/ext.js', capabilities: ['twitch.ext.identityShare'] },
        });

        await updateExtension('p1', { isActive: false }, { apiClient });
        expect(apiClient).toHaveBeenLastCalledWith({
            method: 'PATCH',
            path: '/v1/streaming/extensions/p1',
            body: { isActive: false },
        });
    });
});
