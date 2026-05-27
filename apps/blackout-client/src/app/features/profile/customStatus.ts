import type { MatrixClient } from 'matrix-js-sdk';
import type { ProfileStatus } from './profileTypes';

// A custom status is shown only while it has text and hasn't expired.
export const isStatusActive = (
  status: ProfileStatus | undefined,
  now: number
): boolean => {
  if (!status || !status.text.trim()) return false;
  if (status.expiresAt) {
    const expiresMs = Date.parse(status.expiresAt);
    if (!Number.isNaN(expiresMs) && expiresMs <= now) return false;
  }
  return true;
};

export const formatStatusText = (status: ProfileStatus): string =>
  (status.emoji ? `${status.emoji} ${status.text}` : status.text).trim();

/**
 * Pick the status to display: an active custom profile status wins; otherwise
 * fall back to the Matrix presence status message (so remote users still get
 * something sensible).
 */
export const resolveDisplayStatus = (
  status: ProfileStatus | undefined,
  fallbackStatusMsg: string | undefined,
  now: number
): string | undefined => {
  if (isStatusActive(status, now)) return formatStatusText(status as ProfileStatus);
  const fallback = fallbackStatusMsg?.trim();
  return fallback ? fallback : undefined;
};

type PresenceCapableClient = {
  setPresence?: (opts: { presence: string; status_msg?: string }) => Promise<unknown>;
};

/**
 * Publish the custom status to Matrix presence so other clients can see it via
 * the standard presence plumbing. Clears the message when the status is empty
 * or expired. Best-effort: presence failures must not block profile saves.
 */
export const syncStatusToPresence = async (
  client: Pick<MatrixClient, never>,
  status: ProfileStatus | undefined,
  now: number = Date.now()
): Promise<void> => {
  const setPresence = (client as PresenceCapableClient).setPresence;
  if (typeof setPresence !== 'function') return;
  const status_msg = isStatusActive(status, now) ? formatStatusText(status as ProfileStatus) : '';
  try {
    await setPresence({ presence: 'online', status_msg });
  } catch {
    // Presence is best-effort; ignore transient failures.
  }
};
