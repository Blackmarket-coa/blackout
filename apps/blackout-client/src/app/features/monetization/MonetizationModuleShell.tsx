import { createElement, type ReactNode } from 'react';
import {
    getMonetizationAppMarketplacePath,
    getMonetizationBoostsPath,
    getMonetizationMarketplacePath,
    getMonetizationPath,
    getMonetizationQuestsPath,
    getMonetizationSubscriptionsPlansPath,
    getMonetizationThemePacksPath,
} from '../../pages/pathUtils';

type MonetizationModuleKey =
    | 'overview'
    | 'subscriptions'
    | 'boosts'
    | 'quests'
    | 'marketplace'
    | 'apps'
    | 'themes';

type MonetizationModuleShellProps = {
    active: MonetizationModuleKey;
    title: string;
    subtitle: string;
    children: ReactNode;
};

const navItems: Array<{ key: MonetizationModuleKey; label: string; href: string }> = [
    { key: 'overview', label: 'Overview', href: getMonetizationPath() },
    {
        key: 'subscriptions',
        label: 'Subscriptions',
        href: getMonetizationSubscriptionsPlansPath(),
    },
    { key: 'boosts', label: 'Boosts', href: getMonetizationBoostsPath() },
    { key: 'quests', label: 'Quests', href: getMonetizationQuestsPath() },
    { key: 'marketplace', label: 'Marketplace', href: getMonetizationMarketplacePath() },
    { key: 'apps', label: 'Apps', href: getMonetizationAppMarketplacePath() },
    { key: 'themes', label: 'Themes', href: getMonetizationThemePacksPath() },
];

const cardStyle = {
    border: '1px solid var(--border-default)',
    borderRadius: 12,
    background: 'var(--bg-surface)',
    padding: 12,
};

export const MonetizationModuleShell = ({
    active,
    title,
    subtitle,
    children,
}: MonetizationModuleShellProps) =>
    createElement(
        'section',
        { style: { display: 'grid', gap: 12, padding: 12 } },
        createElement(
            'header',
            { style: { ...cardStyle, display: 'grid', gap: 8 } },
            createElement('h2', { style: { margin: 0 } }, 'Monetization Module'),
            createElement('small', { style: { color: 'var(--text-secondary)' } }, subtitle),
            createElement(
                'nav',
                {
                    style: {
                        display: 'flex',
                        gap: 8,
                        flexWrap: 'wrap',
                    },
                },
                ...navItems.map((item) =>
                    createElement(
                        'a',
                        {
                            key: item.key,
                            href: item.href,
                            style: {
                                border: '1px solid var(--border-default)',
                                borderRadius: 8,
                                padding: '4px 10px',
                                background: item.key === active ? 'var(--accent-muted)' : 'var(--bg-input)',
                                color: 'var(--text-primary)',
                                textDecoration: 'none',
                                fontSize: 12,
                                fontWeight: item.key === active ? 700 : 500,
                            },
                        },
                        item.label,
                    ),
                ),
            ),
        ),
        createElement(
            'article',
            {
                style: {
                    ...cardStyle,
                    display: 'grid',
                    gap: 8,
                },
            },
            createElement('h3', { style: { margin: 0 } }, title),
            children,
        ),
    );

export type { MonetizationModuleKey };
