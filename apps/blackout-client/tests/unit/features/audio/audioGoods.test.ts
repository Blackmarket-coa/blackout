// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
    BUILTIN_VOICE_FILTERS,
    buildVoiceFilterChain,
    presetHasEffect,
    VOICE_FILTER_NONE,
} from '../../../../src/app/features/audio/voiceFilter';
import { parseOwnedSoundPack } from '../../../../src/app/features/audio/soundPackGoods';

/** Minimal fake AudioContext that records node creation + connections. */
function fakeContext() {
    const connections: Array<[string, string]> = [];
    let counter = 0;
    const node = (kind: string) => {
        const id = `${kind}-${(counter += 1)}`;
        return {
            id,
            type: '',
            frequency: { value: 0 },
            gain: { value: 0 },
            curve: null as Float32Array | null,
            connect(target: { id: string }) {
                connections.push([id, target.id]);
            },
        };
    };
    return {
        connections,
        createBiquadFilter: () => node('biquad'),
        createGain: () => node('gain'),
        createWaveShaper: () => node('shaper'),
    } as unknown as BaseAudioContext & { connections: Array<[string, string]> };
}

describe('voice filter', () => {
    it('None is a passthrough (no effect)', () => {
        expect(presetHasEffect(VOICE_FILTER_NONE)).toBe(false);
        const ctx = fakeContext();
        const { input, output } = buildVoiceFilterChain(ctx, VOICE_FILTER_NONE);
        expect(input).toBe(output);
    });

    it('telephone wires highpass → lowpass → distortion in series', () => {
        const telephone = BUILTIN_VOICE_FILTERS.find((p) => p.id === 'telephone')!;
        expect(presetHasEffect(telephone)).toBe(true);
        const ctx = fakeContext() as ReturnType<typeof fakeContext>;
        const { input, output } = buildVoiceFilterChain(ctx, telephone);
        expect(input).not.toBe(output);
        // 3 params (highpass, lowpass, distortion) → 2 connections in the chain.
        expect(ctx.connections.length).toBe(2);
    });
});

describe('parseOwnedSoundPack', () => {
    it('parses a soundboard pack and rejects clips with bad URLs', () => {
        const pack = parseOwnedSoundPack({
            soundKind: 'soundboard',
            id: 'airhorn',
            name: 'Airhorn',
            clips: [
                { id: 'a', name: 'Air', url: 'https://cdn.example/a.mp3' },
                { id: 'b', name: 'Bad', url: 'javascript:alert(1)' },
            ],
        });
        expect(pack?.clips).toHaveLength(1);
        expect(pack?.clips?.[0].id).toBe('a');
    });

    it('parses a voice_filter pack into a preset and clamps params', () => {
        const pack = parseOwnedSoundPack({
            soundKind: 'voice_filter',
            id: 'chipmunk',
            name: 'Chipmunk',
            highpassHz: 50,
            gainDb: 999,
            distortion: 5,
        });
        expect(pack?.voiceFilter?.id).toBe('chipmunk');
        expect(pack?.voiceFilter?.gainDb).toBe(24); // clamped
        expect(pack?.voiceFilter?.distortion).toBe(1); // clamped
    });

    it('rejects unknown sound kinds and empty soundboards', () => {
        expect(parseOwnedSoundPack({ soundKind: 'nope', id: 'x' })).toBeNull();
        expect(parseOwnedSoundPack({ soundKind: 'soundboard', id: 'x', name: 'X', clips: [] })).toBeNull();
    });
});
