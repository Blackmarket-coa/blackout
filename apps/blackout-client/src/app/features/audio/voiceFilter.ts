/**
 * Voice-filter DSP (Workstream 2). A preset is a small set of Web Audio
 * parameters; `buildVoiceFilterChain` wires the corresponding node graph and
 * `applyVoiceFilter` runs a live MediaStream's audio track through it, returning
 * a new stream (filtered audio + the original video tracks) suitable for
 * publishing to the call. Purchased `sound_pack` items of kind `voice_filter`
 * extend the built-in preset list.
 */

export interface VoiceFilterPreset {
    id: string;
    name: string;
    /** High-pass cutoff (Hz) — removes lows (telephone/radio effect). */
    highpassHz?: number;
    /** Low-pass cutoff (Hz) — removes highs (muffled/deep effect). */
    lowpassHz?: number;
    /** Output gain in dB (negative attenuates). */
    gainDb?: number;
    /** Waveshaper distortion amount, 0..1. */
    distortion?: number;
}

export const VOICE_FILTER_NONE: VoiceFilterPreset = { id: 'none', name: 'None' };

export const BUILTIN_VOICE_FILTERS: VoiceFilterPreset[] = [
    VOICE_FILTER_NONE,
    { id: 'telephone', name: 'Telephone', highpassHz: 500, lowpassHz: 3000, distortion: 0.1 },
    { id: 'radio', name: 'Radio', highpassHz: 700, lowpassHz: 4500, distortion: 0.25, gainDb: 2 },
    { id: 'deep', name: 'Deep', lowpassHz: 2200, gainDb: 3 },
    { id: 'bright', name: 'Bright', highpassHz: 900, gainDb: 1 },
];

/** True when a preset would change the signal (otherwise it's a passthrough). */
export function presetHasEffect(preset: VoiceFilterPreset): boolean {
    return (
        preset.highpassHz !== undefined ||
        preset.lowpassHz !== undefined ||
        (preset.gainDb !== undefined && preset.gainDb !== 0) ||
        (preset.distortion !== undefined && preset.distortion > 0)
    );
}

function makeDistortionCurve(amount: number): Float32Array {
    const k = amount * 100;
    const n = 256;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i += 1) {
        const x = (i * 2) / n - 1;
        curve[i] = ((3 + k) * x * 20 * Math.PI) / (Math.PI + k * Math.abs(x));
    }
    return curve;
}

/**
 * Wire the node chain for a preset and return its input/output nodes. The caller
 * connects a source into `input` and `output` into a destination. When the
 * preset has no effect, input === output (a passthrough gain node).
 */
export function buildVoiceFilterChain(
    ctx: BaseAudioContext,
    preset: VoiceFilterPreset
): { input: AudioNode; output: AudioNode } {
    const nodes: AudioNode[] = [];

    if (preset.highpassHz !== undefined) {
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = preset.highpassHz;
        nodes.push(hp);
    }
    if (preset.lowpassHz !== undefined) {
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = preset.lowpassHz;
        nodes.push(lp);
    }
    if (preset.distortion !== undefined && preset.distortion > 0) {
        const shaper = ctx.createWaveShaper();
        shaper.curve = makeDistortionCurve(preset.distortion) as Float32Array<ArrayBuffer>;
        nodes.push(shaper);
    }
    if (preset.gainDb !== undefined && preset.gainDb !== 0) {
        const gain = ctx.createGain();
        gain.gain.value = 10 ** (preset.gainDb / 20);
        nodes.push(gain);
    }

    if (nodes.length === 0) {
        const passthrough = ctx.createGain();
        return { input: passthrough, output: passthrough };
    }
    for (let i = 0; i < nodes.length - 1; i += 1) {
        nodes[i].connect(nodes[i + 1]);
    }
    return { input: nodes[0], output: nodes[nodes.length - 1] };
}

export interface FilteredStream {
    stream: MediaStream;
    dispose: () => void;
}

/**
 * Run a MediaStream's audio through a preset's filter graph. Returns a new
 * stream (filtered audio + original video tracks) and a `dispose` that tears the
 * AudioContext down. Falls back to the original stream when the preset has no
 * effect or Web Audio is unavailable.
 */
export function applyVoiceFilter(stream: MediaStream, preset: VoiceFilterPreset): FilteredStream {
    const AudioCtx: typeof AudioContext | undefined =
        typeof window !== 'undefined'
            ? window.AudioContext ??
              (window as unknown as { webkitAudioContext?: typeof AudioContext })
                  .webkitAudioContext
            : undefined;
    if (!presetHasEffect(preset) || !AudioCtx || stream.getAudioTracks().length === 0) {
        return { stream, dispose: () => undefined };
    }

    const ctx = new AudioCtx();
    const source = ctx.createMediaStreamSource(stream);
    const dest = ctx.createMediaStreamDestination();
    const { input, output } = buildVoiceFilterChain(ctx, preset);
    source.connect(input);
    output.connect(dest);

    const filtered = new MediaStream([
        ...dest.stream.getAudioTracks(),
        ...stream.getVideoTracks(),
    ]);
    return {
        stream: filtered,
        dispose: () => {
            try {
                source.disconnect();
                output.disconnect();
                void ctx.close();
            } catch {
                /* already torn down */
            }
        },
    };
}
