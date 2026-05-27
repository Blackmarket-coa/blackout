// Soundboard state lives in the `co.bmc.soundboard` room state event. Pure
// parsing/mutation helpers so the logic is testable without a live room.

export const SOUNDBOARD_STATE_EVENT_TYPE = 'co.bmc.soundboard';
export const SOUNDBOARD_MAX_CLIPS = 24;
export const SOUNDBOARD_NAME_MAX = 40;

const MXC_RE = /^mxc:\/\/[^/\s]+\/[A-Za-z0-9_-]+$/;

export interface SoundboardClip {
  id: string;
  name: string;
  mxc: string;
}

const isClip = (value: unknown): value is SoundboardClip => {
  if (!value || typeof value !== 'object') return false;
  const c = value as Record<string, unknown>;
  return (
    typeof c.id === 'string' &&
    c.id.length > 0 &&
    typeof c.name === 'string' &&
    c.name.trim().length > 0 &&
    typeof c.mxc === 'string' &&
    MXC_RE.test(c.mxc)
  );
};

export const parseSoundboard = (
  content: Record<string, unknown> | undefined | null
): SoundboardClip[] => {
  if (!content || !Array.isArray(content.sounds)) return [];
  const seen = new Set<string>();
  const out: SoundboardClip[] = [];
  for (const candidate of content.sounds) {
    if (!isClip(candidate)) continue;
    if (seen.has(candidate.id)) continue;
    seen.add(candidate.id);
    out.push({
      id: candidate.id,
      name: candidate.name.trim().slice(0, SOUNDBOARD_NAME_MAX),
      mxc: candidate.mxc,
    });
    if (out.length >= SOUNDBOARD_MAX_CLIPS) break;
  }
  return out;
};

export type AddClipResult =
  | { ok: true; clips: SoundboardClip[] }
  | { ok: false; reason: string };

export const addClip = (clips: SoundboardClip[], clip: SoundboardClip): AddClipResult => {
  const name = clip.name.trim();
  if (!name) return { ok: false, reason: 'name is required' };
  if (!MXC_RE.test(clip.mxc)) return { ok: false, reason: 'mxc must look like mxc://server/id' };
  if (clips.length >= SOUNDBOARD_MAX_CLIPS) {
    return { ok: false, reason: `soundboard is full (${SOUNDBOARD_MAX_CLIPS} max)` };
  }
  if (clips.some((c) => c.id === clip.id)) return { ok: false, reason: 'duplicate clip id' };
  return {
    ok: true,
    clips: [...clips, { id: clip.id, name: name.slice(0, SOUNDBOARD_NAME_MAX), mxc: clip.mxc }],
  };
};

export const removeClip = (clips: SoundboardClip[], id: string): SoundboardClip[] =>
  clips.filter((c) => c.id !== id);
