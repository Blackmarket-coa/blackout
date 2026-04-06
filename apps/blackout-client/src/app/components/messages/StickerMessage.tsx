import type { MatrixEvent } from 'matrix-js-sdk';
import { baseStyles, useInViewport, useResolvedMediaSource } from './mediaShared';

interface StickerMessageProps {
    event: MatrixEvent;
}

export const StickerMessage = ({ event }: StickerMessageProps) => {
    const { ref, inView } = useInViewport<HTMLDivElement>();
    const { src, loading, error } = useResolvedMediaSource(event);
    const body = event.getContent<Record<string, unknown>>().body;
    const alt = typeof body === 'string' ? body : 'Sticker';

    return (
        <div ref={ref} style={{ width: 240, maxWidth: '100%' }}>
            {!inView || loading ? (
                <div
                    style={{ ...baseStyles.skeleton, width: 220, height: 220, borderRadius: 10 }}
                />
            ) : null}
            {error ? <div style={baseStyles.error}>Sticker unavailable</div> : null}
            {inView && src ? (
                <img
                    src={src}
                    alt={alt}
                    loading="lazy"
                    style={{
                        width: '100%',
                        maxWidth: 240,
                        height: 'auto',
                        background: 'transparent',
                        border: 'none',
                    }}
                />
            ) : null}
        </div>
    );
};

export default StickerMessage;
