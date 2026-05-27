import type { VoiceFilterPreset } from './voiceFilter';

/**
 * Model for purchasable audio packs (Workstream 2). A `sound_pack` entitlement
 * carries one of three kinds: soundboard clips, a notification sound, or a
 * voice-filter preset. Decoded onto the installed record and surfaced via the
 * audio atoms. Dependency-free for the installer + atoms.
 */

export type SoundKind = 'soundboard' | 'notification' | 'voice_filter';

export interface SoundClip {
    id: string;
    name: string;
    /** https/data URL of the audio asset. */
    url: string;
}

export interface OwnedSoundPack {
    id: string;
    name: string;
    soundKind: SoundKind;
    clips?: SoundClip[];
    notificationSound?: SoundClip;
    voiceFilter?: VoiceFilterPreset;
}

const ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;
const URL_RE = /^(https:\/\/|data:audio\/)/i;
const SOUND_KINDS: readonly SoundKind[] = ['soundboard', 'notification', 'voice_filter'];

function str(value: unknown, max: number): string | undefined {
    return typeof value === 'string' && value.trim().length > 0
        ? value.trim().slice(0, max)
        : undefined;
}

function num(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function parseClip(raw: unknown): SoundClip | null {
    if (!raw || typeof raw !== 'object') return null;
    const obj = raw as Record<string, unknown>;
    const id = typeof obj.id === 'string' && ID_RE.test(obj.id) ? obj.id : undefined;
    const name = str(obj.name, 60);
    const url = str(obj.url, 2048);
    if (!id || !name || !url || !URL_RE.test(url)) return null;
    return { id, name, url };
}

function parseVoiceFilter(data: Record<string, unknown>, id: string, name: string): VoiceFilterPreset {
    const clamp = (v: number | undefined, lo: number, hi: number): number | undefined =>
        v === undefined ? undefined : Math.min(hi, Math.max(lo, v));
    return {
        id,
        name,
        highpassHz: clamp(num(data.highpassHz), 20, 20000),
        lowpassHz: clamp(num(data.lowpassHz), 20, 20000),
        gainDb: clamp(num(data.gainDb), -24, 24),
        distortion: clamp(num(data.distortion), 0, 1),
    };
}

/** Parse + sanitize an untrusted sound_pack payload. */
export function parseOwnedSoundPack(payload: unknown): OwnedSoundPack | null {
    if (!payload || typeof payload !== 'object') return null;
    const data = payload as Record<string, unknown>;
    const soundKind = data.soundKind;
    if (typeof soundKind !== 'string' || !SOUND_KINDS.includes(soundKind as SoundKind)) {
        return null;
    }
    const id =
        typeof data.id === 'string' && ID_RE.test(data.id)
            ? data.id
            : str(data.packId, 64) ??
              str(data.name, 64)?.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const name = str(data.name, 80) ?? id;
    if (!id || !name) return null;

    const pack: OwnedSoundPack = { id, name, soundKind: soundKind as SoundKind };
    switch (pack.soundKind) {
        case 'soundboard': {
            const clips = Array.isArray(data.clips)
                ? data.clips.map(parseClip).filter((c): c is SoundClip => c !== null).slice(0, 24)
                : [];
            if (clips.length === 0) return null;
            pack.clips = clips;
            break;
        }
        case 'notification': {
            const sound = parseClip(data.sound ?? data.notificationSound);
            if (!sound) return null;
            pack.notificationSound = sound;
            break;
        }
        case 'voice_filter':
            pack.voiceFilter = parseVoiceFilter(data, id, name);
            break;
    }
    return pack;
}
