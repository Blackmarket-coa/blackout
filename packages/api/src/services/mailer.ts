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
 * Returns the active mailer. Production deployments should call setMailer()
 * during bootstrap with a real SMTP/Resend transport. The default console
 * transport logs (with redaction via the structured logger) and keeps an
 * in-memory outbox so integration tests can assert on dispatch.
 */
export const getMailer = (): Mailer => {
  if (cached) return cached;
  cached = new ConsoleMailer();
  return cached;
};

export const __test__ = { ConsoleMailer };
