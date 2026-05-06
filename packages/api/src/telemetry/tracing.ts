/**
 * Optional OpenTelemetry SDK init. Activated when OTEL_EXPORTER_OTLP_ENDPOINT
 * (or OTEL_EXPORTER_OTLP_TRACES_ENDPOINT) is set.
 *
 * As with errors.ts, the SDK is loaded dynamically. Production deployments
 * that want tracing install @opentelemetry/sdk-node + auto-instrumentations
 * via the api workspace; everything else gets a quiet no-op.
 */

import { log } from './logger';

export interface TracingHandle {
  shutdown(): Promise<void>;
}

class NoopTracing implements TracingHandle {
  async shutdown(): Promise<void> {
    /* no-op */
  }
}

let active: TracingHandle = new NoopTracing();
let initialized = false;

export const initTracing = async (): Promise<TracingHandle> => {
  if (initialized) return active;
  initialized = true;

  const endpoint =
    process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT ?? process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (!endpoint?.trim()) return active;

  try {
    const sdkModule = (await import('@opentelemetry/sdk-node')) as typeof import('@opentelemetry/sdk-node');
    const autoModule = (await import('@opentelemetry/auto-instrumentations-node')) as typeof import('@opentelemetry/auto-instrumentations-node');

    const sdk = new sdkModule.NodeSDK({
      serviceName: process.env.OTEL_SERVICE_NAME ?? 'blackout-api',
      instrumentations: [autoModule.getNodeAutoInstrumentations()],
    });
    sdk.start();
    active = {
      async shutdown() {
        await sdk.shutdown();
      },
    };
    log.info('tracing:initialized', { endpoint });
  } catch (err) {
    log.warn('tracing: OTEL endpoint set but SDK is not installed; running without tracing', {
      error: String(err),
    });
  }
  return active;
};

export const __test__ = {
  reset(): void {
    initialized = false;
    active = new NoopTracing();
  },
};
