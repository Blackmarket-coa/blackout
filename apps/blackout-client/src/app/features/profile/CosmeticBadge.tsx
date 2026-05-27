import { useAtomValue } from 'jotai';
import { badgeCatalogAtom, findCosmetic } from './cosmeticsAtoms';

interface CosmeticBadgesProps {
    badgeIds?: string[];
}

/**
 * Renders the row of equipped collectible badges. Each badge is a small chip
 * with its glyph + label, tinted by the badge's accent color.
 */
export const CosmeticBadges = ({ badgeIds }: CosmeticBadgesProps) => {
    const catalog = useAtomValue(badgeCatalogAtom);
    const badges = (badgeIds ?? [])
        .map((id) => findCosmetic(catalog, id))
        .filter((b): b is NonNullable<typeof b> => Boolean(b));
    if (badges.length === 0) return null;
    return (
        <div
            data-testid="profile-badges"
            style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}
        >
            {badges.map((badge) => (
                <span
                    key={badge.id}
                    data-badge={badge.id}
                    title={badge.label}
                    style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '2px 8px',
                        borderRadius: 999,
                        fontSize: 12,
                        border: `1px solid ${badge.color ?? 'var(--border-default)'}`,
                        color: badge.color ?? 'var(--text-secondary)',
                    }}
                >
                    <span aria-hidden>{badge.glyph ?? '★'}</span>
                    {badge.label}
                </span>
            ))}
        </div>
    );
};

export default CosmeticBadges;
