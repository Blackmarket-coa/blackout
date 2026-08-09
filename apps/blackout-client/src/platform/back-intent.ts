/**
 * Android hardware-back contract, shared by the native shell and the client.
 *
 * The shell's `backButton` handler used to go straight to
 * `window.history.back()` (or minimise the app when there was nowhere to go).
 * That is wrong whenever something modal is open: pressing back with the Home
 * tour or the onboarding sheet up would navigate the page out from under the
 * overlay, or minimise the whole app while a dialog was still showing. On
 * desktop those surfaces already close on Escape; back is the phone's Escape.
 *
 * So the shell now *asks* first. It dispatches a cancelable event; any open
 * overlay calls `preventDefault()` to claim the press and dismiss itself. If
 * nothing claims it, the previous behaviour applies unchanged.
 *
 * Lives here rather than in `blackout-mobile/` so the shell and the client
 * agree on one contract — the same arrangement `notification-routing.ts` uses.
 */

export const BACK_INTENT_EVENT = 'blackout:back';

/** What the shell should do once overlays have had their say. */
export type BackAction = 'dismissed' | 'history' | 'minimize';

/**
 * Ask open overlays whether they want this back press.
 * Returns true when one claimed it.
 */
export const dispatchBackIntent = (
    target: EventTarget | undefined = globalThis.window
): boolean => {
    if (!target) return false;
    const event = new CustomEvent(BACK_INTENT_EVENT, { cancelable: true });
    target.dispatchEvent(event);
    return event.defaultPrevented;
};

/**
 * Decide what a back press means. Pure so the shell's behaviour is testable
 * without a device: overlay first, then history, then minimise.
 */
export const resolveBackAction = (input: { consumed: boolean; canGoBack: boolean }): BackAction => {
    if (input.consumed) return 'dismissed';
    return input.canGoBack ? 'history' : 'minimize';
};
