export interface CorsRuntimeConfig {
  origins: string[];
  allowAny: boolean;
  credentials: boolean;
  allowedMethods: string[];
  allowedHeaders: string[];
  exposeHeaders: string[];
  maxAge: number;
}

const METHOD_RE = /^[A-Z]+$/;

const csv = (value: string | undefined): string[] =>
  (value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

const isHttpUrl = (origin: string): boolean => {
  try {
    const u = new URL(origin);
    return (u.protocol === 'http:' || u.protocol === 'https:') && !!u.host;
  } catch {
    return false;
  }
};

const isProduction = (): boolean => process.env.NODE_ENV === 'production';

let cached: CorsRuntimeConfig | null = null;

export const clearCorsConfigCache = (): void => {
  cached = null;
};

export const readCorsRuntimeConfig = (): CorsRuntimeConfig => {
  if (cached) return cached;

  const raw = csv(process.env.CORS_ALLOWED_ORIGINS);
  const allowAny = raw.length === 1 && raw[0] === '*';

  if (raw.length === 0) {
    if (isProduction()) {
      throw new Error(
        'CORS_ALLOWED_ORIGINS is required in production. Provide a comma-separated list of origin URLs (no trailing slash) or "*" if you have explicitly accepted that risk.',
      );
    }
    cached = {
      origins: [],
      allowAny: false,
      credentials: false,
      allowedMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Authorization', 'Content-Type', 'x-matrix-access-token'],
      exposeHeaders: [],
      maxAge: 600,
    };
    return cached;
  }

  if (allowAny && isProduction()) {
    throw new Error(
      'CORS_ALLOWED_ORIGINS=* is not allowed in production. Set an explicit allowlist of origin URLs.',
    );
  }

  if (!allowAny) {
    const invalid = raw.filter((origin) => !isHttpUrl(origin));
    if (invalid.length > 0) {
      throw new Error(
        `CORS_ALLOWED_ORIGINS contains invalid origins: ${invalid.join(', ')}. Each entry must be an http(s) URL with no path.`,
      );
    }
  }

  const credentials = process.env.CORS_ALLOW_CREDENTIALS === 'true';
  if (credentials && allowAny) {
    throw new Error('CORS_ALLOW_CREDENTIALS=true is incompatible with CORS_ALLOWED_ORIGINS=*.');
  }

  const methodsRaw = csv(process.env.CORS_ALLOWED_METHODS);
  const allowedMethods = (
    methodsRaw.length > 0 ? methodsRaw : ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']
  ).map((m) => {
    const upper = m.trim().toUpperCase();
    if (!METHOD_RE.test(upper)) {
      throw new Error(`CORS_ALLOWED_METHODS contains invalid HTTP method: "${m}"`);
    }
    return upper;
  });

  const allowedHeaders = csv(process.env.CORS_ALLOWED_HEADERS);
  const exposeHeaders = csv(process.env.CORS_EXPOSE_HEADERS);

  const maxAge = Number.parseInt(process.env.CORS_MAX_AGE ?? '600', 10);
  if (!Number.isFinite(maxAge) || maxAge < 0) {
    throw new Error('CORS_MAX_AGE must be a non-negative integer (seconds).');
  }

  cached = {
    origins: raw,
    allowAny,
    credentials,
    allowedMethods,
    allowedHeaders: allowedHeaders.length > 0 ? allowedHeaders : ['Authorization', 'Content-Type', 'x-matrix-access-token'],
    exposeHeaders,
    maxAge,
  };
  return cached;
};

export const isOriginAllowed = (origin: string | undefined, config: CorsRuntimeConfig): boolean => {
  if (!origin) return false;
  if (config.allowAny) return true;
  return config.origins.includes(origin);
};
