import { log } from '../telemetry/logger';
import type { MailMessage, Mailer } from '../services/mailer';
import {
  mailFailoverStateChangesTotal,
  mailFailoverPrimaryActive,
} from '../telemetry/metrics';

const DEFAULT_FAILURE_THRESHOLD = 3;
const DEFAULT_COOLDOWN_MS = 5 * 60_000;

export interface FailoverMailerConfig {
  primary: Mailer;
  fallback: Mailer;
  /** Identifiers used in logs and metrics labels. */
  primaryName: string;
  fallbackName: string;
  /** Consecutive primary failures (exceptions thrown by `.send()`) before tripping. */
  failureThreshold?: number;
  /** Time the breaker stays `open` (routing to fallback) before allowing a primary probe. */
  cooldownMs?: number;
  /** Override for tests. */
  now?: () => number;
}

type BreakerState = 'closed' | 'open' | 'half-open';

/**
 * Circuit-breaker mailer: routes sends through `primary` until it sees
 * `failureThreshold` consecutive throws, then routes through `fallback`
 * for `cooldownMs` before probing `primary` again via a half-open state.
 *
 * One probe at a time. If the half-open probe succeeds the breaker
 * closes; if it fails the breaker re-opens and the cooldown restarts.
 *
 * Probes go through whichever mailer the policy currently selects —
 * `closed`/`half-open` use `primary`; `open` uses `fallback`. The
 * `fallback` mailer is never circuit-broken; a fallback failure is
 * surfaced to the caller as the final error.
 */
class FailoverMailer implements Mailer {
  outbox = undefined;
  private state: BreakerState = 'closed';
  private consecutiveFailures = 0;
  private openUntilMs = 0;
  private readonly failureThreshold: number;
  private readonly cooldownMs: number;
  private readonly now: () => number;

  constructor(private readonly config: FailoverMailerConfig) {
    this.failureThreshold = config.failureThreshold ?? DEFAULT_FAILURE_THRESHOLD;
    this.cooldownMs = config.cooldownMs ?? DEFAULT_COOLDOWN_MS;
    this.now = config.now ?? Date.now;
    mailFailoverPrimaryActive.set(1);
  }

  async send(message: MailMessage): Promise<void> {
    this.maybeTransitionToHalfOpen();
    if (this.state === 'open') {
      // Cooldown still in effect — go straight to fallback.
      return this.sendViaFallback(message);
    }
    // closed or half-open: try primary, manage state on outcome.
    try {
      await this.config.primary.send(message);
      this.onPrimarySuccess();
      return;
    } catch (err) {
      this.onPrimaryFailure(err);
      // Best effort: try fallback so the message still reaches the user.
      // If fallback also fails we throw the fallback error (more recent
      // signal); we attach the primary error as `cause` for diagnostics.
      try {
        await this.config.fallback.send(message);
        log.info('mailer:failover send via fallback after primary failure', {
          primary: this.config.primaryName,
          fallback: this.config.fallbackName,
          kind: message.kind ?? 'unspecified',
        });
        return;
      } catch (fallbackErr) {
        const composite =
          fallbackErr instanceof Error
            ? fallbackErr
            : new Error(String(fallbackErr));
        (composite as Error & { cause?: unknown }).cause =
          err instanceof Error ? err : new Error(String(err));
        throw composite;
      }
    }
  }

  private maybeTransitionToHalfOpen(): void {
    if (this.state === 'open' && this.now() >= this.openUntilMs) {
      this.setState('half-open');
    }
  }

  private onPrimarySuccess(): void {
    this.consecutiveFailures = 0;
    if (this.state !== 'closed') {
      this.setState('closed');
    }
  }

  private onPrimaryFailure(err: unknown): void {
    this.consecutiveFailures += 1;
    log.warn('mailer:failover primary failed', {
      primary: this.config.primaryName,
      consecutiveFailures: this.consecutiveFailures,
      threshold: this.failureThreshold,
      state: this.state,
      error: err instanceof Error ? err.message : String(err),
    });
    if (this.state === 'half-open' || this.consecutiveFailures >= this.failureThreshold) {
      this.openUntilMs = this.now() + this.cooldownMs;
      this.setState('open');
    }
  }

  private async sendViaFallback(message: MailMessage): Promise<void> {
    await this.config.fallback.send(message);
  }

  private setState(next: BreakerState): void {
    if (this.state === next) return;
    const prev = this.state;
    this.state = next;
    mailFailoverStateChangesTotal.inc({ from: prev, to: next });
    mailFailoverPrimaryActive.set(next === 'closed' ? 1 : 0);
    log.info('mailer:failover state', {
      from: prev,
      to: next,
      primary: this.config.primaryName,
      fallback: this.config.fallbackName,
    });
  }

  /** Test-only hook. */
  __peek(): { state: BreakerState; consecutiveFailures: number; openUntilMs: number } {
    return {
      state: this.state,
      consecutiveFailures: this.consecutiveFailures,
      openUntilMs: this.openUntilMs,
    };
  }
}

export const createFailoverMailer = (config: FailoverMailerConfig): Mailer =>
  new FailoverMailer(config);

export const __test__ = { FailoverMailer };
