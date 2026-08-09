import test from 'node:test';
import assert from 'node:assert/strict';

// Harness: proves an Android hardware-back press does the right thing without
// a device in the loop. It exercises the SAME contract the mobile shell uses
// (`dispatchBackIntent` + `resolveBackAction`, consumed by mobile-bootstrap.ts)
// and the SAME claim mechanism the client's overlays use (`useBackIntent`
// calls `preventDefault()` on the dispatched event).
//
// The behaviour under test: back must dismiss an open overlay rather than
// navigating the page out from under it, or minimising the app while a dialog
// is still showing. Covers claimed, unclaimed-with-history, and
// unclaimed-at-root.
import {
    BACK_INTENT_EVENT,
    dispatchBackIntent,
    resolveBackAction,
} from '../../apps/blackout-client/src/platform/back-intent';

/** The shell's back handler, reduced to its decision. */
const backAction = (target: EventTarget, canGoBack: boolean) =>
    resolveBackAction({ consumed: dispatchBackIntent(target), canGoBack });

test('an open overlay claims the press and nothing else happens', () => {
    const target = new EventTarget();
    // Stands in for useBackIntent's listener.
    target.addEventListener(BACK_INTENT_EVENT, (event) => event.preventDefault());

    assert.equal(backAction(target, true), 'dismissed');
    // Still dismissed at the root of history — the app must not minimise while
    // a dialog is up.
    assert.equal(backAction(target, false), 'dismissed');
});

test('with nothing open, back navigates history as before', () => {
    const target = new EventTarget();
    assert.equal(backAction(target, true), 'history');
});

test('with nothing open and nowhere to go, back minimises as before', () => {
    const target = new EventTarget();
    assert.equal(backAction(target, false), 'minimize');
});

test('a listener that does not claim the press leaves behaviour unchanged', () => {
    const target = new EventTarget();
    let seen = 0;
    // An overlay that is mounted but inactive observes without preventing.
    target.addEventListener(BACK_INTENT_EVENT, () => {
        seen += 1;
    });

    assert.equal(backAction(target, true), 'history');
    assert.equal(seen, 1, 'listener should still be notified');
});

test('dispatching without a window target is inert', () => {
    // Desktop/web builds never dispatch; guard against an undefined target.
    assert.equal(dispatchBackIntent(undefined), false);
    assert.equal(resolveBackAction({ consumed: false, canGoBack: false }), 'minimize');
});
