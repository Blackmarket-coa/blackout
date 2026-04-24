export type ApiEnvironment = 'dev' | 'staging' | 'prod';

const DEFAULT_BASE_URLS: Record<ApiEnvironment, string> = {
  dev: 'http://localhost:8787',
  staging: 'https://api.staging.blackout.dev',
  prod: 'https://api.blackout.dev',
};

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, '');
}

function parseEnvironment(rawValue: string | undefined): ApiEnvironment {
  if (rawValue === 'dev' || rawValue === 'staging' || rawValue === 'prod') {
    return rawValue;
  }

  if (__DEV__) {
    return 'dev';
  }

  return 'prod';
}

const selectedEnvironment = parseEnvironment(process.env.EXPO_PUBLIC_API_ENV);
const baseUrlOverride = process.env.EXPO_PUBLIC_API_BASE_URL;
const baseUrl = normalizeBaseUrl(baseUrlOverride ?? DEFAULT_BASE_URLS[selectedEnvironment]);

function getValidationError(): string | null {
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    return `API endpoint is invalid for ${selectedEnvironment}. Configure EXPO_PUBLIC_API_BASE_URL with a valid URL.`;
  }

  const isLocalHost = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
  if (selectedEnvironment !== 'dev' && isLocalHost) {
    return `API endpoint ${baseUrl} is only allowed in dev. Update EXPO_PUBLIC_API_ENV or EXPO_PUBLIC_API_BASE_URL.`;
  }

  if (selectedEnvironment !== 'dev' && parsed.protocol !== 'https:') {
    return `API endpoint ${baseUrl} must use HTTPS for ${selectedEnvironment}.`;
  }

  return null;
}

const validationError = getValidationError();

export const apiConfig = {
  env: selectedEnvironment,
  baseUrl,
  apiBaseUrl: `${baseUrl}/api`,
  validationError,
} as const;

function joinUrl(base: string, path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalizedPath}`;
}

export function getApiConfigValidationError(): string | null {
  return apiConfig.validationError;
}

export function assertApiConfigValid() {
  if (apiConfig.validationError) {
    throw new Error(apiConfig.validationError);
  }
}

export function buildApiUrl(path: string): string {
  assertApiConfigValid();
  return joinUrl(apiConfig.apiBaseUrl, path);
}

export function buildServiceUrl(path: string): string {
  assertApiConfigValid();
  return joinUrl(apiConfig.baseUrl, path);
}
