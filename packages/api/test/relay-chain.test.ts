import test from 'node:test';
import assert from 'node:assert/strict';
import {
    buildRelayPath,
    collectDownstreamRelays,
    computeIllumination,
    MAX_RELAY_CHAIN_DEPTH,
    nextChainDepth,
    ringForItem,
    type RelayLink,
} from '@blackout/core';

/** Build a chain root->...->tip where each hop is relayed by `people[i]`. */
const chain = (people: readonly string[], subjectId = 'item-1'): RelayLink[] => {
    const edges: RelayLink[] = [];
    people.forEach((userId, index) => {
        const parent = index === 0 ? null : edges[index - 1]!;
        edges.push({
            id: `relay-${index}`,
            relayerUserId: userId,
            subjectSource: 'coalition_feed',
            subjectId,
            parentRelayId: parent ? parent.id : null,
            rootRelayId: 'relay-0',
            chainDepth: index,
            originAuthorId: 'author-1',
            note: null,
            active: true,
            createdAt: `2026-09-01T00:0${index}:00.000Z`,
        });
    });
    return edges;
};

const byId = (edges: readonly RelayLink[]) => new Map(edges.map((e) => [e.id, e]));

test('buildRelayPath walks every hop back to the origin, nearest first', () => {
    const edges = chain(['origin-relayer', 'middle', 'nearest']);
    const path = buildRelayPath(edges[2]!, byId(edges));

    // The whole promise: a post that travelled 3 relays shows all 3 people,
    // never collapsed down to "last booster only".
    assert.deepEqual(
        path.hops.map((h) => h.userId),
        ['nearest', 'middle', 'origin-relayer']
    );
    assert.equal(path.length, 3);
    assert.equal(path.originAuthorId, 'author-1');
});

test('buildRelayPath keeps a withdrawn ancestor in the path, flagged', () => {
    const edges = chain(['origin-relayer', 'middle', 'nearest']);
    edges[1] = { ...edges[1]!, active: false };
    const path = buildRelayPath(edges[2]!, byId(edges));

    // A chain with a hole in it would misrepresent how the item travelled, so
    // the hop stays and carries its own state instead.
    assert.equal(path.hops.length, 3);
    assert.equal(path.hops[1]?.userId, 'middle');
    assert.equal(path.hops[1]?.active, false);
    assert.equal(path.hops[2]?.active, true);
});

test('buildRelayPath tolerates a dangling parent instead of throwing', () => {
    const edges = chain(['origin-relayer', 'nearest']);
    // Origin row is gone; the surviving child still points at it.
    const partial = new Map([[edges[1]!.id, edges[1]!]]);
    const path = buildRelayPath(edges[1]!, partial);
    assert.deepEqual(
        path.hops.map((h) => h.userId),
        ['nearest']
    );
});

test('buildRelayPath cannot loop even on corrupt parent pointers', () => {
    const a: RelayLink = { ...chain(['a'])[0]!, id: 'a', parentRelayId: 'b' };
    const b: RelayLink = { ...chain(['b'])[0]!, id: 'b', parentRelayId: 'a' };
    const path = buildRelayPath(a, byId([a, b]));
    assert.equal(path.hops.length, 2, 'the seen-guard stops the cycle');
});

test('buildRelayPath stops at the depth ceiling', () => {
    const people = Array.from({ length: MAX_RELAY_CHAIN_DEPTH + 10 }, (_, i) => `p${i}`);
    const edges = chain(people);
    const path = buildRelayPath(edges[edges.length - 1]!, byId(edges));
    assert.equal(path.hops.length, MAX_RELAY_CHAIN_DEPTH);
});

test('nextChainDepth counts from the origin and refuses to exceed the ceiling', () => {
    assert.deepEqual(nextChainDepth(null), { depth: 0, withinLimit: true });

    const parent = { ...chain(['x'])[0]!, chainDepth: 4 };
    assert.deepEqual(nextChainDepth(parent), { depth: 5, withinLimit: true });

    const deep = { ...parent, chainDepth: MAX_RELAY_CHAIN_DEPTH - 1 };
    // Truncating instead of refusing would claim a provenance that isn't true.
    assert.equal(nextChainDepth(deep).withinLimit, false);
});

test('collectDownstreamRelays finds people reached many hops later', () => {
    const edges = chain(['me', 'friend', 'stranger', 'further-stranger']);
    const downstream = collectDownstreamRelays(['relay-0'], edges);
    assert.deepEqual(
        downstream.map((e) => e.relayerUserId),
        ['friend', 'stranger', 'further-stranger']
    );
});

test('collectDownstreamRelays still counts a withdrawn relay as having carried it', () => {
    const edges = chain(['me', 'friend', 'stranger']);
    edges[1] = { ...edges[1]!, active: false };
    const downstream = collectDownstreamRelays(['relay-0'], edges);
    // friend withdrew, but stranger genuinely received it through them; unrelaying
    // does not rewrite that history.
    assert.deepEqual(
        downstream.map((e) => e.relayerUserId),
        ['friend', 'stranger']
    );
});

test('ringForItem: authorship wins over relay', () => {
    const circle = new Set(['b']);
    // You follow b, so "you follow them" is the honest reason you see it.
    assert.equal(ringForItem({ authorId: 'b', circle }), 'circle');
    // Nobody you follow wrote it — it got here by being relayed.
    assert.equal(ringForItem({ authorId: 'stranger', circle }), 'reach');
    assert.equal(ringForItem({ authorId: null, circle }), 'reach');
});

test('computeIllumination counts distinct people, never double-counting', () => {
    const edges = chain(['me', 'downstream-a', 'downstream-b']);
    const result = computeIllumination({
        // `mutual` appears as both a followee and a follower.
        following: ['mutual', 'followee-only'],
        followers: ['mutual', 'follower-only'],
        ownRelays: [edges[0]!],
        allRelays: edges,
        networkSize: 100,
    });

    assert.equal(result.circleSize, 2);
    assert.equal(result.heldByCount, 2);
    assert.equal(result.overlapCount, 1);
    assert.equal(result.downstreamCount, 2);
    // mutual, followee-only, follower-only, downstream-a, downstream-b = 5.
    assert.equal(result.litCount, 5);
    assert.equal(result.unlitCount, 95);
});

test('computeIllumination clamps a lagging network-size snapshot', () => {
    const result = computeIllumination({
        following: ['a', 'b', 'c'],
        followers: [],
        ownRelays: [],
        allRelays: [],
        networkSize: 1,
    });
    assert.equal(result.unlitCount, 0, 'never reports a negative remainder');
});
