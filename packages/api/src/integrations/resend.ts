import { log } from '../telemetry/logger';
import type { MailMessage, Mailer } from '../services/mailer';
import {
  mailSendAttemptsTotal,
  mailSendDurationSeconds,
  mailSendFailuresTotal,
} from '../telemetry/metrics';

const DEFAULT_API_URL = 'https://api.resend.com/emails';
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_INITIAL_BACKOFF_MS = 250;
const DEFAULT_MAX_BACKOFF_MS = 4000;

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

const computeBackoffMs = (attempt: number, initialMs: number, maxMs: number): number => {
  // Exponential with full jitter — bounded by the configured ceiling.
  const expBackoff = Math.min(initialMs * 2 ** (attempt - 1), maxMs);
  return Math.floor(Math.random() * expBackoff);
};

const isRetryableStatus = (status: number): boolean => status === 429 || status >= 500;

export interface ResendMailerConfig {
  apiKey: string;
  from: string;
  /** Override transport endpoint for tests; defaults to Resend's production URL. */
  apiUrl?: string;
  maxAttempts?: number;
  initialBackoffMs?: number;
  maxBackoffMs?: number;
  /** Injectable fetch for tests. */
  fetchImpl?: typeof fetch;
}

class ResendMailer implements Mailer {
  outbox = undefined;
  private readonly apiUrl: string;
  private readonly maxAttempts: number;
  private readonly initialBackoffMs: number;
  private readonly maxBackoffMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly config: ResendMailerConfig) {
    this.apiUrl = config.apiUrl ?? DEFAULT_API_URL;
    this.maxAttempts = config.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    this.initialBackoffMs = config.initialBackoffMs ?? DEFAULT_INITIAL_BACKOFF_MS;
    this.maxBackoffMs = config.maxBackoffMs ?? DEFAULT_MAX_BACKOFF_MS;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async send(message: MailMessage): Promise<void> {
    const kind = message.kind ?? 'unspecified';
    const start = Date.now();
    let lastError: unknown;
    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      mailSendAttemptsTotal.inc({ provider: 'resend', kind });
      const transient = await this.attemptOnce(message, kind);
      if (transient.outcome === 'success') {
        mailSendDurationSeconds.observe((Date.now() - start) / 1000, {
          provider: 'resend',
          kind,
          outcome: 'success',
        });
        return;
      }
      if (transient.outcome === 'fatal') {
        mailSendDurationSeconds.observe((Date.now() - start) / 1000, {
          provider: 'resend',
          kind,
          outcome: 'failure',
        });
        throw transient.error;
      }
      lastError = transient.error;
      if (attempt < this.maxAttempts) {
        const backoff = computeBackoffMs(attempt, this.initialBackoffMs, this.maxBackoffMs);
        log.warn('mailer:resend retrying', { kind, attempt, backoffMs: backoff });
        await sleep(backoff);
      }
    }
    mailSendFailuresTotal.inc({ provider: 'resend', kind, reason: 'retries_exhausted' });
    mailSendDurationSeconds.observe((Date.now() - start) / 1000, {
      provider: 'resend',
      kind,
      outcome: 'failure',
    });
    throw lastError instanceof Error ? lastError : new Error('resend send failed');
  }

  private async attemptOnce(
    message: MailMessage,
    kind: string,
  ): Promise<
    | { outcome: 'success' }
    | { outcome: 'transient'; error: Error }
    | { outcome: 'fatal'; error: Error }
  > {
    try {
      const response = await this.fetchImpl(this.apiUrl, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.config.apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          from: this.config.from,
          to: [message.to],
          subject: message.subject,
          text: message.text,
          html: message.html,
          tags: [{ name: 'kind', value: kind }],
        }),
      });
      if (response.ok) return { outcome: 'success' };
      const detail = await response.text().catch(() => '');
      if (isRetryableStatus(response.status)) {
        return {
          outcome: 'transient',
          error: new Error(`resend transient ${response.status}: ${detail.slice(0, 200)}`),
        };
      }
      mailSendFailuresTotal.inc({
        provider: 'resend',
        kind,
        reason: `http_${response.status}`,
      });
      return {
        outcome: 'fatal',
        error: new Error(`resend send failed: ${response.status} ${detail.slice(0, 200)}`),
      };
    } catch (err) {
      return {
        outcome: 'transient',
        error: err instanceof Error ? err : new Error(String(err)),
      };
    }
  }
}

export const createResendMailer = (config: ResendMailerConfig): Mailer => new ResendMailer(config);

export const __test__ = { computeBackoffMs, isRetryableStatus };
