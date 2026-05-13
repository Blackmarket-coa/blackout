import { createTransport, type Transporter } from 'nodemailer';
import { log } from '../telemetry/logger';
import type { MailMessage, Mailer } from '../services/mailer';
import {
  mailSendAttemptsTotal,
  mailSendDurationSeconds,
  mailSendFailuresTotal,
} from '../telemetry/metrics';

const DEFAULT_PORT = 587;
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_INITIAL_BACKOFF_MS = 250;
const DEFAULT_MAX_BACKOFF_MS = 4000;

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

const computeBackoffMs = (attempt: number, initialMs: number, maxMs: number): number => {
  const expBackoff = Math.min(initialMs * 2 ** (attempt - 1), maxMs);
  return Math.floor(Math.random() * expBackoff);
};

export interface SmtpMailerConfig {
  host: string;
  port?: number;
  /** Implicit TLS on port 465 when true; STARTTLS otherwise. Defaults to `port === 465`. */
  secure?: boolean;
  user?: string;
  pass?: string;
  from: string;
  maxAttempts?: number;
  initialBackoffMs?: number;
  maxBackoffMs?: number;
  /** Inject a transport for tests; production uses nodemailer's default. */
  transport?: Pick<Transporter, 'sendMail'>;
}

const isPermanentError = (err: unknown): boolean => {
  // nodemailer surfaces the SMTP response code on the error object as
  // `responseCode`. 5xx is permanent per RFC 5321.
  const code = (err as { responseCode?: number; code?: string }).responseCode;
  if (typeof code === 'number') return code >= 500 && code < 600;
  // Auth failures from nodemailer use code `EAUTH` — also non-retryable.
  const errCode = (err as { code?: string }).code;
  return errCode === 'EAUTH' || errCode === 'EENVELOPE';
};

class SmtpMailer implements Mailer {
  outbox = undefined;
  private readonly maxAttempts: number;
  private readonly initialBackoffMs: number;
  private readonly maxBackoffMs: number;
  private readonly transport: Pick<Transporter, 'sendMail'>;

  constructor(private readonly config: SmtpMailerConfig) {
    this.maxAttempts = config.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    this.initialBackoffMs = config.initialBackoffMs ?? DEFAULT_INITIAL_BACKOFF_MS;
    this.maxBackoffMs = config.maxBackoffMs ?? DEFAULT_MAX_BACKOFF_MS;

    if (config.transport) {
      this.transport = config.transport;
    } else {
      const port = config.port ?? DEFAULT_PORT;
      const auth = config.user && config.pass ? { user: config.user, pass: config.pass } : undefined;
      this.transport = createTransport({
        host: config.host,
        port,
        secure: config.secure ?? port === 465,
        auth,
      });
    }
  }

  async send(message: MailMessage): Promise<void> {
    const kind = message.kind ?? 'unspecified';
    const start = Date.now();
    let lastError: unknown;
    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      mailSendAttemptsTotal.inc({ provider: 'smtp', kind });
      try {
        await this.transport.sendMail({
          from: this.config.from,
          to: message.to,
          subject: message.subject,
          text: message.text,
          html: message.html,
          headers: { 'x-blackout-kind': kind },
        });
        mailSendDurationSeconds.observe((Date.now() - start) / 1000, {
          provider: 'smtp',
          kind,
          outcome: 'success',
        });
        return;
      } catch (err) {
        lastError = err;
        const code = (err as { responseCode?: number; code?: string }).responseCode
          ?? (err as { code?: string }).code
          ?? 'unknown';
        if (isPermanentError(err)) {
          mailSendFailuresTotal.inc({ provider: 'smtp', kind, reason: `permanent_${code}` });
          mailSendDurationSeconds.observe((Date.now() - start) / 1000, {
            provider: 'smtp',
            kind,
            outcome: 'failure',
          });
          throw err instanceof Error ? err : new Error(String(err));
        }
        if (attempt < this.maxAttempts) {
          const backoff = computeBackoffMs(attempt, this.initialBackoffMs, this.maxBackoffMs);
          log.warn('mailer:smtp retrying', { kind, attempt, code, backoffMs: backoff });
          await sleep(backoff);
        }
      }
    }
    mailSendFailuresTotal.inc({ provider: 'smtp', kind, reason: 'retries_exhausted' });
    mailSendDurationSeconds.observe((Date.now() - start) / 1000, {
      provider: 'smtp',
      kind,
      outcome: 'failure',
    });
    throw lastError instanceof Error ? lastError : new Error('smtp send failed');
  }
}

export const createSmtpMailer = (config: SmtpMailerConfig): Mailer => new SmtpMailer(config);

export const __test__ = { computeBackoffMs, isPermanentError };
