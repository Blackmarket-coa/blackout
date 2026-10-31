// What the Postgres store's write-through specs cover, checked against the
// store's own source and its behaviour.
//
// U1 reads InMemoryDb's source with the TypeScript compiler: every method
// that writes a mirror map (set/delete/clear on it, or replacing it) has a
// spec naming exactly the maps it writes, or is on WRITE_ALLOWLIST with the
// reason it is never written to Postgres. A method without either changes the
// mirror and nothing else: lost on restart, never seen by another process.
//
// U6 calls every targeted mutator on a booted PostgresBackedDb and checks that
// the keys its wrapper captured (by shadowing set/delete/clear for the call)
// are exactly the keys a snapshot of every map before and after shows changed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

process.env.BLACKOUT_DB_MODE = 'memory';

const ts = (await import('typescript')).default;
const { PostgresBackedDb } = await import('../src/db/store');
const { MIGRATIONS_DIR } = await import('../src/db/migrate');
const { MUTATOR_SPECS, TABLE_DESCRIPTORS, USER_CASCADE_CHILDREN } = await import(
    '../src/db/pgDescriptors'
);

type Spec = typeof MUTATOR_SPECS[string];

/**
 * Methods that write a mirror map and have no spec, each with why. Every entry
 * must name an InMemoryDb method that does write a map.
 */
const WRITE_ALLOWLIST: Record<string, string> = {
    // Diagnostics kept in memory on purpose, by the methods' own comments:
    // writing them on every connection or SSE flush is write amplification.
    touchTwitchIrcBotTokenUsed: 'in-memory diagnostic (last used, use count)',
    touchObsWsPasswordUsed: 'in-memory diagnostic (last used, use count)',
    touchWidgetAlertTokenDelivered: 'in-memory diagnostic (last delivered)',
    // Test seams; production never calls them.
    resetCanopyBillingForTest: 'test seam',
    resetMeshEnvelopesForTest: 'test seam',
    resetMarketplaceForTest: 'test seam',
    resetFbmMatrixBridgeForTest: 'test seam',
    resetFbmAclStateForTest: 'test seam',
    resetTipsForTest: 'test seam',
    resetReferralsForTest: 'test seam',
    resetAmbassadorsForTest: 'test seam',
    resetQuestsForTest: 'test seam',
    resetMigrationCreditsForTest: 'test seam',
    resetBountyRewardsForTest: 'test seam',
    resetCreatorSubscriptionsForTest: 'test seam',
    resetCommunityBoostsForTest: 'test seam',
    resetAidPoolsForTest: 'test seam',
    resetAdRevenueForTest: 'test seam',
    resetReputationEvents: 'test seam (reputationStore.resetReputationStore)',
    // KNOWN GAP, found by this test on 2026-10-31 and not part of the resync
    // fix: these write a map but have no spec, so in Postgres mode the change
    // never reaches Postgres, no other process hears of it, and a restart
    // loses it. Recorded in docs/security/store-cross-process-writes-2026-10-31.md.
    // Giving each a spec needs its own review (upsertCampaignAttribution's
    // conflict key has a nullable column, for one).
    resolveVote: 'KNOWN GAP: not persisted in Postgres mode',
    upsertCoalitionAidPostByOrigin: 'KNOWN GAP: not persisted in Postgres mode',
    upsertCampaignAttribution: 'KNOWN GAP: not persisted in Postgres mode',
    upsertCampaignEngagement: 'KNOWN GAP: not persisted in Postgres mode',
};

const mapNames = new Set(TABLE_DESCRIPTORS.map((d) => d.mapName));

interface MethodInfo {
    line: number;
    isPrivate: boolean;
    /** Maps the method writes itself. */
    writes: Set<string>;
    /** Other InMemoryDb methods it calls on `this`. */
    calls: Set<string>;
    /** Assignments into something other than a map field (would escape the wrapper's capture). */
    inPlace: string[];
}

function scanInMemoryDb(): Map<string, MethodInfo> {
    const file = new URL('../src/db/store.ts', import.meta.url);
    const sf = ts.createSourceFile(
        'store.ts',
        readFileSync(file, 'utf8'),
        ts.ScriptTarget.Latest,
        true
    );
    let cls: import('typescript').ClassDeclaration | undefined;
    sf.forEachChild((n) => {
        if (ts.isClassDeclaration(n) && n.name?.text === 'InMemoryDb') cls = n;
    });
    assert.ok(cls, 'InMemoryDb found in store.ts');
    const isThis = (e: import('typescript').Expression) => e.kind === ts.SyntaxKind.ThisKeyword;
    const out = new Map<string, MethodInfo>();
    for (const member of cls.members) {
        if (!ts.isMethodDeclaration(member) || !member.body) continue;
        const info: MethodInfo = {
            line: sf.getLineAndCharacterOfPosition(member.getStart()).line + 1,
            isPrivate: !!member.modifiers?.some((m) => m.kind === ts.SyntaxKind.PrivateKeyword),
            writes: new Set(),
            calls: new Set(),
            inPlace: [],
        };
        const visit = (n: import('typescript').Node): void => {
            if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)) {
                const callee = n.expression;
                const target = callee.expression;
                if (
                    ts.isPropertyAccessExpression(target) &&
                    isThis(target.expression) &&
                    mapNames.has(target.name.text) &&
                    ['set', 'delete', 'clear'].includes(callee.name.text)
                ) {
                    info.writes.add(target.name.text);
                }
                if (isThis(target)) info.calls.add(callee.name.text);
                if (
                    ts.isIdentifier(target) &&
                    target.text === 'Object' &&
                    callee.name.text === 'assign'
                ) {
                    info.inPlace.push(n.getText(sf).slice(0, 60));
                }
            }
            const assigns =
                ts.isBinaryExpression(n) &&
                n.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
                n.operatorToken.kind <= ts.SyntaxKind.LastAssignment;
            const bumps =
                (ts.isPrefixUnaryExpression(n) || ts.isPostfixUnaryExpression(n)) &&
                (n.operator === ts.SyntaxKind.PlusPlusToken ||
                    n.operator === ts.SyntaxKind.MinusMinusToken);
            const lhs = assigns ? n.left : bumps ? n.operand : undefined;
            if (lhs && (ts.isPropertyAccessExpression(lhs) || ts.isElementAccessExpression(lhs))) {
                if (
                    ts.isPropertyAccessExpression(lhs) &&
                    isThis(lhs.expression) &&
                    mapNames.has(lhs.name.text)
                ) {
                    info.writes.add(lhs.name.text);
                } else {
                    info.inPlace.push(n.getText(sf).slice(0, 60));
                }
            }
            ts.forEachChild(n, visit);
        };
        visit(member.body);
        out.set(member.name.getText(sf), info);
    }
    return out;
}

/** The maps a spec writes. Read structurally, so the test also runs against an older spec table. */
const specMaps = (spec: Spec): Set<string> => {
    const s = spec as { map?: string; maps?: string[]; steps?: Array<{ map: string }> };
    return new Set([
        ...(s.map ? [s.map] : []),
        ...(s.maps ?? []),
        ...(s.steps ?? []).map((x) => x.map),
    ]);
};

test('U1: every mirror-writing InMemoryDb method has a spec naming the maps it writes, or a stated reason', () => {
    const methods = scanInMemoryDb();
    assert.ok(methods.size > 400, `scanned ${methods.size} methods`);
    const specs = MUTATOR_SPECS as Record<string, Spec>;
    // What a method writes that no spec of its own covers: its own writes,
    // plus those of the unspecced helpers it calls. A specced callee's writes
    // are persisted by that callee's own wrapper.
    const effective = (name: string, seen = new Set<string>()): Set<string> => {
        const info = methods.get(name);
        if (!info || seen.has(name)) return new Set();
        seen.add(name);
        const out = new Set(info.writes);
        for (const callee of info.calls) {
            if (callee in specs) continue;
            for (const m of effective(callee, seen)) out.add(m);
        }
        return out;
    };
    const problems: string[] = [];
    for (const [name, info] of methods) {
        const writes = effective(name);
        for (const what of info.inPlace) {
            problems.push(`${name} (store.ts:${info.line}) assigns in place: ${what}`);
        }
        const spec = specs[name];
        if (!spec) {
            if (writes.size === 0 || info.isPrivate) continue;
            if (!(name in WRITE_ALLOWLIST)) {
                problems.push(
                    `${name} (store.ts:${info.line}) writes ${[...writes].join(
                        ', '
                    )} and has no spec`
                );
            }
            continue;
        }
        const listed = specMaps(spec);
        const missing = [...writes].filter((m) => !listed.has(m));
        if (missing.length)
            problems.push(`${name}: writes ${missing.join(', ')}, which its spec does not name`);
        // deleteUser alone names maps it does not write in the mirror: the
        // rows Postgres cascades from the account (USER_CASCADE_CHILDREN).
        const allowedExtra =
            name === 'deleteUser'
                ? new Set((USER_CASCADE_CHILDREN ?? []).map((c) => c.map))
                : new Set();
        const extra = [...listed].filter((m) => !writes.has(m) && !allowedExtra.has(m));
        if (extra.length)
            problems.push(`${name}: spec names ${extra.join(', ')}, which it never writes`);
        if (writes.size === 0) problems.push(`${name}: has a spec but writes no map`);
    }
    for (const name of Object.keys(specs)) {
        if (!methods.has(name)) problems.push(`spec ${name} names no InMemoryDb method`);
    }
    for (const name of Object.keys(WRITE_ALLOWLIST)) {
        if (name in specs) problems.push(`${name} is allowlisted but has a spec`);
        else if (effective(name).size === 0)
            problems.push(`${name} is allowlisted but writes no map`);
    }
    assert.deepEqual(problems, []);
});

// ------------------------------------------------------------------ U6

async function bootStore(): Promise<any> {
    const { PGlite } = await import('@electric-sql/pglite');
    const pg = new PGlite();
    const files = readdirSync(MIGRATIONS_DIR)
        .filter((f) => f.endsWith('.sql') && !f.endsWith('.down.sql'))
        .sort((a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10));
    for (const f of files) await pg.exec(readFileSync(join(MIGRATIONS_DIR, f), 'utf8'));
    const client = {
        query: async (sql: string, params?: unknown[]) => ({
            rows: (await pg.query(sql, params ?? [])).rows,
        }),
        release: () => {},
    };
    const db: any = new PostgresBackedDb();
    await db.init({ connect: async () => client, end: async () => {} } as never);
    return db;
}

const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
const ahead = (ms: number) => new Date(Date.now() + ms).toISOString();

/** One representative call per targeted mutator, after seeding the rows it acts on. */
/**
 * One representative call per targeted mutator: each entry seeds the rows the
 * call acts on, then returns the call itself.
 */
const U6_CALLS: Record<string, (db: any) => () => void> = (() => {
    const id = () => randomUUID();
    const byId = (map: string, method: string) => (db: any) => {
        const k = id();
        db[map].set(k, { id: k });
        db[map].set(id(), { id: 'other' });
        return () => db[method](k);
    };
    const consume =
        (map: string, method: string, keyField = 'id') =>
        (db: any) => {
            const k = id();
            db[map].set(k, { [keyField]: k, userId: 'u', expiresAt: ahead(60_000) });
            return () => db[method](k);
        };
    const prune =
        (map: string, method: string, keyField = 'id') =>
        (db: any) => {
            for (const [k, exp] of [
                [id(), ago(60_000)],
                [id(), ahead(60_000)],
            ]) {
                db[map].set(k, { [keyField]: k, expiresAt: exp });
            }
            return () => db[method](new Date());
        };
    return {
        deleteUser: (db) => {
            const u = id();
            db.users.set(u, { id: u });
            db.vaultItems.set('v', { id: 'v', ownerUserId: u });
            return () => db.deleteUser(u);
        },
        consumePasswordResetToken: consume('passwordResetTokens', 'consumePasswordResetToken'),
        consumeEmailVerificationToken: consume(
            'emailVerificationTokens',
            'consumeEmailVerificationToken'
        ),
        consumeAccountDeletionToken: consume(
            'accountDeletionTokens',
            'consumeAccountDeletionToken'
        ),
        consumePendingOAuthLink: consume(
            'pendingOAuthLinks',
            'consumePendingOAuthLink',
            'stateHash'
        ),
        consumePendingOidcLogin: consume(
            'pendingOidcLogins',
            'consumePendingOidcLogin',
            'stateHash'
        ),
        deleteExpiredPasswordResetTokens: prune(
            'passwordResetTokens',
            'deleteExpiredPasswordResetTokens'
        ),
        deleteExpiredEmailVerificationTokens: prune(
            'emailVerificationTokens',
            'deleteExpiredEmailVerificationTokens'
        ),
        pruneExpiredRevokedSessions: prune('revokedSessions', 'pruneExpiredRevokedSessions', 'jti'),
        prunePendingOAuthLinks: prune('pendingOAuthLinks', 'prunePendingOAuthLinks', 'stateHash'),
        prunePendingOidcLogins: prune('pendingOidcLogins', 'prunePendingOidcLogins', 'stateHash'),
        markEmailVerificationTokenSent: consume(
            'emailVerificationTokens',
            'markEmailVerificationTokenSent'
        ),
        revokeEmailVerificationTokensForUser: (db) => {
            for (const consumedAt of [undefined, ago(1)]) {
                const k = id();
                db.emailVerificationTokens.set(k, { id: k, userId: 'u6', consumedAt });
            }
            return () => db.revokeEmailVerificationTokensForUser('u6', 'superseded');
        },
        deleteInvitationAdmissionsForUser: (db) => {
            for (const rec of [
                { claimedByUserId: 'u6' },
                { matrixUserId: '@u6:x' },
                { claimedByUserId: 'someone' },
            ]) {
                const k = id();
                db.invitationAdmissions.set(k, { id: k, ...rec });
            }
            return () => db.deleteInvitationAdmissionsForUser('u6', '@u6:x');
        },
        purgeUserAuthArtifacts: (db) => {
            for (const map of [
                'passwordResetTokens',
                'emailVerificationTokens',
                'accountDeletionTokens',
                'refreshTokens',
            ]) {
                db[map].set(`${map}-1`, { id: `${map}-1`, userId: 'u6' });
                db[map].set(`${map}-2`, { id: `${map}-2`, userId: 'other' });
            }
            db.linkedAccounts.set('u6:twitch', { blackoutUserId: 'u6', provider: 'twitch' });
            db.pendingOAuthLinks.set('s1', { stateHash: 's1', blackoutUserId: 'u6' });
            db.revokedSessions.set('j1', { jti: 'j1', userId: 'u6' });
            return () => db.purgeUserAuthArtifacts('u6');
        },
        revokeRefreshTokenFamily: (db) => {
            for (const [k, familyId, revokedAt] of [
                [id(), 'f6', undefined],
                [id(), 'f6', ago(1)],
                [id(), 'f7', undefined],
            ]) {
                db.refreshTokens.set(k, { id: k, familyId, userId: 'u', revokedAt });
            }
            return () => db.revokeRefreshTokenFamily('f6', 'reuse_detected');
        },
        revokeRefreshTokensForUser: (db) => {
            for (const userId of ['u6', 'u6', 'u7']) {
                const k = id();
                db.refreshTokens.set(k, { id: k, familyId: 'f', userId });
            }
            return () => db.revokeRefreshTokensForUser('u6', 'password_change');
        },
        acceptBountyApplication: (db) => {
            db.bounties.set('b6', { id: 'b6', status: 'open' });
            for (const [k, applicantId] of [
                ['a1', 'p1'],
                ['a2', 'p2'],
                ['a3', 'p3'],
            ]) {
                db.bountyApplications.set(k, {
                    id: k,
                    bountyId: 'b6',
                    applicantId,
                    status: 'pending',
                });
            }
            db.bountyApplications.set('a4', { id: 'a4', bountyId: 'b7', status: 'pending' });
            return () => db.acceptBountyApplication('b6', 'p2');
        },
        deleteLinkedAccount: (db) => {
            db.linkedAccounts.set('u6:twitch', { blackoutUserId: 'u6', provider: 'twitch' });
            db.linkedAccounts.set('u6:youtube', { blackoutUserId: 'u6', provider: 'youtube' });
            return () => db.deleteLinkedAccount('u6', 'twitch');
        },
        deleteTwitchChatBridge: byId('twitchChatBridges', 'deleteTwitchChatBridge'),
        deleteTwitchEventSubscription: (db) => {
            db.twitchEventSubscriptions.set('h6', { helixSubscriptionId: 'h6' });
            return () => db.deleteTwitchEventSubscription('h6');
        },
        deleteYoutubeChatBridge: byId('youtubeChatBridges', 'deleteYoutubeChatBridge'),
        deleteKickChatBridge: byId('kickChatBridges', 'deleteKickChatBridge'),
        deleteSimulcastDestination: byId('simulcastDestinations', 'deleteSimulcastDestination'),
        deleteDiscordCompatWebhook: byId('discordCompatWebhooks', 'deleteDiscordCompatWebhook'),
        deleteDiscordBridgeActivation: byId(
            'discordBridgeActivations',
            'deleteDiscordBridgeActivation'
        ),
        deleteOutboundEventWebhook: byId('outboundEventWebhooks', 'deleteOutboundEventWebhook'),
        deleteTwitchIrcBotToken: byId('twitchIrcBotTokens', 'deleteTwitchIrcBotToken'),
        deleteObsWsPassword: byId('obsWsPasswords', 'deleteObsWsPassword'),
        deleteTwitchExtensionPanel: byId('twitchExtensionPanels', 'deleteTwitchExtensionPanel'),
        deleteCreatorListing: byId('creatorListings', 'deleteCreatorListing'),
        deleteVaultItem: byId('vaultItems', 'deleteVaultItem'),
        deleteChannelPointsReward: byId('channelPointsRewards', 'deleteChannelPointsReward'),
        deleteClip: byId('clips', 'deleteClip'),
        deletePluginInstallation: byId('pluginInstallations', 'deletePluginInstallation'),
        deleteCoalitionExternalActivity: byId(
            'coalitionExternalActivity',
            'deleteCoalitionExternalActivity'
        ),
        deleteCoalitionSpatialItem: (db) => {
            db.coalitionSpatialItems.set('p6', { id: 'p6', updatedAt: ago(1) });
            return () => db.deleteCoalitionSpatialItem('p6');
        },
        deleteCoalitionExternalActivities: (db) => {
            for (const k of ['r1', 'r2', 'r3']) {
                db.coalitionExternalActivity.set(k, { id: k, updatedAt: ago(1) });
            }
            return () => db.deleteCoalitionExternalActivities(['r1', 'r3', 'not-held']);
        },
        removeCircleEdge: (db) => {
            db.circleEdges.set('f6::g6', { followerId: 'f6', followeeId: 'g6' });
            db.circleEdges.set('f6::h6', { followerId: 'f6', followeeId: 'h6' });
            return () => db.removeCircleEdge('f6', 'g6');
        },
        enqueueMeshEnvelope: (db) => {
            // At the cap, so the enqueue also evicts the oldest.
            for (let i = 0; i < 10_000; i++) db.meshEnvelopes.set(`m${i}`, { id: `m${i}` });
            return () => db.enqueueMeshEnvelope({ id: 'm-new', seenBy: [] });
        },
        replaceMeshEnvelopes: (db) => {
            const kept = { id: 'k1', seenBy: ['a'] };
            for (const e of [kept, { id: 'k2', seenBy: ['a'] }, { id: 'gone', seenBy: [] }]) {
                db.meshEnvelopes.set(e.id, e);
            }
            return () =>
                db.replaceMeshEnvelopes([
                    kept,
                    { id: 'k2', seenBy: ['a', 'b'] },
                    { id: 'new', seenBy: [] },
                ]);
        },
        upsertColiseumArguments: (db) => {
            const same = { id: 'c1', voteScore: 1 };
            db.coliseumArguments.set('c1', same);
            db.coliseumArguments.set('c2', { id: 'c2', voteScore: 1 });
            return () =>
                db.upsertColiseumArguments([
                    same,
                    { id: 'c2', voteScore: 2 },
                    { id: 'c3', voteScore: 0 },
                ]);
        },
    };
})();

test("U6: each targeted mutator's captured keys are exactly what a snapshot of every map shows it changed", async () => {
    const specs = MUTATOR_SPECS as Record<string, Spec>;
    const targeted = Object.keys(specs).filter((m) => specs[m].kind === 'targeted');
    assert.deepEqual(
        Object.keys(U6_CALLS).sort(),
        targeted.sort(),
        'one U6 call per targeted spec'
    );
    const db = await bootStore();
    const queued: Array<{ method: string; touched: Map<string, Map<string, unknown[]>> }> = [];
    // Capture what the wrapper would queue; nothing reaches Postgres.
    db.queue = {
        enqueueTargeted: (write: typeof queued[number]) => queued.push(write),
        enqueueUpsert: () => undefined,
        isFenced: () => false,
        fencedKeys: () => [],
        drain: async () => undefined,
    };
    try {
        for (const method of targeted) {
            for (const d of TABLE_DESCRIPTORS) db[d.mapName].clear();
            const call = U6_CALLS[method](db);
            const before = new Map(
                TABLE_DESCRIPTORS.map((d) => [d.mapName, new Map(db[d.mapName])])
            );
            queued.length = 0;
            call();
            const diff: string[] = [];
            for (const d of TABLE_DESCRIPTORS) {
                const was = before.get(d.mapName)!;
                const is: Map<string, unknown> = db[d.mapName];
                for (const k of new Set([...was.keys(), ...is.keys()])) {
                    if (was.get(k) !== is.get(k) || was.has(k) !== is.has(k))
                        diff.push(`${d.mapName}/${k}`);
                }
            }
            const captured = queued.flatMap((w) =>
                [...w.touched].flatMap(([m, keys]) => [...keys.keys()].map((k) => `${m}/${k}`))
            );
            assert.ok(diff.length > 0, `${method}: the U6 call changes something`);
            assert.deepEqual(captured.sort(), diff.sort(), `${method}: captured keys`);
        }
    } finally {
        await db.shutdown();
    }
});
