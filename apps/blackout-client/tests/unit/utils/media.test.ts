import { describe, expect, it, vi } from 'vitest';
import type { MatrixClient, MatrixEvent } from 'matrix-js-sdk';
import { mxcToUrl, getThumbnailUrl, uploadMedia, getMediaInfo } from '../../../src/app/utils/media';

describe('media utils', () => {
    it('mxcToUrl converts mxc URI to media URL', () => {
        expect(mxcToUrl('mxc://matrix.org/abc123', 'https://hs.example.org')).toBe(
            'https://hs.example.org/_matrix/media/v3/download/matrix.org/abc123',
        );
        expect(mxcToUrl('mxc://matrix.org/abc123', 'https://hs.example.org/')).toBe(
            'https://hs.example.org/_matrix/media/v3/download/matrix.org/abc123',
        );
    });

    it('mxcToUrl returns null for invalid URIs', () => {
        expect(mxcToUrl('https://not-mxc.org/foo', 'https://hs.example.org')).toBeNull();
        expect(mxcToUrl('mxc://', 'https://hs.example.org')).toBeNull();
    });

    it('getThumbnailUrl builds thumbnail endpoint URL', () => {
        const url = getThumbnailUrl('mxc://matrix.org/abc123', 320, 240, 'https://hs.example.org');
        expect(url).toBe(
            'https://hs.example.org/_matrix/media/v3/thumbnail/matrix.org/abc123?width=320&height=240&method=scale',
        );
    });

    it('getThumbnailUrl returns null for invalid mxc', () => {
        expect(getThumbnailUrl('not-mxc', 320, 240, 'https://hs.example.org')).toBeNull();
    });

    it('uploadMedia uploads file and returns MXC URI', async () => {
        const mx = {
            uploadContent: vi.fn().mockResolvedValue({ content_uri: 'mxc://matrix.org/uploaded' }),
        } as unknown as MatrixClient;

        const file = new File(['data'], 'photo.png', { type: 'image/png' });
        const result = await uploadMedia(mx, file);

        expect(result).toBe('mxc://matrix.org/uploaded');
        expect(mx.uploadContent).toHaveBeenCalledWith(file, {
            includeFilename: true,
            name: 'photo.png',
            type: 'image/png',
        });
    });

    it('uploadMedia throws when content_uri is missing', async () => {
        const mx = {
            uploadContent: vi.fn().mockResolvedValue({}),
        } as unknown as MatrixClient;

        await expect(uploadMedia(mx, new File([''], 'f.txt'))).rejects.toThrow('no content_uri');
    });

    it('getMediaInfo extracts metadata from media event', () => {
        const event = {
            getContent: () => ({
                info: { mimetype: 'image/jpeg', size: 1024, w: 800, h: 600 },
            }),
        } as unknown as MatrixEvent;

        expect(getMediaInfo(event)).toEqual({
            mimetype: 'image/jpeg',
            size: 1024,
            width: 800,
            height: 600,
        });
    });

    it('getMediaInfo returns undefined fields when info block is missing', () => {
        const event = {
            getContent: () => ({}),
        } as unknown as MatrixEvent;

        expect(getMediaInfo(event)).toEqual({
            mimetype: undefined,
            size: undefined,
            width: undefined,
            height: undefined,
        });
    });
});
