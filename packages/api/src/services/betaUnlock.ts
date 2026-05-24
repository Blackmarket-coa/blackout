/**
 * Temporary beta override: when `BLACKOUT_BETA_UNLOCK_ALL=true`, every service
 * is unlocked for every user regardless of subscription. Flip the env var off
 * to restore normal subscription/preset gating.
 */
export function betaUnlockAllEnabled(): boolean {
  return process.env.BLACKOUT_BETA_UNLOCK_ALL === 'true';
}
