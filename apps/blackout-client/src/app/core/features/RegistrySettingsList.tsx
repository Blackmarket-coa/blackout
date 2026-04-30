import React, { createElement } from 'react';
import { buildFeatureRegistry } from './buildRegistry';
import { composeFeatureSettings } from './composition';
import { defaultFeatureFlags, type FeatureFlags } from './featureFlags';
import { useCapabilityContext } from './capabilityContext';

type RegistrySettingsListProps = {
    /** Optional filter — only sections whose label matches the predicate render. */
    filter?: (section: string) => boolean;
    /** Optional className applied to the outer wrapper. */
    className?: string;
};

/**
 * Emits registry-declared settings sections under their declared headings.
 *
 * Renders nothing when the capability context grants no matching
 * sections, so the canonical settings shell can mount this component
 * without producing empty IA chrome.
 */
export function RegistrySettingsList({ filter, className }: RegistrySettingsListProps) {
    const ctx = useCapabilityContext();
    const registry = buildFeatureRegistry(
        { ...defaultFeatureFlags, ...(ctx.flags ?? {}) } as FeatureFlags
    );
    const sections = composeFeatureSettings(registry, ctx).filter((entry) =>
        filter ? filter(entry.section) : true
    );

    if (sections.length === 0) return null;

    return (
        <div className={className} data-testid="registry-settings-list">
            {sections.map((entry, index) => (
                <section
                    key={`${entry.section}:${index}`}
                    data-testid={`registry-settings-section-${entry.section}`}
                >
                    <h2>{entry.section}</h2>
                    {createElement(entry.component)}
                </section>
            ))}
        </div>
    );
}
