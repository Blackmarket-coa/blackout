import { describe, expect, it } from 'vitest';
import {
    ALLOWED_BLOB_MIME_TYPES,
    FALLBACK_MIMETYPE,
    getBlobSafeMimeType,
    getFileNameExt,
    getFileNameWithoutExt,
    mimeTypeToExt,
    READABLE_TEXT_MIME_TYPES,
} from '../../../src/app/utils/mimeTypes';

describe('getBlobSafeMimeType', () => {
    it('passes through an allowed type', () => {
        expect(getBlobSafeMimeType('image/png')).toBe('image/png');
    });

    it('drops parameters after the semicolon', () => {
        expect(getBlobSafeMimeType('image/png; charset=utf-8')).toBe('image/png');
    });

    it('rewrites quicktime to mp4 for Chromium', () => {
        expect(getBlobSafeMimeType('video/quicktime')).toBe('video/mp4');
    });

    it('falls back for disallowed or non-string input', () => {
        expect(getBlobSafeMimeType('application/x-msdownload')).toBe(FALLBACK_MIMETYPE);
        expect(getBlobSafeMimeType(123 as unknown as string)).toBe(FALLBACK_MIMETYPE);
    });
});

describe('mimeTypeToExt', () => {
    it('returns the part after the last slash', () => {
        expect(mimeTypeToExt('image/png')).toBe('png');
        expect(mimeTypeToExt('application/x-sh')).toBe('x-sh');
    });
});

describe('getFileNameExt', () => {
    it('returns the trailing extension', () => {
        expect(getFileNameExt('photo.png')).toBe('png');
        expect(getFileNameExt('archive.tar.gz')).toBe('gz');
    });

    it('returns the whole name when there is no dot', () => {
        expect(getFileNameExt('README')).toBe('README');
    });
});

describe('getFileNameWithoutExt', () => {
    it('strips the trailing extension', () => {
        expect(getFileNameWithoutExt('photo.png')).toBe('photo');
        expect(getFileNameWithoutExt('archive.tar.gz')).toBe('archive.tar');
    });

    it('leaves dotfiles and extensionless names intact', () => {
        expect(getFileNameWithoutExt('.bashrc')).toBe('.bashrc');
        expect(getFileNameWithoutExt('README')).toBe('README');
    });
});

describe('mime type tables', () => {
    it('includes common blob types and excludes scripts', () => {
        expect(ALLOWED_BLOB_MIME_TYPES).toContain('image/jpeg');
        expect(ALLOWED_BLOB_MIME_TYPES).not.toContain('application/x-msdownload');
    });

    it('treats plain text and json as readable', () => {
        expect(READABLE_TEXT_MIME_TYPES).toContain('text/plain');
        expect(READABLE_TEXT_MIME_TYPES).toContain('application/json');
    });
});
