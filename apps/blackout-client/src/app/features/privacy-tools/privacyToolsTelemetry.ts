type PrivacyToolsTelemetryDetail =
    | {
          name: 'privacy_tools_baseline_used';
          feature: 'exif_strip' | 'link_sanitize';
      }
    | {
          name: 'privacy_tools_upgrade_intent';
          source: string;
      };

const emitPrivacyToolsTelemetry = (detail: PrivacyToolsTelemetryDetail) => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent('blackout:telemetry', { detail }));
};

export const trackPrivacyBaselineUsage = (feature: 'exif_strip' | 'link_sanitize') => {
    emitPrivacyToolsTelemetry({ name: 'privacy_tools_baseline_used', feature });
};

export const openPrivacyUpgradeFlow = (source: string) => {
    if (typeof window !== 'undefined') {
        window.dispatchEvent(
            new CustomEvent('blackout:privacy-tools-upgrade-flow', {
                detail: { source },
            })
        );
    }
    emitPrivacyToolsTelemetry({ name: 'privacy_tools_upgrade_intent', source });
};
