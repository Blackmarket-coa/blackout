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

class ConsoleMailer implements Mailer {
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
 * Selects a mailer transport from environment variables. Mirrors the
 * security preflight pattern: in production, refuse to silently fall back
 * to the console mailer — the caller must explicitly opt in via
 * MAIL_PROVIDER=console (e.g. for staging shadow deploys).
 *
 * Currently supported providers: `resend`, `console`. The SMTP transport
 * is reserved for a follow-up; refuse rather than fall back.
 */
export const initMailerFromEnv = async (env: NodeJS.ProcessEnv = process.env): Promise<Mailer> => {
  const provider = (env.MAIL_PROVIDER ?? '').toLowerCase();
  const isProd = env.NODE_ENV === 'production';
  if (provider === 'resend') {
    const apiKey = env.MAIL_RESEND_API_KEY;
    const from = env.MAIL_FROM_ADDRESS;
    if (!apiKey || !from) {
      throw new Error(
        '[mailer] MAIL_PROVIDER=resend requires MAIL_RESEND_API_KEY and MAIL_FROM_ADDRESS to be set.',
      );
    }
    const { createResendMailer } = await import('../integrations/resend');
    const mailer = createResendMailer({ apiKey, from });
    setMailer(mailer);
    log.info('mailer:init', { provider: 'resend' });
    return mailer;
  }
  if (provider === 'console' || provider === '') {
    if (isProd && provider !== 'console') {
      throw new Error(
        '[mailer] MAIL_PROVIDER must be set in production (set MAIL_PROVIDER=resend or explicit MAIL_PROVIDER=console for staging shadow).',
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
