/**
 * GitHub App installation token + PAT-fallback auth.
 *
 * Zero deps: mints the App JWT with node:crypto RS256 and exchanges it
 * for an installation token via plain fetch. Caches the installation
 * token in-process until it's within 60 s of expiry.
 *
 * When no App env vars and no PAT are configured, returns null so the
 * caller can degrade to a dev no-op (the route still attempts rageshake
 * forwarding and returns a synthetic issue URL).
 */

import { createSign } from 'node:crypto';

export interface GithubAppConfig {
  readonly mode: 'app';
  readonly appId: string;
  readonly privateKey: string;
  readonly installationId: string;
}

export interface GithubPatConfig {
  readonly mode: 'pat';
  readonly token: string;
}

export type GithubAuthConfig = GithubAppConfig | GithubPatConfig;

export interface GithubAuthToken {
  readonly mode: 'app' | 'pat';
  readonly token: string;
  readonly expiresAt: number | null;
}

const APP_TOKEN_REFRESH_BUFFER_MS = 60_000;

let cached: GithubAuthToken | null = null;

const normalizePrivateKey = (raw: string): string => {
  // Allow operators to paste a PEM with literal `\n` escapes (common in env vars).
  if (raw.includes('\\n')) return raw.replace(/\\n/g, '\n');
  return raw;
};

export const readGithubAuthConfig = (env: NodeJS.ProcessEnv = process.env): GithubAuthConfig | null => {
  const appId = env.GITHUB_APP_ID?.trim();
  const installationId = env.GITHUB_APP_INSTALLATION_ID?.trim();
  const privateKey = env.GITHUB_APP_PRIVATE_KEY?.trim();
  if (appId && installationId && privateKey) {
    return { mode: 'app', appId, installationId, privateKey: normalizePrivateKey(privateKey) };
  }
  const pat = env.GITHUB_BUG_REPORT_PAT?.trim();
  if (pat) return { mode: 'pat', token: pat };
  return null;
};

const base64url = (input: Buffer | string): string =>
  Buffer.from(input).toString('base64url');

const signAppJwt = (cfg: GithubAppConfig): string => {
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const now = Math.floor(Date.now() / 1000);
  const payload = base64url(
    JSON.stringify({
      iat: now - 30, // tolerate 30 s of clock drift
      exp: now + 9 * 60, // GitHub rejects > 10 minutes
      iss: cfg.appId,
    }),
  );
  const signingInput = `${header}.${payload}`;
  const signer = createSign('RSA-SHA256');
  signer.update(signingInput);
  signer.end();
  const signature = signer.sign(cfg.privateKey).toString('base64url');
  return `${signingInput}.${signature}`;
};

interface InstallationTokenResponse {
  token: string;
  expires_at: string;
}

const exchangeForInstallationToken = async (cfg: GithubAppConfig): Promise<GithubAuthToken> => {
  const jwt = signAppJwt(cfg);
  const res = await fetch(
    `https://api.github.com/app/installations/${encodeURIComponent(cfg.installationId)}/access_tokens`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'blackout-api',
      },
    },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new GithubAuthError(res.status, `installation token exchange failed: ${text || res.statusText}`);
  }
  const body = (await res.json()) as InstallationTokenResponse;
  const expiresAt = Date.parse(body.expires_at);
  return {
    mode: 'app',
    token: body.token,
    expiresAt: Number.isFinite(expiresAt) ? expiresAt : Date.now() + 60 * 60 * 1000,
  };
};

export class GithubAuthError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'GithubAuthError';
  }
}

export const getGithubAuthToken = async (
  cfg: GithubAuthConfig,
): Promise<GithubAuthToken> => {
  if (cfg.mode === 'pat') {
    return { mode: 'pat', token: cfg.token, expiresAt: null };
  }
  const now = Date.now();
  if (cached && cached.mode === 'app' && cached.expiresAt && cached.expiresAt - now > APP_TOKEN_REFRESH_BUFFER_MS) {
    return cached;
  }
  cached = await exchangeForInstallationToken(cfg);
  return cached;
};

export const __test__ = {
  resetCache: () => {
    cached = null;
  },
  setCache: (entry: GithubAuthToken | null) => {
    cached = entry;
  },
  getCache: (): GithubAuthToken | null => cached,
  signAppJwt,
};
