import type { CSSProperties } from 'react';
import { availableDecorations } from './profileAtoms';

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

export const AvatarDecoration = ({ avatarUrl, displayName, decorationId, size = 88 }: AvatarDecorationProps) => {
  const decoration = availableDecorations.find((item) => item.id === decorationId && item.id !== 'none');

  const avatarStyle: CSSProperties = {
    width: size,
    height: size,
    borderRadius: '50%',
    objectFit: 'cover',
    background: 'var(--bg-input)',
    display: 'grid',
    placeItems: 'center',
    fontWeight: 700,
    fontSize: Math.max(14, Math.floor(size / 3.3)),
    color: 'var(--text-primary)',
  };

  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      {avatarUrl ? <img src={avatarUrl} alt={displayName} style={avatarStyle} /> : <div style={avatarStyle}>{getInitials(displayName)}</div>}
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
