import type { MarketplaceCategory } from './provider';

/**
 * Human-friendly labels for each commerce shelf. Centralized here so every
 * surface (web browse tabs, mobile tabs, listing cards) renders the same
 * friendly name instead of the raw enum string.
 */
export const CATEGORY_LABELS: Record<MarketplaceCategory, string> = {
    'emoji-sticker': 'Emoji & Stickers',
    'meme-asset': 'Memes & Assets',
    'stego-software': 'Stego & Software',
    'plugin-curated': 'Plugins (Curated)',
    subscription: 'Subscriptions',
    'profile-cosmetic': 'Profile Cosmetics',
    'audio-pack': 'Audio Packs',
    'community-template': 'Community Templates',
    'creator-asset': 'Creator & Stream Assets',
    'security-tool': 'Security & Privacy',
    'ai-automation': 'AI & Automation',
};

export function categoryLabel(category: string): string {
    return CATEGORY_LABELS[category as MarketplaceCategory] ?? category;
}
