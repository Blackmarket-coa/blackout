import { type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

const baseStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '4px 10px',
    minHeight: 28,
    borderRadius: 999,
    border: '1px solid var(--border-default, #374151)',
    background: 'var(--bg-input, #0f172a)',
    color: 'var(--text-primary, #f8fafc)',
    fontSize: 12,
    fontWeight: 500,
    lineHeight: 1.2,
    cursor: 'pointer',
    textDecoration: 'none',
    whiteSpace: 'nowrap',
    flexShrink: 0,
};

const activeStyle: CSSProperties = {
    background: 'var(--accent-primary-soft, #1e3a8a)',
    borderColor: 'var(--accent-primary, #3b82f6)',
    color: 'var(--text-primary, #f8fafc)',
};

const countStyle: CSSProperties = {
    fontSize: 11,
    fontWeight: 400,
    color: 'var(--text-muted, #9ca3af)',
};

export type TagChipProps = {
    label: string;
    /**
     * Render-as override. When `to` is set we emit a Link; otherwise a
     * button. Both round-trip the click through `onSelect` so the
     * caller can update local filter state without a navigation.
     */
    to?: string;
    onSelect?: (label: string) => void;
    active?: boolean;
    /**
     * Optional usage count rendered as a faint trailing number. Used by
     * TopicChipBar to surface frequency without a tooltip.
     */
    count?: number;
    children?: ReactNode;
    'data-testid'?: string;
};

/**
 * Pill-style chip for topic / tag affordances. Wraps the surrounding
 * theme tokens so HomeFeed, TopicView, and the existing
 * DiscoverySurface filter strip can adopt a single primitive in
 * subsequent PRs.
 */
export const TagChip = ({
    label,
    to,
    onSelect,
    active = false,
    count,
    children,
    ...rest
}: TagChipProps): JSX.Element => {
    const style = active ? { ...baseStyle, ...activeStyle } : baseStyle;
    const inner = (
        <>
            <span>{children ?? label}</span>
            {typeof count === 'number' ? <span style={countStyle}>{count}</span> : null}
        </>
    );

    const handleClick = (event: React.MouseEvent<HTMLElement>) => {
        if (!onSelect) return;
        if (to && (event.metaKey || event.ctrlKey || event.shiftKey)) return;
        if (to) event.preventDefault();
        onSelect(label);
    };

    const sharedDataProps = {
        'data-tag-label': label,
        'data-active': active ? 'true' : 'false',
        'data-testid': rest['data-testid'] ?? 'tag-chip',
    };

    if (to) {
        return (
            <Link
                to={to}
                style={style}
                onClick={handleClick}
                aria-pressed={active ? 'true' : undefined}
                {...sharedDataProps}
            >
                {inner}
            </Link>
        );
    }

    return (
        <button
            type="button"
            style={style}
            onClick={handleClick}
            aria-pressed={active ? 'true' : 'false'}
            {...sharedDataProps}
        >
            {inner}
        </button>
    );
};

export default TagChip;
