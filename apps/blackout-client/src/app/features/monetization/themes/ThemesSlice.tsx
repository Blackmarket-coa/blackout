import { createElement } from 'react';
import { useAtomValue } from 'jotai';
import { themePreviews } from '../../settings/theme-previews';
import { appearanceSettingsAtom } from '../../settings/settingsAtoms';
import { BLACKOUT_THEMES } from '../../../plugins/theme/themeCatalog';
import { themeTokenMap } from '../../../styles/theme-engine';
import { monetizationThemeBundleAppearanceCtaPath } from './themeBundleCta';

const previewById = new Map(themePreviews.map((preview) => [preview.value, preview]));

export const ThemesSlice = () => {
    const appearance = useAtomValue(appearanceSettingsAtom);

    return createElement(
        'section',
        { style: { display: 'grid', gap: 10 } },
        createElement(
            'p',
            { style: { margin: 0, color: 'var(--text-secondary)' } },
            `BMC theme bundles are linked to the shared theme catalog and current appearance state (active: ${appearance.theme}).`,
        ),
        createElement(
            'a',
            {
                href: monetizationThemeBundleAppearanceCtaPath,
                style: {
                    color: 'var(--accent-primary)',
                    fontWeight: 600,
                    textDecoration: 'none',
                },
            },
            'Open appearance settings',
        ),
        createElement(
            'div',
            {
                style: {
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                    gap: 8,
                },
            },
            ...BLACKOUT_THEMES.map((theme) => {
                const preview = previewById.get(theme.id);
                const tokens = themeTokenMap[theme.id];
                const isActive = appearance.theme === theme.id;

                return createElement(
                    'article',
                    {
                        key: theme.id,
                        style: {
                            border: `1px solid ${isActive ? 'var(--border-active)' : 'var(--border-default)'}`,
                            borderRadius: 10,
                            background: 'var(--bg-input)',
                            padding: 10,
                            display: 'grid',
                            gap: 8,
                        },
                    },
                    createElement(
                        'div',
                        {
                            style: {
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                gap: 8,
                            },
                        },
                        createElement('strong', undefined, theme.label),
                        isActive
                            ? createElement(
                                  'span',
                                  {
                                      style: {
                                          borderRadius: 999,
                                          padding: '2px 8px',
                                          fontSize: 11,
                                          background: 'var(--accent-muted)',
                                      },
                                  },
                                  'Active',
                              )
                            : null,
                    ),
                    createElement('small', { style: { color: 'var(--text-secondary)' } }, theme.description),
                    createElement(
                        'div',
                        { style: { display: 'flex', gap: 6 } },
                        ...(preview?.swatches ?? [tokens.bg.surface, tokens.accent.primary, tokens.text.primary]).map(
                            (swatch, index) =>
                                createElement('span', {
                                    key: `${theme.id}-${index}`,
                                    title: swatch,
                                    style: {
                                        width: 18,
                                        height: 18,
                                        borderRadius: 999,
                                        background: swatch,
                                        border: '1px solid var(--border-default)',
                                    },
                                }),
                        ),
                    ),
                );
            }),
        ),
    );
};
