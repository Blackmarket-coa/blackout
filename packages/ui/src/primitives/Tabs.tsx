import React from 'react';
import { cx } from './cx';
import * as styles from './Tabs.css';

export interface TabItem {
    id: string;
    label: React.ReactNode;
    content: React.ReactNode;
    disabled?: boolean;
}

export interface TabsProps extends React.HTMLAttributes<HTMLDivElement> {
    items: TabItem[];
    /** Controlled active tab id. */
    value?: string;
    /** Initial active tab id when uncontrolled. */
    defaultValue?: string;
    onValueChange?: (id: string) => void;
    /** Accessible label for the tablist. */
    label?: string;
}

export const Tabs = React.forwardRef<HTMLDivElement, TabsProps>(function Tabs(
    { items, value, defaultValue, onValueChange, label, className, ...rest },
    ref,
) {
    const [internal, setInternal] = React.useState(
        defaultValue ?? items[0]?.id,
    );
    const active = value ?? internal;
    const select = (id: string) => {
        if (value === undefined) setInternal(id);
        onValueChange?.(id);
    };

    const enabledIds = items.filter((item) => !item.disabled).map((item) => item.id);
    const onKeyDown = (event: React.KeyboardEvent) => {
        const current = enabledIds.indexOf(active);
        if (current === -1) return;
        let next = current;
        if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = current + 1;
        else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = current - 1;
        else if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = enabledIds.length - 1;
        else return;
        event.preventDefault();
        const id = enabledIds[(next + enabledIds.length) % enabledIds.length];
        if (id) select(id);
    };

    const activeItem = items.find((item) => item.id === active);

    return (
        <div ref={ref} className={className} {...rest}>
            <div role="tablist" aria-label={label} className={styles.list} onKeyDown={onKeyDown}>
                {items.map((item) => {
                    const selected = item.id === active;
                    return (
                        <button
                            key={item.id}
                            type="button"
                            role="tab"
                            id={`tab-${item.id}`}
                            aria-selected={selected}
                            aria-controls={`tabpanel-${item.id}`}
                            tabIndex={selected ? 0 : -1}
                            disabled={item.disabled}
                            className={styles.tab}
                            onClick={() => select(item.id)}
                        >
                            {item.label}
                        </button>
                    );
                })}
            </div>
            <div
                role="tabpanel"
                id={`tabpanel-${active}`}
                aria-labelledby={`tab-${active}`}
                className={styles.panel}
            >
                {activeItem?.content}
            </div>
        </div>
    );
});
