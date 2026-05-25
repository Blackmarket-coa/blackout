import { keyframes, style } from '@vanilla-extract/css';

const livePulse = keyframes({
    '0%': { boxShadow: '0 0 0 0 rgba(255,93,93,0.6)' },
    '70%': { boxShadow: '0 0 0 6px rgba(255,93,93,0)' },
    '100%': { boxShadow: '0 0 0 0 rgba(255,93,93,0)' },
});

export const sidebar = style({
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
    minWidth: 0,
});

export const module = style({
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    padding: '16px 16px 18px',
    borderRadius: 20,
    border: '1px solid var(--border-default, #2E5A42)',
    background:
        'linear-gradient(160deg, color-mix(in srgb, var(--bg-input) 92%, transparent), color-mix(in srgb, var(--bg-surface) 88%, transparent))',
    backdropFilter: 'blur(6px)',
    overflow: 'hidden',
});

export const moduleHeader = style({
    display: 'flex',
    alignItems: 'center',
    gap: 8,
});

export const moduleAccent = style({
    width: 10,
    height: 10,
    borderRadius: '50%',
    background: 'var(--module-accent, var(--accent-primary, #D7FF3F))',
    boxShadow: '0 0 10px var(--module-accent, var(--accent-primary, #D7FF3F))',
    flexShrink: 0,
});

export const moduleTitle = style({
    margin: 0,
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: 'var(--text-secondary, #DDF6E6)',
});

export const mockTag = style({
    marginLeft: 'auto',
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: 'var(--text-muted, #9EC4AF)',
    border: '1px solid var(--border-default, #2E5A42)',
    borderRadius: 999,
    padding: '1px 6px',
});

export const row = style({
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    padding: '8px 10px',
    borderRadius: 12,
    color: 'inherit',
    textDecoration: 'none',
    background: 'color-mix(in srgb, var(--bg-surface-hover) 60%, transparent)',
    selectors: {
        'a&:hover': { background: 'var(--bg-surface-hover, #151B1C)' },
    },
});

export const rowTitle = style({
    fontSize: 13,
    fontWeight: 600,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
});

export const rowMeta = style({
    fontSize: 11,
    color: 'var(--text-muted, #9EC4AF)',
});

export const liveDot = style({
    display: 'inline-block',
    width: 8,
    height: 8,
    borderRadius: '50%',
    marginRight: 6,
    background: 'var(--danger, #FF5D5D)',
    animation: `${livePulse} 2s ease-out infinite`,
    '@media': {
        '(prefers-reduced-motion: reduce)': { animation: 'none' },
    },
});

export const liveDotStatic = style({
    display: 'inline-block',
    width: 8,
    height: 8,
    borderRadius: '50%',
    marginRight: 6,
    background: 'var(--danger, #FF5D5D)',
});

export const pulseGrid = style({
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 8,
});

export const pulseCell = style({
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    padding: '8px 10px',
    borderRadius: 12,
    background: 'color-mix(in srgb, var(--bg-surface-hover) 55%, transparent)',
});

export const pulseValue = style({
    fontSize: 20,
    fontWeight: 700,
    lineHeight: 1,
    color: 'var(--accent-primary, #D7FF3F)',
});

export const pulseLabel = style({
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    color: 'var(--text-muted, #9EC4AF)',
});

export const weatherRow = style({
    display: 'flex',
    alignItems: 'center',
    gap: 12,
});

export const weatherIcon = style({ fontSize: 30, lineHeight: 1 });
export const weatherTemp = style({ fontSize: 22, fontWeight: 700 });

export const healthRow = style({ display: 'flex', flexDirection: 'column', gap: 4 });

export const healthHeader = style({
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: 12,
});

export const healthTrack = style({
    height: 6,
    borderRadius: 999,
    background: 'color-mix(in srgb, var(--bg-surface-hover) 70%, transparent)',
    overflow: 'hidden',
});

export const healthFill = style({
    height: '100%',
    borderRadius: 999,
    background:
        'linear-gradient(90deg, var(--accent-muted, #2E5A42), var(--accent-primary, #D7FF3F))',
});

export const emptyNote = style({
    fontSize: 12,
    color: 'var(--text-muted, #9EC4AF)',
});
