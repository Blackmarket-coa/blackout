export type ReleaseCohort = "internal" | "beta" | "general";

export type SessionLengthBucket = "0-5m" | "5-15m" | "15-30m" | "30m+";

export type TelemetryEventName =
  | "preset_adoption_seen"
  | "preset_applied"
  | "preset_rollback"
  | "feature_open_success"
  | "feature_open_denied"
  | "notification_sent"
  | "notification_opened"
  | "notification_muted"
  | "discover_item_shown"
  | "discover_item_clicked"
  | "break_prompt_shown"
  | "break_prompt_accepted"
  | "break_prompt_dismissed"
  | "session_length_bucket"
  | "onboarding_step_viewed"
  | "onboarding_step_completed"
  | "onboarding_step_dropped"
  | "advanced_panel_viewed"
  | "advanced_module_entered"
  | "kpi_ttfv"
  | "kpi_ttfv_checkpoint"
  | "kpi_onboarding_completion"
  | "kpi_invite_completion"
  | "kpi_advanced_feature_discovery";

export interface TelemetryEvent {
  name: TelemetryEventName | string;
  timestamp: string;
  cohort: ReleaseCohort;
  payload: Record<string, string | number | boolean | null>;
}

export interface TelemetryClient {
  track(name: TelemetryEventName | string, payload: Record<string, string | number | boolean | null>): void;
}

export function createSessionLengthBucket(sessionMinutes: number): SessionLengthBucket {
  if (sessionMinutes < 5) return "0-5m";
  if (sessionMinutes < 15) return "5-15m";
  if (sessionMinutes < 30) return "15-30m";
  return "30m+";
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
