import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import { installedPluginsAtom } from '../monetization/install/installedPluginsAtom';
import { BUILTIN_VOICE_FILTERS, VOICE_FILTER_NONE, type VoiceFilterPreset } from './voiceFilter';
import type { OwnedSoundPack, SoundClip } from './soundPackGoods';

/** Sound packs the current user owns (from installed sound_pack entitlements). */
export const ownedSoundPacksAtom = atom<OwnedSoundPack[]>((get) => {
    const out: OwnedSoundPack[] = [];
    for (const record of get(installedPluginsAtom)) {
        if (record.soundPack) out.push(record.soundPack);
    }
    return out;
});

/** Built-in + owned voice-filter presets. */
export const voiceFilterPresetsAtom = atom<VoiceFilterPreset[]>((get) => {
    const owned = get(ownedSoundPacksAtom)
        .filter((p) => p.soundKind === 'voice_filter' && p.voiceFilter)
        .map((p) => p.voiceFilter as VoiceFilterPreset);
    return [...BUILTIN_VOICE_FILTERS, ...owned];
});

/** The selected voice-filter preset id, persisted across reloads. */
export const selectedVoiceFilterIdAtom = atomWithStorage<string>(
    'blackout.audio.voiceFilter.v1',
    'none'
);

/** The resolved selected preset (falls back to None if the id is unknown). */
export const selectedVoiceFilterAtom = atom<VoiceFilterPreset>((get) => {
    const id = get(selectedVoiceFilterIdAtom);
    return get(voiceFilterPresetsAtom).find((p) => p.id === id) ?? VOICE_FILTER_NONE;
});

/** Soundboard clips from owned soundboard packs (flattened). */
export const ownedSoundboardClipsAtom = atom<SoundClip[]>((get) =>
    get(ownedSoundPacksAtom)
        .filter((p) => p.soundKind === 'soundboard')
        .flatMap((p) => p.clips ?? [])
);

/** Notification sounds the user owns (one per notification pack). */
export const ownedNotificationSoundsAtom = atom<SoundClip[]>((get) =>
    get(ownedSoundPacksAtom)
        .filter((p) => p.soundKind === 'notification' && p.notificationSound)
        .map((p) => p.notificationSound as SoundClip)
);

/** The selected custom notification sound id (`''` = default chime). */
export const selectedNotificationSoundIdAtom = atomWithStorage<string>(
    'blackout.audio.notification.v1',
    ''
);
