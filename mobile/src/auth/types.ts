export interface MobileUser {
  id: string;
  username: string;
}

export interface MobileSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  user: MobileUser;
}

export interface DeviceRegistration {
  pushToken: string;
  platform: 'ios' | 'android';
  deviceId: string;
}

export interface SessionRefreshResponse {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
}
