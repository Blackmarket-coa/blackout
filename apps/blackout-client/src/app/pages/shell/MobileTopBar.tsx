import { type CSSProperties } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { isShellModeRoot, resolveShellMode, SHELL_MODE_TITLES } from './modeRouter';

const TOP_BAR_STYLE: CSSProperties = {
    position: 'sticky',
    top: 0,
    zIndex: 30,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 16px',
    paddingTop: 'calc(env(safe-area-inset-top, 0) + 10px)',
    background: 'var(--bg-nav, #1f2937)',
    borderBottom: '1px solid var(--border-default, #374151)',
    color: 'var(--text-primary, #f8fafc)',
    fontSize: 15,
    fontWeight: 600,
    minHeight: 44,
};

const TITLE_STYLE: CSSProperties = {
    margin: 0,
    fontSize: 15,
    fontWeight: 600,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
};

const ACTIONS_STYLE: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
};

const BACK_BUTTON_STYLE: CSSProperties = {
    background: 'transparent',
    color: 'inherit',
    border: 'none',
    padding: 4,
    margin: 0,
    cursor: 'pointer',
    fontSize: 20,
    lineHeight: 1,
};

export type MobileTopBarProps = {
    /**
     * Optional override; when supplied, takes precedence over the
     * mode-derived title. Used by deep destinations (canopy → den) that
     * want to show the den name instead of the mode label.
     */
    title?: string;
    /**
     * Optional trailing action region (icons, buttons). AppShell defers
     * to the active route to populate this, so the top bar stays a thin
     * presentational shell.
     */
    trailing?: React.ReactNode;
    /**
     * Optional leading slot — typically a back button or hamburger. Left
     * unset on mode roots to keep them flat.
     */
    leading?: React.ReactNode;
};

/**
 * Mode-aware mobile top bar. Reads the current route, resolves the
 * AppShell mode, and renders the canonical mode title. Falls back to
 * `''` for unknown routes so the bar remains a neutral chrome strip
 * rather than a misleading label.
 */
export const MobileTopBar = ({ title, trailing, leading }: MobileTopBarProps) => {
    const location = useLocation();
    const navigate = useNavigate();
    const mode = resolveShellMode(location.pathname);
    const resolvedTitle = title ?? SHELL_MODE_TITLES[mode];
    const showDefaultBack = leading === undefined && !isShellModeRoot(location.pathname);
    const resolvedLeading = showDefaultBack ? (
        <button
            type="button"
            onClick={() => navigate(-1)}
            aria-label="Go back"
            data-testid="mobile-top-bar-back"
            style={BACK_BUTTON_STYLE}
        >
            ‹
        </button>
    ) : (
        leading
    );

    return (
        <header style={TOP_BAR_STYLE} data-shell-region="mobile-top-bar" data-shell-mode={mode}>
            <div style={ACTIONS_STYLE}>{resolvedLeading}</div>
            <h1 style={TITLE_STYLE} data-testid="mobile-top-bar-title">
                {resolvedTitle}
            </h1>
            <div style={ACTIONS_STYLE}>{trailing}</div>
        </header>
    );
};

export default MobileTopBar;
