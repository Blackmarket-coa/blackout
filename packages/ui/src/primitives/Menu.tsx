import React from 'react';
import { cx } from './cx';
import { useDismiss } from './useDismiss';
import * as overlay from './overlay.css';
import * as styles from './Menu.css';

export interface MenuItem {
    id: string;
    label: React.ReactNode;
    onSelect: () => void;
    disabled?: boolean;
}

export interface MenuProps {
    /** Trigger element — toggles the menu on click. */
    trigger: React.ReactElement;
    items: MenuItem[];
    placement?: overlay.OverlayPlacement;
    className?: string;
    /** Accessible label for the menu. */
    label?: string;
}

export const Menu = ({
    trigger,
    items,
    placement = 'bottom',
    className,
    label,
}: MenuProps): React.ReactElement => {
    const [open, setOpen] = React.useState(false);
    const wrapperRef = React.useRef<HTMLSpanElement>(null);
    const itemRefs = React.useRef<Array<HTMLButtonElement | null>>([]);

    const close = React.useCallback(() => setOpen(false), []);
    useDismiss(open, wrapperRef, close);

    const enabledIndexes = items
        .map((item, index) => (item.disabled ? -1 : index))
        .filter((index) => index >= 0);

    React.useEffect(() => {
        if (!open) return;
        // Restore focus to whatever opened the menu (normally the trigger)
        // once it closes, mirroring the Modal/Sheet restore contract.
        const previouslyFocused = document.activeElement as HTMLElement | null;
        itemRefs.current[enabledIndexes[0] ?? 0]?.focus();
        return () => {
            previouslyFocused?.focus?.();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const focusByOffset = (from: number, delta: number) => {
        const pos = enabledIndexes.indexOf(from);
        const nextIndex =
            enabledIndexes[(pos + delta + enabledIndexes.length) % enabledIndexes.length];
        itemRefs.current[nextIndex]?.focus();
    };

    const triggerEl = React.cloneElement(trigger, {
        onClick: (event: React.MouseEvent) => {
            trigger.props.onClick?.(event);
            setOpen((value) => !value);
        },
        'aria-haspopup': 'menu',
        'aria-expanded': open,
    });

    return (
        <span ref={wrapperRef} className={cx(overlay.anchor, className)}>
            {triggerEl}
            {open ? (
                <div
                    role="menu"
                    aria-label={label}
                    className={cx(overlay.surface, overlay.placements[placement])}
                >
                    {items.map((item, index) => (
                        <button
                            key={item.id}
                            ref={(node) => {
                                itemRefs.current[index] = node;
                            }}
                            type="button"
                            role="menuitem"
                            tabIndex={-1}
                            disabled={item.disabled}
                            className={styles.item}
                            onClick={() => {
                                item.onSelect();
                                close();
                            }}
                            onKeyDown={(event) => {
                                if (event.key === 'ArrowDown') {
                                    event.preventDefault();
                                    focusByOffset(index, 1);
                                } else if (event.key === 'ArrowUp') {
                                    event.preventDefault();
                                    focusByOffset(index, -1);
                                } else if (event.key === 'Home') {
                                    event.preventDefault();
                                    itemRefs.current[enabledIndexes[0] ?? 0]?.focus();
                                } else if (event.key === 'End') {
                                    event.preventDefault();
                                    itemRefs.current[
                                        enabledIndexes[enabledIndexes.length - 1] ?? 0
                                    ]?.focus();
                                }
                            }}
                        >
                            {item.label}
                        </button>
                    ))}
                </div>
            ) : null}
        </span>
    );
};
