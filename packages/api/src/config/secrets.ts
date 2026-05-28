const REQUIRED_PROD_SECRETS = {
  MARKETPLACE_FULFILLMENT_SECRET: 'local-dev-fulfillment',
  FREEBLACKMARKET_WEBHOOK_SECRET: 'stub-webhook-secret',
} as const;

import { readFileSync, existsSync } from 'node:fs';

/**
 * Read a secret value. Tries `/run/secrets/<name>` (Docker secrets pattern)
 * first, then falls back to the environment variable. Trims trailing whitespace
 * from file reads so a newline in the secret file doesn't break HMAC/encryption.
 */
export function readSecretOrEnv(name: string): string | undefined {
  const filePath = `/run/secrets/${name.toLowerCase().replace(/_/g, '')}`;
  try {
    if (existsSync(filePath)) {
      return readFileSync(filePath, 'utf8').trim();
    }
  } catch {
    // File not readable — fall through to env
  }
  return process.env[name]?.trim() || undefined;
}

export function validateProdSecrets(): void {
  if (process.env.NODE_ENV !== 'production') return;
  for (const [key, fallback] of Object.entries(REQUIRED_PROD_SECRETS)) {
    const value = readSecretOrEnv(key);
    if (!value || value === fallback) {
      throw new Error(
        `${key} is required in production (must not be the default fallback "${fallback}")`,
      );
    }
  }
}
