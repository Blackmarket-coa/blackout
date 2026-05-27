import { describe, expect, it } from 'vitest';
import {
    SOUNDBOARD_MAX_CLIPS,
    addClip,
    parseSoundboard,
    removeClip,
} from '../../../../src/app/features/soundboard/soundboardState';

const clip = (id: string) => ({ id, name: `clip ${id}`, mxc: `mxc://srv/${id}` });

describe('parseSoundboard', () => {
    it('returns [] for missing/invalid content', () => {
        expect(parseSoundboard(undefined)).toEqual([]);
        expect(parseSoundboard({ sounds: 'nope' } as never)).toEqual([]);
    });

    it('keeps only valid, unique clips and caps the count', () => {
        const sounds = [
            clip('a'),
            { id: 'b', name: '', mxc: 'mxc://srv/b' }, // empty name -> dropped
            { id: 'c', name: 'c', mxc: 'http://nope' }, // bad mxc -> dropped
            clip('a'), // dup -> dropped
            clip('d'),
        ];
        expect(parseSoundboard({ sounds }).map((c) => c.id)).toEqual(['a', 'd']);
    });

    it('caps at SOUNDBOARD_MAX_CLIPS', () => {
        const sounds = Array.from({ length: SOUNDBOARD_MAX_CLIPS + 5 }, (_, i) => clip(`s${i}`));
        expect(parseSoundboard({ sounds })).toHaveLength(SOUNDBOARD_MAX_CLIPS);
    });
});

describe('addClip', () => {
    it('appends a valid clip', () => {
        const result = addClip([], clip('a'));
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.clips).toHaveLength(1);
    });

    it('rejects empty name and bad mxc', () => {
        expect(addClip([], { id: 'x', name: '  ', mxc: 'mxc://srv/x' }).ok).toBe(false);
        expect(addClip([], { id: 'x', name: 'x', mxc: 'bad' }).ok).toBe(false);
    });

    it('rejects duplicates and overflow', () => {
        expect(addClip([clip('a')], clip('a')).ok).toBe(false);
        const full = Array.from({ length: SOUNDBOARD_MAX_CLIPS }, (_, i) => clip(`s${i}`));
        expect(addClip(full, clip('new')).ok).toBe(false);
    });
});

describe('removeClip', () => {
    it('removes by id', () => {
        expect(removeClip([clip('a'), clip('b')], 'a').map((c) => c.id)).toEqual(['b']);
    });
});
