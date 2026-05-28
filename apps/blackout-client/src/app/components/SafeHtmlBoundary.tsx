import React from 'react';
import { ErrorBoundary } from 'react-error-boundary';

/**
 * WHAT THIS FILE DOES
 * Wraps HTML content rendered via `dangerouslySetInnerHTML` with a React
 * error boundary. If the HTML causes a rendering crash (e.g., deeply nested
 * DOM, browser-specific DOMParser quirks), this component catches the error
 * and shows "[Content unavailable]" instead of crashing the entire app.
 *
 * IMPORTANT — WHAT THIS DOES NOT DO
 * This component does NOT sanitize HTML. It only catches rendering crashes.
 * Always pass pre-sanitized HTML (via sanitize-html or equivalent). The
 * name was changed from SafeHtmlBoundary to HtmlErrorBoundary to make this
 * distinction clear — "safe" incorrectly implied sanitization.
 *
 * WHY IT EXISTS
 * Before this component, a single malformed message in the timeline could
 * crash the entire React app (white screen). With this boundary, only the
 * offending message is replaced with a fallback — the rest of the app
 * continues functioning.
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
