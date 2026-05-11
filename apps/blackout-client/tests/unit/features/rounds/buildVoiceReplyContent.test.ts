import { describe, expect, it } from 'vitest';
import { buildVoiceReplyContent } from '../../../../src/app/features/rounds/useRounds';

describe('buildVoiceReplyContent', () => {
    const baseInput = {
        url: 'mxc://example.org/abc123',
        fileName: 'voice-note-12345.webm',
        mimeType: 'audio/webm',
        size: 4096,
        roundEventId: '$round-1',
    };

    it('uses msgtype m.audio so it routes through AudioMessage', () => {
        const content = buildVoiceReplyContent(baseInput);
        expect(content.msgtype).toBe('m.audio');
    });

    it('carries the MSC3245 voice marker so the waveform renderer picks it up', () => {
        const content = buildVoiceReplyContent(baseInput);
        expect(content['org.matrix.msc3245.voice']).toEqual({});
        expect(content['org.matrix.msc1767.audio']).toEqual({});
    });

    it('encodes the mxc upload URL + filename + info', () => {
        const content = buildVoiceReplyContent(baseInput);
        expect(content.url).toBe(baseInput.url);
        expect(content.body).toBe(baseInput.fileName);
        expect(content.info).toEqual({
            mimetype: baseInput.mimeType,
            size: baseInput.size,
        });
    });

    it('threads via m.in_reply_to so collectRoundContributions picks it up', () => {
        const content = buildVoiceReplyContent(baseInput);
        expect(content['m.relates_to']).toEqual({
            'm.in_reply_to': { event_id: baseInput.roundEventId },
        });
    });
});
