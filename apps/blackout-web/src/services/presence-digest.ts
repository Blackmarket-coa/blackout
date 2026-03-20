export interface PresenceActivity {
  userId: string;
  lastActiveAt: string;
}

export interface PresenceDigestConfig {
  digestWindowMinutes: number;
}

export function buildPresenceDigest(
  activities: PresenceActivity[],
  nowIso: string,
  config: PresenceDigestConfig,
): PresenceActivity[] {
  const nowMs = new Date(nowIso).getTime();
  const windowMs = config.digestWindowMinutes * 60_000;

  return activities.filter((activity) => {
    const ageMs = nowMs - new Date(activity.lastActiveAt).getTime();
    return ageMs >= 0 && ageMs <= windowMs;
  });
}
