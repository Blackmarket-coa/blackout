/**
 * Minimal Prometheus exposition for the Blackout API.
 *
 * Why custom: the rest of the telemetry stack (logger, jwt) is
 * dependency-free; metrics should not pull in prom-client. The exposition
 * format is small and stable (text/plain version 0.0.4).
 *
 * Supported instrument types:
 *   - Counter: monotonic, with optional labels.
 *   - Histogram: pre-defined bucket boundaries; emits _bucket / _sum / _count.
 *   - Gauge: set/get for ephemeral values.
 *
 * Each instrument is registered exactly once at module load. Series cardinality
 * is bounded by validating that label values are short ASCII strings.
 */

const escapeLabelValue = (value: string): string =>
  value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/"/g, '\\"');

const validateLabelValue = (value: string): string => {
  if (value.length > 200) return value.slice(0, 200);
  return value;
};

const sortKeys = <T extends Record<string, string>>(labels: T): Array<[string, string]> =>
  Object.entries(labels).sort(([a], [b]) => a.localeCompare(b));

const labelsToKey = (labels: Record<string, string>): string =>
  sortKeys(labels)
    .map(([k, v]) => `${k}=${v}`)
    .join('|');

const formatLabels = (labels: Record<string, string>): string => {
  const entries = sortKeys(labels);
  if (entries.length === 0) return '';
  const inner = entries.map(([k, v]) => `${k}="${escapeLabelValue(v)}"`).join(',');
  return `{${inner}}`;
};

interface BaseInstrument {
  name: string;
  help: string;
  type: 'counter' | 'histogram' | 'gauge';
  expose(): string;
}

class Registry {
  private readonly instruments = new Map<string, BaseInstrument>();

  register<T extends BaseInstrument>(instrument: T): T {
    if (this.instruments.has(instrument.name)) {
      // Same instance is fine — re-registration is a no-op.
      const existing = this.instruments.get(instrument.name);
      if (existing === instrument) return instrument;
      throw new Error(`metrics: instrument "${instrument.name}" registered twice`);
    }
    this.instruments.set(instrument.name, instrument);
    return instrument;
  }

  expose(): string {
    const parts: string[] = [];
    for (const inst of this.instruments.values()) {
      parts.push(inst.expose());
    }
    return parts.join('\n') + '\n';
  }

  /** Test-only: drop all instruments. */
  reset(): void {
    this.instruments.clear();
  }
}

export const registry = new Registry();

export class Counter implements BaseInstrument {
  type = 'counter' as const;
  private readonly values = new Map<string, { labels: Record<string, string>; value: number }>();

  constructor(
    public readonly name: string,
    public readonly help: string,
    public readonly labelNames: ReadonlyArray<string> = [],
  ) {
    registry.register(this);
  }

  inc(labels: Record<string, string> = {}, by = 1): void {
    const normalized = this.normalize(labels);
    const key = labelsToKey(normalized);
    const existing = this.values.get(key);
    if (existing) existing.value += by;
    else this.values.set(key, { labels: normalized, value: by });
  }

  private normalize(labels: Record<string, string>): Record<string, string> {
    const out: Record<string, string> = {};
    for (const name of this.labelNames) {
      out[name] = validateLabelValue(labels[name] ?? '');
    }
    return out;
  }

  expose(): string {
    const lines: string[] = [];
    lines.push(`# HELP ${this.name} ${this.help}`);
    lines.push(`# TYPE ${this.name} counter`);
    if (this.values.size === 0 && this.labelNames.length === 0) {
      lines.push(`${this.name} 0`);
    } else {
      for (const { labels, value } of this.values.values()) {
        lines.push(`${this.name}${formatLabels(labels)} ${value}`);
      }
    }
    return lines.join('\n');
  }
}

export class Gauge implements BaseInstrument {
  type = 'gauge' as const;
  private value = 0;

  constructor(public readonly name: string, public readonly help: string) {
    registry.register(this);
  }

  set(value: number): void {
    this.value = value;
  }

  inc(by = 1): void {
    this.value += by;
  }

  expose(): string {
    return [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} gauge`, `${this.name} ${this.value}`].join('\n');
  }
}

export class Histogram implements BaseInstrument {
  type = 'histogram' as const;
  private readonly series = new Map<
    string,
    { labels: Record<string, string>; buckets: number[]; sum: number; count: number }
  >();
  private readonly bucketBoundaries: number[];

  constructor(
    public readonly name: string,
    public readonly help: string,
    bucketBoundaries: ReadonlyArray<number>,
    public readonly labelNames: ReadonlyArray<string> = [],
  ) {
    if (bucketBoundaries.length === 0) {
      throw new Error('Histogram requires at least one bucket boundary');
    }
    this.bucketBoundaries = [...bucketBoundaries].sort((a, b) => a - b);
    registry.register(this);
  }

  observe(value: number, labels: Record<string, string> = {}): void {
    const normalized = this.normalize(labels);
    const key = labelsToKey(normalized);
    let entry = this.series.get(key);
    if (!entry) {
      entry = {
        labels: normalized,
        buckets: new Array(this.bucketBoundaries.length).fill(0),
        sum: 0,
        count: 0,
      };
      this.series.set(key, entry);
    }
    entry.sum += value;
    entry.count += 1;
    for (let i = 0; i < this.bucketBoundaries.length; i += 1) {
      if (value <= this.bucketBoundaries[i]) entry.buckets[i] += 1;
    }
  }

  private normalize(labels: Record<string, string>): Record<string, string> {
    const out: Record<string, string> = {};
    for (const name of this.labelNames) {
      out[name] = validateLabelValue(labels[name] ?? '');
    }
    return out;
  }

  expose(): string {
    const lines: string[] = [];
    lines.push(`# HELP ${this.name} ${this.help}`);
    lines.push(`# TYPE ${this.name} histogram`);
    for (const entry of this.series.values()) {
      // entry.buckets[i] already holds the cumulative count of observations
      // <= bucketBoundaries[i] because observe() increments every matching
      // bucket on each sample. Emit the values as-is.
      for (let i = 0; i < this.bucketBoundaries.length; i += 1) {
        const bucketLabels = { ...entry.labels, le: String(this.bucketBoundaries[i]) };
        lines.push(`${this.name}_bucket${formatLabels(bucketLabels)} ${entry.buckets[i]}`);
      }
      const inf = { ...entry.labels, le: '+Inf' };
      lines.push(`${this.name}_bucket${formatLabels(inf)} ${entry.count}`);
      lines.push(`${this.name}_sum${formatLabels(entry.labels)} ${entry.sum}`);
      lines.push(`${this.name}_count${formatLabels(entry.labels)} ${entry.count}`);
    }
    return lines.join('\n');
  }
}

// ---------------------------------------------------------------------------
// Default instruments
// ---------------------------------------------------------------------------

export const httpRequestDuration = new Histogram(
  'http_request_duration_seconds',
  'HTTP request latency in seconds',
  [0.005, 0.025, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  ['method', 'route', 'status'],
);

export const httpRequestsTotal = new Counter(
  'http_requests_total',
  'Total HTTP requests',
  ['method', 'route', 'status'],
);

export const authFailuresTotal = new Counter(
  'auth_failures_total',
  'Authentication failures by reason',
  ['reason'],
);

export const rateLimitHitsTotal = new Counter(
  'rate_limit_hits_total',
  'Requests rejected by the rate limiter',
  ['bucket'],
);

export const refreshTokenReusesTotal = new Counter(
  'refresh_token_reuses_total',
  'Refresh-token reuse detections (potential token theft)',
);

export const mailSendAttemptsTotal = new Counter(
  'mail_send_attempts_total',
  'Outbound transactional mail send attempts (each retry increments).',
  ['provider', 'kind'],
);

export const mailSendFailuresTotal = new Counter(
  'mail_send_failures_total',
  'Outbound transactional mail sends that exhausted retries or hit a non-retryable error.',
  ['provider', 'kind', 'reason'],
);

export const mailSendDurationSeconds = new Histogram(
  'mail_send_duration_seconds',
  'Wall-clock duration of an outbound transactional mail send (including retries).',
  [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30],
  ['provider', 'kind', 'outcome'],
);

export const emailVerificationTokensIssuedTotal = new Counter(
  'email_verification_tokens_issued_total',
  'Email verification tokens minted.',
  ['outcome'],
);

export const emailVerificationTokensConsumedTotal = new Counter(
  'email_verification_tokens_consumed_total',
  'Email verification token redemption attempts.',
  ['outcome'],
);

export const marketplaceWebhooksTotal = new Counter(
  'marketplace_webhooks_total',
  'Marketplace webhook deliveries grouped by provider and outcome.',
  ['provider', 'outcome'],
);

export const mailFailoverStateChangesTotal = new Counter(
  'mail_failover_state_changes_total',
  'Transitions of the mailer failover breaker between closed/half-open/open.',
  ['from', 'to'],
);

export const mailFailoverPrimaryActive = new Gauge(
  'mail_failover_primary_active',
  'Set to 1 when the primary mailer (resend) is the currently-routed transport, 0 when failed over to the fallback (smtp).',
);

export const invitationsCreatedTotal = new Counter(
  'invitations_created_total',
  'Invitation tokens successfully minted, partitioned by whether the link is room-scoped or global.',
  ['scoped'],
);

export const invitationsRedeemedTotal = new Counter(
  'invitations_redeemed_total',
  'Invitation redemption attempts, partitioned by outcome.',
  ['outcome'],
);

export const invitationsMatrixMintFailuresTotal = new Counter(
  'invitations_matrix_mint_failures_total',
  'Synapse registration-token mint failures encountered while creating an invitation.',
  ['reason'],
);

export const __test__ = { Registry };
