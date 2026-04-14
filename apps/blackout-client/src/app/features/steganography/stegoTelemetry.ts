type StegoTelemetryDetail =
    | {
          name: 'stego_baseline_used';
          surface: 'composer';
          hasAdvancedEntitlement: boolean;
      }
    | {
          name: 'stego_upgrade_intent';
          source: string;
      };

const emitStegoTelemetry = (detail: StegoTelemetryDetail) => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent('blackout:telemetry', { detail }));
};

export const trackStegoBaselineUsage = (hasAdvancedEntitlement: boolean) => {
    emitStegoTelemetry({
        name: 'stego_baseline_used',
        surface: 'composer',
        hasAdvancedEntitlement,
    });
};

export const openStegoUpgradeFlow = (source: string) => {
    if (typeof window !== 'undefined') {
        window.dispatchEvent(
            new CustomEvent('blackout:stego-upgrade-flow', {
                detail: { source },
            }),
        );
    }
    emitStegoTelemetry({
        name: 'stego_upgrade_intent',
        source,
    });
};
