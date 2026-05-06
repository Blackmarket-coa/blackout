import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export interface AuthTokenPayload {
  sub: string;
  username: string;
  iat: number;
  exp: number;
  iss: string;
  aud: string;
  jti: string;
}

const base64Url = (input: Buffer | string) => Buffer.from(input).toString('base64url');

const WEAK_SECRET_PATTERNS = ['local-dev-secret', 'changeme', 'secret', 'dev-secret', 'password'];

export interface AuthRuntimeConfig {
  issuer: string;
  audience: string;
  signingSecret: string;
  verificationSecrets: string[];
  tokenTransport: 'header' | 'cookie' | 'both';
  cookieName?: string;
  cookieSecure?: boolean;
  cookieSameSite?: 'strict' | 'lax' | 'none';
}

const parseSecretList = (value: string | undefined): string[] =>
  (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const isStrongSecret = (value: string): boolean => {
  if (value.length < 32) return false;
  const lowered = value.toLowerCase();
  if (WEAK_SECRET_PATTERNS.some((pattern) => lowered.includes(pattern))) return false;
  return /[a-z]/.test(value) && /[A-Z]/.test(value) && /\d/.test(value) && /[^A-Za-z0-9]/.test(value);
};

let cachedConfig: AuthRuntimeConfig | null = null;

export const readAuthRuntimeConfig = (): AuthRuntimeConfig => {
  if (cachedConfig) return cachedConfig;

  const primarySecret = process.env.JWT_SECRET_PRIMARY?.trim() || process.env.JWT_SECRET?.trim() || '';
  const rolloverSecrets = parseSecretList(process.env.JWT_SECRET_ROLLOVER);
  const verificationSecrets = [primarySecret, ...rolloverSecrets].filter(Boolean);

  if (!primarySecret) {
    throw new Error('JWT secret missing: set JWT_SECRET_PRIMARY (or JWT_SECRET).');
  }
  if (!isStrongSecret(primarySecret)) {
    throw new Error('JWT_SECRET_PRIMARY is weak. Use a high-entropy secret with mixed character classes and length >= 32.');
  }
  rolloverSecrets.forEach((secret, index) => {
    if (!isStrongSecret(secret)) {
      throw new Error(`JWT_SECRET_ROLLOVER[${index}] is weak. Rotation keys must meet the same strength requirements.`);
    }
  });

  const issuer = process.env.JWT_ISSUER?.trim() || 'blackout-api';
  const audience = process.env.JWT_AUDIENCE?.trim() || 'blackout-clients';

  const tokenTransport =
    process.env.AUTH_TOKEN_TRANSPORT === 'cookie' || process.env.AUTH_TOKEN_TRANSPORT === 'both'
      ? process.env.AUTH_TOKEN_TRANSPORT
      : 'header';

  const nodeEnv = process.env.NODE_ENV ?? 'development';
  const cookieName = process.env.AUTH_COOKIE_NAME?.trim() || undefined;
  const cookieSecure = process.env.AUTH_COOKIE_SECURE === 'true';
  const cookieSameSiteRaw = process.env.AUTH_COOKIE_SAMESITE?.trim().toLowerCase();
  const cookieSameSite =
    cookieSameSiteRaw === 'strict' || cookieSameSiteRaw === 'none' ? cookieSameSiteRaw : 'lax';

  if (tokenTransport === 'cookie' || tokenTransport === 'both') {
    if (!cookieName) {
      throw new Error('Cookie token transport enabled but AUTH_COOKIE_NAME is missing.');
    }
    if (nodeEnv === 'production' && !cookieSecure) {
      throw new Error('AUTH_COOKIE_SECURE must be true in production when cookie token transport is enabled.');
    }
    if (cookieSameSite === 'none' && !cookieSecure) {
      throw new Error('AUTH_COOKIE_SAMESITE=none requires AUTH_COOKIE_SECURE=true.');
    }
  }

  cachedConfig = {
    issuer,
    audience,
    signingSecret: primarySecret,
    verificationSecrets,
    tokenTransport,
    cookieName,
    cookieSecure,
    cookieSameSite,
  };
  return cachedConfig;
};

export const clearAuthRuntimeConfigCache = () => {
  cachedConfig = null;
};

export const MIN_PASSWORD_LENGTH = 8;

export function isAcceptablePassword(password: unknown): password is string {
  return typeof password === 'string' && password.length >= MIN_PASSWORD_LENGTH;
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hashed] = stored.split(':');
  if (!salt || !hashed) return false;

  const candidate = scryptSync(password, salt, 64);
  const target = Buffer.from(hashed, 'hex');
  return candidate.length === target.length && timingSafeEqual(candidate, target);
}

// Precomputed so the "user not found" branch of login can spend the same
// scrypt work as the "wrong password" branch, preventing email enumeration
// via response-time measurement.
const DUMMY_PASSWORD_HASH = hashPassword(randomBytes(16).toString('hex'));

export function verifyPasswordConstantTime(password: string, stored: string | undefined | null): boolean {
  const target = stored && stored.includes(':') ? stored : DUMMY_PASSWORD_HASH;
  const ok = verifyPassword(password, target);
  return Boolean(stored) && ok;
}

export interface SignedJwt {
  token: string;
  jti: string;
  exp: number;
}

export function signJwt(userId: string, username: string, ttlSeconds = 60 * 60 * 24): string {
  return signJwtWithMeta(userId, username, ttlSeconds).token;
}

export function signJwtWithMeta(
  userId: string,
  username: string,
  ttlSeconds = 60 * 60 * 24,
): SignedJwt {
  const config = readAuthRuntimeConfig();
  const header = { alg: 'HS256', typ: 'JWT' };
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + ttlSeconds;
  const jti = randomBytes(16).toString('base64url');
  const payload: AuthTokenPayload = {
    sub: userId,
    username,
    iat,
    exp,
    iss: config.issuer,
    aud: config.audience,
    jti,
  };

  const encodedHeader = base64Url(JSON.stringify(header));
  const encodedPayload = base64Url(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = createHmac('sha256', config.signingSecret).update(signingInput).digest('base64url');
  return { token: `${signingInput}.${signature}`, jti, exp };
}

export function verifyJwt(token: string): AuthTokenPayload | null {
  const config = readAuthRuntimeConfig();
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [header, payload, signature] = parts;
  const signingInput = `${header}.${payload}`;

  const validSignature = config.verificationSecrets.some((secret) => {
    const expected = createHmac('sha256', secret).update(signingInput).digest('base64url');
    const signatureBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    return signatureBuffer.length === expectedBuffer.length && timingSafeEqual(signatureBuffer, expectedBuffer);
  });

  if (!validSignature) return null;

  let decoded: AuthTokenPayload;
  try {
    decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as AuthTokenPayload;
  } catch {
    return null;
  }
  if (typeof decoded?.exp !== 'number' || typeof decoded?.iat !== 'number') return null;
  const now = Math.floor(Date.now() / 1000);
  if (decoded.exp < now) return null;
  if (decoded.iss !== config.issuer || decoded.aud !== config.audience) return null;

  return decoded;
}
