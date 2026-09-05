import { expect, test, type Page } from '@playwright/test';

// Browser coverage for the Circle & Reach feed.
//
// The feed shipped with unit tests only. jsdom reports `display` and class
// names but never lays anything out, so it cannot see a provenance line whose
// `→` separators vanish, a withdrawn hop whose strike-through never paints, or
// a chain dialog that opens behind the feed it was launched from. For a feature
// whose entire promise is "you can always see who put this here", those are the
// failures that matter.
//
// Drives the real component against /__dev__/circle-feed (see
// src/app/dev/CircleFeedHarness.tsx and src/main.tsx). Data arrives over the
// network and is stubbed here, so the fetch → parse → render path is the real
// one rather than hand-fed props.

const VIEWER = '@you:test.local';

const hop = (id: string, userId: string, active = true, note: string | null = null) => ({
    relayId: id,
    userId,
    note,
    active,
    at: '2026-09-01T12:00:00.000Z',
});

const subject = (id: string, title: string) => ({
    source: 'coalition_feed',
    id,
    title,
    body: 'Body text for the relayed post.',
    authorId: '@origin:test.local',
    createdAt: '2026-09-01T11:00:00.000Z',
    mediaUrl: null,
    tags: [],
});

/** A Reach item delivered through `alice`, who saw it from `bob`. */
const reachItem = (id: string, title: string, hops: ReturnType<typeof hop>[]) => ({
    key: `coalition_feed:${id}`,
    ring: 'reach',
    at: '2026-09-01T12:00:00.000Z',
    subject: subject(id, title),
    path: { hops, originAuthorId: '@origin:test.local', length: hops.length },
    alsoRelayedBy: [],
});

const FEED = {
    generatedAt: '2026-09-01T12:00:00.000Z',
    circleSize: 4,
    items: [
        // A two-hop chain whose middle relayer withdrew — the case the path is
        // supposed to keep visible rather than quietly heal.
        reachItem('p1', 'Relayed through a withdrawn hop', [
            hop('r1', '@alice:test.local'),
            hop('r2', '@bob:test.local', false, 'passing this on'),
        ]),
        // Three consecutive items from one relayer: the run-collapse case.
        reachItem('p2', 'Run item one', [hop('r3', '@carol:test.local')]),
        reachItem('p3', 'Run item two', [hop('r4', '@carol:test.local')]),
        reachItem('p4', 'Run item three', [hop('r5', '@carol:test.local')]),
    ],
};

const CHAIN = {
    path: {
        hops: [
            hop('r1', '@alice:test.local'),
            hop('r2', '@bob:test.local', false, 'passing this on'),
        ],
        originAuthorId: '@origin:test.local',
        length: 2,
    },
    subject: subject('p1', 'Relayed through a withdrawn hop'),
    allRelayers: [
        {
            relayId: 'r1',
            userId: '@alice:test.local',
            active: true,
            at: '2026-09-01T12:00:00.000Z',
        },
        { relayId: 'r2', userId: '@bob:test.local', active: false, at: '2026-09-01T11:30:00.000Z' },
        { relayId: 'r9', userId: '@dave:test.local', active: true, at: '2026-09-01T11:00:00.000Z' },
    ],
};

const ILLUMINATION = {
    circleSize: 4,
    heldByCount: 2,
    overlapCount: 2,
    relayedCount: 3,
    downstreamCount: 5,
    litCount: 7,
    unlitCount: 3,
    networkSize: 10,
};

const json = (body: unknown) => ({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
});

/**
 * Stub the `/v1/*` surface the feed reads. `ringRequests` records the query the
 * client actually sent, so the ring filter can be asserted on the request
 * rather than on what re-rendered.
 */
async function stubFeed(page: Page, ringRequests: string[], feed: unknown = FEED) {
    await page.route('**/v1/feed/relays/mine', (route) => route.fulfill(json({ relays: [] })));
    await page.route('**/v1/feed/relays/*/chain', (route) => route.fulfill(json(CHAIN)));
    await page.route('**/v1/circle/illumination', (route) => route.fulfill(json(ILLUMINATION)));
    await page.route('**/v1/voice/rooms/open', (route) => route.fulfill(json({ rooms: [] })));
    await page.route('**/v1/feed?**', (route) => {
        ringRequests.push(new URL(route.request().url()).search);
        return route.fulfill(json(feed));
    });
    await page.route('**/v1/feed', (route) => {
        ringRequests.push('');
        return route.fulfill(json(feed));
    });
}

test.describe('Circle & Reach feed in a browser', () => {
    test('renders the full relay path, keeps a withdrawn hop visible, and marks it', async ({
        page,
    }) => {
        await stubFeed(page, []);
        await page.goto('/__dev__/circle-feed', { waitUntil: 'domcontentloaded' });

        const path = page.getByTestId('relay-path').first();
        await expect(path).toBeVisible();

        // Every hop is named, in reading order, with the viewer first. The
        // separators must survive layout — a path that renders "Youalicebob"
        // is the regression this pins.
        await expect(path).toHaveText(/You\s*→\s*alice\s*→\s*bob/);

        // The withdrawn relayer stays in the line and is struck through. jsdom
        // reports the class but never resolves the decoration; read it computed.
        const withdrawn = path.getByText('bob', { exact: true });
        await expect(withdrawn).toBeVisible();
        const decoration = await withdrawn.evaluate(
            (el) => getComputedStyle(el).textDecorationLine
        );
        expect(decoration).toContain('line-through');

        // And it is actually legible rather than painted out entirely.
        const box = await withdrawn.boundingBox();
        expect(box?.width ?? 0).toBeGreaterThan(0);
    });

    test('opens the chain dialog above the feed and lists every hop', async ({ page }) => {
        await stubFeed(page, []);
        await page.goto('/__dev__/circle-feed', { waitUntil: 'domcontentloaded' });

        await page.getByTestId('relay-path').first().click();

        const dialog = page.getByTestId('relay-chain-dialog');
        await expect(dialog).toBeVisible();
        await expect(dialog).toContainText('How this reached you');

        // Both hops, including the withdrawn one, stated as withdrawn.
        await expect(dialog.getByText('alice', { exact: true })).toBeVisible();
        await expect(dialog).toContainText('withdrew this relay');
        // The note the relayer left travels with them.
        await expect(dialog).toContainText('passing this on');
        // Relayers beyond the displayed path are counted, not hidden.
        await expect(dialog).toContainText('3 people have relayed it in total');

        // The dialog must sit above the feed it launched from: hit-test the
        // dialog's own centre and confirm the feed is not what receives it.
        const box = (await dialog.boundingBox())!;
        const onTop = await page.evaluate(
            ({ x, y }) => {
                const el = document.elementFromPoint(x, y);
                return !!el?.closest('[data-testid="relay-chain-dialog"]');
            },
            { x: box.x + box.width / 2, y: box.y + box.height / 2 }
        );
        expect(onTop).toBe(true);
    });

    test('collapses a run behind one clickable control and expands the run it names', async ({
        page,
    }) => {
        await stubFeed(page, []);
        await page.goto('/__dev__/circle-feed', { waitUntil: 'domcontentloaded' });

        const toggle = page.getByTestId('circle-feed-run-toggle');
        await expect(toggle).toBeVisible();
        await expect(toggle).toHaveText('Show 2 more relayed by this person');

        // Collapsed: the run contributes one card, so 2 of the 4 items show.
        await expect(page.getByTestId('circle-feed-card')).toHaveCount(2);

        await toggle.click();

        // Expanded: every item in the run is present, and the run that expanded
        // is carol's — the index-keyed bug expanded whichever run took the slot.
        await expect(page.getByTestId('circle-feed-card')).toHaveCount(4);
        await expect(page.getByText('Run item three')).toBeVisible();
        await expect(toggle).toHaveText('Collapse this run');
    });

    test('ring filter re-queries the server rather than filtering what is on screen', async ({
        page,
    }) => {
        const ringRequests: string[] = [];
        await stubFeed(page, ringRequests);
        await page.goto('/__dev__/circle-feed', { waitUntil: 'domcontentloaded' });
        await expect(page.getByTestId('relay-path').first()).toBeVisible();

        await page.getByTestId('circle-feed-ring-circle').click();
        await expect
            .poll(() => ringRequests.some((search) => search.includes('ring=circle')))
            .toBe(true);

        await page.getByTestId('circle-feed-ring-reach').click();
        await expect
            .poll(() => ringRequests.some((search) => search.includes('ring=reach')))
            .toBe(true);
    });

    test('an empty Circle explains itself instead of looking broken', async ({ page }) => {
        await stubFeed(page, [], {
            generatedAt: '2026-09-01T12:00:00.000Z',
            circleSize: 0,
            items: [],
        });
        await page.goto('/__dev__/circle-feed', { waitUntil: 'domcontentloaded' });

        const empty = page.getByTestId('circle-feed-empty');
        await expect(empty).toBeVisible();
        await expect(empty).toContainText('Your Circle is empty');
        await expect(empty).toContainText('Discover');
    });

    test('the illumination meter reports the unlit remainder', async ({ page }) => {
        await stubFeed(page, []);
        await page.goto('/__dev__/circle-feed', { waitUntil: 'domcontentloaded' });

        const meter = page.getByTestId('illumination-meter');
        await expect(meter).toBeVisible();
        await expect(meter).toContainText('3 still unlit');

        // The fill is a real width, not a collapsed zero-width div.
        const fill = meter.locator('[role="meter"] > div');
        await expect(fill).toHaveCount(1);
        const width = await fill.evaluate((el) => el.getBoundingClientRect().width);
        expect(width).toBeGreaterThan(0);
    });
});
