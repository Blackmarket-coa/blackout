import type { DenDocumentModel } from './useDenDocuments';
import { documentProvenance } from './documentProvenance';

/**
 * Export a founding document as a Markdown file.
 *
 * The whole point of the documents tool is that a den ends up with bylaws it
 * can actually use — and, on FBM's side, upload to the document vault as a
 * `governing_document`. Until this existed there was no export, download,
 * print or HTTP API, so the only way a finished document left Blackout was
 * selecting the textarea and copying it by hand.
 *
 * Markdown, not PDF. The body is already Markdown, the seeds are authored as
 * Markdown, and a faithful `.md` needs no rendering dependency and stays
 * editable by whoever receives it. A PDF would need a renderer and would make
 * the file harder to revise — the wrong trade for a document whose entire
 * purpose is to be amended.
 */

/** Characters a filename cannot safely carry across the three OSes. */
const UNSAFE_FILENAME = /[<>:"/\\|?*]/g;

/**
 * A filename that survives Windows, macOS and Linux.
 *
 * Falls back to the document id when a title reduces to nothing — a title of
 * only slashes and colons is unlikely, but it must not produce a file called
 * `.md`, which some browsers silently refuse to save.
 */
export function exportFilename(doc: Pick<DenDocumentModel, 'title' | 'docId'>): string {
    const cleaned = doc.title
        .replace(UNSAFE_FILENAME, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        // Trailing dots and spaces are legal in a JS string but not in a
        // Windows filename.
        .replace(/[. ]+$/, '');
    const stem = cleaned.length > 0 ? cleaned : doc.docId;
    return `${stem}.md`;
}

/**
 * The file's contents: the document body, then a provenance footer.
 *
 * The footer is appended rather than woven in, and only for a seeded document,
 * so a den that rewrote its bylaws from scratch exports exactly what it wrote.
 * It carries the attribution the editor now shows plus the version stamp, so a
 * file that has left Blackout can still be traced to what it was adapted from
 * — which is the credit the upstream licences actually ask for.
 */
export function exportMarkdown(doc: DenDocumentModel): string {
    const provenance = documentProvenance(doc);
    const body = doc.body.replace(/\s+$/, '');

    if (!provenance) return `${body}\n`;

    return [
        body,
        '',
        '---',
        '',
        `<!-- Exported from Blackout · version ${doc.version} -->`,
        '',
        `${provenance.attribution} Licence: ${provenance.license.code}.`,
        '',
    ].join('\n');
}

/**
 * Hand the file to the browser.
 *
 * Kept out of the two functions above so they stay pure and testable; this is
 * the only part that touches the DOM. The object URL is revoked on the next
 * tick rather than immediately, because Safari cancels an in-flight download
 * when the URL is revoked synchronously.
 */
export function downloadDocument(doc: DenDocumentModel): void {
    const blob = new Blob([exportMarkdown(doc)], {
        type: 'text/markdown;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = exportFilename(doc);
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
}
