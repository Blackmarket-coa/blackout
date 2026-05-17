/**
 * Lightweight redaction for user-submitted issue reports. Removes / hashes
 * fragments that commonly leak credentials or PII into stack traces and
 * URL bars: emails, JWT-shaped strings, hex-looking secrets, and Matrix
 * access tokens. The goal is defense-in-depth — the client should also
 * redact before sending, and operators should treat the resulting record
 * as user-controllable input.
 */

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// JWT: three base64url segments separated by dots (header.payload.signature).
const JWT_RE = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;
// Hex secrets >= 32 chars (fingerprint, hash, key material).
const HEX_SECRET_RE = /\b[a-fA-F0-9]{32,}\b/g;
// Matrix syt_/syl_/mat_ tokens.
const MATRIX_TOKEN_RE = /\b(syt|syl|mat)_[A-Za-z0-9_+/=-]{16,}\b/g;
// Bearer / authorization headers occasionally end up in pasted stack traces.
const BEARER_RE = /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}\b/g;
// Generic password=, token=, key= query-string / form-fragment patterns.
const QS_SECRET_RE = /\b(password|token|secret|api[_-]?key|access[_-]?token)=([^&\s"']+)/gi;

const DEFAULT_MAX_LENGTH = 8 * 1024;

export const redactString = (raw: string): string => {
  if (!raw) return raw;
  return raw
    .replace(EMAIL_RE, '[redacted-email]')
    .replace(JWT_RE, '[redacted-jwt]')
    .replace(MATRIX_TOKEN_RE, '[redacted-matrix-token]')
    .replace(BEARER_RE, 'Bearer [redacted]')
    .replace(QS_SECRET_RE, '$1=[redacted]')
    .replace(HEX_SECRET_RE, '[redacted-hex]');
};

export interface IssueReportInput {
  description?: string;
  url?: string;
  userAgent?: string;
  appVersion?: string;
  buildChannel?: string;
  lastError?: string;
  featureFlags?: Record<string, boolean>;
  extra?: Record<string, unknown>;
}

export interface RedactedIssueReport {
  description: string;
  url?: string;
  userAgent?: string;
  appVersion?: string;
  buildChannel?: string;
  lastError?: string;
  featureFlags?: Record<string, boolean>;
}

const truncate = (raw: string | undefined, max: number = DEFAULT_MAX_LENGTH): string | undefined =>
  raw === undefined ? undefined : raw.length > max ? `${raw.slice(0, max)}…[truncated]` : raw;

export const redactIssueReport = (input: IssueReportInput): RedactedIssueReport => {
  return {
    description: redactString(truncate(input.description ?? '') ?? ''),
    url: input.url ? redactString(truncate(input.url, 1024)!) : undefined,
    userAgent: truncate(input.userAgent, 512),
    appVersion: truncate(input.appVersion, 64),
    buildChannel: truncate(input.buildChannel, 64),
    lastError: input.lastError ? redactString(truncate(input.lastError, 4 * 1024)!) : undefined,
    featureFlags: input.featureFlags,
  };
};
