import { useEffect, useSyncExternalStore } from 'react';

/**
 * Shared placement for floating action buttons.
 *
 * Several FABs can be on screen at once: a page-level compose/create button
 * (e.g. the Coliseum "+") plus the global bug-report FAB from the app shell.
 * They all pin to the bottom-right above the mobile tab bar, so without
 * coordination they render on top of each other.
 *
 * Page-level FABs claim the base slot via `usePageFabSlot`; the global FAB
 * reads `usePageFabStackOffset` and lifts itself above whatever is claimed.
 */

/** Distance from the viewport bottom to the first FAB slot (tab bar + composer). */
const BASE_BOTTOM_PX = 84;

/** Vertical gap between stacked FABs. */
export const FAB_STACK_GAP = 12;

/** `bottom` value for a FAB sitting `offsetPx` above the base slot. */
export const fabStackBottom = (offsetPx = 0): string =>
    `calc(env(safe-area-inset-bottom, 0px) + ${BASE_BOTTOM_PX + Math.max(0, offsetPx)}px)`;

let nextSlotId = 0;
const slotHeights = new Map<number, number>();
const listeners = new Set<() => void>();

const emit = () => {
    listeners.forEach((listener) => listener());
};

const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
};

/** Tallest page-level FAB currently mounted, 0 when none. */
const getSnapshot = (): number => {
    let tallest = 0;
    slotHeights.forEach((height) => {
        if (height > tallest) tallest = height;
    });
    return tallest;
};

const getServerSnapshot = (): number => 0;

/** Claim the base FAB slot. Returns a release function. */
export const claimPageFabSlot = (height: number): (() => void) => {
    const id = nextSlotId;
    nextSlotId += 1;
    slotHeights.set(id, height);
    emit();
    return () => {
        slotHeights.delete(id);
        emit();
    };
};

/**
 * Claim the base FAB slot for as long as the component renders a visible FAB.
 * Pass `visible: false` while the button is hidden (e.g. keyboard open) so the
 * slot is released and other FABs drop back down.
 */
export const usePageFabSlot = (height: number, visible = true): void => {
    useEffect(() => {
        if (!visible) return undefined;
        return claimPageFabSlot(height);
    }, [height, visible]);
};

/** Vertical offset a stacked FAB needs to clear the page-level FAB, if any. */
export const usePageFabStackOffset = (): number => {
    const tallest = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
    return tallest > 0 ? tallest + FAB_STACK_GAP : 0;
};
