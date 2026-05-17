import React, { useEffect, useMemo, useRef, type CSSProperties } from 'react';
import { DEFAULT_RECENT_REACTIONS } from './recentReactionsStorage';

const containerStyle: CSSProperties = {
    position: 'absolute',
    bottom: '110%',
    right: 0,
    width: 260,
    border: '1px solid var(--border-default)',
    borderRadius: 12,
    background: 'var(--bg-surface)',
    padding: 8,
    zIndex: 5,
};

const sectionLabelStyle: CSSProperties = {
    color: 'var(--text-muted)',
    fontSize: 11,
    marginBottom: 4,
};

const gridStyle: CSSProperties = {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 4,
    marginBottom: 8,
};

const buttonStyle: CSSProperties = {
    border: '1px solid var(--border-default)',
    borderRadius: 6,
    background: 'var(--bg-input)',
};

const customButtonStyle: CSSProperties = {
    ...buttonStyle,
    padding: 2,
    marginBottom: 0,
};

export interface EmojiPickerProps {
    customEmoji: Record<string, string>;
    recents: readonly string[];
    onSelect: (emoji: string) => void;
    /**
     * Called when the user dismisses the picker (Escape key, click on the
     * surrounding overlay, etc.). Required for keyboard accessibility — the
     * picker cannot trap focus, so Escape must always be honored.
     */
    onClose: () => void;
    defaultPalette?: readonly string[];
}

/**
 * Keyboard-accessible emoji picker (Workstream C — "Reaction picker
 * accessible by keyboard" exit criterion). Self-contained:
 *
 * - Auto-focuses the first emoji button on mount so keyboard users can
 *   immediately Tab/Enter without first clicking the picker.
 * - Listens for Escape on `document` (capture phase) and invokes
 *   `onClose`; uses capture so the dismiss runs before any inner key
 *   handler can stop propagation.
 * - Renders as `role="dialog"` with an `aria-label` for screen readers.
 * - Each emoji button is a native `<button>`, so Tab/Shift+Tab and
 *   Enter/Space already work without custom handling.
 */
export const EmojiPicker = ({
    customEmoji,
    recents,
    onSelect,
    onClose,
    defaultPalette,
}: EmojiPickerProps) => {
    const firstButtonRef = useRef<HTMLButtonElement | null>(null);

    const seed = defaultPalette ?? DEFAULT_RECENT_REACTIONS;
    const common = useMemo(
        () =>
            [...new Set([...seed, ...recents, ...DEFAULT_RECENT_REACTIONS])].slice(0, 24),
        [recents, seed],
    );
    const custom = useMemo(() => Object.entries(customEmoji).slice(0, 30), [customEmoji]);

    // Auto-focus the first emoji button so the keyboard user is dropped
    // straight into the grid.
    useEffect(() => {
        const id = setTimeout(() => {
            firstButtonRef.current?.focus();
        }, 0);
        return () => clearTimeout(id);
    }, []);

    // Escape closes the picker. Use capture so the listener wins against
    // inner stopPropagation callers.
    useEffect(() => {
        const handler = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                onClose();
            }
        };
        document.addEventListener('keydown', handler, true);
        return () => document.removeEventListener('keydown', handler, true);
    }, [onClose]);

    return (
        <div
            role="dialog"
            aria-label="Emoji picker"
            data-testid="emoji-picker"
            style={containerStyle}
        >
            <div style={sectionLabelStyle}>Recent</div>
            <div style={gridStyle} data-testid="emoji-picker-recent-grid">
                {common.map((emoji, index) => (
                    <button
                        key={emoji}
                        ref={index === 0 ? firstButtonRef : undefined}
                        type="button"
                        data-testid={`emoji-picker-recent-${emoji}`}
                        onClick={() => onSelect(emoji)}
                        style={buttonStyle}
                    >
                        {emoji}
                    </button>
                ))}
            </div>
            {custom.length > 0 ? (
                <>
                    <div style={sectionLabelStyle}>Custom emoji</div>
                    <div style={{ ...gridStyle, marginBottom: 0 }} data-testid="emoji-picker-custom-grid">
                        {custom.map(([key, url], index) => (
                            <button
                                key={key}
                                ref={
                                    common.length === 0 && index === 0
                                        ? firstButtonRef
                                        : undefined
                                }
                                type="button"
                                data-testid={`emoji-picker-custom-${key}`}
                                onClick={() => onSelect(key)}
                                style={customButtonStyle}
                            >
                                <img src={url} alt={key} style={{ width: 18, height: 18 }} />
                            </button>
                        ))}
                    </div>
                </>
            ) : null}
        </div>
    );
};

export default EmojiPicker;
