import { createHmac } from 'node:crypto';

const base64Url = (value: string) => Buffer.from(value).toString('base64url');

export type VoiceRole = 'member' | 'moderator' | 'admin';

export interface LiveKitTokenRequest {
  identity: string;
  name: string;
  roomName: string;
  role: VoiceRole;
  canPublish: boolean;
  canSubscribe: boolean;
  ttlSeconds?: number;
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required LiveKit environment variable: ${name}`);
  }
  return value;
}

export function getLiveKitConfig() {
  const url = requiredEnv('LIVEKIT_URL');
  const apiKey = requiredEnv('LIVEKIT_API_KEY');
  const apiSecret = requiredEnv('LIVEKIT_API_SECRET');
  const tokenTtlSeconds = Number.parseInt(process.env.LIVEKIT_TOKEN_TTL_SECONDS ?? '300', 10);
  return {
    url,
    apiKey,
    apiSecret,
    tokenTtlSeconds: Number.isFinite(tokenTtlSeconds) ? Math.max(60, Math.min(tokenTtlSeconds, 900)) : 300,
  };
}

export function createLiveKitAccessToken(input: LiveKitTokenRequest): { token: string; expiresAt: string; apiKey: string } {
  const config = getLiveKitConfig();
  const ttlSeconds = Math.max(60, Math.min(input.ttlSeconds ?? config.tokenTtlSeconds, 900));
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + ttlSeconds;

  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    iss: config.apiKey,
    sub: input.identity,
    iat,
    exp,
    nbf: iat,
    name: input.name,
    metadata: JSON.stringify({ role: input.role }),
    video: {
      roomJoin: true,
      room: input.roomName,
      canPublish: input.canPublish,
      canSubscribe: input.canSubscribe,
      canPublishData: true,
    },
  };

  const encodedHeader = base64Url(JSON.stringify(header));
  const encodedPayload = base64Url(JSON.stringify(payload));
  const data = `${encodedHeader}.${encodedPayload}`;
  const signature = createHmac('sha256', config.apiSecret).update(data).digest('base64url');

  return {
    token: `${data}.${signature}`,
    expiresAt: new Date(exp * 1000).toISOString(),
    apiKey: config.apiKey,
  };
}
