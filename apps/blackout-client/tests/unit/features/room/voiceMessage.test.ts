import { describe, expect, it } from 'vitest';

import {
    buildVoiceMessageContent,
    computeWaveformBuckets,
    readWaveformHeights,
    VOICE_WAVEFORM_BUCKETS,
    VOICE_WAVEFORM_PEAK,
} from '../../../../src/app/features/room/voiceMessage';

describe('computeWaveformBuckets', () => {
    it('returns the requested bucket count with peak normalized to 1024', () => {
        // Two alternating half-second tones: quiet then loud.
        const samples = new Float32Array(4800);
        samples.fill(0.25, 0, 2400);
        samples.fill(1, 2400);
        const buckets = computeWaveformBuckets(samples, 4);
        expect(buckets).toHaveLength(4);
        expect(Math.max(...buckets)).toBe(VOICE_WAVEFORM_PEAK);
        // Quiet half is a quarter of the loud half's amplitude.
        expect(buckets[0]).toBe(VOICE_WAVEFORM_PEAK / 4);
        expect(buckets[3]).toBe(VOICE_WAVEFORM_PEAK);
    });

    it('emits zeros for silence and [] for empty input', () => {
        expect(computeWaveformBuckets(new Float32Array(100), 5)).toEqual([0, 0, 0, 0, 0]);
        expect(computeWaveformBuckets(new Float32Array(0))).toEqual([]);
    });

    it('defaults to VOICE_WAVEFORM_BUCKETS buckets and stays integer-valued', () => {
        const samples = Float32Array.from({ length: 9600 }, (_, i) => Math.sin(i / 7));
        const buckets = computeWaveformBuckets(samples);
        expect(buckets).toHaveLength(VOICE_WAVEFORM_BUCKETS);
        buckets.forEach((v) => {
            expect(Number.isInteger(v)).toBe(true);
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThanOrEqual(VOICE_WAVEFORM_PEAK);
        });
    });

    it('handles fewer samples than buckets without NaN bars', () => {
        const buckets = computeWaveformBuckets(Float32Array.from([0.5, 1]), 8);
        expect(buckets.length).toBeGreaterThan(0);
        buckets.forEach((v) => expect(Number.isFinite(v)).toBe(true));
    });
});

describe('buildVoiceMessageContent', () => {
    const base = {
        url: 'mxc://example.org/abc',
        fileName: 'voice-note-1.webm',
        mimeType: 'audio/webm',
        size: 2048,
    };

    it('emits the exact legacy shape when no metadata is provided', () => {
        expect(buildVoiceMessageContent(base)).toEqual({
            msgtype: 'm.audio',
            body: base.fileName,
            url: base.url,
            info: { mimetype: base.mimeType, size: base.size },
            'org.matrix.msc3245.voice': {},
            'org.matrix.msc1767.audio': {},
        });
    });

    it('carries duration + waveform in both info and the msc1767 block', () => {
        const content = buildVoiceMessageContent({
            ...base,
            durationMs: 3210,
            waveform: [0, 512, 1024],
        });
        expect(content.info).toEqual({
            mimetype: base.mimeType,
            size: base.size,
            duration: 3210,
        });
        expect(content['org.matrix.msc1767.audio']).toEqual({
            duration: 3210,
            waveform: [0, 512, 1024],
        });
    });

    it('adds the reply relation only when a target is given', () => {
        expect(buildVoiceMessageContent(base)['m.relates_to']).toBeUndefined();
        expect(
            buildVoiceMessageContent({ ...base, replyToEventId: '$round-1' })['m.relates_to']
        ).toEqual({ 'm.in_reply_to': { event_id: '$round-1' } });
    });
});

describe('readWaveformHeights', () => {
    it('normalizes transmitted peaks to 0..1 relative heights', () => {
        const heights = readWaveformHeights({
            'org.matrix.msc1767.audio': { waveform: [0, 256, 512, 1024] },
        });
        expect(heights).toEqual([0, 0.25, 0.5, 1]);
    });

    it('returns null for missing, malformed, too-short, or silent waveforms', () => {
        expect(readWaveformHeights({})).toBeNull();
        expect(readWaveformHeights({ 'org.matrix.msc1767.audio': {} })).toBeNull();
        expect(
            readWaveformHeights({ 'org.matrix.msc1767.audio': { waveform: 'nope' } })
        ).toBeNull();
        expect(readWaveformHeights({ 'org.matrix.msc1767.audio': { waveform: [7] } })).toBeNull();
        expect(
            readWaveformHeights({ 'org.matrix.msc1767.audio': { waveform: [0, 0, 0] } })
        ).toBeNull();
    });

    it('drops non-numeric entries but keeps the rest', () => {
        expect(
            readWaveformHeights({
                'org.matrix.msc1767.audio': { waveform: [512, 'x', 1024, null] },
            })
        ).toEqual([0.5, 1]);
    });
});
