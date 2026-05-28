import React from 'react';
import { ErrorBoundary } from 'react-error-boundary';

/**
 * Crash-isolation wrapper for HTML content rendered via `dangerouslySetInnerHTML`.
 *
 * IMPORTANT: This component does NOT sanitize HTML. It only catches React
 * rendering errors (e.g., malformed DOM from browser-specific DOMParser quirks).
 * Always pass pre-sanitized HTML (via sanitize-html, DOMPurify, or equivalent).
 */

interface HtmlErrorBoundaryProps {
    html: string;
    className?: string;
    style?: React.CSSProperties;
    as?: 'div' | 'span' | 'p';
}

function FallbackText({ className, style, as: Tag = 'div' }: Omit<HtmlErrorBoundaryProps, 'html'>) {
    return React.createElement(Tag, { className, style }, '[Content unavailable]');
}

export function HtmlErrorBoundary({ html, ...rest }: HtmlErrorBoundaryProps) {
    if (!html) return null;
    return (
        <ErrorBoundary FallbackComponent={(props) => <FallbackText {...rest} />}>
            <HtmlContent html={html} {...rest} />
        </ErrorBoundary>
    );
}

function HtmlContent({ html, as: Tag = 'div', className, style }: HtmlErrorBoundaryProps) {
    return React.createElement(Tag, {
        className,
        style,
        dangerouslySetInnerHTML: { __html: html },
    });
}

export const HtmlErrorDiv = React.memo((props: Omit<HtmlErrorBoundaryProps, 'as'>) => (
    <HtmlErrorBoundary {...props} as="div" />
));

HtmlErrorDiv.displayName = 'HtmlErrorDiv';

export const HtmlErrorSpan = React.memo((props: Omit<HtmlErrorBoundaryProps, 'as'>) => (
    <HtmlErrorBoundary {...props} as="span" />
));

HtmlErrorSpan.displayName = 'HtmlErrorSpan';
