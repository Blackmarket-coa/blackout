export type ReleaseCohort = "internal" | "beta" | "general";

export interface TelemetryEvent {
  name: string;
  timestamp: string;
  cohort: ReleaseCohort;
  payload: Record<string, string | number | boolean | null>;
}

export interface TelemetryClient {
  track(name: string, payload: Record<string, string | number | boolean | null>): void;
}

export function createTelemetryClient(cohort: ReleaseCohort): TelemetryClient {
  return {
    track(name, payload) {
      const event: TelemetryEvent = {
        name,
        timestamp: new Date().toISOString(),
        cohort,
        payload,
      };

      globalThis.dispatchEvent?.(new CustomEvent("blackout:telemetry", { detail: event }));
    },
  };
}
