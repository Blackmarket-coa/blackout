export type SettingsStorageOperation = 'get' | 'set' | 'remove';

export type SettingsTelemetryEvent =
    | {
          name: 'settings_interaction';
          section: string;
          control: string;
          value?: string | number | boolean;
      }
    | {
          name: 'settings_navigation';
          fromSection: string;
          toSection: string;
      }
    | {
          name: 'settings_save_outcome';
          key: string;
          operation: SettingsStorageOperation;
          success: boolean;
      }
    | {
          name: 'settings_save_failed';
          key: string;
          operation: SettingsStorageOperation;
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

export const trackSettingsNavigation = (fromSection: string, toSection: string) => {
    emitTelemetry({ name: 'settings_navigation', fromSection, toSection });
};

export const trackSettingsSaveOutcome = (
    key: string,
    operation: SettingsStorageOperation,
    success: boolean,
) => {
    emitTelemetry({ name: 'settings_save_outcome', key, operation, success });
};

export const trackSettingsSaveFailure = (
    key: string,
    operation: SettingsStorageOperation,
    error: unknown,
) => {
    emitTelemetry({
        name: 'settings_save_failed',
        key,
        operation,
        reason: error instanceof Error ? error.message : String(error),
    });
};
