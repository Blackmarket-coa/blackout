import type { MatrixEvent } from 'matrix-js-sdk';
import {
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

export const FileMessage = ({ event, enablePdfPreview = true }: FileMessageProps) => {
    const { ref, inView } = useInViewport<HTMLDivElement>();
    const { src, loading, error } = useResolvedMediaSource(event);
    const info = getInfo(event);
    const body = event.getContent<Record<string, unknown>>().body;
    const fileName = typeof body === 'string' ? body : 'Attachment';
    const mime = typeof info.mimetype === 'string' ? info.mimetype : undefined;
    const isPdf = mime?.includes('pdf');

    return (
        <div ref={ref} style={{ ...baseStyles.surface, padding: 10, width: 'min(440px, 100%)' }}>
            {!inView || loading ? (
                <div style={{ ...baseStyles.skeleton, minHeight: 72, borderRadius: 8 }} />
            ) : null}
            {error ? <div style={baseStyles.error}>File unavailable: {error}</div> : null}
            {inView && src ? (
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
                            </div>
                        </div>
                        <a
                            href={src}
                            target="_blank"
                            rel="noreferrer"
                            download={fileName}
                            style={{
                                border: '1px solid var(--border-default)',
                                borderRadius: 8,
                                padding: '4px 8px',
                                color: 'var(--text-primary)',
                            }}
                        >
                            Download
                        </a>
                    </div>

                    {enablePdfPreview && isPdf ? (
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
        </div>
    );
};

export default FileMessage;
