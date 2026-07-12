/**
 * Shared voice-message (MSC3245) helpers.
 *
 * One builder produces the `m.room.message` content for every voice-note
 * surface (main composer, round replies), so the shape — `msgtype:
 * 'm.audio'` + `org.matrix.msc3245.voice` + `org.matrix.msc1767.audio` —
 * can't drift between senders. Optional duration/waveform metadata rides
 * in `org.matrix.msc1767.audio` (and `info.duration`) the way Element
 * clients emit it, so receivers can render a real waveform without
 * downloading the audio first.
 */

/** MSC1767/Element waveform convention: integer amplitudes in 0..1024. */
export const VOICE_WAVEFORM_PEAK = 1024;
/** Bucket count we emit — enough bars for the 420px-wide player. */
export const VOICE_WAVEFORM_BUCKETS = 48;

export interface VoiceNoteMetadata {
    durationMs?: number;
    /** Integer amplitudes, 0..VOICE_WAVEFORM_PEAK. */
    waveform?: number[];
}

/**
 * Bucket raw PCM samples into RMS amplitudes normalized to 0..1024.
 * Pure so it can be unit-tested without WebAudio; `analyzeVoiceNote`
 * feeds it real channel data in the browser.
 */
export const computeWaveformBuckets = (
    samples: ArrayLike<number>,
    buckets = VOICE_WAVEFORM_BUCKETS
): number[] => {
    const total = samples.length;
    if (total === 0 || buckets <= 0) return [];
    const size = Math.max(1, Math.floor(total / buckets));
    const rms: number[] = [];
    for (let b = 0; b < buckets; b += 1) {
        const start = b * size;
        if (start >= total) break;
        const end = Math.min(total, b === buckets - 1 ? total : start + size);
        let sum = 0;
        for (let i = start; i < end; i += 1) {
            const v = samples[i];
            sum += v * v;
        }
        rms.push(Math.sqrt(sum / (end - start)));
    }
    const peak = Math.max(...rms, 0);
    if (peak <= 0) return rms.map(() => 0);
    return rms.map((v) => Math.round((v / peak) * VOICE_WAVEFORM_PEAK));
};

/**
 * Decode a recorded voice note and extract duration + waveform buckets.
 * Best-effort: any failure (no WebAudio in the runtime, undecodable
 * container) resolves to `{}` — metadata is an enhancement, never a
 * reason to block sending.
 */
export const analyzeVoiceNote = async (file: File | Blob): Promise<VoiceNoteMetadata> => {
    try {
        const AudioContextCtor =
            typeof window !== 'undefined'
                ? window.AudioContext ??
                  (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
                : undefined;
        if (!AudioContextCtor) return {};
        const ctx = new AudioContextCtor();
        try {
            const decoded = await ctx.decodeAudioData(await file.arrayBuffer());
            return {
                durationMs: Math.round(decoded.duration * 1000),
                waveform: computeWaveformBuckets(decoded.getChannelData(0)),
            };
        } finally {
            void ctx.close?.().catch(() => undefined);
        }
    } catch {
        return {};
    }
};

export interface VoiceMessageContentInput {
    url: string;
    fileName: string;
    mimeType: string;
    size: number;
    durationMs?: number;
    waveform?: number[];
    replyToEventId?: string;
}

/**
 * Canonical MSC3245 voice-message content. With no metadata and no reply
 * target this emits exactly the legacy round-reply shape (empty
 * `org.matrix.msc1767.audio`, bare `info`), so existing consumers and
 * their tests are unaffected.
 */
export function buildVoiceMessageContent(input: VoiceMessageContentInput): Record<string, unknown> {
    const audioBlock: Record<string, unknown> = {};
    if (typeof input.durationMs === 'number') audioBlock.duration = input.durationMs;
    if (input.waveform && input.waveform.length > 0) audioBlock.waveform = input.waveform;

    const info: Record<string, unknown> = {
        mimetype: input.mimeType,
        size: input.size,
    };
    if (typeof input.durationMs === 'number') info.duration = input.durationMs;

    const content: Record<string, unknown> = {
        msgtype: 'm.audio',
        body: input.fileName,
        url: input.url,
        info,
        // AudioMessage detection: org.matrix.msc3245.voice flags the
        // message as a voice note so the waveform renderer kicks in.
        'org.matrix.msc3245.voice': {},
        'org.matrix.msc1767.audio': audioBlock,
    };
    if (input.replyToEventId) {
        content['m.relates_to'] = {
            'm.in_reply_to': { event_id: input.replyToEventId },
        };
    }
    return content;
}

/**
 * Render-side helper: pull a usable waveform out of event content.
 * Returns bar heights normalized to 0..1 (relative to the tallest bar),
 * or null when the event carries no usable waveform — the caller then
 * falls back to its synthetic placeholder bars.
 */
export const readWaveformHeights = (content: Record<string, unknown>): number[] | null => {
    const audioBlock = content['org.matrix.msc1767.audio'];
    if (typeof audioBlock !== 'object' || audioBlock === null) return null;
    const raw = (audioBlock as { waveform?: unknown }).waveform;
    if (!Array.isArray(raw) || raw.length < 2) return null;
    const values = raw.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
    if (values.length < 2) return null;
    const peak = Math.max(...values, 0);
    if (peak <= 0) return null;
    return values.map((v) => Math.max(0, Math.min(1, v / peak)));
};
