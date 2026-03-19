import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import type { MatrixEvent } from 'matrix-js-sdk';
import { baseStyles, getInfo, useInViewport, useResolvedMediaSource } from './mediaShared';

interface ImageMessageProps {
  event: MatrixEvent;
}

export const ImageMessage = ({ event }: ImageMessageProps) => {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const { ref, inView } = useInViewport<HTMLDivElement>();
  const { src, loading, error, encrypted } = useResolvedMediaSource(event);
  const info = getInfo(event);

  const dimensions = useMemo(() => {
    const width = typeof info.w === 'number' ? info.w : 320;
    const height = typeof info.h === 'number' ? info.h : 240;
    return { width, height };
  }, [info.h, info.w]);

  const blurhash = typeof info['xyz.amorgan.blurhash'] === 'string' ? info['xyz.amorgan.blurhash'] : null;

  const placeholderStyle: CSSProperties = {
    ...baseStyles.surface,
    ...baseStyles.skeleton,
    width: '100%',
    aspectRatio: `${dimensions.width} / ${dimensions.height}`,
    minHeight: 140,
    display: 'grid',
    placeItems: 'center',
    color: 'var(--text-muted)',
    fontSize: 12,
    filter: blurhash ? 'blur(8px)' : undefined,
  };

  return (
    <div ref={ref} style={{ width: 'min(460px, 100%)' }}>
      {!inView ? <div style={placeholderStyle}>Loading image…</div> : null}
      {inView && loading ? <div style={placeholderStyle}>{blurhash ? 'Blurhash placeholder' : 'Loading image…'}</div> : null}
      {inView && error ? <div style={baseStyles.error}>Image failed to load: {error}</div> : null}

      {inView && src && !error ? (
        <button
          type="button"
          onClick={() => setLightboxOpen(true)}
          style={{
            padding: 0,
            border: 'none',
            width: '100%',
            background: 'transparent',
            cursor: 'zoom-in',
          }}
        >
          <img
            src={src}
            alt={typeof event.getContent<Record<string, unknown>>().body === 'string' ? event.getContent<Record<string, unknown>>().body : 'Image'}
            loading="lazy"
            onLoad={() => setLoaded(true)}
            style={{
              width: '100%',
              borderRadius: 10,
              border: '1px solid var(--border-default)',
              opacity: loaded ? 1 : 0.8,
              transition: 'opacity 150ms ease',
            }}
          />
          {encrypted ? <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>Encrypted image</span> : null}
        </button>
      ) : null}

      {lightboxOpen && src ? (
        <dialog open style={{ border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)', maxWidth: '92vw' }}>
          <img src={src} alt="Full-resolution" style={{ maxWidth: '88vw', maxHeight: '82vh' }} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
            <button type="button" onClick={() => setLightboxOpen(false)}>
              Close
            </button>
          </div>
        </dialog>
      ) : null}
    </div>
  );
};

export default ImageMessage;
