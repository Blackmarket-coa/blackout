import { describe, expect, it, vi } from 'vitest';

// The module under test links @ffmpeg/ffmpeg at the top level; stub it so the
// pure argv builder can be imported without wasm/worker machinery.
vi.mock('@ffmpeg/ffmpeg', () => ({ FFmpeg: class {} }));
vi.mock('@ffmpeg/util', () => ({ fetchFile: vi.fn(), toBlobURL: vi.fn() }));

import { buildClipArgs } from './clipTranscode';

describe('buildClipArgs', () => {
    it('trims via stream-copy when no crop is requested', () => {
        const args = buildClipArgs('in.mp4', 'out.mp4', {
            startSeconds: 12,
            endSeconds: 42,
            vertical: false,
        });
        expect(args).toEqual([
            '-ss',
            '12',
            '-i',
            'in.mp4',
            '-t',
            '30',
            '-c',
            'copy',
            '-movflags',
            '+faststart',
            'out.mp4',
        ]);
    });

    it('re-encodes with a centered 9:16 crop when vertical is on', () => {
        const args = buildClipArgs('in.mp4', 'out.mp4', {
            startSeconds: 0,
            endSeconds: 60,
            vertical: true,
        });
        expect(args).toContain('-vf');
        expect(args[args.indexOf('-vf') + 1]).toBe('crop=min(iw\\,ih*9/16):ih');
        // Audio still copies; only video re-encodes.
        expect(args[args.indexOf('-c:a') + 1]).toBe('copy');
        expect(args).not.toContain('copy,-c');
    });

    it('re-encodes a bounded H.264/AAC rendition when compress is on', () => {
        const args = buildClipArgs('in.mp4', 'out.mp4', {
            startSeconds: 0,
            endSeconds: 30,
            vertical: false,
            compress: true,
        });
        expect(args[args.indexOf('-vf') + 1]).toBe('scale=-2:2*trunc(min(720\\,ih)/2)');
        expect(args[args.indexOf('-c:v') + 1]).toBe('libx264');
        expect(args[args.indexOf('-c:a') + 1]).toBe('aac');
        expect(args).not.toContain('copy');
    });

    it('chains the 9:16 crop before the downscale when compress + vertical', () => {
        const args = buildClipArgs('in.mp4', 'out.mp4', {
            startSeconds: 0,
            endSeconds: 30,
            vertical: true,
            compress: true,
        });
        expect(args[args.indexOf('-vf') + 1]).toBe(
            'crop=min(iw\\,ih*9/16):ih,scale=-2:2*trunc(min(1280\\,ih)/2)'
        );
    });

    it('re-encodes with the grade chain when only a filter is set', () => {
        const args = buildClipArgs('in.mp4', 'out.mp4', {
            startSeconds: 0,
            endSeconds: 30,
            vertical: false,
            filter: 'mono',
        });
        expect(args[args.indexOf('-vf') + 1]).toBe('hue=s=0');
        // Audio still stream-copies; only the picture re-encodes.
        expect(args[args.indexOf('-c:a') + 1]).toBe('copy');
    });

    it('chains crop → grade → downscale when everything is on', () => {
        const args = buildClipArgs('in.mp4', 'out.mp4', {
            startSeconds: 0,
            endSeconds: 30,
            vertical: true,
            compress: true,
            filter: 'vivid',
        });
        expect(args[args.indexOf('-vf') + 1]).toBe(
            'crop=min(iw\\,ih*9/16):ih,eq=saturation=1.35:contrast=1.06,scale=-2:2*trunc(min(1280\\,ih)/2)'
        );
    });

    it("treats filter 'none' as a stream-copy trim", () => {
        const args = buildClipArgs('in.mp4', 'out.mp4', {
            startSeconds: 0,
            endSeconds: 30,
            vertical: false,
            filter: 'none',
        });
        expect(args).toContain('copy');
        expect(args).not.toContain('-vf');
    });

    it('never produces a zero or negative duration', () => {
        const args = buildClipArgs('in.mp4', 'out.mp4', {
            startSeconds: 10,
            endSeconds: 10,
            vertical: false,
        });
        expect(Number(args[args.indexOf('-t') + 1])).toBeGreaterThan(0);
    });
});
