// Public geocaches (services/coalitionCaches.ts, routes/coalitionCaches.ts):
// geocaching phase 1, server side. These tests ask as the placer, as another
// member, as a moderator and as someone who has not agreed to the disclosure.
// docs/security/coalition-caches-2026-11-22.md

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.BLACKOUT_DB_MODE = process.env.BLACKOUT_DB_MODE ?? 'memory';
process.env.JWT_SECRET_PRIMARY =
    process.env.JWT_SECRET_PRIMARY ?? 'Str0ng!TestKey-For-Api-Integration-1234#ABCxyzZZ';
process.env.JWT_ISSUER = process.env.JWT_ISSUER ?? 'blackout-api-test';
process.env.JWT_AUDIENCE = process.env.JWT_AUDIENCE ?? 'blackout-client-test';
process.env.AUTH_RATE_LIMIT_MAX = process.env.AUTH_RATE_LIMIT_MAX ?? '1000';
process.env.BLACKOUT_COALITION_CACHES = '1';
process.env.BLACKOUT_ADMIN_USERS = 'cache-mod';

const { default: app } = await import('../src/index');
const { signJwt } = await import('../src/services/auth');
const { db } = await import('../src/db/store');
const { coarsenPoint, CACHE_AREA_CELL_METERS } = await import(
    '../src/services/coalitionVisibility'
);
const { PUBLIC_CACHE_DELAY_MS, PUBLIC_CACHE_JITTER_MS } = await import(
    '../src/services/coalitionCaches'
);
const { exportUserData, requestAccountDeletion, confirmAccountDeletion } = await import(
    '../src/services/accountLifecycle'
);
const { cacheDisclosureText } = await import('@blackout/core');

/** The SHA-256 of the disclosure text the client shows (@blackout/core). */
const TEXT_SHA256 = createHash('sha256').update(cacheDisclosureText(), 'utf8').digest('hex');
const METERS_PER_DEGREE_LATITUDE = 111_320;
const north = (p: { latitude: number; longitude: number }, meters: number) => ({
    latitude: p.latitude + meters / METERS_PER_DEGREE_LATITUDE,
    longitude: p.longitude,
});

// A spot 20 m north of the centre of its 50 m cell, so the exact spot and what
// others are shown differ.
const CENTRE = coarsenPoint(51.5007, -0.1246, CACHE_AREA_CELL_METERS);
const SPOT = north(CENTRE, 20);

// Each test person gets their own address, so the app-wide limit (120 a
// minute per address) counts them separately, as it would real people.
const addresses = new Map<string, string>();
const addressOf = (user: string) => {
    if (!addresses.has(user)) {
        const n = addresses.size + 1;
        addresses.set(user, `10.77.${Math.floor(n / 250)}.${(n % 250) + 1}`);
    }
    return addresses.get(user)!;
};
const headers = (user: string) => ({
    authorization: `Bearer ${signJwt(user, user, 600)}`,
    'content-type': 'application/json',
    'x-forwarded-for': addressOf(user),
});
const call = (method: string, path: string, user: string, body?: unknown) =>
    app.request(`/v1${path}`, {
        method,
        headers: headers(user),
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
const json = async <T>(response: Response): Promise<T> => (await response.json()) as T;

const agree = async (user: string, overrides: Record<string, unknown> = {}) =>
    call('POST', '/consents', user, {
        kind: 'coalition-caches',
        version: 1,
        textSha256: TEXT_SHA256,
        ageConfirmed: true,
        ...overrides,
    });

type CacheRow = {
    id: string;
    mine: boolean;
    status?: string;
    position?: { latitude: number; longitude: number };
    area?: { latitude: number; longitude: number; radiusMeters: number };
    findCount: number;
    foundByMe?: boolean;
    moderationNote?: string | null;
    [key: string]: unknown;
};

const place = async (user: string, body: Record<string, unknown> = {}) => {
    const response = await call('POST', '/coalition/caches', user, {
        title: 'Under the bench',
        hint: 'Look for the loose brick',
        proof: 'code',
        position: SPOT,
        ...body,
    });
    assert.equal(response.status, 201, await response.clone().text());
    return json<{ cache: CacheRow; code: string | null }>(response);
};

/** The delay, passed: move visibleFrom into the past. */
const passDelay = (id: string) => {
    const cache = db.getCoalitionCache(id)!;
    db.upsertCoalitionCache({ ...cache, visibleFrom: new Date(Date.now() - 1000).toISOString() });
};

const list = async (user: string) =>
    (await json<{ caches: CacheRow[] }>(await call('GET', '/coalition/caches', user))).caches;

/** An account that exists, has not agreed to anything yet. */
const makeAccount = (prefix: string, id = `${prefix}-${randomUUID().slice(0, 8)}`) => {
    db.createUser({
        id,
        username: id,
        email: `${id}@example.com`,
        passwordHash: 'unused',
        reputationScore: 0,
        reputationTier: 'member',
        pubkeyEd25519: 'pk',
    });
    return id;
};

/** An account that has agreed to the caches disclosure. */
const newUser = async (prefix: string) => {
    const user = makeAccount(prefix);
    assert.equal((await agree(user)).status, 201);
    return user;
};

type QueueEntry = {
    cache: Record<string, unknown> & { id: string };
    insideExclusionZone: boolean;
    reports: unknown[];
};
const queue = async () =>
    (
        await json<{ queue: QueueEntry[] }>(
            await call('GET', '/coalition/caches/moderation', 'cache-mod')
        )
    ).queue;

const addZone = async (
    label: string,
    position: { latitude: number; longitude: number },
    radiusMeters: number
) => {
    const response = await call('POST', '/coalition/caches/exclusions', 'cache-mod', {
        label,
        position,
        radiusMeters,
    });
    assert.equal(response.status, 201);
    return (await json<{ zone: { id: string } }>(response)).zone.id;
};
const removeZone = (id: string) =>
    call('DELETE', `/coalition/caches/exclusions/${id}`, 'cache-mod');

test('nothing answers while the feature is off', async () => {
    process.env.BLACKOUT_COALITION_CACHES = '0';
    try {
        const user = await newUser('off');
        assert.equal((await call('GET', '/coalition/caches', user)).status, 404);
    } finally {
        process.env.BLACKOUT_COALITION_CACHES = '1';
    }
});

test('the disclosure comes first: the current text, the current version, and the 18+ statement', async () => {
    const user = makeAccount('consent');
    const blocked = await call('GET', '/coalition/caches', user);
    assert.equal(blocked.status, 403);
    assert.equal((await json<{ code: string }>(blocked)).code, 'consent_required');

    const noAge = await agree(user, { ageConfirmed: false });
    assert.equal((await json<{ code: string }>(noAge)).code, 'age_required');
    const stale = await agree(user, { version: 2 });
    assert.equal((await json<{ code: string }>(stale)).code, 'stale_version');
    const otherText = await agree(user, { textSha256: '0'.repeat(64) });
    assert.equal(otherText.status, 400);
    assert.equal((await json<{ code: string }>(otherText)).code, 'wrong_text');
    assert.equal((await call('GET', '/coalition/caches', user)).status, 403);

    assert.equal((await agree(user)).status, 201);
    assert.equal((await call('GET', '/coalition/caches', user)).status, 200);

    // The person sees their own history; the first agreement is replaced, not lost.
    assert.equal((await agree(user)).status, 201);
    const history = (
        await json<{ consents: Array<{ withdrawnAt: string | null }> }>(
            await call('GET', '/consents', user)
        )
    ).consents;
    assert.equal(history.length, 2);
    assert.equal(history.filter((c) => c.withdrawnAt === null).length, 1);
});

test('a token whose account does not exist gets nothing', async () => {
    const ghost = `ghost-${randomUUID().slice(0, 8)}`;
    assert.equal((await agree(ghost)).status, 401);
    assert.equal((await call('GET', '/coalition/caches', ghost)).status, 401);
});

test('the code is shown once and never stored; others see nothing for 2 to 3 hours, then an area', async () => {
    const placer = await newUser('placer');
    const other = await newUser('other');
    const before = Date.now();
    const { cache, code } = await place(placer);

    assert.match(code ?? '', /^[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{2}$/);
    const stored = db.getCoalitionCache(cache.id)!;
    const plain = code!.replace(/-/g, '');
    assert.ok(!JSON.stringify(stored).includes(plain), 'the code is not in the stored record');
    assert.match(stored.codeHash ?? '', /^[0-9a-f]{64}$/);
    const delay = Date.parse(stored.visibleFrom) - before;
    assert.ok(delay >= PUBLIC_CACHE_DELAY_MS - 1000, `at least 2 hours (${delay})`);
    assert.ok(
        delay <= PUBLIC_CACHE_DELAY_MS + PUBLIC_CACHE_JITTER_MS + 5000,
        `at most 3 (${delay})`
    );

    // The placer sees it whole at once; nobody else sees it yet.
    assert.deepEqual(cache.position, SPOT);
    assert.equal(cache.status, 'placed');
    assert.ok(!(await list(other)).some((c) => c.id === cache.id));
    assert.equal((await call('GET', `/coalition/caches/${cache.id}`, other)).status, 404);

    passDelay(cache.id);
    const seen = (await list(other)).find((c) => c.id === cache.id);
    assert.ok(seen, 'listed once the delay has passed');
    assert.equal(seen.mine, false);
    assert.deepEqual(
        { latitude: seen.area!.latitude, longitude: seen.area!.longitude },
        CENTRE,
        'the centre of its 50 m cell, not the spot'
    );
    for (const key of [
        'position',
        'placerId',
        'visibleFrom',
        'createdAt',
        'codeHash',
        'codeSalt',
        'status',
        'heldReason',
    ]) {
        assert.ok(!(key in seen), `others are not sent ${key}`);
    }
});

test('when a cache appears does not date the visit to the minute', async () => {
    const placer = await newUser('jitter');
    const delays: number[] = [];
    for (let i = 0; i < 6; i += 1) {
        const before = Date.now();
        const { cache } = await place(placer);
        delays.push(Date.parse(db.getCoalitionCache(cache.id)!.visibleFrom) - before);
    }
    const spread = Math.max(...delays) - Math.min(...delays);
    assert.ok(
        spread > 60_000,
        `six caches placed together appear over more than a minute (${spread} ms)`
    );
});

test('a radius search tests what each viewer is shown, so it cannot find the exact spot', async () => {
    const placer = await newUser('radius-placer');
    const other = await newUser('radius-other');
    const { cache } = await place(placer);
    passDelay(cache.id);
    // 90 m north of the spot is 110 m north of the cell centre.
    const probe = { position: north(SPOT, 90), radiusKm: 0.1 };
    const search = async (user: string) =>
        (
            await json<{ caches: CacheRow[] }>(
                await call('POST', '/coalition/caches/search', user, probe)
            )
        ).caches;
    assert.ok(
        (await search(placer)).some((c) => c.id === cache.id),
        'the placer, by the exact spot'
    );
    assert.ok(!(await search(other)).some((c) => c.id === cache.id), 'others, by the cell centre');
});

test('finding by code: any case or spacing works, a wrong code does not, one find per person', async () => {
    const placer = await newUser('code-placer');
    const finder = await newUser('code-finder');
    const { cache, code } = await place(placer);
    passDelay(cache.id);

    const wrong = await call('POST', `/coalition/caches/${cache.id}/find`, finder, {
        code: 'AAAA-BBBB-CC',
    });
    assert.equal(wrong.status, 400);
    assert.equal((await json<{ code: string }>(wrong)).code, 'wrong_code');
    assert.equal(
        (await call('POST', `/coalition/caches/${cache.id}/find`, placer, { code })).status,
        400,
        'the placer cannot find their own'
    );

    const typed = ` ${code!.toLowerCase().replace(/-/g, ' ')} `;
    const found = await call('POST', `/coalition/caches/${cache.id}/find`, finder, { code: typed });
    assert.equal(found.status, 200);
    assert.equal((await json<{ findCount: number }>(found)).findCount, 1);
    const again = await call('POST', `/coalition/caches/${cache.id}/find`, finder, { code });
    assert.equal((await json<{ findCount: number }>(again)).findCount, 1);
    // Once found, a person gets their find back without another comparison.
    const later = await call('POST', `/coalition/caches/${cache.id}/find`, finder, {
        code: 'AAAA-BBBB-CC',
    });
    assert.equal(later.status, 200);
    // And the store keeps one find per person, even for two writes at once.
    const first = db.listCoalitionCacheFinds({ cacheId: cache.id, finderId: finder })[0]!;
    const second = db.addCoalitionCacheFind({
        ...first,
        id: randomUUID(),
        foundAt: new Date().toISOString(),
    });
    assert.equal(second.id, first.id);
    assert.equal(db.listCoalitionCacheFinds({ cacheId: cache.id }).length, 1);

    const row = (await list(finder)).find((c) => c.id === cache.id)!;
    assert.equal(row.foundByMe, true);
    const finds = db.listCoalitionCacheFinds({ cacheId: cache.id });
    assert.deepEqual(Object.keys(finds[0]!).sort(), ['cacheId', 'finderId', 'foundAt', 'id']);
});

test('finding by GPS: checked against the area everyone is shown, so it cannot locate the spot; nothing kept', async () => {
    const placer = await newUser('gps-placer');
    const { cache, code } = await place(placer, { proof: 'gps' });
    assert.equal(code, null);
    passDelay(cache.id);
    const attempt = async (position: { latitude: number; longitude: number }) => {
        const finder = await newUser('gps-finder');
        const response = await call('POST', `/coalition/caches/${cache.id}/find`, finder, {
            position,
        });
        return response.status === 200 ? 'found' : (await json<{ code: string }>(response)).code;
    };
    // The spot is 20 m north of the centre. Two points 74 m from the centre,
    // one 54 m from the spot and one 94 m from it, get the same answer: the
    // answer depends only on the centre, which everyone is already shown.
    assert.equal(await attempt(north(CENTRE, 74)), 'found');
    assert.equal(await attempt(north(CENTRE, -74)), 'found');
    assert.equal(await attempt(north(CENTRE, 80)), 'too_far');
    assert.equal(await attempt(north(CENTRE, -80)), 'too_far');

    const near = north(CENTRE, -30);
    assert.equal(await attempt(near), 'found');
    const everything = JSON.stringify([
        ...db.coalitionCacheFinds.values(),
        ...db.coalitionCaches.values(),
        ...db.coalitionCacheReports.values(),
    ]);
    assert.ok(
        !everything.includes(String(near.latitude)),
        "the finder's position is stored nowhere"
    );
});

test('a report hides the cache from everyone but its placer until a moderator acts', async () => {
    const placer = await newUser('rep-placer');
    const reporter = await newUser('rep-reporter');
    const bystander = await newUser('rep-bystander');
    const { cache } = await place(placer);
    passDelay(cache.id);

    const report = () =>
        call('POST', `/coalition/caches/${cache.id}/report`, reporter, {
            reason: 'This is a school',
        });
    assert.equal((await report()).status, 201);
    assert.ok(!(await list(bystander)).some((c) => c.id === cache.id), 'hidden from others');
    assert.ok(!(await list(reporter)).some((c) => c.id === cache.id), 'and from the reporter');
    assert.equal(
        (await list(placer)).find((c) => c.id === cache.id)?.status,
        'hidden_after_report'
    );

    // Members cannot see the queue; the moderator sees the exact spot and the report.
    assert.equal((await call('GET', '/coalition/caches/moderation', reporter)).status, 403);
    const entry = (await queue()).find((e) => e.cache.id === cache.id);
    assert.ok(entry);
    assert.equal(entry.cache.latitude, SPOT.latitude);
    assert.equal(entry.reports.length, 1);
    assert.ok(!('codeHash' in entry.cache) && !('codeSalt' in entry.cache));

    // Restore: visible again, report closed, and the same reporter cannot hide it again.
    await call('POST', `/coalition/caches/${cache.id}/moderate`, 'cache-mod', {
        action: 'restore',
    });
    assert.ok((await list(bystander)).some((c) => c.id === cache.id));
    assert.equal(db.listCoalitionCacheReports({ cacheId: cache.id, resolved: false }).length, 0);
    assert.equal((await report()).status, 201);
    assert.ok(
        (await list(bystander)).some((c) => c.id === cache.id),
        'a reviewed reporter does not hide it again'
    );

    // Remove: gone for others; the placer is told, with the note.
    await call('POST', `/coalition/caches/${cache.id}/moderate`, 'cache-mod', {
        action: 'remove',
        note: 'Too close to a school entrance',
    });
    assert.ok(!(await list(bystander)).some((c) => c.id === cache.id));
    const mine = (await list(placer)).find((c) => c.id === cache.id)!;
    assert.equal(mine.status, 'removed_by_moderator');
    assert.equal(mine.moderationNote, 'Too close to a school entrance');
});

test('a placer taking a reported cache down closes its reports and takes it out of the queue', async () => {
    const placer = await newUser('down-placer');
    const reporter = await newUser('down-reporter');
    const { cache } = await place(placer);
    passDelay(cache.id);
    await call('POST', `/coalition/caches/${cache.id}/report`, reporter, {
        reason: 'Private land',
    });
    assert.ok((await queue()).some((e) => e.cache.id === cache.id));
    assert.equal((await call('DELETE', `/coalition/caches/${cache.id}`, placer)).status, 204);
    assert.ok(!(await queue()).some((e) => e.cache.id === cache.id));
    assert.equal(db.listCoalitionCacheReports({ cacheId: cache.id, resolved: false }).length, 0);
});

test('inside an exclusion zone: nothing the placer can see differs, and nothing a moderator does publishes it', async () => {
    const zoneCentre = { latitude: 48.8566, longitude: 2.3522 };
    const zoneId = await addZone('Shelter', zoneCentre, 200);
    const zoneIds = [zoneId];
    try {
        const placer = makeAccount('zone-placer');
        assert.equal((await agree(placer)).status, 201);
        const other = await newUser('zone-other');
        assert.equal((await call('GET', '/coalition/caches/exclusions', placer)).status, 403);

        const inside = await place(placer, { position: north(zoneCentre, 50) });
        const outside = await place(placer, { position: north(zoneCentre, 5000) });
        const shape = (r: { cache: CacheRow; code: string | null }) => ({
            keys: Object.keys(r.cache).sort(),
            status: r.cache.status,
            hasCode: r.code !== null,
        });
        assert.deepEqual(shape(inside), shape(outside), 'the placement answer is the same');
        passDelay(inside.cache.id);
        passDelay(outside.cache.id);

        const placerView = async (id: string) => (await list(placer)).find((c) => c.id === id);
        const exportStatus = (id: string) =>
            exportUserData(placer)!.coalitionCaches.find((c) => c.id === id)?.status;
        assert.equal((await placerView(inside.cache.id))?.status, 'placed');
        assert.equal(
            exportStatus(inside.cache.id),
            exportStatus(outside.cache.id),
            'the export too'
        );
        assert.equal(exportStatus(inside.cache.id), 'placed');

        const seen = (await list(other)).map((c) => c.id);
        assert.ok(seen.includes(outside.cache.id));
        assert.ok(!seen.includes(inside.cache.id), 'held');
        assert.equal(
            (await call('GET', `/coalition/caches/${inside.cache.id}`, other)).status,
            404
        );

        // The moderator sees it flagged; a restore does not publish it.
        const entry = (await queue()).find((e) => e.cache.id === inside.cache.id);
        assert.equal(entry?.insideExclusionZone, true);
        await call('POST', `/coalition/caches/${inside.cache.id}/moderate`, 'cache-mod', {
            action: 'restore',
        });
        assert.ok(
            !(await list(other)).some((c) => c.id === inside.cache.id),
            'restore: still held'
        );
        // A removal reads as "placed" to the placer, with no note: it can only have come from the zone.
        await call('POST', `/coalition/caches/${inside.cache.id}/moderate`, 'cache-mod', {
            action: 'remove',
            note: 'Inside the shelter zone',
        });
        const afterRemoval = await placerView(inside.cache.id);
        assert.equal(afterRemoval?.status, 'placed');
        assert.equal(afterRemoval?.moderationNote, null);
        assert.equal(exportStatus(inside.cache.id), 'placed');

        // A zone added later hides the active caches already inside it.
        const later = await place(placer, { position: north(zoneCentre, 9000) });
        passDelay(later.cache.id);
        assert.ok((await list(other)).some((c) => c.id === later.cache.id));
        zoneIds.push(await addZone('Clinic', north(zoneCentre, 9000), 50));
        assert.ok(!(await list(other)).some((c) => c.id === later.cache.id));

        // Reported first, zone added after, then restored: still not shown.
        const reporter = await newUser('zone-reporter');
        const reported = await place(placer, { position: north(zoneCentre, 20000) });
        passDelay(reported.cache.id);
        await call('POST', `/coalition/caches/${reported.cache.id}/report`, reporter, {
            reason: 'Odd',
        });
        zoneIds.push(await addZone('School', north(zoneCentre, 20000), 50));
        await call('POST', `/coalition/caches/${reported.cache.id}/moderate`, 'cache-mod', {
            action: 'restore',
        });
        assert.ok(!(await list(other)).some((c) => c.id === reported.cache.id));
    } finally {
        for (const id of zoneIds) await removeZone(id);
    }
});

test('withdrawing stops the feature, and the placer can still take their caches down', async () => {
    const placer = await newUser('withdraw-placer');
    const { cache } = await place(placer);
    const stranger = await newUser('withdraw-stranger');
    assert.equal(
        (await call('DELETE', `/coalition/caches/${cache.id}`, stranger)).status,
        404,
        'nobody else can take it down'
    );
    assert.equal(db.getCoalitionCache(cache.id)?.status, 'active');
    assert.equal((await call('POST', '/consents/coalition-caches/withdraw', placer)).status, 200);
    assert.equal((await call('GET', '/coalition/caches', placer)).status, 403);
    assert.equal((await call('DELETE', `/coalition/caches/${cache.id}`, placer)).status, 204);
    assert.equal(db.getCoalitionCache(cache.id)?.status, 'removed');
    assert.equal((await call('DELETE', `/coalition/caches/${cache.id}`, placer)).status, 404);
});

test("the account export includes the person's caches, finds, reports and consents; deletion erases them", async () => {
    const id = await newUser('cacher');
    const other = await newUser('erase-other');
    const mine = await place(id);
    const theirs = await place(other);
    passDelay(mine.cache.id);
    passDelay(theirs.cache.id);
    await call('POST', `/coalition/caches/${theirs.cache.id}/find`, id, { code: theirs.code });
    await call('POST', `/coalition/caches/${mine.cache.id}/find`, other, { code: mine.code });
    await call('POST', `/coalition/caches/${theirs.cache.id}/report`, id, {
        reason: 'Private garden',
    });
    await call('POST', `/coalition/caches/${mine.cache.id}/report`, other, { reason: 'Odd spot' });

    const exported = exportUserData(id)!;
    assert.equal(exported.consents.length, 1);
    assert.deepEqual(
        exported.coalitionCaches.map((c) => c.id),
        [mine.cache.id]
    );
    assert.equal(exported.coalitionCaches[0]!.latitude, SPOT.latitude);
    assert.deepEqual(
        exported.coalitionCacheFinds.map((f) => f.cacheId),
        [theirs.cache.id]
    );
    assert.deepEqual(
        exported.coalitionCacheReports.map((r) => r.cacheId),
        [theirs.cache.id]
    );

    const issued = requestAccountDeletion({ userId: id })!;
    assert.equal(confirmAccountDeletion(issued.token, id).kind, 'ok');
    assert.equal(db.getCoalitionCache(mine.cache.id), undefined);
    assert.equal(
        db.listCoalitionCacheFinds({ cacheId: mine.cache.id }).length,
        0,
        'finds on their cache'
    );
    assert.equal(
        db.listCoalitionCacheReports({ cacheId: mine.cache.id }).length,
        0,
        'reports on it'
    );
    assert.equal(db.listCoalitionCacheFinds({ finderId: id }).length, 0);
    assert.equal(db.listCoalitionCacheReports({ reporterId: id }).length, 0);
    assert.equal(db.listUserConsents(id).length, 0);
    assert.ok(db.getCoalitionCache(theirs.cache.id), "someone else's cache stays");

    // A token issued before the deletion gets nothing, and can write nothing.
    assert.equal((await call('GET', '/coalition/caches', id)).status, 401);
    assert.equal((await agree(id)).status, 401);
});
