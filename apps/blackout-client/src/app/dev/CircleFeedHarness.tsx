import React from 'react';
import CircleFeed from '../features/circle-feed/CircleFeed';

// Playwright harness for the Circle & Reach feed.
//
// The feed and its relay surfaces shipped with unit tests but had never been
// rendered in a browser. jsdom cannot see the things most likely to be wrong
// here: the `→` separators collapsing under a flex row, a withdrawn hop whose
// line-through never paints, the chain dialog opening behind the feed, or a
// run-toggle that reads as a link but is not clickable. Those are exactly the
// defects a provenance line exists to prevent, so they need a real engine.
//
// Mounted before the auth/matrix bootstrap chain (see main.tsx) so the test can
// drive the real component without a Matrix session. Everything the feed shows
// still arrives over the network — the spec stubs `/v1/*` — so this exercises
// the true fetch → parse → render path rather than hand-fed props.
//
// Reachable only by explicit navigation to /__dev__/circle-feed; the dynamic
// import keeps the static bundle from paying for it.

/** Matches the id the spec puts in the stubbed relay hops. */
const VIEWER_ID = '@you:test.local';

export const CircleFeedHarness = (): JSX.Element => (
    <main
        data-testid="harness-page"
        style={{
            minHeight: '100vh',
            padding: 24,
            background: 'var(--bg-surface, #111827)',
            color: 'var(--text-primary, #f8fafc)',
        }}
    >
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
            <CircleFeed viewerId={VIEWER_ID} />
        </div>
    </main>
);

export default CircleFeedHarness;
