// Stage-channel roster lives in the `co.bmc.stage` room state event. Pure
// helpers for resolving who may speak; LiveKit publish enforcement is wired
// separately in the call layer.

export const STAGE_STATE_EVENT_TYPE = 'co.bmc.stage';
export const STAGE_MODERATOR_POWER = 50;

const MATRIX_USER_ID_RE = /^@[^:\s]+:[^:\s]+$/;

export interface StageConfig {
  /** Users explicitly granted the stage (may speak). */
  presenters: string[];
  /** Users who raised their hand to speak. */
  requests: string[];
}

const uniqueUserIds = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const id = item.trim();
    if (MATRIX_USER_ID_RE.test(id) && !out.includes(id)) out.push(id);
  }
  return out;
};

export const parseStageConfig = (
  content: Record<string, unknown> | undefined | null
): StageConfig => ({
  presenters: uniqueUserIds(content?.presenters),
  requests: uniqueUserIds(content?.requests),
});

export interface StageRoster {
  speakers: string[];
  audience: string[];
}

/** Split room members into speakers (presenters/mods) and listen-only audience. */
export const resolveStageRoster = (
  config: StageConfig,
  members: Array<{ userId: string; powerLevel: number }>
): StageRoster => {
  const speakers: string[] = [];
  const audience: string[] = [];
  for (const member of members) {
    if (member.powerLevel >= STAGE_MODERATOR_POWER || config.presenters.includes(member.userId)) {
      speakers.push(member.userId);
    } else {
      audience.push(member.userId);
    }
  }
  return { speakers, audience };
};

export const canSpeak = (
  config: StageConfig,
  userId: string,
  userPowerLevel: number
): boolean => userPowerLevel >= STAGE_MODERATOR_POWER || config.presenters.includes(userId);

export const toggleRequest = (config: StageConfig, userId: string): StageConfig => {
  if (!MATRIX_USER_ID_RE.test(userId)) return config;
  const requests = config.requests.includes(userId)
    ? config.requests.filter((id) => id !== userId)
    : [...config.requests, userId];
  return { ...config, requests };
};

/** Promote a user to presenter and clear any pending request. */
export const promoteToPresenter = (config: StageConfig, userId: string): StageConfig => {
  if (!MATRIX_USER_ID_RE.test(userId)) return config;
  return {
    presenters: config.presenters.includes(userId)
      ? config.presenters
      : [...config.presenters, userId],
    requests: config.requests.filter((id) => id !== userId),
  };
};

export const removeFromStage = (config: StageConfig, userId: string): StageConfig => ({
  presenters: config.presenters.filter((id) => id !== userId),
  requests: config.requests.filter((id) => id !== userId),
});
