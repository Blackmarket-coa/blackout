const MXID_REGEX = /^@[A-Za-z0-9._=\-/]+:[A-Za-z0-9.-]+$/;
const EVENT_ID_REGEX = /^\$\S+/;

export const isLikelyMxid = (value: string): boolean => MXID_REGEX.test(value.trim());

export const isLikelyEventId = (value: string): boolean => EVENT_ID_REGEX.test(value.trim());

export const buildBanArgs = (target: string, reason: string): string[] => {
  const normalizedTarget = target.trim();
  const normalizedReason = reason.trim();

  if (!normalizedReason) {
    return [normalizedTarget];
  }

  return [normalizedTarget, '--reason', normalizedReason];
};
