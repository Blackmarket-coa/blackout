import { randomBytes } from 'node:crypto';

const OWNCAST_BASE_URL = process.env.OWNCAST_BASE_URL ?? 'http://localhost:8080';

export interface OwncastOriginConfig {
  origin: string;
  ingestPath: string;
}

export function getOwncastOriginConfig(): OwncastOriginConfig {
  return {
    origin: OWNCAST_BASE_URL,
    ingestPath: `${OWNCAST_BASE_URL}/rtmp`,
  };
}

export function generateManagedStreamKey(): string {
  return randomBytes(24).toString('base64url');
}
