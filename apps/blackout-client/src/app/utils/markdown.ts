import sanitizeHtml from 'sanitize-html';

const escapeHtml = (value: string): string =>
    value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');

/** Convert Markdown-ish input into Matrix `formatted_body` HTML. */
export const mdToHtml = (markdown: string): string => {
    const escaped = escapeHtml(markdown);

    return escaped
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/`(.+?)`/g, '<code>$1</code>')
        .replace(/\n/g, '<br />');
};

/** Convert simple HTML back into markdown for edit prefill. */
export const htmlToMd = (html: string): string => {
    return html
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<strong>(.*?)<\/strong>/gi, '**$1**')
        .replace(/<em>(.*?)<\/em>/gi, '*$1*')
        .replace(/<code>(.*?)<\/code>/gi, '`$1`')
        .replace(/<[^>]+>/g, '');
};

/** Basic Matrix HTML sanitization that replaces the DOMParser approach. */
export const sanitizeMatrixHtml = (html: string): string =>
    sanitizeHtml(html, {
        allowedTags: [
            'a', 'b', 'blockquote', 'br', 'code', 'del', 'em', 'i',
            'li', 'ol', 'p', 'pre', 'span', 'strong', 'u', 'ul',
        ],
        allowedAttributes: {
            a: ['href', 'name', 'target', 'data-md'],
            span: ['data-mx-spoiler', 'data-mx-maths', 'data-mx-pill', 'data-mx-ping', 'data-md'],
            div: ['data-mx-maths'],
            ol: ['start', 'type', 'data-md'],
            pre: ['data-md', 'class'],
            code: ['class', 'data-md'],
            li: [],
        },
        allowedSchemes: ['https', 'mailto', 'mxc'],
        allowedSchemesAppliedToAttributes: ['href'],
        allowProtocolRelative: false,
    });
