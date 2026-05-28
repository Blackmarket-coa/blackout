import React from 'react';
import { ErrorBoundary } from 'react-error-boundary';

interface SafeHtmlBoundaryProps {
    html: string;
    className?: string;
    style?: React.CSSProperties;
    as?: 'div' | 'span' | 'p';
}

function FallbackText({ className, style, as: Tag = 'div' }: Omit<SafeHtmlBoundaryProps, 'html'>) {
    return React.createElement(Tag, { className, style }, '[Content unavailable]');
}

export function SafeHtmlBoundary({ html, ...rest }: SafeHtmlBoundaryProps) {
    if (!html) return null;
    return (
        <ErrorBoundary FallbackComponent={(props) => <FallbackText {...rest} />}>
            <SafeHtmlContent html={html} {...rest} />
        </ErrorBoundary>
    );
}

function SafeHtmlContent({ html, as: Tag = 'div', className, style }: SafeHtmlBoundaryProps) {
    return React.createElement(Tag, {
        className,
        style,
        dangerouslySetInnerHTML: { __html: html },
    });
}

export const SafeHtmlDiv = React.memo((props: Omit<SafeHtmlBoundaryProps, 'as'>) => (
    <SafeHtmlBoundary {...props} as="div" />
));

SafeHtmlDiv.displayName = 'SafeHtmlDiv';

export const SafeHtmlSpan = React.memo((props: Omit<SafeHtmlBoundaryProps, 'as'>) => (
    <SafeHtmlBoundary {...props} as="span" />
));

SafeHtmlSpan.displayName = 'SafeHtmlSpan';
