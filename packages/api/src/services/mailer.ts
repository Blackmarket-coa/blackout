import { log } from '../telemetry/logger';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
  /** Optional template tag for analytics / observability. */
  kind?: string;
}

export interface Mailer {
  send(message: MailMessage): Promise<void>;
  /** Test-only hook: returns the in-memory outbox if the transport supports it. */
  outbox?: MailMessage[];
}

export class ConsoleMailer implements Mailer {
  outbox: MailMessage[] = [];

  async send(message: MailMessage): Promise<void> {
    this.outbox.push(message);
    log.info('mailer:console', {
      to: message.to,
      subject: message.subject,
      kind: message.kind ?? 'unspecified',
    });
  }
}

export interface ResendMailerOptions {
  apiKey: string;
  from: string;
  /** Override the Resend API endpoint (testing / private mirrors). */
  endpoint?: string;
  /** Total attempts (initial + retries). Defaults to 3. */
  maxAttempts?: number;
  /** Base backoff in ms; doubled each retry. Defaults to 250ms. */
  backoffMs?: number;
  /** Override of the global `fetch` for testing. */
  fetchImpl?: typeof fetch;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * HTTP transport against Resend's `/emails` endpoint. Retries with exponential
 * backoff on transient (5xx, 429, network) errors. Permanent failures (4xx
 * other than 429) bubble immediately so callers don't loop on a malformed
 * payload or revoked key.
 */
export class ResendMailer implements Mailer {
  private readonly apiKey: string;
  private readonly from: string;
  private readonly endpoint: string;
  private readonly maxAttempts: number;
  private readonly backoffMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: ResendMailerOptions) {
    this.apiKey = options.apiKey;
    this.from = options.from;
    this.endpoint = options.endpoint ?? 'https://api.resend.com/emails';
    this.maxAttempts = Math.max(1, options.maxAttempts ?? 3);
    this.backoffMs = Math.max(0, options.backoffMs ?? 250);
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async send(message: MailMessage): Promise<void> {
    const body = JSON.stringify({
      from: this.from,
      to: [message.to],
      subject: message.subject,
      text: message.text,
      ...(message.html ? { html: message.html } : {}),
      ...(message.kind ? { tags: [{ name: 'kind', value: message.kind }] } : {}),
    });

    let lastError: Error | undefined;
    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      let transient = true;
      try {
        const res = await this.fetchImpl(this.endpoint, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${this.apiKey}`,
          },
          body,
        });
        if (res.ok) return;

        transient = res.status === 429 || res.status >= 500;
        const detail = await res.text().catch(() => '');
        lastError = new Error(`resend http ${res.status}: ${detail.slice(0, 200)}`);
      } catch (err) {
        // Network / TypeError — treat as transient.
        lastError = err instanceof Error ? err : new Error(String(err));
        transient = true;
      }
      if (!transient) throw lastError;
      if (attempt < this.maxAttempts) {
        await sleep(this.backoffMs * 2 ** (attempt - 1));
      }
    }
    throw lastError ?? new Error('resend send failed');
  }
}

let cached: Mailer | null = null;

export const setMailer = (mailer: Mailer | null): void => {
  cached = mailer;
};

/**
 * Returns the active mailer. Production deployments should call
 * `initMailerFromEnv()` during bootstrap so this resolves to a real
 * transport. The default console transport keeps an in-memory outbox so
 * integration tests can assert on dispatch.
 */
export const getMailer = (): Mailer => {
  if (cached) return cached;
  cached = new ConsoleMailer();
  return cached;
};

/**
 * Boot-time mailer selection. Reads MAILER_PROVIDER + provider-specific env
 * vars and registers the matching transport. Falls back to ConsoleMailer when
 * unset so local/dev deployments keep working without configuration.
 *
 * Currently supported:
 *   MAILER_PROVIDER=resend  → ResendMailer (RESEND_API_KEY, MAIL_FROM)
 *   MAILER_PROVIDER=console (default)
 */
export const bootstrapMailer = (): { provider: string; ok: boolean; reason?: string } => {
  const provider = (process.env.MAILER_PROVIDER ?? 'console').toLowerCase();
  if (provider === 'resend') {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.MAIL_FROM;
    if (!apiKey || !from) {
      log.warn('mailer:bootstrap', {
        provider,
        ok: false,
        reason: 'missing RESEND_API_KEY or MAIL_FROM; falling back to console',
      });
      setMailer(new ConsoleMailer());
      return { provider: 'console', ok: false, reason: 'missing_resend_config' };
    }
    setMailer(new ResendMailer({ apiKey, from }));
    log.info('mailer:bootstrap', { provider, ok: true });
    return { provider, ok: true };
  }
  setMailer(new ConsoleMailer());
  log.info('mailer:bootstrap', { provider: 'console', ok: true });
  return { provider: 'console', ok: true };
const buildResendFromEnv = async (env: NodeJS.ProcessEnv): Promise<Mailer> => {
  const apiKey = env.MAIL_RESEND_API_KEY;
  const from = env.MAIL_FROM_ADDRESS;
  if (!apiKey || !from) {
    throw new Error(
      '[mailer] Resend transport requires MAIL_RESEND_API_KEY and MAIL_FROM_ADDRESS to be set.',
    );
  }
  const { createResendMailer } = await import('../integrations/resend');
  return createResendMailer({ apiKey, from });
};

const buildSmtpFromEnv = async (env: NodeJS.ProcessEnv): Promise<Mailer> => {
  const host = env.MAIL_SMTP_HOST;
  const from = env.MAIL_FROM_ADDRESS;
  if (!host || !from) {
    throw new Error(
      '[mailer] SMTP transport requires MAIL_SMTP_HOST and MAIL_FROM_ADDRESS to be set.',
    );
  }
  const portRaw = env.MAIL_SMTP_PORT;
  const port = portRaw ? Number.parseInt(portRaw, 10) : undefined;
  if (portRaw && (!Number.isFinite(port) || port! <= 0 || port! > 65535)) {
    throw new Error(`[mailer] MAIL_SMTP_PORT must be a valid TCP port (got ${portRaw}).`);
  }
  const secureRaw = env.MAIL_SMTP_SECURE?.toLowerCase();
  const secure = secureRaw === undefined ? undefined : secureRaw === 'true' || secureRaw === '1';
  const { createSmtpMailer } = await import('../integrations/smtp');
  return createSmtpMailer({
    host,
    port,
    secure,
    user: env.MAIL_SMTP_USER,
    pass: env.MAIL_SMTP_PASS,
    from,
  });
};

/**
 * Selects a mailer transport from environment variables. Mirrors the
 * security preflight pattern: in production, refuse to silently fall back
 * to the console mailer — the caller must explicitly opt in via
 * MAIL_PROVIDER=console (e.g. for staging shadow deploys).
 *
 * Supported providers:
 *   - `resend`               — Resend HTTP API only.
 *   - `smtp`                  — SMTP (nodemailer) only.
 *   - `resend-failover-smtp`  — Resend primary, SMTP fallback. Wraps both in
 *                               a circuit-breaker (see
 *                               `integrations/failoverMailer.ts`); trips
 *                               after `MAIL_FAILOVER_FAILURE_THRESHOLD`
 *                               (default 3) consecutive primary errors and
 *                               routes through SMTP for
 *                               `MAIL_FAILOVER_COOLDOWN_MS` (default 5 min)
 *                               before probing primary again.
 *   - `console`               — staging-only; explicit opt-in required
 *                               when NODE_ENV=production.
 */
export const initMailerFromEnv = async (env: NodeJS.ProcessEnv = process.env): Promise<Mailer> => {
  const provider = (env.MAIL_PROVIDER ?? '').toLowerCase();
  const isProd = env.NODE_ENV === 'production';
  if (provider === 'resend') {
    const mailer = await buildResendFromEnv(env);
    setMailer(mailer);
    log.info('mailer:init', { provider: 'resend' });
    return mailer;
  }
  if (provider === 'smtp') {
    const mailer = await buildSmtpFromEnv(env);
    setMailer(mailer);
    log.info('mailer:init', { provider: 'smtp' });
    return mailer;
  }
  if (provider === 'resend-failover-smtp') {
    const [primary, fallback] = await Promise.all([
      buildResendFromEnv(env),
      buildSmtpFromEnv(env),
    ]);
    const threshold = Number.parseInt(env.MAIL_FAILOVER_FAILURE_THRESHOLD ?? '', 10);
    const cooldownMs = Number.parseInt(env.MAIL_FAILOVER_COOLDOWN_MS ?? '', 10);
    const { createFailoverMailer } = await import('../integrations/failoverMailer');
    const mailer = createFailoverMailer({
      primary,
      fallback,
      primaryName: 'resend',
      fallbackName: 'smtp',
      failureThreshold: Number.isFinite(threshold) && threshold > 0 ? threshold : undefined,
      cooldownMs: Number.isFinite(cooldownMs) && cooldownMs > 0 ? cooldownMs : undefined,
    });
    setMailer(mailer);
    log.info('mailer:init', { provider: 'resend-failover-smtp' });
    return mailer;
  }
  if (provider === 'console' || provider === '') {
    if (isProd && provider !== 'console') {
      throw new Error(
        '[mailer] MAIL_PROVIDER must be set in production (set MAIL_PROVIDER=resend, MAIL_PROVIDER=smtp, MAIL_PROVIDER=resend-failover-smtp, or explicit MAIL_PROVIDER=console for staging shadow).',
      );
    }
    const mailer = new ConsoleMailer();
    setMailer(mailer);
    log.info('mailer:init', { provider: 'console' });
    return mailer;
  }
  throw new Error(`[mailer] Unsupported MAIL_PROVIDER=${provider}.`);
};

export const __test__ = { ConsoleMailer };
