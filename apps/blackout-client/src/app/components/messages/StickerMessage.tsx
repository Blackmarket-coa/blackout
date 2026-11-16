import type { MatrixEvent } from 'matrix-js-sdk';
import {
    baseStyles,
    fitsEncryptedAutoLoad,
    getInfo,
    loadEncryptedLabel,
    useInViewport,
    useLatched,
    useResolvedMediaSource,
} from './mediaShared';

interface StickerMessageProps {
    event: MatrixEvent;
}

export const StickerMessage = ({ event }: StickerMessageProps) => {
    const { ref, inView } = useInViewport<HTMLDivElement>();
    const info = getInfo(event);
    const seen = useLatched(inView);
    // Stickers are normally pack images referenced by a plain URL, in
    // encrypted rooms too: a pack is not private to the room. One that does
    // arrive encrypted is treated like any other encrypted image.
    const { src, loading, error, awaitingLoad, load } = useResolvedMediaSource(event, {
        autoLoad: seen && fitsEncryptedAutoLoad(info),
    });
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
            {inView && awaitingLoad ? (
                <button type="button" onClick={load} data-testid="load-encrypted-media">
                    {loadEncryptedLabel('sticker', info)}
                </button>
            ) : null}
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
