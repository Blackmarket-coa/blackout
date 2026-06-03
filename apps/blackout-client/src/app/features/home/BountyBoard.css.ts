import { style } from '@vanilla-extract/css';
import { bmcPalette } from '../../styles/theme-engine';

export const section = style({
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    padding: '4px 4px 12px',
});

export const label = style({
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: 'var(--text-muted, #9EC4AF)',
    margin: '8px 4px 0',
});

export const rail = style({
    display: 'flex',
    gap: 12,
    overflowX: 'auto',
    paddingBottom: 4,
    scrollbarWidth: 'thin',
});

export const card = style({
    position: 'relative',
    flex: '0 0 auto',
    width: 220,
    minHeight: 96,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'flex-end',
    gap: 6,
    padding: '12px 14px',
    borderRadius: 18,
    border: '1px solid var(--border-default, #2E5A42)',
    color: 'inherit',
    overflow: 'hidden',
    background: `linear-gradient(150deg, color-mix(in srgb, ${bmcPalette.forest} 30%, var(--bg-input)), color-mix(in srgb, var(--bg-surface) 85%, transparent))`,
});

export const categoryTag = style({
    display: 'inline-flex',
    alignItems: 'center',
    alignSelf: 'flex-start',
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    padding: '2px 8px',
    borderRadius: 999,
    color: bmcPalette.forest,
    background: 'color-mix(in srgb, currentColor 16%, transparent)',
});

export const title = style({
    fontSize: 14,
    fontWeight: 600,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
});

export const reward = style({
    fontSize: 12,
    fontWeight: 500,
    color: 'var(--text-muted, #9EC4AF)',
});
