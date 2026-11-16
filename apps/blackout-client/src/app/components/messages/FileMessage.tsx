import { useCallback, useState } from 'react';
import FileSaver from 'file-saver';
import type { MatrixEvent } from 'matrix-js-sdk';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import {
    OPAQUE_BLOB_TYPE,
    fetchDecryptedMedia,
    readEncryptedFile,
} from '../../features/media/utils/encryptedMedia';
import {
    ServerReadableNote,
    baseStyles,
    formatBytes,
    getInfo,
    useInViewport,
    useResolvedMediaSource,
} from './mediaShared';

interface FileMessageProps {
    event: MatrixEvent;
    enablePdfPreview?: boolean;
}

const iconForMime = (mime?: string): string => {
    if (!mime) return '📎';
    if (mime.startsWith('image/')) return '🖼️';
    if (mime.startsWith('video/')) return '🎬';
    if (mime.startsWith('audio/')) return '🎵';
    if (mime.includes('pdf')) return '📄';
    if (mime.includes('zip')) return '🗜️';
    return '📁';
};

const actionStyle = {
    border: '1px solid var(--border-default)',
    borderRadius: 8,
    padding: '4px 8px',
    color: 'var(--text-primary)',
    background: 'transparent',
    cursor: 'pointer',
} as const;

export const FileMessage = ({ event, enablePdfPreview = true }: FileMessageProps) => {
    const client = useMatrixClient();
    const { ref, inView } = useInViewport<HTMLDivElement>();
    // An encrypted file is never fetched by this hook (`autoLoad: false`, and
    // `load` is not used): it is fetched, decrypted and saved in one step when
    // the reader presses Download, below.
    const { src, loading, error, encrypted, endToEndEncrypted, serverReadableNote } =
        useResolvedMediaSource(event, { autoLoad: false });
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const info = getInfo(event);
    const content = event.getContent<Record<string, unknown>>();
    // `filename` is the file's name when `body` is a caption; older messages
    // carry the name in `body`.
    const fileName =
        typeof content.filename === 'string' && content.filename
            ? content.filename
            : typeof content.body === 'string'
            ? content.body
            : 'Attachment';
    const mime = typeof info.mimetype === 'string' ? info.mimetype : undefined;
    const isPdf = mime?.includes('pdf');

    const saveEncrypted = useCallback(async () => {
        const file = readEncryptedFile(content);
        if (!file) return;
        setSaving(true);
        setSaveError(null);
        try {
            // Always the opaque type: a saved file is opened by whatever the
            // reader's system uses for its name, and a blob that a browser
            // would render must never be made from a sender-declared type.
            const blob = await fetchDecryptedMedia({
                file,
                homeserverUrl:
                    (
                        client as unknown as { getHomeserverUrl?: () => string }
                    ).getHomeserverUrl?.() ?? '',
                blobType: OPAQUE_BLOB_TYPE,
            });
            FileSaver.saveAs(blob, fileName);
        } catch (err) {
            setSaveError(err instanceof Error ? err.message : 'The file could not be downloaded.');
        } finally {
            setSaving(false);
        }
    }, [client, content, fileName]);

    const shownError = error ?? saveError;

    return (
        <div ref={ref} style={{ ...baseStyles.surface, padding: 10, width: 'min(440px, 100%)' }}>
            {!inView || loading ? (
                <div style={{ ...baseStyles.skeleton, minHeight: 72, borderRadius: 8 }} />
            ) : null}
            {shownError ? <div style={baseStyles.error}>File unavailable: {shownError}</div> : null}
            {inView && (src || (encrypted && !error)) ? (
                <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ fontSize: 26 }}>{iconForMime(mime)}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div
                                style={{
                                    color: 'var(--text-primary)',
                                    fontWeight: 600,
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                }}
                            >
                                {fileName}
                            </div>
                            <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                                {mime ?? 'unknown'} ·{' '}
                                {formatBytes(typeof info.size === 'number' ? info.size : undefined)}
                                {endToEndEncrypted ? ' · end-to-end encrypted' : ''}
                            </div>
                        </div>
                        {encrypted ? (
                            <button
                                type="button"
                                onClick={() => void saveEncrypted()}
                                disabled={saving}
                                data-testid="download-encrypted-file"
                                style={actionStyle}
                            >
                                {saving ? 'Decrypting…' : 'Download'}
                            </button>
                        ) : src ? (
                            <a
                                href={src}
                                target="_blank"
                                rel="noreferrer"
                                download={fileName}
                                style={actionStyle}
                            >
                                Download
                            </a>
                        ) : null}
                    </div>

                    {/* No inline preview for an encrypted PDF: showing one
                        would mean rendering a decrypted, sender-supplied
                        document inside this app's origin. */}
                    {enablePdfPreview && isPdf && !encrypted && src ? (
                        <iframe
                            title={fileName}
                            src={src}
                            style={{
                                marginTop: 8,
                                width: '100%',
                                height: 220,
                                border: '1px solid var(--border-default)',
                                borderRadius: 8,
                            }}
                        />
                    ) : null}
                </>
            ) : null}
            {serverReadableNote ? <ServerReadableNote text={serverReadableNote} /> : null}
        </div>
    );
};

export default FileMessage;
