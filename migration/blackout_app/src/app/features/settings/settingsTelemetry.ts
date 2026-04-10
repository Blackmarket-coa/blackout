export type SettingsTelemetryEvent =
    | {
          name: 'settings_interaction';
          section: string;
          control: string;
          value?: string | number | boolean;
      }
    | {
          name: 'settings_save_failed';
          key: string;
          operation: 'get' | 'set' | 'remove';
          reason: string;
      };

const emitTelemetry = (event: SettingsTelemetryEvent) => {
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('blackout:telemetry', { detail: event }));
    }
};

export const trackSettingsInteraction = (
    section: string,
    control: string,
    value?: string | number | boolean,
) => {
    emitTelemetry({ name: 'settings_interaction', section, control, value });
};

export const trackSettingsSaveFailure = (
    key: string,
    operation: 'get' | 'set' | 'remove',
    error: unknown,
) => {
    emitTelemetry({
        name: 'settings_save_failed',
        key,
        operation,
        reason: error instanceof Error ? error.message : String(error),
    });
};
