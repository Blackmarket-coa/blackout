// Hardcoded gift catalog. Each gift is a single-shot purchase that resolves
// to a tip record carrying the same `sku` so the recipient sees the sprite
// rendered next to the amount. Prices are integers in cents and form a
// progression suitable for stream-chat micro-tipping.
//
// Adding a gift here is the only change required — both server (tips +
// gifts services) and client (renderer) consume this list directly. SKUs
// are stable identifiers; rename = breaking change.

export interface GiftDefinition {
    /** Stable opaque identifier persisted on tips.gift_sku. */
    sku: string;
    /** Short human-readable label for the gift picker UI. */
    label: string;
    /** Amount tipped in cents (3% to FBM, rest to recipient). */
    priceCents: number;
    /** Currency code; gifts are sold in USD only for the MVP. */
    currency: 'USD';
    /** Glyph used by the renderer (emoji or short token). */
    sprite: string;
}

export const GIFT_CATALOG: readonly GiftDefinition[] = [
    { sku: 'spark', label: 'Spark', priceCents: 100, currency: 'USD', sprite: '✨' },
    { sku: 'flame', label: 'Flame', priceCents: 250, currency: 'USD', sprite: '🔥' },
    { sku: 'rocket', label: 'Rocket', priceCents: 500, currency: 'USD', sprite: '🚀' },
    { sku: 'crown', label: 'Crown', priceCents: 1_000, currency: 'USD', sprite: '👑' },
    { sku: 'diamond', label: 'Diamond', priceCents: 2_500, currency: 'USD', sprite: '💎' },
    { sku: 'galaxy', label: 'Galaxy', priceCents: 5_000, currency: 'USD', sprite: '🌌' },
] as const;

export function findGift(sku: string): GiftDefinition | undefined {
    return GIFT_CATALOG.find((gift) => gift.sku === sku);
}

export const GIFT_SKUS: readonly string[] = GIFT_CATALOG.map((g) => g.sku);
