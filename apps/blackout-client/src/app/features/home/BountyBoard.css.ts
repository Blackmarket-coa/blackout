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

export const cardActions = style({
    display: 'flex',
    gap: 8,
    marginTop: 4,
});

export const applyButton = style({
    alignSelf: 'flex-start',
    padding: '4px 12px',
    fontSize: 12,
    fontWeight: 600,
    borderRadius: 999,
    border: `1px solid ${bmcPalette.forest}`,
    background: 'transparent',
    color: 'inherit',
    cursor: 'pointer',
    transition: 'background 140ms ease',
    selectors: {
        '&:hover:not(:disabled)': {
            background: 'color-mix(in srgb, currentColor 12%, transparent)',
        },
        '&:disabled': {
            cursor: 'default',
            opacity: 0.7,
        },
    },
});

export const detailsButton = style([
    applyButton,
    {
        border: '1px solid var(--border-default, #2E5A42)',
    },
]);

// --- detail overlay ---

export const overlay = style({
    position: 'fixed',
    inset: 0,
    zIndex: 1000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
});

export const backdrop = style({
    position: 'absolute',
    inset: 0,
    background: 'rgba(0,0,0,0.55)',
});

export const panel = style({
    position: 'relative',
    zIndex: 1,
    width: 'min(560px, 100%)',
    maxHeight: '85vh',
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    padding: '20px 22px',
    borderRadius: 18,
    border: '1px solid var(--border-default, #2E5A42)',
    background: 'var(--bg-surface, #0f172a)',
    color: 'var(--text-primary, #f8fafc)',
    boxShadow: '0 24px 60px -20px rgba(0,0,0,0.6)',
});

export const closeButton = style({
    position: 'absolute',
    top: 12,
    right: 14,
    width: 28,
    height: 28,
    borderRadius: '50%',
    border: '1px solid var(--border-default, #2E5A42)',
    background: 'transparent',
    color: 'inherit',
    fontSize: 18,
    lineHeight: '1',
    cursor: 'pointer',
});

export const detailTitle = style({
    margin: 0,
    fontSize: 20,
    fontWeight: 800,
});

export const detailDescription = style({
    margin: 0,
    fontSize: 14,
    color: 'var(--text-muted, #9EC4AF)',
    whiteSpace: 'pre-wrap',
});

export const detailList = style({
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
});

export const detailUl = style({
    margin: '4px 0 0',
    paddingInlineStart: 18,
    fontSize: 13,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
});

export const applicantRow = style({
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
    padding: '8px 10px',
    borderRadius: 12,
    border: '1px solid var(--border-default, #2E5A42)',
    marginTop: 6,
});

export const applicantId = style({
    fontSize: 13,
    fontWeight: 600,
});

export const applicantMessage = style({
    fontSize: 12,
    color: 'var(--text-muted, #9EC4AF)',
    flex: '1 1 100%',
});

export const applicantStatus = style({
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: 'var(--text-muted, #9EC4AF)',
    marginInlineStart: 'auto',
});
