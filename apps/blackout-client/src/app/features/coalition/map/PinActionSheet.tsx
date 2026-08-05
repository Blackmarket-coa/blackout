import React from 'react';
import { buildCommunitiesPath } from '../../../pages/paths';
import { directionsHref, resolvePinActions, type PinLayer } from './pinActions';
import * as css from './MapLegend.css';

export interface PinActionSheetPin {
    id: string;
    title: string;
    subtitle: string;
    layer: PinLayer;
    latitude: number;
    longitude: number;
    denId?: string;
    mediaUrl?: string;
}

export interface PinActionSheetProps {
    pin: PinActionSheetPin;
    onClose: () => void;
    /** Open the story reel starting at this pin. */
    onWatch: (pinId: string) => void;
}

/**
 * What you can do here.
 *
 * Tapping a pin used to show a title, a subtitle, and — only sometimes — a link
 * to a den, and only for pins whose coordinates failed to parse. This offers
 * the pin's verbs for every pin: watch the story, open the thread, get
 * directions to the actual place.
 */
export function PinActionSheet({ pin, onClose, onWatch }: PinActionSheetProps) {
    const hasCoordinates = Number.isFinite(pin.latitude) && Number.isFinite(pin.longitude);
    const actions = resolvePinActions({
        layer: pin.layer,
        hasDen: Boolean(pin.denId),
        hasCoordinates,
        hasMedia: Boolean(pin.mediaUrl),
    });

    return (
        <div
            onClick={onClose}
            style={{
                position: 'absolute',
                inset: 0,
                zIndex: 6,
                background: 'rgba(0,0,0,0.35)',
                display: 'flex',
                alignItems: 'flex-end',
                justifyContent: 'center',
                padding: 16,
            }}
            data-testid="coalition-pin-actions"
        >
            <div
                onClick={(event) => event.stopPropagation()}
                style={{
                    width: 'min(420px, 100%)',
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-default)',
                    borderRadius: 16,
                    padding: 16,
                    display: 'grid',
                    gap: 10,
                    boxShadow: '0 12px 32px rgba(0,0,0,0.45)',
                    marginBottom: 'env(safe-area-inset-bottom, 0px)',
                }}
            >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <strong style={{ flex: 1, fontSize: 16 }}>{pin.title}</strong>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close details"
                        className={css.control.off}
                        data-testid="coalition-pin-close"
                    >
                        ✕
                    </button>
                </div>
                <small style={{ color: 'var(--text-secondary)' }}>{pin.subtitle}</small>

                {actions.length > 0 ? (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 2 }}>
                        {actions.map((action) => {
                            const shared = {
                                key: action.id,
                                className: action.primary ? css.control.on : css.control.off,
                                style: { padding: '8px 14px', fontSize: 14 },
                                'data-testid': `coalition-pin-action-${action.id}`,
                            } as const;

                            if (action.id === 'den' && pin.denId) {
                                return (
                                    <a
                                        {...shared}
                                        href={buildCommunitiesPath(null, pin.denId)}
                                        style={{ ...shared.style, textDecoration: 'none' }}
                                    >
                                        {action.glyph} {action.label}
                                    </a>
                                );
                            }
                            if (action.id === 'directions') {
                                return (
                                    <a
                                        {...shared}
                                        href={directionsHref(
                                            pin.latitude,
                                            pin.longitude,
                                            pin.title
                                        )}
                                        style={{ ...shared.style, textDecoration: 'none' }}
                                    >
                                        {action.glyph} {action.label}
                                    </a>
                                );
                            }
                            if (action.id === 'watch') {
                                return (
                                    <button
                                        {...shared}
                                        type="button"
                                        onClick={() => onWatch(pin.id)}
                                    >
                                        {action.glyph} {action.label}
                                    </button>
                                );
                            }
                            return null;
                        })}
                    </div>
                ) : (
                    <small style={{ color: 'var(--text-muted)' }}>Nothing to do here yet.</small>
                )}
            </div>
        </div>
    );
}

export default PinActionSheet;
