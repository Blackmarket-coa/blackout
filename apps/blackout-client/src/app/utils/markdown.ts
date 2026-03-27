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

/** Basic Matrix HTML sanitization to remove unsafe elements/attributes. */
export const sanitizeMatrixHtml = (html: string): string => {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const allowedTags = new Set([
    'A',
    'B',
    'BLOCKQUOTE',
    'BR',
    'CODE',
    'DEL',
    'EM',
    'I',
    'LI',
    'OL',
    'P',
    'PRE',
    'SPAN',
    'STRONG',
    'U',
    'UL',
  ]);

  doc.body.querySelectorAll('*').forEach((element) => {
    if (!allowedTags.has(element.tagName)) {
      element.replaceWith(...Array.from(element.childNodes));
      return;
    }

    for (const attribute of Array.from(element.attributes)) {
      const isSafeHref =
        attribute.name === 'href' &&
        (attribute.value.startsWith('https://') ||
          attribute.value.startsWith('http://') ||
          attribute.value.startsWith('mailto:') ||
          attribute.value.startsWith('mxc://'));

      const isDataAttribute = attribute.name.startsWith('data-mx-');
      if (attribute.name !== 'href' && !isDataAttribute) {
        element.removeAttribute(attribute.name);
      } else if (attribute.name === 'href' && !isSafeHref) {
        element.removeAttribute(attribute.name);
      }
    }
  });

  return doc.body.innerHTML;
};
