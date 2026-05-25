import { style } from '@vanilla-extract/css';
import { bmcPalette } from '../../styles/theme-engine';

const DESKTOP = 'screen and (min-width: 980px)';

export const root = style({
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    minHeight: '100%',
    width: '100%',
    background: 'var(--bg-surface, #0B0F10)',
    color: 'var(--text-primary, #F7FFF9)',
    isolation: 'isolate',
});

/** Sits above the ambient backdrop + canvas (both zIndex 0). */
export const content = style({
    position: 'relative',
    zIndex: 1,
    display: 'flex',
    flexDirection: 'column',
    minHeight: '100%',
});

export const header = style({
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 16,
    flexWrap: 'wrap',
    padding: '24px 20px 8px',
});

export const headerTitleCol = style({
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    minWidth: 0,
});

export const greeting = style({
    margin: 0,
    fontSize: 26,
    fontWeight: 700,
    letterSpacing: -0.4,
});

export const subtitle = style({
    margin: 0,
    color: 'var(--text-secondary, #DDF6E6)',
    fontSize: 14,
});

export const atmosphereRow = style({
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    marginTop: 4,
});

export const chip = style({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 12,
    fontWeight: 600,
    padding: '4px 10px',
    borderRadius: 999,
    border: '1px solid var(--border-default, #2E5A42)',
    background: 'color-mix(in srgb, var(--bg-input) 70%, transparent)',
    color: 'var(--text-secondary, #DDF6E6)',
});

export const headerActions = style({
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: 8,
});

export const iconButton = style({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    width: 'fit-content',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    padding: '5px 10px',
    borderRadius: 999,
    border: '1px solid var(--border-default, #2E5A42)',
    background: 'transparent',
    color: 'var(--text-secondary, #DDF6E6)',
    selectors: {
        '&:hover': { borderColor: 'var(--border-active, #2EF2C5)' },
        '&[aria-pressed=true]': {
            borderColor: 'var(--accent-primary, #D7FF3F)',
            color: 'var(--accent-primary, #D7FF3F)',
        },
    },
});

export const replayButton = style({
    width: 'fit-content',
    marginTop: 4,
    fontSize: 12,
    background: 'transparent',
    color: 'var(--accent-primary, #D7FF3F)',
    border: '1px solid var(--border-default, #2E5A42)',
    borderRadius: 999,
    padding: '4px 10px',
    cursor: 'pointer',
});

export const topicBar = style({ padding: '0 20px' });

export const grid = style({
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr)',
    gap: 20,
    padding: '12px 20px 28px',
    alignItems: 'start',
    '@media': {
        [DESKTOP]: {
            gridTemplateColumns: 'minmax(0, 1fr) 340px',
        },
    },
});

export const centerColumn = style({
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    minWidth: 0,
});

export const rightColumn = style({
    minWidth: 0,
    '@media': {
        [DESKTOP]: {
            position: 'sticky',
            top: 12,
        },
    },
});

export const section = style({
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
});

export const sectionLabel = style({
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: 'var(--text-muted, #9EC4AF)',
    margin: '4px 2px 0',
});

/** Curved organic separator between feed sections. */
export const wave = style({
    width: '100%',
    height: 18,
    opacity: 0.5,
    color: 'var(--border-default, #2E5A42)',
});

export const quickActions = style({
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
    gap: 10,
});

export const quickAction = style({
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    padding: '14px 16px',
    borderRadius: 18,
    border: '1px solid var(--border-default, #2E5A42)',
    background: `linear-gradient(150deg, color-mix(in srgb, ${bmcPalette.forest} 24%, var(--bg-input)), color-mix(in srgb, var(--bg-surface) 88%, transparent))`,
    color: 'inherit',
    textDecoration: 'none',
    transition: 'transform 160ms ease, border-color 160ms ease',
    selectors: {
        '&:hover': {
            transform: 'translateY(-2px)',
            borderColor: 'var(--border-active, #2EF2C5)',
        },
    },
});

export const quickActionTitle = style({ fontSize: 15, fontWeight: 700 });
export const quickActionSubtitle = style({
    fontSize: 12,
    color: 'var(--text-muted, #9EC4AF)',
});

export const emptyState = style({
    margin: '12px 2px',
    padding: '28px 22px',
    border: '1px dashed var(--border-default, #2E5A42)',
    borderRadius: 18,
    color: 'var(--text-muted, #9EC4AF)',
    fontSize: 14,
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
});

export const ctaLink = style({
    color: 'var(--accent-primary, #D7FF3F)',
    textDecoration: 'underline',
    fontWeight: 600,
});

export const feedList = style({
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
});

export const searchInput = style({
    width: '100%',
    boxSizing: 'border-box',
    padding: '10px 14px',
    borderRadius: 999,
    border: '1px solid var(--border-default, #2E5A42)',
    background: 'color-mix(in srgb, var(--bg-input) 80%, transparent)',
    color: 'var(--text-primary, #F7FFF9)',
    fontSize: 14,
    selectors: {
        '&:focus-visible': {
            outline: 'none',
            borderColor: 'var(--border-active, #2EF2C5)',
        },
    },
});

export const controlsRow = style({
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
});

export const pillGroup = style({ display: 'inline-flex', gap: 6 });

export const pill = style({
    padding: '6px 14px',
    borderRadius: 999,
    border: '1px solid var(--border-default, #2E5A42)',
    background: 'transparent',
    color: 'var(--text-secondary, #DDF6E6)',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'border-color 140ms ease, background 140ms ease',
    selectors: {
        '&:hover': { borderColor: 'var(--border-active, #2EF2C5)' },
    },
});

export const pillActive = style({
    borderColor: 'var(--accent-primary, #D7FF3F)',
    background: 'color-mix(in srgb, var(--accent-primary) 18%, transparent)',
    color: 'var(--accent-primary, #D7FF3F)',
});

export const sortPill = style({ padding: '4px 12px', fontSize: 12, fontWeight: 500 });
