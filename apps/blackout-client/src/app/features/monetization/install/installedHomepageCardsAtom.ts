import { atom } from 'jotai';
import { installedPluginsAtom } from './installedPluginsAtom';

export interface InstalledHomepageCard {
    pluginId: string;
    title: string;
    summary?: string;
    iconUrl?: string;
    href: string;
}

export const installedHomepageCardsAtom = atom<InstalledHomepageCard[]>((get) => {
    const cards: InstalledHomepageCard[] = [];
    for (const record of get(installedPluginsAtom)) {
        if (record.status !== 'enabled') continue;
        const card = record.manifest.homepageCard;
        if (!card) continue;
        cards.push({
            pluginId: record.manifest.id,
            title: card.title,
            summary: card.summary,
            iconUrl: card.iconUrl,
            href: card.href ?? `/plugins/${encodeURIComponent(record.manifest.id)}`,
        });
    }
    return cards;
});
