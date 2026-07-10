import { describe, expect, it, vi } from 'vitest';

// The module under test links @ffmpeg/ffmpeg at the top level; stub it so the
// pure argv builder can be imported without wasm/worker machinery.
vi.mock('@ffmpeg/ffmpeg', () => ({ FFmpeg: class {} }));
vi.mock('@ffmpeg/util', () => ({ fetchFile: vi.fn() }));
vi.mock('@ffmpeg/core?url', () => ({ default: 'core.js' }));
vi.mock('@ffmpeg/core/wasm?url', () => ({ default: 'core.wasm' }));

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

    it('never produces a zero or negative duration', () => {
        const args = buildClipArgs('in.mp4', 'out.mp4', {
            startSeconds: 10,
            endSeconds: 10,
            vertical: false,
        });
        expect(Number(args[args.indexOf('-t') + 1])).toBeGreaterThan(0);
    });
});
