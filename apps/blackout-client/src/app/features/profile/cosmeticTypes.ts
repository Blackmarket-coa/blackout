/**
 * Shared model for purchasable profile cosmetics (Workstream 1). A cosmetic is
 * delivered as the payload of a `profile_cosmetic` marketplace entitlement; the
 * installer decodes it onto the persisted plugin record, and the profile
 * surfaces resolve equipped cosmetics against the built-in catalog + owned set.
 *
 * Kept dependency-free (no jotai / react) so both the installer and the catalog
 * atoms can import it without a cycle.
 */

export type CosmeticType = 'avatar_decoration' | 'nameplate' | 'profile_effect' | 'badge';

export type ProfileEffectKind = 'sparkle' | 'aurora' | 'pulse' | 'confetti';

export interface OwnedCosmetic {
    cosmeticType: CosmeticType;
    id: string;
    label: string;
    /** avatar_decoration ring / nameplate background. */
    cssGradient?: string;
    /** avatar_decoration glow color. */
    cssGlow?: string;
    /** nameplate text color. */
    textColor?: string;
    /** profile_effect preset. */
    effect?: ProfileEffectKind;
    /** badge glyph (emoji or short text). */
    glyph?: string;
    /** badge accent color. */
    color?: string;
}

const COSMETIC_TYPES: readonly CosmeticType[] = [
    'avatar_decoration',
    'nameplate',
    'profile_effect',
    'badge',
];

const PROFILE_EFFECTS: readonly ProfileEffectKind[] = ['sparkle', 'aurora', 'pulse', 'confetti'];

const ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;

/**
 * Allow-list sanitizer for cosmetic CSS values (gradients/colors). Permits the
 * characters a gradient/color function needs while rejecting anything that
 * could escape the CSS value context or exfiltrate via url()/expression().
 * Returns null when the value is unsafe so the caller drops just that field.
 */
export function sanitizeCosmeticCssValue(raw: unknown): string | null {
    if (typeof raw !== 'string') return null;
    const value = raw.trim().slice(0, 300);
    if (value.length === 0) return null;
    if (/[;{}<>"`\\]/.test(value)) return null;
    if (/url\s*\(|expression\s*\(|behavior\s*:|@import|@charset/i.test(value)) return null;
    if (!/^[a-zA-Z0-9 #(),.%/_-]+$/.test(value)) return null;
    return value;
}

function optionalCss(obj: Record<string, unknown>, key: string): string | undefined {
    const value = sanitizeCosmeticCssValue(obj[key]);
    return value ?? undefined;
}

/**
 * Parse + sanitize an untrusted cosmetic payload (from a marketplace bundle)
 * into an OwnedCosmetic, or return null if it isn't a usable cosmetic. Defensive
 * against arbitrary provider/bundle data.
 */
export function parseOwnedCosmetic(payload: unknown): OwnedCosmetic | null {
    if (!payload || typeof payload !== 'object') return null;
    const data = payload as Record<string, unknown>;
    const cosmeticType = data.cosmeticType;
    if (typeof cosmeticType !== 'string' || !COSMETIC_TYPES.includes(cosmeticType as CosmeticType)) {
        return null;
    }
    const id = typeof data.id === 'string' && ID_RE.test(data.id) ? data.id : null;
    if (!id) return null;
    const label =
        typeof data.label === 'string' && data.label.trim().length > 0
            ? data.label.trim().slice(0, 80)
            : id;

    const cosmetic: OwnedCosmetic = { cosmeticType: cosmeticType as CosmeticType, id, label };

    switch (cosmetic.cosmeticType) {
        case 'avatar_decoration':
            cosmetic.cssGradient = optionalCss(data, 'cssGradient') ?? gradientFrom(data.gradient);
            cosmetic.cssGlow = optionalCss(data, 'cssGlow');
            break;
        case 'nameplate':
            cosmetic.cssGradient = optionalCss(data, 'cssGradient') ?? gradientFrom(data.gradient);
            cosmetic.textColor = optionalCss(data, 'textColor');
            break;
        case 'profile_effect': {
            const effect = data.effect;
            cosmetic.effect =
                typeof effect === 'string' && PROFILE_EFFECTS.includes(effect as ProfileEffectKind)
                    ? (effect as ProfileEffectKind)
                    : 'sparkle';
            break;
        }
        case 'badge':
            cosmetic.glyph =
                typeof data.glyph === 'string' ? data.glyph.trim().slice(0, 8) || '★' : '★';
            cosmetic.color = optionalCss(data, 'color');
            break;
    }
    return cosmetic;
}

/** Build a linear-gradient from a `string[]` of color stops (a common payload shape). */
function gradientFrom(stops: unknown): string | undefined {
    if (!Array.isArray(stops)) return undefined;
    const colors = stops
        .map((s) => sanitizeCosmeticCssValue(s))
        .filter((s): s is string => Boolean(s));
    if (colors.length < 2) return undefined;
    return `linear-gradient(135deg, ${colors.join(', ')})`;
}
