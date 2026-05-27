import React, { type CSSProperties, type ReactNode } from 'react';

interface FeatureGuideProps {
    children: ReactNode;
    /** Optional override for the leading glyph. */
    icon?: ReactNode;
    style?: CSSProperties;
}

const wrapStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 8,
    padding: '6px 12px',
    borderBottom: '1px solid var(--border-default)',
    background: 'var(--bg-input)',
    color: 'var(--text-secondary)',
    fontSize: 12,
    lineHeight: 1.4,
};

/**
 * A slim, always-present hint strip describing what a surface is and how to use
 * it. Deliberately has no dismiss control: the guidance lingers so newcomers can
 * re-read it, while the muted styling keeps it quiet for everyone else.
 */
export function FeatureGuide({
    children,
    icon = 'ⓘ',
    style,
}: FeatureGuideProps): React.ReactElement {
    return (
        <div role="note" data-testid="feature-guide" style={{ ...wrapStyle, ...style }}>
            <span aria-hidden style={{ opacity: 0.7 }}>
                {icon}
            </span>
            <span>{children}</span>
        </div>
    );
}

export default FeatureGuide;
