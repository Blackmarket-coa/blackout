import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export interface AuthTokenPayload {
  sub: string;
  username: string;
  iat: number;
  exp: number;
}

const base64Url = (input: Buffer | string) => Buffer.from(input).toString('base64url');

const secret = () => process.env.JWT_SECRET ?? 'local-dev-secret';

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hashed] = stored.split(':');
  if (!salt || !hashed) {
    return false;
  }

  const candidate = scryptSync(password, salt, 64);
  const target = Buffer.from(hashed, 'hex');
  return candidate.length === target.length && timingSafeEqual(candidate, target);
}

export function signJwt(userId: string, username: string, ttlSeconds = 60 * 60 * 24): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const iat = Math.floor(Date.now() / 1000);
  const payload: AuthTokenPayload = { sub: userId, username, iat, exp: iat + ttlSeconds };

  const encodedHeader = base64Url(JSON.stringify(header));
  const encodedPayload = base64Url(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const signature = createHmac('sha256', secret()).update(signingInput).digest('base64url');
  return `${signingInput}.${signature}`;
}

export function verifyJwt(token: string): AuthTokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 3) {
    return null;
  }

  const [header, payload, signature] = parts;
  const signingInput = `${header}.${payload}`;
  const expected = createHmac('sha256', secret()).update(signingInput).digest('base64url');

  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return null;
  }

  const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as AuthTokenPayload;
  const now = Math.floor(Date.now() / 1000);
  if (decoded.exp < now) {
    return null;
  }

  return decoded;
}
