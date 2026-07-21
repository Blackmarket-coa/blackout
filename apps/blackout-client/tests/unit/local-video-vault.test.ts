// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';

import {
    listLocalVideos,
    loadLocalVideoBlob,
    localVideoVaultSupported,
    markLocalVideoPosted,
    removeLocalVideo,
    saveLocalVideo,
} from '../../src/platform/localVideoVault';

const freshIndexedDb = () => {
    // Each test gets an empty vault; fake-indexeddb keeps state per factory.
    Object.defineProperty(globalThis, 'indexedDB', {
        configurable: true,
        value: new IDBFactory(),
    });
};

describe('localVideoVault', () => {
    beforeEach(() => {
        freshIndexedDb();
    });

    afterEach(() => {
        Reflect.deleteProperty(globalThis, 'indexedDB');
    });

    it('reports support when indexedDB exists', () => {
        expect(localVideoVaultSupported()).toBe(true);
    });

    it('saves an original and lists it newest-first without loading bytes', async () => {
        const older = await saveLocalVideo(new Blob(['aaaa'], { type: 'video/mp4' }), {
            title: 'First take',
            filename: 'first.mp4',
            contentType: 'video/mp4',
            durationSeconds: 12,
        });
        // Force distinct savedAt ordering even within the same millisecond.
        await new Promise((resolve) => setTimeout(resolve, 5));
        const newer = await saveLocalVideo(new Blob(['bbbbbb'], { type: 'video/webm' }), {
            title: 'Second take',
            filename: 'second.webm',
            contentType: 'video/webm',
        });

        const entries = await listLocalVideos();
        expect(entries.map((e) => e.id)).toEqual([newer.id, older.id]);
        expect(entries[1]).toMatchObject({
            title: 'First take',
            filename: 'first.mp4',
            contentType: 'video/mp4',
            sizeBytes: 4,
            durationSeconds: 12,
        });
        expect(entries[0].lastPostedAt).toBeUndefined();
    });

    it('round-trips the stored payload', async () => {
        // fake-indexeddb cannot structured-clone jsdom Blobs (browsers store
        // Blobs natively), so exercise the store/load plumbing with a
        // cloneable stand-in carrying the same shape.
        const payload = { size: 14, type: 'video/mp4', marker: 'original-bytes' };
        const saved = await saveLocalVideo(payload as unknown as Blob, {
            title: 'Round trip',
            filename: 'rt.mp4',
            contentType: 'video/mp4',
        });
        const loaded = (await loadLocalVideoBlob(saved.id)) as unknown as typeof payload;
        expect(loaded).not.toBeNull();
        expect(loaded.marker).toBe('original-bytes');
        expect(loaded.size).toBe(14);
    });

    it('returns null for unknown blobs', async () => {
        expect(await loadLocalVideoBlob('nope')).toBeNull();
    });

    it('marks entries as posted', async () => {
        const saved = await saveLocalVideo(new Blob(['x'], { type: 'video/mp4' }), {
            title: 'Posted',
            filename: 'p.mp4',
            contentType: 'video/mp4',
        });
        await markLocalVideoPosted(saved.id);
        const [entry] = await listLocalVideos();
        expect(entry.lastPostedAt).toBeTruthy();
    });

    it('removes an entry and its bytes', async () => {
        const saved = await saveLocalVideo(new Blob(['gone'], { type: 'video/mp4' }), {
            title: 'Gone',
            filename: 'g.mp4',
            contentType: 'video/mp4',
        });
        await removeLocalVideo(saved.id);
        expect(await listLocalVideos()).toEqual([]);
        expect(await loadLocalVideoBlob(saved.id)).toBeNull();
    });
});
