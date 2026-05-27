// Per-room slow mode (Discord-parity). Config lives in the `co.bmc.slowmode`
// room state event; enforcement is client-side in the composer. Logic here is
// pure so it can be unit-tested without a live room.

export const SLOWMODE_STATE_EVENT_TYPE = 'co.bmc.slowmode';

// Matches Discord's slow-mode ceiling of 6 hours.
export const MAX_SLOWMODE_SECONDS = 21600;

export interface SlowmodeConfig {
  enabled: boolean;
  delaySeconds: number;
  /** Members at or above this power level bypass the throttle. */
  exemptPowerLevel: number;
}

export const DEFAULT_SLOWMODE_CONFIG: SlowmodeConfig = {
  enabled: false,
  delaySeconds: 0,
  exemptPowerLevel: 50,
};

export const parseSlowmodeConfig = (
  content: Record<string, unknown> | undefined | null
): SlowmodeConfig => {
  if (!content || typeof content !== 'object') return DEFAULT_SLOWMODE_CONFIG;

  const rawDelay = typeof content.delaySeconds === 'number' ? content.delaySeconds : 0;
  const delaySeconds = Number.isFinite(rawDelay)
    ? Math.min(Math.max(0, Math.floor(rawDelay)), MAX_SLOWMODE_SECONDS)
    : 0;

  const rawExempt = typeof content.exemptPowerLevel === 'number' ? content.exemptPowerLevel : 50;
  const exemptPowerLevel = Number.isFinite(rawExempt) ? Math.floor(rawExempt) : 50;

  return {
    enabled: content.enabled === true && delaySeconds > 0,
    delaySeconds,
    exemptPowerLevel,
  };
};

export interface SlowmodeEvaluation {
  allowed: boolean;
  retryAfterMs: number;
}

export const evaluateSlowmode = (params: {
  config: SlowmodeConfig;
  lastSentTs: number | null;
  now: number;
  userPowerLevel: number;
}): SlowmodeEvaluation => {
  const { config, lastSentTs, now, userPowerLevel } = params;
  if (!config.enabled || config.delaySeconds <= 0) return { allowed: true, retryAfterMs: 0 };
  if (userPowerLevel >= config.exemptPowerLevel) return { allowed: true, retryAfterMs: 0 };
  if (lastSentTs == null) return { allowed: true, retryAfterMs: 0 };

  const remaining = config.delaySeconds * 1000 - (now - lastSentTs);
  if (remaining <= 0) return { allowed: true, retryAfterMs: 0 };
  return { allowed: false, retryAfterMs: remaining };
};
