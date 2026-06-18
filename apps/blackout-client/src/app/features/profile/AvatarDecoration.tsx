import type { CSSProperties } from 'react';
import { useAtomValue } from 'jotai';
import { avatarDecorationCatalogAtom } from './cosmeticsAtoms';

interface AvatarDecorationProps {
    avatarUrl?: string;
    displayName: string;
    decorationId?: string;
    size?: number;
}

const getInitials = (displayName: string): string =>
    displayName
        .split(' ')
        .map((part) => part.trim()[0])
        .filter(Boolean)
        .slice(0, 2)
        .join('')
        .toUpperCase();

export const AvatarDecoration = ({
    avatarUrl,
    displayName,
    decorationId,
    size = 88,
}: AvatarDecorationProps) => {
    const catalog = useAtomValue(avatarDecorationCatalogAtom);
    const decoration = catalog.find((item) => item.id === decorationId && item.id !== 'none');

    // Old Discord default avatar colors (blurple shades)
    const discordAvatarColors = ['#7289DA', '#5865F2', '#57F287', '#FEE75C', '#EB459E'];
    // Guard the empty-name case: `''.charCodeAt(0)` is NaN, which would index out
    // of the palette. Fall back to a stable placeholder so the swatch + initials
    // stay valid while the self-profile is still hydrating.
    const safeName = displayName.trim() || '?';
    const colorIndex = safeName.charCodeAt(0) % discordAvatarColors.length;

    const avatarStyle: CSSProperties = {
        width: size,
        height: size,
        borderRadius: '50%',
        objectFit: 'cover',
        background: discordAvatarColors[colorIndex],
        display: 'grid',
        placeItems: 'center',
        fontWeight: 700,
        fontSize: Math.max(14, Math.floor(size / 3.3)),
        color: '#FFFFFF',
        userSelect: 'none',
    };

    return (
        <div style={{ position: 'relative', width: size, height: size }}>
            {avatarUrl ? (
                <img src={avatarUrl} alt={safeName} style={avatarStyle} />
            ) : (
                <div style={avatarStyle}>{getInitials(safeName)}</div>
            )}
            {decoration ? (
                <div
                    aria-hidden
                    style={{
                        position: 'absolute',
                        inset: -4,
                        borderRadius: '50%',
                        padding: 3,
                        background: decoration.cssGradient,
                        boxShadow: `0 0 0 1px rgba(255,255,255,0.25), 0 0 18px ${decoration.cssGlow}`,
                        mask: 'radial-gradient(circle, transparent 56%, black 60%)',
                        WebkitMask: 'radial-gradient(circle, transparent 56%, black 60%)',
                        pointerEvents: 'none',
                    }}
                />
            ) : null}
        </div>
    );
};

export default AvatarDecoration;
