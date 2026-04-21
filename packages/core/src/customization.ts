import {
  FEATURE_PRESET_BUNDLES,
  normalizeFeaturePresetKey,
  type FeatureFlagMap,
  type FeaturePresetKey,
} from './feature-presets';
import { normalizeThemeId, type BlackoutThemeId } from './themes';

export const BLACKOUT_CUSTOMIZATION_BUNDLE_VERSION = 1;

export interface BlackoutCustomizationBundle {
  version: typeof BLACKOUT_CUSTOMIZATION_BUNDLE_VERSION;
  source: 'blackout-web' | 'blackout-client';
  activePreset: FeaturePresetKey;
  features: FeatureFlagMap;
  theme: BlackoutThemeId;
  exportedAt: string;
}

function sanitizeFeatureMap(flags: FeatureFlagMap | null | undefined): FeatureFlagMap | undefined {
  if (!flags) return undefined;
  return Object.fromEntries(
    Object.entries(flags).filter(([, value]) => typeof value === 'boolean'),
  );
}

export function createCustomizationBundle(input: {
  source: BlackoutCustomizationBundle['source'];
  activePreset: FeaturePresetKey | string | null | undefined;
  features?: FeatureFlagMap | null;
  theme: BlackoutThemeId | string | null | undefined;
  exportedAt?: string;
}): BlackoutCustomizationBundle {
  const activePreset = normalizeFeaturePresetKey(input.activePreset) ?? 'sovereignty';
  const features = sanitizeFeatureMap(input.features) ?? {
    ...FEATURE_PRESET_BUNDLES[activePreset],
  };

  return {
    version: BLACKOUT_CUSTOMIZATION_BUNDLE_VERSION,
    source: input.source,
    activePreset,
    features,
    theme: normalizeThemeId(input.theme),
    exportedAt: input.exportedAt ?? new Date().toISOString(),
  };
}

export function serializeCustomizationBundle(bundle: BlackoutCustomizationBundle): string {
  return JSON.stringify(bundle, null, 2);
}

export function parseCustomizationBundle(
  raw: string,
): BlackoutCustomizationBundle | null {
  try {
    const parsed = JSON.parse(raw) as Partial<BlackoutCustomizationBundle>;
    if (parsed.version !== BLACKOUT_CUSTOMIZATION_BUNDLE_VERSION) return null;
    if (parsed.source !== 'blackout-web' && parsed.source !== 'blackout-client') return null;

    return createCustomizationBundle({
      source: parsed.source,
      activePreset: parsed.activePreset,
      features: parsed.features,
      theme: parsed.theme,
      exportedAt:
        typeof parsed.exportedAt === 'string' ? parsed.exportedAt : new Date().toISOString(),
    });
  } catch {
    return null;
  }
}
