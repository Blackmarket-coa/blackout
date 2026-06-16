export type Session = {
  baseUrl: string;
  userId: string;
  deviceId: string;
  accessToken: string;
  expiresInMs?: number;
  refreshToken?: string;
  fallbackSdkStores?: boolean;
};

export type Sessions = Session[];
export type SessionStoreName = {
  sync: string;
  crypto: string;
};

const MODERN_SESSION_KEYS = {
  accessToken: 'blackout_access_token',
  deviceId: 'blackout_device_id',
  userId: 'blackout_user_id',
  baseUrl: 'blackout_hs_base_url',
} as const;

const LEGACY_SESSION_KEYS = {
  accessToken: 'cinny_access_token',
  deviceId: 'cinny_device_id',
  userId: 'cinny_user_id',
  baseUrl: 'cinny_hs_base_url',
} as const;

/**
 * Migration code for old session
 */

export function setFallbackSession(
  accessToken: string,
  deviceId: string,
  userId: string,
  baseUrl: string
) {
  localStorage.setItem(MODERN_SESSION_KEYS.accessToken, accessToken);
  localStorage.setItem(MODERN_SESSION_KEYS.deviceId, deviceId);
  localStorage.setItem(MODERN_SESSION_KEYS.userId, userId);
  localStorage.setItem(MODERN_SESSION_KEYS.baseUrl, baseUrl);
}
export const removeFallbackSession = () => {
  Object.values(MODERN_SESSION_KEYS).forEach((key) => localStorage.removeItem(key));
  Object.values(LEGACY_SESSION_KEYS).forEach((key) => localStorage.removeItem(key));
};
export const getFallbackSession = (): Session | undefined => {
  const baseUrl =
    localStorage.getItem(MODERN_SESSION_KEYS.baseUrl) ??
    localStorage.getItem(LEGACY_SESSION_KEYS.baseUrl);
  const userId =
    localStorage.getItem(MODERN_SESSION_KEYS.userId) ??
    localStorage.getItem(LEGACY_SESSION_KEYS.userId);
  const deviceId =
    localStorage.getItem(MODERN_SESSION_KEYS.deviceId) ??
    localStorage.getItem(LEGACY_SESSION_KEYS.deviceId);
  const accessToken =
    localStorage.getItem(MODERN_SESSION_KEYS.accessToken) ??
    localStorage.getItem(LEGACY_SESSION_KEYS.accessToken);

  if (baseUrl && userId && deviceId && accessToken) {
    if (!localStorage.getItem(MODERN_SESSION_KEYS.accessToken)) {
      setFallbackSession(accessToken, deviceId, userId, baseUrl);
      Object.values(LEGACY_SESSION_KEYS).forEach((key) => localStorage.removeItem(key));
    }

    const session: Session = {
      baseUrl,
      userId,
      deviceId,
      accessToken,
      fallbackSdkStores: true,
    };

    return session;
  }

  return undefined;
};
/**
 * End of migration code for old session
 */
