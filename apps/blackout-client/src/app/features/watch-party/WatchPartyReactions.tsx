import { type CSSProperties } from 'react';
import {
    WATCH_PARTY_REACTION_KEYS,
    type ReactionBurst,
    type WatchPartyReactionKey,
} from './watchPartyLive';

const FLOAT_KEYFRAMES = `
@keyframes watch-party-float {
    from { transform: translateY(0); opacity: 1; }
    to { transform: translateY(-140px); opacity: 0; }
}`;

const overlayStyle: CSSProperties = {
    position: 'absolute',
    inset: 0,
    overflow: 'hidden',
    pointerEvents: 'none',
};

const barStyle: CSSProperties = {
    display: 'flex',
    gap: 4,
    flexWrap: 'wrap',
};

const emoteButtonStyle: CSSProperties = {
    border: '1px solid var(--border-default)',
    borderRadius: 8,
    background: 'var(--bg-surface)',
    padding: '2px 6px',
    cursor: 'pointer',
    fontSize: 16,
    lineHeight: '20px',
};

/** Deterministic horizontal lane per event id so bursts spread out. */
const laneFor = (id: string): number => {
    let hash = 0;
    for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) | 0;
    return 8 + (Math.abs(hash) % 84);
};

/**
 * Floating emoji layer over the party player. Pointer-events pass through,
 * so the layer never blocks the video controls underneath.
 */
export const WatchPartyReactionOverlay = ({ bursts }: { bursts: ReactionBurst[] }) => {
    if (bursts.length === 0) return null;
    return (
        <div aria-hidden style={overlayStyle} data-testid="watch-party-reaction-overlay">
            <style>{FLOAT_KEYFRAMES}</style>
            {bursts.map((burst) => (
                <span
                    key={burst.id}
                    style={{
                        position: 'absolute',
                        bottom: 8,
                        left: `${laneFor(burst.id)}%`,
                        fontSize: 24,
                        animation: 'watch-party-float 3s ease-out forwards',
                    }}
                >
                    {burst.key}
                </span>
            ))}
        </div>
    );
};

/** Quick-bar of the fixed reaction palette; every member may react. */
export const WatchPartyReactionBar = ({
    onReact,
}: {
    onReact: (key: WatchPartyReactionKey) => void;
}) => (
    <div aria-label="Send a reaction" role="toolbar" style={barStyle}>
        {WATCH_PARTY_REACTION_KEYS.map((key) => (
            <button
                key={key}
                type="button"
                style={emoteButtonStyle}
                onClick={() => onReact(key)}
                aria-label={`React with ${key}`}
            >
                {key}
            </button>
        ))}
    </div>
);
