import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// BLACKOUT_DB_MODE=file persists by overriding each InMemoryDb mutator with a
// super-call plus persist(). A coalition mutator with no override writes the
// in-memory map and nothing else, so the record is gone on the next boot. This
// exercises every coalition-domain mutator once: mutate through the process
// singleton, re-open the same file as a second FileBackedDb (a simulated
// restart), and require the backing map to come back identical.
// (Runs in its own process; node --test isolates files, so this env is local.)
const tmpDir = mkdtempSync(join(tmpdir(), 'coalitions-file-persistence-'));
process.env.BLACKOUT_DB_MODE = 'file';
process.env.BLACKOUT_DB_FILE = join(tmpDir, 'store.json');
process.env.NODE_ENV = 'development';
delete process.env.BLACKOUT_DEMO_PASSWORD;

const { db, FileBackedDb } = await import('../src/db/store');

// InMemoryDb is not exported; FileBackedDb extends it, so its constructor is
// the prototype of FileBackedDb. Memory mode is what `new InMemoryDb()` gives.
const InMemoryDb = Object.getPrototypeOf(FileBackedDb) as new () => InstanceType<
    typeof FileBackedDb
>;

test.after(() => {
    rmSync(tmpDir, { recursive: true, force: true });
});

type Store = InstanceType<typeof FileBackedDb>;

type CoalitionMap =
    | 'coalitions'
    | 'coalitionMemberships'
    | 'coalitionJoinRequests'
    | 'coalitionConnections'
    | 'coalitionMemberConnections'
    | 'coalitionCampaigns'
    | 'coalitionCampaignPosts'
    | 'coalitionExternalActivity'
    | 'coalitionCampaignSyncOptIns'
    | 'coalitionSuccessionPetitions'
    | 'coalitionCampaignPayees'
    | 'coalitionCampaignAttribution'
    | 'coalitionCampaignEngagement'
    | 'coalitionCampaignContributions'
    | 'coalitionBoosts'
    | 'coalitionProjects'
    | 'coalitionProjectSupports'
    | 'coalitionSurges'
    | 'coalitionNotifications';

function rows(store: Store, map: CoalitionMap): unknown[] {
    return [...(store as unknown as Record<CoalitionMap, Map<string, unknown>>)[map].values()];
}

const COALITION = 'co-persist';
const USER = 'u-persist';
const CAMPAIGN = 'camp-persist';
const POST = 'post-persist';
const PROJECT = 'proj-persist';
const NOTIFICATION = 'notif-persist';

const cases: Array<{ method: string; map: CoalitionMap; mutate: (store: Store) => void }> = [
    {
        method: 'upsertCoalition',
        map: 'coalitions',
        mutate: (s) =>
            s.upsertCoalition({
                id: COALITION,
                slug: 'persist',
                name: 'Persist',
                mission: 'Survive a restart',
                joinMode: 'open',
                createdBy: USER,
            }),
    },
    {
        method: 'upsertCoalitionMembership',
        map: 'coalitionMemberships',
        mutate: (s) =>
            s.upsertCoalitionMembership({
                id: 'mem-persist',
                coalitionId: COALITION,
                userId: USER,
                role: 'founder',
                active: true,
            }),
    },
    {
        method: 'upsertCoalitionJoinRequest',
        map: 'coalitionJoinRequests',
        mutate: (s) =>
            s.upsertCoalitionJoinRequest({
                id: 'jr-persist',
                coalitionId: COALITION,
                userId: 'u-applicant',
                status: 'pending',
                message: 'let me in',
            }),
    },
    {
        method: 'upsertCoalitionConnection',
        map: 'coalitionConnections',
        mutate: (s) =>
            s.upsertCoalitionConnection({
                id: 'conn-persist',
                coalitionId: COALITION,
                platform: 'discord',
                authMode: 'shared',
                credentialRef: 'cred-ref-persist',
                displayHandle: '#announcements',
                createdBy: USER,
                active: true,
            }),
    },
    {
        method: 'upsertCoalitionMemberConnection',
        map: 'coalitionMemberConnections',
        mutate: (s) =>
            s.upsertCoalitionMemberConnection({
                id: 'mconn-persist',
                coalitionId: COALITION,
                userId: USER,
                platform: 'bluesky',
                credentialRef: 'mcred-ref-persist',
                displayHandle: 'persist.bsky.social',
            }),
    },
    {
        method: 'upsertCoalitionCampaign',
        map: 'coalitionCampaigns',
        mutate: (s) =>
            s.upsertCoalitionCampaign({
                id: CAMPAIGN,
                coalitionId: COALITION,
                type: 'drive',
                title: 'Drive',
                description: 'A drive that survives a restart',
                goalCents: 10_000,
                raisedCents: 0,
                contributorCount: 0,
                status: 'active',
                requiresStewardApproval: false,
                createdBy: USER,
            }),
    },
    {
        method: 'upsertCoalitionCampaignPost',
        map: 'coalitionCampaignPosts',
        mutate: (s) =>
            s.upsertCoalitionCampaignPost({
                id: POST,
                campaignId: CAMPAIGN,
                coalitionId: COALITION,
                platform: 'bluesky',
                direction: 'out',
                syncStatus: 'posted',
                externalPostId: 'ext-post-1',
                authorUserId: USER,
            }),
    },
    {
        method: 'upsertCoalitionExternalActivity',
        map: 'coalitionExternalActivity',
        mutate: (s) =>
            s.upsertCoalitionExternalActivity({
                id: 'ext-persist',
                campaignPostId: POST,
                campaignId: CAMPAIGN,
                coalitionId: COALITION,
                sourcePlatform: 'bluesky',
                externalAuthor: 'someone.bsky.social',
                externalId: 'ext-reply-1',
                content: 'a reply from outside',
                moderationStatus: 'pending',
                receivedAt: '2026-09-21T10:00:00Z',
            }),
    },
    {
        method: 'upsertCoalitionCampaignSyncOptIn',
        map: 'coalitionCampaignSyncOptIns',
        mutate: (s) =>
            s.upsertCoalitionCampaignSyncOptIn({
                id: 'optin-persist',
                campaignId: CAMPAIGN,
                coalitionId: COALITION,
                userId: USER,
                platform: 'bluesky',
                enabled: true,
            }),
    },
    {
        method: 'upsertCoalitionSuccessionPetition',
        map: 'coalitionSuccessionPetitions',
        mutate: (s) =>
            s.upsertCoalitionSuccessionPetition({
                id: 'pet-persist',
                coalitionId: COALITION,
                candidateUserId: 'u-steward',
                openedBy: 'u-steward',
                reason: 'the founder has gone',
                secondedBy: [],
                status: 'open',
            }),
    },
    {
        method: 'upsertCoalitionCampaignPayee',
        map: 'coalitionCampaignPayees',
        mutate: (s) =>
            s.upsertCoalitionCampaignPayee({
                id: 'payee-persist',
                campaignId: CAMPAIGN,
                coalitionId: COALITION,
                userId: USER,
                shareBps: 10_000,
                role: 'organiser',
                active: true,
            }),
    },
    {
        method: 'upsertCampaignAttribution',
        map: 'coalitionCampaignAttribution',
        mutate: (s) =>
            s.upsertCampaignAttribution({
                campaignId: CAMPAIGN,
                coalitionId: COALITION,
                channel: 'bluesky',
                sharerUserId: USER,
                visits: 3,
                signups: 1,
                joins: 0,
                contributions: 0,
            }),
    },
    {
        method: 'upsertCampaignEngagement',
        map: 'coalitionCampaignEngagement',
        mutate: (s) =>
            s.upsertCampaignEngagement({
                id: POST,
                campaignPostId: POST,
                campaignId: CAMPAIGN,
                coalitionId: COALITION,
                platform: 'bluesky',
                likes: 5,
                reshares: 2,
                replies: 1,
                clicks: 0,
                lastReadAt: '2026-09-21T11:00:00Z',
            }),
    },
    {
        method: 'upsertCoalitionCampaignContribution',
        map: 'coalitionCampaignContributions',
        mutate: (s) =>
            s.upsertCoalitionCampaignContribution({
                id: 'contrib-persist',
                campaignId: CAMPAIGN,
                coalitionId: COALITION,
                supporterUserId: 'u-supporter',
                tipId: 'tip-persist',
                amountCents: 500,
                currency: 'USD',
            }),
    },
    {
        method: 'upsertCoalitionBoost',
        map: 'coalitionBoosts',
        mutate: (s) =>
            s.upsertCoalitionBoost({
                id: 'boost-persist',
                campaignId: CAMPAIGN,
                coalitionId: COALITION,
                userId: USER,
                day: '2026-09-21',
            }),
    },
    {
        method: 'updateCoalitionProject',
        map: 'coalitionProjects',
        mutate: (s) => {
            // createCoalitionProject already persists; the patch is what is under test.
            s.createCoalitionProject({
                id: PROJECT,
                canopyId: COALITION,
                title: 'Project',
                category: 'other',
                leadId: USER,
                raisedCents: 0,
                supporterCount: 0,
                milestones: [],
            });
            const updated = s.updateCoalitionProject(PROJECT, {
                title: 'Project (renamed)',
                fundingGoalCents: 20_000,
            });
            assert.equal(updated?.title, 'Project (renamed)');
        },
    },
    {
        method: 'addCoalitionProjectSupport',
        map: 'coalitionProjectSupports',
        mutate: (s) =>
            s.addCoalitionProjectSupport({
                id: 'support-persist',
                projectId: PROJECT,
                supporterUserId: 'u-supporter',
                tipId: 'tip-project-persist',
                amountCents: 1_000,
                currency: 'USD',
            }),
    },
    {
        method: 'applyCoalitionProjectSupport',
        map: 'coalitionProjects',
        mutate: (s) => {
            const updated = s.applyCoalitionProjectSupport(PROJECT, 1_000, [
                {
                    id: 'm1',
                    label: 'First',
                    thresholdCents: 500,
                    reachedAt: '2026-09-21T12:00:00Z',
                },
            ]);
            assert.equal(updated?.raisedCents, 1_000);
        },
    },
    {
        method: 'upsertCoalitionSurge',
        map: 'coalitionSurges',
        mutate: (s) =>
            s.upsertCoalitionSurge({
                id: 'surge-persist',
                projectId: PROJECT,
                status: 'open',
                surgeFactor: 2.5,
                supportsLast24h: 5,
                supportsPrev24h: 2,
                notifiedCount: 0,
                startedAt: '2026-09-21T12:00:00Z',
                expiresAt: '2026-09-23T12:00:00Z',
            }),
    },
    {
        method: 'addCoalitionNotification',
        map: 'coalitionNotifications',
        mutate: (s) =>
            s.addCoalitionNotification({
                id: NOTIFICATION,
                recipientUserId: USER,
                kind: 'surge',
                projectId: PROJECT,
                surgeId: 'surge-persist',
                title: 'Support is surging',
            }),
    },
    {
        method: 'markCoalitionNotificationRead',
        map: 'coalitionNotifications',
        mutate: (s) => {
            const read = s.markCoalitionNotificationRead(NOTIFICATION, USER);
            assert.ok(read?.readAt, 'the notification is marked read in memory');
        },
    },
];

test('every coalition mutator survives a file-mode restart', () => {
    for (const { method, map, mutate } of cases) {
        const before = JSON.stringify(rows(db, map));
        mutate(db);
        const expected = rows(db, map);
        assert.notEqual(JSON.stringify(expected), before, `${method} changed ${map} in memory`);

        // Simulate a process restart: a fresh instance hydrates from the same file.
        const reloaded = new FileBackedDb();
        assert.deepEqual(rows(reloaded, map), expected, `${method} persisted ${map} to disk`);
    }
});

test('a fresh in-memory store is unaffected by what file mode persisted', () => {
    const memory = new InMemoryDb();
    for (const map of new Set(cases.map((c) => c.map))) {
        assert.deepEqual(rows(memory, map), [], `${map} starts empty in memory mode`);
    }
});
