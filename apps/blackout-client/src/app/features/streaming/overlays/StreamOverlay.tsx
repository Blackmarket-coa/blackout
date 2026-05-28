import type { CSSProperties } from 'react';
import type { OverlayElement, OverlayScene } from './streamAssetGoods';

interface StreamOverlayProps {
    scene: OverlayScene;
    /** When true, fills the viewport (browser-source mode for OBS capture). */
    fullBleed?: boolean;
}

function elementStyle(el: OverlayElement): CSSProperties {
    return {
        position: 'absolute',
        left: `${el.x}%`,
        top: `${el.y}%`,
        width: `${el.w}%`,
        height: `${el.h}%`,
        color: el.color ?? '#ffffff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        overflow: 'hidden',
        ...(el.kind === 'box' ? { background: el.color ?? 'rgba(0,0,0,0.4)', borderRadius: 8 } : {}),
    };
}

/**
 * Renders an overlay-pack scene's positioned elements. Designed to be embedded
 * in-app or loaded as a transparent browser source in OBS (use `fullBleed`).
 * Live OBS-websocket scene control is intentionally out of scope here — minting
 * the browser-source/OBS credentials stays an explicit, deep-linked action.
 */
export const StreamOverlay = ({ scene, fullBleed = false }: StreamOverlayProps) => {
    const containerStyle: CSSProperties = fullBleed
        ? { position: 'fixed', inset: 0, background: 'transparent' }
        : {
              position: 'relative',
              width: '100%',
              aspectRatio: '16 / 9',
              background: 'rgba(0,0,0,0.2)',
              borderRadius: 8,
              overflow: 'hidden',
          };

    return (
        <div style={containerStyle} data-testid="stream-overlay" data-scene={scene.id}>
            {scene.elements.map((el) => (
                <div key={el.id} style={elementStyle(el)} data-overlay-element={el.id}>
                    {el.kind === 'image' && el.imageUrl ? (
                        <img
                            src={el.imageUrl}
                            alt=""
                            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                        />
                    ) : (
                        el.text ?? null
                    )}
                </div>
            ))}
        </div>
    );
};

export default StreamOverlay;
