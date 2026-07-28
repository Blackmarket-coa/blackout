/**
 * The Town Square "Customize" editor. Lets the user reorder, hide/show, add,
 * and remove home widgets. Reordering supports both accessible move up/down
 * buttons and native drag-and-drop. Premium widgets the caller isn't entitled
 * to appear in the gallery behind a paywall CTA instead of an add button.
 *
 * Layout gating never unlocks anything: entitlement is resolved by the caller
 * (`hasFeature`) and only decides whether a premium widget can be *added*, so a
 * layout preference can't raise a monetization gate.
 */

import { useState, type DragEvent, type ReactNode } from 'react';
import { PaywallCta } from '../monetization/components/PaywallCta';
import {
    HOME_WIDGETS,
    HOME_WIDGET_BY_ID,
    isWidgetEntitled,
    isWidgetFlagEnabled,
    type HomeWidgetId,
} from './homeWidgets';
import {
    addWidget,
    moveWidget,
    removeWidget,
    reorderWidget,
    setWidgetHidden,
    type HomeLayoutState,
} from './state/homeLayout';
import type { FeatureFlags } from '../../core/features/featureFlags';

interface HomeCustomizePanelProps {
    layout: HomeLayoutState;
    setLayout: (next: HomeLayoutState) => void;
    flags: FeatureFlags;
    hasFeature: (key: string) => boolean;
    onClose: () => void;
    /** Navigate to an upsell listing path when a locked widget is chosen. */
    onUpsell: (path: string) => void;
}

const rowStyle: Record<string, string | number> = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 10px',
    borderRadius: 8,
    border: '1px solid var(--border-default)',
    background: 'var(--bg-surface)',
    fontSize: 13,
};

const iconBtn: Record<string, string | number> = {
    padding: '2px 8px',
    borderRadius: 6,
    border: '1px solid var(--border-default)',
    background: 'var(--bg-input)',
    color: 'var(--text-default)',
    cursor: 'pointer',
    fontSize: 12,
};

export function HomeCustomizePanel({
    layout,
    setLayout,
    flags,
    hasFeature,
    onClose,
    onUpsell,
}: HomeCustomizePanelProps): ReactNode {
    const [dragId, setDragId] = useState<HomeWidgetId | null>(null);

    const placed = layout.order.filter((id) => isWidgetFlagEnabled(HOME_WIDGET_BY_ID[id], flags));
    const onBoard = new Set(layout.order);
    // Gallery = registry widgets not currently on the board, still flag-available.
    const gallery = HOME_WIDGETS.filter(
        (def) => !onBoard.has(def.id) && isWidgetFlagEnabled(def, flags)
    );

    const handleDrop = (targetId: HomeWidgetId) => (event: DragEvent) => {
        event.preventDefault();
        if (dragId && dragId !== targetId) {
            setLayout(reorderWidget(layout, dragId, targetId));
        }
        setDragId(null);
    };

    return (
        <div
            data-testid="home-customize-panel"
            style={{
                border: '1px solid var(--border-default)',
                borderRadius: 12,
                background: 'var(--bg-elevated, var(--bg-surface))',
                padding: 14,
                display: 'grid',
                gap: 14,
                marginBottom: 12,
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <strong style={{ fontSize: 15 }}>Customize your Town Square</strong>
                <button
                    type="button"
                    style={iconBtn}
                    data-testid="home-customize-done"
                    onClick={onClose}
                >
                    Done
                </button>
            </div>

            <div style={{ display: 'grid', gap: 8 }}>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    On your board — drag, or use the arrows, to reorder. Toggle to hide.
                </span>
                {placed.map((id, index) => {
                    const def = HOME_WIDGET_BY_ID[id];
                    const isHidden = layout.hidden.includes(id);
                    return (
                        <div
                            key={id}
                            style={{ ...rowStyle, opacity: isHidden ? 0.55 : 1 }}
                            data-testid={`home-customize-row-${id}`}
                            draggable
                            onDragStart={() => setDragId(id)}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={handleDrop(id)}
                        >
                            <span aria-hidden="true" style={{ cursor: 'grab' }}>
                                ⠿
                            </span>
                            <span style={{ fontWeight: 500 }}>{def.label}</span>
                            <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                                <button
                                    type="button"
                                    style={iconBtn}
                                    aria-label={`Move ${def.label} up`}
                                    disabled={index === 0}
                                    onClick={() => setLayout(moveWidget(layout, id, -1))}
                                >
                                    ↑
                                </button>
                                <button
                                    type="button"
                                    style={iconBtn}
                                    aria-label={`Move ${def.label} down`}
                                    disabled={index === placed.length - 1}
                                    onClick={() => setLayout(moveWidget(layout, id, 1))}
                                >
                                    ↓
                                </button>
                                <button
                                    type="button"
                                    style={iconBtn}
                                    data-testid={`home-customize-toggle-${id}`}
                                    aria-pressed={!isHidden}
                                    onClick={() =>
                                        setLayout(setWidgetHidden(layout, id, !isHidden))
                                    }
                                >
                                    {isHidden ? 'Show' : 'Hide'}
                                </button>
                                {def.removable ? (
                                    <button
                                        type="button"
                                        style={iconBtn}
                                        aria-label={`Remove ${def.label}`}
                                        data-testid={`home-customize-remove-${id}`}
                                        onClick={() => setLayout(removeWidget(layout, id))}
                                    >
                                        ✕
                                    </button>
                                ) : null}
                            </div>
                        </div>
                    );
                })}
            </div>

            {gallery.length > 0 ? (
                <div style={{ display: 'grid', gap: 8 }}>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                        Add a widget
                    </span>
                    {gallery.map((def) => {
                        const entitled = isWidgetEntitled(def, hasFeature);
                        return (
                            <div
                                key={def.id}
                                style={rowStyle}
                                data-testid={`home-gallery-${def.id}`}
                            >
                                <div style={{ display: 'grid', gap: 2 }}>
                                    <span style={{ fontWeight: 500 }}>{def.label}</span>
                                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                                        {def.description}
                                    </span>
                                </div>
                                <div style={{ marginLeft: 'auto' }}>
                                    {entitled ? (
                                        <button
                                            type="button"
                                            style={{
                                                ...iconBtn,
                                                background: 'var(--bg-accent)',
                                                color: 'var(--text-on-accent)',
                                            }}
                                            data-testid={`home-gallery-add-${def.id}`}
                                            onClick={() => setLayout(addWidget(layout, def.id))}
                                        >
                                            + Add
                                        </button>
                                    ) : (
                                        <PaywallCta
                                            state="purchasable"
                                            actionLabel="Unlock"
                                            data-testid={`home-gallery-unlock-${def.id}`}
                                            onPurchase={() =>
                                                onUpsell(
                                                    def.upsellListingPath ??
                                                        '/monetization/marketplace'
                                                )
                                            }
                                        />
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : null}
        </div>
    );
}
