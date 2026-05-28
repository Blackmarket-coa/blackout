const REQUIRED_PROD_SECRETS = {
  MARKETPLACE_FULFILLMENT_SECRET: 'local-dev-fulfillment',
  FREEBLACKMARKET_WEBHOOK_SECRET: 'stub-webhook-secret',
} as const;

export function validateProdSecrets(): void {
  if (process.env.NODE_ENV !== 'production') return;
  for (const [key, fallback] of Object.entries(REQUIRED_PROD_SECRETS)) {
    const value = process.env[key];
    if (!value || value === fallback) {
      throw new Error(
        `${key} is required in production (must not be the default fallback "${fallback}")`,
      );
    }
  }
}
