import {
    existsSync,
    mkdirSync,
    readFileSync,
    readdirSync,
    renameSync,
    rmSync,
    writeFileSync,
} from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { hashPassword } from '../services/auth';
import { ownerAttemptRefusedSinceCheckIn } from '../services/deadmanScheduler';
import type {
    CanaryTokenRecord,
    CircleEdgeRecord,
    CommunityAssetRecord,
    CommunityAssetReportRecord,
    MemberProfileRecord,
    ProfileWallPostRecord,
    RelayEdgeRecord,
    DenGreetingRecord,
    CanopyDirectoryEntryRecord,
    CanopySubscriptionRecord,
    CanopyVoiceRoomRecord,
    ProcessedBillingWebhookEventRecord,
    SubscriptionAuditEventRecord,
    SubscriptionGiftRecord,
    FederationLinkRecord,
    MarketplaceEntitlementRecord,
    MarketplaceLicenseKeyRecord,
    MarketplaceListingsCacheRecord,
    MarketplaceProviderIdString,
    MarketplaceWebhookAuditRecord,
    MessageRecord,
    ScheduledMessageRecord,
    ModerationActionRecord,
    ChannelRecord,
    DeadDropRecord,
    DeadmanReleaseNoticeRecord,
    DeadmanReleaseWrapRecord,
    DeadmanSwitchRecord,
    DeadmanSwitchStatus,
    ReleaseIdentityRecord,
    ForumPostRecord,
    UserRecord,
    VoiceRoomEventRecord,
    VoiceRoomParticipantRecord,
    VoiceRoomSanctionKind,
    VoiceRoomSanctionRecord,
    VoteEntryRecord,
    VoteRecord,
    CreatorStreamAuthRecord,
    StreamRecord,
    StreamSessionRecord,
    StreamModerationRecord,
    ClipRecord,
    TipRecord,
    ReferralRecord,
    AmbassadorRecord,
    QuestDefinitionRecord,
    QuestCompletionRecord,
    MigrationCreditRecord,
    BountyRewardRecord,
    CreatorSubscriptionTierRecord,
    CreatorSubscriptionRecord,
    CommunityBoostPledgeRecord,
    AidPoolRecord,
    AdRevenuePeriodRecord,
    AdRevenueShareRecord,
    PasswordResetTokenRecord,
    EmailVerificationTokenRecord,
    AccountDeletionTokenRecord,
    InvitationTokenRecord,
    InvitationRedemptionRecord,
    InvitationAdmissionRecord,
    BurnerIdentityRecord,
    RefreshTokenRecord,
    RevokedSessionRecord,
    LinkedAccountRecord,
    LinkedAccountProvider,
    PendingOAuthLinkRecord,
    PendingOidcLoginRecord,
    TwitchChatBridgeRecord,
    TwitchEventSubscriptionRecord,
    WidgetAlertTokenRecord,
    YoutubeChatBridgeRecord,
    KickChatBridgeRecord,
    DiscordCompatWebhookRecord,
    DiscordServerImportRecord,
    DiscordImportMappingRecord,
    DiscordBridgeActivationRecord,
    OutboundEventWebhookRecord,
    TwitchIrcBotTokenRecord,
    TwitchExtensionPanelRecord,
    CreatorListingRecord,
    VaultItemRecord,
    ChannelPointsRewardRecord,
    ChannelPointsLedgerRecord,
    ObsWsPasswordRecord,
    SimulcastDestinationRecord,
    CoalitionSpatialItemRecord,
    CoalitionAidPostRecord,
    CoalitionEventRecord,
    EventRsvpRecord,
    VolunteerSlotRecord,
    VolunteerSignupRecord,
    RideOfferRecord,
    RideClaimRecord,
    CoalitionRingRecord,
    RingMembershipRecord,
    RingInvitationRecord,
    CoalitionRecord,
    CoalitionMembershipRecord,
    CoalitionJoinRequestRecord,
    CoalitionConnectionRecord,
    CoalitionMemberConnectionRecord,
    CoalitionCampaignRecord,
    CoalitionCampaignPostRecord,
    CoalitionExternalActivityRecord,
    CoalitionCampaignSyncOptInRecord,
    CoalitionBoostRecord,
    CampaignAttributionRecord,
    CampaignEngagementRecord,
    CoalitionCampaignContributionRecord,
    CoalitionCampaignPayeeRecord,
    CoalitionSuccessionPetitionRecord,
    CoalitionKitApplicationRecord,
    CoalitionTaskRecord,
    CoalitionNeedRecord,
    CoalitionProjectRecord,
    CoalitionProjectSupportRecord,
    CoalitionSurgeRecord,
    CoalitionNotificationRecord,
    CoalitionResourceRecord,
    CreatorContentRecord,
    ContentDistributionRecord,
    ProductReviewRecord,
    ProductVersionRecord,
    BountyRecord,
    BountyApplicationRecord,
    SellerLocationRecord,
    SellerProfileRecord,
    CoalitionFeedItemRecord,
    CoalitionFeedLikeRecord,
    CoalitionFeedCommentRecord,
    PluginInstallationRecord,
    PluginDenRecord,
    CoalitionKitManifestApplicationRecord,
    PluginReviewRecord,
    PluginForkRecord,
    PluginShowcaseRecord,
    ColiseumTopicRecord,
    ColiseumChallengeRecord,
    ChallengeEntryRecord,
    ChallengeVoteRecord,
    ColiseumArgumentRecord,
    ColiseumVoteRecord,
    ColiseumLiveSessionRecord,
    ColiseumMatchRecord,
    ColiseumRoundRecord,
    ColiseumRoundVoteRecord,
    ColiseumShoutRecord,
    ColiseumResponseDropRecord,
    ColiseumResponseDropVoteRecord,
    ColiseumBriefRecord,
    ColiseumExplainerRecord,
    ColiseumExplainerVoteRecord,
    ColiseumCrucibleStatementRecord,
    ColiseumCrucibleVoteRecord,
    ReputationEventRecord,
    FbmVendorRoomRecord,
    FbmBuyerOrderRoomRecord,
    FbmDeaddropDeliveryRecord,
    FbmDisputeRoomRecord,
    FbmAclStateRecord,
} from './types';
import type { MeshEnvelope } from '@blackout/protocol';
import {
    COALITION_SPATIAL_SEED,
    COALITION_AID_SEED,
    COALITION_TASK_SEED,
    COALITION_SELLER_SEED,
    COALITION_FEED_SEED,
    shouldSeedCoalitionDemoData,
} from './coalitionSeed';
import {
    bindStep,
    buildUpsertSql,
    compileStep,
    deserializeValue,
    hydrateMap,
    introspectColumns,
    keyOfTuple,
    kvOf,
    prepareCheck,
    recordToRow,
    rowToRecord,
    selectByKeys,
    snakeToCamel,
    sqlTypeOf,
    upsertRecord,
    type BoundStatement,
    type CompiledStep,
    type StepContext,
    type TablePlan,
} from './pgWriter';
import { MUTATOR_SPECS, TABLE_DESCRIPTORS, type MutatorSpec } from './pgDescriptors';
import { WriteBehindQueue, type KeySet } from './writeBehindQueue';
import { PgNotifyTransport, type StoreChangePayload, type StoreChangeTransport } from './pgNotify';
import type { PgClient, PgPool } from './migrate';
import { withPooledClient } from './pooledClient';
import { log } from '../telemetry/logger';
import { dbWriteBehindFailuresTotal } from '../telemetry/metrics';
import { randomUUID } from 'node:crypto';

const nowIso = () => new Date().toISOString();

/**
 * Whether a switch is still as the sweep read it: the same status and the
 * same last check-in (`advanceDeadmanSwitch`). A fired switch's status is
 * `triggered`, which the sweep never moves from.
 */
const switchStillAsRead = (
    current: DeadmanSwitchRecord,
    read: Pick<DeadmanSwitchRecord, 'status' | 'lastCheckInAt'>
): boolean => current.status === read.status && current.lastCheckInAt === read.lastCheckInAt;

/**
 * Whether the switch as given is still as a refused attempt read it: it has
 * not fired or been cancelled, and its last check-in is the one the attempt
 * read. What the statement the attempt was refused for is conditional on
 * (`writeDeadmanSwitchIf`), so a mirror that shows the switch otherwise
 * proves that statement cannot have applied unseen.
 */
const stillAsAttemptRead = (
    current: Record<string, unknown> | undefined,
    note: { lastCheckInAt: string }
): current is Record<string, unknown> =>
    current !== undefined &&
    current.status !== 'triggered' &&
    current.status !== 'cancelled' &&
    current.lastCheckInAt === note.lastCheckInAt;

/**
 * Whether the carry of a refused attempt (`carryRefusedOwnerWrites`) would
 * apply to the switch as given, by the statement's own conditions: it is
 * still as the refused attempt read it (`stillAsAttemptRead`), and it holds
 * no later attempt. What a landed carry's column is taken onto
 * (`takeCarriedColumn`); whether a refused carry is followed by a read of
 * the switch is decided on `stillAsAttemptRead` alone (`takeCarryAnswer`).
 */
const carryWouldApplyTo = (
    current: Record<string, unknown> | undefined,
    note: { at: string; lastCheckInAt: string }
): boolean => {
    if (!stillAsAttemptRead(current, note)) return false;
    const held = current.ownerAttemptRefusedAt;
    return !(typeof held === 'string' && held > note.at);
};

/**
 * One switch's row in Postgres and, with `withCopies`, its copy rows, on the
 * connection given; `undefined` where Postgres has no such switch. What an
 * arm reads before and after its insert, and what a statement that answered
 * late or failed is settled from (`PostgresBackedDb`).
 */
const readSwitchAndCopies = async (
    client: PgClient,
    plan: TablePlan,
    wrapPlan: TablePlan,
    id: string,
    withCopies: boolean
): Promise<
    { row: Record<string, unknown>; copies: Array<Record<string, unknown>> } | undefined
> => {
    const row = (
        await client.query<Record<string, unknown>>(
            `SELECT * FROM ${plan.descriptor.tableName} WHERE id = $1`,
            [id]
        )
    ).rows[0];
    if (!row) return undefined;
    const copies = withCopies
        ? (
              await client.query<Record<string, unknown>>(
                  `SELECT * FROM ${wrapPlan.descriptor.tableName} WHERE switch_id = $1`,
                  [id]
              )
          ).rows
        : [];
    return { row, copies };
};

/** How a conditional write of a switch ended (`updateDeadmanSwitchIf`). */
export type DeadmanSwitchWriteOutcome =
    | { kind: 'applied'; record: DeadmanSwitchRecord }
    | { kind: 'refused'; current: DeadmanSwitchRecord | undefined }
    | { kind: 'unanswered' };

/**
 * How arming a release switch ended (`armDeadmanSwitch`): `armed` once the
 * store holds the switch and its copies; `id_taken` where a switch with the
 * id exists (the Postgres store takes that switch and its copies into the
 * mirror when the mirror lacked them, so the owner's list shows it);
 * `unanswered` where the database did not answer in time (the Postgres store
 * only: a statement that was sent may still land, and the mirror then takes
 * it when it does; one refused at once because another switch statement
 * already stands unanswered was not sent, and cannot land), or where a
 * statement failed and the switch could not be read afterwards either;
 * `failed` where the statement failed with its outcome unknown (a lost
 * connection) and the switch was then read and found absent (nothing is in
 * the mirror, and, the switch and its copies being one statement, Postgres
 * holds neither unless that statement is still running and commits later);
 * `refused` where the database answered the statement itself with an error
 * (`sqlstateOfStatementRefusal`): it did not apply, so Postgres holds neither
 * the switch nor a copy of it, nothing was read back and no other switch
 * statement was held back.
 */
export type DeadmanSwitchArmOutcome =
    | { kind: 'armed'; record: DeadmanSwitchRecord }
    | { kind: 'id_taken' }
    | { kind: 'unanswered' }
    | { kind: 'failed' }
    | { kind: 'refused' };

/**
 * How the owner's deletion erased one switch (`eraseDeadmanSwitchUnlessFired`):
 * `applied` with the switch as the store now holds it (cancelled and emptied,
 * its copies blanked, where it had not fired; fired with its label gone where
 * it had); `absent` where the store has no such switch; `queued` (the
 * Postgres store only) where the database did not answer the statement in
 * time, was not sent it because another switch statement stood unanswered,
 * or failed it: the same call is then queued in the switch's lane and
 * decides on the row Postgres holds when it runs, and nothing of the mirror's
 * view of the switch is written over it (found when round 12 of part 2's
 * review was checked: the deletion wrote the mirror's erase whole in that
 * case, which landed after the statement and cancelled a release that had
 * fired elsewhere); meanwhile the mirror keeps the switch as it had it,
 * marked (`deadmanSwitchErasePending`, round 13).
 */
export type DeadmanSwitchEraseOutcome =
    | { kind: 'applied'; record: DeadmanSwitchRecord }
    | { kind: 'absent' }
    | { kind: 'queued' };

/**
 * A switch as the owner's deletion leaves it, judged on the record given:
 * the label and the owner's refused attempt (decision 31) gone, and, where it
 * has not fired, cancelled with its content and any backlog window gone. A
 * switch that has fired keeps its status and content for the people it named
 * (`eraseDeadmanSwitch`).
 */
const erasedSwitchRecord = (record: DeadmanSwitchRecord): DeadmanSwitchRecord => ({
    ...record,
    headline: undefined,
    ownerAttemptRefusedAt: undefined,
    ...(record.status === 'triggered'
        ? {}
        : {
              status: 'cancelled' as const,
              encryptedPayload: '',
              backlogGraceStartedAt: undefined,
          }),
    updatedAt: nowIso(),
});

/**
 * The owner's deletion of one switch on the connection given, decided on the
 * row Postgres holds: the label and the owner's refused attempt (decision 31)
 * go, and by a `CASE` on the stored status a
 * switch that has not fired is cancelled with its content and backlog window
 * gone, while one that has keeps its status, content and `releasedAt`; then,
 * in a second statement and only where the row as updated has not fired,
 * every held copy of the switch is blanked. The statements run on one
 * connection and not in a transaction, so a failure between them leaves the
 * switch cancelled with its copies held, which running this again (the
 * queued call) or the deletion's last statement blanks. Where Postgres has no row for the switch
 * (this process's own write of it was dropped before round 11 of part 2's
 * review), `restore`, the mirror's erase, is inserted (insert-only, so a row
 * another process wrote meanwhile is kept) and the update run again on what
 * is there. Idempotent, so running it again after an unknown outcome is safe.
 * `undefined` only where no row exists even then.
 */
const eraseSwitchUnlessFiredOn = async (
    client: PgClient,
    plan: TablePlan,
    wrapPlan: TablePlan,
    id: string,
    restore: DeadmanSwitchRecord
): Promise<
    | { row: Record<string, unknown>; copies: Array<Record<string, unknown>>; restored: boolean }
    | undefined
> => {
    const updatedAt = nowIso();
    const erase = async () =>
        (
            await client.query<Record<string, unknown>>(
                `UPDATE ${plan.descriptor.tableName} SET headline = NULL, owner_attempt_refused_at = NULL, ` +
                    'updated_at = $2::timestamptz, ' +
                    "status = CASE WHEN status = 'triggered' THEN status ELSE 'cancelled' END, " +
                    "encrypted_payload = CASE WHEN status = 'triggered' THEN encrypted_payload ELSE '' END, " +
                    "backlog_grace_started_at = CASE WHEN status = 'triggered' THEN backlog_grace_started_at ELSE NULL END " +
                    'WHERE id = $1 RETURNING *',
                [id, updatedAt]
            )
        ).rows[0];
    let row = await erase();
    let restored = false;
    if (!row) {
        await upsertRecord(
            client,
            plan,
            restore as unknown as Record<string, unknown>,
            undefined,
            true
        );
        restored = true;
        row = await erase();
        if (!row) return undefined;
    }
    const copies =
        row.status === 'triggered'
            ? []
            : (
                  await client.query<Record<string, unknown>>(
                      `UPDATE ${wrapPlan.descriptor.tableName} SET sealed_key = '', signature = '', ` +
                          'updated_at = $2::timestamptz ' +
                          "WHERE switch_id = $1 AND (sealed_key <> '' OR signature <> '') RETURNING *",
                      [id, updatedAt]
                  )
              ).rows;
    return { row, copies, restored };
};

/**
 * What a switch's read back in its lane found (`settleSwitchStatement`): the
 * switch and, where asked, its copies as Postgres holds them; `undefined`
 * where Postgres has no such switch; `'unread'` where the read failed (the
 * switch is then read again on a connection of its own until a read
 * answers, `retrySettleReads`) or had not answered when its caller stopped
 * waiting (that one read is waited for, and nothing bounds it).
 */
type SwitchReadBack =
    | { row: Record<string, unknown>; copies: Array<Record<string, unknown>> }
    | undefined
    | 'unread';

/**
 * How waiting for one switch statement ended
 * (`PostgresBackedDb.awaitSwitchStatement`). `failed`: the statement
 * rejected within its bound, an unknown outcome, and `readBack` is what
 * reading the switch back within what was left of the bound found.
 */
type SwitchStatementWait<T> =
    | { kind: 'answered'; answer: T }
    | { kind: 'failed'; readBack: SwitchReadBack }
    | { kind: 'timeout' };

/**
 * The settle of a statement that answered late or failed
 * (`settleSwitchStatement`): the switch, the mirror's entry for it when the
 * settle began, whether its copies are read too (the arm), the switch's
 * entry in `carriesBehindSettle`, what it follows (a late answer, a failed
 * statement, or a carry Postgres refused over a row this mirror still held as
 * the refused attempt read it: what its take is logged as), and, once its
 * read back has failed and it waits to be read again (`retrySettleReads`),
 * what ends it.
 */
type PendingSettle = {
    id: string;
    seen: Record<string, unknown> | undefined;
    withCopies: boolean;
    reading: { reading: number; notes: Array<{ at: string; lastCheckInAt: string }> };
    after: 'answer' | 'failure' | 'refused carry';
    done?: () => void;
};

/**
 * Whether a switch statement that answered after its bound wrote nothing a
 * settle could read back: it was not run at all (its caller had stopped
 * waiting before its turn came, so it sent nothing), or the database refused
 * the statement itself (`answeredOrRefused`: it did not apply). Every other
 * late answer is read back, an arm's that found the id taken included: the
 * switch it found is one this mirror lacked when the arm was sent, and the
 * arm's caller, answered at the bound, took nothing of it (round 20 of part
 * 2's review: such an answer was dropped, so the switch stayed out of this
 * mirror, its owner's list and the bounds).
 */
const wasNotRun = (landed: unknown): boolean =>
    !landed || typeof landed !== 'object' || 'skipped' in landed || 'refused' in landed;

/**
 * The SQLSTATE in a switch statement's answer where the database refused
 * the statement (`answeredOrRefused`), otherwise `undefined`.
 */
const refusalIn = (answer: unknown): string | undefined => {
    if (!answer || typeof answer !== 'object' || !('refused' in answer)) return undefined;
    const { refused } = answer as { refused: unknown };
    return typeof refused === 'string' ? refused : undefined;
};

/**
 * The SQLSTATE classes of an error the database raises about a statement
 * itself: its data (22, data exception: a U+0000 in a text value is 22021),
 * the table's constraints (23, integrity constraint violation) or the schema
 * and its rules (42, syntax error or access rule violation). PostgreSQL
 * raises these while the statement is parsed, planned or run, or, for a
 * deferred constraint, before its commit, never after it, so a single
 * statement answered with one did not apply.
 */
const STATEMENT_REFUSAL_CLASSES: ReadonlySet<string> = new Set(['22', '23', '42']);

/**
 * The SQLSTATE of an error with which the database refused a statement
 * itself, or `undefined` where the rejection leaves the statement's outcome
 * unknown (round 21 of part 2's review: every rejection was taken for an
 * unknown outcome, read back with every switch statement of the process held
 * meanwhile, so a statement the database refused each time, which any
 * account could send, a label holding U+0000, held the other owners'
 * check-ins back for the length of a read each time it was sent).
 *
 * Refused means: the error is the server's own answer to the statement
 * (node-postgres and PGlite give it the server's five-character `code` and
 * its `severity`, `ERROR`; an error that ends the session is `FATAL`) and
 * its class is one of `STATEMENT_REFUSAL_CLASSES`. Everything else is
 * unknown, on purpose (each shape below is what node-postgres 8.20 gave
 * against PostgreSQL 16; round 21 of part 2's review in the record has the
 * run): a lost
 * connection (a plain `Error`, "Connection terminated unexpectedly", or the
 * socket's own, whose `code` is an errno name, with no `severity`; the
 * server ran the statement on and committed it); an administrator's
 * shutdown or `pg_terminate_backend` (57P01, `FATAL`); a statement timeout
 * or a query cancel (57014, `ERROR`: PostgreSQL had rolled the statement
 * back, but the class is an intervention from outside the statement, and is
 * kept unknown); a lock timeout (55P03); a write in a read-only transaction
 * (25006); and, by their class alone and not run here, a serialization
 * failure or deadlock (class 40, where 40003 is "statement completion
 * unknown"), resources (53), system and internal errors (58, XX) and every
 * connection exception (08). An error raised at commit by a deferred
 * constraint carries the constraint's own code (23505 in the probe) and
 * left nothing. A server whose messages are localized sends a localized
 * `severity` (node-postgres passes the localized field on); its refusals
 * are then taken for unknown, which costs a read and is never wrong. What a
 * connection pooler in front of the database answers of its own was not
 * checked: none is in this repository's deployments, and one that answered
 * `ERROR` in one of the three classes for a statement the database went on
 * to apply would be taken for a refusal.
 */
export const sqlstateOfStatementRefusal = (error: unknown): string | undefined => {
    if (typeof error !== 'object' || error === null) return undefined;
    const { code, severity } = error as { code?: unknown; severity?: unknown };
    if (severity !== 'ERROR' || typeof code !== 'string' || !/^[0-9A-Z]{5}$/.test(code)) {
        return undefined;
    }
    return STATEMENT_REFUSAL_CLASSES.has(code.slice(0, 2)) ? code : undefined;
};

/**
 * `run`'s answer, or `{ refused: sqlstate }` where the database refused the
 * statement itself (`sqlstateOfStatementRefusal`): the statement did not
 * apply, so its caller is answered as by any answer, with no switch
 * statement held back and nothing read back. Any other rejection is thrown
 * on: an unknown outcome. For one statement at a time, each of which either
 * applies whole or not at all.
 */
const answeredOrRefused = async <T>(run: () => Promise<T>): Promise<T | { refused: string }> => {
    try {
        return await run();
    } catch (error) {
        const sqlstate = sqlstateOfStatementRefusal(error);
        if (sqlstate === undefined) throw error;
        return { refused: sqlstate };
    }
};

/**
 * Arming as one statement: the switch insert-only, and its copies written
 * only where that insert returned the row (a data-modifying `WITH`, whose
 * parts run on one snapshot and pass rows to each other only through
 * `RETURNING`). One statement applies whole or not at all, so Postgres never
 * holds a switch without its copies, nor copies without their switch: where
 * the id is taken, nothing is written and the rows of the switch that has it
 * are left exactly as they were; where the database refuses the statement or
 * the process stops, nothing is left (round 21 of part 2's review: the
 * copies were written first, one statement each, and the switch last, so an
 * arm whose switch insert the database refused, which a label holding U+0000
 * was every time, left its copy rows behind for good, counted by no bound).
 * A copy row of the same key is written over: one an arm left without a
 * switch before this was one statement (no switch has the id, or the insert
 * would have returned nothing). The copies are written only after the
 * switch's insert has been tried: the test for a row of `armed` is evaluated
 * once, before the first copy's row is produced, and an insert that meets
 * another transaction's uncommitted switch of the same id waits there for
 * it to commit or roll back (run on PostgreSQL 16 with two connections:
 * after the other's commit the waiting arm returned no row and wrote
 * nothing; after its rollback it armed).
 *
 * The parameters are the switch's `columns` and then each copy's
 * `wrapColumns` in turn; a copy's are cast to their column's type, since a
 * `VALUES` list on its own gives a parameter no type.
 */
const buildArmSql = (
    plan: TablePlan,
    columns: string[],
    wrapPlan: TablePlan,
    wrapColumns: string[],
    copies: number
): string => {
    const cast = (column: string): string => {
        const meta = wrapPlan.columns.find((c) => c.name === column);
        return meta ? `::${sqlTypeOf(meta)}` : '';
    };
    const rows: string[] = [];
    let parameter = columns.length;
    for (let i = 0; i < copies; i += 1) {
        rows.push(
            `(${wrapColumns
                .map((column) => {
                    parameter += 1;
                    return `$${parameter}${cast(column)}`;
                })
                .join(', ')})`
        );
    }
    const conflict = wrapPlan.descriptor.conflictColumns;
    const updates = wrapColumns
        .filter((column) => !conflict.includes(column))
        .map((column) => `${column} = EXCLUDED.${column}`);
    return (
        `WITH armed AS (${buildUpsertSql(plan, columns, [], true)} RETURNING *), ` +
        `copies AS (INSERT INTO ${wrapPlan.descriptor.tableName} (${wrapColumns.join(', ')}) ` +
        `SELECT v.* FROM (VALUES ${rows.join(', ')}) AS v (${wrapColumns.join(', ')}) ` +
        'WHERE EXISTS (SELECT 1 FROM armed) ' +
        `ON CONFLICT (${conflict.join(', ')}) DO UPDATE SET ${updates.join(', ')} RETURNING 1) ` +
        'SELECT * FROM armed'
    );
};

/** Coalition demo seed rows, or none when demo seeding is off (default in production). */
const demoSeedRows = <T>(rows: T[]): T[] => (shouldSeedCoalitionDemoData() ? rows : []);

/** Cap for the durable mesh-relay store-and-forward queue (M17; relocated from
 *  services/meshRelay.ts). Newest-wins: the oldest envelope is evicted past this. */
const MESH_MAX_STORE = 10_000;
const DB_MODE = process.env.BLACKOUT_DB_MODE ?? 'file';
const DB_FILE_PATH = resolve(
    process.cwd(),
    process.env.BLACKOUT_DB_FILE ?? '.blackout/data/store.json'
);

// How long a per-user access-token revocation cutoff must persist: at least the
// longest access-token lifetime (default 24h) plus a buffer, so no token issued
// before the cutoff can still be valid once the cutoff record is pruned.
const USER_TOKEN_CUTOFF_TTL_MS = 25 * 60 * 60 * 1000;

/** The key of a release switch's per-recipient rows (copies, notices); ids hold no ':'. */
const releaseRowKey = (switchId: string, recipientAccountId: string): string =>
    `${switchId}:${recipientAccountId}`;

/**
 * A map whose rows are also indexed under further keys, one index per
 * grouping, kept in step by every `set`, `delete` and `clear`, so that
 * listing the rows of one group costs the size of that group and not of the
 * map. The release switches' copies and notices are grouped by switch and by
 * recipient account: the sweep's 365-day removal and the notifier's catch-up
 * list them by switch for every fired release switch on every tick, for ever,
 * and the arming bounds, the release read, the notifier's room lookup and
 * account deletion list them by recipient; a scan of the whole map each time
 * grew quadratic (independent review of PR 3 part 2, P3b-M4; the by-recipient
 * index after its round 2). The Postgres store fills maps through `set`
 * (`hydrateMap`, a refresh of a row by key) and removes a row through
 * `delete`; a table reload updates a map of this kind in place through the
 * same two (`reloadTable`), so every index stays current wherever the map is
 * written.
 *
 * A row re-`set` under its key keeps its place in each group it was in, as
 * `Map.set` keeps the key's place; it moves only if a grouping of it changed.
 * Entries are added after `super()` returns: `Map`'s constructor would call
 * the overridden `set` before the fields it needs exist.
 */
export class GroupedMap<V, G extends string = string> extends Map<string, V> {
    private readonly groups = new Map<G, Map<string, Set<string>>>();

    constructor(
        private readonly groupers: Record<G, (value: V) => string>,
        entries?: Iterable<readonly [string, V]>
    ) {
        super();
        for (const by of Object.keys(groupers) as G[]) this.groups.set(by, new Map());
        if (entries) for (const [key, value] of entries) this.set(key, value);
    }

    override set(key: string, value: V): this {
        const previous = super.get(key);
        super.set(key, value);
        for (const by of Object.keys(this.groupers) as G[]) {
            const group = this.groupers[by](value);
            if (previous !== undefined) {
                const was = this.groupers[by](previous);
                if (was === group) continue;
                this.ungroup(by, key, was);
            }
            const index = this.groups.get(by)!;
            let keys = index.get(group);
            if (!keys) {
                keys = new Set();
                index.set(group, keys);
            }
            keys.add(key);
        }
        return this;
    }

    override delete(key: string): boolean {
        const previous = super.get(key);
        if (previous !== undefined) {
            for (const by of Object.keys(this.groupers) as G[]) {
                this.ungroup(by, key, this.groupers[by](previous));
            }
        }
        return super.delete(key);
    }

    override clear(): void {
        super.clear();
        for (const index of this.groups.values()) index.clear();
    }

    /** The rows of one group under one grouping, in insertion order; the cost is the group's size. */
    inGroup(by: G, group: string): V[] {
        const keys = this.groups.get(by)?.get(group);
        if (!keys) return [];
        const rows: V[] = [];
        for (const key of keys) {
            const row = super.get(key);
            if (row !== undefined) rows.push(row);
        }
        return rows;
    }

    private ungroup(by: G, key: string, group: string): void {
        const index = this.groups.get(by);
        const keys = index?.get(group);
        if (!keys) return;
        keys.delete(key);
        if (keys.size === 0) index!.delete(group);
    }
}

/** The groupings of a release switch's per-recipient rows (copies, notices): by switch and by recipient account. */
export type ReleaseRowGroup = 'switch' | 'recipient';
export const releaseRowGroupers = <
    V extends { switchId: string; recipientAccountId: string }
>(): Record<ReleaseRowGroup, (row: V) => string> => ({
    switch: (row) => row.switchId,
    recipient: (row) => row.recipientAccountId,
});

/** The grouping of dead-man switches: by owner, which every arm reads twice (the held cap and the rate). */
export type SwitchGroup = 'owner';
export const switchGroupers = (): Record<SwitchGroup, (row: DeadmanSwitchRecord) => string> => ({
    owner: (row) => row.ownerId,
});

/**
 * The grouping of release identities: by account, which every arm and re-seal
 * reads once per copy before the signatures and again after them (the
 * recipients' current identities and the owner's), and every publish reads.
 * Erased rows have no account and group under `''`, which nothing lists.
 */
export type IdentityGroup = 'account';
export const identityGroupers = (): Record<
    IdentityGroup,
    (row: ReleaseIdentityRecord) => string
> => ({
    account: (row) => row.accountId,
});

type PersistedState = {
    users: UserRecord[];
    canopyDirectoryEntries: CanopyDirectoryEntryRecord[];
    canaryTokens: CanaryTokenRecord[];
    denGreetings: DenGreetingRecord[];
    meshEnvelopes: MeshEnvelope[];
    messages: MessageRecord[];
    scheduledMessages: ScheduledMessageRecord[];
    votes: VoteRecord[];
    voteEntries: VoteEntryRecord[];
    federationLinks: FederationLinkRecord[];
    forumPosts: ForumPostRecord[];
    channels: ChannelRecord[];
    deadDrops: DeadDropRecord[];
    deadmanSwitches: DeadmanSwitchRecord[];
    deadmanReleaseWraps?: DeadmanReleaseWrapRecord[];
    deadmanReleaseNotices?: DeadmanReleaseNoticeRecord[];
    releaseIdentities: ReleaseIdentityRecord[];
    moderationActions: ModerationActionRecord[];
    creatorStreamAuth: CreatorStreamAuthRecord[];
    streams: StreamRecord[];
    streamSessions: StreamSessionRecord[];
    streamModeration: StreamModerationRecord[];
    clips: ClipRecord[];
    canopyVoiceRooms: CanopyVoiceRoomRecord[];
    voiceRoomParticipants: VoiceRoomParticipantRecord[];
    voiceRoomEvents: VoiceRoomEventRecord[];
    voiceRoomSanctions: VoiceRoomSanctionRecord[];
    marketplaceEntitlements: MarketplaceEntitlementRecord[];
    marketplaceWebhookAudit: MarketplaceWebhookAuditRecord[];
    marketplaceLicenseKeys: MarketplaceLicenseKeyRecord[];
    marketplaceListingsCache: MarketplaceListingsCacheRecord[];
    fbmVendorRooms: FbmVendorRoomRecord[];
    fbmBuyerOrderRooms: FbmBuyerOrderRoomRecord[];
    fbmDeaddropDeliveries: FbmDeaddropDeliveryRecord[];
    fbmDisputeRooms: FbmDisputeRoomRecord[];
    fbmAclState: FbmAclStateRecord[];
    tips: TipRecord[];
    creatorSubscriptionTiers: CreatorSubscriptionTierRecord[];
    creatorSubscriptions: CreatorSubscriptionRecord[];
    communityBoostPledges: CommunityBoostPledgeRecord[];
    aidPools: AidPoolRecord[];
    adRevenuePeriods: AdRevenuePeriodRecord[];
    adRevenueShares: AdRevenueShareRecord[];
    passwordResetTokens: PasswordResetTokenRecord[];
    emailVerificationTokens: EmailVerificationTokenRecord[];
    accountDeletionTokens: AccountDeletionTokenRecord[];
    invitationTokens: InvitationTokenRecord[];
    invitationRedemptions: InvitationRedemptionRecord[];
    invitationAdmissions: InvitationAdmissionRecord[];
    burnerIdentities: BurnerIdentityRecord[];
    refreshTokens: RefreshTokenRecord[];
    revokedSessions: RevokedSessionRecord[];
    linkedAccounts: LinkedAccountRecord[];
    pendingOAuthLinks: PendingOAuthLinkRecord[];
    pendingOidcLogins: PendingOidcLoginRecord[];
    twitchChatBridges: TwitchChatBridgeRecord[];
    twitchEventSubscriptions: TwitchEventSubscriptionRecord[];
    widgetAlertTokens: WidgetAlertTokenRecord[];
    youtubeChatBridges: YoutubeChatBridgeRecord[];
    kickChatBridges: KickChatBridgeRecord[];
    simulcastDestinations: SimulcastDestinationRecord[];
    discordCompatWebhooks: DiscordCompatWebhookRecord[];
    discordServerImports: DiscordServerImportRecord[];
    discordImportMappings: DiscordImportMappingRecord[];
    discordBridgeActivations: DiscordBridgeActivationRecord[];
    outboundEventWebhooks: OutboundEventWebhookRecord[];
    twitchIrcBotTokens: TwitchIrcBotTokenRecord[];
    obsWsPasswords: ObsWsPasswordRecord[];
    twitchExtensionPanels: TwitchExtensionPanelRecord[];
    creatorListings: CreatorListingRecord[];
    vaultItems: VaultItemRecord[];
    channelPointsRewards: ChannelPointsRewardRecord[];
    channelPointsLedger: ChannelPointsLedgerRecord[];
    coalitionSpatialItems: CoalitionSpatialItemRecord[];
    coalitionAidPosts: CoalitionAidPostRecord[];
    coalitionEvents: CoalitionEventRecord[];
    eventRsvps: EventRsvpRecord[];
    eventVolunteerSlots: VolunteerSlotRecord[];
    eventVolunteerSignups: VolunteerSignupRecord[];
    eventRideOffers: RideOfferRecord[];
    eventRideClaims: RideClaimRecord[];
    coalitionRings: CoalitionRingRecord[];
    ringMemberships: RingMembershipRecord[];
    ringInvitations: RingInvitationRecord[];
    coalitions: CoalitionRecord[];
    coalitionMemberships: CoalitionMembershipRecord[];
    coalitionJoinRequests: CoalitionJoinRequestRecord[];
    coalitionConnections: CoalitionConnectionRecord[];
    coalitionMemberConnections: CoalitionMemberConnectionRecord[];
    coalitionCampaigns: CoalitionCampaignRecord[];
    coalitionCampaignPosts: CoalitionCampaignPostRecord[];
    coalitionExternalActivity: CoalitionExternalActivityRecord[];
    coalitionCampaignSyncOptIns: CoalitionCampaignSyncOptInRecord[];
    coalitionBoosts: CoalitionBoostRecord[];
    coalitionCampaignContributions: CoalitionCampaignContributionRecord[];
    coalitionCampaignEngagement: CampaignEngagementRecord[];
    coalitionCampaignAttribution: CampaignAttributionRecord[];
    coalitionCampaignPayees: CoalitionCampaignPayeeRecord[];
    coalitionSuccessionPetitions: CoalitionSuccessionPetitionRecord[];
    coalitionKitApplications: CoalitionKitApplicationRecord[];
    coalitionTasks: CoalitionTaskRecord[];
    coalitionNeeds: CoalitionNeedRecord[];
    coalitionProjects: CoalitionProjectRecord[];
    coalitionProjectSupports: CoalitionProjectSupportRecord[];
    coalitionSurges: CoalitionSurgeRecord[];
    coalitionNotifications: CoalitionNotificationRecord[];
    coalitionResources: CoalitionResourceRecord[];
    creatorContent: CreatorContentRecord[];
    contentDistributions: ContentDistributionRecord[];
    productReviews: ProductReviewRecord[];
    productVersions: ProductVersionRecord[];
    sellerLocations: SellerLocationRecord[];
    marketplaceSellerProfiles: SellerProfileRecord[];
    coalitionFeedItems: CoalitionFeedItemRecord[];
    coalitionFeedLikes: CoalitionFeedLikeRecord[];
    coalitionFeedComments: CoalitionFeedCommentRecord[];
    circleEdges: CircleEdgeRecord[];
    relayEdges: RelayEdgeRecord[];
    communityAssets: CommunityAssetRecord[];
    communityAssetReports: CommunityAssetReportRecord[];
    memberProfiles: MemberProfileRecord[];
    profileWallPosts: ProfileWallPostRecord[];
    pluginInstallations: PluginInstallationRecord[];
    pluginDens: PluginDenRecord[];
    coalitionKitManifestApplications: CoalitionKitManifestApplicationRecord[];
    pluginReviews: PluginReviewRecord[];
    pluginForks: PluginForkRecord[];
    pluginShowcases: PluginShowcaseRecord[];
    coliseumTopics: ColiseumTopicRecord[];
    coliseumChallenges: ColiseumChallengeRecord[];
    challengeEntries: ChallengeEntryRecord[];
    challengeVotes: ChallengeVoteRecord[];
    coliseumArguments: ColiseumArgumentRecord[];
    coliseumVotes: ColiseumVoteRecord[];
    coliseumLiveSessions: ColiseumLiveSessionRecord[];
    coliseumMatches: ColiseumMatchRecord[];
    coliseumRounds: ColiseumRoundRecord[];
    coliseumRoundVotes: ColiseumRoundVoteRecord[];
    coliseumShouts: ColiseumShoutRecord[];
    coliseumResponseDrops: ColiseumResponseDropRecord[];
    coliseumResponseDropVotes: ColiseumResponseDropVoteRecord[];
    coliseumBriefs: ColiseumBriefRecord[];
    coliseumCrucibleStatements: ColiseumCrucibleStatementRecord[];
    coliseumCrucibleVotes: ColiseumCrucibleVoteRecord[];
    coliseumExplainers: ColiseumExplainerRecord[];
    coliseumExplainerVotes: ColiseumExplainerVoteRecord[];
    reputationEvents: ReputationEventRecord[];
    referrals: ReferralRecord[];
    ambassadors: AmbassadorRecord[];
    quests: QuestDefinitionRecord[];
    questCompletions: QuestCompletionRecord[];
    migrationCredits: MigrationCreditRecord[];
    bountyRewards: BountyRewardRecord[];
    canopySubscriptions: CanopySubscriptionRecord[];
    subscriptionAuditEvents: SubscriptionAuditEventRecord[];
    processedBillingWebhookEvents: ProcessedBillingWebhookEventRecord[];
    subscriptionGifts: SubscriptionGiftRecord[];
};

class InMemoryDb {
    users = new Map<string, UserRecord>();
    /** Keyed by canopy (Matrix space) id. */
    canopyDirectoryEntries = new Map<string, CanopyDirectoryEntryRecord>();
    canaryTokens = new Map<string, CanaryTokenRecord>();
    /** Den auto-welcome ledger (BLACKOUT_DEN_GREETER), keyed by `${roomId}:${userId}`. */
    denGreetings = new Map<string, DenGreetingRecord>();
    /** Canopy subscription billing state, keyed by user id (one live record per user). */
    canopySubscriptions = new Map<string, CanopySubscriptionRecord>();
    /** Append-only billing audit trail, keyed by event id. */
    subscriptionAuditEvents = new Map<string, SubscriptionAuditEventRecord>();
    /** Billing-webhook de-dupe ledger, keyed by provider event id. */
    processedBillingWebhookEvents = new Map<string, ProcessedBillingWebhookEventRecord>();
    /** Pay-it-forward subscription gifts, keyed by gift id. */
    subscriptionGifts = new Map<string, SubscriptionGiftRecord>();
    /** Mesh relay store-and-forward envelopes, keyed by envelope id. Durable; see services/meshRelay.ts. */
    meshEnvelopes = new Map<string, MeshEnvelope>();
    messages = new Map<string, MessageRecord>();
    /** Keyed by scheduled-message id. */
    scheduledMessages = new Map<string, ScheduledMessageRecord>();
    votes = new Map<string, VoteRecord>();
    voteEntries = new Map<string, VoteEntryRecord>();
    federationLinks = new Map<string, FederationLinkRecord>();
    forumPosts = new Map<string, ForumPostRecord>();
    channels = new Map<string, ChannelRecord>();
    deadDrops = new Map<string, DeadDropRecord>();
    /** Dead-man switches by id, grouped by owner (the arming bounds list an owner's switches twice per arm). */
    deadmanSwitches = new GroupedMap<DeadmanSwitchRecord, SwitchGroup>(switchGroupers());
    /** Sealed copies of release switches' content keys, keyed `${switchId}:${recipientAccountId}`, grouped by switch and by recipient. */
    deadmanReleaseWraps = new GroupedMap<DeadmanReleaseWrapRecord, ReleaseRowGroup>(
        releaseRowGroupers<DeadmanReleaseWrapRecord>()
    );
    /** The bot's notices of fired release switches, keyed `${switchId}:${recipientAccountId}`, grouped by switch and by recipient. */
    deadmanReleaseNotices = new GroupedMap<DeadmanReleaseNoticeRecord, ReleaseRowGroup>(
        releaseRowGroupers<DeadmanReleaseNoticeRecord>()
    );
    /** Published release identities, current and superseded, keyed by row id, grouped by account. */
    releaseIdentities = new GroupedMap<ReleaseIdentityRecord, IdentityGroup>(identityGroupers());
    moderationActions = new Map<string, ModerationActionRecord>();
    creatorStreamAuth = new Map<string, CreatorStreamAuthRecord>();
    streams = new Map<string, StreamRecord>();
    streamSessions = new Map<string, StreamSessionRecord>();
    streamModeration = new Map<string, StreamModerationRecord>();
    clips = new Map<string, ClipRecord>();
    canopyVoiceRooms = new Map<string, CanopyVoiceRoomRecord>();
    voiceRoomParticipants = new Map<string, VoiceRoomParticipantRecord>();
    voiceRoomEvents = new Map<string, VoiceRoomEventRecord>();
    voiceRoomSanctions = new Map<string, VoiceRoomSanctionRecord>();
    marketplaceEntitlements = new Map<string, MarketplaceEntitlementRecord>();
    marketplaceWebhookAudit = new Map<string, MarketplaceWebhookAuditRecord>();
    marketplaceLicenseKeys = new Map<string, MarketplaceLicenseKeyRecord>();
    marketplaceListingsCache = new Map<string, MarketplaceListingsCacheRecord>();
    fbmVendorRooms = new Map<string, FbmVendorRoomRecord>();
    fbmBuyerOrderRooms = new Map<string, FbmBuyerOrderRoomRecord>();
    fbmDeaddropDeliveries = new Map<string, FbmDeaddropDeliveryRecord>();
    fbmDisputeRooms = new Map<string, FbmDisputeRoomRecord>();
    fbmAclState = new Map<string, FbmAclStateRecord>();
    tips = new Map<string, TipRecord>();
    /** Growth ledger — durable referral/ambassador/quest/reward attribution. */
    referrals = new Map<string, ReferralRecord>();
    ambassadors = new Map<string, AmbassadorRecord>();
    quests = new Map<string, QuestDefinitionRecord>();
    questCompletions = new Map<string, QuestCompletionRecord>();
    migrationCredits = new Map<string, MigrationCreditRecord>();
    bountyRewards = new Map<string, BountyRewardRecord>();
    creatorSubscriptionTiers = new Map<string, CreatorSubscriptionTierRecord>();
    creatorSubscriptions = new Map<string, CreatorSubscriptionRecord>();
    communityBoostPledges = new Map<string, CommunityBoostPledgeRecord>();
    aidPools = new Map<string, AidPoolRecord>();
    adRevenuePeriods = new Map<string, AdRevenuePeriodRecord>();
    adRevenueShares = new Map<string, AdRevenueShareRecord>();
    passwordResetTokens = new Map<string, PasswordResetTokenRecord>();
    emailVerificationTokens = new Map<string, EmailVerificationTokenRecord>();
    accountDeletionTokens = new Map<string, AccountDeletionTokenRecord>();
    /** Keyed by token id (a UUID); the hash is a non-primary lookup index. */
    invitationTokens = new Map<string, InvitationTokenRecord>();
    /** Keyed by redemption id. */
    invitationRedemptions = new Map<string, InvitationRedemptionRecord>();
    /** Keyed by admission id: account-number sign-up's spent uses (D3). */
    invitationAdmissions = new Map<string, InvitationAdmissionRecord>();
    /** Burner identities, keyed by row id. */
    burnerIdentities = new Map<string, BurnerIdentityRecord>();
    refreshTokens = new Map<string, RefreshTokenRecord>();
    revokedSessions = new Map<string, RevokedSessionRecord>();
    /** Keyed by `${blackoutUserId}:${provider}` to enforce one link per (user, provider). */
    linkedAccounts = new Map<string, LinkedAccountRecord>();
    /** Keyed by stateHash. */
    pendingOAuthLinks = new Map<string, PendingOAuthLinkRecord>();
    /** Keyed by stateHash (native-OIDC login flows — no user id; see types). */
    pendingOidcLogins = new Map<string, PendingOidcLoginRecord>();
    /** Keyed by bridge id. */
    twitchChatBridges = new Map<string, TwitchChatBridgeRecord>();
    /** Keyed by helixSubscriptionId for O(1) inbound-notification lookup. */
    twitchEventSubscriptions = new Map<string, TwitchEventSubscriptionRecord>();
    /** Keyed by secretHash so the SSE handler can validate a presented bearer in O(1). */
    widgetAlertTokens = new Map<string, WidgetAlertTokenRecord>();
    /** Keyed by bridge id. */
    youtubeChatBridges = new Map<string, YoutubeChatBridgeRecord>();
    /** Keyed by bridge id. */
    kickChatBridges = new Map<string, KickChatBridgeRecord>();
    /** Keyed by destination id. */
    simulcastDestinations = new Map<string, SimulcastDestinationRecord>();
    /** Keyed by webhook id (the public part of the URL). */
    discordCompatWebhooks = new Map<string, DiscordCompatWebhookRecord>();
    /** Migration Hub: Discord server-import jobs, keyed by import id. */
    discordServerImports = new Map<string, DiscordServerImportRecord>();
    /** Migration Hub: Discord-object → Blackout-target mappings, keyed by row id. */
    discordImportMappings = new Map<string, DiscordImportMappingRecord>();
    /** Migration Hub: den ↔ Discord channel bridge activations, keyed by row id. */
    discordBridgeActivations = new Map<string, DiscordBridgeActivationRecord>();
    /** Keyed by subscription id. */
    outboundEventWebhooks = new Map<string, OutboundEventWebhookRecord>();
    /** Keyed by token id. */
    twitchIrcBotTokens = new Map<string, TwitchIrcBotTokenRecord>();
    /** Keyed by password id (also the URL slug). */
    obsWsPasswords = new Map<string, ObsWsPasswordRecord>();
    twitchExtensionPanels = new Map<string, TwitchExtensionPanelRecord>();
    /** Keyed by listing id. */
    creatorListings = new Map<string, CreatorListingRecord>();
    /** Keyed by vault item id. */
    vaultItems = new Map<string, VaultItemRecord>();
    channelPointsRewards = new Map<string, ChannelPointsRewardRecord>();
    channelPointsLedger = new Map<string, ChannelPointsLedgerRecord>();
    /** Coalition spatial map pins, keyed by item id. */
    coalitionSpatialItems = new Map<string, CoalitionSpatialItemRecord>(
        demoSeedRows(COALITION_SPATIAL_SEED).map((row) => [row.id, row])
    );
    /** Coalition mutual-aid posts, keyed by post id. */
    coalitionAidPosts = new Map<string, CoalitionAidPostRecord>(
        demoSeedRows(COALITION_AID_SEED).map((row) => [row.id, row])
    );
    /** Coalition events (gatherings), keyed by event id. */
    coalitionEvents = new Map<string, CoalitionEventRecord>();
    /** Event RSVPs, keyed by `${eventId}::${userId}` (one per attendee per event). */
    eventRsvps = new Map<string, EventRsvpRecord>();
    /** Volunteer slots, keyed by slot id. */
    eventVolunteerSlots = new Map<string, VolunteerSlotRecord>();
    /** Volunteer signups, keyed by `${slotId}::${userId}`. */
    eventVolunteerSignups = new Map<string, VolunteerSignupRecord>();
    /** Ride offers, keyed by offer id. */
    eventRideOffers = new Map<string, RideOfferRecord>();
    /** Ride seat claims, keyed by `${offerId}::${riderId}`. */
    eventRideClaims = new Map<string, RideClaimRecord>();
    /** Coalition rings (circles/crews/guilds), keyed by ring id. */
    coalitionRings = new Map<string, CoalitionRingRecord>();
    /** Ring memberships, keyed by `${ringId}::${userId}`. */
    ringMemberships = new Map<string, RingMembershipRecord>();
    /** Ring invitations, keyed by `${ringId}::${inviteeId}`. */
    ringInvitations = new Map<string, RingInvitationRecord>();
    coalitions = new Map<string, CoalitionRecord>();
    /** Keyed by `${coalitionId}::${userId}`. */
    coalitionMemberships = new Map<string, CoalitionMembershipRecord>();
    /** Keyed by `${coalitionId}::${userId}`. */
    coalitionJoinRequests = new Map<string, CoalitionJoinRequestRecord>();
    /** Keyed by `${coalitionId}::${platform}`. */
    coalitionConnections = new Map<string, CoalitionConnectionRecord>();
    /** Keyed by `${coalitionId}::${userId}::${platform}`. */
    coalitionMemberConnections = new Map<string, CoalitionMemberConnectionRecord>();
    coalitionCampaigns = new Map<string, CoalitionCampaignRecord>();
    coalitionCampaignPosts = new Map<string, CoalitionCampaignPostRecord>();
    coalitionExternalActivity = new Map<string, CoalitionExternalActivityRecord>();
    /** Keyed by `${campaignId}::${userId}::${platform}`. */
    coalitionCampaignSyncOptIns = new Map<string, CoalitionCampaignSyncOptInRecord>();
    /** Keyed by `${campaignId}::${userId}::${day}`. */
    coalitionBoosts = new Map<string, CoalitionBoostRecord>();
    coalitionCampaignContributions = new Map<string, CoalitionCampaignContributionRecord>();
    coalitionCampaignEngagement = new Map<string, CampaignEngagementRecord>();
    coalitionCampaignAttribution = new Map<string, CampaignAttributionRecord>();
    coalitionCampaignPayees = new Map<string, CoalitionCampaignPayeeRecord>();
    coalitionSuccessionPetitions = new Map<string, CoalitionSuccessionPetitionRecord>();
    /** Records of Coalition Kits applied to a den/coalition, keyed by application id. */
    coalitionKitApplications = new Map<string, CoalitionKitApplicationRecord>();
    /** Coalition den tasks, keyed by task id. */
    coalitionTasks = new Map<string, CoalitionTaskRecord>(
        demoSeedRows(COALITION_TASK_SEED).map((row) => [row.id, row])
    );
    /** Coalition Needs Board posts, keyed by need id. */
    coalitionNeeds = new Map<string, CoalitionNeedRecord>();
    /** Coalition projects, keyed by project id. */
    coalitionProjects = new Map<string, CoalitionProjectRecord>();
    coalitionProjectSupports = new Map<string, CoalitionProjectSupportRecord>();
    coalitionSurges = new Map<string, CoalitionSurgeRecord>();
    coalitionNotifications = new Map<string, CoalitionNotificationRecord>();
    /** Coalition shared resources, keyed by resource id. */
    coalitionResources = new Map<string, CoalitionResourceRecord>();
    /** Creator content items, keyed by content id. */
    creatorContent = new Map<string, CreatorContentRecord>();
    /** Content→surface distribution records, keyed by distribution id. */
    contentDistributions = new Map<string, ContentDistributionRecord>();
    /** Marketplace product reviews, keyed by review id. */
    productReviews = new Map<string, ProductReviewRecord>();
    /** Marketplace product version-history entries, keyed by version id. */
    productVersions = new Map<string, ProductVersionRecord>();
    /** Ecosystem bounties, keyed by bounty id. */
    bounties = new Map<string, BountyRecord>();
    /** Bounty applications (producer↔creator matching), keyed by application id. */
    bountyApplications = new Map<string, BountyApplicationRecord>();
    /** Seller map locations, keyed by location id. */
    sellerLocations = new Map<string, SellerLocationRecord>(
        demoSeedRows(COALITION_SELLER_SEED).map((row) => [row.id, row])
    );
    /** Seller/producer profiles, keyed by `${userId}::${providerId}`. */
    marketplaceSellerProfiles = new Map<string, SellerProfileRecord>();
    /** Coalition feed items (video/event/aid/listing/proposal), keyed by item id. */
    coalitionFeedItems = new Map<string, CoalitionFeedItemRecord>(
        demoSeedRows(COALITION_FEED_SEED).map((row) => [row.id, row])
    );
    /** Feed likes, keyed by `${feedItemId}::${userId}`. */
    coalitionFeedLikes = new Map<string, CoalitionFeedLikeRecord>();
    /** Feed comments, keyed by comment id. */
    coalitionFeedComments = new Map<string, CoalitionFeedCommentRecord>();
    /** Circle edges (follower put followee in their Circle), keyed by `${followerId}::${followeeId}`. */
    circleEdges = new Map<string, CircleEdgeRecord>();
    /** Relay edges, keyed by `${relayerUserId}::${subjectSource}::${subjectId}`. */
    relayEdges = new Map<string, RelayEdgeRecord>();
    /** User-made stickers/memes/coins, keyed by asset id. */
    communityAssets = new Map<string, CommunityAssetRecord>();
    /** Reports on approved assets, keyed by `${assetId}::${reporterId}`. */
    communityAssetReports = new Map<string, CommunityAssetReportRecord>();
    /** Member profiles, keyed by user id. */
    memberProfiles = new Map<string, MemberProfileRecord>();
    /** Wall posts, keyed by post id. */
    profileWallPosts = new Map<string, ProfileWallPostRecord>();
    /** Plugin installations (activation-at-scope), keyed by installation id. */
    pluginInstallations = new Map<string, PluginInstallationRecord>();
    /** Plugin-provisioned companion dens, keyed by linkage id. */
    pluginDens = new Map<string, PluginDenRecord>();
    /** Coalition kit applications ledger, keyed by application id. */
    coalitionKitManifestApplications = new Map<string, CoalitionKitManifestApplicationRecord>();
    /** Plugin reviews/ratings, keyed by review id. */
    pluginReviews = new Map<string, PluginReviewRecord>();
    /** Plugin forks, keyed by fork id. */
    pluginForks = new Map<string, PluginForkRecord>();
    /** Plugin showcases, keyed by showcase id. */
    pluginShowcases = new Map<string, PluginShowcaseRecord>();
    /** Coliseum debate topics, keyed by topic id. */
    coliseumTopics = new Map<string, ColiseumTopicRecord>();
    /** Coliseum challenges, keyed by challenge id. */
    coliseumChallenges = new Map<string, ColiseumChallengeRecord>();
    /** Challenge entries, keyed by entry id. */
    challengeEntries = new Map<string, ChallengeEntryRecord>();
    /** Challenge votes (one per voter per entry), keyed by vote id. */
    challengeVotes = new Map<string, ChallengeVoteRecord>();
    /** Coliseum arguments, keyed by argument id. */
    coliseumArguments = new Map<string, ColiseumArgumentRecord>();
    /** Coliseum votes, keyed by `${argumentId}::${voterId}` (one vote per pair). */
    coliseumVotes = new Map<string, ColiseumVoteRecord>();
    /** Coliseum live debate sessions, keyed by session id. */
    coliseumLiveSessions = new Map<string, ColiseumLiveSessionRecord>();
    /** Coliseum matches, keyed by match id. */
    coliseumMatches = new Map<string, ColiseumMatchRecord>();
    /** Coliseum match rounds, keyed by round id. */
    coliseumRounds = new Map<string, ColiseumRoundRecord>();
    /** Round votes, keyed by `${matchId}::${roundIndex}::${voterId}`. */
    coliseumRoundVotes = new Map<string, ColiseumRoundVoteRecord>();
    /** Coliseum shouts, keyed by shout id. */
    coliseumShouts = new Map<string, ColiseumShoutRecord>();
    /** Response drops, keyed by drop id. */
    coliseumResponseDrops = new Map<string, ColiseumResponseDropRecord>();
    /** Response-drop votes, keyed by `${dropId}::${voterId}`. */
    coliseumResponseDropVotes = new Map<string, ColiseumResponseDropVoteRecord>();
    /** Minted briefs (immutable), keyed by brief id. */
    coliseumBriefs = new Map<string, ColiseumBriefRecord>();
    /** Crucible final statements, keyed by `${matchId}::${side}`. */
    coliseumCrucibleStatements = new Map<string, ColiseumCrucibleStatementRecord>();
    /** Crucible synthesis votes, keyed by `${matchId}::${questionId}::${voterId}`. */
    coliseumCrucibleVotes = new Map<string, ColiseumCrucibleVoteRecord>();
    /** Authored explainers, keyed by explainer id. */
    coliseumExplainers = new Map<string, ColiseumExplainerRecord>();
    /** Explainer helpful-votes, keyed by `${explainerId}::${voterId}`. */
    coliseumExplainerVotes = new Map<string, ColiseumExplainerVoteRecord>();
    /** Subject-scoped reputation awards, keyed by event id. */
    reputationEvents = new Map<string, ReputationEventRecord>();

    constructor() {
        const explicitDemoPassword = process.env.BLACKOUT_DEMO_PASSWORD;
        if (process.env.NODE_ENV === 'production' && !explicitDemoPassword) {
            return;
        }
        const demoPassword = explicitDemoPassword ?? 'demo';
        this.createUser({
            id: 'demo-user',
            username: 'demo',
            email: 'demo@blackout.local',
            passwordHash: hashPassword(demoPassword),
            reputationScore: 100,
            reputationTier: 'member',
            pubkeyEd25519: 'demo-pubkey',
        });
    }

    createUser(input: Omit<UserRecord, 'createdAt'>): UserRecord {
        const record: UserRecord = { ...input, createdAt: nowIso() };
        this.users.set(record.id, record);
        return record;
    }

    deleteUser(id: string): boolean {
        return this.users.delete(id);
    }

    findUserByEmail(email: string): UserRecord | undefined {
        // Emailless accounts (email unset, or '' in legacy file-store records)
        // are not reachable by email lookup — and an empty query must never
        // match one of them.
        if (!email) return undefined;
        return [...this.users.values()].find(
            (user) => !!user.email && user.email.toLowerCase() === email.toLowerCase()
        );
    }

    findUserByUsername(username: string): UserRecord | undefined {
        return [...this.users.values()].find(
            (user) => user.username.toLowerCase() === username.toLowerCase()
        );
    }

    getUserById(id: string): UserRecord | undefined {
        return this.users.get(id);
    }

    /** Case-insensitive username substring search; returns id + username only. */
    searchUsers(query: string, limit = 10): Array<{ id: string; username: string }> {
        const q = query.trim().toLowerCase();
        if (!q) return [];
        const out: Array<{ id: string; username: string }> = [];
        for (const user of this.users.values()) {
            if (user.username.toLowerCase().includes(q)) {
                out.push({ id: user.id, username: user.username });
                if (out.length >= limit) break;
            }
        }
        return out;
    }

    updateUserPassword(id: string, passwordHash: string): UserRecord | undefined {
        const user = this.users.get(id);
        if (!user) return undefined;
        const updated: UserRecord = { ...user, passwordHash };
        this.users.set(id, updated);
        return updated;
    }

    // --- password reset ---

    createPasswordResetToken(
        input: Omit<PasswordResetTokenRecord, 'createdAt'>
    ): PasswordResetTokenRecord {
        const record: PasswordResetTokenRecord = { ...input, createdAt: nowIso() };
        this.passwordResetTokens.set(record.id, record);
        return record;
    }

    findPasswordResetTokenByHash(tokenHash: string): PasswordResetTokenRecord | undefined {
        return [...this.passwordResetTokens.values()].find((t) => t.tokenHash === tokenHash);
    }

    consumePasswordResetToken(id: string): PasswordResetTokenRecord | undefined {
        const existing = this.passwordResetTokens.get(id);
        if (!existing) return undefined;
        if (existing.consumedAt) return existing;
        const updated: PasswordResetTokenRecord = { ...existing, consumedAt: nowIso() };
        this.passwordResetTokens.set(id, updated);
        return updated;
    }

    deleteExpiredPasswordResetTokens(now: Date = new Date()): number {
        let removed = 0;
        for (const [id, record] of this.passwordResetTokens) {
            if (new Date(record.expiresAt).getTime() < now.getTime()) {
                this.passwordResetTokens.delete(id);
                removed += 1;
            }
        }
        return removed;
    }

    // --- email verification ---

    createEmailVerificationToken(
        input: Omit<EmailVerificationTokenRecord, 'createdAt'>
    ): EmailVerificationTokenRecord {
        const record: EmailVerificationTokenRecord = { ...input, createdAt: nowIso() };
        this.emailVerificationTokens.set(record.id, record);
        return record;
    }

    findEmailVerificationTokenByHash(tokenHash: string): EmailVerificationTokenRecord | undefined {
        return [...this.emailVerificationTokens.values()].find((t) => t.tokenHash === tokenHash);
    }

    countActiveEmailVerificationTokensForUser(userId: string, since: Date): number {
        let count = 0;
        const cutoff = since.getTime();
        for (const record of this.emailVerificationTokens.values()) {
            if (record.userId === userId && new Date(record.createdAt).getTime() >= cutoff) {
                count += 1;
            }
        }
        return count;
    }

    listEmailVerificationTokensForUser(userId: string): EmailVerificationTokenRecord[] {
        return [...this.emailVerificationTokens.values()].filter((t) => t.userId === userId);
    }

    markEmailVerificationTokenSent(id: string): EmailVerificationTokenRecord | undefined {
        const existing = this.emailVerificationTokens.get(id);
        if (!existing) return undefined;
        if (existing.sentAt) return existing;
        const updated: EmailVerificationTokenRecord = { ...existing, sentAt: nowIso() };
        this.emailVerificationTokens.set(id, updated);
        return updated;
    }

    consumeEmailVerificationToken(id: string): EmailVerificationTokenRecord | undefined {
        const existing = this.emailVerificationTokens.get(id);
        if (!existing) return undefined;
        if (existing.consumedAt) return existing;
        const updated: EmailVerificationTokenRecord = { ...existing, consumedAt: nowIso() };
        this.emailVerificationTokens.set(id, updated);
        return updated;
    }

    revokeEmailVerificationTokensForUser(userId: string, reason: string): number {
        let revoked = 0;
        for (const [id, record] of this.emailVerificationTokens) {
            if (record.userId === userId && !record.consumedAt && !record.revokedReason) {
                this.emailVerificationTokens.set(id, { ...record, revokedReason: reason });
                revoked += 1;
            }
        }
        return revoked;
    }

    markUserEmailVerified(id: string, verifiedAt: string = nowIso()): UserRecord | undefined {
        const user = this.users.get(id);
        if (!user) return undefined;
        if (user.emailVerifiedAt) return user;
        const updated: UserRecord = { ...user, emailVerifiedAt: verifiedAt };
        this.users.set(id, updated);
        return updated;
    }

    deleteExpiredEmailVerificationTokens(now: Date = new Date()): number {
        let removed = 0;
        for (const [id, record] of this.emailVerificationTokens) {
            if (new Date(record.expiresAt).getTime() < now.getTime() && !record.consumedAt) {
                this.emailVerificationTokens.delete(id);
                removed += 1;
            }
        }
        return removed;
    }

    // --- account deletion tokens ---

    createAccountDeletionToken(
        input: Omit<AccountDeletionTokenRecord, 'createdAt'>
    ): AccountDeletionTokenRecord {
        const record: AccountDeletionTokenRecord = { ...input, createdAt: nowIso() };
        this.accountDeletionTokens.set(record.id, record);
        return record;
    }

    findAccountDeletionTokenByHash(tokenHash: string): AccountDeletionTokenRecord | undefined {
        return [...this.accountDeletionTokens.values()].find((t) => t.tokenHash === tokenHash);
    }

    consumeAccountDeletionToken(id: string): AccountDeletionTokenRecord | undefined {
        const existing = this.accountDeletionTokens.get(id);
        if (!existing) return undefined;
        if (existing.consumedAt) return existing;
        const updated: AccountDeletionTokenRecord = { ...existing, consumedAt: nowIso() };
        this.accountDeletionTokens.set(id, updated);
        return updated;
    }

    createInvitationToken(
        input: Omit<InvitationTokenRecord, 'createdAt' | 'useCount'> & { useCount?: number }
    ): InvitationTokenRecord {
        const record: InvitationTokenRecord = {
            ...input,
            useCount: input.useCount ?? 0,
            createdAt: nowIso(),
        };
        this.invitationTokens.set(record.id, record);
        return record;
    }

    getInvitationTokenById(id: string): InvitationTokenRecord | undefined {
        return this.invitationTokens.get(id);
    }

    findInvitationTokenByHash(tokenHash: string): InvitationTokenRecord | undefined {
        return [...this.invitationTokens.values()].find((t) => t.tokenHash === tokenHash);
    }

    listInvitationTokensByCreator(
        createdBy: string,
        opts: { label?: string; before?: string; limit?: number } = {}
    ): InvitationTokenRecord[] {
        const needle = opts.label?.toLowerCase();
        // Deterministic ordering (createdAt desc, then id desc) so the composite
        // `${createdAt}|${id}` cursor is stable even when two tokens share a
        // createdAt timestamp.
        let rows = [...this.invitationTokens.values()]
            .filter((t) => t.createdBy === createdBy)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
        if (needle) {
            rows = rows.filter((t) => (t.label ?? '').toLowerCase().includes(needle));
        }
        if (opts.before) {
            rows = rows.filter((t) => `${t.createdAt}|${t.id}`.localeCompare(opts.before!) < 0);
        }
        if (typeof opts.limit === 'number') {
            rows = rows.slice(0, Math.max(0, opts.limit));
        }
        return rows;
    }

    /** Atomically bump useCount; returns the updated record or undefined when
     *  the token is gone / already exhausted / revoked / expired. Callers must
     *  re-check the conditions they care about against the returned record. */
    incrementInvitationTokenUseCount(id: string): InvitationTokenRecord | undefined {
        const existing = this.invitationTokens.get(id);
        if (!existing) return undefined;
        if (existing.revokedAt) return undefined;
        if (!existing.unlimited && existing.useCount >= existing.maxUses) return undefined;
        const updated: InvitationTokenRecord = { ...existing, useCount: existing.useCount + 1 };
        this.invitationTokens.set(id, updated);
        return updated;
    }

    revokeInvitationToken(id: string, reason: string): InvitationTokenRecord | undefined {
        const existing = this.invitationTokens.get(id);
        if (!existing) return undefined;
        if (existing.revokedAt) return existing;
        const updated: InvitationTokenRecord = {
            ...existing,
            revokedAt: nowIso(),
            revokedReason: reason,
        };
        this.invitationTokens.set(id, updated);
        return updated;
    }

    createInvitationRedemption(
        input: Omit<InvitationRedemptionRecord, 'createdAt'>
    ): InvitationRedemptionRecord {
        const record: InvitationRedemptionRecord = { ...input, createdAt: nowIso() };
        this.invitationRedemptions.set(record.id, record);
        return record;
    }

    createBurnerIdentity(
        input: Omit<BurnerIdentityRecord, 'createdAt' | 'burnedAt'> & { burnedAt?: string | null }
    ): BurnerIdentityRecord {
        const record: BurnerIdentityRecord = {
            ...input,
            burnedAt: input.burnedAt ?? null,
            compartmentId: input.compartmentId ?? null,
            rotationEpoch: input.rotationEpoch ?? 0,
            rootKeyCommitment: input.rootKeyCommitment ?? null,
            createdAt: nowIso(),
        };
        this.burnerIdentities.set(record.id, record);
        return record;
    }

    /** Bump the alias-rotation epoch of an active burner the owner controls. */
    rotateBurnerIdentity(
        ownerUserId: string,
        burnerUserId: string
    ): BurnerIdentityRecord | undefined {
        const existing = [...this.burnerIdentities.values()].find(
            (b) => b.ownerUserId === ownerUserId && b.burnerUserId === burnerUserId && !b.burnedAt
        );
        if (!existing) return undefined;
        const updated: BurnerIdentityRecord = {
            ...existing,
            rotationEpoch: (existing.rotationEpoch ?? 0) + 1,
        };
        this.burnerIdentities.set(updated.id, updated);
        return updated;
    }

    /** Active = not yet burned. Used to enforce the per-owner active-burner cap. */
    listBurnerIdentitiesForOwner(
        ownerUserId: string,
        opts: { includeBurned?: boolean } = {}
    ): BurnerIdentityRecord[] {
        return [...this.burnerIdentities.values()]
            .filter((b) => b.ownerUserId === ownerUserId && (opts.includeBurned || !b.burnedAt))
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }

    findBurnerIdentity(
        ownerUserId: string,
        burnerUserId: string
    ): BurnerIdentityRecord | undefined {
        return [...this.burnerIdentities.values()].find(
            (b) => b.ownerUserId === ownerUserId && b.burnerUserId === burnerUserId
        );
    }

    markBurnerIdentityBurned(id: string): BurnerIdentityRecord | undefined {
        const existing = this.burnerIdentities.get(id);
        if (!existing) return undefined;
        if (existing.burnedAt) return existing;
        const updated: BurnerIdentityRecord = { ...existing, burnedAt: nowIso() };
        this.burnerIdentities.set(id, updated);
        return updated;
    }

    listInvitationRedemptionsByToken(invitationTokenId: string): InvitationRedemptionRecord[] {
        return [...this.invitationRedemptions.values()]
            .filter((r) => r.invitationTokenId === invitationTokenId)
            .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    }

    createInvitationAdmission(
        input: Omit<InvitationAdmissionRecord, 'createdAt' | 'claimedAt' | 'claimedByUserId'>
    ): InvitationAdmissionRecord {
        const record: InvitationAdmissionRecord = { ...input, createdAt: nowIso() };
        this.invitationAdmissions.set(record.id, record);
        return record;
    }

    /** The admission of `matrixUserId` on an invitation, claimed or not. */
    findInvitationAdmission(
        invitationTokenId: string,
        matrixUserId: string
    ): InvitationAdmissionRecord | undefined {
        return [...this.invitationAdmissions.values()].find(
            (a) => a.invitationTokenId === invitationTokenId && a.matrixUserId === matrixUserId
        );
    }

    /**
     * Claim an unclaimed admission for `userId`. A compare-and-set, checked and
     * written in one synchronous call, so of two claims of one admission
     * exactly one gets the claimed record back. Undefined when the admission
     * is gone or already claimed, by anyone.
     */
    claimInvitationAdmission(id: string, userId: string): InvitationAdmissionRecord | undefined {
        const existing = this.invitationAdmissions.get(id);
        if (!existing || existing.claimedByUserId) return undefined;
        const updated: InvitationAdmissionRecord = {
            ...existing,
            claimedAt: nowIso(),
            claimedByUserId: userId,
        };
        this.invitationAdmissions.set(id, updated);
        return updated;
    }

    /**
     * Account deletion: remove an account's admissions, the one it claimed and
     * any for its Matrix id that it never claimed, since each holds that
     * Matrix id. The redemption row a claim wrote stays, as every redemption
     * row does. Returns how many were removed.
     */
    deleteInvitationAdmissionsForUser(userId: string, matrixUserId?: string): number {
        let removed = 0;
        for (const [id, admission] of this.invitationAdmissions) {
            if (
                admission.claimedByUserId === userId ||
                (matrixUserId !== undefined && admission.matrixUserId === matrixUserId)
            ) {
                this.invitationAdmissions.delete(id);
                removed += 1;
            }
        }
        return removed;
    }

    /** Best-effort cascade: drop all per-user auth artifacts so a deleted user
     *  cannot retain a usable session. Shared records (messages, forum posts)
     *  are intentionally left alone — anonymization vs. preservation is a
     *  product-policy choice the caller can layer on top. */
    purgeUserAuthArtifacts(userId: string): void {
        for (const [id, record] of this.passwordResetTokens) {
            if (record.userId === userId) this.passwordResetTokens.delete(id);
        }
        for (const [id, record] of this.emailVerificationTokens) {
            if (record.userId === userId) this.emailVerificationTokens.delete(id);
        }
        for (const [id, record] of this.accountDeletionTokens) {
            if (record.userId === userId) this.accountDeletionTokens.delete(id);
        }
        for (const [id, record] of this.refreshTokens) {
            if (record.userId === userId) this.refreshTokens.delete(id);
        }
        for (const key of [...this.linkedAccounts.keys()]) {
            const record = this.linkedAccounts.get(key);
            if (record?.blackoutUserId === userId) this.linkedAccounts.delete(key);
        }
        for (const [stateHash, record] of this.pendingOAuthLinks) {
            if (record.blackoutUserId === userId) this.pendingOAuthLinks.delete(stateHash);
        }
    }

    // --- refresh tokens ---

    /**
     * Whether this store keeps a refresh token's `sessionExpiresAt` (the end of
     * a session whose length the server enforces, launch-plan B3) for as long as
     * it keeps the token. The in-memory and file stores keep whole records, so
     * always; the Postgres store only with migration 100's column (it overrides
     * this). The exchange refuses to bound a session it could not keep bounded.
     */
    persistsRefreshTokenSessionEnds(): boolean {
        return true;
    }

    createRefreshToken(input: Omit<RefreshTokenRecord, 'createdAt'>): RefreshTokenRecord {
        const record: RefreshTokenRecord = { ...input, createdAt: nowIso() };
        this.refreshTokens.set(record.id, record);
        return record;
    }

    findRefreshTokenByHash(tokenHash: string): RefreshTokenRecord | undefined {
        return [...this.refreshTokens.values()].find((t) => t.tokenHash === tokenHash);
    }

    /**
     * Atomically claim `id` for rotation: stamp replacedBy + revoke-as-rotated,
     * but ONLY if the token is still live (replacedBy unset and not revoked).
     * The get→check→set runs in a single synchronous tick with no await, so two
     * concurrent rotations of the same token cannot both observe a live row —
     * exactly one caller wins the compare-and-swap. A loser gets the row back
     * UNCHANGED (its replacedBy is NOT this caller's id), which
     * rotateRefreshToken reads as a lost race and treats as reuse. Returns
     * undefined only when the id is unknown.
     *
     * SCOPE: this serializes rotations WITHIN one process (file / memory /
     * single-instance postgres). It does NOT serialize across postgres replicas,
     * each of which holds an independent in-memory mirror — true cross-replica
     * atomicity needs a single-statement conditional UPDATE against Postgres
     * (see rotateRefreshToken).
     */
    consumeRefreshTokenForRotation(id: string, replacedBy: string): RefreshTokenRecord | undefined {
        const existing = this.refreshTokens.get(id);
        if (!existing) return undefined;
        if (existing.replacedBy || existing.revokedAt) return existing;
        const updated: RefreshTokenRecord = {
            ...existing,
            replacedBy,
            revokedAt: nowIso(),
            revokedReason: 'rotated',
        };
        this.refreshTokens.set(id, updated);
        return updated;
    }

    revokeRefreshTokenFamily(familyId: string, reason: string): number {
        const ts = nowIso();
        let revoked = 0;
        for (const [id, record] of this.refreshTokens) {
            if (record.familyId === familyId && !record.revokedAt) {
                this.refreshTokens.set(id, { ...record, revokedAt: ts, revokedReason: reason });
                revoked += 1;
            }
        }
        return revoked;
    }

    revokeRefreshTokensForUser(userId: string, reason: string): number {
        const ts = nowIso();
        let revoked = 0;
        for (const [id, record] of this.refreshTokens) {
            if (record.userId === userId && !record.revokedAt) {
                this.refreshTokens.set(id, { ...record, revokedAt: ts, revokedReason: reason });
                revoked += 1;
            }
        }
        return revoked;
    }

    // --- revoked sessions ---

    revokeSession(input: Omit<RevokedSessionRecord, 'revokedAt'>): RevokedSessionRecord {
        const record: RevokedSessionRecord = { ...input, revokedAt: nowIso() };
        this.revokedSessions.set(record.jti, record);
        return record;
    }

    isSessionRevoked(jti: string): boolean {
        const record = this.revokedSessions.get(jti);
        if (!record) return false;
        return new Date(record.expiresAt).getTime() > Date.now();
    }

    pruneExpiredRevokedSessions(now: Date = new Date()): number {
        let removed = 0;
        for (const [jti, record] of this.revokedSessions) {
            if (new Date(record.expiresAt).getTime() <= now.getTime()) {
                this.revokedSessions.delete(jti);
                removed += 1;
            }
        }
        return removed;
    }

    // Synthetic revoked-session key holding a per-user "logout everywhere"
    // cutoff. Reusing the revokedSessions table means this persists, prunes, and
    // hydrates through the exact same mechanism as per-jti revocations — no new
    // table or migration. Real jtis are random base64url and never collide.
    private userTokenCutoffJti(userId: string): string {
        return `user-token-cutoff:${userId}`;
    }

    /**
     * Invalidate every access token already issued to `userId` (a cutoff at
     * "now"). Access JWTs are stateless, so "revoke all sessions" and
     * refresh-token reuse detection call this to stop previously-minted access
     * tokens from remaining valid until their TTL. The synthetic record's
     * revokedAt IS the cutoff; it self-expires after the max access-token
     * lifetime so no token issued before it can still be presented.
     */
    revokeUserTokensBefore(userId: string, reason: string): void {
        this.revokeSession({
            jti: this.userTokenCutoffJti(userId),
            userId,
            reason,
            expiresAt: new Date(Date.now() + USER_TOKEN_CUTOFF_TTL_MS).toISOString(),
        });
    }

    /**
     * Epoch-seconds cutoff before which this user's access tokens are invalid,
     * or 0 if none is active. authMiddleware rejects any token whose `iat` is
     * below this even when its signature and `exp` are still valid.
     */
    getUserTokenRevocationCutoff(userId: string): number {
        const record = this.revokedSessions.get(this.userTokenCutoffJti(userId));
        if (!record) return 0;
        if (new Date(record.expiresAt).getTime() <= Date.now()) return 0;
        return Math.floor(new Date(record.revokedAt).getTime() / 1000);
    }

    // --- linked accounts (third-party OAuth identity links) ---

    private linkedAccountKey(userId: string, provider: LinkedAccountProvider): string {
        return `${userId}:${provider}`;
    }

    upsertLinkedAccount(
        input: Omit<LinkedAccountRecord, 'createdAt' | 'updatedAt'>
    ): LinkedAccountRecord {
        const key = this.linkedAccountKey(input.blackoutUserId, input.provider);
        const existing = this.linkedAccounts.get(key);
        const now = nowIso();
        const record: LinkedAccountRecord = existing
            ? { ...existing, ...input, createdAt: existing.createdAt, updatedAt: now }
            : { ...input, createdAt: now, updatedAt: now };
        this.linkedAccounts.set(key, record);
        return record;
    }

    getLinkedAccount(
        userId: string,
        provider: LinkedAccountProvider
    ): LinkedAccountRecord | undefined {
        return this.linkedAccounts.get(this.linkedAccountKey(userId, provider));
    }

    listLinkedAccountsForUser(userId: string): LinkedAccountRecord[] {
        return [...this.linkedAccounts.values()].filter((row) => row.blackoutUserId === userId);
    }

    /** Used by polling-style schedulers (Streamlabs sync, YouTube live chat) to walk every link. */
    listAllLinkedAccountsForProvider(provider: LinkedAccountProvider): LinkedAccountRecord[] {
        return [...this.linkedAccounts.values()].filter((row) => row.provider === provider);
    }

    deleteLinkedAccount(userId: string, provider: LinkedAccountProvider): boolean {
        return this.linkedAccounts.delete(this.linkedAccountKey(userId, provider));
    }

    /**
     * Persist a per-link sync cursor (e.g. Streamlabs donation_id, YouTube
     * pageToken). No-op when there is no link for the (user, provider).
     */
    setLinkedAccountSyncCursor(
        userId: string,
        provider: LinkedAccountProvider,
        cursor: string | undefined
    ): LinkedAccountRecord | undefined {
        const key = this.linkedAccountKey(userId, provider);
        const existing = this.linkedAccounts.get(key);
        if (!existing) return undefined;
        const updated: LinkedAccountRecord = {
            ...existing,
            syncCursor: cursor,
            updatedAt: nowIso(),
        };
        this.linkedAccounts.set(key, updated);
        return updated;
    }

    // --- pending OAuth link state (PKCE + CSRF) ---

    createPendingOAuthLink(
        input: Omit<PendingOAuthLinkRecord, 'createdAt'>
    ): PendingOAuthLinkRecord {
        const record: PendingOAuthLinkRecord = { ...input, createdAt: nowIso() };
        this.pendingOAuthLinks.set(record.stateHash, record);
        return record;
    }

    consumePendingOAuthLink(stateHash: string): PendingOAuthLinkRecord | undefined {
        const existing = this.pendingOAuthLinks.get(stateHash);
        if (!existing) return undefined;
        if (existing.consumedAt) return undefined;
        if (new Date(existing.expiresAt).getTime() <= Date.now()) return undefined;
        const updated: PendingOAuthLinkRecord = { ...existing, consumedAt: nowIso() };
        this.pendingOAuthLinks.set(stateHash, updated);
        return updated;
    }

    prunePendingOAuthLinks(now: Date = new Date()): number {
        let removed = 0;
        for (const [hash, record] of this.pendingOAuthLinks) {
            if (new Date(record.expiresAt).getTime() <= now.getTime()) {
                this.pendingOAuthLinks.delete(hash);
                removed += 1;
            }
        }
        return removed;
    }

    // --- native-OIDC login state (W2, /v1/auth/oidc/*) ---

    createPendingOidcLogin(
        input: Omit<PendingOidcLoginRecord, 'createdAt'>
    ): PendingOidcLoginRecord {
        const record: PendingOidcLoginRecord = { ...input, createdAt: nowIso() };
        this.pendingOidcLogins.set(record.stateHash, record);
        return record;
    }

    /** Single-use: a consumed or expired row is never returned again. */
    consumePendingOidcLogin(stateHash: string): PendingOidcLoginRecord | undefined {
        const existing = this.pendingOidcLogins.get(stateHash);
        if (!existing) return undefined;
        if (existing.consumedAt) return undefined;
        if (new Date(existing.expiresAt).getTime() <= Date.now()) return undefined;
        const updated: PendingOidcLoginRecord = { ...existing, consumedAt: nowIso() };
        this.pendingOidcLogins.set(stateHash, updated);
        return updated;
    }

    prunePendingOidcLogins(now: Date = new Date()): number {
        let removed = 0;
        for (const [hash, record] of this.pendingOidcLogins) {
            if (new Date(record.expiresAt).getTime() <= now.getTime()) {
                this.pendingOidcLogins.delete(hash);
                removed += 1;
            }
        }
        return removed;
    }

    // --- twitch chat bridges (Phase 1 / Track A) ---

    createTwitchChatBridge(
        input: Omit<TwitchChatBridgeRecord, 'createdAt' | 'updatedAt'>
    ): TwitchChatBridgeRecord {
        const now = nowIso();
        const record: TwitchChatBridgeRecord = { ...input, createdAt: now, updatedAt: now };
        this.twitchChatBridges.set(record.id, record);
        return record;
    }

    getTwitchChatBridge(id: string): TwitchChatBridgeRecord | undefined {
        return this.twitchChatBridges.get(id);
    }

    findTwitchChatBridge(
        blackoutUserId: string,
        twitchChannel: string
    ): TwitchChatBridgeRecord | undefined {
        const ch = twitchChannel.toLowerCase();
        return [...this.twitchChatBridges.values()].find(
            (row) => row.blackoutUserId === blackoutUserId && row.twitchChannel === ch
        );
    }

    listTwitchChatBridgesForUser(blackoutUserId: string): TwitchChatBridgeRecord[] {
        return [...this.twitchChatBridges.values()].filter(
            (row) => row.blackoutUserId === blackoutUserId
        );
    }

    listActiveTwitchChatBridges(): TwitchChatBridgeRecord[] {
        return [...this.twitchChatBridges.values()].filter((row) => row.isActive);
    }

    updateTwitchChatBridge(
        id: string,
        patch: Partial<Omit<TwitchChatBridgeRecord, 'id' | 'createdAt'>>
    ): TwitchChatBridgeRecord | undefined {
        const existing = this.twitchChatBridges.get(id);
        if (!existing) return undefined;
        const updated: TwitchChatBridgeRecord = { ...existing, ...patch, updatedAt: nowIso() };
        this.twitchChatBridges.set(id, updated);
        return updated;
    }

    deleteTwitchChatBridge(id: string): boolean {
        return this.twitchChatBridges.delete(id);
    }

    // --- twitch eventsub subscriptions ---

    createTwitchEventSubscription(
        input: Omit<TwitchEventSubscriptionRecord, 'createdAt' | 'updatedAt'>
    ): TwitchEventSubscriptionRecord {
        const now = nowIso();
        const record: TwitchEventSubscriptionRecord = { ...input, createdAt: now, updatedAt: now };
        this.twitchEventSubscriptions.set(record.helixSubscriptionId, record);
        return record;
    }

    getTwitchEventSubscriptionByHelixId(
        helixId: string
    ): TwitchEventSubscriptionRecord | undefined {
        return this.twitchEventSubscriptions.get(helixId);
    }

    listTwitchEventSubscriptionsForChannel(
        blackoutUserId: string,
        twitchUserId: string
    ): TwitchEventSubscriptionRecord[] {
        return [...this.twitchEventSubscriptions.values()].filter(
            (row) => row.blackoutUserId === blackoutUserId && row.twitchUserId === twitchUserId
        );
    }

    updateTwitchEventSubscriptionStatus(
        helixId: string,
        status: string
    ): TwitchEventSubscriptionRecord | undefined {
        const existing = this.twitchEventSubscriptions.get(helixId);
        if (!existing) return undefined;
        const updated: TwitchEventSubscriptionRecord = {
            ...existing,
            status,
            updatedAt: nowIso(),
        };
        this.twitchEventSubscriptions.set(helixId, updated);
        return updated;
    }

    deleteTwitchEventSubscription(helixId: string): boolean {
        return this.twitchEventSubscriptions.delete(helixId);
    }

    // --- widget alert tokens (Phase 1 / Track A) ---

    createWidgetAlertToken(
        input: Omit<WidgetAlertTokenRecord, 'createdAt'>
    ): WidgetAlertTokenRecord {
        const record: WidgetAlertTokenRecord = { ...input, createdAt: nowIso() };
        this.widgetAlertTokens.set(record.secretHash, record);
        return record;
    }

    getWidgetAlertTokenById(id: string): WidgetAlertTokenRecord | undefined {
        return [...this.widgetAlertTokens.values()].find((row) => row.id === id);
    }

    /** Returns the active (non-revoked) token matching the bearer hash, or undefined. */
    findActiveWidgetAlertTokenByHash(secretHash: string): WidgetAlertTokenRecord | undefined {
        const row = this.widgetAlertTokens.get(secretHash);
        if (!row || row.revokedAt) return undefined;
        return row;
    }

    listWidgetAlertTokensForUser(blackoutUserId: string): WidgetAlertTokenRecord[] {
        return [...this.widgetAlertTokens.values()].filter(
            (row) => row.blackoutUserId === blackoutUserId
        );
    }

    revokeWidgetAlertToken(id: string, reason: string): WidgetAlertTokenRecord | undefined {
        const existing = this.getWidgetAlertTokenById(id);
        if (!existing || existing.revokedAt) return undefined;
        const updated: WidgetAlertTokenRecord = {
            ...existing,
            revokedAt: nowIso(),
            revokedReason: reason,
        };
        this.widgetAlertTokens.set(updated.secretHash, updated);
        return updated;
    }

    touchWidgetAlertTokenDelivered(secretHash: string): WidgetAlertTokenRecord | undefined {
        const existing = this.widgetAlertTokens.get(secretHash);
        if (!existing) return undefined;
        const updated: WidgetAlertTokenRecord = {
            ...existing,
            lastDeliveredAt: nowIso(),
        };
        this.widgetAlertTokens.set(secretHash, updated);
        return updated;
    }

    // --- youtube chat bridges (Phase 1 / Track A) ---

    createYoutubeChatBridge(
        input: Omit<YoutubeChatBridgeRecord, 'createdAt' | 'updatedAt'>
    ): YoutubeChatBridgeRecord {
        const now = nowIso();
        const record: YoutubeChatBridgeRecord = { ...input, createdAt: now, updatedAt: now };
        this.youtubeChatBridges.set(record.id, record);
        return record;
    }

    getYoutubeChatBridge(id: string): YoutubeChatBridgeRecord | undefined {
        return this.youtubeChatBridges.get(id);
    }

    findYoutubeChatBridge(
        blackoutUserId: string,
        youtubeChannelId: string
    ): YoutubeChatBridgeRecord | undefined {
        return [...this.youtubeChatBridges.values()].find(
            (row) =>
                row.blackoutUserId === blackoutUserId && row.youtubeChannelId === youtubeChannelId
        );
    }

    listYoutubeChatBridgesForUser(blackoutUserId: string): YoutubeChatBridgeRecord[] {
        return [...this.youtubeChatBridges.values()].filter(
            (row) => row.blackoutUserId === blackoutUserId
        );
    }

    listActiveYoutubeChatBridges(): YoutubeChatBridgeRecord[] {
        return [...this.youtubeChatBridges.values()].filter((row) => row.isActive);
    }

    updateYoutubeChatBridge(
        id: string,
        patch: Partial<Omit<YoutubeChatBridgeRecord, 'id' | 'createdAt'>>
    ): YoutubeChatBridgeRecord | undefined {
        const existing = this.youtubeChatBridges.get(id);
        if (!existing) return undefined;
        const updated: YoutubeChatBridgeRecord = { ...existing, ...patch, updatedAt: nowIso() };
        this.youtubeChatBridges.set(id, updated);
        return updated;
    }

    deleteYoutubeChatBridge(id: string): boolean {
        return this.youtubeChatBridges.delete(id);
    }

    // --- kick chat bridges (Phase 1 / Track A) ---

    createKickChatBridge(
        input: Omit<KickChatBridgeRecord, 'createdAt' | 'updatedAt'>
    ): KickChatBridgeRecord {
        const now = nowIso();
        const record: KickChatBridgeRecord = { ...input, createdAt: now, updatedAt: now };
        this.kickChatBridges.set(record.id, record);
        return record;
    }

    getKickChatBridge(id: string): KickChatBridgeRecord | undefined {
        return this.kickChatBridges.get(id);
    }

    findKickChatBridge(
        blackoutUserId: string,
        kickChatroomId: string
    ): KickChatBridgeRecord | undefined {
        return [...this.kickChatBridges.values()].find(
            (row) => row.blackoutUserId === blackoutUserId && row.kickChatroomId === kickChatroomId
        );
    }

    listKickChatBridgesForUser(blackoutUserId: string): KickChatBridgeRecord[] {
        return [...this.kickChatBridges.values()].filter(
            (row) => row.blackoutUserId === blackoutUserId
        );
    }

    listActiveKickChatBridges(): KickChatBridgeRecord[] {
        return [...this.kickChatBridges.values()].filter((row) => row.isActive);
    }

    updateKickChatBridge(
        id: string,
        patch: Partial<Omit<KickChatBridgeRecord, 'id' | 'createdAt'>>
    ): KickChatBridgeRecord | undefined {
        const existing = this.kickChatBridges.get(id);
        if (!existing) return undefined;
        const updated: KickChatBridgeRecord = { ...existing, ...patch, updatedAt: nowIso() };
        this.kickChatBridges.set(id, updated);
        return updated;
    }

    deleteKickChatBridge(id: string): boolean {
        return this.kickChatBridges.delete(id);
    }

    // --- migration hub: discord server imports ---

    createDiscordServerImport(
        input: Omit<DiscordServerImportRecord, 'createdAt' | 'updatedAt'>
    ): DiscordServerImportRecord {
        const now = nowIso();
        const record: DiscordServerImportRecord = { ...input, createdAt: now, updatedAt: now };
        this.discordServerImports.set(record.id, record);
        return record;
    }

    getDiscordServerImport(id: string): DiscordServerImportRecord | undefined {
        return this.discordServerImports.get(id);
    }

    findDiscordServerImport(
        blackoutUserId: string,
        discordGuildId: string
    ): DiscordServerImportRecord | undefined {
        return [...this.discordServerImports.values()].find(
            (row) => row.blackoutUserId === blackoutUserId && row.discordGuildId === discordGuildId
        );
    }

    listDiscordServerImportsForUser(blackoutUserId: string): DiscordServerImportRecord[] {
        return [...this.discordServerImports.values()].filter(
            (row) => row.blackoutUserId === blackoutUserId
        );
    }

    updateDiscordServerImport(
        id: string,
        patch: Partial<Omit<DiscordServerImportRecord, 'id' | 'createdAt'>>
    ): DiscordServerImportRecord | undefined {
        const existing = this.discordServerImports.get(id);
        if (!existing) return undefined;
        const updated: DiscordServerImportRecord = { ...existing, ...patch, updatedAt: nowIso() };
        this.discordServerImports.set(id, updated);
        return updated;
    }

    createDiscordImportMapping(
        input: Omit<DiscordImportMappingRecord, 'createdAt'>
    ): DiscordImportMappingRecord {
        const record: DiscordImportMappingRecord = { ...input, createdAt: nowIso() };
        this.discordImportMappings.set(record.id, record);
        return record;
    }

    listDiscordImportMappings(importId: string): DiscordImportMappingRecord[] {
        return [...this.discordImportMappings.values()].filter((row) => row.importId === importId);
    }

    findDiscordImportMapping(
        importId: string,
        discordObjectId: string
    ): DiscordImportMappingRecord | undefined {
        return [...this.discordImportMappings.values()].find(
            (row) => row.importId === importId && row.discordObjectId === discordObjectId
        );
    }

    // --- migration hub: discord bridge activations ---

    createDiscordBridgeActivation(
        input: Omit<DiscordBridgeActivationRecord, 'createdAt' | 'updatedAt'>
    ): DiscordBridgeActivationRecord {
        const now = nowIso();
        const record: DiscordBridgeActivationRecord = { ...input, createdAt: now, updatedAt: now };
        this.discordBridgeActivations.set(record.id, record);
        return record;
    }

    getDiscordBridgeActivation(id: string): DiscordBridgeActivationRecord | undefined {
        return this.discordBridgeActivations.get(id);
    }

    findDiscordBridgeActivation(
        matrixRoomId: string,
        discordChannelId: string
    ): DiscordBridgeActivationRecord | undefined {
        return [...this.discordBridgeActivations.values()].find(
            (row) => row.matrixRoomId === matrixRoomId && row.discordChannelId === discordChannelId
        );
    }

    listDiscordBridgeActivationsForUser(blackoutUserId: string): DiscordBridgeActivationRecord[] {
        return [...this.discordBridgeActivations.values()].filter(
            (row) => row.blackoutUserId === blackoutUserId
        );
    }

    updateDiscordBridgeActivation(
        id: string,
        patch: Partial<Omit<DiscordBridgeActivationRecord, 'id' | 'createdAt'>>
    ): DiscordBridgeActivationRecord | undefined {
        const existing = this.discordBridgeActivations.get(id);
        if (!existing) return undefined;
        const updated: DiscordBridgeActivationRecord = {
            ...existing,
            ...patch,
            updatedAt: nowIso(),
        };
        this.discordBridgeActivations.set(id, updated);
        return updated;
    }

    deleteDiscordBridgeActivation(id: string): boolean {
        return this.discordBridgeActivations.delete(id);
    }

    // --- discord-compatible incoming webhooks (Phase 2 / Track B) ---

    createDiscordCompatWebhook(
        input: Omit<DiscordCompatWebhookRecord, 'createdAt' | 'updatedAt'>
    ): DiscordCompatWebhookRecord {
        const now = nowIso();
        const record: DiscordCompatWebhookRecord = { ...input, createdAt: now, updatedAt: now };
        this.discordCompatWebhooks.set(record.id, record);
        return record;
    }

    getDiscordCompatWebhook(id: string): DiscordCompatWebhookRecord | undefined {
        return this.discordCompatWebhooks.get(id);
    }

    listDiscordCompatWebhooksForUser(blackoutUserId: string): DiscordCompatWebhookRecord[] {
        return [...this.discordCompatWebhooks.values()].filter(
            (row) => row.blackoutUserId === blackoutUserId
        );
    }

    updateDiscordCompatWebhook(
        id: string,
        patch: Partial<Omit<DiscordCompatWebhookRecord, 'id' | 'createdAt'>>
    ): DiscordCompatWebhookRecord | undefined {
        const existing = this.discordCompatWebhooks.get(id);
        if (!existing) return undefined;
        const updated: DiscordCompatWebhookRecord = { ...existing, ...patch, updatedAt: nowIso() };
        this.discordCompatWebhooks.set(id, updated);
        return updated;
    }

    deleteDiscordCompatWebhook(id: string): boolean {
        return this.discordCompatWebhooks.delete(id);
    }

    // --- outbound event webhooks (Phase 2 / Track B) ---

    createOutboundEventWebhook(
        input: Omit<OutboundEventWebhookRecord, 'createdAt' | 'updatedAt'>
    ): OutboundEventWebhookRecord {
        const now = nowIso();
        const record: OutboundEventWebhookRecord = { ...input, createdAt: now, updatedAt: now };
        this.outboundEventWebhooks.set(record.id, record);
        return record;
    }

    getOutboundEventWebhook(id: string): OutboundEventWebhookRecord | undefined {
        return this.outboundEventWebhooks.get(id);
    }

    listOutboundEventWebhooksForUser(blackoutUserId: string): OutboundEventWebhookRecord[] {
        return [...this.outboundEventWebhooks.values()].filter(
            (row) => row.blackoutUserId === blackoutUserId
        );
    }

    /** All active subscriptions across all users — the delivery loop iterates this. */
    listActiveOutboundEventWebhooks(): OutboundEventWebhookRecord[] {
        return [...this.outboundEventWebhooks.values()].filter((row) => row.isActive);
    }

    updateOutboundEventWebhook(
        id: string,
        patch: Partial<Omit<OutboundEventWebhookRecord, 'id' | 'createdAt'>>
    ): OutboundEventWebhookRecord | undefined {
        const existing = this.outboundEventWebhooks.get(id);
        if (!existing) return undefined;
        const updated: OutboundEventWebhookRecord = { ...existing, ...patch, updatedAt: nowIso() };
        this.outboundEventWebhooks.set(id, updated);
        return updated;
    }

    deleteOutboundEventWebhook(id: string): boolean {
        return this.outboundEventWebhooks.delete(id);
    }

    // --- twitch irc bot tokens (Phase 2 / Track B) ---

    createTwitchIrcBotToken(
        input: Omit<TwitchIrcBotTokenRecord, 'createdAt' | 'updatedAt'>
    ): TwitchIrcBotTokenRecord {
        const now = nowIso();
        const record: TwitchIrcBotTokenRecord = { ...input, createdAt: now, updatedAt: now };
        this.twitchIrcBotTokens.set(record.id, record);
        return record;
    }

    getTwitchIrcBotToken(id: string): TwitchIrcBotTokenRecord | undefined {
        return this.twitchIrcBotTokens.get(id);
    }

    /** Used by the connection authenticator to verify a presented PASS. */
    findActiveTwitchIrcBotTokenByHash(secretHash: string): TwitchIrcBotTokenRecord | undefined {
        return [...this.twitchIrcBotTokens.values()].find(
            (row) => row.isActive && row.secretHash === secretHash
        );
    }

    listTwitchIrcBotTokensForUser(blackoutUserId: string): TwitchIrcBotTokenRecord[] {
        return [...this.twitchIrcBotTokens.values()].filter(
            (row) => row.blackoutUserId === blackoutUserId
        );
    }

    revokeTwitchIrcBotToken(id: string, reason: string): TwitchIrcBotTokenRecord | undefined {
        const existing = this.twitchIrcBotTokens.get(id);
        if (!existing) return undefined;
        const updated: TwitchIrcBotTokenRecord = {
            ...existing,
            isActive: false,
            revokedAt: nowIso(),
            revokeReason: reason,
            updatedAt: nowIso(),
        };
        this.twitchIrcBotTokens.set(id, updated);
        return updated;
    }

    /**
     * Bump diagnostics on a successful authenticated bot connection. Bumps
     * are in-memory-only on the file-backed db (touching the JSON store on
     * every IRC auth would be a write amplification bomb).
     */
    touchTwitchIrcBotTokenUsed(id: string): void {
        const existing = this.twitchIrcBotTokens.get(id);
        if (!existing) return;
        this.twitchIrcBotTokens.set(id, {
            ...existing,
            lastUsedAt: nowIso(),
            useCount: existing.useCount + 1,
        });
    }

    deleteTwitchIrcBotToken(id: string): boolean {
        return this.twitchIrcBotTokens.delete(id);
    }

    // --- obs-ws passwords (Phase 3 / Track B) ---

    createObsWsPassword(
        input: Omit<ObsWsPasswordRecord, 'createdAt' | 'updatedAt'>
    ): ObsWsPasswordRecord {
        const now = nowIso();
        const record: ObsWsPasswordRecord = { ...input, createdAt: now, updatedAt: now };
        this.obsWsPasswords.set(record.id, record);
        return record;
    }

    getObsWsPassword(id: string): ObsWsPasswordRecord | undefined {
        return this.obsWsPasswords.get(id);
    }

    /**
     * Used by the OBS-WS shim's URL-based authenticator. Only returns the
     * row if it's still active so revocation takes effect immediately.
     */
    getActiveObsWsPassword(id: string): ObsWsPasswordRecord | undefined {
        const row = this.obsWsPasswords.get(id);
        return row && row.isActive ? row : undefined;
    }

    listObsWsPasswordsForUser(blackoutUserId: string): ObsWsPasswordRecord[] {
        return [...this.obsWsPasswords.values()].filter(
            (row) => row.blackoutUserId === blackoutUserId
        );
    }

    revokeObsWsPassword(id: string, reason: string): ObsWsPasswordRecord | undefined {
        const existing = this.obsWsPasswords.get(id);
        if (!existing) return undefined;
        const updated: ObsWsPasswordRecord = {
            ...existing,
            isActive: false,
            revokedAt: nowIso(),
            revokeReason: reason,
            updatedAt: nowIso(),
        };
        this.obsWsPasswords.set(id, updated);
        return updated;
    }

    /**
     * Bump diagnostics on a successful authenticated OBS-WS connection.
     * In-memory only on the file-backed db (write amplification on every
     * connection would thrash the JSON store).
     */
    touchObsWsPasswordUsed(id: string): void {
        const existing = this.obsWsPasswords.get(id);
        if (!existing) return;
        this.obsWsPasswords.set(id, {
            ...existing,
            lastUsedAt: nowIso(),
            useCount: existing.useCount + 1,
        });
    }

    deleteObsWsPassword(id: string): boolean {
        return this.obsWsPasswords.delete(id);
    }

    // --- twitch extension panels (extension registry) ---

    createTwitchExtensionPanel(
        input: Omit<TwitchExtensionPanelRecord, 'createdAt' | 'updatedAt'>
    ): TwitchExtensionPanelRecord {
        const now = nowIso();
        const record: TwitchExtensionPanelRecord = { ...input, createdAt: now, updatedAt: now };
        this.twitchExtensionPanels.set(record.id, record);
        return record;
    }

    getTwitchExtensionPanel(id: string): TwitchExtensionPanelRecord | undefined {
        return this.twitchExtensionPanels.get(id);
    }

    listTwitchExtensionPanelsForCreator(creatorId: string): TwitchExtensionPanelRecord[] {
        return [...this.twitchExtensionPanels.values()].filter(
            (row) => row.creatorId === creatorId
        );
    }

    updateTwitchExtensionPanel(
        id: string,
        patch: Partial<
            Pick<TwitchExtensionPanelRecord, 'label' | 'bundleUrl' | 'capabilities' | 'isActive'>
        >
    ): TwitchExtensionPanelRecord | undefined {
        const existing = this.twitchExtensionPanels.get(id);
        if (!existing) return undefined;
        const updated: TwitchExtensionPanelRecord = { ...existing, ...patch, updatedAt: nowIso() };
        this.twitchExtensionPanels.set(id, updated);
        return updated;
    }

    deleteTwitchExtensionPanel(id: string): boolean {
        return this.twitchExtensionPanels.delete(id);
    }

    // --- creator listings (marketplace seller catalog) ---

    createCreatorListing(
        input: Omit<CreatorListingRecord, 'createdAt' | 'updatedAt'>
    ): CreatorListingRecord {
        const now = nowIso();
        const record: CreatorListingRecord = { ...input, createdAt: now, updatedAt: now };
        this.creatorListings.set(record.id, record);
        return record;
    }

    getCreatorListing(id: string): CreatorListingRecord | undefined {
        return this.creatorListings.get(id);
    }

    listCreatorListingsForSeller(sellerUserId: string): CreatorListingRecord[] {
        return [...this.creatorListings.values()].filter(
            (row) => row.sellerUserId === sellerUserId
        );
    }

    updateCreatorListing(
        id: string,
        patch: Partial<
            Pick<
                CreatorListingRecord,
                'status' | 'providerListingId' | 'publicSlug' | 'publishedAt'
            >
        >
    ): CreatorListingRecord | undefined {
        const existing = this.creatorListings.get(id);
        if (!existing) return undefined;
        const updated: CreatorListingRecord = { ...existing, ...patch, updatedAt: nowIso() };
        this.creatorListings.set(id, updated);
        return updated;
    }

    deleteCreatorListing(id: string): boolean {
        return this.creatorListings.delete(id);
    }

    // --- vault items (encrypted personal vault) ---

    createVaultItem(input: Omit<VaultItemRecord, 'createdAt' | 'updatedAt'>): VaultItemRecord {
        const now = nowIso();
        const record: VaultItemRecord = { ...input, createdAt: now, updatedAt: now };
        this.vaultItems.set(record.id, record);
        return record;
    }

    getVaultItem(id: string): VaultItemRecord | undefined {
        return this.vaultItems.get(id);
    }

    listVaultItemsForOwner(ownerUserId: string): VaultItemRecord[] {
        return [...this.vaultItems.values()].filter((row) => row.ownerUserId === ownerUserId);
    }

    updateVaultItem(
        id: string,
        patch: Partial<Pick<VaultItemRecord, 'label' | 'ciphertext' | 'iv' | 'algo'>>
    ): VaultItemRecord | undefined {
        const existing = this.vaultItems.get(id);
        if (!existing) return undefined;
        const updated: VaultItemRecord = { ...existing, ...patch, updatedAt: nowIso() };
        this.vaultItems.set(id, updated);
        return updated;
    }

    deleteVaultItem(id: string): boolean {
        return this.vaultItems.delete(id);
    }

    // --- channel points (engagement economy) ---

    createChannelPointsReward(
        input: Omit<ChannelPointsRewardRecord, 'createdAt' | 'updatedAt'>
    ): ChannelPointsRewardRecord {
        const now = nowIso();
        const record: ChannelPointsRewardRecord = { ...input, createdAt: now, updatedAt: now };
        this.channelPointsRewards.set(record.id, record);
        return record;
    }

    getChannelPointsReward(id: string): ChannelPointsRewardRecord | undefined {
        return this.channelPointsRewards.get(id);
    }

    listChannelPointsRewardsForCreator(creatorId: string): ChannelPointsRewardRecord[] {
        return [...this.channelPointsRewards.values()].filter((r) => r.creatorId === creatorId);
    }

    updateChannelPointsReward(
        id: string,
        patch: Partial<Pick<ChannelPointsRewardRecord, 'title' | 'cost' | 'prompt' | 'isActive'>>
    ): ChannelPointsRewardRecord | undefined {
        const existing = this.channelPointsRewards.get(id);
        if (!existing) return undefined;
        const updated: ChannelPointsRewardRecord = { ...existing, ...patch, updatedAt: nowIso() };
        this.channelPointsRewards.set(id, updated);
        return updated;
    }

    deleteChannelPointsReward(id: string): boolean {
        return this.channelPointsRewards.delete(id);
    }

    appendChannelPointsLedger(
        input: Omit<ChannelPointsLedgerRecord, 'createdAt'>
    ): ChannelPointsLedgerRecord {
        const record: ChannelPointsLedgerRecord = { ...input, createdAt: nowIso() };
        this.channelPointsLedger.set(record.id, record);
        return record;
    }

    /** Sum of ledger deltas for a (channel, viewer) pair = current balance. */
    getChannelPointsBalance(channelId: string, userId: string): number {
        let balance = 0;
        for (const row of this.channelPointsLedger.values()) {
            if (row.channelId === channelId && row.userId === userId) balance += row.pointsDelta;
        }
        return balance;
    }

    /** Redemption history for a channel (negative `redeem` entries), newest first. */
    listChannelPointsRedemptions(channelId: string, limit = 100): ChannelPointsLedgerRecord[] {
        return [...this.channelPointsLedger.values()]
            .filter((row) => row.channelId === channelId && row.reason === 'redeem')
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
            .slice(0, limit);
    }

    // --- simulcast destinations (Phase 1 / Track A) ---

    createSimulcastDestination(
        input: Omit<SimulcastDestinationRecord, 'createdAt' | 'updatedAt'>
    ): SimulcastDestinationRecord {
        const now = nowIso();
        const record: SimulcastDestinationRecord = { ...input, createdAt: now, updatedAt: now };
        this.simulcastDestinations.set(record.id, record);
        return record;
    }

    getSimulcastDestination(id: string): SimulcastDestinationRecord | undefined {
        return this.simulcastDestinations.get(id);
    }

    listSimulcastDestinationsForUser(blackoutUserId: string): SimulcastDestinationRecord[] {
        return [...this.simulcastDestinations.values()].filter(
            (row) => row.blackoutUserId === blackoutUserId
        );
    }

    listEnabledSimulcastDestinations(): SimulcastDestinationRecord[] {
        return [...this.simulcastDestinations.values()].filter((row) => row.isEnabled);
    }

    updateSimulcastDestination(
        id: string,
        patch: Partial<Omit<SimulcastDestinationRecord, 'id' | 'createdAt'>>
    ): SimulcastDestinationRecord | undefined {
        const existing = this.simulcastDestinations.get(id);
        if (!existing) return undefined;
        const updated: SimulcastDestinationRecord = {
            ...existing,
            ...patch,
            updatedAt: nowIso(),
        };
        this.simulcastDestinations.set(id, updated);
        return updated;
    }

    deleteSimulcastDestination(id: string): boolean {
        return this.simulcastDestinations.delete(id);
    }

    upsertCanopyDirectoryEntry(
        input: Omit<CanopyDirectoryEntryRecord, 'indexedAt'>
    ): CanopyDirectoryEntryRecord {
        const record: CanopyDirectoryEntryRecord = { ...input, indexedAt: nowIso() };
        this.canopyDirectoryEntries.set(record.canopyId, record);
        return record;
    }

    getCanopyDirectoryEntry(canopyId: string): CanopyDirectoryEntryRecord | undefined {
        return this.canopyDirectoryEntries.get(canopyId);
    }

    listCanopyDirectoryEntries(): CanopyDirectoryEntryRecord[] {
        return [...this.canopyDirectoryEntries.values()];
    }

    // --- active-defense canary tokens (durable G5 state, M16) ---
    listCanaryTokens(ownerUserId: string): CanaryTokenRecord[] {
        return [...this.canaryTokens.values()]
            .filter((c) => c.ownerUserId === ownerUserId)
            .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
    }

    getCanaryTokenByToken(token: string): CanaryTokenRecord | undefined {
        return [...this.canaryTokens.values()].find((c) => c.token === token);
    }

    upsertCanaryToken(record: CanaryTokenRecord): CanaryTokenRecord {
        this.canaryTokens.set(record.id, record);
        return record;
    }

    // --- den auto-welcome ledger (BLACKOUT_DEN_GREETER; one greet per join) ---
    private static denGreetingKey(roomId: string, userId: string): string {
        return `${roomId}:${userId}`;
    }

    /** True once the bot has greeted `userId` in `roomId` (dedupe guard). */
    hasGreeted(roomId: string, userId: string): boolean {
        return this.denGreetings.has(InMemoryDb.denGreetingKey(roomId, userId));
    }

    /**
     * Record that `userId` was greeted in `roomId`. Idempotent on the
     * `(roomId, userId)` pair: a repeat call returns the first record without
     * moving its timestamp, so a re-greet never happens.
     */
    markGreeted(roomId: string, userId: string): DenGreetingRecord {
        const key = InMemoryDb.denGreetingKey(roomId, userId);
        const existing = this.denGreetings.get(key);
        if (existing) return existing;
        const record: DenGreetingRecord = { roomId, userId, greetedAt: nowIso() };
        this.denGreetings.set(key, record);
        return record;
    }

    // --- Canopy subscription billing (durable; was module-level Maps in
    // services/subscriptions.ts, wiped on every restart) ---
    getCanopySubscription(userId: string): CanopySubscriptionRecord | undefined {
        return this.canopySubscriptions.get(userId);
    }

    upsertCanopySubscription(record: CanopySubscriptionRecord): CanopySubscriptionRecord {
        this.canopySubscriptions.set(record.userId, record);
        return record;
    }

    addSubscriptionAuditEvent(record: SubscriptionAuditEventRecord): SubscriptionAuditEventRecord {
        this.subscriptionAuditEvents.set(record.id, record);
        return record;
    }

    /** Insertion-ordered (callers sort by occurredAt; stable sort keeps write order for ties). */
    listSubscriptionAuditEventsByUser(userId: string): SubscriptionAuditEventRecord[] {
        return [...this.subscriptionAuditEvents.values()].filter((e) => e.userId === userId);
    }

    hasProcessedBillingWebhookEvent(eventId: string): boolean {
        return this.processedBillingWebhookEvents.has(eventId);
    }

    markBillingWebhookEventProcessed(eventId: string): ProcessedBillingWebhookEventRecord {
        const existing = this.processedBillingWebhookEvents.get(eventId);
        if (existing) return existing;
        const record: ProcessedBillingWebhookEventRecord = { eventId, processedAt: nowIso() };
        this.processedBillingWebhookEvents.set(eventId, record);
        return record;
    }

    getSubscriptionGift(id: string): SubscriptionGiftRecord | undefined {
        return this.subscriptionGifts.get(id);
    }

    listSubscriptionGifts(): SubscriptionGiftRecord[] {
        return [...this.subscriptionGifts.values()];
    }

    upsertSubscriptionGift(record: SubscriptionGiftRecord): SubscriptionGiftRecord {
        this.subscriptionGifts.set(record.id, record);
        return record;
    }

    resetCanopyBillingForTest(): void {
        this.canopySubscriptions.clear();
        this.subscriptionAuditEvents.clear();
        this.processedBillingWebhookEvents.clear();
        this.subscriptionGifts.clear();
    }

    // --- mesh relay store-and-forward (durable, M17) ---
    listMeshEnvelopes(): MeshEnvelope[] {
        return [...this.meshEnvelopes.values()];
    }

    meshEnvelopeCount(): number {
        return this.meshEnvelopes.size;
    }

    /**
     * Append an envelope, evicting the oldest beyond MESH_MAX_STORE (Map keeps
     * insertion order — newest-wins, matching the old slice(-MAX_STORE)).
     */
    enqueueMeshEnvelope(env: MeshEnvelope): MeshEnvelope {
        this.meshEnvelopes.set(env.id, env);
        while (this.meshEnvelopes.size > MESH_MAX_STORE) {
            const oldest = this.meshEnvelopes.keys().next().value as string;
            this.meshEnvelopes.delete(oldest);
        }
        return env;
    }

    /** Replace the whole envelope set with a gossip-merge result (uncapped — preserves current sync behavior). */
    replaceMeshEnvelopes(envelopes: readonly MeshEnvelope[]): void {
        this.meshEnvelopes = new Map(envelopes.map((e) => [e.id, e]));
    }

    resetMeshEnvelopesForTest(): void {
        this.meshEnvelopes.clear();
    }

    createMessage(input: Omit<MessageRecord, 'createdAt'>): MessageRecord {
        const record: MessageRecord = { ...input, createdAt: nowIso() };
        this.messages.set(record.id, record);
        return record;
    }

    getMessages(channelId: string, limit = 50, before?: string): MessageRecord[] {
        const sorted = [...this.messages.values()]
            .filter((msg) => msg.channelId === channelId)
            .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));

        const filtered = before ? sorted.filter((msg) => msg.createdAt < before) : sorted;
        return filtered.slice(-limit);
    }

    createScheduledMessage(
        input: Omit<
            ScheduledMessageRecord,
            'createdAt' | 'status' | 'attempts' | 'deliveredAt' | 'lastError'
        >
    ): ScheduledMessageRecord {
        const record: ScheduledMessageRecord = {
            ...input,
            status: 'pending',
            attempts: 0,
            createdAt: nowIso(),
        };
        this.scheduledMessages.set(record.id, record);
        return record;
    }

    getScheduledMessage(id: string): ScheduledMessageRecord | undefined {
        return this.scheduledMessages.get(id);
    }

    listPendingScheduledMessagesForUser(userId: string): ScheduledMessageRecord[] {
        return [...this.scheduledMessages.values()]
            .filter((msg) => msg.userId === userId && msg.status === 'pending')
            .sort((a, b) => (a.deliverAt < b.deliverAt ? -1 : 1));
    }

    /** Every scheduled message of a user, in any status (export, erasure). */
    listScheduledMessagesForUser(userId: string): ScheduledMessageRecord[] {
        if (!userId) return [];
        return [...this.scheduledMessages.values()]
            .filter((msg) => msg.userId === userId)
            .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
    }

    /** Pending messages whose deliverAt is at or before `asOf` (defaults to now). */
    listDueScheduledMessages(asOf: string = nowIso()): ScheduledMessageRecord[] {
        return [...this.scheduledMessages.values()]
            .filter((msg) => msg.status === 'pending' && msg.deliverAt <= asOf)
            .sort((a, b) => (a.deliverAt < b.deliverAt ? -1 : 1));
    }

    // Message text is kept only while a row is pending. Delivered, cancelled
    // and terminally failed rows clear `body` and `formattedBody`: nothing reads
    // them afterwards, and the API should not hold plaintext it no longer needs.
    // `formattedBody: undefined` stays an own property on purpose, so the
    // Postgres write-through (which writes only the fields a record has) sets
    // the column to NULL instead of leaving the old text in place.

    markScheduledMessageDelivered(id: string): ScheduledMessageRecord | undefined {
        const record = this.scheduledMessages.get(id);
        if (!record) return undefined;
        const updated: ScheduledMessageRecord = {
            ...record,
            status: 'delivered',
            attempts: record.attempts + 1,
            deliveredAt: nowIso(),
            lastError: undefined,
            body: '',
            formattedBody: undefined,
        };
        this.scheduledMessages.set(id, updated);
        return updated;
    }

    /**
     * Record a failed delivery attempt. Stays `pending` (so the dispatcher
     * retries on a later tick) unless `terminal` is set, which marks it `failed`
     * and clears its text.
     */
    markScheduledMessageFailed(
        id: string,
        error: string,
        options: { terminal?: boolean } = {}
    ): ScheduledMessageRecord | undefined {
        const record = this.scheduledMessages.get(id);
        if (!record) return undefined;
        const updated: ScheduledMessageRecord = {
            ...record,
            status: options.terminal ? 'failed' : 'pending',
            attempts: record.attempts + 1,
            lastError: error,
            ...(options.terminal ? { body: '', formattedBody: undefined } : {}),
        };
        this.scheduledMessages.set(id, updated);
        return updated;
    }

    /** Cancel a still-pending scheduled message owned by `userId`, clearing its text. */
    cancelScheduledMessage(id: string, userId: string): ScheduledMessageRecord | undefined {
        const record = this.scheduledMessages.get(id);
        if (!record || record.userId !== userId || record.status !== 'pending') return undefined;
        const updated: ScheduledMessageRecord = {
            ...record,
            status: 'cancelled',
            body: '',
            formattedBody: undefined,
        };
        this.scheduledMessages.set(id, updated);
        return updated;
    }

    /**
     * Account deletion: remove a scheduled message's text and every link to its
     * author and room. A pending row is cancelled, so nothing is ever posted
     * for a deleted account. The row itself stays (status and timestamps only):
     * the write is an upsert of this one row, so it cannot touch any other row;
     * it can still overwrite a newer version of this one (last writer wins).
     */
    eraseScheduledMessage(id: string): ScheduledMessageRecord | undefined {
        const record = this.scheduledMessages.get(id);
        if (!record) return undefined;
        const updated: ScheduledMessageRecord = {
            ...record,
            userId: '',
            matrixRoomId: '',
            body: '',
            formattedBody: undefined,
            ...(record.status === 'pending'
                ? { status: 'cancelled' as const, lastError: 'author_deleted' }
                : {}),
        };
        this.scheduledMessages.set(id, updated);
        return updated;
    }

    createVote(input: Omit<VoteRecord, 'createdAt' | 'startsAt' | 'endsAt'>): VoteRecord {
        const startsAt = nowIso();
        const endsAt = new Date(Date.now() + input.durationHours * 3600 * 1000).toISOString();
        const vote: VoteRecord = {
            ...input,
            startsAt,
            endsAt,
            createdAt: startsAt,
        };
        this.votes.set(vote.id, vote);
        return vote;
    }

    getVote(voteId: string): VoteRecord | undefined {
        return this.votes.get(voteId);
    }

    castVote(input: Omit<VoteEntryRecord, 'createdAt'>): VoteEntryRecord {
        const exists = [...this.voteEntries.values()].find(
            (entry) => entry.voteId === input.voteId && entry.userId === input.userId
        );
        if (exists) {
            throw new Error('You have already voted');
        }

        const entry: VoteEntryRecord = { ...input, createdAt: nowIso() };
        this.voteEntries.set(entry.id, entry);
        return entry;
    }

    getVoteEntries(voteId: string): VoteEntryRecord[] {
        return [...this.voteEntries.values()].filter((entry) => entry.voteId === voteId);
    }

    /**
     * Transition a vote to a terminal `closed` state, capturing the winning
     * `result` and a `resolvedAt` timestamp. Idempotent: if the vote is already
     * resolved (has `resolvedAt`), the stored record is returned unchanged so a
     * repeated resolve does not re-tally or move the terminal state. Returns
     * `undefined` when the vote does not exist.
     */
    resolveVote(voteId: string, result: string | null): VoteRecord | undefined {
        const vote = this.votes.get(voteId);
        if (!vote) return undefined;
        if (vote.resolvedAt) return vote;
        const updated: VoteRecord = {
            ...vote,
            status: 'closed',
            result,
            resolvedAt: nowIso(),
        };
        this.votes.set(voteId, updated);
        return updated;
    }

    createFederationLink(input: Omit<FederationLinkRecord, 'createdAt'>): FederationLinkRecord {
        const record: FederationLinkRecord = { ...input, createdAt: nowIso() };
        this.federationLinks.set(record.id, record);
        return record;
    }

    createForumPost(input: Omit<ForumPostRecord, 'createdAt'>): ForumPostRecord {
        const record: ForumPostRecord = { ...input, createdAt: nowIso() };
        this.forumPosts.set(record.id, record);
        return record;
    }

    listForumPosts(communityId: string): ForumPostRecord[] {
        return [...this.forumPosts.values()].filter((post) => post.communityId === communityId);
    }

    createChannel(input: Omit<ChannelRecord, 'createdAt'>): ChannelRecord {
        const record: ChannelRecord = { ...input, createdAt: nowIso() };
        this.channels.set(record.id, record);
        return record;
    }

    listChannels(communityId?: string): ChannelRecord[] {
        const all = [...this.channels.values()];
        return communityId ? all.filter((channel) => channel.communityId === communityId) : all;
    }

    createDeadDrop(input: Omit<DeadDropRecord, 'createdAt' | 'openedAt'>): DeadDropRecord {
        const record: DeadDropRecord = { ...input, createdAt: nowIso() };
        this.deadDrops.set(record.id, record);
        return record;
    }

    openDeadDrop(id: string, recipientId: string): DeadDropRecord | undefined {
        const existing = this.deadDrops.get(id);
        if (!existing || existing.recipientId !== recipientId) {
            return undefined;
        }

        if (!existing.openedAt) {
            this.deadDrops.set(id, { ...existing, openedAt: nowIso() });
        }

        return this.deadDrops.get(id);
    }

    createDeadmanSwitch(
        input: Omit<DeadmanSwitchRecord, 'createdAt' | 'updatedAt'>
    ): DeadmanSwitchRecord {
        const ts = nowIso();
        const record: DeadmanSwitchRecord = { ...input, createdAt: ts, updatedAt: ts };
        this.deadmanSwitches.set(record.id, record);
        return record;
    }

    getDeadmanSwitch(id: string): DeadmanSwitchRecord | undefined {
        return this.deadmanSwitches.get(id);
    }

    /** Every switch one account owns, release and legacy: an indexed lookup, not a scan. */
    listDeadmanSwitchesForOwner(ownerId: string): DeadmanSwitchRecord[] {
        return this.deadmanSwitches.inGroup('owner', ownerId);
    }

    listDeadmanSwitchesForRecipient(recipient: string): DeadmanSwitchRecord[] {
        return [...this.deadmanSwitches.values()].filter((entry) =>
            entry.recipients.includes(recipient)
        );
    }

    listAllDeadmanSwitches(): DeadmanSwitchRecord[] {
        return [...this.deadmanSwitches.values()];
    }

    updateDeadmanSwitch(
        id: string,
        patch: Partial<Omit<DeadmanSwitchRecord, 'id' | 'createdAt'>>
    ): DeadmanSwitchRecord | undefined {
        const existing = this.deadmanSwitches.get(id);
        if (!existing) return undefined;
        const next: DeadmanSwitchRecord = { ...existing, ...patch, updatedAt: nowIso() };
        this.deadmanSwitches.set(id, next);
        return next;
    }

    setDeadmanSwitchStatus(
        id: string,
        status: DeadmanSwitchStatus
    ): DeadmanSwitchRecord | undefined {
        return this.updateDeadmanSwitch(id, { status });
    }

    /**
     * The sweep's move of one switch (into grace, into a backlog window, or
     * the trigger), applied only while the switch is still as the sweep read
     * it (`read`): the same status and the same last check-in (one another
     * process fired is `triggered`, which the sweep never moves from). The
     * updated record, or `undefined` when it is not. Here, and in the
     * file store, the mirror is the database and the sweep has just read it,
     * so it holds; the Postgres store carries the condition into the database
     * (round 9 of part 2's review: a standby whose mirror had not heard of a
     * trigger fired the switch again, and Postgres took its `releasedAt`),
     * and there refuses a trigger over a refused attempt of the owner's
     * after the last check-in while the switch has not had its backlog
     * window (decision 31; round 15: a sweep whose mirror lacked a carry
     * that had landed fired the switch and cleared the column).
     */
    async advanceDeadmanSwitch(
        id: string,
        read: Pick<DeadmanSwitchRecord, 'status' | 'lastCheckInAt'>,
        patch: Partial<
            Pick<
                DeadmanSwitchRecord,
                | 'status'
                | 'releasedAt'
                | 'releaseAt'
                | 'backlogGraceStartedAt'
                | 'ownerAttemptRefusedAt'
            >
        >
    ): Promise<DeadmanSwitchRecord | undefined> {
        const current = this.deadmanSwitches.get(id);
        if (!current || !switchStillAsRead(current, read)) return undefined;
        return this.updateDeadmanSwitch(id, patch);
    }

    /**
     * The owner's check-in or cancel of a switch, applied only while the
     * switch is still as the route read it (`read`: the same status and the
     * same last check-in), as the sweep's move is. `applied` with the
     * updated record; `refused` with the switch as it now stands (one that
     * fired is `triggered`), so the route can answer from it or apply the
     * check-in again over another check-in or the sweep's move into grace;
     * `unanswered` when the database did not answer in time, so the write
     * may or may not have landed (the Postgres store only). Here, and in the
     * file store, the mirror is the database, so it is refused only where
     * the switch changed since the read; the Postgres store carries the
     * condition into the database (round 10 of part 2's review: the API
     * process accepted a check-in after the worker's trigger had committed,
     * its full-row write set the switch back to armed while the release
     * stayed readable and its notice was sent, and the owner was told the
     * check-in had worked).
     */
    async updateDeadmanSwitchIf(
        id: string,
        read: Pick<DeadmanSwitchRecord, 'status' | 'lastCheckInAt'>,
        patch: Partial<Omit<DeadmanSwitchRecord, 'id' | 'createdAt' | 'ownerId' | 'releasedAt'>>
    ): Promise<DeadmanSwitchWriteOutcome> {
        const current = this.deadmanSwitches.get(id);
        if (!current || !switchStillAsRead(current, read)) return { kind: 'refused', current };
        const record = this.updateDeadmanSwitch(id, patch);
        return record ? { kind: 'applied', record } : { kind: 'refused', current: undefined };
    }

    /**
     * Arming a release switch: its sealed copies, then the switch, written
     * only where no switch has the id. Here, and in the file store, the
     * mirror is the database, so the rows are in it when this returns. The
     * Postgres store writes them in one statement (the switch insert-only,
     * its copies only where that insert took, over any row of the same key:
     * round 21 of part 2's review, the copies were written first, each a
     * statement of its own, and an arm whose switch the database refused
     * left them for good), deletes nothing, and answers only once the
     * database has
     * (round 11 of part 2's review: the arm was answered from the mirror
     * before its write-behind upsert ran, so a dropped write left a switch the
     * owner's list showed armed that no other process had, and in the
     * deployed layout, where the sweep runs in another process, never fired;
     * round 12: a losing arm deleted the copies the winning one's switch
     * relied on).
     */
    async armDeadmanSwitch(
        input: Omit<DeadmanSwitchRecord, 'createdAt' | 'updatedAt'>,
        copies: Array<Omit<DeadmanReleaseWrapRecord, 'createdAt' | 'updatedAt'>>
    ): Promise<DeadmanSwitchArmOutcome> {
        if (this.deadmanSwitches.has(input.id)) return { kind: 'id_taken' };
        for (const copy of copies) this.putDeadmanReleaseWrap(copy);
        return { kind: 'armed', record: this.createDeadmanSwitch(input) };
    }

    /**
     * Whether this process's conditional writes of switches stood unanswered
     * at any moment between `fromMs` and `toMs` (the Postgres store only:
     * here the mirror is the database and nothing stalls). The sweep asks it
     * for the time from a switch's due moment to now, and gives a switch the
     * backlog window instead of firing it when they did, as it does after an
     * outage of its own: while they stood, no move was made and every owner's
     * check-in on this process was refused (round 11 of part 2's review).
     */
    switchStatementsStalledBetween(_fromMs: number, _toMs: number): boolean {
        return false;
    }

    /**
     * When the owner's check-in or cancel of the switch was last refused
     * `unanswered` on this process, with the switch's last check-in as it
     * then stood, or `undefined` (the Postgres store only). The sweep in the
     * same process treats such a switch as it does one whose deadline fell in
     * an outage: the owner was alive and tried, so it gets the backlog window
     * rather than firing; a later write of the switch that applied, or a
     * check-in that landed anywhere since, clears it. The Postgres store
     * carries the note into the switch's own row (`ownerAttemptRefusedAt`,
     * decision 31), trying again on its own timer until it lands, which the
     * sweep in every process reads the same way
     * (`ownerAttemptRefusedSinceCheckIn`) and on which the database refuses
     * the trigger, and the note ends; here, and in the file store, nothing
     * is refused unanswered, and the field is read, cleared and kept like
     * any other.
     */
    ownerWriteUnansweredAt(_switchId: string): { at: string; lastCheckInAt: string } | undefined {
        return undefined;
    }

    /** Forget `ownerWriteUnansweredAt` for the switch (the sweep did, once it acted on it). */
    clearOwnerWriteUnanswered(_switchId: string): void {
        // Nothing is noted here: see the Postgres store.
    }

    /**
     * Account deletion: the owner is gone, so a switch that has not fired is
     * cancelled and what the owner put in it is removed, the payload and the
     * label. A switch that has already fired keeps its status and payload for
     * the people it named, since nothing may take a release back (cancel
     * refuses a triggered switch for the same reason); only its label goes.
     * The row stays, as an upsert like `eraseScheduledMessage`. This
     * writes the switch as the mirror has it; the deletion calls
     * `eraseDeadmanSwitchUnlessFired`, which in Postgres decides on the row
     * the database holds (round 12 of part 2's review, decision 30) and
     * never writes this whole over it (round 12's check).
     */
    eraseDeadmanSwitch(id: string): DeadmanSwitchRecord | undefined {
        const record = this.deadmanSwitches.get(id);
        if (!record) return undefined;
        const updated = erasedSwitchRecord(record);
        this.deadmanSwitches.set(id, updated);
        return updated;
    }

    /**
     * The owner's deletion of one switch, as `eraseDeadmanSwitch` describes,
     * decided on the switch the database holds, not the one this process's
     * mirror has: where the database has it fired, it is erased as fired (the
     * label goes; the status, the content, `releasedAt` and the copies stay),
     * wherever this mirror had it; where it has not, it is cancelled and
     * emptied and every held copy of it is blanked. Here, and in the file
     * store, the mirror is the database. The Postgres store makes it one call
     * in the switch's lane, a conditional statement on the switch and then,
     * where the stored row has not fired, one blanking its copies, on one
     * connection and not a transaction (round 12 of part 2's review, decision
     * 30: the deletion wrote the switch from the deleting
     * process's mirror, so on a process that had not heard of a trigger
     * another process committed it cancelled a release that had fired and
     * removed its content and copies).
     */
    async eraseDeadmanSwitchUnlessFired(id: string): Promise<DeadmanSwitchEraseOutcome> {
        const record = this.eraseDeadmanSwitch(id);
        if (!record) return { kind: 'absent' };
        if (record.status !== 'triggered') {
            for (const wrap of this.listDeadmanReleaseWraps(id)) {
                if (wrap.sealedKey === '' && wrap.signature === '') continue;
                this.eraseDeadmanReleaseWrap(wrap.switchId, wrap.recipientAccountId);
            }
        }
        return { kind: 'applied', record };
    }

    /**
     * Owners whose account deletion has begun on this process and whose last
     * statement over their switches has not yet answered
     * (`beginOwnerDeletion`, `endOwnerDeletion`): in this process's memory
     * only, a lookup on the path that fires a switch and no second table in
     * the database, so decision 32's concern does not apply.
     */
    private readonly ownerDeletionsInProgress = new Set<string>();

    /**
     * The owner's deletion has begun on this process: from before its first
     * `await` until `endOwnerDeletion`, this process's sweep starts no move of
     * the owner's switches (`deadmanSwitchErasePending`), so one whose
     * deadline falls while the deletion awaits an earlier switch's statement,
     * the owner's arms in flight or its last statement is not fired here with
     * the owner's row already gone from this mirror and then erased as fired
     * (round 14 of part 2's review; round 15: the mark ended with the
     * per-switch loop, and a switch read back armed after its erase was
     * dropped was fired here before the last statement ran). A move this
     * sweep had already sent when the deletion began is not held back: it can
     * still land, and the switch is then erased as fired. Another process's
     * sweep is not held by it either: a switch it fires in that window is
     * erased as fired, as decision 30 has it.
     */
    beginOwnerDeletion(ownerId: string): void {
        this.ownerDeletionsInProgress.add(ownerId);
    }

    /** The deletion's last statement over the owner's switches has answered (`finishAccountDeletion`), or failed. */
    endOwnerDeletion(ownerId: string): void {
        this.ownerDeletionsInProgress.delete(ownerId);
    }

    /**
     * Whether the owner's deletion has queued an erase of this switch that
     * has not yet landed (the Postgres store only: here the erase is made at
     * once), or has begun on this process and its last statement over the
     * owner's switches has not yet answered (`beginOwnerDeletion`, in every
     * store). While it is pending, this
     * process's mirror keeps the switch as it last had it, never a view of
     * its own of the erase (round 13 of part 2's review: it held its own
     * erase, cancelled and emptied, and the removal pass took that for a
     * cancelled release and blanked every copy of a release that had fired
     * on another process), and the sweep does not move it, so a switch whose
     * erase is lost and could not be read back is not fired by this process
     * for the account that is gone, and nor is one the deletion has not yet
     * reached (round 14).
     */
    deadmanSwitchErasePending(id: string): boolean {
        const record = this.deadmanSwitches.get(id);
        return record !== undefined && this.ownerDeletionsInProgress.has(record.ownerId);
    }

    /**
     * The owner's deletion, once its own writes are in the database: every
     * switch of the owner's is erased again as `eraseDeadmanSwitchUnlessFired`
     * erases one, and every copy still held that is sealed to the account,
     * on anyone's switch, is blanked. In the Postgres store this is two
     * statements decided in the database, over every row it holds for the
     * owner, so a switch this process's mirror lacked (an arm whose insert
     * landed after the deletion listed the owner's switches, one answered 503
     * that landed later, or one another process wrote) is erased too (round
     * 13 of part 2's review). Here the mirror is the database, the deletion
     * has already erased what there is, and this finds nothing left. Returns
     * how many switches it erased.
     */
    async eraseDeadmanSwitchesOfDeletedOwner(ownerId: string): Promise<number> {
        const held = (wrap: DeadmanReleaseWrapRecord) =>
            wrap.sealedKey !== '' || wrap.signature !== '';
        let erased = 0;
        for (const record of this.listDeadmanSwitchesForOwner(ownerId)) {
            const fired = record.status === 'triggered';
            const left =
                record.headline !== undefined ||
                (!fired &&
                    (record.status !== 'cancelled' ||
                        record.encryptedPayload !== '' ||
                        record.backlogGraceStartedAt !== undefined ||
                        this.listDeadmanReleaseWraps(record.id).some(held)));
            if (!left) continue;
            await this.eraseDeadmanSwitchUnlessFired(record.id);
            erased += 1;
        }
        for (const wrap of this.listDeadmanReleaseWrapsForRecipient(ownerId)) {
            if (held(wrap)) this.eraseDeadmanReleaseWrap(wrap.switchId, wrap.recipientAccountId);
        }
        return erased;
    }

    /**
     * The removal pass's blanking of a cancelled release switch's held
     * copies, only where the store has the switch cancelled. In the Postgres
     * store the condition is in the statement, on the switch Postgres holds,
     * so no process's stale view of a switch can blank the copies of a
     * release that fired (round 13 of part 2's review). Returns how many
     * copies were blanked.
     */
    async blankCopiesOfCancelledSwitch(switchId: string): Promise<number> {
        if (this.getDeadmanSwitch(switchId)?.status !== 'cancelled') return 0;
        let blanked = 0;
        for (const wrap of this.listDeadmanReleaseWraps(switchId)) {
            if (wrap.sealedKey === '' && wrap.signature === '') continue;
            if (this.eraseDeadmanReleaseWrap(wrap.switchId, wrap.recipientAccountId)) blanked += 1;
        }
        return blanked;
    }

    /**
     * Store one sealed copy of a release switch's content key: arming writes
     * the owner's and every recipient's, re-sealing replaces one recipient's.
     * An existing row keeps its `createdAt`.
     */
    putDeadmanReleaseWrap(
        input: Omit<DeadmanReleaseWrapRecord, 'createdAt' | 'updatedAt'>
    ): DeadmanReleaseWrapRecord {
        const key = releaseRowKey(input.switchId, input.recipientAccountId);
        const ts = nowIso();
        const record: DeadmanReleaseWrapRecord = {
            ...input,
            createdAt: this.deadmanReleaseWraps.get(key)?.createdAt ?? ts,
            updatedAt: ts,
        };
        this.deadmanReleaseWraps.set(key, record);
        return record;
    }

    getDeadmanReleaseWrap(
        switchId: string,
        recipientAccountId: string
    ): DeadmanReleaseWrapRecord | undefined {
        return this.deadmanReleaseWraps.get(releaseRowKey(switchId, recipientAccountId));
    }

    /** Every copy of one switch, the owner's included, blanked ones included: an indexed lookup, not a scan. */
    listDeadmanReleaseWraps(switchId: string): DeadmanReleaseWrapRecord[] {
        return this.deadmanReleaseWraps.inGroup('switch', switchId);
    }

    /** Every copy sealed to one account, on anyone's switches, blanked ones included: an indexed lookup, not a scan. */
    listDeadmanReleaseWrapsForRecipient(accountId: string): DeadmanReleaseWrapRecord[] {
        return this.deadmanReleaseWraps.inGroup('recipient', accountId);
    }

    /**
     * Remove one sealed copy and its signature (cancel, account deletion, the
     * release's removal after 365 days). The row stays, saying whom it was
     * for, as a targeted upsert, because the Postgres writer has no targeted
     * delete.
     */
    eraseDeadmanReleaseWrap(
        switchId: string,
        recipientAccountId: string
    ): DeadmanReleaseWrapRecord | undefined {
        const key = releaseRowKey(switchId, recipientAccountId);
        const record = this.deadmanReleaseWraps.get(key);
        if (!record) return undefined;
        const updated: DeadmanReleaseWrapRecord = {
            ...record,
            sealedKey: '',
            signature: '',
            updatedAt: nowIso(),
        };
        this.deadmanReleaseWraps.set(key, updated);
        return updated;
    }

    /**
     * Write the notice owed to one recipient of a fired release switch, due at
     * `nextAttemptAt`. `undefined` if there already is one: one notice per
     * recipient per release.
     */
    createDeadmanReleaseNotice(input: {
        switchId: string;
        recipientAccountId: string;
        nextAttemptAt: string;
    }): DeadmanReleaseNoticeRecord | undefined {
        const key = releaseRowKey(input.switchId, input.recipientAccountId);
        if (this.deadmanReleaseNotices.has(key)) return undefined;
        const ts = nowIso();
        const record: DeadmanReleaseNoticeRecord = {
            switchId: input.switchId,
            recipientAccountId: input.recipientAccountId,
            status: 'pending',
            attempts: 0,
            nextAttemptAt: input.nextAttemptAt,
            createdAt: ts,
            updatedAt: ts,
        };
        this.deadmanReleaseNotices.set(key, record);
        return record;
    }

    getDeadmanReleaseNotice(
        switchId: string,
        recipientAccountId: string
    ): DeadmanReleaseNoticeRecord | undefined {
        return this.deadmanReleaseNotices.get(releaseRowKey(switchId, recipientAccountId));
    }

    /** Every notice of one switch: an indexed lookup, not a scan. */
    listDeadmanReleaseNotices(switchId: string): DeadmanReleaseNoticeRecord[] {
        return this.deadmanReleaseNotices.inGroup('switch', switchId);
    }

    /** Every notice owed or sent to one account: an indexed lookup, not a scan. */
    listDeadmanReleaseNoticesForRecipient(accountId: string): DeadmanReleaseNoticeRecord[] {
        return this.deadmanReleaseNotices.inGroup('recipient', accountId);
    }

    /** Pending notices whose next attempt is due at `now`, oldest first. */
    listDueDeadmanReleaseNotices(now: string): DeadmanReleaseNoticeRecord[] {
        const at = Date.parse(now);
        return [...this.deadmanReleaseNotices.values()]
            .filter((row) => row.status === 'pending' && Date.parse(row.nextAttemptAt) <= at)
            .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    }

    updateDeadmanReleaseNotice(
        switchId: string,
        recipientAccountId: string,
        patch: Partial<
            Omit<DeadmanReleaseNoticeRecord, 'switchId' | 'recipientAccountId' | 'createdAt'>
        >
    ): DeadmanReleaseNoticeRecord | undefined {
        const key = releaseRowKey(switchId, recipientAccountId);
        const existing = this.deadmanReleaseNotices.get(key);
        if (!existing) return undefined;
        const next: DeadmanReleaseNoticeRecord = { ...existing, ...patch, updatedAt: nowIso() };
        this.deadmanReleaseNotices.set(key, next);
        return next;
    }

    /**
     * `updateDeadmanReleaseNotice`, only while the row still holds `expected`
     * (each field compared as stored; a guard value is never `undefined`):
     * the updated row, or `undefined` when it no longer holds them. In
     * Postgres mode the write carries the same condition into the database
     * (`ON CONFLICT ... DO UPDATE ... WHERE`), so a row another process ended
     * after this one last read it is not written back over (round 5 of part
     * 2's review).
     */
    updateDeadmanReleaseNoticeIf(
        switchId: string,
        recipientAccountId: string,
        expected: Partial<Pick<DeadmanReleaseNoticeRecord, 'status' | 'roomId'>>,
        patch: Partial<
            Omit<DeadmanReleaseNoticeRecord, 'switchId' | 'recipientAccountId' | 'createdAt'>
        >
    ): DeadmanReleaseNoticeRecord | undefined {
        const key = releaseRowKey(switchId, recipientAccountId);
        const existing = this.deadmanReleaseNotices.get(key);
        if (!existing) return undefined;
        for (const [field, value] of Object.entries(expected)) {
            if (value === undefined) return undefined;
            if (existing[field as keyof typeof expected] !== value) return undefined;
        }
        const next: DeadmanReleaseNoticeRecord = { ...existing, ...patch, updatedAt: nowIso() };
        this.deadmanReleaseNotices.set(key, next);
        return next;
    }

    /**
     * The account's standing notices room: the room of its newest notice that
     * has one, reused for every release (§11 of the envelope record says when
     * a person is left with more than one).
     */
    findDeadmanNoticeRoom(accountId: string): string | undefined {
        return this.newestDeadmanNoticeRoom(accountId)?.roomId;
    }

    /** The room `findDeadmanNoticeRoom` names, with when the row that names it was last written. */
    newestDeadmanNoticeRoom(accountId: string): { roomId: string; updatedAt: string } | undefined {
        const row = this.listDeadmanReleaseNoticesForRecipient(accountId)
            .filter((r) => r.roomId)
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
        return row?.roomId ? { roomId: row.roomId, updatedAt: row.updatedAt } : undefined;
    }

    /**
     * One recipient's sealed copy and notice row as the database holds them,
     * for the checks that must not rest on this process's mirror alone: the
     * notifier's, before it makes a room, before it invites the person and
     * before it sends. Here, and in the file store, the mirror is the
     * database; the Postgres store reads the committed rows, so an account
     * deletion another process committed is seen before its change
     * notification arrives (round 6 of part 2's review), and so is a notice
     * another process has already sent or ended (round 7: a leader taking
     * over within the notification's lag sent it again from its mirror), or
     * attempted and set to retry later (round 8: the new leader attempted it
     * at once). With `personsRoom`, also the recipient's newest recorded
     * notices room, as `newestDeadmanNoticeRoom` finds it, from the database
     * (round 8: a new leader whose mirror lacked the room the old leader had
     * recorded on another of the person's notices made the person a second
     * one).
     */
    async readDeadmanReleaseCommitted(
        switchId: string,
        recipientAccountId: string,
        options: { personsRoom?: boolean } = {}
    ): Promise<{
        wrap?: DeadmanReleaseWrapRecord;
        notice?: DeadmanReleaseNoticeRecord;
        room?: { roomId: string; updatedAt: string };
    }> {
        return {
            wrap: this.getDeadmanReleaseWrap(switchId, recipientAccountId),
            notice: this.getDeadmanReleaseNotice(switchId, recipientAccountId),
            ...(options.personsRoom
                ? { room: this.newestDeadmanNoticeRoom(recipientAccountId) }
                : {}),
        };
    }

    /**
     * The end of an account deletion, in the database itself: every notice
     * still pending to the account ends (`recipient_gone`) and every notice
     * row of theirs forgets its room, rows this process's mirror has not
     * heard of yet included (one another process wrote moments before).
     * In one process the deletion's own writes (`confirmAccountDeletion`)
     * have already reached every row, so there is nothing more to do; the
     * Postgres store does it with one statement. Returns how many rows it
     * changed.
     */
    async endDeadmanReleaseNoticesOfDeletedAccount(
        _accountId: string,
        _at: string
    ): Promise<number> {
        return 0;
    }

    /**
     * Wait until every write this store has made has been attempted in its
     * database. Here, and in the file store, there is nothing to wait for;
     * the Postgres store drains its write-behind queue (a write that fails
     * twice is dropped and logged there, and the drain still ends).
     */
    async drain(): Promise<void> {
        return undefined;
    }

    /**
     * Take the notifier's claim on one person's notices for `leaseMs`, as
     * `holder` (one token per attempt): `true` when it is this holder's. Only
     * one holder at a time has a person's claim, so two processes do not find
     * or make the person's room, or send them a notice, at the same moment.
     * Here, and in the file store, there is one process, whose per-recipient
     * slot already does that, so it is always granted; the Postgres store
     * takes it in the database (`deadman_notice_claims`).
     */
    async claimDeadmanNoticeRecipient(
        _recipientAccountId: string,
        _holder: string,
        _leaseMs: number
    ): Promise<boolean> {
        return true;
    }

    /** Give up a claim `claimDeadmanNoticeRecipient` granted (nothing to do here). */
    async releaseDeadmanNoticeRecipient(
        _recipientAccountId: string,
        _holder: string
    ): Promise<void> {
        return undefined;
    }

    /** Every release identity the account published, newest first. */
    listReleaseIdentitiesForAccount(accountId: string): ReleaseIdentityRecord[] {
        // Erased rows have no account; nothing finds them by one. Through the
        // by-account index: a filter over every identity row, once per copy
        // twice per arm, grew with everyone's identities (round 4 of part 2's
        // review).
        if (!accountId) return [];
        return this.releaseIdentities
            .inGroup('account', accountId)
            .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || b.id.localeCompare(a.id));
    }

    /** The account's current release identity: the newest one not superseded. */
    getCurrentReleaseIdentity(accountId: string): ReleaseIdentityRecord | undefined {
        return this.listReleaseIdentitiesForAccount(accountId).find(
            (record) => !record.supersededAt
        );
    }

    /** Mark one identity superseded at `at`; `undefined` if it is unknown or already was. */
    supersedeReleaseIdentity(id: string, at: string): ReleaseIdentityRecord | undefined {
        const record = this.releaseIdentities.get(id);
        if (!record || record.supersededAt) return undefined;
        const updated: ReleaseIdentityRecord = { ...record, supersededAt: at };
        this.releaseIdentities.set(id, updated);
        return updated;
    }

    /**
     * Publish an account's release identity. Every identity of the account
     * not yet superseded is marked superseded first, each as its own write,
     * so Postgres sees the old row replaced before the new one appears.
     * Callers check the identity, the account's history and the publish
     * limits first (`services/releaseIdentities.ts`).
     */
    publishReleaseIdentity(
        input: Omit<ReleaseIdentityRecord, 'publishedAt' | 'supersededAt'>
    ): ReleaseIdentityRecord {
        const at = nowIso();
        for (const existing of this.listReleaseIdentitiesForAccount(input.accountId)) {
            if (!existing.supersededAt) this.supersedeReleaseIdentity(existing.id, at);
        }
        const record: ReleaseIdentityRecord = { ...input, publishedAt: at };
        this.releaseIdentities.set(record.id, record);
        return record;
    }

    /**
     * Account deletion: blank one release identity, current or superseded:
     * its keys, signature, fingerprint and account go, and the row keeps only
     * its id, format version and times. The row stays, as `eraseScheduledMessage`
     * and `eraseDeadmanSwitch` keep theirs: the write is an upsert of this one
     * row, so it cannot touch any other row; it can still overwrite a newer
     * version of this one (last writer wins).
     */
    eraseReleaseIdentity(id: string): ReleaseIdentityRecord | undefined {
        const record = this.releaseIdentities.get(id);
        if (!record) return undefined;
        const updated: ReleaseIdentityRecord = {
            ...record,
            accountId: '',
            signingKey: '',
            x25519Key: '',
            mlkem768Key: '',
            signature: '',
            fingerprint: '',
            supersededAt: record.supersededAt ?? nowIso(),
        };
        this.releaseIdentities.set(id, updated);
        return updated;
    }

    createModerationAction(
        input: Omit<ModerationActionRecord, 'createdAt'>
    ): ModerationActionRecord {
        const record: ModerationActionRecord = { ...input, createdAt: nowIso() };
        this.moderationActions.set(record.id, record);
        return record;
    }

    listModerationActions(communityId: string): ModerationActionRecord[] {
        return [...this.moderationActions.values()].filter(
            (action) => action.communityId === communityId
        );
    }

    upsertCreatorStreamAuth(
        input: Omit<CreatorStreamAuthRecord, 'createdAt' | 'rotatedAt'>
    ): CreatorStreamAuthRecord {
        const existing = [...this.creatorStreamAuth.values()].find(
            (record) => record.creatorId === input.creatorId
        );
        const record: CreatorStreamAuthRecord = {
            ...input,
            id: existing?.id ?? input.id,
            createdAt: existing?.createdAt ?? nowIso(),
            rotatedAt: nowIso(),
        };
        this.creatorStreamAuth.set(record.id, record);
        return record;
    }

    getCreatorStreamAuth(creatorId: string): CreatorStreamAuthRecord | undefined {
        return [...this.creatorStreamAuth.values()].find(
            (record) => record.creatorId === creatorId
        );
    }

    upsertStream(input: Omit<StreamRecord, 'createdAt' | 'updatedAt'>): StreamRecord {
        const existing = this.streams.get(input.id);
        const record: StreamRecord = {
            ...input,
            createdAt: existing?.createdAt ?? nowIso(),
            updatedAt: nowIso(),
        };
        this.streams.set(record.id, record);
        return record;
    }

    getStream(streamId: string): StreamRecord | undefined {
        return this.streams.get(streamId);
    }

    listStreamsByCreator(creatorId: string): StreamRecord[] {
        return [...this.streams.values()].filter((stream) => stream.creatorId === creatorId);
    }

    listAllStreams(): StreamRecord[] {
        return [...this.streams.values()];
    }

    createStreamSession(input: Omit<StreamSessionRecord, 'createdAt'>): StreamSessionRecord {
        const record: StreamSessionRecord = { ...input, createdAt: nowIso() };
        this.streamSessions.set(record.id, record);
        return record;
    }

    getStreamSession(sessionId: string): StreamSessionRecord | undefined {
        return this.streamSessions.get(sessionId);
    }

    endStreamSession(sessionId: string, replayPointer?: string): StreamSessionRecord | undefined {
        const existing = this.streamSessions.get(sessionId);
        if (!existing) return undefined;

        const updated: StreamSessionRecord = {
            ...existing,
            endedAt: existing.endedAt ?? nowIso(),
            replayPointer: replayPointer ?? existing.replayPointer,
        };
        this.streamSessions.set(sessionId, updated);
        return updated;
    }

    listStreamSessions(streamId: string): StreamSessionRecord[] {
        return [...this.streamSessions.values()]
            .filter((session) => session.streamId === streamId)
            .sort((a, b) => (a.startedAt < b.startedAt ? -1 : 1));
    }

    upsertStreamModeration(
        input: Omit<StreamModerationRecord, 'updatedAt'>
    ): StreamModerationRecord {
        const record: StreamModerationRecord = {
            ...input,
            updatedAt: nowIso(),
        };
        this.streamModeration.set(record.streamId, record);
        return record;
    }

    getStreamModeration(streamId: string): StreamModerationRecord | undefined {
        return this.streamModeration.get(streamId);
    }

    upsertClip(input: Omit<ClipRecord, 'createdAt' | 'updatedAt'>): ClipRecord {
        const existing = this.clips.get(input.id);
        const record: ClipRecord = {
            ...input,
            createdAt: existing?.createdAt ?? nowIso(),
            updatedAt: nowIso(),
        };
        this.clips.set(record.id, record);
        return record;
    }

    getClip(clipId: string): ClipRecord | undefined {
        return this.clips.get(clipId);
    }

    deleteClip(clipId: string): boolean {
        return this.clips.delete(clipId);
    }

    listClips(options: { creatorId?: string; limit?: number } = {}): ClipRecord[] {
        const { creatorId, limit } = options;
        const items = [...this.clips.values()]
            .filter((clip) => (creatorId ? clip.creatorId === creatorId : true))
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        return typeof limit === 'number' ? items.slice(0, limit) : items;
    }

    listClipsBySourceStream(sourceStreamId: string): ClipRecord[] {
        return [...this.clips.values()]
            .filter((clip) => clip.sourceStreamId === sourceStreamId)
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    }

    updateClip(
        clipId: string,
        patch: Partial<
            Pick<
                ClipRecord,
                | 'title'
                | 'sourceStreamId'
                | 'mediaPointer'
                | 'thumbnailPointer'
                | 'captionsPointer'
                | 'durationSeconds'
                | 'visibility'
                | 'tags'
            >
        >
    ): ClipRecord | undefined {
        const existing = this.clips.get(clipId);
        if (!existing) return undefined;
        const record: ClipRecord = { ...existing, ...patch, updatedAt: nowIso() };
        this.clips.set(clipId, record);
        return record;
    }

    getFederatedCommunities(communityIds: string[]): string[] {
        const linked = [...this.federationLinks.values()].flatMap((link) => [
            link.sourceCommunityId,
            link.targetCommunityId,
        ]);
        return [...new Set(linked.filter((id) => communityIds.includes(id)))];
    }

    getVoiceRoom(canopyId: string, channelId: string): CanopyVoiceRoomRecord | undefined {
        return [...this.canopyVoiceRooms.values()].find(
            (room) => room.canopyId === canopyId && room.channelId === channelId && room.active
        );
    }

    createOrUpdateVoiceRoom(input: {
        canopyId: string;
        channelId: string;
        createdBy: string;
        livekitRoomName: string;
        isLocked?: boolean;
    }): CanopyVoiceRoomRecord {
        const existing = this.getVoiceRoom(input.canopyId, input.channelId);
        const timestamp = nowIso();
        if (existing) {
            const updated: CanopyVoiceRoomRecord = {
                ...existing,
                active: true,
                livekitRoomName: input.livekitRoomName,
                isLocked: input.isLocked ?? existing.isLocked,
                updatedAt: timestamp,
            };
            this.canopyVoiceRooms.set(updated.id, updated);
            return updated;
        }

        const created: CanopyVoiceRoomRecord = {
            id: crypto.randomUUID(),
            canopyId: input.canopyId,
            channelId: input.channelId,
            livekitRoomName: input.livekitRoomName,
            createdBy: input.createdBy,
            isLocked: Boolean(input.isLocked),
            active: true,
            createdAt: timestamp,
            updatedAt: timestamp,
        };
        this.canopyVoiceRooms.set(created.id, created);
        return created;
    }

    setVoiceRoomLock(roomId: string, isLocked: boolean): CanopyVoiceRoomRecord | undefined {
        const existing = this.canopyVoiceRooms.get(roomId);
        if (!existing) return undefined;
        const updated: CanopyVoiceRoomRecord = { ...existing, isLocked, updatedAt: nowIso() };
        this.canopyVoiceRooms.set(roomId, updated);
        return updated;
    }

    joinVoiceRoom(
        input: Omit<VoiceRoomParticipantRecord, 'id' | 'joinedAt' | 'leftAt'>
    ): VoiceRoomParticipantRecord {
        const existingActive = [...this.voiceRoomParticipants.values()].find(
            (participant) =>
                participant.roomId === input.roomId &&
                participant.userId === input.userId &&
                !participant.leftAt
        );
        if (existingActive) {
            return existingActive;
        }
        const participant: VoiceRoomParticipantRecord = {
            id: crypto.randomUUID(),
            roomId: input.roomId,
            userId: input.userId,
            role: input.role,
            canPublish: input.canPublish,
            canSubscribe: input.canSubscribe,
            joinedAt: nowIso(),
        };
        this.voiceRoomParticipants.set(participant.id, participant);
        return participant;
    }

    leaveVoiceRoom(roomId: string, userId: string): VoiceRoomParticipantRecord | undefined {
        const existing = [...this.voiceRoomParticipants.values()].find(
            (participant) =>
                participant.roomId === roomId &&
                participant.userId === userId &&
                !participant.leftAt
        );
        if (!existing) return undefined;
        const updated = { ...existing, leftAt: nowIso() };
        this.voiceRoomParticipants.set(updated.id, updated);
        return updated;
    }

    getVoiceRoomActiveParticipants(roomId: string): VoiceRoomParticipantRecord[] {
        return [...this.voiceRoomParticipants.values()].filter(
            (participant) => participant.roomId === roomId && !participant.leftAt
        );
    }

    logVoiceRoomEvent(input: Omit<VoiceRoomEventRecord, 'id' | 'createdAt'>): VoiceRoomEventRecord {
        const record: VoiceRoomEventRecord = {
            ...input,
            id: crypto.randomUUID(),
            createdAt: nowIso(),
        };
        this.voiceRoomEvents.set(record.id, record);
        return record;
    }

    listVoiceRoomEvents(roomId: string): VoiceRoomEventRecord[] {
        return [...this.voiceRoomEvents.values()]
            .filter((event) => event.roomId === roomId)
            .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    }

    /** The mute or removal (`kind`) that stands against `userId` in the room, if any. */
    getActiveVoiceRoomSanction(
        roomId: string,
        userId: string,
        kind: VoiceRoomSanctionKind
    ): VoiceRoomSanctionRecord | undefined {
        return [...this.voiceRoomSanctions.values()].find(
            (sanction) =>
                sanction.roomId === roomId &&
                sanction.userId === userId &&
                sanction.kind === kind &&
                !sanction.liftedAt
        );
    }

    listActiveVoiceRoomSanctions(roomId: string): VoiceRoomSanctionRecord[] {
        return [...this.voiceRoomSanctions.values()]
            .filter((sanction) => sanction.roomId === roomId && !sanction.liftedAt)
            .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    }

    /**
     * Impose `kind` on `userId` in the room. One that already stands is
     * returned as it is, so repeating a removal does not reset who imposed it
     * or when.
     */
    applyVoiceRoomSanction(input: {
        roomId: string;
        userId: string;
        kind: VoiceRoomSanctionKind;
        actorId: string;
    }): VoiceRoomSanctionRecord {
        const standing = this.getActiveVoiceRoomSanction(input.roomId, input.userId, input.kind);
        if (standing) return standing;
        const record: VoiceRoomSanctionRecord = {
            id: crypto.randomUUID(),
            roomId: input.roomId,
            userId: input.userId,
            kind: input.kind,
            actorId: input.actorId,
            createdAt: nowIso(),
        };
        this.voiceRoomSanctions.set(record.id, record);
        return record;
    }

    /** Lift the `kind` that stands against `userId` in the room; `undefined` when none does. */
    liftVoiceRoomSanction(
        roomId: string,
        userId: string,
        kind: VoiceRoomSanctionKind,
        liftedBy: string
    ): VoiceRoomSanctionRecord | undefined {
        const standing = this.getActiveVoiceRoomSanction(roomId, userId, kind);
        if (!standing) return undefined;
        const lifted: VoiceRoomSanctionRecord = { ...standing, liftedAt: nowIso(), liftedBy };
        this.voiceRoomSanctions.set(lifted.id, lifted);
        return lifted;
    }

    upsertMarketplaceEntitlement(
        record: MarketplaceEntitlementRecord
    ): MarketplaceEntitlementRecord {
        this.marketplaceEntitlements.set(record.id, record);
        return record;
    }

    getMarketplaceEntitlement(id: string): MarketplaceEntitlementRecord | undefined {
        return this.marketplaceEntitlements.get(id);
    }

    listMarketplaceEntitlementsByUser(userId: string): MarketplaceEntitlementRecord[] {
        return [...this.marketplaceEntitlements.values()].filter((row) => row.userId === userId);
    }

    findMarketplaceEntitlement(criteria: {
        userId: string;
        providerId: MarketplaceProviderIdString;
        providerListingId: string;
        sku: string | null;
    }): MarketplaceEntitlementRecord | undefined {
        return [...this.marketplaceEntitlements.values()].find(
            (row) =>
                row.userId === criteria.userId &&
                row.providerId === criteria.providerId &&
                row.providerListingId === criteria.providerListingId &&
                (criteria.sku === null ? true : row.sku === criteria.sku)
        );
    }

    recordMarketplaceWebhook(record: MarketplaceWebhookAuditRecord): MarketplaceWebhookAuditRecord {
        this.marketplaceWebhookAudit.set(
            this.webhookKey(record.providerId, record.eventId),
            record
        );
        return record;
    }

    markMarketplaceWebhookProcessed(
        providerId: MarketplaceProviderIdString,
        eventId: string,
        processedAt: string
    ): MarketplaceWebhookAuditRecord | undefined {
        const key = this.webhookKey(providerId, eventId);
        const existing = this.marketplaceWebhookAudit.get(key);
        if (!existing) return undefined;
        const updated = { ...existing, processedAt };
        this.marketplaceWebhookAudit.set(key, updated);
        return updated;
    }

    getMarketplaceWebhook(
        providerId: MarketplaceProviderIdString,
        eventId: string
    ): MarketplaceWebhookAuditRecord | undefined {
        return this.marketplaceWebhookAudit.get(this.webhookKey(providerId, eventId));
    }

    upsertMarketplaceLicenseKey(record: MarketplaceLicenseKeyRecord): MarketplaceLicenseKeyRecord {
        this.marketplaceLicenseKeys.set(record.entitlementId, record);
        return record;
    }

    getMarketplaceLicenseKey(entitlementId: string): MarketplaceLicenseKeyRecord | undefined {
        return this.marketplaceLicenseKeys.get(entitlementId);
    }

    upsertMarketplaceListingsCache(
        record: MarketplaceListingsCacheRecord
    ): MarketplaceListingsCacheRecord {
        this.marketplaceListingsCache.set(record.cacheKey, record);
        return record;
    }

    getMarketplaceListingsCache(cacheKey: string): MarketplaceListingsCacheRecord | undefined {
        return this.marketplaceListingsCache.get(cacheKey);
    }

    resetMarketplaceForTest(): void {
        this.marketplaceEntitlements.clear();
        this.marketplaceWebhookAudit.clear();
        this.marketplaceLicenseKeys.clear();
        this.marketplaceListingsCache.clear();
    }

    // --- FBM → Matrix bridge ---------------------------------------------------

    getFbmVendorRooms(vendorId: string): FbmVendorRoomRecord | undefined {
        return this.fbmVendorRooms.get(vendorId);
    }

    upsertFbmVendorRooms(record: FbmVendorRoomRecord): FbmVendorRoomRecord {
        this.fbmVendorRooms.set(record.vendorId, record);
        return record;
    }

    getFbmBuyerOrderRoom(orderId: string): FbmBuyerOrderRoomRecord | undefined {
        return [...this.fbmBuyerOrderRooms.values()].find((r) => r.orderId === orderId);
    }

    upsertFbmBuyerOrderRoom(record: FbmBuyerOrderRoomRecord): FbmBuyerOrderRoomRecord {
        this.fbmBuyerOrderRooms.set(record.id, record);
        return record;
    }

    /** All bridged order rooms for a vendor (their `vendorId` == Blackout sub), newest first. */
    listFbmBuyerOrderRoomsByVendor(vendorId: string, limit = 200): FbmBuyerOrderRoomRecord[] {
        return [...this.fbmBuyerOrderRooms.values()]
            .filter((r) => r.vendorId === vendorId)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
            .slice(0, limit);
    }

    getFbmDeaddropDeliveryBySourceEvent(
        sourceEventId: string
    ): FbmDeaddropDeliveryRecord | undefined {
        return [...this.fbmDeaddropDeliveries.values()].find(
            (r) => r.sourceEventId === sourceEventId
        );
    }

    upsertFbmDeaddropDelivery(record: FbmDeaddropDeliveryRecord): FbmDeaddropDeliveryRecord {
        this.fbmDeaddropDeliveries.set(record.id, record);
        return record;
    }

    /** Deliveries past their TTL (or already downloaded) that have not been tombstoned. */
    listFbmDeaddropDeliveriesToTombstone(nowIso: string): FbmDeaddropDeliveryRecord[] {
        return [...this.fbmDeaddropDeliveries.values()].filter(
            (r) => !r.tombstonedAt && (r.downloadedAt !== null || r.expiresAt <= nowIso)
        );
    }

    getFbmDisputeRoom(disputeId: string): FbmDisputeRoomRecord | undefined {
        return this.fbmDisputeRooms.get(disputeId);
    }

    upsertFbmDisputeRoom(record: FbmDisputeRoomRecord): FbmDisputeRoomRecord {
        this.fbmDisputeRooms.set(record.disputeId, record);
        return record;
    }

    /** Resolved dispute rooms whose retention window has elapsed and not yet purged. */
    listFbmDisputeRoomsToPurge(nowIso: string): FbmDisputeRoomRecord[] {
        return [...this.fbmDisputeRooms.values()].filter(
            (r) =>
                r.status === 'resolved' &&
                !r.purgedAt &&
                r.purgeAfter !== null &&
                r.purgeAfter <= nowIso
        );
    }

    resetFbmMatrixBridgeForTest(): void {
        this.fbmVendorRooms.clear();
        this.fbmBuyerOrderRooms.clear();
        this.fbmDeaddropDeliveries.clear();
        this.fbmDisputeRooms.clear();
    }

    // --- FBM entitlements ACL sync state ---------------------------------------

    private fbmAclKey(mxid: string, roomId: string): string {
        return `${mxid}::${roomId}`;
    }

    getFbmAclState(mxid: string, roomId: string): FbmAclStateRecord | undefined {
        return this.fbmAclState.get(this.fbmAclKey(mxid, roomId));
    }

    upsertFbmAclState(record: FbmAclStateRecord): FbmAclStateRecord {
        this.fbmAclState.set(this.fbmAclKey(record.mxid, record.roomId), record);
        return record;
    }

    /** Distinct MXIDs with applied ACL state — drives the drift-correction reconcile. */
    listFbmAclMxids(): string[] {
        return [...new Set([...this.fbmAclState.values()].map((r) => r.mxid))];
    }

    resetFbmAclStateForTest(): void {
        this.fbmAclState.clear();
    }

    insertTip(record: TipRecord): TipRecord {
        this.tips.set(record.id, record);
        return record;
    }

    updateTip(record: TipRecord): TipRecord {
        this.tips.set(record.id, record);
        return record;
    }

    getTip(id: string): TipRecord | undefined {
        return this.tips.get(id);
    }

    findTipByOrderId(
        providerId: MarketplaceProviderIdString,
        fbmOrderId: string
    ): TipRecord | undefined {
        return [...this.tips.values()].find(
            (row) => row.providerId === providerId && row.fbmOrderId === fbmOrderId
        );
    }

    // createdAt has millisecond resolution, so tips created in the same tick
    // tie. The Map iterates in insertion order and Array#sort is stable, so
    // reversing first keeps most-recent-inserted ahead within a tied timestamp.
    listTipsByRecipient(recipientUserId: string, limit = 100): TipRecord[] {
        return [...this.tips.values()]
            .reverse()
            .filter((row) => row.recipientUserId === recipientUserId)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
            .slice(0, limit);
    }

    listTipsBySender(senderUserId: string, limit = 100): TipRecord[] {
        return [...this.tips.values()]
            .reverse()
            .filter((row) => row.senderUserId === senderUserId)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
            .slice(0, limit);
    }

    resetTipsForTest(): void {
        this.tips.clear();
    }

    // ----------------------------------------------------------- Growth ledger

    insertReferral(record: ReferralRecord): ReferralRecord {
        this.referrals.set(record.id, record);
        return record;
    }

    updateReferral(record: ReferralRecord): ReferralRecord {
        this.referrals.set(record.id, record);
        return record;
    }

    getReferral(id: string): ReferralRecord | undefined {
        return this.referrals.get(id);
    }

    findReferralByReferee(refereeUserId: string): ReferralRecord | undefined {
        return [...this.referrals.values()].find((row) => row.refereeUserId === refereeUserId);
    }

    listReferralsByReferrer(referrerUserId: string): ReferralRecord[] {
        return [...this.referrals.values()].filter((row) => row.referrerUserId === referrerUserId);
    }

    resetReferralsForTest(): void {
        this.referrals.clear();
    }

    insertAmbassador(record: AmbassadorRecord): AmbassadorRecord {
        this.ambassadors.set(record.id, record);
        return record;
    }

    updateAmbassador(record: AmbassadorRecord): AmbassadorRecord {
        this.ambassadors.set(record.id, record);
        return record;
    }

    getAmbassador(id: string): AmbassadorRecord | undefined {
        return this.ambassadors.get(id);
    }

    findAmbassadorByUser(userId: string): AmbassadorRecord | undefined {
        return [...this.ambassadors.values()].find((row) => row.userId === userId);
    }

    resetAmbassadorsForTest(): void {
        this.ambassadors.clear();
    }

    insertQuest(record: QuestDefinitionRecord): QuestDefinitionRecord {
        this.quests.set(record.id, record);
        return record;
    }

    updateQuest(record: QuestDefinitionRecord): QuestDefinitionRecord {
        this.quests.set(record.id, record);
        return record;
    }

    getQuest(id: string): QuestDefinitionRecord | undefined {
        return this.quests.get(id);
    }

    listQuests(): QuestDefinitionRecord[] {
        return [...this.quests.values()];
    }

    insertQuestCompletion(record: QuestCompletionRecord): QuestCompletionRecord {
        this.questCompletions.set(record.id, record);
        return record;
    }

    updateQuestCompletion(record: QuestCompletionRecord): QuestCompletionRecord {
        this.questCompletions.set(record.id, record);
        return record;
    }

    getQuestCompletion(questId: string, userId: string): QuestCompletionRecord | undefined {
        return [...this.questCompletions.values()].find(
            (row) => row.questId === questId && row.userId === userId
        );
    }

    getQuestCompletionById(id: string): QuestCompletionRecord | undefined {
        return this.questCompletions.get(id);
    }

    listQuestCompletionsByUser(userId: string): QuestCompletionRecord[] {
        return [...this.questCompletions.values()].filter((row) => row.userId === userId);
    }

    listQuestCompletionsByQuest(questId: string): QuestCompletionRecord[] {
        return [...this.questCompletions.values()].filter((row) => row.questId === questId);
    }

    resetQuestsForTest(): void {
        this.quests.clear();
        this.questCompletions.clear();
    }

    insertMigrationCredit(record: MigrationCreditRecord): MigrationCreditRecord {
        this.migrationCredits.set(record.id, record);
        return record;
    }

    updateMigrationCredit(record: MigrationCreditRecord): MigrationCreditRecord {
        this.migrationCredits.set(record.id, record);
        return record;
    }

    getMigrationCredit(id: string): MigrationCreditRecord | undefined {
        return this.migrationCredits.get(id);
    }

    findMigrationCredit(
        userId: string,
        sourceKind: MigrationCreditRecord['sourceKind'],
        sourceHandle: string | null
    ): MigrationCreditRecord | undefined {
        return [...this.migrationCredits.values()].find(
            (row) =>
                row.userId === userId &&
                row.sourceKind === sourceKind &&
                row.sourceHandle === sourceHandle
        );
    }

    listMigrationCreditsByUser(userId: string): MigrationCreditRecord[] {
        return [...this.migrationCredits.values()].filter((row) => row.userId === userId);
    }

    resetMigrationCreditsForTest(): void {
        this.migrationCredits.clear();
    }

    insertBountyReward(record: BountyRewardRecord): BountyRewardRecord {
        this.bountyRewards.set(record.id, record);
        return record;
    }

    updateBountyReward(record: BountyRewardRecord): BountyRewardRecord {
        this.bountyRewards.set(record.id, record);
        return record;
    }

    getBountyRewardByBounty(bountyId: string): BountyRewardRecord | undefined {
        return [...this.bountyRewards.values()].find((row) => row.bountyId === bountyId);
    }

    listBountyRewardsByBeneficiary(beneficiaryId: string): BountyRewardRecord[] {
        return [...this.bountyRewards.values()]
            .filter((row) => row.beneficiaryId === beneficiaryId)
            .sort((a, b) => Date.parse(b.earnedAt) - Date.parse(a.earnedAt));
    }

    resetBountyRewardsForTest(): void {
        this.bountyRewards.clear();
    }

    insertCreatorSubscriptionTier(
        record: CreatorSubscriptionTierRecord
    ): CreatorSubscriptionTierRecord {
        this.creatorSubscriptionTiers.set(record.id, record);
        return record;
    }

    updateCreatorSubscriptionTier(
        record: CreatorSubscriptionTierRecord
    ): CreatorSubscriptionTierRecord {
        this.creatorSubscriptionTiers.set(record.id, record);
        return record;
    }

    getCreatorSubscriptionTier(id: string): CreatorSubscriptionTierRecord | undefined {
        return this.creatorSubscriptionTiers.get(id);
    }

    listCreatorSubscriptionTiersForCreator(creatorUserId: string): CreatorSubscriptionTierRecord[] {
        return [...this.creatorSubscriptionTiers.values()]
            .filter((row) => row.creatorUserId === creatorUserId)
            .sort((a, b) => a.priceCents - b.priceCents);
    }

    insertCreatorSubscription(record: CreatorSubscriptionRecord): CreatorSubscriptionRecord {
        this.creatorSubscriptions.set(record.id, record);
        return record;
    }

    updateCreatorSubscription(record: CreatorSubscriptionRecord): CreatorSubscriptionRecord {
        this.creatorSubscriptions.set(record.id, record);
        return record;
    }

    getCreatorSubscription(id: string): CreatorSubscriptionRecord | undefined {
        return this.creatorSubscriptions.get(id);
    }

    findActiveCreatorSubscription(
        subscriberUserId: string,
        creatorUserId: string
    ): CreatorSubscriptionRecord | undefined {
        return [...this.creatorSubscriptions.values()].find(
            (row) =>
                row.subscriberUserId === subscriberUserId &&
                row.creatorUserId === creatorUserId &&
                row.status === 'active'
        );
    }

    listCreatorSubscriptionsForSubscriber(subscriberUserId: string): CreatorSubscriptionRecord[] {
        return [...this.creatorSubscriptions.values()]
            .filter((row) => row.subscriberUserId === subscriberUserId)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }

    listCreatorSubscriptionsForCreator(creatorUserId: string): CreatorSubscriptionRecord[] {
        return [...this.creatorSubscriptions.values()]
            .filter((row) => row.creatorUserId === creatorUserId)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }

    resetCreatorSubscriptionsForTest(): void {
        this.creatorSubscriptionTiers.clear();
        this.creatorSubscriptions.clear();
    }

    insertCommunityBoostPledge(record: CommunityBoostPledgeRecord): CommunityBoostPledgeRecord {
        this.communityBoostPledges.set(record.id, record);
        return record;
    }

    updateCommunityBoostPledge(record: CommunityBoostPledgeRecord): CommunityBoostPledgeRecord {
        this.communityBoostPledges.set(record.id, record);
        return record;
    }

    getCommunityBoostPledge(id: string): CommunityBoostPledgeRecord | undefined {
        return this.communityBoostPledges.get(id);
    }

    findActiveBoostPledgeForUser(
        communityId: string,
        pledgerUserId: string
    ): CommunityBoostPledgeRecord | undefined {
        return [...this.communityBoostPledges.values()].find(
            (row) =>
                row.communityId === communityId &&
                row.pledgerUserId === pledgerUserId &&
                row.status === 'active'
        );
    }

    listBoostPledgesForCommunity(communityId: string): CommunityBoostPledgeRecord[] {
        return [...this.communityBoostPledges.values()]
            .filter((row) => row.communityId === communityId)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }

    listBoostPledgesByUser(pledgerUserId: string): CommunityBoostPledgeRecord[] {
        return [...this.communityBoostPledges.values()]
            .filter((row) => row.pledgerUserId === pledgerUserId)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }

    resetCommunityBoostsForTest(): void {
        this.communityBoostPledges.clear();
    }

    insertAidPool(record: AidPoolRecord): AidPoolRecord {
        this.aidPools.set(record.id, record);
        return record;
    }

    updateAidPool(record: AidPoolRecord): AidPoolRecord {
        this.aidPools.set(record.id, record);
        return record;
    }

    getAidPool(id: string): AidPoolRecord | undefined {
        return this.aidPools.get(id);
    }

    listAidPools(): AidPoolRecord[] {
        return [...this.aidPools.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }

    listAidPoolsByOrganizer(organizerUserId: string): AidPoolRecord[] {
        return [...this.aidPools.values()]
            .filter((row) => row.organizerUserId === organizerUserId)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }

    resetAidPoolsForTest(): void {
        this.aidPools.clear();
    }

    insertAdRevenuePeriod(record: AdRevenuePeriodRecord): AdRevenuePeriodRecord {
        this.adRevenuePeriods.set(record.id, record);
        return record;
    }

    updateAdRevenuePeriod(record: AdRevenuePeriodRecord): AdRevenuePeriodRecord {
        this.adRevenuePeriods.set(record.id, record);
        return record;
    }

    getAdRevenuePeriod(id: string): AdRevenuePeriodRecord | undefined {
        return this.adRevenuePeriods.get(id);
    }

    listAdRevenuePeriods(): AdRevenuePeriodRecord[] {
        return [...this.adRevenuePeriods.values()].sort((a, b) =>
            b.periodStart.localeCompare(a.periodStart)
        );
    }

    insertAdRevenueShare(record: AdRevenueShareRecord): AdRevenueShareRecord {
        this.adRevenueShares.set(record.id, record);
        return record;
    }

    updateAdRevenueShare(record: AdRevenueShareRecord): AdRevenueShareRecord {
        this.adRevenueShares.set(record.id, record);
        return record;
    }

    getAdRevenueShare(id: string): AdRevenueShareRecord | undefined {
        return this.adRevenueShares.get(id);
    }

    listAdRevenueSharesForPeriod(periodId: string): AdRevenueShareRecord[] {
        return [...this.adRevenueShares.values()]
            .filter((row) => row.periodId === periodId)
            .sort((a, b) => b.netCents - a.netCents);
    }

    listAdRevenueSharesForCreator(creatorUserId: string): AdRevenueShareRecord[] {
        return [...this.adRevenueShares.values()]
            .filter((row) => row.creatorUserId === creatorUserId)
            .sort((a, b) => b.computedAt.localeCompare(a.computedAt));
    }

    resetAdRevenueForTest(): void {
        this.adRevenuePeriods.clear();
        this.adRevenueShares.clear();
    }

    private webhookKey(providerId: MarketplaceProviderIdString, eventId: string): string {
        return `${providerId}:${eventId}`;
    }

    // --- coalition spatial map ---

    listCoalitionSpatialItems(): CoalitionSpatialItemRecord[] {
        return [...this.coalitionSpatialItems.values()];
    }

    upsertCoalitionSpatialItem(
        input: Omit<CoalitionSpatialItemRecord, 'createdAt' | 'updatedAt'>
    ): CoalitionSpatialItemRecord {
        const existing = this.coalitionSpatialItems.get(input.id);
        const now = nowIso();
        const record: CoalitionSpatialItemRecord = {
            ...input,
            createdAt: existing?.createdAt ?? now,
            updatedAt: now,
        };
        this.coalitionSpatialItems.set(record.id, record);
        return record;
    }

    /** Remove a spatial pin (used by the flash-mob ephemeral-pin sweeper). */
    deleteCoalitionSpatialItem(id: string): boolean {
        return this.coalitionSpatialItems.delete(id);
    }

    listCoalitionAidPosts(): CoalitionAidPostRecord[] {
        return [...this.coalitionAidPosts.values()];
    }

    createCoalitionAidPost(
        input: Omit<CoalitionAidPostRecord, 'createdAt'>
    ): CoalitionAidPostRecord {
        const record: CoalitionAidPostRecord = { ...input, createdAt: nowIso() };
        this.coalitionAidPosts.set(record.id, record);
        return record;
    }

    /** The row a given origin system's id already maps to, if any. */
    findCoalitionAidPostByOrigin(
        source: string,
        externalId: string
    ): CoalitionAidPostRecord | undefined {
        return [...this.coalitionAidPosts.values()].find(
            (post) => post.source === source && post.externalId === externalId
        );
    }

    /**
     * Write a post mirrored from another system, keyed by where it came from.
     *
     * Webhook delivery is at-least-once and the origin's own id is the only
     * stable handle on the row, so a redelivery — or a later status change for
     * the same request — has to land on the row already there rather than
     * stacking a second copy of somebody's need onto the board. The local id
     * and `createdAt` are preserved so anything already pointing at the post
     * keeps working.
     */
    upsertCoalitionAidPostByOrigin(
        input: Omit<CoalitionAidPostRecord, 'createdAt'> & {
            source: string;
            externalId: string;
        }
    ): CoalitionAidPostRecord {
        const existing = this.findCoalitionAidPostByOrigin(input.source, input.externalId);
        const record: CoalitionAidPostRecord = {
            ...input,
            id: existing?.id ?? input.id,
            createdAt: existing?.createdAt ?? nowIso(),
        };
        this.coalitionAidPosts.set(record.id, record);
        return record;
    }

    // --- coalition events + RSVPs ---

    private static eventRsvpKey(eventId: string, userId: string): string {
        return `${eventId}::${userId}`;
    }

    listCoalitionEvents(): CoalitionEventRecord[] {
        return [...this.coalitionEvents.values()];
    }

    getCoalitionEvent(id: string): CoalitionEventRecord | undefined {
        return this.coalitionEvents.get(id);
    }

    upsertCoalitionEvent(
        input: Omit<CoalitionEventRecord, 'createdAt' | 'updatedAt'>
    ): CoalitionEventRecord {
        const existing = this.coalitionEvents.get(input.id);
        const now = nowIso();
        const record: CoalitionEventRecord = {
            ...input,
            createdAt: existing?.createdAt ?? now,
            updatedAt: now,
        };
        this.coalitionEvents.set(record.id, record);
        return record;
    }

    listEventRsvps(eventId: string): EventRsvpRecord[] {
        return [...this.eventRsvps.values()].filter((rsvp) => rsvp.eventId === eventId);
    }

    upsertEventRsvp(input: Omit<EventRsvpRecord, 'createdAt' | 'updatedAt'>): EventRsvpRecord {
        const key = InMemoryDb.eventRsvpKey(input.eventId, input.userId);
        const existing = this.eventRsvps.get(key);
        const now = nowIso();
        const record: EventRsvpRecord = {
            ...input,
            createdAt: existing?.createdAt ?? now,
            updatedAt: now,
        };
        this.eventRsvps.set(key, record);
        return record;
    }

    // --- event volunteer slots + ride coordination ---

    private static signupKey(slotId: string, userId: string): string {
        return `${slotId}::${userId}`;
    }
    private static rideClaimKey(offerId: string, riderId: string): string {
        return `${offerId}::${riderId}`;
    }

    listVolunteerSlots(eventId: string): VolunteerSlotRecord[] {
        return [...this.eventVolunteerSlots.values()].filter((slot) => slot.eventId === eventId);
    }

    getVolunteerSlot(id: string): VolunteerSlotRecord | undefined {
        return this.eventVolunteerSlots.get(id);
    }

    upsertVolunteerSlot(
        input: Omit<VolunteerSlotRecord, 'createdAt' | 'updatedAt'>
    ): VolunteerSlotRecord {
        const existing = this.eventVolunteerSlots.get(input.id);
        const now = nowIso();
        const record: VolunteerSlotRecord = {
            ...input,
            createdAt: existing?.createdAt ?? now,
            updatedAt: now,
        };
        this.eventVolunteerSlots.set(record.id, record);
        return record;
    }

    listVolunteerSignups(eventId: string): VolunteerSignupRecord[] {
        return [...this.eventVolunteerSignups.values()].filter((row) => row.eventId === eventId);
    }

    upsertVolunteerSignup(
        input: Omit<VolunteerSignupRecord, 'createdAt' | 'updatedAt'>
    ): VolunteerSignupRecord {
        const key = InMemoryDb.signupKey(input.slotId, input.userId);
        const existing = this.eventVolunteerSignups.get(key);
        const now = nowIso();
        const record: VolunteerSignupRecord = {
            ...input,
            createdAt: existing?.createdAt ?? now,
            updatedAt: now,
        };
        this.eventVolunteerSignups.set(key, record);
        return record;
    }

    listRideOffers(eventId: string): RideOfferRecord[] {
        return [...this.eventRideOffers.values()].filter((offer) => offer.eventId === eventId);
    }

    getRideOffer(id: string): RideOfferRecord | undefined {
        return this.eventRideOffers.get(id);
    }

    upsertRideOffer(input: Omit<RideOfferRecord, 'createdAt' | 'updatedAt'>): RideOfferRecord {
        const existing = this.eventRideOffers.get(input.id);
        const now = nowIso();
        const record: RideOfferRecord = {
            ...input,
            createdAt: existing?.createdAt ?? now,
            updatedAt: now,
        };
        this.eventRideOffers.set(record.id, record);
        return record;
    }

    listRideClaims(eventId: string): RideClaimRecord[] {
        return [...this.eventRideClaims.values()].filter((claim) => claim.eventId === eventId);
    }

    upsertRideClaim(input: Omit<RideClaimRecord, 'createdAt' | 'updatedAt'>): RideClaimRecord {
        const key = InMemoryDb.rideClaimKey(input.offerId, input.riderId);
        const existing = this.eventRideClaims.get(key);
        const now = nowIso();
        const record: RideClaimRecord = {
            ...input,
            createdAt: existing?.createdAt ?? now,
            updatedAt: now,
        };
        this.eventRideClaims.set(key, record);
        return record;
    }

    // --- coalitions network ---

    private static coalitionMembershipKey(coalitionId: string, userId: string): string {
        return `${coalitionId}::${userId}`;
    }

    listCoalitions(): CoalitionRecord[] {
        return [...this.coalitions.values()];
    }

    getCoalition(id: string): CoalitionRecord | undefined {
        return this.coalitions.get(id);
    }

    getCoalitionBySlug(slug: string): CoalitionRecord | undefined {
        for (const row of this.coalitions.values()) if (row.slug === slug) return row;
        return undefined;
    }

    upsertCoalition(input: Omit<CoalitionRecord, 'createdAt' | 'updatedAt'>): CoalitionRecord {
        const existing = this.coalitions.get(input.id);
        const now = nowIso();
        const record: CoalitionRecord = {
            ...input,
            createdAt: existing?.createdAt ?? now,
            updatedAt: now,
        };
        this.coalitions.set(record.id, record);
        return record;
    }

    listCoalitionMemberships(
        filter: { coalitionId?: string; userId?: string } = {}
    ): CoalitionMembershipRecord[] {
        return [...this.coalitionMemberships.values()].filter((row) => {
            if (filter.coalitionId && row.coalitionId !== filter.coalitionId) return false;
            if (filter.userId && row.userId !== filter.userId) return false;
            return true;
        });
    }

    getCoalitionMembership(
        coalitionId: string,
        userId: string
    ): CoalitionMembershipRecord | undefined {
        return this.coalitionMemberships.get(
            InMemoryDb.coalitionMembershipKey(coalitionId, userId)
        );
    }

    upsertCoalitionMembership(
        input: Omit<CoalitionMembershipRecord, 'createdAt' | 'updatedAt'>
    ): CoalitionMembershipRecord {
        const key = InMemoryDb.coalitionMembershipKey(input.coalitionId, input.userId);
        const existing = this.coalitionMemberships.get(key);
        const now = nowIso();
        const record: CoalitionMembershipRecord = {
            ...input,
            createdAt: existing?.createdAt ?? now,
            updatedAt: now,
        };
        this.coalitionMemberships.set(key, record);
        return record;
    }

    listCoalitionJoinRequests(
        filter: { coalitionId?: string; userId?: string; status?: string } = {}
    ): CoalitionJoinRequestRecord[] {
        return [...this.coalitionJoinRequests.values()].filter((row) => {
            if (filter.coalitionId && row.coalitionId !== filter.coalitionId) return false;
            if (filter.userId && row.userId !== filter.userId) return false;
            if (filter.status && row.status !== filter.status) return false;
            return true;
        });
    }

    getCoalitionJoinRequest(
        coalitionId: string,
        userId: string
    ): CoalitionJoinRequestRecord | undefined {
        return this.coalitionJoinRequests.get(
            InMemoryDb.coalitionMembershipKey(coalitionId, userId)
        );
    }

    upsertCoalitionJoinRequest(
        input: Omit<CoalitionJoinRequestRecord, 'createdAt' | 'updatedAt'>
    ): CoalitionJoinRequestRecord {
        const key = InMemoryDb.coalitionMembershipKey(input.coalitionId, input.userId);
        const existing = this.coalitionJoinRequests.get(key);
        const now = nowIso();
        const record: CoalitionJoinRequestRecord = {
            ...input,
            createdAt: existing?.createdAt ?? now,
            updatedAt: now,
        };
        this.coalitionJoinRequests.set(key, record);
        return record;
    }

    listCoalitionConnections(coalitionId?: string): CoalitionConnectionRecord[] {
        const all = [...this.coalitionConnections.values()];
        return coalitionId ? all.filter((row) => row.coalitionId === coalitionId) : all;
    }

    getCoalitionConnection(
        coalitionId: string,
        platform: string
    ): CoalitionConnectionRecord | undefined {
        return this.coalitionConnections.get(`${coalitionId}::${platform}`);
    }

    upsertCoalitionConnection(
        input: Omit<CoalitionConnectionRecord, 'createdAt' | 'updatedAt'>
    ): CoalitionConnectionRecord {
        const key = `${input.coalitionId}::${input.platform}`;
        const existing = this.coalitionConnections.get(key);
        const now = nowIso();
        const record: CoalitionConnectionRecord = {
            ...input,
            createdAt: existing?.createdAt ?? now,
            updatedAt: now,
        };
        this.coalitionConnections.set(key, record);
        return record;
    }

    listCoalitionMemberConnections(
        filter: { coalitionId?: string; userId?: string } = {}
    ): CoalitionMemberConnectionRecord[] {
        return [...this.coalitionMemberConnections.values()].filter((row) => {
            if (filter.coalitionId && row.coalitionId !== filter.coalitionId) return false;
            if (filter.userId && row.userId !== filter.userId) return false;
            return true;
        });
    }

    upsertCoalitionMemberConnection(
        input: Omit<CoalitionMemberConnectionRecord, 'createdAt' | 'updatedAt'>
    ): CoalitionMemberConnectionRecord {
        const key = `${input.coalitionId}::${input.userId}::${input.platform}`;
        const existing = this.coalitionMemberConnections.get(key);
        const now = nowIso();
        const record: CoalitionMemberConnectionRecord = {
            ...input,
            createdAt: existing?.createdAt ?? now,
            updatedAt: now,
        };
        this.coalitionMemberConnections.set(key, record);
        return record;
    }

    listCoalitionCampaigns(
        filter: { coalitionId?: string; status?: string; type?: string } = {}
    ): CoalitionCampaignRecord[] {
        return [...this.coalitionCampaigns.values()].filter((row) => {
            if (filter.coalitionId && row.coalitionId !== filter.coalitionId) return false;
            if (filter.status && row.status !== filter.status) return false;
            if (filter.type && row.type !== filter.type) return false;
            return true;
        });
    }

    getCoalitionCampaign(id: string): CoalitionCampaignRecord | undefined {
        return this.coalitionCampaigns.get(id);
    }

    upsertCoalitionCampaign(
        input: Omit<CoalitionCampaignRecord, 'createdAt' | 'updatedAt'>
    ): CoalitionCampaignRecord {
        const existing = this.coalitionCampaigns.get(input.id);
        const now = nowIso();
        const record: CoalitionCampaignRecord = {
            ...input,
            createdAt: existing?.createdAt ?? now,
            updatedAt: now,
        };
        this.coalitionCampaigns.set(record.id, record);
        return record;
    }

    listCoalitionCampaignPosts(
        filter: { campaignId?: string; coalitionId?: string } = {}
    ): CoalitionCampaignPostRecord[] {
        return [...this.coalitionCampaignPosts.values()].filter((row) => {
            if (filter.campaignId && row.campaignId !== filter.campaignId) return false;
            if (filter.coalitionId && row.coalitionId !== filter.coalitionId) return false;
            return true;
        });
    }

    getCoalitionCampaignPost(id: string): CoalitionCampaignPostRecord | undefined {
        return this.coalitionCampaignPosts.get(id);
    }

    upsertCoalitionCampaignPost(
        input: Omit<CoalitionCampaignPostRecord, 'createdAt' | 'updatedAt'>
    ): CoalitionCampaignPostRecord {
        const existing = this.coalitionCampaignPosts.get(input.id);
        const now = nowIso();
        const record: CoalitionCampaignPostRecord = {
            ...input,
            createdAt: existing?.createdAt ?? now,
            updatedAt: now,
        };
        this.coalitionCampaignPosts.set(record.id, record);
        return record;
    }

    listCoalitionExternalActivity(
        filter: { campaignId?: string; coalitionId?: string; moderationStatus?: string } = {}
    ): CoalitionExternalActivityRecord[] {
        return [...this.coalitionExternalActivity.values()].filter((row) => {
            if (filter.campaignId && row.campaignId !== filter.campaignId) return false;
            if (filter.coalitionId && row.coalitionId !== filter.coalitionId) return false;
            if (filter.moderationStatus && row.moderationStatus !== filter.moderationStatus) {
                return false;
            }
            return true;
        });
    }

    getCoalitionExternalActivity(id: string): CoalitionExternalActivityRecord | undefined {
        return this.coalitionExternalActivity.get(id);
    }

    upsertCoalitionExternalActivity(
        input: Omit<CoalitionExternalActivityRecord, 'createdAt' | 'updatedAt'>
    ): CoalitionExternalActivityRecord {
        const existing = this.coalitionExternalActivity.get(input.id);
        const now = nowIso();
        const record: CoalitionExternalActivityRecord = {
            ...input,
            createdAt: existing?.createdAt ?? now,
            updatedAt: now,
        };
        this.coalitionExternalActivity.set(record.id, record);
        return record;
    }

    /** Remove a quarantined/reviewed external reply (used by the retention sweeper). */
    deleteCoalitionExternalActivity(id: string): boolean {
        return this.coalitionExternalActivity.delete(id);
    }

    /** Batch form; returns the ids that were actually present and removed. */
    deleteCoalitionExternalActivities(ids: string[]): string[] {
        return ids.filter((id) => this.coalitionExternalActivity.delete(id));
    }

    listCoalitionCampaignSyncOptIns(
        filter: { campaignId?: string; userId?: string; coalitionId?: string } = {}
    ): CoalitionCampaignSyncOptInRecord[] {
        return [...this.coalitionCampaignSyncOptIns.values()].filter((row) => {
            if (filter.campaignId && row.campaignId !== filter.campaignId) return false;
            if (filter.userId && row.userId !== filter.userId) return false;
            if (filter.coalitionId && row.coalitionId !== filter.coalitionId) return false;
            return true;
        });
    }

    upsertCoalitionCampaignSyncOptIn(
        input: Omit<CoalitionCampaignSyncOptInRecord, 'createdAt' | 'updatedAt'>
    ): CoalitionCampaignSyncOptInRecord {
        const key = `${input.campaignId}::${input.userId}::${input.platform}`;
        const existing = this.coalitionCampaignSyncOptIns.get(key);
        const now = nowIso();
        const record: CoalitionCampaignSyncOptInRecord = {
            ...input,
            createdAt: existing?.createdAt ?? now,
            updatedAt: now,
        };
        this.coalitionCampaignSyncOptIns.set(key, record);
        return record;
    }

    listCoalitionSuccessionPetitions(
        filter: { coalitionId?: string; status?: string } = {}
    ): CoalitionSuccessionPetitionRecord[] {
        return [...this.coalitionSuccessionPetitions.values()].filter((row) => {
            if (filter.coalitionId && row.coalitionId !== filter.coalitionId) return false;
            if (filter.status && row.status !== filter.status) return false;
            return true;
        });
    }

    getOpenCoalitionSuccessionPetition(
        coalitionId: string
    ): CoalitionSuccessionPetitionRecord | undefined {
        return [...this.coalitionSuccessionPetitions.values()].find(
            (row) => row.coalitionId === coalitionId && row.status === 'open'
        );
    }

    upsertCoalitionSuccessionPetition(
        input: Omit<CoalitionSuccessionPetitionRecord, 'createdAt' | 'updatedAt'>
    ): CoalitionSuccessionPetitionRecord {
        const existing = this.coalitionSuccessionPetitions.get(input.id);
        const now = nowIso();
        const record: CoalitionSuccessionPetitionRecord = {
            ...input,
            createdAt: existing?.createdAt ?? now,
            updatedAt: now,
        };
        this.coalitionSuccessionPetitions.set(record.id, record);
        return record;
    }

    listCoalitionCampaignPayees(
        filter: { campaignId?: string; coalitionId?: string; userId?: string } = {}
    ): CoalitionCampaignPayeeRecord[] {
        return [...this.coalitionCampaignPayees.values()].filter((row) => {
            if (filter.campaignId && row.campaignId !== filter.campaignId) return false;
            if (filter.coalitionId && row.coalitionId !== filter.coalitionId) return false;
            if (filter.userId && row.userId !== filter.userId) return false;
            return true;
        });
    }

    upsertCoalitionCampaignPayee(
        input: Omit<CoalitionCampaignPayeeRecord, 'createdAt' | 'updatedAt'>
    ): CoalitionCampaignPayeeRecord {
        const key = `${input.campaignId}::${input.userId}`;
        const existing = this.coalitionCampaignPayees.get(key);
        const now = nowIso();
        const record: CoalitionCampaignPayeeRecord = {
            ...input,
            createdAt: existing?.createdAt ?? now,
            updatedAt: now,
        };
        this.coalitionCampaignPayees.set(key, record);
        return record;
    }

    /**
     * The attribution counters for one share.
     *
     * Keyed by what identifies a share rather than by a minted id, so two
     * concurrent visits from the same post increment one row instead of
     * racing to create two.
     */
    listCampaignAttribution(
        filter: { campaignId?: string; coalitionId?: string } = {}
    ): CampaignAttributionRecord[] {
        return [...this.coalitionCampaignAttribution.values()].filter((row) => {
            if (filter.campaignId && row.campaignId !== filter.campaignId) return false;
            if (filter.coalitionId && row.coalitionId !== filter.coalitionId) return false;
            return true;
        });
    }

    upsertCampaignAttribution(
        input: Omit<CampaignAttributionRecord, 'createdAt' | 'updatedAt' | 'id'>
    ): CampaignAttributionRecord {
        const key = `${input.campaignId}::${input.channel}::${input.sharerUserId ?? ''}`;
        const existing = this.coalitionCampaignAttribution.get(key);
        const now = nowIso();
        const record: CampaignAttributionRecord = {
            ...input,
            id: key,
            createdAt: existing?.createdAt ?? now,
            updatedAt: now,
        };
        this.coalitionCampaignAttribution.set(key, record);
        return record;
    }

    /**
     * Engagement counts for one outbound post, or every post of a campaign.
     *
     * Keyed by `campaignPostId` rather than a minted id: there is exactly one
     * current reading per post, and a fresh read replaces it. A synthetic key
     * would let two rows exist for the same post and leave nothing to say which
     * is the count.
     */
    getCampaignEngagement(campaignPostId: string): CampaignEngagementRecord | undefined {
        return this.coalitionCampaignEngagement.get(campaignPostId);
    }

    listCampaignEngagement(
        filter: { campaignId?: string; coalitionId?: string } = {}
    ): CampaignEngagementRecord[] {
        return [...this.coalitionCampaignEngagement.values()].filter((row) => {
            if (filter.campaignId && row.campaignId !== filter.campaignId) return false;
            if (filter.coalitionId && row.coalitionId !== filter.coalitionId) return false;
            return true;
        });
    }

    upsertCampaignEngagement(
        input: Omit<CampaignEngagementRecord, 'createdAt' | 'updatedAt'>
    ): CampaignEngagementRecord {
        const existing = this.coalitionCampaignEngagement.get(input.campaignPostId);
        const now = nowIso();
        const record: CampaignEngagementRecord = {
            ...input,
            id: input.campaignPostId,
            createdAt: existing?.createdAt ?? now,
            updatedAt: now,
        };
        this.coalitionCampaignEngagement.set(record.campaignPostId, record);
        return record;
    }

    listCoalitionCampaignContributions(
        filter: { campaignId?: string; coalitionId?: string; supporterUserId?: string } = {}
    ): CoalitionCampaignContributionRecord[] {
        return [...this.coalitionCampaignContributions.values()].filter((row) => {
            if (filter.campaignId && row.campaignId !== filter.campaignId) return false;
            if (filter.coalitionId && row.coalitionId !== filter.coalitionId) return false;
            if (filter.supporterUserId && row.supporterUserId !== filter.supporterUserId)
                return false;
            return true;
        });
    }

    findCoalitionCampaignContributionByTip(
        tipId: string
    ): CoalitionCampaignContributionRecord | undefined {
        for (const row of this.coalitionCampaignContributions.values()) {
            if (row.tipId === tipId) return row;
        }
        return undefined;
    }

    upsertCoalitionCampaignContribution(
        input: Omit<CoalitionCampaignContributionRecord, 'createdAt' | 'updatedAt'>
    ): CoalitionCampaignContributionRecord {
        const existing = this.coalitionCampaignContributions.get(input.id);
        const now = nowIso();
        const record: CoalitionCampaignContributionRecord = {
            ...input,
            createdAt: existing?.createdAt ?? now,
            updatedAt: now,
        };
        this.coalitionCampaignContributions.set(record.id, record);
        return record;
    }

    listCoalitionBoosts(
        filter: { campaignId?: string; coalitionId?: string; userId?: string; day?: string } = {}
    ): CoalitionBoostRecord[] {
        return [...this.coalitionBoosts.values()].filter((row) => {
            if (filter.campaignId && row.campaignId !== filter.campaignId) return false;
            if (filter.coalitionId && row.coalitionId !== filter.coalitionId) return false;
            if (filter.userId && row.userId !== filter.userId) return false;
            if (filter.day && row.day !== filter.day) return false;
            return true;
        });
    }

    upsertCoalitionBoost(
        input: Omit<CoalitionBoostRecord, 'createdAt' | 'updatedAt'>
    ): CoalitionBoostRecord {
        const key = `${input.campaignId}::${input.userId}::${input.day}`;
        const existing = this.coalitionBoosts.get(key);
        const now = nowIso();
        const record: CoalitionBoostRecord = {
            ...input,
            createdAt: existing?.createdAt ?? now,
            updatedAt: now,
        };
        this.coalitionBoosts.set(key, record);
        return record;
    }

    // --- coalition rings ---

    private static ringMembershipKey(ringId: string, userId: string): string {
        return `${ringId}::${userId}`;
    }

    listCoalitionRings(): CoalitionRingRecord[] {
        return [...this.coalitionRings.values()];
    }

    getCoalitionRing(id: string): CoalitionRingRecord | undefined {
        return this.coalitionRings.get(id);
    }

    upsertCoalitionRing(
        input: Omit<CoalitionRingRecord, 'createdAt' | 'updatedAt'>
    ): CoalitionRingRecord {
        const existing = this.coalitionRings.get(input.id);
        const now = nowIso();
        const record: CoalitionRingRecord = {
            ...input,
            createdAt: existing?.createdAt ?? now,
            updatedAt: now,
        };
        this.coalitionRings.set(record.id, record);
        return record;
    }

    listRingMemberships(ringId?: string): RingMembershipRecord[] {
        const all = [...this.ringMemberships.values()];
        return ringId ? all.filter((m) => m.ringId === ringId) : all;
    }

    upsertRingMembership(
        input: Omit<RingMembershipRecord, 'createdAt' | 'updatedAt'>
    ): RingMembershipRecord {
        const key = InMemoryDb.ringMembershipKey(input.ringId, input.userId);
        const existing = this.ringMemberships.get(key);
        const now = nowIso();
        const record: RingMembershipRecord = {
            ...input,
            createdAt: existing?.createdAt ?? now,
            updatedAt: now,
        };
        this.ringMemberships.set(key, record);
        return record;
    }

    listRingInvitations(
        filter: { ringId?: string; inviteeId?: string } = {}
    ): RingInvitationRecord[] {
        return [...this.ringInvitations.values()].filter((row) => {
            if (filter.ringId && row.ringId !== filter.ringId) return false;
            if (filter.inviteeId && row.inviteeId !== filter.inviteeId) return false;
            return true;
        });
    }

    upsertRingInvitation(
        input: Omit<RingInvitationRecord, 'createdAt' | 'updatedAt'>
    ): RingInvitationRecord {
        const key = InMemoryDb.ringMembershipKey(input.ringId, input.inviteeId);
        const existing = this.ringInvitations.get(key);
        const now = nowIso();
        const record: RingInvitationRecord = {
            ...input,
            createdAt: existing?.createdAt ?? now,
            updatedAt: now,
        };
        this.ringInvitations.set(key, record);
        return record;
    }

    // --- coalition kit applications ---

    listCoalitionKitApplications(
        filter: { scopeType?: string; scopeId?: string } = {}
    ): CoalitionKitApplicationRecord[] {
        return [...this.coalitionKitApplications.values()].filter((row) => {
            if (filter.scopeType && row.scopeType !== filter.scopeType) return false;
            if (filter.scopeId && row.scopeId !== filter.scopeId) return false;
            return true;
        });
    }

    recordCoalitionKitApplication(
        input: Omit<CoalitionKitApplicationRecord, 'createdAt'>
    ): CoalitionKitApplicationRecord {
        const record: CoalitionKitApplicationRecord = { ...input, createdAt: nowIso() };
        this.coalitionKitApplications.set(record.id, record);
        return record;
    }

    // --- coalition den tasks ---

    listCoalitionTasks(filter: { denId?: string } = {}): CoalitionTaskRecord[] {
        return [...this.coalitionTasks.values()].filter((task) =>
            filter.denId ? task.denId === filter.denId : true
        );
    }

    createCoalitionTask(
        input: Omit<CoalitionTaskRecord, 'status' | 'createdAt' | 'updatedAt'>
    ): CoalitionTaskRecord {
        const now = nowIso();
        const record: CoalitionTaskRecord = {
            ...input,
            status: 'todo',
            createdAt: now,
            updatedAt: now,
        };
        this.coalitionTasks.set(record.id, record);
        return record;
    }

    getCoalitionTask(id: string): CoalitionTaskRecord | undefined {
        return this.coalitionTasks.get(id);
    }

    updateCoalitionTaskStatus(
        id: string,
        status: CoalitionTaskRecord['status']
    ): CoalitionTaskRecord | undefined {
        const existing = this.coalitionTasks.get(id);
        if (!existing) return undefined;
        const record: CoalitionTaskRecord = { ...existing, status, updatedAt: nowIso() };
        this.coalitionTasks.set(id, record);
        return record;
    }

    // --- coalition needs board ---

    listCoalitionNeeds(filter: { canopyId?: string } = {}): CoalitionNeedRecord[] {
        return [...this.coalitionNeeds.values()].filter((need) =>
            filter.canopyId ? need.canopyId === filter.canopyId : true
        );
    }

    createCoalitionNeed(
        input: Omit<CoalitionNeedRecord, 'status' | 'createdAt' | 'updatedAt'>
    ): CoalitionNeedRecord {
        const now = nowIso();
        const record: CoalitionNeedRecord = {
            ...input,
            status: 'open',
            createdAt: now,
            updatedAt: now,
        };
        this.coalitionNeeds.set(record.id, record);
        return record;
    }

    getCoalitionNeed(id: string): CoalitionNeedRecord | undefined {
        return this.coalitionNeeds.get(id);
    }

    updateCoalitionNeed(
        id: string,
        patch: Partial<Pick<CoalitionNeedRecord, 'status' | 'fulfilledByListingId' | 'place'>>
    ): CoalitionNeedRecord | undefined {
        const existing = this.coalitionNeeds.get(id);
        if (!existing) return undefined;
        const record: CoalitionNeedRecord = { ...existing, ...patch, updatedAt: nowIso() };
        this.coalitionNeeds.set(id, record);
        return record;
    }

    // --- coalition projects ---

    listCoalitionProjects(filter: { canopyId?: string } = {}): CoalitionProjectRecord[] {
        return [...this.coalitionProjects.values()].filter((project) =>
            filter.canopyId ? project.canopyId === filter.canopyId : true
        );
    }

    createCoalitionProject(
        input: Omit<
            CoalitionProjectRecord,
            'status' | 'createdAt' | 'updatedAt' | 'raisedCents' | 'supporterCount' | 'milestones'
        > &
            Partial<Pick<CoalitionProjectRecord, 'raisedCents' | 'supporterCount' | 'milestones'>>
    ): CoalitionProjectRecord {
        const now = nowIso();
        const record: CoalitionProjectRecord = {
            ...input,
            status: 'proposed',
            raisedCents: input.raisedCents ?? 0,
            supporterCount: input.supporterCount ?? 0,
            milestones: input.milestones ?? [],
            createdAt: now,
            updatedAt: now,
        };
        this.coalitionProjects.set(record.id, record);
        return record;
    }

    getCoalitionProject(id: string): CoalitionProjectRecord | undefined {
        return this.coalitionProjects.get(id);
    }

    updateCoalitionProjectStatus(
        id: string,
        status: CoalitionProjectRecord['status']
    ): CoalitionProjectRecord | undefined {
        const existing = this.coalitionProjects.get(id);
        if (!existing) return undefined;
        const record: CoalitionProjectRecord = { ...existing, status, updatedAt: nowIso() };
        this.coalitionProjects.set(id, record);
        return record;
    }

    /** Patch a project's funding config (goal, use-of-funds, deadline, milestones). */
    updateCoalitionProject(
        id: string,
        patch: Partial<
            Pick<
                CoalitionProjectRecord,
                | 'title'
                | 'description'
                | 'category'
                | 'fundingGoalCents'
                | 'currency'
                | 'useOfFunds'
                | 'deadlineAt'
                | 'milestones'
                | 'place'
            >
        >
    ): CoalitionProjectRecord | undefined {
        const existing = this.coalitionProjects.get(id);
        if (!existing) return undefined;
        const record: CoalitionProjectRecord = { ...existing, ...patch, updatedAt: nowIso() };
        this.coalitionProjects.set(id, record);
        return record;
    }

    // --- coalition project support ledger ---

    listCoalitionProjectSupports(
        filter: { projectId?: string; sinceIso?: string } = {}
    ): CoalitionProjectSupportRecord[] {
        return [...this.coalitionProjectSupports.values()]
            .filter((s) => (filter.projectId ? s.projectId === filter.projectId : true))
            .filter((s) => (filter.sinceIso ? s.createdAt >= filter.sinceIso! : true))
            .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    }

    getCoalitionProjectSupportByTip(tipId: string): CoalitionProjectSupportRecord | undefined {
        return [...this.coalitionProjectSupports.values()].find((s) => s.tipId === tipId);
    }

    addCoalitionProjectSupport(
        input: Omit<CoalitionProjectSupportRecord, 'createdAt'> & { createdAt?: string }
    ): CoalitionProjectSupportRecord {
        const record: CoalitionProjectSupportRecord = {
            ...input,
            createdAt: input.createdAt ?? nowIso(),
        };
        this.coalitionProjectSupports.set(record.id, record);
        return record;
    }

    /**
     * Apply a captured contribution to a project: bump raised + supporter count and
     * persist the milestone list (already evaluated by the service so this layer
     * stays free of domain logic). Returns the updated project, or undefined if it
     * no longer exists.
     */
    applyCoalitionProjectSupport(
        id: string,
        amountCents: number,
        milestones: CoalitionProjectRecord['milestones']
    ): CoalitionProjectRecord | undefined {
        const existing = this.coalitionProjects.get(id);
        if (!existing) return undefined;
        const record: CoalitionProjectRecord = {
            ...existing,
            raisedCents: existing.raisedCents + amountCents,
            supporterCount: existing.supporterCount + 1,
            milestones,
            updatedAt: nowIso(),
        };
        this.coalitionProjects.set(id, record);
        return record;
    }

    // --- coalition surges ---

    listCoalitionSurges(
        filter: { projectId?: string; status?: string } = {}
    ): CoalitionSurgeRecord[] {
        return [...this.coalitionSurges.values()]
            .filter((s) => (filter.projectId ? s.projectId === filter.projectId : true))
            .filter((s) => (filter.status ? s.status === filter.status : true))
            .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
    }

    getOpenCoalitionSurge(projectId: string): CoalitionSurgeRecord | undefined {
        return [...this.coalitionSurges.values()].find(
            (s) => s.projectId === projectId && s.status === 'open'
        );
    }

    upsertCoalitionSurge(
        input: Omit<CoalitionSurgeRecord, 'createdAt' | 'updatedAt'> & {
            createdAt?: string;
            updatedAt?: string;
        }
    ): CoalitionSurgeRecord {
        const now = nowIso();
        const existing = this.coalitionSurges.get(input.id);
        const record: CoalitionSurgeRecord = {
            ...input,
            createdAt: existing?.createdAt ?? input.createdAt ?? now,
            updatedAt: now,
        };
        this.coalitionSurges.set(record.id, record);
        return record;
    }

    // --- coalition notifications (Coalition-scoped inbox) ---

    listCoalitionNotifications(filter: {
        recipientUserId: string;
        unreadOnly?: boolean;
        limit?: number;
    }): CoalitionNotificationRecord[] {
        const rows = [...this.coalitionNotifications.values()]
            .filter((n) => n.recipientUserId === filter.recipientUserId)
            .filter((n) => (filter.unreadOnly ? !n.readAt : true))
            .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
        return filter.limit ? rows.slice(0, filter.limit) : rows;
    }

    addCoalitionNotification(
        input: Omit<CoalitionNotificationRecord, 'createdAt'> & { createdAt?: string }
    ): CoalitionNotificationRecord {
        const record: CoalitionNotificationRecord = {
            ...input,
            createdAt: input.createdAt ?? nowIso(),
        };
        this.coalitionNotifications.set(record.id, record);
        return record;
    }

    /** Mark a notification read. Scoped by recipient so a user can't ack another's. */
    markCoalitionNotificationRead(
        id: string,
        recipientUserId: string
    ): CoalitionNotificationRecord | undefined {
        const existing = this.coalitionNotifications.get(id);
        if (!existing || existing.recipientUserId !== recipientUserId) return undefined;
        if (existing.readAt) return existing;
        const record: CoalitionNotificationRecord = { ...existing, readAt: nowIso() };
        this.coalitionNotifications.set(id, record);
        return record;
    }

    // --- coalition resource registry ---

    listCoalitionResources(filter: { canopyId?: string } = {}): CoalitionResourceRecord[] {
        return [...this.coalitionResources.values()].filter((resource) =>
            filter.canopyId ? resource.canopyId === filter.canopyId : true
        );
    }

    createCoalitionResource(
        input: Omit<CoalitionResourceRecord, 'availability' | 'createdAt' | 'updatedAt'> & {
            availability?: CoalitionResourceRecord['availability'];
        }
    ): CoalitionResourceRecord {
        const now = nowIso();
        const record: CoalitionResourceRecord = {
            ...input,
            availability: input.availability ?? 'available',
            createdAt: now,
            updatedAt: now,
        };
        this.coalitionResources.set(record.id, record);
        return record;
    }

    getCoalitionResource(id: string): CoalitionResourceRecord | undefined {
        return this.coalitionResources.get(id);
    }

    /**
     * Patch a resource. Was availability-only; widened when resources gained a
     * `place`, since a greenhouse that moves — or one whose steward only pins it
     * later — has to be able to say so without re-registering.
     */
    updateCoalitionResource(
        id: string,
        patch: Partial<Pick<CoalitionResourceRecord, 'availability' | 'location' | 'place'>>
    ): CoalitionResourceRecord | undefined {
        const existing = this.coalitionResources.get(id);
        if (!existing) return undefined;
        const record: CoalitionResourceRecord = { ...existing, ...patch, updatedAt: nowIso() };
        this.coalitionResources.set(id, record);
        return record;
    }

    // --- creator content lifecycle ---

    listCreatorContent(
        filter: { creatorId?: string; status?: CreatorContentRecord['status'] } = {}
    ): CreatorContentRecord[] {
        return [...this.creatorContent.values()].filter(
            (content) =>
                (filter.creatorId ? content.creatorId === filter.creatorId : true) &&
                (filter.status ? content.status === filter.status : true)
        );
    }

    getCreatorContent(id: string): CreatorContentRecord | undefined {
        return this.creatorContent.get(id);
    }

    createCreatorContent(
        input: Omit<CreatorContentRecord, 'status' | 'createdAt' | 'updatedAt' | 'publishedAt'> & {
            status?: CreatorContentRecord['status'];
        }
    ): CreatorContentRecord {
        const now = nowIso();
        const status = input.status ?? 'draft';
        const record: CreatorContentRecord = {
            ...input,
            status,
            publishedAt: status === 'published' ? now : undefined,
            createdAt: now,
            updatedAt: now,
        };
        this.creatorContent.set(record.id, record);
        return record;
    }

    updateCreatorContent(
        id: string,
        patch: Partial<
            Pick<
                CreatorContentRecord,
                'title' | 'body' | 'mediaUrl' | 'status' | 'scheduledFor' | 'publishedAt'
            >
        >
    ): CreatorContentRecord | undefined {
        const existing = this.creatorContent.get(id);
        if (!existing) return undefined;
        const record: CreatorContentRecord = { ...existing, ...patch, updatedAt: nowIso() };
        this.creatorContent.set(id, record);
        return record;
    }

    /** Flip a scheduled item to published once its scheduledFor has passed. */
    listDueScheduledContent(asOf: string = nowIso()): CreatorContentRecord[] {
        return [...this.creatorContent.values()].filter(
            (content) =>
                content.status === 'scheduled' &&
                content.scheduledFor !== undefined &&
                content.scheduledFor <= asOf
        );
    }

    listContentDistributions(filter: { contentId?: string } = {}): ContentDistributionRecord[] {
        return [...this.contentDistributions.values()].filter((dist) =>
            filter.contentId ? dist.contentId === filter.contentId : true
        );
    }

    addContentDistribution(
        input: Omit<ContentDistributionRecord, 'createdAt'>
    ): ContentDistributionRecord {
        const record: ContentDistributionRecord = { ...input, createdAt: nowIso() };
        this.contentDistributions.set(record.id, record);
        return record;
    }

    // --- marketplace product reviews + versions ---

    listProductReviews(filter: { providerId: string; listingId: string }): ProductReviewRecord[] {
        return [...this.productReviews.values()].filter(
            (review) =>
                review.providerId === filter.providerId && review.listingId === filter.listingId
        );
    }

    /**
     * Upsert a review: one per (provider, listing, author). A repeat review from
     * the same author updates their existing row (stable id) so the durable
     * write-through stays an id-keyed upsert.
     */
    upsertProductReview(
        input: Omit<ProductReviewRecord, 'createdAt' | 'updatedAt'>
    ): ProductReviewRecord {
        const now = nowIso();
        const existing = [...this.productReviews.values()].find(
            (review) =>
                review.providerId === input.providerId &&
                review.listingId === input.listingId &&
                review.authorId === input.authorId
        );
        const record: ProductReviewRecord = existing
            ? { ...existing, rating: input.rating, body: input.body, updatedAt: now }
            : { ...input, createdAt: now, updatedAt: now };
        this.productReviews.set(record.id, record);
        return record;
    }

    listProductVersions(filter: { providerId: string; listingId: string }): ProductVersionRecord[] {
        return [...this.productVersions.values()].filter(
            (version) =>
                version.providerId === filter.providerId && version.listingId === filter.listingId
        );
    }

    addProductVersion(
        input: Omit<ProductVersionRecord, 'releasedAt'> & { releasedAt?: string }
    ): ProductVersionRecord {
        const record: ProductVersionRecord = { ...input, releasedAt: input.releasedAt ?? nowIso() };
        this.productVersions.set(record.id, record);
        return record;
    }

    // --- ecosystem bounties ---

    listBounties(
        filter: { category?: string; status?: string; coalitionId?: string } = {}
    ): BountyRecord[] {
        return [...this.bounties.values()].filter(
            (bounty) =>
                (filter.category ? bounty.category === filter.category : true) &&
                (filter.status ? bounty.status === filter.status : true) &&
                (filter.coalitionId ? bounty.coalitionId === filter.coalitionId : true)
        );
    }

    createBounty(
        input: Omit<
            BountyRecord,
            'status' | 'claimedBy' | 'createdAt' | 'updatedAt' | 'requirements' | 'deliverables'
        > & { requirements?: string[]; deliverables?: string[] }
    ): BountyRecord {
        const now = nowIso();
        const record: BountyRecord = {
            ...input,
            requirements: input.requirements ?? [],
            deliverables: input.deliverables ?? [],
            status: 'open',
            createdAt: now,
            updatedAt: now,
        };
        this.bounties.set(record.id, record);
        return record;
    }

    updateBountyStatus(id: string, status: BountyRecord['status']): BountyRecord | undefined {
        const existing = this.bounties.get(id);
        if (!existing) return undefined;
        const record: BountyRecord = { ...existing, status, updatedAt: nowIso() };
        this.bounties.set(id, record);
        return record;
    }

    /** Claim an open bounty. Returns undefined when missing or not currently open. */
    claimBounty(id: string, userId: string): BountyRecord | undefined {
        const existing = this.bounties.get(id);
        if (!existing || existing.status !== 'open') return undefined;
        const record: BountyRecord = {
            ...existing,
            status: 'claimed',
            claimedBy: userId,
            updatedAt: nowIso(),
        };
        this.bounties.set(id, record);
        return record;
    }

    // --- bounty applications (producer ↔ creator matching) ---

    listBountyApplications(
        filter: { bountyId?: string; applicantId?: string } = {}
    ): BountyApplicationRecord[] {
        return [...this.bountyApplications.values()].filter(
            (app) =>
                (filter.bountyId ? app.bountyId === filter.bountyId : true) &&
                (filter.applicantId ? app.applicantId === filter.applicantId : true)
        );
    }

    /**
     * Apply to an open bounty. Returns `'not_open'` when the bounty is missing or
     * not open, `'duplicate'` when the applicant already has a pending application,
     * otherwise the created record.
     */
    createBountyApplication(input: {
        id: string;
        bountyId: string;
        applicantId: string;
        message?: string;
    }): BountyApplicationRecord | 'not_open' | 'duplicate' {
        const bounty = this.bounties.get(input.bountyId);
        if (!bounty || bounty.status !== 'open') return 'not_open';
        const already = [...this.bountyApplications.values()].some(
            (app) =>
                app.bountyId === input.bountyId &&
                app.applicantId === input.applicantId &&
                app.status === 'pending'
        );
        if (already) return 'duplicate';
        const now = nowIso();
        const record: BountyApplicationRecord = {
            ...input,
            status: 'pending',
            createdAt: now,
            updatedAt: now,
        };
        this.bountyApplications.set(record.id, record);
        return record;
    }

    /**
     * Poster accepts an applicant: that application is accepted, the bounty is
     * claimed by the applicant, and every other pending application for the same
     * bounty is declined. Returns undefined when no matching pending application
     * exists or the bounty is no longer open.
     */
    acceptBountyApplication(
        bountyId: string,
        applicantId: string
    ): { bounty: BountyRecord; application: BountyApplicationRecord } | undefined {
        const bounty = this.bounties.get(bountyId);
        if (!bounty || bounty.status !== 'open') return undefined;
        const target = [...this.bountyApplications.values()].find(
            (app) =>
                app.bountyId === bountyId &&
                app.applicantId === applicantId &&
                app.status === 'pending'
        );
        if (!target) return undefined;
        const now = nowIso();
        const accepted: BountyApplicationRecord = { ...target, status: 'accepted', updatedAt: now };
        this.bountyApplications.set(accepted.id, accepted);
        for (const app of this.bountyApplications.values()) {
            if (app.bountyId === bountyId && app.id !== accepted.id && app.status === 'pending') {
                this.bountyApplications.set(app.id, { ...app, status: 'declined', updatedAt: now });
            }
        }
        const claimed: BountyRecord = {
            ...bounty,
            status: 'claimed',
            claimedBy: applicantId,
            updatedAt: now,
        };
        this.bounties.set(claimed.id, claimed);
        return { bounty: claimed, application: accepted };
    }

    // --- seller map locations ---

    listSellerLocations(filter: { onlyVisible?: boolean } = {}): SellerLocationRecord[] {
        return [...this.sellerLocations.values()].filter((location) =>
            filter.onlyVisible ? location.isVisible : true
        );
    }

    upsertSellerLocation(
        input: Omit<SellerLocationRecord, 'createdAt' | 'updatedAt'>
    ): SellerLocationRecord {
        const existing = this.sellerLocations.get(input.id);
        const now = nowIso();
        const record: SellerLocationRecord = {
            ...input,
            createdAt: existing?.createdAt ?? now,
            updatedAt: now,
        };
        this.sellerLocations.set(record.id, record);
        return record;
    }

    // --- seller/producer profiles ---

    private sellerProfileKey(userId: string, providerId: string): string {
        return `${userId}::${providerId}`;
    }

    getSellerProfile(userId: string, providerId: string): SellerProfileRecord | undefined {
        return this.marketplaceSellerProfiles.get(this.sellerProfileKey(userId, providerId));
    }

    upsertSellerProfile(input: Omit<SellerProfileRecord, 'updatedAt'>): SellerProfileRecord {
        const record: SellerProfileRecord = { ...input, updatedAt: nowIso() };
        this.marketplaceSellerProfiles.set(
            this.sellerProfileKey(record.userId, record.providerId),
            record
        );
        return record;
    }

    // --- coalition feed items ---

    listCoalitionFeedItems(
        filter: { canopyId?: string; denId?: string; kind?: CoalitionFeedItemRecord['kind'] } = {}
    ): CoalitionFeedItemRecord[] {
        return [...this.coalitionFeedItems.values()].filter((item) => {
            if (filter.canopyId && item.canopyId !== filter.canopyId) return false;
            if (filter.denId && item.denId !== filter.denId) return false;
            if (filter.kind && item.kind !== filter.kind) return false;
            return true;
        });
    }

    upsertCoalitionFeedItem(
        input: Omit<CoalitionFeedItemRecord, 'updatedAt'>
    ): CoalitionFeedItemRecord {
        const record: CoalitionFeedItemRecord = { ...input, updatedAt: nowIso() };
        this.coalitionFeedItems.set(record.id, record);
        return record;
    }

    /** Single feed-item lookup (used by the like/comment routes to 404 unknown ids). */
    getCoalitionFeedItem(id: string): CoalitionFeedItemRecord | undefined {
        return this.coalitionFeedItems.get(id);
    }

    private static feedLikeKey(feedItemId: string, userId: string): string {
        return `${feedItemId}::${userId}`;
    }

    listCoalitionFeedLikes(feedItemId: string): CoalitionFeedLikeRecord[] {
        return [...this.coalitionFeedLikes.values()].filter((r) => r.feedItemId === feedItemId);
    }

    /** Idempotent on `(feedItemId, userId)`: re-liking/unliking flips `active`, never duplicates. */
    upsertCoalitionFeedLike(
        input: Omit<CoalitionFeedLikeRecord, 'createdAt' | 'updatedAt'>
    ): CoalitionFeedLikeRecord {
        const key = InMemoryDb.feedLikeKey(input.feedItemId, input.userId);
        const existing = this.coalitionFeedLikes.get(key);
        const now = nowIso();
        const record: CoalitionFeedLikeRecord = {
            ...input,
            id: existing?.id ?? input.id,
            createdAt: existing?.createdAt ?? now,
            updatedAt: now,
        };
        this.coalitionFeedLikes.set(key, record);
        return record;
    }

    listCoalitionFeedComments(feedItemId: string): CoalitionFeedCommentRecord[] {
        // createdAt has millisecond resolution, so comments written in the same
        // tick tie. Reversing insertion order before the stable sort makes ties
        // come out newest-inserted first, keeping the list strictly newest-first.
        return [...this.coalitionFeedComments.values()]
            .filter((r) => r.feedItemId === feedItemId)
            .reverse()
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }

    createCoalitionFeedComment(
        input: Omit<CoalitionFeedCommentRecord, 'createdAt'>
    ): CoalitionFeedCommentRecord {
        const record: CoalitionFeedCommentRecord = { ...input, createdAt: nowIso() };
        this.coalitionFeedComments.set(record.id, record);
        return record;
    }

    // --- circle graph (the two rings' inner edge) ---

    private static circleKey(followerId: string, followeeId: string): string {
        return `${followerId}::${followeeId}`;
    }

    /** Idempotent: re-adding an existing edge returns it rather than duplicating. */
    addCircleEdge(input: Omit<CircleEdgeRecord, 'createdAt'>): CircleEdgeRecord {
        const key = InMemoryDb.circleKey(input.followerId, input.followeeId);
        const existing = this.circleEdges.get(key);
        if (existing) return existing;
        const record: CircleEdgeRecord = { ...input, createdAt: nowIso() };
        this.circleEdges.set(key, record);
        return record;
    }

    /** True when an edge existed and was removed. Circle edges *are* deleted —
     * unlike relays, a withdrawn follow leaves no history anyone is owed. */
    removeCircleEdge(followerId: string, followeeId: string): boolean {
        return this.circleEdges.delete(InMemoryDb.circleKey(followerId, followeeId));
    }

    getCircleEdge(followerId: string, followeeId: string): CircleEdgeRecord | undefined {
        return this.circleEdges.get(InMemoryDb.circleKey(followerId, followeeId));
    }

    /** Edges where `followerId` is the follower — the people in their Circle. */
    listCircleFollowing(followerId: string): CircleEdgeRecord[] {
        return [...this.circleEdges.values()]
            .filter((e) => e.followerId === followerId)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }

    /** Edges where `followeeId` is the followee — people who hold them in theirs. */
    listCircleFollowers(followeeId: string): CircleEdgeRecord[] {
        return [...this.circleEdges.values()]
            .filter((e) => e.followeeId === followeeId)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }

    // --- relay edges (the chain the feed renders as [You] -> [X] -> [Y]) ---

    private static relayKey(
        relayerUserId: string,
        subjectSource: string,
        subjectId: string
    ): string {
        return `${relayerUserId}::${subjectSource}::${subjectId}`;
    }

    /**
     * Idempotent on `(relayerUserId, subjectSource, subjectId)`: re-relaying a
     * subject you already relayed reactivates your existing edge rather than
     * minting a second one, so a person appears at most once in any chain.
     */
    upsertRelayEdge(input: Omit<RelayEdgeRecord, 'createdAt' | 'updatedAt'>): RelayEdgeRecord {
        const key = InMemoryDb.relayKey(input.relayerUserId, input.subjectSource, input.subjectId);
        const existing = this.relayEdges.get(key);
        const now = nowIso();
        const record: RelayEdgeRecord = {
            ...input,
            id: existing?.id ?? input.id,
            // A re-relay keeps the chain it was first minted with; re-parenting
            // an existing edge would rewrite history other people already saw.
            parentRelayId: existing?.parentRelayId ?? input.parentRelayId,
            rootRelayId: existing?.rootRelayId ?? input.rootRelayId,
            chainDepth: existing?.chainDepth ?? input.chainDepth,
            createdAt: existing?.createdAt ?? now,
            updatedAt: now,
        };
        this.relayEdges.set(key, record);
        return record;
    }

    getRelayEdge(id: string): RelayEdgeRecord | undefined {
        for (const edge of this.relayEdges.values()) {
            if (edge.id === id) return edge;
        }
        return undefined;
    }

    findRelayEdge(
        relayerUserId: string,
        subjectSource: string,
        subjectId: string
    ): RelayEdgeRecord | undefined {
        return this.relayEdges.get(InMemoryDb.relayKey(relayerUserId, subjectSource, subjectId));
    }

    /** Active edges authored by any of `relayerUserIds`, newest first. The Reach query. */
    listRelayEdgesByRelayers(relayerUserIds: readonly string[]): RelayEdgeRecord[] {
        const relayers = new Set(relayerUserIds);
        return [...this.relayEdges.values()]
            .filter((e) => e.active && relayers.has(e.relayerUserId))
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }

    /** Every edge on a subject, active or not — powers "+N others relayed". */
    listRelayEdgesForSubject(subjectSource: string, subjectId: string): RelayEdgeRecord[] {
        return [...this.relayEdges.values()]
            .filter((e) => e.subjectSource === subjectSource && e.subjectId === subjectId)
            .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    }

    // --- community assets (user-made stickers, memes and coins) ---

    getCommunityAsset(id: string): CommunityAssetRecord | undefined {
        return this.communityAssets.get(id);
    }

    listCommunityAssets(filter: { status?: string; kind?: string; creatorId?: string } = {}) {
        return [...this.communityAssets.values()]
            .filter((a) => (filter.status ? a.status === filter.status : true))
            .filter((a) => (filter.kind ? a.kind === filter.kind : true))
            .filter((a) => (filter.creatorId ? a.creatorId === filter.creatorId : true))
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }

    /** Upsert by id. `creatorId` is never rewritten once set — it is authorship. */
    upsertCommunityAsset(
        input: Omit<CommunityAssetRecord, 'createdAt' | 'updatedAt'>
    ): CommunityAssetRecord {
        const existing = this.communityAssets.get(input.id);
        const now = nowIso();
        const record: CommunityAssetRecord = {
            ...input,
            creatorId: existing?.creatorId ?? input.creatorId,
            createdAt: existing?.createdAt ?? now,
            updatedAt: now,
        };
        this.communityAssets.set(record.id, record);
        return record;
    }

    /** Highest founding ordinal handed out for a kind, so the next is +1. */
    highestFoundingOrdinal(kind: string): number {
        let highest = 0;
        for (const asset of this.communityAssets.values()) {
            if (asset.kind !== kind) continue;
            if (asset.foundingOrdinal !== null && asset.foundingOrdinal > highest) {
                highest = asset.foundingOrdinal;
            }
        }
        return highest;
    }

    listCommunityAssetReports(assetId?: string): CommunityAssetReportRecord[] {
        return [...this.communityAssetReports.values()]
            .filter((r) => (assetId ? r.assetId === assetId : true))
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }

    /** Idempotent per (asset, reporter): re-reporting updates rather than piles up. */
    upsertCommunityAssetReport(
        input: Omit<CommunityAssetReportRecord, 'createdAt' | 'updatedAt'>
    ): CommunityAssetReportRecord {
        const key = `${input.assetId}::${input.reporterId}`;
        const existing = this.communityAssetReports.get(key);
        const now = nowIso();
        const record: CommunityAssetReportRecord = {
            ...input,
            id: existing?.id ?? input.id,
            createdAt: existing?.createdAt ?? now,
            updatedAt: now,
        };
        this.communityAssetReports.set(key, record);
        return record;
    }

    // --- member profiles and walls ---

    getMemberProfile(userId: string): MemberProfileRecord | undefined {
        return this.memberProfiles.get(userId);
    }

    /** Upsert by user id. `memberSince` is stamped once and never rewritten. */
    upsertMemberProfile(input: MemberProfileRecord): MemberProfileRecord {
        const existing = this.memberProfiles.get(input.userId);
        const record: MemberProfileRecord = {
            ...input,
            memberSince: existing?.memberSince ?? input.memberSince,
        };
        this.memberProfiles.set(record.userId, record);
        return record;
    }

    /** Posts on one person's wall, newest first. */
    listProfileWallPosts(profileUserId: string): ProfileWallPostRecord[] {
        return [...this.profileWallPosts.values()]
            .filter((p) => p.profileUserId === profileUserId)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }

    getProfileWallPost(id: string): ProfileWallPostRecord | undefined {
        return this.profileWallPosts.get(id);
    }

    /** Everything one person wrote, on any wall, newest first. */
    listProfileWallPostsByAuthor(authorId: string): ProfileWallPostRecord[] {
        return [...this.profileWallPosts.values()]
            .filter((p) => p.authorId === authorId)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }

    createProfileWallPost(input: ProfileWallPostRecord): ProfileWallPostRecord {
        this.profileWallPosts.set(input.id, input);
        return input;
    }

    // --- plugin installations (activation-at-scope) ---

    createPluginInstallation(
        input: Omit<PluginInstallationRecord, 'installedAt' | 'updatedAt'>
    ): PluginInstallationRecord {
        const now = nowIso();
        const record: PluginInstallationRecord = { ...input, installedAt: now, updatedAt: now };
        this.pluginInstallations.set(record.id, record);
        return record;
    }

    getPluginInstallation(id: string): PluginInstallationRecord | undefined {
        return this.pluginInstallations.get(id);
    }

    /** Enforces the (pluginId, scopeType, scopeId) uniqueness constraint. */
    findPluginInstallation(
        pluginId: string,
        scopeType: PluginInstallationRecord['scopeType'],
        scopeId: string
    ): PluginInstallationRecord | undefined {
        return [...this.pluginInstallations.values()].find(
            (row) =>
                row.pluginId === pluginId && row.scopeType === scopeType && row.scopeId === scopeId
        );
    }

    listPluginInstallationsForScope(
        scopeType: PluginInstallationRecord['scopeType'],
        scopeId: string
    ): PluginInstallationRecord[] {
        return [...this.pluginInstallations.values()].filter(
            (row) => row.scopeType === scopeType && row.scopeId === scopeId
        );
    }

    listPluginInstallationsForPlugin(pluginId: string): PluginInstallationRecord[] {
        return [...this.pluginInstallations.values()].filter((row) => row.pluginId === pluginId);
    }

    listAllPluginInstallations(): PluginInstallationRecord[] {
        return [...this.pluginInstallations.values()];
    }

    updatePluginInstallation(
        id: string,
        patch: Partial<Omit<PluginInstallationRecord, 'id' | 'installedAt'>>
    ): PluginInstallationRecord | undefined {
        const existing = this.pluginInstallations.get(id);
        if (!existing) return undefined;
        const updated: PluginInstallationRecord = { ...existing, ...patch, updatedAt: nowIso() };
        this.pluginInstallations.set(id, updated);
        return updated;
    }

    deletePluginInstallation(id: string): boolean {
        return this.pluginInstallations.delete(id);
    }

    // --- plugin dens (Phase 5 den factory) ---

    createPluginDen(input: Omit<PluginDenRecord, 'createdAt'>): PluginDenRecord {
        const record: PluginDenRecord = { ...input, createdAt: nowIso() };
        this.pluginDens.set(record.id, record);
        return record;
    }

    /** Enforces the (installationId, purpose) uniqueness constraint. */
    findPluginDen(installationId: string, purpose: string): PluginDenRecord | undefined {
        return [...this.pluginDens.values()].find(
            (row) => row.installationId === installationId && row.purpose === purpose
        );
    }

    listPluginDensForInstallation(installationId: string): PluginDenRecord[] {
        return [...this.pluginDens.values()].filter((row) => row.installationId === installationId);
    }

    listPluginDensForPlugin(pluginId: string): PluginDenRecord[] {
        return [...this.pluginDens.values()].filter((row) => row.pluginId === pluginId);
    }

    // --- coalition kit applications (Phase 4) ---

    createCoalitionKitManifestApplication(
        input: Omit<CoalitionKitManifestApplicationRecord, 'createdAt' | 'updatedAt'>
    ): CoalitionKitManifestApplicationRecord {
        const now = nowIso();
        const record: CoalitionKitManifestApplicationRecord = {
            ...input,
            createdAt: now,
            updatedAt: now,
        };
        this.coalitionKitManifestApplications.set(record.id, record);
        return record;
    }

    /** Enforces the (coalitionId, kitId) uniqueness constraint. */
    findCoalitionKitManifestApplication(
        coalitionId: string,
        kitId: string
    ): CoalitionKitManifestApplicationRecord | undefined {
        return [...this.coalitionKitManifestApplications.values()].find(
            (row) => row.coalitionId === coalitionId && row.kitId === kitId
        );
    }

    listCoalitionKitManifestApplications(
        coalitionId: string
    ): CoalitionKitManifestApplicationRecord[] {
        return [...this.coalitionKitManifestApplications.values()].filter(
            (row) => row.coalitionId === coalitionId
        );
    }

    updateCoalitionKitManifestApplication(
        id: string,
        patch: Partial<Omit<CoalitionKitManifestApplicationRecord, 'id' | 'createdAt'>>
    ): CoalitionKitManifestApplicationRecord | undefined {
        const existing = this.coalitionKitManifestApplications.get(id);
        if (!existing) return undefined;
        const updated: CoalitionKitManifestApplicationRecord = {
            ...existing,
            ...patch,
            updatedAt: nowIso(),
        };
        this.coalitionKitManifestApplications.set(id, updated);
        return updated;
    }

    // --- plugin social (Phase 6) ---

    upsertPluginReview(
        input: Omit<PluginReviewRecord, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
    ): PluginReviewRecord {
        const now = nowIso();
        const existing = [...this.pluginReviews.values()].find(
            (row) => row.pluginId === input.pluginId && row.userId === input.userId
        );
        if (existing) {
            const updated: PluginReviewRecord = {
                ...existing,
                rating: input.rating,
                body: input.body,
                providerListingId: input.providerListingId,
                updatedAt: now,
            };
            this.pluginReviews.set(existing.id, updated);
            return updated;
        }
        const record: PluginReviewRecord = {
            id: input.id ?? crypto.randomUUID(),
            pluginId: input.pluginId,
            providerListingId: input.providerListingId,
            userId: input.userId,
            rating: input.rating,
            body: input.body,
            createdAt: now,
            updatedAt: now,
        };
        this.pluginReviews.set(record.id, record);
        return record;
    }

    listPluginReviews(pluginId: string): PluginReviewRecord[] {
        return [...this.pluginReviews.values()].filter((row) => row.pluginId === pluginId);
    }

    createPluginFork(input: Omit<PluginForkRecord, 'createdAt'>): PluginForkRecord {
        const record: PluginForkRecord = { ...input, createdAt: nowIso() };
        this.pluginForks.set(record.id, record);
        return record;
    }

    listPluginForks(forkedFromPluginId: string): PluginForkRecord[] {
        return [...this.pluginForks.values()].filter(
            (row) => row.forkedFromPluginId === forkedFromPluginId
        );
    }

    createPluginShowcase(input: Omit<PluginShowcaseRecord, 'createdAt'>): PluginShowcaseRecord {
        const record: PluginShowcaseRecord = { ...input, createdAt: nowIso() };
        this.pluginShowcases.set(record.id, record);
        return record;
    }

    listPluginShowcasesForScope(scopeType: string, scopeId: string): PluginShowcaseRecord[] {
        return [...this.pluginShowcases.values()].filter(
            (row) => row.scopeType === scopeType && row.scopeId === scopeId
        );
    }

    // --- Coliseum ---

    private static coliseumVoteKey(argumentId: string, voterId: string): string {
        return `${argumentId}::${voterId}`;
    }

    listColiseumTopics(): ColiseumTopicRecord[] {
        return [...this.coliseumTopics.values()];
    }

    getColiseumTopic(id: string): ColiseumTopicRecord | undefined {
        return this.coliseumTopics.get(id);
    }

    upsertColiseumTopic(record: ColiseumTopicRecord): ColiseumTopicRecord {
        this.coliseumTopics.set(record.id, record);
        return record;
    }

    // --- coliseum challenges ---

    listColiseumChallenges(
        filter: { status?: ColiseumChallengeRecord['status'] } = {}
    ): ColiseumChallengeRecord[] {
        return [...this.coliseumChallenges.values()].filter((challenge) =>
            filter.status ? challenge.status === filter.status : true
        );
    }

    getColiseumChallenge(id: string): ColiseumChallengeRecord | undefined {
        return this.coliseumChallenges.get(id);
    }

    createColiseumChallenge(
        input: Omit<ColiseumChallengeRecord, 'status' | 'createdAt' | 'updatedAt'>
    ): ColiseumChallengeRecord {
        const now = nowIso();
        const record: ColiseumChallengeRecord = {
            ...input,
            status: 'open',
            createdAt: now,
            updatedAt: now,
        };
        this.coliseumChallenges.set(record.id, record);
        return record;
    }

    updateColiseumChallengeStatus(
        id: string,
        status: ColiseumChallengeRecord['status']
    ): ColiseumChallengeRecord | undefined {
        const existing = this.coliseumChallenges.get(id);
        if (!existing) return undefined;
        const record: ColiseumChallengeRecord = { ...existing, status, updatedAt: nowIso() };
        this.coliseumChallenges.set(id, record);
        return record;
    }

    listChallengeEntries(filter: { challengeId?: string } = {}): ChallengeEntryRecord[] {
        return [...this.challengeEntries.values()].filter((entry) =>
            filter.challengeId ? entry.challengeId === filter.challengeId : true
        );
    }

    /** Keyed lookup — the map is already indexed by id, so no scan is needed. */
    getChallengeEntry(entryId: string): ChallengeEntryRecord | undefined {
        return this.challengeEntries.get(entryId);
    }

    createChallengeEntry(input: Omit<ChallengeEntryRecord, 'createdAt'>): ChallengeEntryRecord {
        const record: ChallengeEntryRecord = { ...input, createdAt: nowIso() };
        this.challengeEntries.set(record.id, record);
        return record;
    }

    /** Replace an entry wholesale (used to attach its discussion den). */
    upsertChallengeEntry(record: ChallengeEntryRecord): ChallengeEntryRecord {
        this.challengeEntries.set(record.id, record);
        return record;
    }

    listChallengeVotes(filter: { entryId?: string } = {}): ChallengeVoteRecord[] {
        return [...this.challengeVotes.values()].filter((vote) =>
            filter.entryId ? vote.entryId === filter.entryId : true
        );
    }

    /** Add a vote; idempotent per (entry, voter) so a repeat vote reuses its id. */
    addChallengeVote(input: Omit<ChallengeVoteRecord, 'createdAt'>): ChallengeVoteRecord {
        const existing = [...this.challengeVotes.values()].find(
            (vote) => vote.entryId === input.entryId && vote.voterId === input.voterId
        );
        const record: ChallengeVoteRecord = existing ?? { ...input, createdAt: nowIso() };
        this.challengeVotes.set(record.id, record);
        return record;
    }

    listColiseumArguments(): ColiseumArgumentRecord[] {
        return [...this.coliseumArguments.values()];
    }

    getColiseumArgument(id: string): ColiseumArgumentRecord | undefined {
        return this.coliseumArguments.get(id);
    }

    upsertColiseumArgument(record: ColiseumArgumentRecord): ColiseumArgumentRecord {
        this.coliseumArguments.set(record.id, record);
        return record;
    }

    /** Bulk upsert so a score recompute persists once rather than per-argument. */
    upsertColiseumArguments(records: readonly ColiseumArgumentRecord[]): void {
        for (const record of records) this.coliseumArguments.set(record.id, record);
    }

    listColiseumVotes(): ColiseumVoteRecord[] {
        return [...this.coliseumVotes.values()];
    }

    getColiseumVote(argumentId: string, voterId: string): ColiseumVoteRecord | undefined {
        return this.coliseumVotes.get(InMemoryDb.coliseumVoteKey(argumentId, voterId));
    }

    upsertColiseumVote(record: ColiseumVoteRecord): ColiseumVoteRecord {
        this.coliseumVotes.set(
            InMemoryDb.coliseumVoteKey(record.argumentId, record.voterId),
            record
        );
        return record;
    }

    listColiseumLiveSessions(): ColiseumLiveSessionRecord[] {
        return [...this.coliseumLiveSessions.values()];
    }

    getColiseumLiveSession(id: string): ColiseumLiveSessionRecord | undefined {
        return this.coliseumLiveSessions.get(id);
    }

    upsertColiseumLiveSession(record: ColiseumLiveSessionRecord): ColiseumLiveSessionRecord {
        this.coliseumLiveSessions.set(record.id, record);
        return record;
    }

    // --- Coliseum matches ---

    private static coliseumRoundVoteKey(
        matchId: string,
        roundIndex: number,
        voterId: string
    ): string {
        return `${matchId}::${roundIndex}::${voterId}`;
    }

    private static coliseumDropVoteKey(dropId: string, voterId: string): string {
        return `${dropId}::${voterId}`;
    }

    private static coliseumStatementKey(matchId: string, side: string): string {
        return `${matchId}::${side}`;
    }

    private static coliseumCrucibleVoteKey(
        matchId: string,
        questionId: string,
        voterId: string
    ): string {
        return `${matchId}::${questionId}::${voterId}`;
    }

    listColiseumMatches(): ColiseumMatchRecord[] {
        return [...this.coliseumMatches.values()];
    }

    getColiseumMatch(id: string): ColiseumMatchRecord | undefined {
        return this.coliseumMatches.get(id);
    }

    upsertColiseumMatch(record: ColiseumMatchRecord): ColiseumMatchRecord {
        this.coliseumMatches.set(record.id, record);
        return record;
    }

    listColiseumRounds(): ColiseumRoundRecord[] {
        return [...this.coliseumRounds.values()];
    }

    getColiseumRound(id: string): ColiseumRoundRecord | undefined {
        return this.coliseumRounds.get(id);
    }

    upsertColiseumRound(record: ColiseumRoundRecord): ColiseumRoundRecord {
        this.coliseumRounds.set(record.id, record);
        return record;
    }

    listColiseumRoundVotes(): ColiseumRoundVoteRecord[] {
        return [...this.coliseumRoundVotes.values()];
    }

    upsertColiseumRoundVote(record: ColiseumRoundVoteRecord): ColiseumRoundVoteRecord {
        this.coliseumRoundVotes.set(
            InMemoryDb.coliseumRoundVoteKey(record.matchId, record.roundIndex, record.voterId),
            record
        );
        return record;
    }

    listColiseumShouts(): ColiseumShoutRecord[] {
        return [...this.coliseumShouts.values()];
    }

    getColiseumShout(id: string): ColiseumShoutRecord | undefined {
        return this.coliseumShouts.get(id);
    }

    upsertColiseumShout(record: ColiseumShoutRecord): ColiseumShoutRecord {
        this.coliseumShouts.set(record.id, record);
        return record;
    }

    listColiseumResponseDrops(): ColiseumResponseDropRecord[] {
        return [...this.coliseumResponseDrops.values()];
    }

    getColiseumResponseDrop(id: string): ColiseumResponseDropRecord | undefined {
        return this.coliseumResponseDrops.get(id);
    }

    upsertColiseumResponseDrop(record: ColiseumResponseDropRecord): ColiseumResponseDropRecord {
        this.coliseumResponseDrops.set(record.id, record);
        return record;
    }

    listColiseumResponseDropVotes(): ColiseumResponseDropVoteRecord[] {
        return [...this.coliseumResponseDropVotes.values()];
    }

    upsertColiseumResponseDropVote(
        record: ColiseumResponseDropVoteRecord
    ): ColiseumResponseDropVoteRecord {
        this.coliseumResponseDropVotes.set(
            InMemoryDb.coliseumDropVoteKey(record.dropId, record.voterId),
            record
        );
        return record;
    }

    listColiseumBriefs(): ColiseumBriefRecord[] {
        return [...this.coliseumBriefs.values()];
    }

    getColiseumBrief(id: string): ColiseumBriefRecord | undefined {
        return this.coliseumBriefs.get(id);
    }

    /** Briefs are immutable; this only ever writes a brief that did not exist. */
    upsertColiseumBrief(record: ColiseumBriefRecord): ColiseumBriefRecord {
        this.coliseumBriefs.set(record.id, record);
        return record;
    }

    listColiseumExplainers(): ColiseumExplainerRecord[] {
        return [...this.coliseumExplainers.values()];
    }

    getColiseumExplainer(id: string): ColiseumExplainerRecord | undefined {
        return this.coliseumExplainers.get(id);
    }

    upsertColiseumExplainer(record: ColiseumExplainerRecord): ColiseumExplainerRecord {
        this.coliseumExplainers.set(record.id, record);
        return record;
    }

    private static coliseumExplainerVoteKey(explainerId: string, voterId: string): string {
        return `${explainerId}::${voterId}`;
    }

    listColiseumExplainerVotes(): ColiseumExplainerVoteRecord[] {
        return [...this.coliseumExplainerVotes.values()];
    }

    upsertColiseumExplainerVote(record: ColiseumExplainerVoteRecord): ColiseumExplainerVoteRecord {
        this.coliseumExplainerVotes.set(
            InMemoryDb.coliseumExplainerVoteKey(record.explainerId, record.voterId),
            record
        );
        return record;
    }

    listColiseumCrucibleStatements(): ColiseumCrucibleStatementRecord[] {
        return [...this.coliseumCrucibleStatements.values()];
    }

    upsertColiseumCrucibleStatement(
        record: ColiseumCrucibleStatementRecord
    ): ColiseumCrucibleStatementRecord {
        this.coliseumCrucibleStatements.set(
            InMemoryDb.coliseumStatementKey(record.matchId, record.side),
            record
        );
        return record;
    }

    listColiseumCrucibleVotes(): ColiseumCrucibleVoteRecord[] {
        return [...this.coliseumCrucibleVotes.values()];
    }

    upsertColiseumCrucibleVote(record: ColiseumCrucibleVoteRecord): ColiseumCrucibleVoteRecord {
        this.coliseumCrucibleVotes.set(
            InMemoryDb.coliseumCrucibleVoteKey(record.matchId, record.questionId, record.voterId),
            record
        );
        return record;
    }

    // --- Reputation ---

    listReputationEvents(): ReputationEventRecord[] {
        return [...this.reputationEvents.values()];
    }

    /** One user's events without scanning the whole log at the caller. */
    listReputationEventsForUser(userId: string): ReputationEventRecord[] {
        const events: ReputationEventRecord[] = [];
        for (const event of this.reputationEvents.values()) {
            if (event.userId === userId) events.push(event);
        }
        return events;
    }

    /** True if an award with this dedupe key was already recorded. */
    reputationDedupeKeyExists(dedupeKey: string): boolean {
        for (const event of this.reputationEvents.values()) {
            if (event.dedupeKey === dedupeKey) return true;
        }
        return false;
    }

    addReputationEvent(record: ReputationEventRecord): ReputationEventRecord {
        // Append-only, enforced (W4): the log records history; a correction is
        // a later compensating event, never an overwrite of an existing row.
        if (this.reputationEvents.has(record.id)) {
            throw new Error(`reputation_events is append-only; refusing to overwrite ${record.id}`);
        }
        this.reputationEvents.set(record.id, record);
        return record;
    }

    resetReputationEvents(): void {
        this.reputationEvents.clear();
    }
}

const processIsAlive = (pid: number): boolean => {
    try {
        process.kill(pid, 0);
        return true;
    } catch (err) {
        // EPERM: it exists, under another user.
        return (err as NodeJS.ErrnoException).code === 'EPERM';
    }
};

/**
 * Remove the temp snapshots a process that died mid-write left beside the
 * store file (FileBackedDb.persist names them `<file>.tmp-<pid>`; before that,
 * `<file>.tmp`). Nothing else ever reads or overwrites one, so each would
 * otherwise keep a full copy of the store, out of reach of account erasure.
 * The temp file of a process still running is left alone: it may be writing.
 */
function removeStaleTempSnapshots(): void {
    const dir = dirname(DB_FILE_PATH);
    const prefix = `${basename(DB_FILE_PATH)}.tmp`;
    let names: string[];
    try {
        names = readdirSync(dir);
    } catch {
        return;
    }
    for (const name of names) {
        if (!name.startsWith(prefix)) continue;
        const rest = name.slice(prefix.length);
        const pid = /^-([1-9]\d*)$/.exec(rest)?.[1];
        if (rest !== '' && pid === undefined) continue;
        if (pid !== undefined && Number(pid) !== process.pid && processIsAlive(Number(pid))) {
            continue;
        }
        try {
            rmSync(join(dir, name), { force: true });
        } catch {
            // Best effort; hydrate() never reads a temp file.
        }
    }
}

export class FileBackedDb extends InMemoryDb {
    // Persistence is suppressed until construction finishes. During `super()` the
    // InMemoryDb constructor seeds a demo user, whose persisting override would
    // otherwise write an empty snapshot over an existing file BEFORE hydrate()
    // could load it — silently wiping real data on every restart. Reads as
    // `undefined` (falsy) during `super()` since instance fields initialize after
    // the base constructor returns, so the guard is active throughout seeding.
    private ready = false;

    constructor() {
        super();
        removeStaleTempSnapshots();
        const fileExisted = existsSync(DB_FILE_PATH);
        this.hydrate();
        this.ready = true;
        // First boot only: write the seeded snapshot. On restart the file already
        // holds real data loaded by hydrate(), so we leave it untouched.
        if (!fileExisted) this.persist();
    }

    private hydrate() {
        if (!existsSync(DB_FILE_PATH)) return;

        const parsed = JSON.parse(readFileSync(DB_FILE_PATH, 'utf8')) as PersistedState;
        this.users = new Map(parsed.users.map((row) => [row.id, row]));
        this.canopyDirectoryEntries = new Map(
            (parsed.canopyDirectoryEntries ?? []).map((row) => [row.canopyId, row])
        );
        this.canaryTokens = new Map((parsed.canaryTokens ?? []).map((row) => [row.id, row]));
        this.denGreetings = new Map(
            (parsed.denGreetings ?? []).map((row) => [`${row.roomId}:${row.userId}`, row])
        );
        this.meshEnvelopes = new Map((parsed.meshEnvelopes ?? []).map((row) => [row.id, row]));
        this.messages = new Map(parsed.messages.map((row) => [row.id, row]));
        this.scheduledMessages = new Map(
            (parsed.scheduledMessages ?? []).map((row) => [row.id, row])
        );
        this.votes = new Map(parsed.votes.map((row) => [row.id, row]));
        this.voteEntries = new Map(parsed.voteEntries.map((row) => [row.id, row]));
        this.federationLinks = new Map(parsed.federationLinks.map((row) => [row.id, row]));
        this.forumPosts = new Map((parsed.forumPosts ?? []).map((row) => [row.id, row]));
        this.channels = new Map((parsed.channels ?? []).map((row) => [row.id, row]));
        this.deadDrops = new Map((parsed.deadDrops ?? []).map((row) => [row.id, row]));
        // Grouped by owner as in memory, so the index is rebuilt with the rows.
        this.deadmanSwitches = new GroupedMap<DeadmanSwitchRecord, SwitchGroup>(
            switchGroupers(),
            (parsed.deadmanSwitches ?? []).map((row) => [row.id, row])
        );
        // Indexed by switch and by recipient as in memory, so both indexes are rebuilt with the rows.
        this.deadmanReleaseWraps = new GroupedMap<DeadmanReleaseWrapRecord, ReleaseRowGroup>(
            releaseRowGroupers<DeadmanReleaseWrapRecord>(),
            (parsed.deadmanReleaseWraps ?? []).map((row) => [
                releaseRowKey(row.switchId, row.recipientAccountId),
                row,
            ])
        );
        this.deadmanReleaseNotices = new GroupedMap<DeadmanReleaseNoticeRecord, ReleaseRowGroup>(
            releaseRowGroupers<DeadmanReleaseNoticeRecord>(),
            (parsed.deadmanReleaseNotices ?? []).map((row) => [
                releaseRowKey(row.switchId, row.recipientAccountId),
                row,
            ])
        );
        // Grouped by account as in memory, so the index is rebuilt with the rows.
        this.releaseIdentities = new GroupedMap<ReleaseIdentityRecord, IdentityGroup>(
            identityGroupers(),
            (parsed.releaseIdentities ?? []).map((row) => [row.id, row])
        );
        this.moderationActions = new Map(
            (parsed.moderationActions ?? []).map((row) => [row.id, row])
        );
        this.creatorStreamAuth = new Map(
            (parsed.creatorStreamAuth ?? []).map((row) => [row.id, row])
        );
        this.streams = new Map((parsed.streams ?? []).map((row) => [row.id, row]));
        this.streamSessions = new Map((parsed.streamSessions ?? []).map((row) => [row.id, row]));
        this.streamModeration = new Map(
            (parsed.streamModeration ?? []).map((row) => [row.streamId, row])
        );
        this.clips = new Map((parsed.clips ?? []).map((row) => [row.id, row]));
        this.canopyVoiceRooms = new Map(
            (parsed.canopyVoiceRooms ?? []).map((row) => [row.id, row])
        );
        this.voiceRoomParticipants = new Map(
            (parsed.voiceRoomParticipants ?? []).map((row) => [row.id, row])
        );
        this.voiceRoomEvents = new Map((parsed.voiceRoomEvents ?? []).map((row) => [row.id, row]));
        this.voiceRoomSanctions = new Map(
            (parsed.voiceRoomSanctions ?? []).map((row) => [row.id, row])
        );
        this.marketplaceEntitlements = new Map(
            (parsed.marketplaceEntitlements ?? []).map((row) => [row.id, row])
        );
        this.marketplaceWebhookAudit = new Map(
            (parsed.marketplaceWebhookAudit ?? []).map((row) => [
                `${row.providerId}:${row.eventId}`,
                row,
            ])
        );
        this.marketplaceLicenseKeys = new Map(
            (parsed.marketplaceLicenseKeys ?? []).map((row) => [row.entitlementId, row])
        );
        this.marketplaceListingsCache = new Map(
            (parsed.marketplaceListingsCache ?? []).map((row) => [row.cacheKey, row])
        );
        this.fbmVendorRooms = new Map(
            (parsed.fbmVendorRooms ?? []).map((row) => [row.vendorId, row])
        );
        this.fbmBuyerOrderRooms = new Map(
            (parsed.fbmBuyerOrderRooms ?? []).map((row) => [row.id, row])
        );
        this.fbmDeaddropDeliveries = new Map(
            (parsed.fbmDeaddropDeliveries ?? []).map((row) => [row.id, row])
        );
        this.fbmDisputeRooms = new Map(
            (parsed.fbmDisputeRooms ?? []).map((row) => [row.disputeId, row])
        );
        this.fbmAclState = new Map(
            (parsed.fbmAclState ?? []).map((row) => [`${row.mxid}::${row.roomId}`, row])
        );
        this.tips = new Map((parsed.tips ?? []).map((row) => [row.id, row]));
        this.referrals = new Map((parsed.referrals ?? []).map((row) => [row.id, row]));
        this.ambassadors = new Map((parsed.ambassadors ?? []).map((row) => [row.id, row]));
        this.quests = new Map((parsed.quests ?? []).map((row) => [row.id, row]));
        this.questCompletions = new Map(
            (parsed.questCompletions ?? []).map((row) => [row.id, row])
        );
        this.migrationCredits = new Map(
            (parsed.migrationCredits ?? []).map((row) => [row.id, row])
        );
        this.bountyRewards = new Map((parsed.bountyRewards ?? []).map((row) => [row.id, row]));
        this.creatorSubscriptionTiers = new Map(
            (parsed.creatorSubscriptionTiers ?? []).map((row) => [row.id, row])
        );
        this.creatorSubscriptions = new Map(
            (parsed.creatorSubscriptions ?? []).map((row) => [row.id, row])
        );
        this.communityBoostPledges = new Map(
            (parsed.communityBoostPledges ?? []).map((row) => [row.id, row])
        );
        this.aidPools = new Map((parsed.aidPools ?? []).map((row) => [row.id, row]));
        this.adRevenuePeriods = new Map(
            (parsed.adRevenuePeriods ?? []).map((row) => [row.id, row])
        );
        this.adRevenueShares = new Map((parsed.adRevenueShares ?? []).map((row) => [row.id, row]));
        this.passwordResetTokens = new Map(
            (parsed.passwordResetTokens ?? []).map((row) => [row.id, row])
        );
        this.emailVerificationTokens = new Map(
            (parsed.emailVerificationTokens ?? []).map((row) => [row.id, row])
        );
        this.accountDeletionTokens = new Map(
            (parsed.accountDeletionTokens ?? []).map((row) => [row.id, row])
        );
        this.invitationTokens = new Map(
            (parsed.invitationTokens ?? []).map((row) => [row.id, row])
        );
        this.invitationRedemptions = new Map(
            (parsed.invitationRedemptions ?? []).map((row) => [row.id, row])
        );
        this.invitationAdmissions = new Map(
            (parsed.invitationAdmissions ?? []).map((row) => [row.id, row])
        );
        this.burnerIdentities = new Map(
            (parsed.burnerIdentities ?? []).map((row) => [row.id, row])
        );
        this.refreshTokens = new Map((parsed.refreshTokens ?? []).map((row) => [row.id, row]));
        this.revokedSessions = new Map((parsed.revokedSessions ?? []).map((row) => [row.jti, row]));
        this.linkedAccounts = new Map(
            (parsed.linkedAccounts ?? []).map((row) => [
                `${row.blackoutUserId}:${row.provider}`,
                row,
            ])
        );
        this.pendingOidcLogins = new Map(
            (parsed.pendingOidcLogins ?? []).map((row) => [row.stateHash, row])
        );
        this.pendingOAuthLinks = new Map(
            (parsed.pendingOAuthLinks ?? []).map((row) => [row.stateHash, row])
        );
        this.twitchChatBridges = new Map(
            (parsed.twitchChatBridges ?? []).map((row) => [row.id, row])
        );
        this.twitchEventSubscriptions = new Map(
            (parsed.twitchEventSubscriptions ?? []).map((row) => [row.helixSubscriptionId, row])
        );
        this.widgetAlertTokens = new Map(
            (parsed.widgetAlertTokens ?? []).map((row) => [row.secretHash, row])
        );
        this.youtubeChatBridges = new Map(
            (parsed.youtubeChatBridges ?? []).map((row) => [row.id, row])
        );
        this.kickChatBridges = new Map((parsed.kickChatBridges ?? []).map((row) => [row.id, row]));
        this.simulcastDestinations = new Map(
            (parsed.simulcastDestinations ?? []).map((row) => [row.id, row])
        );
        this.discordCompatWebhooks = new Map(
            (parsed.discordCompatWebhooks ?? []).map((row) => [row.id, row])
        );
        this.discordServerImports = new Map(
            (parsed.discordServerImports ?? []).map((row) => [row.id, row])
        );
        this.discordImportMappings = new Map(
            (parsed.discordImportMappings ?? []).map((row) => [row.id, row])
        );
        this.discordBridgeActivations = new Map(
            (parsed.discordBridgeActivations ?? []).map((row) => [row.id, row])
        );
        this.outboundEventWebhooks = new Map(
            (parsed.outboundEventWebhooks ?? []).map((row) => [row.id, row])
        );
        this.twitchIrcBotTokens = new Map(
            (parsed.twitchIrcBotTokens ?? []).map((row) => [row.id, row])
        );
        this.obsWsPasswords = new Map((parsed.obsWsPasswords ?? []).map((row) => [row.id, row]));
        this.twitchExtensionPanels = new Map(
            (parsed.twitchExtensionPanels ?? []).map((row) => [row.id, row])
        );
        this.creatorListings = new Map((parsed.creatorListings ?? []).map((row) => [row.id, row]));
        this.vaultItems = new Map((parsed.vaultItems ?? []).map((row) => [row.id, row]));
        this.channelPointsRewards = new Map(
            (parsed.channelPointsRewards ?? []).map((row) => [row.id, row])
        );
        this.channelPointsLedger = new Map(
            (parsed.channelPointsLedger ?? []).map((row) => [row.id, row])
        );
        if (parsed.coalitionSpatialItems) {
            this.coalitionSpatialItems = new Map(
                parsed.coalitionSpatialItems.map((row) => [row.id, row])
            );
        }
        if (parsed.coalitionEvents) {
            this.coalitionEvents = new Map(parsed.coalitionEvents.map((row) => [row.id, row]));
        }
        if (parsed.eventRsvps) {
            this.eventRsvps = new Map(
                parsed.eventRsvps.map((row) => [`${row.eventId}::${row.userId}`, row])
            );
        }
        if (parsed.eventVolunteerSlots) {
            this.eventVolunteerSlots = new Map(
                parsed.eventVolunteerSlots.map((row) => [row.id, row])
            );
        }
        if (parsed.eventVolunteerSignups) {
            this.eventVolunteerSignups = new Map(
                parsed.eventVolunteerSignups.map((row) => [`${row.slotId}::${row.userId}`, row])
            );
        }
        if (parsed.eventRideOffers) {
            this.eventRideOffers = new Map(parsed.eventRideOffers.map((row) => [row.id, row]));
        }
        if (parsed.eventRideClaims) {
            this.eventRideClaims = new Map(
                parsed.eventRideClaims.map((row) => [`${row.offerId}::${row.riderId}`, row])
            );
        }
        if (parsed.coalitionRings) {
            this.coalitionRings = new Map(parsed.coalitionRings.map((row) => [row.id, row]));
        }
        if (parsed.ringMemberships) {
            this.ringMemberships = new Map(
                parsed.ringMemberships.map((row) => [`${row.ringId}::${row.userId}`, row])
            );
        }
        if (parsed.ringInvitations) {
            this.ringInvitations = new Map(
                parsed.ringInvitations.map((row) => [`${row.ringId}::${row.inviteeId}`, row])
            );
        }
        if (parsed.coalitions) {
            this.coalitions = new Map(parsed.coalitions.map((row) => [row.id, row]));
        }
        if (parsed.coalitionMemberships) {
            this.coalitionMemberships = new Map(
                parsed.coalitionMemberships.map((row) => [`${row.coalitionId}::${row.userId}`, row])
            );
        }
        if (parsed.coalitionJoinRequests) {
            this.coalitionJoinRequests = new Map(
                parsed.coalitionJoinRequests.map((row) => [
                    `${row.coalitionId}::${row.userId}`,
                    row,
                ])
            );
        }
        if (parsed.coalitionConnections) {
            this.coalitionConnections = new Map(
                parsed.coalitionConnections.map((row) => [
                    `${row.coalitionId}::${row.platform}`,
                    row,
                ])
            );
        }
        if (parsed.coalitionMemberConnections) {
            this.coalitionMemberConnections = new Map(
                parsed.coalitionMemberConnections.map((row) => [
                    `${row.coalitionId}::${row.userId}::${row.platform}`,
                    row,
                ])
            );
        }
        if (parsed.coalitionCampaigns) {
            this.coalitionCampaigns = new Map(
                parsed.coalitionCampaigns.map((row) => [row.id, row])
            );
        }
        if (parsed.coalitionCampaignPosts) {
            this.coalitionCampaignPosts = new Map(
                parsed.coalitionCampaignPosts.map((row) => [row.id, row])
            );
        }
        if (parsed.coalitionExternalActivity) {
            this.coalitionExternalActivity = new Map(
                parsed.coalitionExternalActivity.map((row) => [row.id, row])
            );
        }
        if (parsed.coalitionCampaignSyncOptIns) {
            this.coalitionCampaignSyncOptIns = new Map(
                parsed.coalitionCampaignSyncOptIns.map((row) => [
                    `${row.campaignId}::${row.userId}::${row.platform}`,
                    row,
                ])
            );
        }
        if (parsed.coalitionCampaignContributions) {
            this.coalitionCampaignContributions = new Map(
                parsed.coalitionCampaignContributions.map((row) => [row.id, row])
            );
            this.coalitionCampaignPayees = new Map(
                (parsed.coalitionCampaignPayees ?? []).map((row) => [
                    `${row.campaignId}::${row.userId}`,
                    row,
                ])
            );
            this.coalitionSuccessionPetitions = new Map(
                (parsed.coalitionSuccessionPetitions ?? []).map((row) => [row.id, row])
            );
        }
        if (parsed.coalitionCampaignEngagement) {
            this.coalitionCampaignEngagement = new Map(
                parsed.coalitionCampaignEngagement.map((row) => [row.campaignPostId, row])
            );
        }
        if (parsed.coalitionCampaignAttribution) {
            this.coalitionCampaignAttribution = new Map(
                parsed.coalitionCampaignAttribution.map((row) => [row.id, row])
            );
        }
        if (parsed.coalitionBoosts) {
            this.coalitionBoosts = new Map(
                parsed.coalitionBoosts.map((row) => [
                    `${row.campaignId}::${row.userId}::${row.day}`,
                    row,
                ])
            );
        }
        if (parsed.coalitionKitApplications) {
            this.coalitionKitApplications = new Map(
                parsed.coalitionKitApplications.map((row) => [row.id, row])
            );
        }
        if (parsed.coalitionTasks) {
            this.coalitionTasks = new Map(parsed.coalitionTasks.map((row) => [row.id, row]));
        }
        if (parsed.coalitionNeeds) {
            this.coalitionNeeds = new Map(parsed.coalitionNeeds.map((row) => [row.id, row]));
        }
        if (parsed.coalitionProjects) {
            this.coalitionProjects = new Map(parsed.coalitionProjects.map((row) => [row.id, row]));
        }
        if (parsed.coalitionProjectSupports) {
            this.coalitionProjectSupports = new Map(
                parsed.coalitionProjectSupports.map((row) => [row.id, row])
            );
        }
        if (parsed.coalitionSurges) {
            this.coalitionSurges = new Map(parsed.coalitionSurges.map((row) => [row.id, row]));
        }
        if (parsed.coalitionNotifications) {
            this.coalitionNotifications = new Map(
                parsed.coalitionNotifications.map((row) => [row.id, row])
            );
        }
        if (parsed.coalitionResources) {
            this.coalitionResources = new Map(
                parsed.coalitionResources.map((row) => [row.id, row])
            );
        }
        if (parsed.creatorContent) {
            this.creatorContent = new Map(parsed.creatorContent.map((row) => [row.id, row]));
        }
        if (parsed.contentDistributions) {
            this.contentDistributions = new Map(
                parsed.contentDistributions.map((row) => [row.id, row])
            );
        }
        if (parsed.productReviews) {
            this.productReviews = new Map(parsed.productReviews.map((row) => [row.id, row]));
        }
        if (parsed.productVersions) {
            this.productVersions = new Map(parsed.productVersions.map((row) => [row.id, row]));
        }
        if (parsed.sellerLocations) {
            this.sellerLocations = new Map(parsed.sellerLocations.map((row) => [row.id, row]));
        }
        if (parsed.marketplaceSellerProfiles) {
            this.marketplaceSellerProfiles = new Map(
                parsed.marketplaceSellerProfiles.map((row) => [
                    `${row.userId}::${row.providerId}`,
                    row,
                ])
            );
        }
        if (parsed.coalitionFeedItems) {
            this.coalitionFeedItems = new Map(
                parsed.coalitionFeedItems.map((row) => [row.id, row])
            );
        }
        if (parsed.coalitionFeedLikes) {
            this.coalitionFeedLikes = new Map(
                parsed.coalitionFeedLikes.map((row) => [`${row.feedItemId}::${row.userId}`, row])
            );
        }
        if (parsed.coalitionFeedComments) {
            this.coalitionFeedComments = new Map(
                parsed.coalitionFeedComments.map((row) => [row.id, row])
            );
        }
        if (parsed.circleEdges) {
            this.circleEdges = new Map(
                parsed.circleEdges.map((row) => [`${row.followerId}::${row.followeeId}`, row])
            );
        }
        if (parsed.relayEdges) {
            this.relayEdges = new Map(
                parsed.relayEdges.map((row) => [
                    `${row.relayerUserId}::${row.subjectSource}::${row.subjectId}`,
                    row,
                ])
            );
        }
        if (parsed.communityAssets) {
            this.communityAssets = new Map(parsed.communityAssets.map((row) => [row.id, row]));
        }
        if (parsed.communityAssetReports) {
            this.communityAssetReports = new Map(
                parsed.communityAssetReports.map((row) => [
                    `${row.assetId}::${row.reporterId}`,
                    row,
                ])
            );
        }
        if (parsed.memberProfiles) {
            this.memberProfiles = new Map(parsed.memberProfiles.map((row) => [row.userId, row]));
        }
        if (parsed.profileWallPosts) {
            this.profileWallPosts = new Map(parsed.profileWallPosts.map((row) => [row.id, row]));
        }
        if (parsed.coalitionAidPosts) {
            this.coalitionAidPosts = new Map(parsed.coalitionAidPosts.map((row) => [row.id, row]));
        }
        this.pluginInstallations = new Map(
            (parsed.pluginInstallations ?? []).map((row) => [row.id, row])
        );
        this.pluginDens = new Map((parsed.pluginDens ?? []).map((row) => [row.id, row]));
        this.coalitionKitManifestApplications = new Map(
            (parsed.coalitionKitManifestApplications ?? []).map((row) => [row.id, row])
        );
        this.pluginReviews = new Map((parsed.pluginReviews ?? []).map((row) => [row.id, row]));
        this.pluginForks = new Map((parsed.pluginForks ?? []).map((row) => [row.id, row]));
        this.pluginShowcases = new Map((parsed.pluginShowcases ?? []).map((row) => [row.id, row]));
        if (parsed.coliseumTopics) {
            this.coliseumTopics = new Map(parsed.coliseumTopics.map((row) => [row.id, row]));
        }
        if (parsed.coliseumChallenges) {
            this.coliseumChallenges = new Map(
                parsed.coliseumChallenges.map((row) => [row.id, row])
            );
        }
        if (parsed.challengeEntries) {
            this.challengeEntries = new Map(parsed.challengeEntries.map((row) => [row.id, row]));
        }
        if (parsed.challengeVotes) {
            this.challengeVotes = new Map(parsed.challengeVotes.map((row) => [row.id, row]));
        }
        if (parsed.coliseumArguments) {
            this.coliseumArguments = new Map(parsed.coliseumArguments.map((row) => [row.id, row]));
        }
        if (parsed.coliseumVotes) {
            this.coliseumVotes = new Map(
                parsed.coliseumVotes.map((row) => [`${row.argumentId}::${row.voterId}`, row])
            );
        }
        if (parsed.coliseumLiveSessions) {
            this.coliseumLiveSessions = new Map(
                parsed.coliseumLiveSessions.map((row) => [row.id, row])
            );
        }
        if (parsed.coliseumMatches) {
            this.coliseumMatches = new Map(parsed.coliseumMatches.map((row) => [row.id, row]));
        }
        if (parsed.coliseumRounds) {
            this.coliseumRounds = new Map(parsed.coliseumRounds.map((row) => [row.id, row]));
        }
        if (parsed.coliseumRoundVotes) {
            this.coliseumRoundVotes = new Map(
                parsed.coliseumRoundVotes.map((row) => [
                    `${row.matchId}::${row.roundIndex}::${row.voterId}`,
                    row,
                ])
            );
        }
        if (parsed.coliseumShouts) {
            this.coliseumShouts = new Map(parsed.coliseumShouts.map((row) => [row.id, row]));
        }
        if (parsed.coliseumResponseDrops) {
            this.coliseumResponseDrops = new Map(
                parsed.coliseumResponseDrops.map((row) => [row.id, row])
            );
        }
        if (parsed.coliseumResponseDropVotes) {
            this.coliseumResponseDropVotes = new Map(
                parsed.coliseumResponseDropVotes.map((row) => [
                    `${row.dropId}::${row.voterId}`,
                    row,
                ])
            );
        }
        if (parsed.coliseumBriefs) {
            this.coliseumBriefs = new Map(parsed.coliseumBriefs.map((row) => [row.id, row]));
        }
        if (parsed.coliseumCrucibleStatements) {
            this.coliseumCrucibleStatements = new Map(
                parsed.coliseumCrucibleStatements.map((row) => [`${row.matchId}::${row.side}`, row])
            );
        }
        if (parsed.coliseumCrucibleVotes) {
            this.coliseumCrucibleVotes = new Map(
                parsed.coliseumCrucibleVotes.map((row) => [
                    `${row.matchId}::${row.questionId}::${row.voterId}`,
                    row,
                ])
            );
        }
        if (parsed.coliseumExplainers) {
            this.coliseumExplainers = new Map(
                parsed.coliseumExplainers.map((row) => [row.id, row])
            );
        }
        if (parsed.coliseumExplainerVotes) {
            this.coliseumExplainerVotes = new Map(
                parsed.coliseumExplainerVotes.map((row) => [
                    `${row.explainerId}::${row.voterId}`,
                    row,
                ])
            );
        }
        if (parsed.reputationEvents) {
            this.reputationEvents = new Map(parsed.reputationEvents.map((row) => [row.id, row]));
        }
        if (parsed.canopySubscriptions) {
            this.canopySubscriptions = new Map(
                parsed.canopySubscriptions.map((row) => [row.userId, row])
            );
        }
        if (parsed.subscriptionAuditEvents) {
            this.subscriptionAuditEvents = new Map(
                parsed.subscriptionAuditEvents.map((row) => [row.id, row])
            );
        }
        if (parsed.processedBillingWebhookEvents) {
            this.processedBillingWebhookEvents = new Map(
                parsed.processedBillingWebhookEvents.map((row) => [row.eventId, row])
            );
        }
        if (parsed.subscriptionGifts) {
            this.subscriptionGifts = new Map(parsed.subscriptionGifts.map((row) => [row.id, row]));
        }
    }

    private snapshot(): PersistedState {
        return {
            users: [...this.users.values()],
            canopyDirectoryEntries: [...this.canopyDirectoryEntries.values()],
            canaryTokens: [...this.canaryTokens.values()],
            denGreetings: [...this.denGreetings.values()],
            meshEnvelopes: [...this.meshEnvelopes.values()],
            messages: [...this.messages.values()],
            scheduledMessages: [...this.scheduledMessages.values()],
            votes: [...this.votes.values()],
            voteEntries: [...this.voteEntries.values()],
            federationLinks: [...this.federationLinks.values()],
            forumPosts: [...this.forumPosts.values()],
            channels: [...this.channels.values()],
            deadDrops: [...this.deadDrops.values()],
            deadmanSwitches: [...this.deadmanSwitches.values()],
            deadmanReleaseWraps: [...this.deadmanReleaseWraps.values()],
            deadmanReleaseNotices: [...this.deadmanReleaseNotices.values()],
            releaseIdentities: [...this.releaseIdentities.values()],
            moderationActions: [...this.moderationActions.values()],
            creatorStreamAuth: [...this.creatorStreamAuth.values()],
            streams: [...this.streams.values()],
            streamSessions: [...this.streamSessions.values()],
            streamModeration: [...this.streamModeration.values()],
            clips: [...this.clips.values()],
            canopyVoiceRooms: [...this.canopyVoiceRooms.values()],
            voiceRoomParticipants: [...this.voiceRoomParticipants.values()],
            voiceRoomEvents: [...this.voiceRoomEvents.values()],
            voiceRoomSanctions: [...this.voiceRoomSanctions.values()],
            marketplaceEntitlements: [...this.marketplaceEntitlements.values()],
            marketplaceWebhookAudit: [...this.marketplaceWebhookAudit.values()],
            marketplaceLicenseKeys: [...this.marketplaceLicenseKeys.values()],
            marketplaceListingsCache: [...this.marketplaceListingsCache.values()],
            fbmVendorRooms: [...this.fbmVendorRooms.values()],
            fbmBuyerOrderRooms: [...this.fbmBuyerOrderRooms.values()],
            fbmDeaddropDeliveries: [...this.fbmDeaddropDeliveries.values()],
            fbmDisputeRooms: [...this.fbmDisputeRooms.values()],
            fbmAclState: [...this.fbmAclState.values()],
            tips: [...this.tips.values()],
            referrals: [...this.referrals.values()],
            ambassadors: [...this.ambassadors.values()],
            quests: [...this.quests.values()],
            questCompletions: [...this.questCompletions.values()],
            migrationCredits: [...this.migrationCredits.values()],
            bountyRewards: [...this.bountyRewards.values()],
            creatorSubscriptionTiers: [...this.creatorSubscriptionTiers.values()],
            creatorSubscriptions: [...this.creatorSubscriptions.values()],
            communityBoostPledges: [...this.communityBoostPledges.values()],
            aidPools: [...this.aidPools.values()],
            adRevenuePeriods: [...this.adRevenuePeriods.values()],
            adRevenueShares: [...this.adRevenueShares.values()],
            passwordResetTokens: [...this.passwordResetTokens.values()],
            emailVerificationTokens: [...this.emailVerificationTokens.values()],
            accountDeletionTokens: [...this.accountDeletionTokens.values()],
            invitationTokens: [...this.invitationTokens.values()],
            invitationRedemptions: [...this.invitationRedemptions.values()],
            invitationAdmissions: [...this.invitationAdmissions.values()],
            burnerIdentities: [...this.burnerIdentities.values()],
            refreshTokens: [...this.refreshTokens.values()],
            revokedSessions: [...this.revokedSessions.values()],
            linkedAccounts: [...this.linkedAccounts.values()],
            pendingOAuthLinks: [...this.pendingOAuthLinks.values()],
            pendingOidcLogins: [...this.pendingOidcLogins.values()],
            twitchChatBridges: [...this.twitchChatBridges.values()],
            twitchEventSubscriptions: [...this.twitchEventSubscriptions.values()],
            widgetAlertTokens: [...this.widgetAlertTokens.values()],
            youtubeChatBridges: [...this.youtubeChatBridges.values()],
            kickChatBridges: [...this.kickChatBridges.values()],
            simulcastDestinations: [...this.simulcastDestinations.values()],
            discordCompatWebhooks: [...this.discordCompatWebhooks.values()],
            discordServerImports: [...this.discordServerImports.values()],
            discordImportMappings: [...this.discordImportMappings.values()],
            discordBridgeActivations: [...this.discordBridgeActivations.values()],
            outboundEventWebhooks: [...this.outboundEventWebhooks.values()],
            twitchIrcBotTokens: [...this.twitchIrcBotTokens.values()],
            obsWsPasswords: [...this.obsWsPasswords.values()],
            twitchExtensionPanels: [...this.twitchExtensionPanels.values()],
            creatorListings: [...this.creatorListings.values()],
            vaultItems: [...this.vaultItems.values()],
            channelPointsRewards: [...this.channelPointsRewards.values()],
            channelPointsLedger: [...this.channelPointsLedger.values()],
            coalitionSpatialItems: [...this.coalitionSpatialItems.values()],
            coalitionAidPosts: [...this.coalitionAidPosts.values()],
            coalitionEvents: [...this.coalitionEvents.values()],
            eventRsvps: [...this.eventRsvps.values()],
            eventVolunteerSlots: [...this.eventVolunteerSlots.values()],
            eventVolunteerSignups: [...this.eventVolunteerSignups.values()],
            eventRideOffers: [...this.eventRideOffers.values()],
            eventRideClaims: [...this.eventRideClaims.values()],
            coalitionRings: [...this.coalitionRings.values()],
            ringMemberships: [...this.ringMemberships.values()],
            ringInvitations: [...this.ringInvitations.values()],
            coalitions: [...this.coalitions.values()],
            coalitionMemberships: [...this.coalitionMemberships.values()],
            coalitionJoinRequests: [...this.coalitionJoinRequests.values()],
            coalitionConnections: [...this.coalitionConnections.values()],
            coalitionMemberConnections: [...this.coalitionMemberConnections.values()],
            coalitionCampaigns: [...this.coalitionCampaigns.values()],
            coalitionCampaignPosts: [...this.coalitionCampaignPosts.values()],
            coalitionExternalActivity: [...this.coalitionExternalActivity.values()],
            coalitionCampaignSyncOptIns: [...this.coalitionCampaignSyncOptIns.values()],
            coalitionBoosts: [...this.coalitionBoosts.values()],
            coalitionCampaignContributions: [...this.coalitionCampaignContributions.values()],
            coalitionCampaignEngagement: [...this.coalitionCampaignEngagement.values()],
            coalitionCampaignAttribution: [...this.coalitionCampaignAttribution.values()],
            coalitionCampaignPayees: [...this.coalitionCampaignPayees.values()],
            coalitionSuccessionPetitions: [...this.coalitionSuccessionPetitions.values()],
            coalitionKitApplications: [...this.coalitionKitApplications.values()],
            coalitionTasks: [...this.coalitionTasks.values()],
            coalitionNeeds: [...this.coalitionNeeds.values()],
            coalitionProjects: [...this.coalitionProjects.values()],
            coalitionProjectSupports: [...this.coalitionProjectSupports.values()],
            coalitionSurges: [...this.coalitionSurges.values()],
            coalitionNotifications: [...this.coalitionNotifications.values()],
            coalitionResources: [...this.coalitionResources.values()],
            creatorContent: [...this.creatorContent.values()],
            contentDistributions: [...this.contentDistributions.values()],
            productReviews: [...this.productReviews.values()],
            productVersions: [...this.productVersions.values()],
            sellerLocations: [...this.sellerLocations.values()],
            marketplaceSellerProfiles: [...this.marketplaceSellerProfiles.values()],
            coalitionFeedItems: [...this.coalitionFeedItems.values()],
            coalitionFeedLikes: [...this.coalitionFeedLikes.values()],
            coalitionFeedComments: [...this.coalitionFeedComments.values()],
            circleEdges: [...this.circleEdges.values()],
            relayEdges: [...this.relayEdges.values()],
            communityAssets: [...this.communityAssets.values()],
            communityAssetReports: [...this.communityAssetReports.values()],
            memberProfiles: [...this.memberProfiles.values()],
            profileWallPosts: [...this.profileWallPosts.values()],
            pluginInstallations: [...this.pluginInstallations.values()],
            pluginDens: [...this.pluginDens.values()],
            coalitionKitManifestApplications: [...this.coalitionKitManifestApplications.values()],
            pluginReviews: [...this.pluginReviews.values()],
            pluginForks: [...this.pluginForks.values()],
            pluginShowcases: [...this.pluginShowcases.values()],
            coliseumTopics: [...this.coliseumTopics.values()],
            coliseumChallenges: [...this.coliseumChallenges.values()],
            challengeEntries: [...this.challengeEntries.values()],
            challengeVotes: [...this.challengeVotes.values()],
            coliseumArguments: [...this.coliseumArguments.values()],
            coliseumVotes: [...this.coliseumVotes.values()],
            coliseumLiveSessions: [...this.coliseumLiveSessions.values()],
            coliseumMatches: [...this.coliseumMatches.values()],
            coliseumRounds: [...this.coliseumRounds.values()],
            coliseumRoundVotes: [...this.coliseumRoundVotes.values()],
            coliseumShouts: [...this.coliseumShouts.values()],
            coliseumResponseDrops: [...this.coliseumResponseDrops.values()],
            coliseumResponseDropVotes: [...this.coliseumResponseDropVotes.values()],
            coliseumBriefs: [...this.coliseumBriefs.values()],
            coliseumCrucibleStatements: [...this.coliseumCrucibleStatements.values()],
            coliseumCrucibleVotes: [...this.coliseumCrucibleVotes.values()],
            coliseumExplainers: [...this.coliseumExplainers.values()],
            coliseumExplainerVotes: [...this.coliseumExplainerVotes.values()],
            reputationEvents: [...this.reputationEvents.values()],
            canopySubscriptions: [...this.canopySubscriptions.values()],
            subscriptionAuditEvents: [...this.subscriptionAuditEvents.values()],
            processedBillingWebhookEvents: [...this.processedBillingWebhookEvents.values()],
            subscriptionGifts: [...this.subscriptionGifts.values()],
        };
    }

    private persist() {
        // Suppressed during construction (see `ready`) so demo-seed writes can't
        // clobber an existing file before hydrate() loads it.
        if (!this.ready) return;
        mkdirSync(dirname(DB_FILE_PATH), { recursive: true });
        // Write to a sibling temp file and rename over the target, rather than
        // writing the store in place. A direct write truncates the file first,
        // so anything that interrupts it — a full disk, a killed process —
        // leaves a half-written JSON document that `hydrate()` cannot parse,
        // and the store is unrecoverable on next boot. rename(2) within a
        // directory is atomic, so a reader sees either the previous snapshot
        // or the new one and never a partial one. The temp name carries the
        // process id: with one fixed name, a second process writing the same
        // store (two test files run in parallel do) renames the first one's
        // temp file away, and the first rename fails with ENOENT. That is all
        // the pid buys: the file store is still single-writer, and two
        // processes on one file overwrite each other's snapshots. A temp file
        // left by a crash is removed at the next boot (removeStaleTempSnapshots).
        const tmpPath = `${DB_FILE_PATH}.tmp-${process.pid}`;
        try {
            writeFileSync(tmpPath, `${JSON.stringify(this.snapshot(), null, 2)}\n`, 'utf8');
            renameSync(tmpPath, DB_FILE_PATH);
        } catch (error) {
            // Leave the previous snapshot intact and drop the partial temp file.
            try {
                rmSync(tmpPath, { force: true });
            } catch {
                // Best effort; the temp file is ignored by hydrate() either way.
            }
            throw error;
        }
    }

    override createUser(input: Omit<UserRecord, 'createdAt'>): UserRecord {
        const created = super.createUser(input);
        this.persist();
        return created;
    }

    override createScheduledMessage(
        input: Omit<
            ScheduledMessageRecord,
            'createdAt' | 'status' | 'attempts' | 'deliveredAt' | 'lastError'
        >
    ): ScheduledMessageRecord {
        const created = super.createScheduledMessage(input);
        this.persist();
        return created;
    }

    override markScheduledMessageDelivered(id: string): ScheduledMessageRecord | undefined {
        const updated = super.markScheduledMessageDelivered(id);
        if (updated) this.persist();
        return updated;
    }

    override markScheduledMessageFailed(
        id: string,
        error: string,
        options: { terminal?: boolean } = {}
    ): ScheduledMessageRecord | undefined {
        const updated = super.markScheduledMessageFailed(id, error, options);
        if (updated) this.persist();
        return updated;
    }

    override cancelScheduledMessage(
        id: string,
        userId: string
    ): ScheduledMessageRecord | undefined {
        const updated = super.cancelScheduledMessage(id, userId);
        if (updated) this.persist();
        return updated;
    }

    override eraseScheduledMessage(id: string): ScheduledMessageRecord | undefined {
        const updated = super.eraseScheduledMessage(id);
        if (updated) this.persist();
        return updated;
    }

    override deleteUser(id: string): boolean {
        const removed = super.deleteUser(id);
        if (removed) this.persist();
        return removed;
    }

    override updateUserPassword(id: string, passwordHash: string): UserRecord | undefined {
        const updated = super.updateUserPassword(id, passwordHash);
        if (updated) this.persist();
        return updated;
    }

    override createPasswordResetToken(
        input: Omit<PasswordResetTokenRecord, 'createdAt'>
    ): PasswordResetTokenRecord {
        const record = super.createPasswordResetToken(input);
        this.persist();
        return record;
    }

    override consumePasswordResetToken(id: string): PasswordResetTokenRecord | undefined {
        const updated = super.consumePasswordResetToken(id);
        if (updated) this.persist();
        return updated;
    }

    override createEmailVerificationToken(
        input: Omit<EmailVerificationTokenRecord, 'createdAt'>
    ): EmailVerificationTokenRecord {
        const record = super.createEmailVerificationToken(input);
        this.persist();
        return record;
    }

    override consumeEmailVerificationToken(id: string): EmailVerificationTokenRecord | undefined {
        const updated = super.consumeEmailVerificationToken(id);
        if (updated) this.persist();
        return updated;
    }

    override markUserEmailVerified(id: string, at?: string): UserRecord | undefined {
        const updated = super.markUserEmailVerified(id, at);
        if (updated) this.persist();
        return updated;
    }

    override createAccountDeletionToken(
        input: Omit<AccountDeletionTokenRecord, 'createdAt'>
    ): AccountDeletionTokenRecord {
        const record = super.createAccountDeletionToken(input);
        this.persist();
        return record;
    }

    override consumeAccountDeletionToken(id: string): AccountDeletionTokenRecord | undefined {
        const updated = super.consumeAccountDeletionToken(id);
        if (updated) this.persist();
        return updated;
    }

    override createInvitationToken(
        input: Omit<InvitationTokenRecord, 'createdAt' | 'useCount'> & { useCount?: number }
    ): InvitationTokenRecord {
        const record = super.createInvitationToken(input);
        this.persist();
        return record;
    }

    override incrementInvitationTokenUseCount(id: string): InvitationTokenRecord | undefined {
        const updated = super.incrementInvitationTokenUseCount(id);
        if (updated) this.persist();
        return updated;
    }

    override revokeInvitationToken(id: string, reason: string): InvitationTokenRecord | undefined {
        const updated = super.revokeInvitationToken(id, reason);
        if (updated) this.persist();
        return updated;
    }

    override createInvitationRedemption(
        input: Omit<InvitationRedemptionRecord, 'createdAt'>
    ): InvitationRedemptionRecord {
        const record = super.createInvitationRedemption(input);
        this.persist();
        return record;
    }

    override createInvitationAdmission(
        input: Omit<InvitationAdmissionRecord, 'createdAt' | 'claimedAt' | 'claimedByUserId'>
    ): InvitationAdmissionRecord {
        const record = super.createInvitationAdmission(input);
        this.persist();
        return record;
    }

    override claimInvitationAdmission(
        id: string,
        userId: string
    ): InvitationAdmissionRecord | undefined {
        const updated = super.claimInvitationAdmission(id, userId);
        if (updated) this.persist();
        return updated;
    }

    override deleteInvitationAdmissionsForUser(userId: string, matrixUserId?: string): number {
        const removed = super.deleteInvitationAdmissionsForUser(userId, matrixUserId);
        if (removed > 0) this.persist();
        return removed;
    }

    override purgeUserAuthArtifacts(userId: string): void {
        super.purgeUserAuthArtifacts(userId);
        this.persist();
    }

    override createRefreshToken(input: Omit<RefreshTokenRecord, 'createdAt'>): RefreshTokenRecord {
        const record = super.createRefreshToken(input);
        this.persist();
        return record;
    }

    override consumeRefreshTokenForRotation(
        id: string,
        replacedBy: string
    ): RefreshTokenRecord | undefined {
        const updated = super.consumeRefreshTokenForRotation(id, replacedBy);
        if (updated) this.persist();
        return updated;
    }

    override revokeRefreshTokenFamily(familyId: string, reason: string): number {
        const count = super.revokeRefreshTokenFamily(familyId, reason);
        if (count > 0) this.persist();
        return count;
    }

    override revokeRefreshTokensForUser(userId: string, reason: string): number {
        const count = super.revokeRefreshTokensForUser(userId, reason);
        if (count > 0) this.persist();
        return count;
    }

    override revokeSession(input: Omit<RevokedSessionRecord, 'revokedAt'>): RevokedSessionRecord {
        const record = super.revokeSession(input);
        this.persist();
        return record;
    }

    override pruneExpiredRevokedSessions(now: Date = new Date()): number {
        const removed = super.pruneExpiredRevokedSessions(now);
        if (removed > 0) this.persist();
        return removed;
    }

    override upsertCanopyDirectoryEntry(
        input: Omit<CanopyDirectoryEntryRecord, 'indexedAt'>
    ): CanopyDirectoryEntryRecord {
        const record = super.upsertCanopyDirectoryEntry(input);
        this.persist();
        return record;
    }

    override upsertCanaryToken(record: CanaryTokenRecord): CanaryTokenRecord {
        const saved = super.upsertCanaryToken(record);
        this.persist();
        return saved;
    }

    override markGreeted(roomId: string, userId: string): DenGreetingRecord {
        const record = super.markGreeted(roomId, userId);
        this.persist();
        return record;
    }

    override upsertCanopySubscription(record: CanopySubscriptionRecord): CanopySubscriptionRecord {
        const saved = super.upsertCanopySubscription(record);
        this.persist();
        return saved;
    }

    override addSubscriptionAuditEvent(
        record: SubscriptionAuditEventRecord
    ): SubscriptionAuditEventRecord {
        const saved = super.addSubscriptionAuditEvent(record);
        this.persist();
        return saved;
    }

    override markBillingWebhookEventProcessed(eventId: string): ProcessedBillingWebhookEventRecord {
        const saved = super.markBillingWebhookEventProcessed(eventId);
        this.persist();
        return saved;
    }

    override upsertSubscriptionGift(record: SubscriptionGiftRecord): SubscriptionGiftRecord {
        const saved = super.upsertSubscriptionGift(record);
        this.persist();
        return saved;
    }

    override enqueueMeshEnvelope(env: MeshEnvelope): MeshEnvelope {
        const saved = super.enqueueMeshEnvelope(env);
        this.persist();
        return saved;
    }

    override replaceMeshEnvelopes(envelopes: readonly MeshEnvelope[]): void {
        super.replaceMeshEnvelopes(envelopes);
        this.persist();
    }

    override resetMeshEnvelopesForTest(): void {
        super.resetMeshEnvelopesForTest();
        this.persist();
    }

    override createMessage(input: Omit<MessageRecord, 'createdAt'>): MessageRecord {
        const created = super.createMessage(input);
        this.persist();
        return created;
    }

    override createVote(input: Omit<VoteRecord, 'createdAt' | 'startsAt' | 'endsAt'>): VoteRecord {
        const created = super.createVote(input);
        this.persist();
        return created;
    }

    override castVote(input: Omit<VoteEntryRecord, 'createdAt'>): VoteEntryRecord {
        const created = super.castVote(input);
        this.persist();
        return created;
    }

    override createFederationLink(
        input: Omit<FederationLinkRecord, 'createdAt'>
    ): FederationLinkRecord {
        const created = super.createFederationLink(input);
        this.persist();
        return created;
    }

    override createForumPost(input: Omit<ForumPostRecord, 'createdAt'>): ForumPostRecord {
        const created = super.createForumPost(input);
        this.persist();
        return created;
    }

    override createDeadDrop(input: Omit<DeadDropRecord, 'createdAt' | 'openedAt'>): DeadDropRecord {
        const created = super.createDeadDrop(input);
        this.persist();
        return created;
    }

    override openDeadDrop(id: string, recipientId: string): DeadDropRecord | undefined {
        const opened = super.openDeadDrop(id, recipientId);
        if (opened) {
            this.persist();
        }

        return opened;
    }

    override createDeadmanSwitch(
        input: Omit<DeadmanSwitchRecord, 'createdAt' | 'updatedAt'>
    ): DeadmanSwitchRecord {
        const created = super.createDeadmanSwitch(input);
        this.persist();
        return created;
    }

    override updateDeadmanSwitch(
        id: string,
        patch: Partial<Omit<DeadmanSwitchRecord, 'id' | 'createdAt'>>
    ): DeadmanSwitchRecord | undefined {
        const updated = super.updateDeadmanSwitch(id, patch);
        if (updated) this.persist();
        return updated;
    }

    override eraseDeadmanSwitch(id: string): DeadmanSwitchRecord | undefined {
        const updated = super.eraseDeadmanSwitch(id);
        if (updated) this.persist();
        return updated;
    }

    override putDeadmanReleaseWrap(
        input: Omit<DeadmanReleaseWrapRecord, 'createdAt' | 'updatedAt'>
    ): DeadmanReleaseWrapRecord {
        const record = super.putDeadmanReleaseWrap(input);
        this.persist();
        return record;
    }

    override eraseDeadmanReleaseWrap(
        switchId: string,
        recipientAccountId: string
    ): DeadmanReleaseWrapRecord | undefined {
        const updated = super.eraseDeadmanReleaseWrap(switchId, recipientAccountId);
        if (updated) this.persist();
        return updated;
    }

    override createDeadmanReleaseNotice(input: {
        switchId: string;
        recipientAccountId: string;
        nextAttemptAt: string;
    }): DeadmanReleaseNoticeRecord | undefined {
        const created = super.createDeadmanReleaseNotice(input);
        if (created) this.persist();
        return created;
    }

    override updateDeadmanReleaseNotice(
        switchId: string,
        recipientAccountId: string,
        patch: Partial<
            Omit<DeadmanReleaseNoticeRecord, 'switchId' | 'recipientAccountId' | 'createdAt'>
        >
    ): DeadmanReleaseNoticeRecord | undefined {
        const updated = super.updateDeadmanReleaseNotice(switchId, recipientAccountId, patch);
        if (updated) this.persist();
        return updated;
    }

    override updateDeadmanReleaseNoticeIf(
        switchId: string,
        recipientAccountId: string,
        expected: Partial<Pick<DeadmanReleaseNoticeRecord, 'status' | 'roomId'>>,
        patch: Partial<
            Omit<DeadmanReleaseNoticeRecord, 'switchId' | 'recipientAccountId' | 'createdAt'>
        >
    ): DeadmanReleaseNoticeRecord | undefined {
        const updated = super.updateDeadmanReleaseNoticeIf(
            switchId,
            recipientAccountId,
            expected,
            patch
        );
        if (updated) this.persist();
        return updated;
    }

    override supersedeReleaseIdentity(id: string, at: string): ReleaseIdentityRecord | undefined {
        const updated = super.supersedeReleaseIdentity(id, at);
        if (updated) this.persist();
        return updated;
    }

    override publishReleaseIdentity(
        input: Omit<ReleaseIdentityRecord, 'publishedAt' | 'supersededAt'>
    ): ReleaseIdentityRecord {
        const record = super.publishReleaseIdentity(input);
        this.persist();
        return record;
    }

    override eraseReleaseIdentity(id: string): ReleaseIdentityRecord | undefined {
        const updated = super.eraseReleaseIdentity(id);
        if (updated) this.persist();
        return updated;
    }

    override createModerationAction(
        input: Omit<ModerationActionRecord, 'createdAt'>
    ): ModerationActionRecord {
        const created = super.createModerationAction(input);
        this.persist();
        return created;
    }

    override upsertCreatorStreamAuth(
        input: Omit<CreatorStreamAuthRecord, 'createdAt' | 'rotatedAt'>
    ): CreatorStreamAuthRecord {
        const created = super.upsertCreatorStreamAuth(input);
        this.persist();
        return created;
    }

    override upsertStream(input: Omit<StreamRecord, 'createdAt' | 'updatedAt'>): StreamRecord {
        const created = super.upsertStream(input);
        this.persist();
        return created;
    }

    override createStreamSession(
        input: Omit<StreamSessionRecord, 'createdAt'>
    ): StreamSessionRecord {
        const created = super.createStreamSession(input);
        this.persist();
        return created;
    }

    override endStreamSession(
        sessionId: string,
        replayPointer?: string
    ): StreamSessionRecord | undefined {
        const ended = super.endStreamSession(sessionId, replayPointer);
        if (ended) this.persist();
        return ended;
    }

    override upsertStreamModeration(
        input: Omit<StreamModerationRecord, 'updatedAt'>
    ): StreamModerationRecord {
        const created = super.upsertStreamModeration(input);
        this.persist();
        return created;
    }

    override upsertClip(input: Omit<ClipRecord, 'createdAt' | 'updatedAt'>): ClipRecord {
        const created = super.upsertClip(input);
        this.persist();
        return created;
    }

    override updateClip(
        clipId: string,
        patch: Partial<
            Pick<
                ClipRecord,
                | 'title'
                | 'sourceStreamId'
                | 'mediaPointer'
                | 'thumbnailPointer'
                | 'captionsPointer'
                | 'durationSeconds'
                | 'visibility'
                | 'tags'
            >
        >
    ): ClipRecord | undefined {
        const updated = super.updateClip(clipId, patch);
        if (updated) this.persist();
        return updated;
    }

    override deleteClip(clipId: string): boolean {
        const deleted = super.deleteClip(clipId);
        if (deleted) this.persist();
        return deleted;
    }

    override createOrUpdateVoiceRoom(input: {
        canopyId: string;
        channelId: string;
        createdBy: string;
        livekitRoomName: string;
        isLocked?: boolean;
    }): CanopyVoiceRoomRecord {
        const room = super.createOrUpdateVoiceRoom(input);
        this.persist();
        return room;
    }

    override setVoiceRoomLock(
        roomId: string,
        isLocked: boolean
    ): CanopyVoiceRoomRecord | undefined {
        const room = super.setVoiceRoomLock(roomId, isLocked);
        if (room) this.persist();
        return room;
    }

    override joinVoiceRoom(
        input: Omit<VoiceRoomParticipantRecord, 'id' | 'joinedAt' | 'leftAt'>
    ): VoiceRoomParticipantRecord {
        const participant = super.joinVoiceRoom(input);
        this.persist();
        return participant;
    }

    override leaveVoiceRoom(
        roomId: string,
        userId: string
    ): VoiceRoomParticipantRecord | undefined {
        const participant = super.leaveVoiceRoom(roomId, userId);
        if (participant) this.persist();
        return participant;
    }

    override logVoiceRoomEvent(
        input: Omit<VoiceRoomEventRecord, 'id' | 'createdAt'>
    ): VoiceRoomEventRecord {
        const event = super.logVoiceRoomEvent(input);
        this.persist();
        return event;
    }

    override applyVoiceRoomSanction(input: {
        roomId: string;
        userId: string;
        kind: VoiceRoomSanctionKind;
        actorId: string;
    }): VoiceRoomSanctionRecord {
        const sanction = super.applyVoiceRoomSanction(input);
        this.persist();
        return sanction;
    }

    override liftVoiceRoomSanction(
        roomId: string,
        userId: string,
        kind: VoiceRoomSanctionKind,
        liftedBy: string
    ): VoiceRoomSanctionRecord | undefined {
        const sanction = super.liftVoiceRoomSanction(roomId, userId, kind, liftedBy);
        if (sanction) this.persist();
        return sanction;
    }

    override upsertMarketplaceEntitlement(
        record: MarketplaceEntitlementRecord
    ): MarketplaceEntitlementRecord {
        const created = super.upsertMarketplaceEntitlement(record);
        this.persist();
        return created;
    }

    override recordMarketplaceWebhook(
        record: MarketplaceWebhookAuditRecord
    ): MarketplaceWebhookAuditRecord {
        const created = super.recordMarketplaceWebhook(record);
        this.persist();
        return created;
    }

    override markMarketplaceWebhookProcessed(
        providerId: MarketplaceProviderIdString,
        eventId: string,
        processedAt: string
    ): MarketplaceWebhookAuditRecord | undefined {
        const updated = super.markMarketplaceWebhookProcessed(providerId, eventId, processedAt);
        if (updated) this.persist();
        return updated;
    }

    override upsertMarketplaceLicenseKey(
        record: MarketplaceLicenseKeyRecord
    ): MarketplaceLicenseKeyRecord {
        const created = super.upsertMarketplaceLicenseKey(record);
        this.persist();
        return created;
    }

    override upsertMarketplaceListingsCache(
        record: MarketplaceListingsCacheRecord
    ): MarketplaceListingsCacheRecord {
        const created = super.upsertMarketplaceListingsCache(record);
        this.persist();
        return created;
    }

    override resetMarketplaceForTest(): void {
        super.resetMarketplaceForTest();
        this.persist();
    }

    override upsertFbmVendorRooms(record: FbmVendorRoomRecord): FbmVendorRoomRecord {
        const created = super.upsertFbmVendorRooms(record);
        this.persist();
        return created;
    }

    override upsertFbmBuyerOrderRoom(record: FbmBuyerOrderRoomRecord): FbmBuyerOrderRoomRecord {
        const created = super.upsertFbmBuyerOrderRoom(record);
        this.persist();
        return created;
    }

    override upsertFbmDeaddropDelivery(
        record: FbmDeaddropDeliveryRecord
    ): FbmDeaddropDeliveryRecord {
        const created = super.upsertFbmDeaddropDelivery(record);
        this.persist();
        return created;
    }

    override upsertFbmDisputeRoom(record: FbmDisputeRoomRecord): FbmDisputeRoomRecord {
        const created = super.upsertFbmDisputeRoom(record);
        this.persist();
        return created;
    }

    override resetFbmMatrixBridgeForTest(): void {
        super.resetFbmMatrixBridgeForTest();
        this.persist();
    }

    override upsertFbmAclState(record: FbmAclStateRecord): FbmAclStateRecord {
        const created = super.upsertFbmAclState(record);
        this.persist();
        return created;
    }

    override resetFbmAclStateForTest(): void {
        super.resetFbmAclStateForTest();
        this.persist();
    }

    override insertTip(record: TipRecord): TipRecord {
        const created = super.insertTip(record);
        this.persist();
        return created;
    }

    override updateTip(record: TipRecord): TipRecord {
        const updated = super.updateTip(record);
        this.persist();
        return updated;
    }

    override resetTipsForTest(): void {
        super.resetTipsForTest();
        this.persist();
    }

    override insertReferral(record: ReferralRecord): ReferralRecord {
        const created = super.insertReferral(record);
        this.persist();
        return created;
    }

    override updateReferral(record: ReferralRecord): ReferralRecord {
        const updated = super.updateReferral(record);
        this.persist();
        return updated;
    }

    override resetReferralsForTest(): void {
        super.resetReferralsForTest();
        this.persist();
    }

    override insertAmbassador(record: AmbassadorRecord): AmbassadorRecord {
        const created = super.insertAmbassador(record);
        this.persist();
        return created;
    }

    override updateAmbassador(record: AmbassadorRecord): AmbassadorRecord {
        const updated = super.updateAmbassador(record);
        this.persist();
        return updated;
    }

    override resetAmbassadorsForTest(): void {
        super.resetAmbassadorsForTest();
        this.persist();
    }

    override insertQuest(record: QuestDefinitionRecord): QuestDefinitionRecord {
        const created = super.insertQuest(record);
        this.persist();
        return created;
    }

    override updateQuest(record: QuestDefinitionRecord): QuestDefinitionRecord {
        const updated = super.updateQuest(record);
        this.persist();
        return updated;
    }

    override insertQuestCompletion(record: QuestCompletionRecord): QuestCompletionRecord {
        const created = super.insertQuestCompletion(record);
        this.persist();
        return created;
    }

    override updateQuestCompletion(record: QuestCompletionRecord): QuestCompletionRecord {
        const updated = super.updateQuestCompletion(record);
        this.persist();
        return updated;
    }

    override resetQuestsForTest(): void {
        super.resetQuestsForTest();
        this.persist();
    }

    override insertMigrationCredit(record: MigrationCreditRecord): MigrationCreditRecord {
        const created = super.insertMigrationCredit(record);
        this.persist();
        return created;
    }

    override updateMigrationCredit(record: MigrationCreditRecord): MigrationCreditRecord {
        const updated = super.updateMigrationCredit(record);
        this.persist();
        return updated;
    }

    override resetMigrationCreditsForTest(): void {
        super.resetMigrationCreditsForTest();
        this.persist();
    }

    override insertBountyReward(record: BountyRewardRecord): BountyRewardRecord {
        const created = super.insertBountyReward(record);
        this.persist();
        return created;
    }

    override updateBountyReward(record: BountyRewardRecord): BountyRewardRecord {
        const updated = super.updateBountyReward(record);
        this.persist();
        return updated;
    }

    override resetBountyRewardsForTest(): void {
        super.resetBountyRewardsForTest();
        this.persist();
    }

    override insertCreatorSubscriptionTier(
        record: CreatorSubscriptionTierRecord
    ): CreatorSubscriptionTierRecord {
        const created = super.insertCreatorSubscriptionTier(record);
        this.persist();
        return created;
    }

    override updateCreatorSubscriptionTier(
        record: CreatorSubscriptionTierRecord
    ): CreatorSubscriptionTierRecord {
        const updated = super.updateCreatorSubscriptionTier(record);
        this.persist();
        return updated;
    }

    override insertCreatorSubscription(
        record: CreatorSubscriptionRecord
    ): CreatorSubscriptionRecord {
        const created = super.insertCreatorSubscription(record);
        this.persist();
        return created;
    }

    override updateCreatorSubscription(
        record: CreatorSubscriptionRecord
    ): CreatorSubscriptionRecord {
        const updated = super.updateCreatorSubscription(record);
        this.persist();
        return updated;
    }

    override resetCreatorSubscriptionsForTest(): void {
        super.resetCreatorSubscriptionsForTest();
        this.persist();
    }

    override insertCommunityBoostPledge(
        record: CommunityBoostPledgeRecord
    ): CommunityBoostPledgeRecord {
        const created = super.insertCommunityBoostPledge(record);
        this.persist();
        return created;
    }

    override updateCommunityBoostPledge(
        record: CommunityBoostPledgeRecord
    ): CommunityBoostPledgeRecord {
        const updated = super.updateCommunityBoostPledge(record);
        this.persist();
        return updated;
    }

    override resetCommunityBoostsForTest(): void {
        super.resetCommunityBoostsForTest();
        this.persist();
    }

    override insertAidPool(record: AidPoolRecord): AidPoolRecord {
        const created = super.insertAidPool(record);
        this.persist();
        return created;
    }

    override updateAidPool(record: AidPoolRecord): AidPoolRecord {
        const updated = super.updateAidPool(record);
        this.persist();
        return updated;
    }

    override resetAidPoolsForTest(): void {
        super.resetAidPoolsForTest();
        this.persist();
    }

    override insertAdRevenuePeriod(record: AdRevenuePeriodRecord): AdRevenuePeriodRecord {
        const created = super.insertAdRevenuePeriod(record);
        this.persist();
        return created;
    }

    override updateAdRevenuePeriod(record: AdRevenuePeriodRecord): AdRevenuePeriodRecord {
        const updated = super.updateAdRevenuePeriod(record);
        this.persist();
        return updated;
    }

    override insertAdRevenueShare(record: AdRevenueShareRecord): AdRevenueShareRecord {
        const created = super.insertAdRevenueShare(record);
        this.persist();
        return created;
    }

    override updateAdRevenueShare(record: AdRevenueShareRecord): AdRevenueShareRecord {
        const updated = super.updateAdRevenueShare(record);
        this.persist();
        return updated;
    }

    override resetAdRevenueForTest(): void {
        super.resetAdRevenueForTest();
        this.persist();
    }

    override upsertLinkedAccount(
        input: Omit<LinkedAccountRecord, 'createdAt' | 'updatedAt'>
    ): LinkedAccountRecord {
        const record = super.upsertLinkedAccount(input);
        this.persist();
        return record;
    }

    override deleteLinkedAccount(userId: string, provider: LinkedAccountProvider): boolean {
        const removed = super.deleteLinkedAccount(userId, provider);
        if (removed) this.persist();
        return removed;
    }

    override setLinkedAccountSyncCursor(
        userId: string,
        provider: LinkedAccountProvider,
        cursor: string | undefined
    ): LinkedAccountRecord | undefined {
        const updated = super.setLinkedAccountSyncCursor(userId, provider, cursor);
        if (updated) this.persist();
        return updated;
    }

    override createPendingOAuthLink(
        input: Omit<PendingOAuthLinkRecord, 'createdAt'>
    ): PendingOAuthLinkRecord {
        const record = super.createPendingOAuthLink(input);
        this.persist();
        return record;
    }

    override consumePendingOAuthLink(stateHash: string): PendingOAuthLinkRecord | undefined {
        const consumed = super.consumePendingOAuthLink(stateHash);
        if (consumed) this.persist();
        return consumed;
    }

    override prunePendingOAuthLinks(now: Date = new Date()): number {
        const removed = super.prunePendingOAuthLinks(now);
        if (removed > 0) this.persist();
        return removed;
    }

    override prunePendingOidcLogins(now: Date = new Date()): number {
        const removed = super.prunePendingOidcLogins(now);
        if (removed > 0) this.persist();
        return removed;
    }

    override createTwitchChatBridge(
        input: Omit<TwitchChatBridgeRecord, 'createdAt' | 'updatedAt'>
    ): TwitchChatBridgeRecord {
        const record = super.createTwitchChatBridge(input);
        this.persist();
        return record;
    }

    override updateTwitchChatBridge(
        id: string,
        patch: Partial<Omit<TwitchChatBridgeRecord, 'id' | 'createdAt'>>
    ): TwitchChatBridgeRecord | undefined {
        const updated = super.updateTwitchChatBridge(id, patch);
        if (updated) this.persist();
        return updated;
    }

    override deleteTwitchChatBridge(id: string): boolean {
        const removed = super.deleteTwitchChatBridge(id);
        if (removed) this.persist();
        return removed;
    }

    override createTwitchEventSubscription(
        input: Omit<TwitchEventSubscriptionRecord, 'createdAt' | 'updatedAt'>
    ): TwitchEventSubscriptionRecord {
        const record = super.createTwitchEventSubscription(input);
        this.persist();
        return record;
    }

    override updateTwitchEventSubscriptionStatus(
        helixId: string,
        status: string
    ): TwitchEventSubscriptionRecord | undefined {
        const updated = super.updateTwitchEventSubscriptionStatus(helixId, status);
        if (updated) this.persist();
        return updated;
    }

    override deleteTwitchEventSubscription(helixId: string): boolean {
        const removed = super.deleteTwitchEventSubscription(helixId);
        if (removed) this.persist();
        return removed;
    }

    override createWidgetAlertToken(
        input: Omit<WidgetAlertTokenRecord, 'createdAt'>
    ): WidgetAlertTokenRecord {
        const record = super.createWidgetAlertToken(input);
        this.persist();
        return record;
    }

    override revokeWidgetAlertToken(
        id: string,
        reason: string
    ): WidgetAlertTokenRecord | undefined {
        const updated = super.revokeWidgetAlertToken(id, reason);
        if (updated) this.persist();
        return updated;
    }

    // No `touchWidgetAlertTokenDelivered` override — touching last-delivered on
    // every SSE flush would write the JSON store thousands of times per
    // stream. The diagnostic field is in-memory only on the file-backed db.

    override createYoutubeChatBridge(
        input: Omit<YoutubeChatBridgeRecord, 'createdAt' | 'updatedAt'>
    ): YoutubeChatBridgeRecord {
        const record = super.createYoutubeChatBridge(input);
        this.persist();
        return record;
    }

    override updateYoutubeChatBridge(
        id: string,
        patch: Partial<Omit<YoutubeChatBridgeRecord, 'id' | 'createdAt'>>
    ): YoutubeChatBridgeRecord | undefined {
        const updated = super.updateYoutubeChatBridge(id, patch);
        if (updated) this.persist();
        return updated;
    }

    override deleteYoutubeChatBridge(id: string): boolean {
        const removed = super.deleteYoutubeChatBridge(id);
        if (removed) this.persist();
        return removed;
    }

    override createKickChatBridge(
        input: Omit<KickChatBridgeRecord, 'createdAt' | 'updatedAt'>
    ): KickChatBridgeRecord {
        const record = super.createKickChatBridge(input);
        this.persist();
        return record;
    }

    override updateKickChatBridge(
        id: string,
        patch: Partial<Omit<KickChatBridgeRecord, 'id' | 'createdAt'>>
    ): KickChatBridgeRecord | undefined {
        const updated = super.updateKickChatBridge(id, patch);
        if (updated) this.persist();
        return updated;
    }

    override deleteKickChatBridge(id: string): boolean {
        const removed = super.deleteKickChatBridge(id);
        if (removed) this.persist();
        return removed;
    }

    override createDiscordServerImport(
        input: Omit<DiscordServerImportRecord, 'createdAt' | 'updatedAt'>
    ): DiscordServerImportRecord {
        const record = super.createDiscordServerImport(input);
        this.persist();
        return record;
    }

    override updateDiscordServerImport(
        id: string,
        patch: Partial<Omit<DiscordServerImportRecord, 'id' | 'createdAt'>>
    ): DiscordServerImportRecord | undefined {
        const updated = super.updateDiscordServerImport(id, patch);
        if (updated) this.persist();
        return updated;
    }

    override createDiscordImportMapping(
        input: Omit<DiscordImportMappingRecord, 'createdAt'>
    ): DiscordImportMappingRecord {
        const record = super.createDiscordImportMapping(input);
        this.persist();
        return record;
    }

    override createDiscordBridgeActivation(
        input: Omit<DiscordBridgeActivationRecord, 'createdAt' | 'updatedAt'>
    ): DiscordBridgeActivationRecord {
        const record = super.createDiscordBridgeActivation(input);
        this.persist();
        return record;
    }

    override updateDiscordBridgeActivation(
        id: string,
        patch: Partial<Omit<DiscordBridgeActivationRecord, 'id' | 'createdAt'>>
    ): DiscordBridgeActivationRecord | undefined {
        const updated = super.updateDiscordBridgeActivation(id, patch);
        if (updated) this.persist();
        return updated;
    }

    override deleteDiscordBridgeActivation(id: string): boolean {
        const removed = super.deleteDiscordBridgeActivation(id);
        if (removed) this.persist();
        return removed;
    }

    override createSimulcastDestination(
        input: Omit<SimulcastDestinationRecord, 'createdAt' | 'updatedAt'>
    ): SimulcastDestinationRecord {
        const record = super.createSimulcastDestination(input);
        this.persist();
        return record;
    }

    override updateSimulcastDestination(
        id: string,
        patch: Partial<Omit<SimulcastDestinationRecord, 'id' | 'createdAt'>>
    ): SimulcastDestinationRecord | undefined {
        const updated = super.updateSimulcastDestination(id, patch);
        if (updated) this.persist();
        return updated;
    }

    override deleteSimulcastDestination(id: string): boolean {
        const removed = super.deleteSimulcastDestination(id);
        if (removed) this.persist();
        return removed;
    }

    override createDiscordCompatWebhook(
        input: Omit<DiscordCompatWebhookRecord, 'createdAt' | 'updatedAt'>
    ): DiscordCompatWebhookRecord {
        const record = super.createDiscordCompatWebhook(input);
        this.persist();
        return record;
    }

    override updateDiscordCompatWebhook(
        id: string,
        patch: Partial<Omit<DiscordCompatWebhookRecord, 'id' | 'createdAt'>>
    ): DiscordCompatWebhookRecord | undefined {
        const updated = super.updateDiscordCompatWebhook(id, patch);
        if (updated) this.persist();
        return updated;
    }

    override deleteDiscordCompatWebhook(id: string): boolean {
        const removed = super.deleteDiscordCompatWebhook(id);
        if (removed) this.persist();
        return removed;
    }

    override createOutboundEventWebhook(
        input: Omit<OutboundEventWebhookRecord, 'createdAt' | 'updatedAt'>
    ): OutboundEventWebhookRecord {
        const record = super.createOutboundEventWebhook(input);
        this.persist();
        return record;
    }

    override updateOutboundEventWebhook(
        id: string,
        patch: Partial<Omit<OutboundEventWebhookRecord, 'id' | 'createdAt'>>
    ): OutboundEventWebhookRecord | undefined {
        const updated = super.updateOutboundEventWebhook(id, patch);
        if (updated) this.persist();
        return updated;
    }

    override deleteOutboundEventWebhook(id: string): boolean {
        const removed = super.deleteOutboundEventWebhook(id);
        if (removed) this.persist();
        return removed;
    }

    override createTwitchIrcBotToken(
        input: Omit<TwitchIrcBotTokenRecord, 'createdAt' | 'updatedAt'>
    ): TwitchIrcBotTokenRecord {
        const record = super.createTwitchIrcBotToken(input);
        this.persist();
        return record;
    }

    override revokeTwitchIrcBotToken(
        id: string,
        reason: string
    ): TwitchIrcBotTokenRecord | undefined {
        const updated = super.revokeTwitchIrcBotToken(id, reason);
        if (updated) this.persist();
        return updated;
    }

    // No `touchTwitchIrcBotTokenUsed` override — write amplification on
    // every IRC auth would thrash the JSON store. Diagnostic field is
    // in-memory only on the file-backed db.

    override deleteTwitchIrcBotToken(id: string): boolean {
        const removed = super.deleteTwitchIrcBotToken(id);
        if (removed) this.persist();
        return removed;
    }

    override createObsWsPassword(
        input: Omit<ObsWsPasswordRecord, 'createdAt' | 'updatedAt'>
    ): ObsWsPasswordRecord {
        const record = super.createObsWsPassword(input);
        this.persist();
        return record;
    }

    override revokeObsWsPassword(id: string, reason: string): ObsWsPasswordRecord | undefined {
        const updated = super.revokeObsWsPassword(id, reason);
        if (updated) this.persist();
        return updated;
    }

    // No `touchObsWsPasswordUsed` override — write amplification on every
    // OBS-WS connection would thrash the JSON store. In-memory only.

    override deleteObsWsPassword(id: string): boolean {
        const removed = super.deleteObsWsPassword(id);
        if (removed) this.persist();
        return removed;
    }

    override upsertCoalitionSpatialItem(
        input: Omit<CoalitionSpatialItemRecord, 'createdAt' | 'updatedAt'>
    ): CoalitionSpatialItemRecord {
        const created = super.upsertCoalitionSpatialItem(input);
        this.persist();
        return created;
    }

    override deleteCoalitionSpatialItem(id: string): boolean {
        const deleted = super.deleteCoalitionSpatialItem(id);
        this.persist();
        return deleted;
    }

    override deleteCoalitionExternalActivity(id: string): boolean {
        const deleted = super.deleteCoalitionExternalActivity(id);
        this.persist();
        return deleted;
    }

    override deleteCoalitionExternalActivities(ids: string[]): string[] {
        const deleted = super.deleteCoalitionExternalActivities(ids);
        if (deleted.length > 0) this.persist();
        return deleted;
    }

    override upsertCoalition(
        input: Omit<CoalitionRecord, 'createdAt' | 'updatedAt'>
    ): CoalitionRecord {
        const written = super.upsertCoalition(input);
        this.persist();
        return written;
    }

    override upsertCoalitionMembership(
        input: Omit<CoalitionMembershipRecord, 'createdAt' | 'updatedAt'>
    ): CoalitionMembershipRecord {
        const written = super.upsertCoalitionMembership(input);
        this.persist();
        return written;
    }

    override upsertCoalitionJoinRequest(
        input: Omit<CoalitionJoinRequestRecord, 'createdAt' | 'updatedAt'>
    ): CoalitionJoinRequestRecord {
        const written = super.upsertCoalitionJoinRequest(input);
        this.persist();
        return written;
    }

    override upsertCoalitionConnection(
        input: Omit<CoalitionConnectionRecord, 'createdAt' | 'updatedAt'>
    ): CoalitionConnectionRecord {
        const written = super.upsertCoalitionConnection(input);
        this.persist();
        return written;
    }

    override upsertCoalitionMemberConnection(
        input: Omit<CoalitionMemberConnectionRecord, 'createdAt' | 'updatedAt'>
    ): CoalitionMemberConnectionRecord {
        const written = super.upsertCoalitionMemberConnection(input);
        this.persist();
        return written;
    }

    override upsertCoalitionCampaign(
        input: Omit<CoalitionCampaignRecord, 'createdAt' | 'updatedAt'>
    ): CoalitionCampaignRecord {
        const written = super.upsertCoalitionCampaign(input);
        this.persist();
        return written;
    }

    override upsertCoalitionCampaignPost(
        input: Omit<CoalitionCampaignPostRecord, 'createdAt' | 'updatedAt'>
    ): CoalitionCampaignPostRecord {
        const written = super.upsertCoalitionCampaignPost(input);
        this.persist();
        return written;
    }

    override upsertCoalitionExternalActivity(
        input: Omit<CoalitionExternalActivityRecord, 'createdAt' | 'updatedAt'>
    ): CoalitionExternalActivityRecord {
        const written = super.upsertCoalitionExternalActivity(input);
        this.persist();
        return written;
    }

    override upsertCoalitionCampaignSyncOptIn(
        input: Omit<CoalitionCampaignSyncOptInRecord, 'createdAt' | 'updatedAt'>
    ): CoalitionCampaignSyncOptInRecord {
        const written = super.upsertCoalitionCampaignSyncOptIn(input);
        this.persist();
        return written;
    }

    override upsertCoalitionSuccessionPetition(
        input: Omit<CoalitionSuccessionPetitionRecord, 'createdAt' | 'updatedAt'>
    ): CoalitionSuccessionPetitionRecord {
        const written = super.upsertCoalitionSuccessionPetition(input);
        this.persist();
        return written;
    }

    override upsertCoalitionCampaignPayee(
        input: Omit<CoalitionCampaignPayeeRecord, 'createdAt' | 'updatedAt'>
    ): CoalitionCampaignPayeeRecord {
        const written = super.upsertCoalitionCampaignPayee(input);
        this.persist();
        return written;
    }

    override upsertCampaignAttribution(
        input: Omit<CampaignAttributionRecord, 'createdAt' | 'updatedAt' | 'id'>
    ): CampaignAttributionRecord {
        const written = super.upsertCampaignAttribution(input);
        this.persist();
        return written;
    }

    override upsertCampaignEngagement(
        input: Omit<CampaignEngagementRecord, 'createdAt' | 'updatedAt'>
    ): CampaignEngagementRecord {
        const written = super.upsertCampaignEngagement(input);
        this.persist();
        return written;
    }

    override upsertCoalitionCampaignContribution(
        input: Omit<CoalitionCampaignContributionRecord, 'createdAt' | 'updatedAt'>
    ): CoalitionCampaignContributionRecord {
        const written = super.upsertCoalitionCampaignContribution(input);
        this.persist();
        return written;
    }

    override upsertCoalitionBoost(
        input: Omit<CoalitionBoostRecord, 'createdAt' | 'updatedAt'>
    ): CoalitionBoostRecord {
        const written = super.upsertCoalitionBoost(input);
        this.persist();
        return written;
    }

    override updateCoalitionProject(
        id: string,
        patch: Partial<
            Pick<
                CoalitionProjectRecord,
                | 'title'
                | 'description'
                | 'category'
                | 'fundingGoalCents'
                | 'currency'
                | 'useOfFunds'
                | 'deadlineAt'
                | 'milestones'
                | 'place'
            >
        >
    ): CoalitionProjectRecord | undefined {
        const updated = super.updateCoalitionProject(id, patch);
        if (updated) this.persist();
        return updated;
    }

    override addCoalitionProjectSupport(
        input: Omit<CoalitionProjectSupportRecord, 'createdAt'> & { createdAt?: string }
    ): CoalitionProjectSupportRecord {
        const created = super.addCoalitionProjectSupport(input);
        this.persist();
        return created;
    }

    override applyCoalitionProjectSupport(
        id: string,
        amountCents: number,
        milestones: CoalitionProjectRecord['milestones']
    ): CoalitionProjectRecord | undefined {
        const updated = super.applyCoalitionProjectSupport(id, amountCents, milestones);
        if (updated) this.persist();
        return updated;
    }

    override upsertCoalitionSurge(
        input: Omit<CoalitionSurgeRecord, 'createdAt' | 'updatedAt'> & {
            createdAt?: string;
            updatedAt?: string;
        }
    ): CoalitionSurgeRecord {
        const written = super.upsertCoalitionSurge(input);
        this.persist();
        return written;
    }

    override addCoalitionNotification(
        input: Omit<CoalitionNotificationRecord, 'createdAt'> & { createdAt?: string }
    ): CoalitionNotificationRecord {
        const created = super.addCoalitionNotification(input);
        this.persist();
        return created;
    }

    override markCoalitionNotificationRead(
        id: string,
        recipientUserId: string
    ): CoalitionNotificationRecord | undefined {
        const updated = super.markCoalitionNotificationRead(id, recipientUserId);
        if (updated) this.persist();
        return updated;
    }

    override createCoalitionAidPost(
        input: Omit<CoalitionAidPostRecord, 'createdAt'>
    ): CoalitionAidPostRecord {
        const created = super.createCoalitionAidPost(input);
        this.persist();
        return created;
    }

    override upsertCoalitionAidPostByOrigin(
        input: Omit<CoalitionAidPostRecord, 'createdAt'> & {
            source: string;
            externalId: string;
        }
    ): CoalitionAidPostRecord {
        const written = super.upsertCoalitionAidPostByOrigin(input);
        this.persist();
        return written;
    }

    override upsertCoalitionEvent(
        input: Omit<CoalitionEventRecord, 'createdAt' | 'updatedAt'>
    ): CoalitionEventRecord {
        const created = super.upsertCoalitionEvent(input);
        this.persist();
        return created;
    }

    override upsertEventRsvp(
        input: Omit<EventRsvpRecord, 'createdAt' | 'updatedAt'>
    ): EventRsvpRecord {
        const created = super.upsertEventRsvp(input);
        this.persist();
        return created;
    }

    override upsertVolunteerSlot(
        input: Omit<VolunteerSlotRecord, 'createdAt' | 'updatedAt'>
    ): VolunteerSlotRecord {
        const created = super.upsertVolunteerSlot(input);
        this.persist();
        return created;
    }

    override upsertVolunteerSignup(
        input: Omit<VolunteerSignupRecord, 'createdAt' | 'updatedAt'>
    ): VolunteerSignupRecord {
        const created = super.upsertVolunteerSignup(input);
        this.persist();
        return created;
    }

    override upsertRideOffer(
        input: Omit<RideOfferRecord, 'createdAt' | 'updatedAt'>
    ): RideOfferRecord {
        const created = super.upsertRideOffer(input);
        this.persist();
        return created;
    }

    override upsertRideClaim(
        input: Omit<RideClaimRecord, 'createdAt' | 'updatedAt'>
    ): RideClaimRecord {
        const created = super.upsertRideClaim(input);
        this.persist();
        return created;
    }

    override upsertCoalitionRing(
        input: Omit<CoalitionRingRecord, 'createdAt' | 'updatedAt'>
    ): CoalitionRingRecord {
        const created = super.upsertCoalitionRing(input);
        this.persist();
        return created;
    }

    override upsertRingMembership(
        input: Omit<RingMembershipRecord, 'createdAt' | 'updatedAt'>
    ): RingMembershipRecord {
        const created = super.upsertRingMembership(input);
        this.persist();
        return created;
    }

    override upsertRingInvitation(
        input: Omit<RingInvitationRecord, 'createdAt' | 'updatedAt'>
    ): RingInvitationRecord {
        const created = super.upsertRingInvitation(input);
        this.persist();
        return created;
    }

    override recordCoalitionKitApplication(
        input: Omit<CoalitionKitApplicationRecord, 'createdAt'>
    ): CoalitionKitApplicationRecord {
        const created = super.recordCoalitionKitApplication(input);
        this.persist();
        return created;
    }

    override createCoalitionTask(
        input: Omit<CoalitionTaskRecord, 'status' | 'createdAt' | 'updatedAt'>
    ): CoalitionTaskRecord {
        const created = super.createCoalitionTask(input);
        this.persist();
        return created;
    }

    override updateCoalitionTaskStatus(
        id: string,
        status: CoalitionTaskRecord['status']
    ): CoalitionTaskRecord | undefined {
        const updated = super.updateCoalitionTaskStatus(id, status);
        if (updated) this.persist();
        return updated;
    }

    override createCoalitionNeed(
        input: Omit<CoalitionNeedRecord, 'status' | 'createdAt' | 'updatedAt'>
    ): CoalitionNeedRecord {
        const created = super.createCoalitionNeed(input);
        this.persist();
        return created;
    }

    override updateCoalitionNeed(
        id: string,
        patch: Partial<Pick<CoalitionNeedRecord, 'status' | 'fulfilledByListingId' | 'place'>>
    ): CoalitionNeedRecord | undefined {
        const updated = super.updateCoalitionNeed(id, patch);
        if (updated) this.persist();
        return updated;
    }

    override createCoalitionProject(
        input: Omit<CoalitionProjectRecord, 'status' | 'createdAt' | 'updatedAt'>
    ): CoalitionProjectRecord {
        const created = super.createCoalitionProject(input);
        this.persist();
        return created;
    }

    override updateCoalitionProjectStatus(
        id: string,
        status: CoalitionProjectRecord['status']
    ): CoalitionProjectRecord | undefined {
        const updated = super.updateCoalitionProjectStatus(id, status);
        if (updated) this.persist();
        return updated;
    }

    override createCoalitionResource(
        input: Omit<CoalitionResourceRecord, 'availability' | 'createdAt' | 'updatedAt'> & {
            availability?: CoalitionResourceRecord['availability'];
        }
    ): CoalitionResourceRecord {
        const created = super.createCoalitionResource(input);
        this.persist();
        return created;
    }

    override updateCoalitionResource(
        id: string,
        patch: Partial<Pick<CoalitionResourceRecord, 'availability' | 'location' | 'place'>>
    ): CoalitionResourceRecord | undefined {
        const updated = super.updateCoalitionResource(id, patch);
        if (updated) this.persist();
        return updated;
    }

    override createCreatorContent(
        input: Omit<CreatorContentRecord, 'status' | 'createdAt' | 'updatedAt' | 'publishedAt'> & {
            status?: CreatorContentRecord['status'];
        }
    ): CreatorContentRecord {
        const created = super.createCreatorContent(input);
        this.persist();
        return created;
    }

    override updateCreatorContent(
        id: string,
        patch: Partial<
            Pick<
                CreatorContentRecord,
                'title' | 'body' | 'mediaUrl' | 'status' | 'scheduledFor' | 'publishedAt'
            >
        >
    ): CreatorContentRecord | undefined {
        const updated = super.updateCreatorContent(id, patch);
        if (updated) this.persist();
        return updated;
    }

    override addContentDistribution(
        input: Omit<ContentDistributionRecord, 'createdAt'>
    ): ContentDistributionRecord {
        const created = super.addContentDistribution(input);
        this.persist();
        return created;
    }

    override upsertProductReview(
        input: Omit<ProductReviewRecord, 'createdAt' | 'updatedAt'>
    ): ProductReviewRecord {
        const created = super.upsertProductReview(input);
        this.persist();
        return created;
    }

    override addProductVersion(
        input: Omit<ProductVersionRecord, 'releasedAt'> & { releasedAt?: string }
    ): ProductVersionRecord {
        const created = super.addProductVersion(input);
        this.persist();
        return created;
    }

    override upsertSellerLocation(
        input: Omit<SellerLocationRecord, 'createdAt' | 'updatedAt'>
    ): SellerLocationRecord {
        const created = super.upsertSellerLocation(input);
        this.persist();
        return created;
    }

    override upsertSellerProfile(
        input: Omit<SellerProfileRecord, 'updatedAt'>
    ): SellerProfileRecord {
        const created = super.upsertSellerProfile(input);
        this.persist();
        return created;
    }

    override upsertCoalitionFeedItem(
        input: Omit<CoalitionFeedItemRecord, 'updatedAt'>
    ): CoalitionFeedItemRecord {
        const created = super.upsertCoalitionFeedItem(input);
        this.persist();
        return created;
    }

    override upsertCoalitionFeedLike(
        input: Omit<CoalitionFeedLikeRecord, 'createdAt' | 'updatedAt'>
    ): CoalitionFeedLikeRecord {
        const saved = super.upsertCoalitionFeedLike(input);
        this.persist();
        return saved;
    }

    override createCoalitionFeedComment(
        input: Omit<CoalitionFeedCommentRecord, 'createdAt'>
    ): CoalitionFeedCommentRecord {
        const created = super.createCoalitionFeedComment(input);
        this.persist();
        return created;
    }

    override createPluginInstallation(
        input: Omit<PluginInstallationRecord, 'installedAt' | 'updatedAt'>
    ): PluginInstallationRecord {
        const created = super.createPluginInstallation(input);
        this.persist();
        return created;
    }

    override updatePluginInstallation(
        id: string,
        patch: Partial<Omit<PluginInstallationRecord, 'id' | 'installedAt'>>
    ): PluginInstallationRecord | undefined {
        const updated = super.updatePluginInstallation(id, patch);
        if (updated) this.persist();
        return updated;
    }

    override deletePluginInstallation(id: string): boolean {
        const removed = super.deletePluginInstallation(id);
        if (removed) this.persist();
        return removed;
    }

    override createPluginDen(input: Omit<PluginDenRecord, 'createdAt'>): PluginDenRecord {
        const created = super.createPluginDen(input);
        this.persist();
        return created;
    }

    override createCoalitionKitManifestApplication(
        input: Omit<CoalitionKitManifestApplicationRecord, 'createdAt' | 'updatedAt'>
    ): CoalitionKitManifestApplicationRecord {
        const created = super.createCoalitionKitManifestApplication(input);
        this.persist();
        return created;
    }

    override updateCoalitionKitManifestApplication(
        id: string,
        patch: Partial<Omit<CoalitionKitManifestApplicationRecord, 'id' | 'createdAt'>>
    ): CoalitionKitManifestApplicationRecord | undefined {
        const updated = super.updateCoalitionKitManifestApplication(id, patch);
        if (updated) this.persist();
        return updated;
    }

    override upsertPluginReview(
        input: Omit<PluginReviewRecord, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
    ): PluginReviewRecord {
        const saved = super.upsertPluginReview(input);
        this.persist();
        return saved;
    }

    override createPluginFork(input: Omit<PluginForkRecord, 'createdAt'>): PluginForkRecord {
        const created = super.createPluginFork(input);
        this.persist();
        return created;
    }

    override createPluginShowcase(
        input: Omit<PluginShowcaseRecord, 'createdAt'>
    ): PluginShowcaseRecord {
        const created = super.createPluginShowcase(input);
        this.persist();
        return created;
    }

    override upsertColiseumTopic(record: ColiseumTopicRecord): ColiseumTopicRecord {
        const saved = super.upsertColiseumTopic(record);
        this.persist();
        return saved;
    }

    override createColiseumChallenge(
        input: Omit<ColiseumChallengeRecord, 'status' | 'createdAt' | 'updatedAt'>
    ): ColiseumChallengeRecord {
        const created = super.createColiseumChallenge(input);
        this.persist();
        return created;
    }

    override updateColiseumChallengeStatus(
        id: string,
        status: ColiseumChallengeRecord['status']
    ): ColiseumChallengeRecord | undefined {
        const updated = super.updateColiseumChallengeStatus(id, status);
        if (updated) this.persist();
        return updated;
    }

    override createChallengeEntry(
        input: Omit<ChallengeEntryRecord, 'createdAt'>
    ): ChallengeEntryRecord {
        const created = super.createChallengeEntry(input);
        this.persist();
        return created;
    }

    override addChallengeVote(input: Omit<ChallengeVoteRecord, 'createdAt'>): ChallengeVoteRecord {
        const created = super.addChallengeVote(input);
        this.persist();
        return created;
    }

    override upsertColiseumArgument(record: ColiseumArgumentRecord): ColiseumArgumentRecord {
        const saved = super.upsertColiseumArgument(record);
        this.persist();
        return saved;
    }

    override upsertColiseumArguments(records: readonly ColiseumArgumentRecord[]): void {
        super.upsertColiseumArguments(records);
        this.persist();
    }

    override upsertColiseumVote(record: ColiseumVoteRecord): ColiseumVoteRecord {
        const saved = super.upsertColiseumVote(record);
        this.persist();
        return saved;
    }

    override upsertColiseumLiveSession(
        record: ColiseumLiveSessionRecord
    ): ColiseumLiveSessionRecord {
        const saved = super.upsertColiseumLiveSession(record);
        this.persist();
        return saved;
    }

    override upsertColiseumMatch(record: ColiseumMatchRecord): ColiseumMatchRecord {
        const saved = super.upsertColiseumMatch(record);
        this.persist();
        return saved;
    }

    override upsertColiseumRound(record: ColiseumRoundRecord): ColiseumRoundRecord {
        const saved = super.upsertColiseumRound(record);
        this.persist();
        return saved;
    }

    override upsertColiseumRoundVote(record: ColiseumRoundVoteRecord): ColiseumRoundVoteRecord {
        const saved = super.upsertColiseumRoundVote(record);
        this.persist();
        return saved;
    }

    override upsertColiseumShout(record: ColiseumShoutRecord): ColiseumShoutRecord {
        const saved = super.upsertColiseumShout(record);
        this.persist();
        return saved;
    }

    override upsertColiseumResponseDrop(
        record: ColiseumResponseDropRecord
    ): ColiseumResponseDropRecord {
        const saved = super.upsertColiseumResponseDrop(record);
        this.persist();
        return saved;
    }

    override upsertColiseumResponseDropVote(
        record: ColiseumResponseDropVoteRecord
    ): ColiseumResponseDropVoteRecord {
        const saved = super.upsertColiseumResponseDropVote(record);
        this.persist();
        return saved;
    }

    override upsertColiseumBrief(record: ColiseumBriefRecord): ColiseumBriefRecord {
        const saved = super.upsertColiseumBrief(record);
        this.persist();
        return saved;
    }

    override upsertColiseumExplainer(record: ColiseumExplainerRecord): ColiseumExplainerRecord {
        const saved = super.upsertColiseumExplainer(record);
        this.persist();
        return saved;
    }

    override upsertColiseumExplainerVote(
        record: ColiseumExplainerVoteRecord
    ): ColiseumExplainerVoteRecord {
        const saved = super.upsertColiseumExplainerVote(record);
        this.persist();
        return saved;
    }

    override upsertColiseumCrucibleStatement(
        record: ColiseumCrucibleStatementRecord
    ): ColiseumCrucibleStatementRecord {
        const saved = super.upsertColiseumCrucibleStatement(record);
        this.persist();
        return saved;
    }

    override upsertColiseumCrucibleVote(
        record: ColiseumCrucibleVoteRecord
    ): ColiseumCrucibleVoteRecord {
        const saved = super.upsertColiseumCrucibleVote(record);
        this.persist();
        return saved;
    }

    override addReputationEvent(record: ReputationEventRecord): ReputationEventRecord {
        const saved = super.addReputationEvent(record);
        this.persist();
        return saved;
    }

    override resetReputationEvents(): void {
        super.resetReputationEvents();
        this.persist();
    }
}

/**
 * Postgres-backed store (BLACKOUT_DB_MODE=postgres). Write-behind: reads are
 * inherited from InMemoryDb (served from the in-memory mirror hydrated on
 * boot), and every MUTATOR_SPECS mutator is wrapped to queue a Postgres write
 * after updating the mirror. The mutator returns before that write runs, so a
 * crash, or a write that fails twice (db_write_behind_failures_total), loses
 * it; flushRuntimeStoreWrites awaits the queue where that matters.
 *
 * What is written: an upsert of the record a method returned, or a targeted
 * op (pgDescriptors) that names the rows the call changed, by key or by a
 * predicate Postgres evaluates, in one transaction. No write reconciles a
 * whole table against this mirror, so a row another process wrote is never
 * deleted because this one has not heard of it. A targeted op writes only the
 * rows its call changed. An upsert writes the one row the call returned,
 * whole, even when the call left it unchanged (markUserEmailVerified on a
 * verified account rewrites the row, password_hash included, from this
 * mirror's copy), so it can overwrite a newer version of that row (the last
 * writer wins), unless its spec narrows it: an insert-only upsert leaves a
 * stored row as it is, and a guarded one updates it only while it still holds
 * the fields the call read (the dead-man release notices).
 *
 * The dead-man switch's own writes are a third kind, outside MUTATOR_SPECS:
 * arming, a check-in, a cancel, the sweep's move, the owner's deletion and
 * the removal of a release are each one conditional statement the caller
 * awaits, run in the switch's lane of the queue (`enqueueCall`), and the
 * mirror takes the row Postgres returned, never the reverse; each is
 * announced as a `'u'` of that row once it has been taken (`armDeadmanSwitch`,
 * `writeDeadmanSwitchIf`, docs/security/release-envelope-2026-10-26.md §15).
 *
 * Multi-replica consistency: when a change transport is supplied — Postgres
 * LISTEN/NOTIFY, ON BY DEFAULT (BLACKOUT_DB_PG_NOTIFY=1) — each replica
 * subscribes to peers' change notifications and re-reads the keys they name,
 * so a write on one replica becomes visible on the others once they hear of
 * it. A read on replica B in the gap between a write committing on replica A
 * and the notification arriving still sees the old value, and a
 * check-then-act on B's mirror in that gap (a single-use token, a rotation, a
 * bounty accept) can succeed once on each replica. Where the write is
 * targeted, Postgres keeps the first (a consume updates only an unconsumed
 * row) and the loser's mirror re-reads; where it is an upsert, the last writer
 * wins. A targeted op's notification is sent inside its transaction; an
 * upsert's is sent after it, and is lost if that send fails. The gap ends only
 * when B hears of the change, and some processes never do. One that starts
 * while others are writing loads its copy before it starts listening, and
 * nothing re-reads what changed in between. Most writes, a sign-out among
 * them, send their notification after the write, and a failed send is only
 * logged. A listening connection that dies without an error is not noticed.
 * Such a process keeps its old copy of the row until it restarts, or until
 * something makes it re-read the row (a later change to the same row, or its
 * listening connection failing and being replaced); see KNOWN_LIMITATIONS.md,
 * "Several API processes on one database". With the transport disabled
 * (BLACKOUT_DB_PG_NOTIFY=0) the store is strictly single-writer and must run
 * at exactly one replica.
 */
type MutableMap = Map<string, Record<string, unknown>>;

/** How long a failed re-hydrate (after a dropped LISTEN connection) waits before trying again. */
export const REHYDRATE_RETRY_MS = 5_000;

const ABSENT: unique symbol = Symbol('absent');
type Prior = Record<string, unknown> | typeof ABSENT;
const activeCaptures = new WeakMap<MutableMap, Set<Map<string, Prior>>>();

/**
 * Record, for one synchronous mutator call, what each key of `map` held before
 * the call first wrote it (ABSENT for a key it added). set/delete/clear are
 * shadowed on the instance for the duration of the call only, and the shadows
 * call the instance's own methods, so a Map subclass that keeps an index over
 * its rows still sees every write. A mutator that calls another shares one
 * shadow between the two captures.
 */
function captureWrites(map: MutableMap): { prior: Map<string, Prior>; stop(): void } {
    const target = map as unknown as Record<string, unknown>;
    const own = Object.getPrototypeOf(map) as MutableMap;
    let recorders = activeCaptures.get(map);
    if (!recorders) {
        const active = new Set<Map<string, Prior>>();
        recorders = active;
        activeCaptures.set(map, active);
        const note = (k: string) => {
            for (const r of active) {
                if (!r.has(k)) {
                    r.set(
                        k,
                        Map.prototype.has.call(map, k) ? Map.prototype.get.call(map, k) : ABSENT
                    );
                }
            }
        };
        target.set = function (this: MutableMap, k: string, v: Record<string, unknown>) {
            note(k);
            return own.set.call(this, k, v);
        };
        target.delete = function (this: MutableMap, k: string) {
            note(k);
            return own.delete.call(this, k);
        };
        target.clear = function (this: MutableMap) {
            for (const k of Map.prototype.keys.call(this) as IterableIterator<string>) note(k);
            return own.clear.call(this);
        };
    }
    const prior = new Map<string, Prior>();
    const active = recorders;
    active.add(prior);
    return {
        prior,
        stop() {
            active.delete(prior);
            if (active.size === 0 && activeCaptures.get(map) === active) {
                activeCaptures.delete(map);
                delete target.set;
                delete target.delete;
                delete target.clear;
            }
        },
    };
}

export class PostgresBackedDb extends InMemoryDb {
    private readonly plans = new Map<string, TablePlan>();
    private queue: WriteBehindQueue | null = null;
    private pool: PgPool | null = null;
    private transport: StoreChangeTransport | null = null;
    private rehydrateRetry: ReturnType<typeof setTimeout> | null = null;
    private stopped = false;
    /** Identifies this replica so it can ignore its own change notifications. */
    private readonly instanceId = randomUUID();
    /**
     * Every refresh of the mirror from Postgres (a peer's change, a re-read
     * of a key whose queued write has landed, a reload) runs on this one FIFO
     * chain, in the order it was asked for.
     */
    private applyTail: Promise<void> = Promise.resolve();
    /** map -> key -> key column values: refreshes skipped while a local write was queued. */
    private readonly dirtyKeys = new Map<string, Map<string, unknown[]>>();
    /** Each targeted mutator's steps, compiled against the live schema at init. */
    private compiled = new Map<string, CompiledStep[]>();

    constructor() {
        super();
        this.installWriteThrough();
    }

    private mapByName(name: string): MutableMap {
        return (this as unknown as Record<string, MutableMap>)[name];
    }

    /** Shadow each mutator with a wrapper that calls the original then enqueues a write. */
    private installWriteThrough(): void {
        const proto = InMemoryDb.prototype as unknown as Record<
            string,
            (...a: unknown[]) => unknown
        >;
        const self = this as unknown as Record<string, unknown>;
        for (const [method, spec] of Object.entries(MUTATOR_SPECS)) {
            const original = proto[method];
            if (typeof original !== 'function') {
                // A spec for a method that does not exist would persist nothing.
                throw new Error(`MUTATOR_SPECS names ${method}, which InMemoryDb does not define`);
            }
            if (spec.kind === 'targeted') {
                self[method] = this.targetedWriteThrough(method, spec, original);
                continue;
            }
            self[method] = (...args: unknown[]): unknown => {
                // A write of a switch whose conditional write is in flight
                // here: what it changes is noted for that write's merge.
                const switchId =
                    spec.kind === 'upsert' &&
                    spec.map === 'deadmanSwitches' &&
                    typeof args[0] === 'string' &&
                    this.switchWritesInFlight.has(args[0])
                        ? args[0]
                        : undefined;
                const prior = switchId
                    ? this.mapByName('deadmanSwitches').get(switchId)
                    : undefined;
                const result = original.apply(this, args);
                if (switchId && prior && result && typeof result === 'object') {
                    this.noteOwnSwitchWrite(switchId, prior, result as Record<string, unknown>);
                }
                if (this.queue && result && typeof result === 'object') {
                    this.queue.enqueueUpsert(
                        spec.map,
                        result as Record<string, unknown>,
                        spec.guardOf?.(args),
                        spec.insertOnly
                    );
                }
                return result;
            };
        }
    }

    /**
     * The wrapper for a `targeted` spec. It records which mirror keys the call
     * changed (and what they held before), binds the spec's statements to the
     * call's arguments, result and prior values, and queues them as one op.
     * Nothing is queued when the call changed nothing and no step is
     * set-based (a set-based step can reach rows the mirror does not hold).
     */
    private targetedWriteThrough(
        method: string,
        spec: Extract<MutatorSpec, { kind: 'targeted' }>,
        original: (...a: unknown[]) => unknown
    ): (...args: unknown[]) => unknown {
        const maps = [...new Set(spec.steps.map((s) => s.map))];
        const setBased = spec.steps.some((s) => s.op === 'deleteWhere' || s.op === 'updateWhere');
        return (...args: unknown[]): unknown => {
            const queue = this.queue;
            const compiled = this.compiled.get(method);
            if (!queue || !compiled) return original.apply(this, args);
            const captures = maps.map((m) => {
                const instance = this.mapByName(m);
                return { map: m, instance, capture: captureWrites(instance) };
            });
            let result: unknown;
            try {
                result = original.apply(this, args);
            } finally {
                for (const c of captures) c.capture.stop();
            }
            try {
                this.queueTargeted(method, setBased, compiled, captures, args, result);
            } catch (err) {
                // The mirror has changed and Postgres will not: the same loss
                // condition as a write that failed after its retry. Never
                // thrown into the caller, whose mirror change already stands.
                dbWriteBehindFailuresTotal.inc({ map: maps.join(','), kind: 'targeted' });
                log.error('db_write_behind_failed', {
                    map: maps.join(','),
                    kind: 'targeted',
                    method,
                    error: err instanceof Error ? err.message : String(err),
                });
            }
            return result;
        };
    }

    /** Diff a targeted call's captures, bind its steps, and queue them (targetedWriteThrough). */
    private queueTargeted(
        method: string,
        setBased: boolean,
        compiled: CompiledStep[],
        captures: Array<{
            map: string;
            instance: MutableMap;
            capture: { prior: Map<string, Prior> };
        }>,
        args: unknown[],
        result: unknown
    ): void {
        const queue = this.queue!;
        const touched: KeySet = new Map();
        const priorOf = new Map<string, (key: string) => Prior>();
        const changes = new Map<
            string,
            Array<{
                key: string;
                before?: Record<string, unknown>;
                after?: Record<string, unknown>;
            }>
        >();
        for (const { map: m, instance, capture } of captures) {
            const plan = this.plans.get(m);
            const now = this.mapByName(m);
            const before = (k: string): Prior =>
                capture.prior.has(k)
                    ? capture.prior.get(k)!
                    : instance.has(k)
                    ? instance.get(k)!
                    : ABSENT;
            priorOf.set(m, before);
            if (!plan) continue;
            // A method that replaced the whole map (replaceMeshEnvelopes) is
            // diffed old instance against new; otherwise only written keys.
            const keys =
                now === instance
                    ? [...capture.prior.keys()]
                    : new Set([...capture.prior.keys(), ...instance.keys(), ...now.keys()]);
            const changed = new Map<string, unknown[]>();
            const list: Array<{
                key: string;
                before?: Record<string, unknown>;
                after?: Record<string, unknown>;
            }> = [];
            changes.set(m, list);
            for (const k of keys) {
                const was = before(k);
                const is = now.has(k) ? now.get(k)! : ABSENT;
                if (was === is) continue;
                list.push({
                    key: k,
                    ...(was !== ABSENT ? { before: was } : {}),
                    ...(is !== ABSENT ? { after: is } : {}),
                });
                changed.set(k, kvOf(plan, (is !== ABSENT ? is : was) as Record<string, unknown>));
            }
            if (changed.size > 0) touched.set(m, changed);
        }
        if (touched.size === 0 && !setBased) return;
        const ctx: StepContext = {
            args,
            result,
            at: nowIso(),
            before: (m, k) => {
                const prior = priorOf.has(m) ? priorOf.get(m)!(k) : this.mapByName(m).get(k);
                return prior === ABSENT ? undefined : prior;
            },
            changed: (m) => changes.get(m) ?? [],
        };
        const statements: BoundStatement[] = compiled.flatMap((c) => bindStep(c, ctx));
        if (statements.length > 0) queue.enqueueTargeted({ method, statements, touched });
    }

    /**
     * Compile every targeted spec against this database's tables and PREPARE
     * each statement, so a spec naming a column or type the schema lacks fails
     * the boot instead of every later write.
     *
     * A step on a map whose table this database does not have yet (a
     * migration not applied, which init has already logged as
     * pg_store_table_missing) is left out, as an upsert to that map is: there
     * is no row for it to change. A method left with no step writes the
     * mirror only. A step on a map no descriptor names is a spec error and
     * fails the boot.
     */
    private async compileTargetedSpecs(client: PgClient): Promise<void> {
        const compiled = new Map<string, CompiledStep[]>();
        const described = new Set(TABLE_DESCRIPTORS.map((d) => d.mapName));
        for (const [method, spec] of Object.entries(MUTATOR_SPECS)) {
            if (spec.kind !== 'targeted') continue;
            const steps: CompiledStep[] = [];
            for (const [i, step] of spec.steps.entries()) {
                const where = `MUTATOR_SPECS.${method} step ${i + 1} (${step.op} on ${step.map})`;
                const plan = this.plans.get(step.map);
                if (!plan) {
                    if (!described.has(step.map)) {
                        throw new Error(`${where}: no table descriptor names the map`);
                    }
                    log.warn('pg_store_targeted_step_skipped', {
                        method,
                        step: i + 1,
                        map: step.map,
                        reason: 'table_missing',
                    });
                    continue;
                }
                try {
                    steps.push(compileStep(plan, step));
                } catch (err) {
                    throw new Error(
                        `${where}: ${err instanceof Error ? err.message : String(err)}`
                    );
                }
            }
            if (steps.length > 0) compiled.set(method, steps);
        }
        // One transaction, so a pooler that hands each statement its own
        // server connection cannot split a PREPARE from its DEALLOCATE.
        await client.query('BEGIN');
        try {
            for (const [method, steps] of compiled) {
                for (const [i, c] of steps.entries()) {
                    try {
                        await prepareCheck(client, c.checkSql);
                    } catch (err) {
                        throw new Error(
                            `MUTATOR_SPECS.${method} step ${i + 1} (${c.step.op} on ${
                                c.plan.descriptor.tableName
                            }) does not fit the schema: ${
                                err instanceof Error ? err.message : String(err)
                            }: ${c.checkSql}`
                        );
                    }
                }
            }
            await client.query('COMMIT');
        } catch (err) {
            await client.query('ROLLBACK').catch(() => undefined);
            throw err;
        }
        this.compiled = compiled;
    }

    /**
     * Hydrate every mapped table from Postgres, arm the write-behind queue, and
     * (when a transport is supplied) subscribe to peer change notifications so
     * this replica's mirror stays coherent with writes on other replicas.
     */
    async init(pool: PgPool, transport?: StoreChangeTransport): Promise<void> {
        this.pool = pool;
        await withPooledClient(pool, async (client) => {
            for (const descriptor of TABLE_DESCRIPTORS) {
                const columns = await introspectColumns(client, descriptor.tableName);
                if (columns.length === 0) {
                    log.warn('pg_store_table_missing', { table: descriptor.tableName });
                    continue;
                }
                const plan: TablePlan = {
                    descriptor,
                    columns,
                    columnNames: new Set(columns.map((c) => c.name)),
                };
                this.plans.set(descriptor.mapName, plan);
                await hydrateMap(client, plan, this.mapByName(descriptor.mapName));
            }
            await this.compileTargetedSpecs(client);
        });
        this.transport = transport ?? null;
        this.queue = new WriteBehindQueue(
            pool,
            this.plans,
            transport ?? undefined,
            this.instanceId
        );
        this.queue.onKeysLanded((mapName, keys) => this.rereadLandedKeys(mapName, keys));
        // After a targeted op: re-read the keys where Postgres's effect and the
        // mirror's differ (rows the statements reached that the mirror does not
        // hold, and mirror changes Postgres refused or never saw).
        this.queue.onRereadKeys((keys) => {
            for (const [mapName, kvs] of keys) {
                const plan = this.plans.get(mapName);
                if (plan && kvs.size > 0) {
                    const list = [...kvs.values()];
                    this.onApplyChain('self', () => this.refreshKeys(plan, list), mapName);
                }
            }
        });
        if (transport) {
            await transport.subscribe((payload) => this.applyPeerChange(payload));
            // After a dropped LISTEN connection we may have missed notifications;
            // re-hydrate everything to recover.
            transport.onReconnect(() => this.queueRehydrate());
        }
    }

    /** Queue a mirror refresh on the FIFO apply chain; a failure is logged, never thrown. */
    private onApplyChain(what: string, fn: () => Promise<void>, map?: string): void {
        this.applyTail = this.applyTail.then(fn).catch((err) => {
            log.warn(
                what === 'rehydrate' ? 'pg_store_rehydrate_failed' : 'pg_store_peer_refresh_failed',
                {
                    ...(map ? { map } : {}),
                    what,
                    error: err instanceof Error ? err.message : String(err),
                    ...(what === 'rehydrate' ? { retryInMs: REHYDRATE_RETRY_MS } : {}),
                }
            );
        });
    }

    /**
     * Queue a re-hydrate on the apply chain. Peers' changes may have been
     * missed while the listener was down, so a failed one (a connection that
     * cannot be opened included) is tried again REHYDRATE_RETRY_MS later, one
     * retry pending at a time, until one succeeds or the store shuts down. A
     * re-hydrate that succeeds (a later reconnect's) cancels a retry still
     * pending. One already on the chain when shutdown() begins still runs:
     * drain() finishes the refreshes queued so far.
     */
    private queueRehydrate(): void {
        if (this.stopped) return;
        this.onApplyChain('rehydrate', async () => {
            try {
                await this.rehydrateAll();
            } catch (err) {
                if (!this.rehydrateRetry) {
                    this.rehydrateRetry = setTimeout(() => {
                        this.rehydrateRetry = null;
                        this.queueRehydrate();
                    }, REHYDRATE_RETRY_MS);
                    this.rehydrateRetry.unref?.();
                }
                throw err;
            }
            if (this.rehydrateRetry) {
                clearTimeout(this.rehydrateRetry);
                this.rehydrateRetry = null;
            }
        });
    }

    /**
     * A connection checked out for a refresh goes back with the error the
     * refresh failed with, if it failed, so that the pool destroys it rather
     * than hand a dead connection to the next checkout (db/pooledClient.ts).
     */
    private async withClient<T>(fn: (client: PgClient) => Promise<T>): Promise<T> {
        return withPooledClient(this.pool!, fn);
    }

    private markDirty(mapName: string, key: string, kv: unknown[] | undefined): void {
        if (!kv) return;
        let keys = this.dirtyKeys.get(mapName);
        if (!keys) {
            keys = new Map();
            this.dirtyKeys.set(mapName, keys);
        }
        keys.set(key, kv);
    }

    /** The last queued local write to these keys has run: re-read the ones a refresh skipped. */
    private rereadLandedKeys(mapName: string, keys: string[]): void {
        const dirty = this.dirtyKeys.get(mapName);
        const plan = this.plans.get(mapName);
        if (!dirty || !plan) return;
        const kvs: unknown[][] = [];
        for (const k of keys) {
            const kv = dirty.get(k);
            if (kv && dirty.delete(k)) kvs.push(kv);
        }
        if (dirty.size === 0) this.dirtyKeys.delete(mapName);
        if (kvs.length > 0) {
            this.onApplyChain('reread', () => this.refreshKeys(plan, kvs), mapName);
        }
    }

    /**
     * Put Postgres's current row for each key into the mirror, or remove the
     * key when Postgres has no row. Three kinds of key are left alone:
     * - a key this process still has a queued write for: Postgres does not hold
     *   that write yet, so its row is older than the mirror. The key is marked
     *   and re-read when the write lands (rereadLandedKeys).
     * - a key that had a queued write when the SELECT was sent, and has none
     *   now: the write may have committed after the SELECT's snapshot, so the
     *   row read may predate it. The key is read again.
     * - a key the mirror changed while the SELECT was in flight: the row read
     *   may predate that change, so the key is read again.
     */
    private async refreshKeys(plan: TablePlan, kvs: unknown[][]): Promise<void> {
        const mapName = plan.descriptor.mapName;
        const wanted = new Map<string, unknown[]>();
        for (const kv of kvs) wanted.set(keyOfTuple(plan, kv), kv);
        const instance = this.mapByName(mapName);
        const seen = new Map<string, unknown>();
        const fencedAtStart = new Set<string>();
        for (const k of wanted.keys()) {
            seen.set(k, instance.get(k));
            if (this.queue?.isFenced(mapName, k)) fencedAtStart.add(k);
        }
        const rows = await this.withClient((c) => selectByKeys(c, plan, [...wanted.values()]));
        const found = new Map<string, Record<string, unknown>>();
        for (const row of rows) {
            const record = rowToRecord(plan, row);
            found.set(plan.descriptor.keyOf(record), record);
        }
        const map = this.mapByName(mapName);
        const again: unknown[][] = [];
        for (const [k, kv] of wanted) {
            if (this.queue?.isFenced(mapName, k)) {
                this.markDirty(mapName, k, kv);
                continue;
            }
            if (fencedAtStart.has(k) || map !== instance || map.get(k) !== seen.get(k)) {
                again.push(kv);
                continue;
            }
            const record = found.get(k);
            if (record) map.set(k, record);
            else map.delete(k);
        }
        if (again.length > 0) {
            this.onApplyChain('reread', () => this.refreshKeys(plan, again), mapName);
        }
    }

    /**
     * Replace a map with Postgres's rows, except for the keys whose local value
     * Postgres may not hold yet: a key with a queued write keeps the mirror's
     * value (or absence) and is re-read when the write lands; a key that had a
     * queued write when the SELECT was sent (the write may have committed after
     * its snapshot), or that the mirror changed while the SELECT was in flight,
     * keeps the mirror's value and is read again.
     */
    private async reloadTable(plan: TablePlan, client?: PgClient): Promise<void> {
        const mapName = plan.descriptor.mapName;
        const instance = this.mapByName(mapName);
        const before = new Map(instance);
        const fencedAtStart = new Set(this.queue?.fencedKeys(mapName) ?? []);
        const select = (c: PgClient) =>
            c.query<Record<string, unknown>>(`SELECT * FROM ${plan.descriptor.tableName}`);
        const res = client ? await select(client) : await this.withClient(select);
        if (this.mapByName(mapName) !== instance) {
            // The mutator replaced the whole map meanwhile: start over.
            this.onApplyChain('reload', () => this.reloadTable(plan), mapName);
            return;
        }
        const fresh: MutableMap = new Map();
        for (const row of res.rows) {
            const record = rowToRecord(plan, row);
            fresh.set(plan.descriptor.keyOf(record), record);
        }
        const again: unknown[][] = [];
        const keys = new Set([
            ...before.keys(),
            ...instance.keys(),
            ...fencedAtStart,
            ...(this.queue?.fencedKeys(mapName) ?? []),
        ]);
        for (const k of keys) {
            const fenced = this.queue?.isFenced(mapName, k) ?? false;
            const mine = instance.get(k);
            if (!fenced && !fencedAtStart.has(k) && mine === before.get(k)) continue;
            const known = mine ?? before.get(k) ?? fresh.get(k);
            const kv = known ? kvOf(plan, known) : undefined;
            if (mine) fresh.set(k, mine);
            else fresh.delete(k);
            if (fenced) this.markDirty(mapName, k, kv);
            else if (kv) again.push(kv);
        }
        if (Object.getPrototypeOf(instance) === Map.prototype) {
            (this as unknown as Record<string, MutableMap>)[mapName] = fresh;
        } else {
            // A map of its own kind (a Map subclass that keeps an index over
            // its rows) is updated in place, through its own delete and set,
            // so it keeps its kind and its index stays current.
            for (const k of [...instance.keys()]) if (!fresh.has(k)) instance.delete(k);
            for (const [k, v] of fresh) if (instance.get(k) !== v) instance.set(k, v);
        }
        if (again.length > 0) {
            this.onApplyChain('reread', () => this.refreshKeys(plan, again), mapName);
        }
    }

    /** Re-load every table from Postgres into the mirror (used on listener reconnect). */
    private async rehydrateAll(): Promise<void> {
        if (!this.pool) return;
        await this.withClient(async (client) => {
            for (const plan of this.plans.values()) await this.reloadTable(plan, client);
        });
    }

    /**
     * Apply a peer replica's change to the local mirror, on the FIFO apply
     * chain. 'u' and 'k' re-read the keys they name (a key whose row is gone
     * is removed). 'r' reloads the whole table: no process sends it any more,
     * but one still running the previous release does after a whole-table
     * write, so it is received for one more release and then dropped.
     * Self-notifications are ignored (the originating mutator already updated
     * this mirror synchronously).
     */
    private applyPeerChange(payload: StoreChangePayload): void {
        if (payload.src === this.instanceId) return;
        const plan = this.plans.get(payload.m);
        if (!plan || !this.pool) return;
        const arity = plan.descriptor.conflictColumns.length;
        const isKv = (kv: unknown): kv is unknown[] => Array.isArray(kv) && kv.length === arity;
        if (payload.op === 'u' && isKv(payload.kv)) {
            const kv = payload.kv;
            this.onApplyChain('u', () => this.refreshKeys(plan, [kv]), payload.m);
        } else if (payload.op === 'k' && Array.isArray(payload.kvs) && payload.kvs.every(isKv)) {
            const kvs = payload.kvs;
            if (kvs.length > 0)
                this.onApplyChain('k', () => this.refreshKeys(plan, kvs), payload.m);
        } else if (payload.op === 'r') {
            this.onApplyChain('r', () => this.reloadTable(plan), payload.m);
        } else {
            log.warn('pg_store_peer_payload_ignored', { map: payload.m, op: payload.op });
        }
    }

    /**
     * The copy and the notice row as Postgres has them, once this process's
     * own queued writes have been attempted. An account deletion blanks every
     * copy sealed to the account before it ends the notices and deletes the
     * user row, so a deletion another process (the API process, with the
     * loops in a worker) committed is seen here even when its change
     * notification has not reached this one: a notice row that process never
     * saw, which its deletion could not end, is then not sent (round 6 of
     * part 2's review). Waiting for this process's own writes first means a
     * copy it wrote and has not yet flushed (one armed and fired in this
     * process within the queue's lag) is not read as gone, which would end
     * that person's notice.
     *
     * The notice row as Postgres has it also goes into this mirror, when this
     * process wrote nothing to the row while it was read (the row is the same
     * object before the drain and after the query). Every write this process
     * had made to it was queued before the drain and has been attempted, so
     * the stored row is at least as new as the mirror's unless one of those
     * writes failed twice and was dropped (`db_write_behind_failed`): then
     * the stored row is older than the mirror's, and the older one replaces
     * it, except that while it is pending a room or a re-invite the mirror
     * has and Postgres lacks is kept, so a room this process made is not
     * made again, nor the person invited a second time for one notice, and
     * the next full-row write of the row carries them into Postgres (round 8
     * of part 2's review: the refresh put back a row without them). So a
     * leader taking over, whose catch-up wrote a pending row into its mirror
     * while Postgres kept the row the old leader had already sent (the
     * create is insert-only there), reads it sent and sends nothing; one
     * whose mirror lacks the room the old leader recorded on the row uses
     * that room rather than make another (round 7: it sent the notice again,
     * and with the alias refused made a second room); and one whose catch-up
     * row is due while Postgres has the old leader's retry set for later
     * leaves it for that time (round 8). Postgres with no row leaves the
     * mirror's alone. With `personsRoom`, the recipient's newest row with a
     * room is read from Postgres too (one indexed query, the person's rows),
     * and nothing of it is put in the mirror.
     */
    override async readDeadmanReleaseCommitted(
        switchId: string,
        recipientAccountId: string,
        options: { personsRoom?: boolean } = {}
    ): Promise<{
        wrap?: DeadmanReleaseWrapRecord;
        notice?: DeadmanReleaseNoticeRecord;
        room?: { roomId: string; updatedAt: string };
    }> {
        const wraps = this.plans.get('deadmanReleaseWraps');
        const notices = this.plans.get('deadmanReleaseNotices');
        if (!this.pool || !wraps || !notices) {
            return super.readDeadmanReleaseCommitted(switchId, recipientAccountId, options);
        }
        const seen = this.getDeadmanReleaseNotice(switchId, recipientAccountId);
        await this.drainWrites();
        const client = await this.pool.connect();
        let wrapRow: Record<string, unknown> | undefined;
        let noticeRow: Record<string, unknown> | undefined;
        let roomRow: Record<string, unknown> | undefined;
        try {
            const where = 'WHERE switch_id = $1 AND recipient_account_id = $2';
            wrapRow = (
                await client.query<Record<string, unknown>>(
                    `SELECT * FROM ${wraps.descriptor.tableName} ${where}`,
                    [switchId, recipientAccountId]
                )
            ).rows[0];
            noticeRow = (
                await client.query<Record<string, unknown>>(
                    `SELECT * FROM ${notices.descriptor.tableName} ${where}`,
                    [switchId, recipientAccountId]
                )
            ).rows[0];
            if (options.personsRoom) {
                roomRow = (
                    await client.query<Record<string, unknown>>(
                        `SELECT * FROM ${notices.descriptor.tableName} ` +
                            'WHERE recipient_account_id = $1 AND room_id IS NOT NULL ' +
                            'ORDER BY updated_at DESC LIMIT 1',
                        [recipientAccountId]
                    )
                ).rows[0];
            }
        } finally {
            client.release?.();
        }
        const stored = noticeRow
            ? (rowToRecord(notices, noticeRow) as unknown as DeadmanReleaseNoticeRecord)
            : undefined;
        if (stored && this.getDeadmanReleaseNotice(switchId, recipientAccountId) === seen) {
            // A room or a re-invite of this process's that Postgres lacks on
            // a row still pending there: a write of it was dropped.
            const kept =
                seen && stored.status === 'pending'
                    ? {
                          ...(seen.roomId && !stored.roomId ? { roomId: seen.roomId } : {}),
                          ...(seen.reinvitedAt && !stored.reinvitedAt
                              ? { reinvitedAt: seen.reinvitedAt }
                              : {}),
                      }
                    : {};
            this.mapByName('deadmanReleaseNotices').set(
                notices.descriptor.keyOf(stored as unknown as Record<string, unknown>),
                { ...stored, ...kept }
            );
        }
        const room = roomRow
            ? (rowToRecord(notices, roomRow) as Record<string, unknown>)
            : undefined;
        return {
            wrap: wrapRow
                ? (rowToRecord(wraps, wrapRow) as unknown as DeadmanReleaseWrapRecord)
                : undefined,
            notice: stored,
            ...(options.personsRoom
                ? {
                      room:
                          room && typeof room.roomId === 'string'
                              ? { roomId: room.roomId, updatedAt: String(room.updatedAt) }
                              : undefined,
                  }
                : {}),
        };
    }

    /**
     * Once this process's queued writes, the deletion's among them, have been
     * attempted (a write that fails twice is dropped and logged, as
     * everywhere in Postgres mode, and the drain still ends): one statement
     * that ends every notice row still pending to the account and forgets the
     * room of every one of theirs, as the deletion does for the rows in this
     * mirror, and so also for a row another process wrote that this one had
     * not heard of (the worker's sweep moments before). The rows it changed go
     * into this mirror and are announced to the other processes. A
     * notifier's later write to such a row is conditional on it still pending
     * (`updateDeadmanReleaseNoticeIf`), so it does not land after this; one
     * that landed first (`sent`, the send having begun before the copies were
     * blanked) keeps its status and has its room forgotten here (round 6 of
     * part 2's review).
     */
    override async endDeadmanReleaseNoticesOfDeletedAccount(
        accountId: string,
        at: string
    ): Promise<number> {
        const plan = this.plans.get('deadmanReleaseNotices');
        if (!this.pool || !plan) return 0;
        await this.drainWrites();
        const table = plan.descriptor.tableName;
        const client = await this.pool.connect();
        let rows: Record<string, unknown>[];
        try {
            const res = await client.query<Record<string, unknown>>(
                `UPDATE ${table} SET room_id = NULL, ` +
                    `failed_at = CASE WHEN status = 'pending' THEN $2::timestamptz ELSE failed_at END, ` +
                    `last_error = CASE WHEN status = 'pending' THEN 'recipient_gone' ELSE last_error END, ` +
                    `status = CASE WHEN status = 'pending' THEN 'failed' ELSE status END, ` +
                    `updated_at = $2::timestamptz ` +
                    `WHERE recipient_account_id = $1 AND (room_id IS NOT NULL OR status = 'pending') ` +
                    `RETURNING *`,
                [accountId, at]
            );
            rows = res.rows;
        } finally {
            client.release?.();
        }
        const map = this.mapByName('deadmanReleaseNotices');
        for (const row of rows) {
            const record = rowToRecord(plan, row);
            map.set(plan.descriptor.keyOf(record), record);
            this.transport?.publish({
                src: this.instanceId,
                m: 'deadmanReleaseNotices',
                op: 'u',
                kv: plan.descriptor.conflictColumns.map((c) => String(row[c])),
            });
        }
        return rows.length;
    }

    /**
     * The sweep's move of a switch, conditional in Postgres
     * (`writeDeadmanSwitchIf`): the updated record once Postgres has applied
     * it, otherwise `undefined`, and the sweep writes nothing else for the
     * switch (no notice rows, no event). A move another process's write beat
     * (a leader that fired the switch before this standby's mirror heard of
     * it, a check-in or a cancel on the API process), one whose statement
     * failed or did not answer in time, and one this process's own write
     * moved elsewhere while it ran (the owner's deletion cancelling it) all
     * return `undefined`, and so does a trigger Postgres refuses because the
     * owner made a refused attempt after the last check-in that this mirror
     * had not heard of (decision 31, round 15): the row is then taken into
     * the mirror, so the next pass gives the backlog window.
     */
    override async advanceDeadmanSwitch(
        id: string,
        read: Pick<DeadmanSwitchRecord, 'status' | 'lastCheckInAt'>,
        patch: Partial<
            Pick<
                DeadmanSwitchRecord,
                | 'status'
                | 'releasedAt'
                | 'releaseAt'
                | 'backlogGraceStartedAt'
                | 'ownerAttemptRefusedAt'
            >
        >
    ): Promise<DeadmanSwitchRecord | undefined> {
        if (!this.pool || !this.plans.has('deadmanSwitches') || !this.queue) {
            return super.advanceDeadmanSwitch(id, read, patch);
        }
        const outcome = await this.writeDeadmanSwitchIf(id, read, patch);
        return outcome.kind === 'applied' && !outcome.statusMovedHere ? outcome.record : undefined;
    }

    /**
     * The owner's check-in or cancel, conditional in Postgres
     * (`writeDeadmanSwitchIf`). One refused `unanswered` is noted for the
     * sweep in this process (`ownerWriteUnansweredAt`): the owner was alive
     * and tried, so the switch is not fired at its deadline on that account
     * alone; and the note is carried into the switch's own row, tried at
     * once and then every `carryRetryMs` on a connection of its own, until
     * Postgres answers it (`carryRefusedOwnerWrites`, decision 31), so the
     * sweep in any other process reads it too. One that applied clears the
     * note.
     */
    override async updateDeadmanSwitchIf(
        id: string,
        read: Pick<DeadmanSwitchRecord, 'status' | 'lastCheckInAt'>,
        patch: Partial<Omit<DeadmanSwitchRecord, 'id' | 'createdAt' | 'ownerId' | 'releasedAt'>>
    ): Promise<DeadmanSwitchWriteOutcome> {
        if (!this.pool || !this.plans.has('deadmanSwitches') || !this.queue) {
            return super.updateDeadmanSwitchIf(id, read, patch);
        }
        // The attempt's moment, before the wait: what is carried into the row.
        const attemptedAt = nowIso();
        const outcome = await this.writeDeadmanSwitchIf(id, read, patch);
        if (outcome.kind === 'unanswered') {
            this.unansweredOwnerWrites.set(id, {
                at: attemptedAt,
                lastCheckInAt: read.lastCheckInAt,
            });
            this.carryRefusedOwnerWrites();
            return outcome;
        }
        if (outcome.kind !== 'applied') return outcome;
        return { kind: 'applied', record: outcome.record };
    }

    /**
     * How long a conditional write of a switch waits for Postgres, its turn
     * in the write-behind queue and the statement together, as the notifier
     * bounds its reads (round 10 of part 2's review: the sweep waited behind
     * a stalled queue with no limit, and its running guard then held every
     * later pass). A field, so a test can shorten it.
     */
    switchStatementTimeoutMs = 30_000;

    /**
     * The switches with a conditional write in flight here, each with one
     * note per write in flight of the fields this process's own writes to
     * the switch changed while it ran (`noteOwnSwitchWrite`). A change
     * notification's refresh of the mirror is not a write of this process's
     * and is not noted (round 10: taken for one, it put an older status over
     * a cancel another process had committed).
     */
    private readonly switchWritesInFlight = new Map<string, Set<Map<string, unknown>>>();

    /**
     * The conditional statements of switches that did not answer in time and
     * have not settled since, and (round 20) those that failed with their
     * outcome unknown, within their bound or after it, whose switch has not
     * yet been read back (`stalledSwitchStatement`: the stall); not one the
     * database refused, which did not apply and is an answer
     * (`sqlstateOfStatementRefusal`, round 21). While one is here no other
     * conditional write of a
     * switch is sent (each is `unanswered` at once), on any switch: one
     * statement the database did not answer says the database is not
     * answering, and a stalled database then costs a pass one bound, not one
     * per switch, and the owner's routes answer 503 at once; and one that
     * failed is an unknown outcome until the switch has been read. It is
     * process-wide on purpose, whoever's request sent the statement, and
     * since round 11 a statement waits only for
     * this process's earlier writes to the same switch, so a backlog of
     * writes to other tables no longer sets it. It stands until each such
     * statement answers or fails and, unless it wrote nothing (never run, or
     * refused), until the
     * switch's read back has been taken (`settleSwitchStatement`); for the
     * sweep it is a stall (`switchStalls`) from the moment a statement passes
     * its bound, or a failed one's read back fails or passes what was left of
     * that bound, and not while a failed statement's read back answers
     * within it. Nothing here
     * bounds it: the shared pool sets no connection or statement timeout and no
     * TCP keepalive, so a statement whose bytes the database's host
     * acknowledged before it went silent is never given up on here (the
     * operating system runs no timer on a connection waiting for an answer)
     * and stands until the process restarts where that host is gone or the
     * silence outlasts the host's own retransmission of its answer (about 15
     * minutes at Linux's defaults; a fault that heals sooner lets the answer
     * through), and until the database answers or the process restarts
     * where the database process stops answering on a host that stays up (a
     * hung server or storage, a paused container: the connection is healthy
     * at TCP level, so neither retransmission nor keepalive ends it), and
     * one sent into the silence fails, while it lasts, once
     * the operating system gives up: about 15 minutes at Linux's defaults on
     * a connection already open, about 2 minutes where the call opens a new
     * one, which fails at connect (no `connectionTimeoutMillis`); what the
     * process does with that connection's error is a matter of the shared
     * pool's error handling, which a separate change addresses. The read
     * back in the switch's lane has the same lack of bound while it is out,
     * and until it ends this mirror holds the switch as before the
     * statement, but for a carried column, which is read back on its own
     * (`confirmCarriedColumns`, round 18 of part 2's review); one that fails
     * is read again on a connection of its own until one answers
     * (`retrySettleReads`, round 19), and the stall stands until then. The
     * carry of a refused owner write is not held back by it
     * (round 16), and holds a switch that falls due meanwhile back for one
     * backlog window only (round 17: the documents put a bound of minutes on
     * the stall; round 18: they named a network fault as standing until
     * restart without the condition; round 19: they left out a database
     * that stops answering on a live host).
     *
     * Every such statement is kept here until it has settled, and the stall
     * stands while any is (round 19 of part 2's review: one slot held the
     * statement that passed its bound last, so with two out, two owners'
     * check-ins sent within one bound of each other, the stall ended when
     * that one settled, with the other still unanswered or its landed row
     * not yet read back into this mirror; statements were sent again and an
     * arm read the bounds without that row).
     */
    private readonly stalledSwitchStatements = new Set<Promise<unknown>>();

    /** A statement that passed its bound, or failed, and has not settled, while any stands: the stall. */
    private get stalledSwitchStatement(): Promise<unknown> | null {
        return this.stalledSwitchStatements.values().next().value ?? null;
    }

    /**
     * The spans of time `stalledSwitchStatement` has stood, newest last
     * (`endedAt` null while one stands; the newest 64 are kept): what
     * `switchStatementsStalledBetween` answers from, so the sweep can treat a
     * stall as the outage of its own that it is for the switches it kept
     * from moving (round 11 of part 2's review).
     */
    private readonly switchStalls: Array<{ startedAt: number; endedAt: number | null }> = [];

    /**
     * The owner writes refused `unanswered` here, by switch
     * (`ownerWriteUnansweredAt`), each with whether its carry into Postgres
     * is on its way (`carryRefusedOwnerWrites`).
     */
    private readonly unansweredOwnerWrites = new Map<
        string,
        { at: string; lastCheckInAt: string; carrying?: boolean }
    >();

    /**
     * How long after a try of the carry that failed, or passed its bound, it
     * is tried again on its own (`scheduleCarryRetry`), whatever else the
     * process asks the database meanwhile (round 15 of part 2's review: a
     * failed carry was tried again only when another switch statement of the
     * process answered, and in `deploy/docker/production` nothing else on the
     * API process asks the database by itself, so after an outage that
     * refused connections the worker fired the switch at its deadline). A
     * field, so a test can shorten it.
     */
    carryRetryMs = 10_000;

    /**
     * How long one try of the carry may take: the pool's connection, and
     * then each statement on it, each within this bound (round 16 of part
     * 2's review: the carry had no bound of its own, and the shared pool
     * sets no connection or statement timeout, so a carry sent on a
     * connection the database never answered, a socket a failover left
     * black-holed, held its note as on its way for as long as that
     * connection stood, which for a statement the database's host had
     * acknowledged is until the process restarts where that host is gone or
     * the silence outlasts its own retransmission, or until the database
     * answers where its process stops answering on a host that stays up,
     * and nothing tried it again). The read back of a carried column (`confirmCarriedColumns`)
     * and the read again of a settle whose read back failed
     * (`retrySettleReads`) have the same bound. A field, so a test can
     * shorten it.
     */
    carryTimeoutMs = 5_000;

    /** The timer of the next carry retry, while a note is waiting for one. */
    private carryRetryTimer: ReturnType<typeof setTimeout> | null = null;

    /** The try of the carry under way (`runCarryPass`), if one is. */
    private carryPass: Promise<void> | null = null;

    /** Asked to carry while a try was under way: try again when it ends well. */
    private carryAgain = false;

    /**
     * The switches a settle is reading back (`settleSwitchStatement`), or
     * waiting to read back again after a read that failed
     * (`retrySettleReads`), each with the notes whose carry landed
     * meanwhile: each settle that takes its row takes their column after it,
     * at once (`takeSettledRow`); until one does they are left to
     * `confirmCarriedColumns` (round 17 of part 2's review; round 18: they
     * were taken whatever the settle did, so after a failed read back the
     * column went onto the earlier row this mirror still held, which
     * Postgres had cancelled without one; round 19: they were taken only
     * after the last settle of the switch, and only where that one took its
     * row, so with two settles overlapping, the first taking a row read
     * before the carry landed and the second keeping its row out, a column
     * already read back was dropped from this mirror for good).
     */
    private readonly carriesBehindSettle = new Map<
        string,
        { reading: number; notes: Array<{ at: string; lastCheckInAt: string }> }
    >();

    /**
     * Landed carries whose column waits to be read back from Postgres before
     * this mirror takes it (`confirmCarriedColumns`), by switch: each whose
     * answer came while a settle of the switch was reading it back (round 18
     * of part 2's review: the column was then kept out of this mirror until
     * that read ended, which nothing bounds, so for as long as it stood this
     * process's export lacked a refused attempt Postgres held).
     */
    private readonly carriedColumnsToConfirm = new Map<
        string,
        Array<{ at: string; lastCheckInAt: string }>
    >();

    /** The read of carried columns under way (`runColumnConfirmPass`), if one is. */
    private columnConfirmPass: Promise<void> | null = null;

    /** Asked to read carried columns while a read was under way: read again when it ends well. */
    private columnConfirmAgain = false;

    /** The timer of the next read of carried columns, after one that failed. */
    private columnConfirmTimer: ReturnType<typeof setTimeout> | null = null;

    /**
     * Settles whose read back of the switch failed, in the order they
     * failed, each waiting to be read again on a connection of its own
     * (`retrySettleReads`); the stall the statement opened stands until it
     * is (round 19 of part 2's review: a failed read back took nothing,
     * announced nothing and blanked nothing, so a cancel that landed after
     * its bound left this process, its export and the worker holding the
     * switch armed, and every sealed copy held in Postgres, until the owner
     * cancelled again, a process restarted or the switch's deadline passed).
     */
    private readonly settleReadsToRetry: PendingSettle[] = [];

    /** The read again of failed settles under way (`runSettleRetryPass`), if one is. */
    private settleRetryPass: Promise<void> | null = null;

    /**
     * The read backs in a switch's lane not yet answered
     * (`settleSwitchStatement`), so `drainWrites` waits for one queued while
     * it waited (round 20 of part 2's review: a shutdown begun while a
     * cancel stood unanswered returned as soon as the cancel landed, with
     * its read back still out, since that read is queued only then).
     */
    private readonly settleLaneReads = new Set<Promise<unknown>>();

    /** The timer of the next read again of failed settles, after one that failed. */
    private settleRetryTimer: ReturnType<typeof setTimeout> | null = null;

    /**
     * Each mirror entry `takeCarriedColumn` made, mapped to the entry it
     * replaced: a settle reading the switch back treats a change that is
     * only a carried column as no change (`unchangedButCarriedColumn`), so a
     * column taken while its read is out does not keep its row out.
     */
    private readonly carriedColumnOver = new WeakMap<object, Record<string, unknown>>();

    /** Set by `shutdown`: no retry timer is set from then on. */
    private carryStopped = false;

    override switchStatementsStalledBetween(fromMs: number, toMs: number): boolean {
        return this.switchStalls.some(
            (stall) => stall.startedAt <= toMs && (stall.endedAt ?? Infinity) >= fromMs
        );
    }

    override ownerWriteUnansweredAt(
        switchId: string
    ): { at: string; lastCheckInAt: string } | undefined {
        return this.unansweredOwnerWrites.get(switchId);
    }

    override clearOwnerWriteUnanswered(switchId: string): void {
        this.endOwnerWriteNote(switchId);
    }

    /**
     * A note of a refused owner write ends (its carry landed or was refused,
     * a write of the switch applied, the sweep acted on it, the deletion took
     * the switch): where no note is left waiting for a retry, the retry timer
     * goes too (round 16 of part 2's review: it went only when a carry
     * answered, so a note ended any other way left a timer that fired once
     * for nothing).
     */
    private endOwnerWriteNote(switchId: string): void {
        if (!this.unansweredOwnerWrites.delete(switchId)) return;
        this.endCarryRetryIfNoneWaits();
    }

    /**
     * Carry each check-in or cancel refused `unanswered` here into Postgres
     * (decision 31, the operator's choice of 2026-11-02): one conditional
     * statement per noted switch that sets `owner_attempt_refused_at` to the
     * attempt's moment only where the switch has not fired or been
     * cancelled, its last check-in is still the one the refused attempt read
     * (a check-in that landed since is the owner's later word), and the
     * column is null, older or the same moment (a try whose answer was lost
     * after it landed is written again, idempotently, so this mirror still
     * takes it); so the sweep in any process, the worker's in the deployed
     * layout, gives the switch the backlog window as this process's own
     * sweep does from the note (`ownerAttemptRefusedSinceCheckIn`).
     *
     * Each try takes one connection of its own from the pool, outside the
     * write-behind queue, and sends every waiting note's statement on it in
     * turn, each step within `carryTimeoutMs` (`runCarryPass`); it is made
     * when a note is made, when a switch statement of this process answers,
     * when a stall settles, and on its own timer `carryRetryMs` after a try
     * that failed or passed its bound. It is not held back by a switch
     * statement of this process's that stands unanswered, nor by a try that
     * does not answer (round 16 of part 2's review: a carry was sent only
     * while no switch statement stood unanswered here, in the switch's lane
     * behind them, and only a carry that failed armed the timer, so while
     * this process's own stalled statement waited, which the shared pool
     * bounds by nothing (`stalledSwitchStatement`), or while a carry hung on
     * a black-holed connection, no carry was sent at all, with the database
     * answering every other connection, and the worker fired the switch at
     * its deadline). Each try needs a connection the pool hands over within
     * the bound, so while every connection of the pool is held by
     * statements the database never answered, no try lands. Outside the queue it is
     * ordered after nothing this process queued; its condition is what
     * keeps it right in any order: a check-in or a move of the switch that
     * lands after it clears or outranks the column as it would have
     * anyway, and one that landed before it refuses it.
     *
     * A carry that lands ends the note (the row, with the column, is in the
     * mirror and announced); one Postgres refuses ends it too (the switch
     * moved on, or a check-in landed); one that fails or passes its bound
     * keeps the note for the next try. Until it lands this process's sweep
     * acts on the note as before, and a sweep elsewhere does not see it; a
     * note is lost with the process if it stops before the carry lands.
     */
    private carryRefusedOwnerWrites(): void {
        const plan = this.plans.get('deadmanSwitches');
        const pool = this.pool;
        if (!plan || !pool || !this.queue) return;
        if (this.carryPass) {
            this.carryAgain = true;
            return;
        }
        if (![...this.unansweredOwnerWrites.values()].some((note) => !note.carrying)) return;
        this.carryAgain = false;
        const pass: Promise<void> = this.runCarryPass(pool, plan).then((wholePass) => {
            if (this.carryPass === pass) this.carryPass = null;
            if (!wholePass) {
                // The next try is the timer's: one after each failure would
                // ask a database that is not answering once per new note.
                this.carryAgain = false;
                this.scheduleCarryRetry();
                return;
            }
            if (this.carryAgain) {
                this.carryAgain = false;
                this.carryRefusedOwnerWrites();
            }
        });
        this.carryPass = pass;
    }

    /**
     * One try of the carry: a connection taken from the pool for it alone,
     * then each waiting note's statement on it in turn, the connection and
     * each statement within `carryTimeoutMs`. True where every note it took
     * up was answered. Where the connection is refused or not handed over in
     * time, or a statement fails or does not answer in time, the try ends
     * there, logged (`deadman_owner_attempt_carry_failed`), false, with the
     * notes not answered left waiting; the connection is given back with
     * the error, so the pool drops it (node-postgres destroys a connection
     * with a statement still out), and a connection the pool hands over
     * after the bound is given back at once, unused.
     */
    private async runCarryPass(pool: PgPool, plan: TablePlan): Promise<boolean> {
        const table = plan.descriptor.tableName;
        const acquiring = pool.connect();
        let client: PgClient;
        try {
            client = await this.withinCarryBound(acquiring);
        } catch (err) {
            void acquiring.then(
                (late) => late.release?.(),
                () => undefined
            );
            log.warn('deadman_owner_attempt_carry_failed', {
                error: err instanceof Error ? err.message : String(err),
            });
            return false;
        }
        let failure: Error | undefined;
        try {
            for (const [id, note] of [...this.unansweredOwnerWrites]) {
                if (note.carrying || this.unansweredOwnerWrites.get(id) !== note) continue;
                note.carrying = true;
                const seen = this.mapByName('deadmanSwitches').get(id);
                let row: Record<string, unknown> | undefined;
                try {
                    row = await this.withinCarryBound(
                        client
                            .query<Record<string, unknown>>(
                                `UPDATE ${table} SET owner_attempt_refused_at = $2::timestamptz, ` +
                                    'updated_at = $4::timestamptz ' +
                                    "WHERE id = $1 AND status <> 'triggered' AND status <> 'cancelled' " +
                                    'AND last_check_in_at = $3::timestamptz ' +
                                    'AND (owner_attempt_refused_at IS NULL OR owner_attempt_refused_at <= $2::timestamptz) ' +
                                    'RETURNING *',
                                [id, note.at, note.lastCheckInAt, nowIso()]
                            )
                            .then((answer) => answer.rows[0])
                    );
                } catch (err) {
                    note.carrying = false;
                    failure = err instanceof Error ? err : new Error(String(err));
                    log.warn('deadman_owner_attempt_carry_failed', { error: failure.message });
                    return false;
                }
                note.carrying = false;
                this.takeCarryAnswer(plan, id, note, seen, row);
            }
            return true;
        } finally {
            client.release?.(failure);
        }
    }

    /** `work`, or a rejection once `carryTimeoutMs` has passed without its answer. */
    private withinCarryBound<T>(work: Promise<T>): Promise<T> {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const bound = new Promise<never>((_, reject) => {
            timer = setTimeout(
                () => reject(new Error(`no answer within ${this.carryTimeoutMs} ms`)),
                this.carryTimeoutMs
            );
        });
        return Promise.race([work, bound]).finally(() => clearTimeout(timer));
    }

    /**
     * A carry's answer: where the note is still the one carried (a newer
     * refusal, or a write that applied meanwhile, means nothing of this one
     * is this mirror's to take), it ends; a landed carry's row goes into the
     * mirror where the mirror's entry is the one the carry read, no
     * conditional write of the switch is in flight and no settle of the
     * switch is reading it back or waiting to read it again
     * (`settleSwitchStatement`), otherwise the column alone
     * (`takeCarriedColumn`): at once, or, while such a settle is out, once
     * Postgres is read to hold it (`confirmCarriedColumns`, on a connection
     * of its own, whatever that read is doing) and again after the row of
     * each settle that takes one (`takeSettledRow`); and the switch is
     * announced.
     *
     * Round 17 of part 2's review: the carry runs outside the switch's lane,
     * so its row is what Postgres held when it ran, which can be older than
     * a statement that landed after it. Taken while a settle's read was out,
     * it replaced the entry the settle had seen, so the settle left the row
     * it read (newer) out of the mirror: a cancel that landed late after the
     * carry left this process holding the switch armed, its content and
     * copies held here and the copies held in Postgres, though Postgres had
     * it cancelled.
     */
    private takeCarryAnswer(
        plan: TablePlan,
        id: string,
        note: { at: string; lastCheckInAt: string },
        seen: Record<string, unknown> | undefined,
        row: Record<string, unknown> | undefined
    ): void {
        if (this.unansweredOwnerWrites.get(id) !== note) return;
        this.endOwnerWriteNote(id);
        const map = this.mapByName('deadmanSwitches');
        if (!row) {
            log.info('deadman_owner_attempt_not_carried', {});
            // Refused: Postgres does not hold the switch as the refused
            // attempt read it (it fired or was cancelled, a check-in landed,
            // or it holds a later attempt). Where this mirror still shows
            // it unfired, uncancelled and at that check-in, the mirror may
            // be behind: the switch is read back. A later attempt in this
            // mirror, which another process carried, is no reason to skip
            // that read: the statement the attempt was refused for is not
            // conditional on that column, so the database can have applied
            // it since, and the carry was then refused over the row it
            // changed (round 22 of part 2's review: the read was skipped,
            // and a cancel applied after another process's carry landed
            // left this process holding the switch armed).
            if (stillAsAttemptRead(map.get(id), note)) this.readBackAfterRefusedCarry(id);
            return;
        }
        const current = map.get(id);
        const behindSettle = this.carriesBehindSettle.get(id);
        if (behindSettle) {
            behindSettle.notes.push(note);
            const waiting = this.carriedColumnsToConfirm.get(id);
            if (waiting) waiting.push(note);
            else this.carriedColumnsToConfirm.set(id, [note]);
            this.confirmCarriedColumns();
        } else if (current === seen && !this.switchWritesInFlight.has(id)) {
            map.set(id, rowToRecord(plan, row));
        } else {
            this.takeCarriedColumn(id, note);
        }
        this.transport?.publish({
            src: this.instanceId,
            m: 'deadmanSwitches',
            op: 'u',
            kv: [id],
        });
        log.info('deadman_owner_attempt_carried', {});
    }

    /**
     * A landed carry's column, into a mirror entry that is not the one the
     * carry read: only where the switch there has not fired or been
     * cancelled (a trigger or a cancel that the mirror has can only have
     * landed after the carry, since the carry is refused over either, and
     * clears the column in Postgres: round 17 of part 2's review, the column
     * went onto a cancelled row, so this process's export listed a refused
     * attempt Postgres no longer held), its last check-in is still the
     * refused attempt's (a later check-in clears it) and it holds no later
     * attempt.
     */
    private takeCarriedColumn(id: string, note: { at: string; lastCheckInAt: string }): void {
        const map = this.mapByName('deadmanSwitches');
        const current = map.get(id);
        if (!current || !carryWouldApplyTo(current, note)) return;
        const next = { ...current, ownerAttemptRefusedAt: note.at };
        this.carriedColumnOver.set(next, current);
        map.set(id, next);
    }

    /**
     * A carry Postgres refused although this mirror still shows the switch
     * unfired, uncancelled and at the check-in the refused attempt read
     * (`stillAsAttemptRead`): the mirror may be behind Postgres, so the
     * switch is read back in its lane and taken as after a failed statement
     * (`settleSwitchStatement`: the row into the mirror where the mirror has
     * not changed meanwhile, announced, a cancelled switch's held copies
     * blanked, and read again on a connection of its own where the read
     * fails). No switch statement is held back for it: the mirror already
     * has the switch, so no arm reads the bounds without it. Where the
     * mirror holds a later attempt that another process carried, the read
     * is made all the same and usually finds the row as the mirror has it
     * (the carry was refused over that later attempt); it costs one read
     * and one announcement, and finds a statement of this process's that
     * the database applied after that other carry landed (round 22: the
     * read was skipped there).
     *
     * Round 21 of part 2's review: a failed statement's read back can run
     * before the database applies the statement (the client was lost while
     * the database was still running it), and nothing looked again, so a
     * cancel applied right after that read left this process, its list and
     * its export holding the switch armed with its content, and every
     * sealed copy held in Postgres, until the owner cancelled again, a
     * refresh, a restart or the deadline. The carry of the refused attempt
     * is an `UPDATE` of the same row: one sent while the statement holds
     * the row waits for it, and one sent after it applied is refused by its
     * own conditions, which is what this reads on. What it does not reach:
     * a statement the database begins only after the carry has landed (the
     * carry then finds the row as the attempt read it), and a move of the
     * sweep's, which no carry follows (the next pass's move is refused over
     * it and takes the row).
     */
    private readBackAfterRefusedCarry(id: string): void {
        void this.settleSwitchStatement(id, false, 'refused carry').taken;
    }

    /**
     * Whether the mirror's entry `current` is `seen`, or was made from it by
     * carried columns alone (`takeCarriedColumn`).
     */
    private unchangedButCarriedColumn(
        current: Record<string, unknown> | undefined,
        seen: Record<string, unknown> | undefined
    ): boolean {
        for (let entry = current; entry !== undefined; entry = this.carriedColumnOver.get(entry)) {
            if (entry === seen) return true;
        }
        return current === seen;
    }

    /**
     * Read back from Postgres the column of each landed carry waiting in
     * `carriedColumnsToConfirm`, and take it into the mirror
     * (`takeCarriedColumn`, with its conditions) only where Postgres holds
     * that same refused attempt now (round 18 of part 2's review). A carry's
     * answer that comes while a settle of its switch is reading it back
     * cannot be put on this mirror's entry as it is, since a statement that
     * landed after the carry may have cleared the column (a cancel, a
     * check-in) and that entry does not show it yet; and the settle's read,
     * in the switch's lane behind the statement, is bounded by nothing. This
     * read is one statement per switch on a connection of its own, outside
     * the write-behind queue, within `carryTimeoutMs`, as the carry is, made
     * when such an answer comes and, after a read that failed or passed its
     * bound, again `carryRetryMs` later until one answers; so the column
     * reaches the mirror once Postgres answers a new connection from this
     * process, whatever the settle's read is doing, as long as the pool
     * hands over a connection. Postgres's answer settles each note it was
     * asked about: the column is taken where Postgres holds it, and dropped
     * where it does not (a later statement cleared it, or a later attempt
     * replaced it, which reaches this mirror on its own). The rest of what
     * Postgres holds for the switch, the statement's own change included,
     * reaches the mirror only with the settle's row; a settle that takes its
     * row takes each such column again after it (`takeSettledRow`), since
     * that row may have been read before the carry landed.
     */
    private confirmCarriedColumns(): void {
        const plan = this.plans.get('deadmanSwitches');
        const pool = this.pool;
        if (!plan || !pool) return;
        if (this.columnConfirmPass) {
            this.columnConfirmAgain = true;
            return;
        }
        if (this.carriedColumnsToConfirm.size === 0) return;
        this.columnConfirmAgain = false;
        // This read is the one a retry timer set after a failed read was
        // waiting to make.
        this.clearColumnConfirmTimer();
        const pass: Promise<void> = this.runColumnConfirmPass(pool, plan).then((wholePass) => {
            if (this.columnConfirmPass === pass) this.columnConfirmPass = null;
            if (!wholePass) {
                this.columnConfirmAgain = false;
                this.scheduleColumnConfirmRetry();
                return;
            }
            if (this.columnConfirmAgain) {
                this.columnConfirmAgain = false;
                this.confirmCarriedColumns();
            }
        });
        this.columnConfirmPass = pass;
    }

    /**
     * One read of the waiting carried columns, as `runCarryPass` makes one
     * try of the carry: a connection of its own, each step within
     * `carryTimeoutMs`, false where any step failed or passed its bound,
     * logged (`deadman_owner_attempt_column_read_failed`), with the notes
     * not answered left waiting.
     */
    private async runColumnConfirmPass(pool: PgPool, plan: TablePlan): Promise<boolean> {
        const table = plan.descriptor.tableName;
        const column = plan.columns.find((c) => c.name === 'owner_attempt_refused_at');
        const acquiring = pool.connect();
        let client: PgClient;
        try {
            client = await this.withinCarryBound(acquiring);
        } catch (err) {
            void acquiring.then(
                (late) => late.release?.(),
                () => undefined
            );
            log.warn('deadman_owner_attempt_column_read_failed', {
                error: err instanceof Error ? err.message : String(err),
            });
            return false;
        }
        let failure: Error | undefined;
        try {
            for (const [id, waiting] of [...this.carriedColumnsToConfirm]) {
                const asked = [...waiting];
                let held: unknown;
                try {
                    const rows = await this.withinCarryBound(
                        client
                            .query<Record<string, unknown>>(
                                `SELECT owner_attempt_refused_at FROM ${table} WHERE id = $1`,
                                [id]
                            )
                            .then((answer) => answer.rows)
                    );
                    held = rows[0]
                        ? deserializeValue(
                              rows[0].owner_attempt_refused_at,
                              column?.dataType ?? 'timestamp with time zone'
                          )
                        : null;
                } catch (err) {
                    failure = err instanceof Error ? err : new Error(String(err));
                    log.warn('deadman_owner_attempt_column_read_failed', {
                        error: failure.message,
                    });
                    return false;
                }
                const still = this.carriedColumnsToConfirm.get(id);
                if (still) {
                    const left = still.filter((note) => !asked.includes(note));
                    if (left.length > 0) this.carriedColumnsToConfirm.set(id, left);
                    else this.carriedColumnsToConfirm.delete(id);
                }
                for (const note of asked) {
                    if (!still?.includes(note)) continue;
                    if (held === note.at) this.takeCarriedColumn(id, note);
                    else log.info('deadman_owner_attempt_column_not_held', {});
                }
            }
            return true;
        } finally {
            client.release?.(failure);
        }
    }

    /**
     * Read the waiting carried columns again in `carryRetryMs`, on a timer
     * that does not keep the process alive and is not set after `shutdown`.
     */
    private scheduleColumnConfirmRetry(): void {
        if (this.columnConfirmTimer || this.carryStopped) return;
        if (this.carriedColumnsToConfirm.size === 0) return;
        this.columnConfirmTimer = setTimeout(() => {
            this.columnConfirmTimer = null;
            this.confirmCarriedColumns();
        }, this.carryRetryMs);
        this.columnConfirmTimer.unref?.();
    }

    /** The timer of the next read of carried columns, if one is set, goes. */
    private clearColumnConfirmTimer(): void {
        if (!this.columnConfirmTimer) return;
        clearTimeout(this.columnConfirmTimer);
        this.columnConfirmTimer = null;
    }

    /**
     * Try the carry again in `carryRetryMs` while any note is waiting and no
     * try is under way: on its own timer, so a note is carried once the
     * database answers a new connection from this process even when nothing
     * else on the process asks it anything (round 15 of part 2's review). The
     * timer does not keep the process alive, is not set once no note waits,
     * goes once the last waiting note ends (`endOwnerWriteNote`), and is not
     * set after `shutdown`.
     */
    private scheduleCarryRetry(): void {
        if (this.carryRetryTimer || this.carryStopped) return;
        let waiting = false;
        for (const note of this.unansweredOwnerWrites.values()) {
            if (!note.carrying) waiting = true;
        }
        if (!waiting) return;
        this.carryRetryTimer = setTimeout(() => {
            this.carryRetryTimer = null;
            this.carryRefusedOwnerWrites();
        }, this.carryRetryMs);
        this.carryRetryTimer.unref?.();
    }

    /** No note waits for a retry any more: the timer, if one is set, goes. */
    private endCarryRetryIfNoneWaits(): void {
        if (!this.carryRetryTimer) return;
        for (const note of this.unansweredOwnerWrites.values()) {
            if (!note.carrying) return;
        }
        clearTimeout(this.carryRetryTimer);
        this.carryRetryTimer = null;
    }

    /**
     * Mark a conditional write of the switch in flight
     * (`switchWritesInFlight`): its note of what this process's own plain
     * writes of the switch change meanwhile, and what ends the mark. Ending
     * it twice is safe: a mark another write has made since is not this
     * one's to remove.
     */
    private beginSwitchWrite(id: string): { note: Map<string, unknown>; end: () => void } {
        const note = new Map<string, unknown>();
        const notes = this.switchWritesInFlight.get(id) ?? new Set<Map<string, unknown>>();
        notes.add(note);
        this.switchWritesInFlight.set(id, notes);
        return {
            note,
            end: () => {
                notes.delete(note);
                if (notes.size === 0 && this.switchWritesInFlight.get(id) === notes) {
                    this.switchWritesInFlight.delete(id);
                }
            },
        };
    }

    private noteOwnSwitchWrite(
        id: string,
        prior: Record<string, unknown>,
        next: Record<string, unknown>
    ): void {
        const notes = this.switchWritesInFlight.get(id);
        if (!notes) return;
        for (const key of new Set([...Object.keys(prior), ...Object.keys(next)])) {
            if (key === 'id' || key === 'createdAt' || prior[key] === next[key]) continue;
            for (const note of notes) note.set(key, next[key]);
        }
    }

    /**
     * Wait for a switch statement up to `switchStatementTimeoutMs`. One that
     * answers in time is the caller's to apply. One that does not answer is
     * `timeout`: it is marked abandoned, so it is not run if its turn in the
     * queue has not yet come, the process's switch statements are stalled
     * until it settles, and when it settles having landed,
     * `settleSwitchStatement` takes what it did into the mirror and
     * announces it (round 11 of part 2's review: a cancel answered 503 that
     * landed left the mirror armed, every copy held, and told no process).
     * The stall stands until that re-read has put the row in the mirror, not
     * only until the statement answered (round 12: between the two an arm
     * read the bounds without the landed switch and passed them), and where
     * the re-read fails, until a read again on a connection of its own has
     * (round 19: the stall ended with the failure, and nothing read the
     * switch again).
     *
     * One the database refuses (an error it answers for the statement
     * itself, `sqlstateOfStatementRefusal`) never reaches here as a
     * rejection: the callers' statements turn it into an answer
     * (`answeredOrRefused`), since it did not apply, so nothing is read back
     * and no other owner's statement is held back for it (round 21 of part
     * 2's review: any account could send one, a label holding U+0000, and
     * each held every owner's switch statements back for the length of a
     * read). Answered within the bound, its caller logs it with its
     * SQLSTATE (`deadman_switch_arm_refused`, `deadman_switch_write_refused`);
     * answered after the bound, when the caller has been answered `timeout`
     * and a timeout logged, it is logged here on the same line, with
     * `afterBound`, and the hold ends with nothing to read (round 22: such a
     * refusal was logged as a timeout only, and its SQLSTATE dropped). One
     * that rejects otherwise is an unknown outcome, within its
     * bound or after it: the connection can be lost after the database
     * applied the statement, or while the database is still running it
     * (a failover, a reset, a pooler dropping its client). It is logged
     * (`deadman_switch_write_failed`) and the switch is read back and taken
     * exactly as after a statement that landed late, with no switch
     * statement sent by this process until a read back has been taken
     * (round 20 of part 2's review: a rejected statement was read back by
     * nothing, so a cancel the database had applied left this process, its
     * list and its export holding the switch armed and every sealed copy
     * held in Postgres, and an arm whose insert had committed was in no
     * mirror, counted toward no bound, until the owner's next write of the
     * switch, a restart or the deadline). Within its bound the wait goes on
     * for that read, up to what is left of the bound, and the answer is
     * `failed` with what it found; where it did not answer in that time, or
     * failed, the hold becomes a stall in the sweep's sense too
     * (`switchStalls`), until a read has been taken. A read back that
     * answers at once opens no stall, so a statement that failed without
     * landing is still the next pass's to make (round 10). What the read
     * back cannot see is a statement the database applies only after it:
     * for an arm that is the stated limit of `armDeadmanSwitch`; for an
     * owner's check-in or cancel, the carry of the refused attempt that
     * follows is refused over the applied row and the switch is then read
     * once more (`readBackAfterRefusedCarry`, round 21), which leaves only
     * one the database begins after that carry has landed; for a move, the
     * next pass's statement is refused over it and takes the row.
     *
     * `endInFlight` ends the caller's mark of a conditional write of the
     * switch in flight (`beginSwitchWrite`) before a failed statement is
     * read back: that read must not take the failed statement for a write
     * still in flight, whose answer would bring the row.
     */
    private async awaitSwitchStatement<T>(
        id: string,
        statement: Promise<T>,
        call: { abandoned: boolean },
        withCopies: boolean,
        endInFlight?: () => void
    ): Promise<SwitchStatementWait<T>> {
        const deadline = Date.now() + this.switchStatementTimeoutMs;
        let timer: ReturnType<typeof setTimeout> | undefined;
        let outcome: { answer: T } | { error: unknown } | 'timeout';
        try {
            const answer = await Promise.race([
                statement,
                new Promise<'timeout'>((resolve) => {
                    timer = setTimeout(() => resolve('timeout'), this.switchStatementTimeoutMs);
                }),
            ]);
            outcome = answer === 'timeout' ? 'timeout' : { answer: answer as T };
        } catch (error) {
            outcome = { error };
        } finally {
            clearTimeout(timer);
        }
        if (outcome !== 'timeout' && 'answer' in outcome) {
            // The database answers: a refused attempt noted here whose
            // carry has not landed is tried now (decision 31).
            this.carryRefusedOwnerWrites();
            return { kind: 'answered', answer: outcome.answer };
        }
        if (outcome !== 'timeout') {
            log.error('deadman_switch_write_failed', {
                error:
                    outcome.error instanceof Error ? outcome.error.message : String(outcome.error),
            });
            endInFlight?.();
            return {
                kind: 'failed',
                readBack: await this.readBackAfterFailure(id, withCopies, deadline),
            };
        }
        call.abandoned = true;
        this.openSwitchStall();
        this.holdSwitchStatements(
            statement.then(
                (landed) => {
                    const refused = refusalIn(landed);
                    if (refused !== undefined) {
                        // The database's own refusal, answered after the
                        // bound: the caller was answered at the bound and
                        // logged a timeout, so the refusal and its code are
                        // logged here, on the line the caller logs one
                        // answered in time on (the arm is the one statement
                        // read back with its copies), marked as late.
                        log.error(
                            withCopies
                                ? 'deadman_switch_arm_refused'
                                : 'deadman_switch_write_refused',
                            { sqlstate: refused, afterBound: true }
                        );
                    }
                    return wasNotRun(landed)
                        ? undefined
                        : this.settleSwitchStatement(id, withCopies, 'answer').taken;
                },
                // Rejected after its bound: an unknown outcome, read back too.
                () => this.settleSwitchStatement(id, withCopies, 'failure').taken
            )
        );
        log.error('deadman_switch_write_failed', {
            error: 'timeout',
            timeoutMs: this.switchStatementTimeoutMs,
        });
        return { kind: 'timeout' };
    }

    /**
     * No switch statement is sent by this process until `work` has ended
     * (`stalledSwitchStatement`). When the last such work ends, a stall in
     * the sweep's sense that was standing ends with it, and a refused
     * attempt whose carry has not landed is tried (decision 31): the
     * database answers again.
     */
    private holdSwitchStatements(work: Promise<unknown>): Promise<unknown> {
        const held: Promise<unknown> = work
            .then(
                () => undefined,
                () => undefined
            )
            .finally(() => {
                this.stalledSwitchStatements.delete(held);
                // The stall stands while any statement that passed its bound
                // or failed has not settled, not only the one that did last.
                if (this.stalledSwitchStatements.size > 0) return;
                const stall = this.switchStalls[this.switchStalls.length - 1];
                if (stall && stall.endedAt === null) {
                    stall.endedAt = Date.now();
                    log.info('deadman_switch_write_settled', {});
                }
                this.carryRefusedOwnerWrites();
            });
        this.stalledSwitchStatements.add(held);
        return held;
    }

    /**
     * A statement that rejected within its bound: the switch is read back
     * in its lane and taken (`settleSwitchStatement`), no switch statement
     * being sent meanwhile, and this waits for that read until `deadline`
     * (the statement's own bound). Where the read has not answered by then,
     * or failed, the answer is `'unread'` and the hold is a stall from then
     * on (`openSwitchStall`): a read that failed is made again on a
     * connection of its own until one answers (`retrySettleReads`), and one
     * not yet answered is waited for, with nothing bounding it.
     * Where it answered, the hold has ended by the time this returns (it
     * ends a few turns of the microtask queue after the row was taken), so
     * the caller's next statement, the sweep's move of the next switch in
     * the same pass, is sent and not refused over a hold that is already
     * over.
     */
    private async readBackAfterFailure(
        id: string,
        withCopies: boolean,
        deadline: number
    ): Promise<SwitchReadBack> {
        const settle = this.settleSwitchStatement(id, withCopies, 'failure');
        const held = this.holdSwitchStatements(settle.taken);
        let timer: ReturnType<typeof setTimeout> | undefined;
        const read = await Promise.race([
            settle.read,
            new Promise<'unread'>((resolve) => {
                timer = setTimeout(() => resolve('unread'), Math.max(0, deadline - Date.now()));
            }),
        ]);
        clearTimeout(timer);
        if (read === 'unread') {
            if (this.stalledSwitchStatements.has(held)) this.openSwitchStall();
            return read;
        }
        await held;
        return read;
    }

    /** The stall now standing, or a new one begun now. */
    private openSwitchStall(): { startedAt: number; endedAt: number | null } {
        const last = this.switchStalls[this.switchStalls.length - 1];
        if (last && last.endedAt === null) return last;
        const stall = { startedAt: Date.now(), endedAt: null };
        this.switchStalls.push(stall);
        if (this.switchStalls.length > 64) this.switchStalls.shift();
        return stall;
    }

    /**
     * A statement that answered after its bound and landed, one that
     * rejected with its outcome unknown, within its bound or after it, or a
     * carry Postgres refused over a row this mirror still held as the
     * refused attempt read it (`readBackAfterRefusedCarry`, which holds no
     * statement back): the
     * switch is read again from Postgres, in the row's lane, so after any
     * write of it this process queued meanwhile, and the row taken
     * (`takeSettledRow`); where that read fails, the switch is read again on
     * a connection of its own (`retrySettleReads`), each try within
     * `carryTimeoutMs` and, after one that failed or passed its bound,
     * another `carryRetryMs` later, until one answers, and that row is taken
     * the same way (round 19 of part 2's review: a failed read took nothing,
     * announced nothing and blanked nothing; round 20: a statement that
     * rejected was not read back at all). `read` answers with what the
     * lane's read found, once it has been taken, or `'unread'` where it
     * failed; `taken` resolves once a read back has been taken: where the
     * caller holds this process's switch statements back
     * (`holdSwitchStatements`), the hold stands until then, so after a
     * failed read until the database answers a new connection from this
     * process with the row, and while the lane's read is out, which nothing
     * bounds, for as long as it is.
     */
    private settleSwitchStatement(
        id: string,
        withCopies: boolean,
        after: PendingSettle['after']
    ): { read: Promise<SwitchReadBack>; taken: Promise<void> } {
        if (!this.queue) return { read: Promise.resolve('unread'), taken: Promise.resolve() };
        // While the read is out, and until a read again has answered, a
        // carry's answer for the switch leaves the mirror alone but for its
        // column once Postgres is read to hold it (`takeCarryAnswer`,
        // `confirmCarriedColumns`).
        let reading = this.carriesBehindSettle.get(id);
        if (!reading) {
            reading = { reading: 0, notes: [] };
            this.carriesBehindSettle.set(id, reading);
        }
        const behind = reading;
        behind.reading += 1;
        const settle: PendingSettle = {
            id,
            seen: this.mapByName('deadmanSwitches').get(id),
            withCopies,
            reading: behind,
            after,
        };
        let answerRead!: (found: SwitchReadBack) => void;
        const read = new Promise<SwitchReadBack>((resolve) => {
            answerRead = resolve;
        });
        // The lane's read, for `drainWrites`: it is queued only now, after a
        // drain that began while the statement stood may have taken its
        // snapshot of the queue.
        this.settleLaneReads.add(read);
        void read.then(() => this.settleLaneReads.delete(read));
        const taken = this.readSwitchAndCopiesInLane(id, withCopies)
            .then((found) => {
                this.takeSettledRow(settle, found);
                answerRead(found);
            })
            .catch((err) => {
                log.warn('deadman_switch_settle_read_failed', {
                    error: err instanceof Error ? err.message : String(err),
                });
                answerRead('unread');
                return this.retrySettleRead(settle);
            })
            .finally(() => {
                behind.reading -= 1;
                if (behind.reading === 0 && this.carriesBehindSettle.get(id) === behind) {
                    this.carriesBehindSettle.delete(id);
                }
            });
        return { read, taken };
    }

    /**
     * A settle's read back of its switch, as Postgres holds it: the row goes
     * into the mirror unless the mirror's entry changed since the settle
     * began other than by a carried column (a write of this process's or a
     * refresh; a carry's answer, whose row can be
     * older, does not change it while the settle is out but for its column
     * once Postgres is read to hold it: rounds 17 and 18 of part 2's review)
     * or a conditional write of the switch is in flight (its own merge takes
     * the row); with `withCopies` (the arm), the switch's copies the mirror
     * lacks go in too; the switch and each such copy are announced to the
     * other processes; and a switch found cancelled, in the row read or in
     * the mirror, has its held copies
     * blanked (a cancel landing this way blanks nothing itself: the route
     * does that, after an answer it did not get). Where the row is kept
     * out, the switch is read once more by key, behind the fence of this
     * process's queued writes (`refreshKeys`): the change that kept it out
     * is usually newer than the row read, but a refresh's row is not
     * always, since its read can have run before the statement landed and
     * its answer reached this process after the settle began (round 20 of
     * part 2's review: the mirror then kept the row from before a landed
     * cancel, armed with its content, and, the copies being blanked only
     * where the mirror said cancelled, every sealed copy stayed held in
     * Postgres). Where the row went in, the
     * column of each carry whose answer came while the switch was being
     * settled goes on after it, with `takeCarriedColumn`'s conditions: the
     * row may have been read before that carry landed, and Postgres holds
     * the column unless a later statement cleared it, which those conditions
     * see in the row (round 19: this was done only after the last settle of
     * the switch, and only where that one took its row, so a column read
     * back from Postgres and then replaced by an earlier settle's row was
     * lost).
     */
    private takeSettledRow(
        settle: PendingSettle,
        found: { row: Record<string, unknown>; copies: Array<Record<string, unknown>> } | undefined
    ): void {
        if (!found) return;
        const id = settle.id;
        const tookRow =
            this.unchangedButCarriedColumn(
                this.mapByName('deadmanSwitches').get(id),
                settle.seen
            ) && !this.switchWritesInFlight.has(id);
        this.takeSwitchFromPostgres(id, found, tookRow);
        const current = this.getDeadmanSwitch(id);
        log.info(
            settle.after === 'answer'
                ? 'deadman_switch_write_landed'
                : settle.after === 'failure'
                ? 'deadman_switch_read_back_after_failure'
                : 'deadman_switch_read_back_after_refused_carry',
            { status: current?.status }
        );
        // Cancelled is final, so a row read cancelled is cancelled now,
        // whatever this mirror holds.
        if (current?.status === 'cancelled' || found.row.status === 'cancelled') {
            this.blankHeldCopiesOf(id);
        }
        if (!tookRow) {
            this.rereadSwitch(id);
            return;
        }
        const waiting = this.carriedColumnsToConfirm.get(id);
        for (const note of settle.reading.notes) {
            this.takeCarriedColumn(id, note);
            if (waiting?.includes(note)) waiting.splice(waiting.indexOf(note), 1);
        }
        if (waiting?.length === 0) this.carriedColumnsToConfirm.delete(id);
        if (this.carriedColumnsToConfirm.size === 0) this.clearColumnConfirmTimer();
    }

    /**
     * Read a switch's row once more by key, on the chain of mirror refreshes
     * (`refreshKeys`: the row Postgres holds goes into the mirror, behind the
     * fence of this process's queued writes of it, and is read again where
     * the mirror changed meanwhile). For a settle whose row was kept out. A
     * read that fails is logged and not tried again, as any refresh
     * (`onApplyChain`): the mirror then keeps the change that kept the row
     * out until the switch is next refreshed or written.
     */
    private rereadSwitch(id: string): void {
        const plan = this.plans.get('deadmanSwitches');
        if (!plan || !this.pool) return;
        this.onApplyChain('reread', () => this.refreshKeys(plan, [[id]]), 'deadmanSwitches');
    }

    /**
     * A settle whose read back failed: it waits to be read again
     * (`retrySettleReads`), and the promise resolves once a read has been
     * taken.
     */
    private retrySettleRead(settle: PendingSettle): Promise<void> {
        return new Promise<void>((resolve) => {
            settle.done = resolve;
            this.settleReadsToRetry.push(settle);
            this.retrySettleReads();
        });
    }

    /**
     * Read again each settle whose read back failed (`settleReadsToRetry`):
     * one try at once, and after a try that failed or passed its bound
     * another `carryRetryMs` later, on a timer that does not keep the
     * process alive and is not set after `shutdown`, until one answers. Each
     * try is a connection of its own from the pool, outside the write-behind
     * queue, as the carry's is (`runSettleRetryPass`), so it does not wait
     * behind a read in the switch's lane that does not answer, and it is
     * made whatever else the process asks the database meanwhile; but it
     * needs a connection the pool hands over within the bound. Outside the
     * lane it is ordered after nothing this process queued since the
     * settle's own read ran; the mirror's entry tells: a write of the switch
     * this process made since, or a refresh, changed it, and the row read is
     * then kept out and the switch read once more by key (`takeSettledRow`).
     * While a settle waits here whose caller holds this process's switch
     * statements back (`holdSwitchStatements`: one after a statement that
     * answered late or failed), the stall stands, so no conditional write
     * of a switch is sent by this process; a settle after a refused carry
     * (`readBackAfterRefusedCarry`) waits here with nothing held, and
     * statements are sent meanwhile.
     */
    private retrySettleReads(): void {
        const plan = this.plans.get('deadmanSwitches');
        const wrapPlan = this.plans.get('deadmanReleaseWraps');
        const pool = this.pool;
        if (!plan || !wrapPlan || !pool) return;
        if (this.settleRetryPass) return;
        if (this.settleReadsToRetry.length === 0) return;
        if (this.settleRetryTimer) {
            clearTimeout(this.settleRetryTimer);
            this.settleRetryTimer = null;
        }
        const pass: Promise<void> = this.runSettleRetryPass(pool, plan, wrapPlan).then(
            (wholePass) => {
                if (this.settleRetryPass === pass) this.settleRetryPass = null;
                // A settle that failed after the try's last read and before
                // it ended is read now; after a try that failed, on the timer.
                if (wholePass) this.retrySettleReads();
                else this.scheduleSettleRetry();
            }
        );
        this.settleRetryPass = pass;
    }

    /**
     * One try of reading failed settles again, as `runCarryPass` makes one
     * try of the carry: a connection of its own, each step within
     * `carryTimeoutMs`, false where any step failed or passed its bound,
     * logged (`deadman_switch_settle_read_failed`, with `retry`), with the
     * settles not read left waiting; the connection is given back with the
     * error, so the pool drops it. A settle read is taken
     * (`takeSettledRow`) and ended, which ends its stall.
     */
    private async runSettleRetryPass(
        pool: PgPool,
        plan: TablePlan,
        wrapPlan: TablePlan
    ): Promise<boolean> {
        const acquiring = pool.connect();
        let client: PgClient;
        try {
            client = await this.withinCarryBound(acquiring);
        } catch (err) {
            void acquiring.then(
                (late) => late.release?.(),
                () => undefined
            );
            log.warn('deadman_switch_settle_read_failed', {
                retry: true,
                error: err instanceof Error ? err.message : String(err),
            });
            return false;
        }
        let failure: Error | undefined;
        try {
            // Oldest first; a settle that fails while this try is under way
            // joins the list and is read by it.
            while (this.settleReadsToRetry.length > 0) {
                const settle = this.settleReadsToRetry[0];
                let found:
                    | { row: Record<string, unknown>; copies: Array<Record<string, unknown>> }
                    | undefined;
                try {
                    found = await this.withinCarryBound(
                        readSwitchAndCopies(client, plan, wrapPlan, settle.id, settle.withCopies)
                    );
                } catch (err) {
                    failure = err instanceof Error ? err : new Error(String(err));
                    log.warn('deadman_switch_settle_read_failed', {
                        retry: true,
                        error: failure.message,
                    });
                    return false;
                }
                this.settleReadsToRetry.shift();
                try {
                    this.takeSettledRow(settle, found);
                } catch (err) {
                    log.warn('deadman_switch_settle_take_failed', {
                        error: err instanceof Error ? err.message : String(err),
                    });
                }
                settle.done?.();
            }
            return true;
        } finally {
            client.release?.(failure);
        }
    }

    /** Read failed settles again in `carryRetryMs`, unless after `shutdown` or none waits. */
    private scheduleSettleRetry(): void {
        if (this.settleRetryTimer || this.carryStopped) return;
        if (this.settleReadsToRetry.length === 0) return;
        this.settleRetryTimer = setTimeout(() => {
            this.settleRetryTimer = null;
            this.retrySettleReads();
        }, this.carryRetryMs);
        this.settleRetryTimer.unref?.();
    }

    /**
     * The switch's row in Postgres and, with `withCopies`, its copy rows,
     * read in the switch's lane (after any write of it this process queued),
     * or `undefined` where Postgres has no such switch. Rejects where the
     * read fails.
     */
    private readSwitchAndCopiesInLane(
        id: string,
        withCopies: boolean
    ): Promise<
        { row: Record<string, unknown>; copies: Array<Record<string, unknown>> } | undefined
    > {
        const plan = this.plans.get('deadmanSwitches');
        const wrapPlan = this.plans.get('deadmanReleaseWraps');
        if (!plan || !wrapPlan || !this.queue) return Promise.resolve(undefined);
        return this.queue.enqueueCall(
            (client) => readSwitchAndCopies(client, plan, wrapPlan, id, withCopies),
            { mapName: 'deadmanSwitches', key: id }
        );
    }

    /**
     * Put a switch row Postgres holds, and those of its copy rows the mirror
     * lacks, into the mirror and announce them to the other processes. The
     * switch row itself goes in only with `takeRow` (the callers know whether
     * a newer write or refresh has replaced the mirror's entry meanwhile);
     * a copy row the mirror already has is left as it is.
     */
    private takeSwitchFromPostgres(
        id: string,
        found: { row: Record<string, unknown>; copies: Array<Record<string, unknown>> },
        takeRow: boolean
    ): void {
        const plan = this.plans.get('deadmanSwitches');
        const wrapPlan = this.plans.get('deadmanReleaseWraps');
        if (!plan || !wrapPlan) return;
        if (takeRow) this.mapByName('deadmanSwitches').set(id, rowToRecord(plan, found.row));
        const wrapMap = this.mapByName('deadmanReleaseWraps');
        for (const copy of found.copies) {
            const record = rowToRecord(wrapPlan, copy);
            const key = wrapPlan.descriptor.keyOf(record);
            if (!wrapMap.has(key)) wrapMap.set(key, record);
            this.transport?.publish({
                src: this.instanceId,
                m: 'deadmanReleaseWraps',
                op: 'u',
                kv: wrapPlan.descriptor.conflictColumns.map((c) => String(copy[c])),
            });
        }
        this.transport?.publish({
            src: this.instanceId,
            m: 'deadmanSwitches',
            op: 'u',
            kv: [id],
        });
    }

    /**
     * Blank every held copy of a switch Postgres has as cancelled: the
     * refused branch of a write that read it so, and a cancel that landed
     * after its bound (`settleSwitchStatement`). A cancelled switch never
     * moves again, so this needs no condition; the cancel route blanks them
     * itself only after an answer it got (round 11 of part 2's review: a
     * cancel answered 503 that landed left every copy held until the owner
     * cancelled again, which nothing told them to).
     */
    private blankHeldCopiesOf(switchId: string): void {
        let blanked = 0;
        for (const wrap of this.listDeadmanReleaseWraps(switchId)) {
            if (wrap.sealedKey === '' && wrap.signature === '') continue;
            if (this.eraseDeadmanReleaseWrap(wrap.switchId, wrap.recipientAccountId)) blanked += 1;
        }
        if (blanked > 0) log.info('deadman_cancelled_switch_copies_blanked', { copies: blanked });
    }

    /**
     * Arming, in Postgres: one call on one connection, in the switch's lane
     * (`enqueueCall` with its id: after this process's earlier writes of that
     * switch, which for a fresh id there are none of, and not after its
     * writes to other tables), that checks no switch has the id and then
     * sends one statement (`buildArmSql`): the switch insert-only,
     * `RETURNING` it, and its copies written only where that insert returned
     * the row, over any row of the same key. One statement applies whole or
     * not at all, so Postgres holds a switch with every copy of it or
     * nothing of the arm: never a switch without its copies, which would
     * fire and release to nobody, and never copies no switch names (round 21
     * of part 2's review: the copies were upserted first, one statement
     * each, and the switch last, so an arm whose switch insert the database
     * refused left its copy rows for good, which no bound counted and no
     * pass removed, and one request did that every time, a label holding
     * U+0000, which the route now refuses before the store is asked). An
     * arm that finds the id taken writes nothing and deletes nothing, so
     * the copies of the switch that has the id stay exactly as they were
     * (round 12: a call that found the id taken after writing its copies
     * deleted "its own" rows by their `created_at`, which were the rows the
     * winning arm's switch relied on, and Postgres then held an armed switch
     * with no copies). The mirror takes the rows only once Postgres has
     * them, and they are announced; the route answers 201 only then (round
     * 11: the arm was answered from the mirror before its write ran, so a
     * dropped write left a switch the owner's list showed armed that no
     * other process had, and in the deployed layout, where the sweep runs in
     * another process, it never fired).
     *
     * A statement the database refuses (`sqlstateOfStatementRefusal`: an
     * error it answers for the statement itself) is `refused`: nothing of it
     * was written, nothing is read back and no other switch statement is
     * held back (round 21: such an arm was read back with every owner's
     * switch statements held meanwhile). It is logged with its SQLSTATE
     * (`deadman_switch_arm_refused`); one refused only after the bound was
     * `unanswered` at the bound, and is logged so, with `afterBound`, when
     * its answer comes (`awaitSwitchStatement`, round 22).
     *
     * Where a switch with the id exists, before the statement or by the time
     * of its insert (another process armed it between the check and the
     * insert), the answer is `id_taken`, and that switch and its copies are
     * read in the same call and taken into the mirror where it lacked them,
     * and announced, so the owner's list, check-in and cancel on this process
     * know it (round 12: they did not, so an arm whose first attempt landed
     * but was answered 500 could not be seen or cancelled here). A statement
     * that fails otherwise is an unknown outcome (the connection can die
     * after the server committed it): the switch is read again in its lane,
     * and found, it and its copies are taken into the mirror and announced
     * and the arm is `armed` where it is this arm's own insert (the owner's,
     * created at this call's moment), otherwise `id_taken`
     * (round 12's check: another owner's switch was `armed`, and the route
     * answered with that owner's view; round 13: so was a cancelled switch
     * of the same owner's with the id); not found, `failed` (the route
     * answers 500, nothing in the mirror; a statement the database was still
     * running when its client was lost can commit after that read: the
     * switch is then in Postgres and in no running process's mirror, so no
     * list shows it and no bound counts it, until an arm of the same
     * envelope reaches the store, finds it and takes it into the mirror, or
     * a process reads every table again, which it does when it starts and
     * when its change subscription reconnects (`rehydrateAll`); every check
     * the route makes comes before the store is asked, so such an arm
     * reaches it only where it still passes them: an owner who has since
     * filled a bound is refused by it first, and one whose release
     * identity, or that of a person the envelope names, has been replaced
     * since, or whose envelope names an account since deleted, is refused
     * for that, whatever they do, and then only a process reading every
     * table again brings the switch in; the same holds for an arm
     * past its bound whose statement then rejects and is read back before
     * the database commits it, answered 503); where that read fails too, or
     * does not answer within what
     * is left of the statement's bound, `unanswered`: a read that failed is
     * made again on a connection of its own until one answers, and one not
     * yet answered is waited for, with nothing bounding it, no switch
     * statement being sent by this process meanwhile, so no arm reads the
     * bounds without it (round 20:
     * nothing read it again, and the next arm passed a bound the hidden
     * switch had filled). One that does not answer in time is `unanswered`
     * (the route answers 503) with nothing in the mirror; when it answers
     * later, or fails later (an unknown outcome again), the switch is read
     * back and, where Postgres holds it, it and its copies go into the
     * mirror then and are announced (`settleSwitchStatement`), so the
     * owner's list shows it and the bounds count it, and arming the same
     * envelope again is refused (`release_id_taken`, or a bound the switch
     * itself now fills, which the route checks first). One sent while
     * another switch statement already stands unsettled is `unanswered` at
     * once and was not sent, so it cannot land.
     */
    override async armDeadmanSwitch(
        input: Omit<DeadmanSwitchRecord, 'createdAt' | 'updatedAt'>,
        copies: Array<Omit<DeadmanReleaseWrapRecord, 'createdAt' | 'updatedAt'>>
    ): Promise<DeadmanSwitchArmOutcome> {
        const plan = this.plans.get('deadmanSwitches');
        const wrapPlan = this.plans.get('deadmanReleaseWraps');
        const queue = this.queue;
        if (!this.pool || !plan || !wrapPlan || !queue) {
            return super.armDeadmanSwitch(input, copies);
        }
        if (this.getDeadmanSwitch(input.id)) return { kind: 'id_taken' };
        if (this.stalledSwitchStatement) return { kind: 'unanswered' };
        const ts = nowIso();
        const record: DeadmanSwitchRecord = { ...input, createdAt: ts, updatedAt: ts };
        const wraps: DeadmanReleaseWrapRecord[] = copies.map((copy) => ({
            ...copy,
            createdAt: ts,
            updatedAt: ts,
        }));
        const row = recordToRow(plan, record as unknown as Record<string, unknown>);
        const columns = Object.keys(row);
        const wrapRows = wraps.map((wrap) =>
            recordToRow(wrapPlan, wrap as unknown as Record<string, unknown>)
        );
        // Every column any copy has a value for, in the table's order; a
        // copy that lacks one writes it empty.
        const wrapColumns = wrapPlan.columns
            .map((column) => column.name)
            .filter((name) =>
                wrapRows.some((wrapRow) => Object.prototype.hasOwnProperty.call(wrapRow, name))
            );
        // The switch and its copies in one statement (`buildArmSql`). An
        // envelope has at least two copies; an arm given none (no route
        // sends one) is the switch's insert alone.
        const armSql =
            wrapRows.length > 0
                ? buildArmSql(plan, columns, wrapPlan, wrapColumns, wrapRows.length)
                : `${buildUpsertSql(plan, columns, [], true)} RETURNING *`;
        const armParams = [
            ...columns.map((c) => row[c]),
            ...wrapRows.flatMap((wrapRow) => wrapColumns.map((c) => wrapRow[c] ?? null)),
        ];
        const call = { abandoned: false };
        const scope = { mapName: 'deadmanSwitches', key: input.id };
        type Found = { row: Record<string, unknown>; copies: Array<Record<string, unknown>> };
        const statement = queue.enqueueCall(
            async (
                client
            ): Promise<
                | { skipped: true }
                | { taken: Found | undefined }
                | { applied: Record<string, unknown> }
                | { refused: string }
            > => {
                if (call.abandoned) return { skipped: true as const };
                const existing = await readSwitchAndCopies(client, plan, wrapPlan, input.id, true);
                if (existing) return { taken: existing };
                const armed = await answeredOrRefused(() =>
                    client.query<Record<string, unknown>>(armSql, armParams)
                );
                if ('refused' in armed) return armed;
                const inserted = armed.rows[0];
                if (inserted) return { applied: inserted };
                return { taken: await readSwitchAndCopies(client, plan, wrapPlan, input.id, true) };
            },
            scope
        );
        const waited = await this.awaitSwitchStatement(input.id, statement, call, true);
        const map = this.mapByName('deadmanSwitches');
        if (waited.kind === 'failed') {
            // Unknown outcome: the insert may have committed. The switch has
            // been read back in its lane, and where Postgres holds it, it and
            // its copies are in the mirror and announced (`takeSettledRow`).
            // Where that read failed it is made again on a connection of
            // its own until one answers, and where it did not answer within
            // what was left of the bound it is waited for; no arm reads the
            // bounds without the switch meanwhile: the stall stands
            // (round 20 of part 2's review: nothing read it again, and the
            // next arm passed a bound the hidden switch had filled).
            const found = waited.readBack;
            if (found === 'unread') {
                log.warn('deadman_switch_arm_read_failed', {});
                return { kind: 'unanswered' };
            }
            if (!found) return { kind: 'failed' };
            log.info('deadman_switch_arm_found_after_failure', {});
            // Only this arm's own insert is answered as armed: the owner's,
            // written at this call's moment. Another owner's switch with this
            // id is not this arm's, and its owner's view is not this caller's
            // to be answered with (round 12's check: it was answered as armed,
            // with that view); nor is a switch of the same owner's that an
            // earlier arm of the id wrote (round 13 of part 2's review: a
            // cancelled one was answered 201 and announced as armed, where the
            // same request without the failure is 409; its moment tells it
            // from this arm's). A third condition, that the row still be
            // armed, could be reached by no test (this arm's own row cancelled
            // within its read-back) and was dropped in round 14: the answer
            // carries the row as Postgres has it.
            const foundRecord = rowToRecord(plan, found.row);
            const taken = this.getDeadmanSwitch(input.id);
            if (!taken || foundRecord.ownerId !== input.ownerId || foundRecord.createdAt !== ts) {
                return { kind: 'id_taken' };
            }
            return { kind: 'armed', record: taken };
        }
        if (waited.kind === 'timeout') return { kind: 'unanswered' };
        const answer = waited.answer;
        if ('skipped' in answer) return { kind: 'unanswered' };
        if ('refused' in answer) {
            // The database's own answer to the one statement: nothing of it
            // was written, so nothing is read back and nothing held back.
            log.error('deadman_switch_arm_refused', { sqlstate: answer.refused });
            return { kind: 'refused' };
        }
        if ('taken' in answer) {
            if (answer.taken && !map.has(input.id)) {
                this.takeSwitchFromPostgres(input.id, answer.taken, true);
            }
            return { kind: 'id_taken' };
        }
        const wrapMap = this.mapByName('deadmanReleaseWraps');
        for (const wrap of wraps) {
            const asRecord = wrap as unknown as Record<string, unknown>;
            wrapMap.set(wrapPlan.descriptor.keyOf(asRecord), asRecord);
            this.transport?.publish({
                src: this.instanceId,
                m: 'deadmanReleaseWraps',
                op: 'u',
                kv: [wrap.switchId, wrap.recipientAccountId],
            });
        }
        map.set(input.id, rowToRecord(plan, answer.applied));
        this.transport?.publish({
            src: this.instanceId,
            m: 'deadmanSwitches',
            op: 'u',
            kv: [input.id],
        });
        return { kind: 'armed', record: this.getDeadmanSwitch(input.id)! };
    }

    /**
     * A switch's write, conditional in Postgres: one `UPDATE ... WHERE` the
     * stored switch still has the status and the last check-in this process
     * read (a fired one's status is `triggered`), `RETURNING` the row, run in
     * the switch's own lane of the write-behind queue (`enqueueCall` with its
     * id): after this process's earlier queued writes of that switch (its
     * arming of it, a plain write of it) and any targeted op of its on the
     * switches' table (no spec has one), and not
     * after its writes to other rows or tables; a write of the switch this
     * process queues meanwhile runs after it (round 11 of part 2's review:
     * the statement waited behind every write the process had queued, to
     * any table, so an honest check-in behind a backlog was answered 503 and
     * every other owner's then refused at once). Only
     * the written columns are in the statement, so a label another process
     * wrote stays.
     *
     * The mirror takes nothing of it until Postgres has answered (round 10
     * of part 2's review: it took the move at once, so while the statement
     * waited this process served the people named their copies and sent them
     * a notice for a trigger Postgres then refused). Then, applied, the
     * mirror takes the row Postgres returned; refused, the row Postgres has,
     * read in the same turn, and the result is announced to the other
     * processes either way, so they refresh too; a refused write that finds
     * the switch cancelled blanks its held copies (`blankHeldCopiesOf`).
     * Where this process wrote the switch plainly while the statement ran
     * (no route does in Postgres mode since round 12's check: a check-in, a
     * cancel, the second cancel's and the removal's blanking of the content,
     * another move and the owner's deletion are all statements in the
     * switch's lane, run one after another, and the deletion's fallback where
     * the database does not answer is the same statement queued, so no plain
     * write of a switch is left; `eraseDeadmanSwitch` is the memory and file
     * stores' alone), what
     * those writes changed is kept over Postgres's row and the result written
     * after them, so the mirror and Postgres agree; otherwise Postgres's row
     * is taken as it is and nothing is written (round 10: what a change
     * notification had put in the mirror was taken for a write of this
     * process's, and an older status written over a cancel another process
     * had committed).
     *
     * Where Postgres has no row for the switch at all, this process's own
     * write of it failed twice and was dropped (`db_write_behind_failed`):
     * nothing deletes a switch row. The record is then written whole, as the
     * sweep's full-row write did before round 9, insert-only, and the write
     * applies (round 10: such a switch never fired, and nothing said so).
     * Since round 11 arming awaits its own insert (`armDeadmanSwitch`), so
     * this reaches only rows dropped before that.
     *
     * An update the database refuses (`sqlstateOfStatementRefusal`: an error
     * it answers for the statement itself) did not apply: it is logged
     * (`deadman_switch_write_refused`, with its SQLSTATE) and `unanswered`,
     * with nothing read back and no other switch statement held back (round
     * 21 of part 2's review); one the database refuses only after the bound
     * was `unanswered` at the bound and logged as a timeout then, and is
     * logged as refused, on the same line with `afterBound`, when its
     * answer comes (`awaitSwitchStatement`, round 22).
     * A statement that fails otherwise is logged and `unanswered`,
     * and is an unknown outcome (the connection can be lost after the
     * database applied it, or while the database is still running it):
     * the switch is read back in its lane before the answer, within what is
     * left of the statement's bound, and the row Postgres holds is taken
     * into the mirror and announced, a cancelled switch's copies blanked
     * (`awaitSwitchStatement`; round 20 of part 2's review: nothing read it,
     * so a cancel the database had applied left this mirror armed and every
     * copy held). Where it had not landed, the row read is the one the
     * mirror had: the write is safe to repeat, and the sweep's next pass
     * does (round 10: one failure kept the move in the mirror only, and no
     * pass tried it again); one the database applies only after that read
     * is not seen by it (`awaitSwitchStatement` says what then brings it
     * in). Where that read fails or does not answer in
     * time, no switch statement is sent by this process until a read again
     * has answered, and the sweep counts that time as a stall. One that
     * does not answer within `switchStatementTimeoutMs` is `unanswered` too,
     * and is not run if its turn in the queue has not yet come; one already
     * sent can still land later, or fail later, and when it does the switch
     * is read again, taken into the mirror and announced, and a landed
     * cancel's copies are blanked (`settleSwitchStatement`; round 11:
     * nothing was, so the mirror said armed, every copy stayed held and no
     * process was told until the next pass happened to refresh the row).
     * The domain event of a move taken this way is still not emitted.
     */
    private async writeDeadmanSwitchIf(
        id: string,
        read: Pick<DeadmanSwitchRecord, 'status' | 'lastCheckInAt'>,
        patch: Partial<Omit<DeadmanSwitchRecord, 'id' | 'createdAt' | 'ownerId'>>
    ): Promise<
        | { kind: 'applied'; record: DeadmanSwitchRecord; statusMovedHere: boolean }
        | { kind: 'refused'; current: DeadmanSwitchRecord | undefined }
        | { kind: 'unanswered' }
    > {
        const plan = this.plans.get('deadmanSwitches');
        const queue = this.queue;
        if (!plan || !queue) return { kind: 'unanswered' };
        const before = this.getDeadmanSwitch(id);
        if (!before || !switchStillAsRead(before, read))
            return { kind: 'refused', current: before };
        if (this.stalledSwitchStatement) return { kind: 'unanswered' };
        const updatedAt = nowIso();
        const written = recordToRow(plan, { ...patch, updatedAt });
        const whole = recordToRow(plan, { ...before, ...patch, updatedAt } as unknown as Record<
            string,
            unknown
        >);
        const columns = Object.keys(written);
        const table = plan.descriptor.tableName;
        const n = columns.length;
        // The trigger is refused where the owner made a refused attempt after
        // the last landed check-in and the switch has not had its backlog
        // window (decision 31): the column is the database's, so a sweep whose
        // mirror has not yet heard of a carry that landed elsewhere (its
        // announcement lost, or the refresh it asked for failed) does not fire
        // the switch and wipe the column (round 15 of part 2's review). The
        // refusal takes Postgres's row into the mirror, so the next pass gives
        // the window; a switch that had its window fires when it ends.
        const heldByRefusedAttempt =
            patch.status === 'triggered'
                ? 'AND (owner_attempt_refused_at IS NULL ' +
                  'OR owner_attempt_refused_at <= last_check_in_at ' +
                  'OR backlog_grace_started_at IS NOT NULL) '
                : '';
        const inFlight = this.beginSwitchWrite(id);
        const note = inFlight.note;
        const call = { abandoned: false };
        const statement = queue.enqueueCall(
            async (client) => {
                // Its turn came after the caller stopped waiting: not run.
                if (call.abandoned) return { skipped: true as const };
                const updated = await answeredOrRefused(() =>
                    client.query<Record<string, unknown>>(
                        `UPDATE ${table} SET ${columns
                            .map((c, i) => `${c} = $${i + 1}`)
                            .join(', ')} ` +
                            `WHERE id = $${n + 1} AND status = $${n + 2} ` +
                            `AND last_check_in_at = $${n + 3}::timestamptz ` +
                            heldByRefusedAttempt +
                            'RETURNING *',
                        [...columns.map((c) => written[c]), id, read.status, read.lastCheckInAt]
                    )
                );
                if ('refused' in updated) return updated;
                const row = updated.rows[0];
                if (row) return { applied: row, inserted: false };
                const select = async () =>
                    (
                        await client.query<Record<string, unknown>>(
                            `SELECT * FROM ${table} WHERE id = $1`,
                            [id]
                        )
                    ).rows[0];
                const found = await select();
                if (found) return { stored: found };
                const wholeColumns = Object.keys(whole);
                // Not turned into a refusal as the update is: this insert is
                // reached only for a row dropped before round 11, and one
                // the database refused is read back as any failure is.
                const inserted = (
                    await client.query<Record<string, unknown>>(
                        `INSERT INTO ${table} (${wholeColumns.join(', ')}) VALUES (${wholeColumns
                            .map((_, i) => `$${i + 1}`)
                            .join(', ')}) ON CONFLICT (id) DO NOTHING RETURNING *`,
                        wholeColumns.map((c) => whole[c])
                    )
                ).rows[0];
                if (inserted) return { applied: inserted, inserted: true };
                return { stored: await select() };
            },
            { mapName: 'deadmanSwitches', key: id }
        );
        let waited: SwitchStatementWait<Awaited<typeof statement>>;
        try {
            waited = await this.awaitSwitchStatement(id, statement, call, false, inFlight.end);
        } finally {
            inFlight.end();
        }
        // Failed or not answered in time: an unknown outcome either way. One
        // that failed has been read back (or is being read until a read
        // answers), and one that lands late is when it does; what Postgres
        // holds is in the mirror, announced, once it has been.
        if (waited.kind !== 'answered') return { kind: 'unanswered' };
        const answer = waited.answer;
        if ('skipped' in answer) return { kind: 'unanswered' };
        if ('refused' in answer) {
            // The database's own answer to the update: it did not apply, so
            // nothing is read back and no other switch statement is held
            // back. `unanswered` to the caller all the same: the write was
            // not made, an owner's attempt refused this way is noted and
            // carried as any other (decision 31), and a move is the next
            // pass's to make.
            log.error('deadman_switch_write_refused', { sqlstate: answer.refused });
            return { kind: 'unanswered' };
        }
        const map = this.mapByName('deadmanSwitches');
        const fromPostgres =
            'applied' in answer
                ? answer.applied
                : (answer.stored as Record<string, unknown> | undefined);
        if (!fromPostgres) {
            // Postgres has no row, and its insert met one: nothing to take.
            return { kind: 'refused', current: this.getDeadmanSwitch(id) };
        }
        if ('applied' in answer && answer.inserted) {
            log.warn('deadman_switch_row_restored', {});
        }
        const stored = rowToRecord(plan, fromPostgres);
        if (note.size > 0) {
            // This process's own writes are queued after the statement: what
            // they changed is kept over Postgres's row, and the whole row is
            // written after them, every column (a field neither has is
            // written empty), so Postgres ends as the mirror is.
            const merged: Record<string, unknown> = {};
            for (const column of plan.columns) merged[snakeToCamel(column.name)] = undefined;
            Object.assign(merged, stored);
            for (const [key, value] of note) merged[key] = value;
            map.set(id, merged);
            queue.enqueueUpsert('deadmanSwitches', merged);
        } else {
            map.set(id, stored);
        }
        this.transport?.publish({ src: this.instanceId, m: 'deadmanSwitches', op: 'u', kv: [id] });
        const current = this.getDeadmanSwitch(id);
        if ('applied' in answer && current) {
            this.endOwnerWriteNote(id);
            return { kind: 'applied', record: current, statusMovedHere: note.has('status') };
        }
        if (
            patch.status === 'triggered' &&
            current &&
            current.status !== 'triggered' &&
            current.status !== 'cancelled' &&
            !current.backlogGraceStartedAt &&
            ownerAttemptRefusedSinceCheckIn(current)
        ) {
            log.info('deadman_trigger_held_by_refused_attempt', {});
        }
        if (current?.status === 'cancelled') this.blankHeldCopiesOf(id);
        return { kind: 'refused', current };
    }

    /**
     * The owner's deletion of one switch, decided in Postgres: one call in
     * the switch's lane (`eraseSwitchUnlessFiredOn`), statements on one
     * connection and not a transaction, that erases the label and, where the
     * stored row has not fired, cancels the switch and empties its content
     * (and ends a backlog window), each column by a `CASE` on the stored
     * status, and then, in a second statement and only where the row as
     * updated has not fired, blanks every held copy of the switch; so a
     * switch another process fired that this mirror still had armed is erased
     * as fired, its content, `releasedAt`, status and copies kept (decision
     * 30, built in round 12 of part 2's review: the deletion wrote the switch
     * from the deleting process's mirror, cancelling a release that had fired
     * elsewhere and removing its content and copies). A failure between the
     * two statements leaves the switch cancelled with its copies held; the
     * call is then `queued` and run again whole, and the deletion's last
     * statement (`eraseDeadmanSwitchesOfDeletedOwner`) blanks them too. The
     * statement always applies to a row that exists (where Postgres has
     * none, this process's own write of the switch having been dropped
     * before round 11, the mirror's erase is inserted first and the
     * statement run on what is there), so nothing is refused; its answer, the
     * switch and the copies as Postgres now holds them, goes into the mirror
     * as a conditional write's does (what this process's own writes changed
     * meanwhile kept over it) and is announced, and where the switch has not
     * fired each of its copies is blanked once more as a queued write in the
     * copy's own lane, so a copy write this process had queued before (a
     * re-seal answered just before the deletion) does not land after the
     * blanking and leave a held copy in Postgres (round 13).
     *
     * Where the database does not answer the statement within the bound, or
     * is not sent it because another switch statement stands unanswered on
     * this process, or fails it, the outcome is `queued`: the same call is
     * queued in the switch's lane (`queueEraseUnlessFired`), after the
     * unanswered one, so it decides on the row Postgres holds when it runs,
     * and the deletion route's wait for this process's queued writes covers
     * it (decision 27). Nothing writes the mirror's view of the switch over
     * the row (round 12's check), and the mirror holds no view of its own of
     * the erase meanwhile (round 13). A sent statement that lands later is
     * taken when it settles (`settleSwitchStatement`), as the others are.
     */
    override async eraseDeadmanSwitchUnlessFired(id: string): Promise<DeadmanSwitchEraseOutcome> {
        const plan = this.plans.get('deadmanSwitches');
        const wrapPlan = this.plans.get('deadmanReleaseWraps');
        const queue = this.queue;
        if (!this.pool || !plan || !wrapPlan || !queue) {
            return super.eraseDeadmanSwitchUnlessFired(id);
        }
        const before = this.getDeadmanSwitch(id);
        if (!before) return { kind: 'absent' };
        // What Postgres is given where it has no row for the switch.
        const restore = erasedSwitchRecord(before);
        if (!this.stalledSwitchStatement) {
            const inFlight = this.beginSwitchWrite(id);
            const note = inFlight.note;
            const call = { abandoned: false };
            const statement = queue.enqueueCall(
                async (client) => {
                    if (call.abandoned) return { skipped: true as const };
                    return {
                        erased: await eraseSwitchUnlessFiredOn(client, plan, wrapPlan, id, restore),
                    };
                },
                { mapName: 'deadmanSwitches', key: id }
            );
            let waited: SwitchStatementWait<Awaited<typeof statement>>;
            try {
                waited = await this.awaitSwitchStatement(id, statement, call, false, inFlight.end);
            } finally {
                inFlight.end();
            }
            if (waited.kind === 'answered' && !('skipped' in waited.answer)) {
                const erased = waited.answer.erased;
                if (!erased) return { kind: 'absent' };
                this.takeErasedSwitch(id, plan, wrapPlan, erased, note, true);
                return { kind: 'applied', record: this.getDeadmanSwitch(id)! };
            }
        }
        this.queueEraseUnlessFired(id, plan, wrapPlan, restore);
        return { kind: 'queued' };
    }

    /** Switches whose queued erase (`queueEraseUnlessFired`) has not yet landed, or been read back once dropped. */
    private readonly erasesPending = new Set<string>();
    /** Every queued erase not yet settled, so `drain` waits for them, the retry and the read-back included. */
    private readonly queuedErases = new Set<Promise<void>>();

    override deadmanSwitchErasePending(id: string): boolean {
        return this.erasesPending.has(id) || super.deadmanSwitchErasePending(id);
    }

    /**
     * The deletion's erase of one switch whose statement was not answered in
     * time, not sent, or failed (`eraseDeadmanSwitchUnlessFired`): the same
     * call queued in the switch's lane, so after the unanswered one, and
     * taken into the mirror and announced when it lands. A failure, from
     * taking the connection on (a pool that refuses one: round 13 of part 2's
     * review found a refused connection dropped the erase with no retry), is
     * tried once more as a fresh queued call. Until it lands this mirror
     * keeps the switch as it last had it, marked (`deadmanSwitchErasePending`),
     * and the sweep does not move a marked switch (round 13: the mirror held
     * this process's own erase of the switch, cancelled and emptied, and the
     * removal pass then blanked every copy of a release another process had
     * fired, through plain writes no condition guarded; that blanking is now
     * also conditional in Postgres, `blankCopiesOfCancelledSwitch`). What this
     * mirror serves or notifies meanwhile rests on the switch as Postgres last
     * had it, as on any switch between a change elsewhere and its
     * notification. Where both attempts
     * fail it is dropped, loudly (`db_write_behind_failed`, counted as the
     * queue's dropped writes are), the switch stays in Postgres as it was,
     * and the switch and its copies are read back from Postgres into this
     * mirror, which ends the mark, so this process then holds what Postgres
     * holds (round 13: it kept its own erased view for good); where that
     * read fails too the mark stays, and this process's sweep leaves the
     * switch unmoved until the deletion's last statement
     * (`eraseDeadmanSwitchesOfDeletedOwner`) reaches it or the process
     * restarts and reads it.
     */
    private queueEraseUnlessFired(
        id: string,
        plan: TablePlan,
        wrapPlan: TablePlan,
        restore: DeadmanSwitchRecord
    ): void {
        const queue = this.queue;
        if (!queue) return;
        this.erasesPending.add(id);
        log.warn('deadman_switch_erase_queued', {});
        const run = () =>
            queue.enqueueCall(
                (client) => eraseSwitchUnlessFiredOn(client, plan, wrapPlan, id, restore),
                { mapName: 'deadmanSwitches', key: id }
            );
        const chain: Promise<void> = run()
            .catch((err: unknown) => {
                log.warn('db_write_behind_retry', {
                    error: err instanceof Error ? err.message : String(err),
                });
                return run();
            })
            .then(
                (erased) => {
                    if (erased) {
                        this.takeErasedSwitch(id, plan, wrapPlan, erased, undefined, true);
                        log.info('deadman_switch_erase_landed', { status: erased.row.status });
                    } else {
                        this.erasesPending.delete(id);
                    }
                },
                async (err: unknown) => {
                    dbWriteBehindFailuresTotal.inc({ map: 'deadmanSwitches', kind: 'erase' });
                    log.error('db_write_behind_failed', {
                        map: 'deadmanSwitches',
                        kind: 'erase',
                        error: err instanceof Error ? err.message : String(err),
                    });
                    try {
                        const found = await this.readSwitchAndCopiesInLane(id, true);
                        if (found) {
                            this.takeSwitchFromPostgres(
                                id,
                                found,
                                !this.switchWritesInFlight.has(id)
                            );
                        }
                        this.erasesPending.delete(id);
                    } catch (readErr) {
                        log.warn('deadman_switch_erase_read_back_failed', {
                            error: readErr instanceof Error ? readErr.message : String(readErr),
                        });
                    }
                }
            )
            .finally(() => {
                this.queuedErases.delete(chain);
            });
        this.queuedErases.add(chain);
    }

    /**
     * The switch and the copies the owner's deletion left in Postgres, into
     * the mirror, announced, which ends a queued erase's mark. With `note`
     * (the bounded statement), what this process's own plain writes of the
     * switch changed while it ran is kept over Postgres's row and the result
     * written after them, as a conditional write's merge does; without (a
     * queued erase landing, the deletion's last statement), the row is taken
     * unless a conditional write of the switch is in flight, which takes the
     * row itself when it answers. The copies the statement blanked replace
     * the mirror's. With `reblank`, where the switch has not fired, each copy
     * of it is blanked once more as a queued write in its own lane, after any
     * copy write this process queued before (round 13 of part 2's review: a
     * re-seal's copy, answered just before the deletion and still queued,
     * landed after the statement's blanking and stayed held in Postgres,
     * while this mirror took the blank row and never repaired it).
     */
    private takeErasedSwitch(
        id: string,
        plan: TablePlan,
        wrapPlan: TablePlan,
        erased: {
            row: Record<string, unknown>;
            copies: Array<Record<string, unknown>>;
            restored: boolean;
        },
        note: Map<string, unknown> | undefined,
        reblank: boolean
    ): void {
        if (erased.restored) log.warn('deadman_switch_row_restored', {});
        this.erasesPending.delete(id);
        const map = this.mapByName('deadmanSwitches');
        const stored = rowToRecord(plan, erased.row);
        if (note && note.size > 0) {
            const merged: Record<string, unknown> = {};
            for (const column of plan.columns) merged[snakeToCamel(column.name)] = undefined;
            Object.assign(merged, stored);
            for (const [key, value] of note) merged[key] = value;
            map.set(id, merged);
            this.queue?.enqueueUpsert('deadmanSwitches', merged);
        } else if (note || !this.switchWritesInFlight.has(id)) {
            map.set(id, stored);
        }
        const wrapMap = this.mapByName('deadmanReleaseWraps');
        for (const copy of erased.copies) {
            const record = rowToRecord(wrapPlan, copy);
            wrapMap.set(wrapPlan.descriptor.keyOf(record), record);
            this.transport?.publish({
                src: this.instanceId,
                m: 'deadmanReleaseWraps',
                op: 'u',
                kv: wrapPlan.descriptor.conflictColumns.map((c) => String(copy[c])),
            });
        }
        if (reblank && erased.row.status !== 'triggered') {
            for (const wrap of this.listDeadmanReleaseWraps(id)) {
                this.eraseDeadmanReleaseWrap(wrap.switchId, wrap.recipientAccountId);
            }
        }
        this.transport?.publish({ src: this.instanceId, m: 'deadmanSwitches', op: 'u', kv: [id] });
        this.endOwnerWriteNote(id);
    }

    /**
     * The owner's deletion, once this process's queued writes (the
     * deletion's among them, its queued erases included) have been attempted:
     * statements in the database, on one connection and not a transaction,
     * over every switch Postgres holds for the owner: the same `CASE` erase
     * as `eraseSwitchUnlessFiredOn` over each row with something left to
     * erase (label or refused attempt gone; an unfired switch cancelled and
     * emptied; a fired one kept fired with its content and `releasedAt`; a
     * long-cancelled row, kept as decision 24 has it, is not rewritten, so it
     * costs a deletion nothing: round 14 of part 2's review), then every row
     * of the owner's read, then one blanking every held copy of an unfired
     * switch of the owner's and every held copy sealed to the account on
     * anyone's switch, then every copy of every switch of the owner's read.
     * So a switch this process's mirror did not have when the deletion listed
     * the owner's switches is erased too: an arm whose insert was still being
     * written, one answered 503 whose insert landed later, one whose
     * statement failed and committed before this, or one another process
     * armed before it heard of the deletion (round 13 of part 2's review:
     * each was left armed with its content, and fired at its deadline for an
     * account that was gone). The rows erased go into the mirror with every
     * copy of theirs as Postgres has them and are announced, which ends a
     * queued erase still marked; a row nothing changed goes in where the
     * mirror holds it marked (its queued erase dropped and read back without
     * success) or with another status or `releasedAt` than Postgres, which
     * ends the mark (round 15: a fired switch with no label, which the first
     * statement does not rewrite, kept a stale armed view and its mark for
     * good, and was served to nobody here), with its copies as Postgres has
     * them (round 16: only those the mirror lacked, so a switch taken
     * cancelled kept the sealed copies this mirror held), and otherwise only
     * where the mirror lacks it, its copies where the mirror lacks them;
     * neither row is announced (round 14: a fired switch this mirror never
     * had went in with the owner's blanked copy alone, never the recipients'
     * held ones, so the release was served to nobody on the deleting process
     * until it restarted), and every copy the blanking changed on a switch
     * not rewritten is set in the mirror and announced. An arm that
     * commits after this (a statement the database was still running when
     * its client was lost) is not reached. The caller
     * (`finishAccountDeletion`) drains first too; this one stands on its own,
     * so whoever calls it the statements run after this process's queued
     * writes. Returns how many switches Postgres holds for the owner.
     */
    override async eraseDeadmanSwitchesOfDeletedOwner(ownerId: string): Promise<number> {
        const plan = this.plans.get('deadmanSwitches');
        const wrapPlan = this.plans.get('deadmanReleaseWraps');
        if (!this.pool || !plan || !wrapPlan)
            return super.eraseDeadmanSwitchesOfDeletedOwner(ownerId);
        await this.drainWrites();
        const table = plan.descriptor.tableName;
        const wrapTable = wrapPlan.descriptor.tableName;
        const updatedAt = nowIso();
        const client = await this.pool.connect();
        let erased: Array<Record<string, unknown>>;
        let rows: Array<Record<string, unknown>>;
        let blanked: Array<Record<string, unknown>>;
        let copies: Array<Record<string, unknown>>;
        try {
            erased = (
                await client.query<Record<string, unknown>>(
                    `UPDATE ${table} SET headline = NULL, owner_attempt_refused_at = NULL, ` +
                        'updated_at = $2::timestamptz, ' +
                        "status = CASE WHEN status = 'triggered' THEN status ELSE 'cancelled' END, " +
                        "encrypted_payload = CASE WHEN status = 'triggered' THEN encrypted_payload ELSE '' END, " +
                        "backlog_grace_started_at = CASE WHEN status = 'triggered' THEN backlog_grace_started_at ELSE NULL END " +
                        'WHERE owner_id = $1 AND (headline IS NOT NULL OR owner_attempt_refused_at IS NOT NULL ' +
                        "OR (status <> 'triggered' AND (status <> 'cancelled' OR encrypted_payload <> '' " +
                        'OR backlog_grace_started_at IS NOT NULL))) RETURNING *',
                    [ownerId, updatedAt]
                )
            ).rows;
            rows = (
                await client.query<Record<string, unknown>>(
                    `SELECT * FROM ${table} WHERE owner_id = $1`,
                    [ownerId]
                )
            ).rows;
            blanked = (
                await client.query<Record<string, unknown>>(
                    `UPDATE ${wrapTable} SET sealed_key = '', signature = '', ` +
                        'updated_at = $2::timestamptz ' +
                        "WHERE (sealed_key <> '' OR signature <> '') AND (recipient_account_id = $1 " +
                        `OR switch_id IN (SELECT id FROM ${table} WHERE owner_id = $1 AND status <> 'triggered')) ` +
                        'RETURNING *',
                    [ownerId, updatedAt]
                )
            ).rows;
            copies =
                rows.length === 0
                    ? []
                    : (
                          await client.query<Record<string, unknown>>(
                              `SELECT * FROM ${wrapTable} WHERE switch_id = ANY($1::text[])`,
                              [rows.map((row) => String(row.id))]
                          )
                      ).rows;
        } finally {
            client.release?.();
        }
        const ofSwitch = new Map<string, Array<Record<string, unknown>>>();
        for (const copy of copies) {
            const switchId = String(copy.switch_id);
            ofSwitch.set(switchId, [...(ofSwitch.get(switchId) ?? []), copy]);
        }
        const erasedIds = new Set(erased.map((row) => String(row.id)));
        const map = this.mapByName('deadmanSwitches');
        const wrapMap = this.mapByName('deadmanReleaseWraps');
        for (const row of rows) {
            const id = String(row.id);
            if (erasedIds.has(id)) {
                this.takeErasedSwitch(
                    id,
                    plan,
                    wrapPlan,
                    { row, copies: ofSwitch.get(id) ?? [], restored: false },
                    undefined,
                    false
                );
                continue;
            }
            // Nothing changed in Postgres. Where this mirror holds the switch
            // marked (a queued erase dropped and its read back failed) or
            // with another status or `releasedAt` than Postgres (a trigger
            // committed elsewhere it was not told of), the row is taken,
            // which ends the mark (round 15 of part 2's review: a fired switch
            // with no label was not rewritten here, so the stale armed view
            // and the mark stayed, and this process served the release to
            // nobody until it restarted); otherwise the row goes in only
            // where this mirror lacks it. Where the row was taken so, its
            // copies as Postgres has them replace this mirror's (round 16:
            // they went in only where this mirror lacked them, so a switch a
            // queued erase had cancelled, whose copies only the third
            // statement here blanked, was taken cancelled with the people
            // named still holding their sealed copies in this mirror);
            // otherwise those this mirror lacks go in. The row is not
            // announced (nothing in it changed); a copy the third statement
            // blanked is, below.
            const fromPostgres = rowToRecord(plan, row);
            const held = map.get(id);
            const behind =
                held !== undefined &&
                (this.erasesPending.has(id) ||
                    held.status !== fromPostgres.status ||
                    held.releasedAt !== fromPostgres.releasedAt);
            if (behind) {
                this.erasesPending.delete(id);
                this.endOwnerWriteNote(id);
                if (!this.switchWritesInFlight.has(id)) map.set(id, fromPostgres);
            } else if (!held && !this.switchWritesInFlight.has(id)) {
                map.set(id, fromPostgres);
            }
            for (const copy of ofSwitch.get(id) ?? []) {
                const record = rowToRecord(wrapPlan, copy);
                const key = wrapPlan.descriptor.keyOf(record);
                if (behind || !wrapMap.has(key)) wrapMap.set(key, record);
            }
        }
        // Copies the third statement blanked, sealed to the account on other
        // owners' switches or held on a switch of the owner's it did not
        // rewrite (the switches it rewrote announced theirs when taken).
        for (const copy of blanked) {
            if (erasedIds.has(String(copy.switch_id))) continue;
            const record = rowToRecord(wrapPlan, copy);
            wrapMap.set(wrapPlan.descriptor.keyOf(record), record);
            this.transport?.publish({
                src: this.instanceId,
                m: 'deadmanReleaseWraps',
                op: 'u',
                kv: wrapPlan.descriptor.conflictColumns.map((c) => String(copy[c])),
            });
        }
        return rows.length;
    }

    /**
     * The removal pass's blanking of a cancelled release switch's held
     * copies, conditional in Postgres: one call in the switch's lane whose
     * statement blanks the switch's held copies only where the switch
     * Postgres holds is cancelled (round 13 of part 2's review: the pass
     * blanked them through plain writes from this mirror's view, so a stale
     * view could blank the copies of a release that had fired elsewhere).
     * Asked only where this mirror has the switch cancelled with a copy
     * still held, so a pass costs no statement for a switch with nothing
     * left; and not sent while a switch statement stands unanswered on this
     * process, as the conditional writes are not (round 14: it was, so a
     * stalled database cost the pass one bound per such switch and one call
     * queued against it a tick). Where nothing was blanked, the switch and
     * its copies are read in the same call: Postgres's copies replace this
     * mirror's, so a view whose copies were behind (their change
     * notifications missed) stops asking at the next pass (round 14: it sent
     * the statement again every pass, for ever), and where Postgres has the
     * switch otherwise this mirror's view of it was behind and Postgres's row
     * is taken. Bounded as a switch statement is, without opening a stall:
     * one not answered in time is taken when it lands, and the pass goes on.
     *
     * Where it blanked a copy, the switch itself is announced with the
     * copies (round 22 of part 2's review). Copies still held on a switch
     * Postgres has cancelled are what a cancel leaves that the database
     * carried out with no process blanking them after it: the process that
     * sent it was answered 503 and, where the database began the cancel
     * only after that process's read back and its carry of the refused
     * attempt, still holds the switch armed (round 21's stated limit). In
     * the deployed layout that process runs no sweep, so nothing there
     * comes back to the switch, and the pass of the process that does,
     * which has read the switch cancelled, sent it nothing about the row:
     * it showed the switch armed, with its content, in the owner's list and
     * export, past the deadline, until the owner's next check-in or cancel
     * there or its own restart. The announcement has it read the row.
     */
    override async blankCopiesOfCancelledSwitch(switchId: string): Promise<number> {
        const plan = this.plans.get('deadmanSwitches');
        const wrapPlan = this.plans.get('deadmanReleaseWraps');
        const queue = this.queue;
        if (!this.pool || !plan || !wrapPlan || !queue) {
            return super.blankCopiesOfCancelledSwitch(switchId);
        }
        if (this.getDeadmanSwitch(switchId)?.status !== 'cancelled') return 0;
        if (
            !this.listDeadmanReleaseWraps(switchId).some(
                (wrap) => wrap.sealedKey !== '' || wrap.signature !== ''
            )
        ) {
            return 0;
        }
        // The database is not answering this process's switch statements:
        // nothing more is sent it, as for the conditional writes.
        if (this.stalledSwitchStatement) return 0;
        const table = plan.descriptor.tableName;
        const wrapTable = wrapPlan.descriptor.tableName;
        const updatedAt = nowIso();
        const seen = this.mapByName('deadmanSwitches').get(switchId);
        const call = queue
            .enqueueCall(
                async (client) => {
                    const blanked = (
                        await client.query<Record<string, unknown>>(
                            `UPDATE ${wrapTable} SET sealed_key = '', signature = '', ` +
                                'updated_at = $2::timestamptz ' +
                                "WHERE switch_id = $1 AND (sealed_key <> '' OR signature <> '') " +
                                `AND EXISTS (SELECT 1 FROM ${table} WHERE id = $1 AND status = 'cancelled') ` +
                                'RETURNING *',
                            [switchId, updatedAt]
                        )
                    ).rows;
                    if (blanked.length > 0) return { blanked, row: undefined, copies: undefined };
                    // Nothing to blank there: the switch and its copies as
                    // Postgres has them, so this mirror's view is set right.
                    const row = (
                        await client.query<Record<string, unknown>>(
                            `SELECT * FROM ${table} WHERE id = $1`,
                            [switchId]
                        )
                    ).rows[0];
                    const copies = (
                        await client.query<Record<string, unknown>>(
                            `SELECT * FROM ${wrapTable} WHERE switch_id = $1`,
                            [switchId]
                        )
                    ).rows;
                    return { blanked, row, copies };
                },
                { mapName: 'deadmanSwitches', key: switchId }
            )
            .then(({ blanked, row, copies }) => {
                const wrapMap = this.mapByName('deadmanReleaseWraps');
                for (const copy of blanked) {
                    const record = rowToRecord(wrapPlan, copy);
                    wrapMap.set(wrapPlan.descriptor.keyOf(record), record);
                    this.transport?.publish({
                        src: this.instanceId,
                        m: 'deadmanReleaseWraps',
                        op: 'u',
                        kv: wrapPlan.descriptor.conflictColumns.map((c) => String(copy[c])),
                    });
                }
                if (copies) {
                    // Postgres's copies replace this mirror's; nothing changed
                    // there, so nothing is announced.
                    let refreshed = 0;
                    for (const copy of copies) {
                        const record = rowToRecord(wrapPlan, copy);
                        const key = wrapPlan.descriptor.keyOf(record);
                        const had = wrapMap.get(key);
                        if (
                            had?.sealedKey !== record.sealedKey ||
                            had?.signature !== record.signature
                        ) {
                            refreshed += 1;
                        }
                        wrapMap.set(key, record);
                    }
                    if (refreshed > 0) {
                        log.info('deadman_cancelled_copies_view_refreshed', { copies: refreshed });
                    }
                }
                if (row && row.status !== 'cancelled') {
                    log.warn('deadman_cancelled_view_behind', { status: row.status });
                    const map = this.mapByName('deadmanSwitches');
                    if (map.get(switchId) === seen && !this.switchWritesInFlight.has(switchId)) {
                        map.set(switchId, rowToRecord(plan, row));
                        this.transport?.publish({
                            src: this.instanceId,
                            m: 'deadmanSwitches',
                            op: 'u',
                            kv: [switchId],
                        });
                    }
                }
                if (blanked.length > 0) {
                    // The switch too, not only its copies: a process that
                    // still holds it armed refreshes it from this (it sent
                    // the cancel, and the database carried that out only
                    // after that process's reads of the switch), where the
                    // copies' announcements alone would leave its row as it
                    // was.
                    this.transport?.publish({
                        src: this.instanceId,
                        m: 'deadmanSwitches',
                        op: 'u',
                        kv: [switchId],
                    });
                    log.info('deadman_cancelled_switch_copies_blanked', { copies: blanked.length });
                }
                return blanked.length;
            });
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
            const answer = await Promise.race([
                call,
                new Promise<'timeout'>((resolve) => {
                    timer = setTimeout(() => resolve('timeout'), this.switchStatementTimeoutMs);
                }),
            ]);
            if (answer !== 'timeout') return answer;
            log.warn('deadman_cancelled_copies_blank_unanswered', {});
            call.catch(() => undefined);
            return 0;
        } catch (err) {
            log.warn('deadman_cancelled_copies_blank_failed', {
                error: err instanceof Error ? err.message : String(err),
            });
            return 0;
        } finally {
            clearTimeout(timer);
        }
    }

    /**
     * The notifier's claim on one person's notices, in the database: one
     * statement that inserts the person's row in `deadman_notice_claims`, or
     * takes it over where the claim there has expired, `RETURNING` it, with
     * the expiry in the database's own clock, so the processes' clocks do not
     * matter. No transaction is held open: the claim is the row, and it
     * expires `leaseMs` after it was taken, so a process that stops with it
     * holds it no longer than that. `false` when another holder's claim has
     * not expired.
     */
    override async claimDeadmanNoticeRecipient(
        recipientAccountId: string,
        holder: string,
        leaseMs: number
    ): Promise<boolean> {
        if (!this.pool || !this.plans.has('deadmanReleaseNotices')) {
            return super.claimDeadmanNoticeRecipient(recipientAccountId, holder, leaseMs);
        }
        const client = await this.pool.connect();
        try {
            const res = await client.query<Record<string, unknown>>(
                'INSERT INTO deadman_notice_claims (recipient_account_id, holder, expires_at) ' +
                    "VALUES ($1, $2, now() + $3::integer * interval '1 millisecond') " +
                    'ON CONFLICT (recipient_account_id) DO UPDATE ' +
                    'SET holder = EXCLUDED.holder, expires_at = EXCLUDED.expires_at ' +
                    'WHERE deadman_notice_claims.expires_at <= now() ' +
                    'RETURNING holder',
                [recipientAccountId, holder, Math.max(1, Math.round(leaseMs))]
            );
            return res.rows.length > 0 && res.rows[0].holder === holder;
        } finally {
            client.release?.();
        }
    }

    /**
     * Give up a claim, once this process's writes for the attempt (the row's
     * end among them) have been attempted, so the next holder reads them in
     * Postgres: the row is deleted where this holder still has it.
     */
    override async releaseDeadmanNoticeRecipient(
        recipientAccountId: string,
        holder: string
    ): Promise<void> {
        if (!this.pool || !this.plans.has('deadmanReleaseNotices')) return;
        await this.drainWrites();
        const client = await this.pool.connect();
        try {
            await client.query(
                'DELETE FROM deadman_notice_claims WHERE recipient_account_id = $1 AND holder = $2',
                [recipientAccountId, holder]
            );
        } finally {
            client.release?.();
        }
    }

    /**
     * The Postgres writer silently skips a record field that has no column, so
     * `sessionExpiresAt` survives a restart only with migration 100's
     * `refresh_tokens.session_expires_at`. Read from the columns found at
     * `init`; false before it.
     */
    override persistsRefreshTokenSessionEnds(): boolean {
        return this.plans.get('refreshTokens')?.columnNames.has('session_expires_at') ?? false;
    }

    /**
     * Await this process's writes only: every op queued so far has run
     * (committed, or failed after its retry and been counted), the switch
     * statements in their lanes included, and so have a queued erase's retry
     * and read-back, a try of the carry and the reads that follow one, and
     * the read back of a switch statement that landed or failed while this
     * waited, with the writes its take queued. Mirror
     * refreshes still on the apply chain (a peer's change, a table reload,
     * the rehydrate after a reconnect) are not waited for; they are reads,
     * not durability. flushRuntimeStoreWrites uses this, and so do the
     * statements here that must run after this process's own queued writes.
     * Does NOT close the change subscription, so it is safe to call
     * repeatedly.
     */
    async drainWrites(): Promise<void> {
        await this.queue?.drain();
        // A queued erase's retry and read-back are queued only once its first
        // attempt has failed, after the queue's drain may have ended: wait for
        // them too, and for whatever they queued.
        while (this.queuedErases.size > 0) {
            await Promise.allSettled([...this.queuedErases]);
            await this.queue?.drain();
        }
        // A try of the carry under way (it is outside the queue since round
        // 16), and one it started again on its way out; each is bounded.
        while (this.carryPass) await this.carryPass;
        while (this.columnConfirmPass) await this.columnConfirmPass;
        // A statement that landed or failed while this waited has its read
        // back queued in its lane only then (round 20): that read, and the
        // writes its take queued. One that fails is read again below.
        while (this.settleLaneReads.size > 0) {
            await Promise.allSettled([...this.settleLaneReads]);
            await this.queue?.drain();
        }
        // A read again of a failed settle under way (round 19), each try
        // bounded, and the writes its take queued (a cancelled switch's
        // copies blanked).
        if (this.settleRetryPass) {
            while (this.settleRetryPass) await this.settleRetryPass;
            await this.queue?.drain();
        }
    }

    /**
     * Flush this process's writes (`drainWrites`), then the mirror refreshes
     * queued so far (including the re-reads those writes asked for, and any
     * peer change, reload or rehydrate already on the apply chain). For
     * shutdown, tests and the account deletion's wait; a request path that
     * needs durability alone calls drainWrites. Does NOT close the change
     * subscription.
     */
    override async drain(): Promise<void> {
        await this.drainWrites();
        await this.applyTail;
    }

    /**
     * Flush queued writes and tear down the change subscription — graceful
     * shutdown only. Refused owner writes not yet carried, and settles whose
     * read back had failed and were waiting to be read again when this
     * began, get one last try, waited for; a switch statement that lands or
     * fails while this drains has its read back in the switch's lane waited
     * for too, with the writes its take queues, and where that read fails,
     * one read again (`drainWrites`; round 20 of part 2's review: this
     * returned as soon as such a statement had landed, its read back still
     * out). No retry timer is set after it. A lane read that never answers
     * holds this until the process's forced exit, as a statement that never
     * answers does.
     */
    async shutdown(): Promise<void> {
        // A re-hydrate retry still pending does nothing once stopped.
        this.stopped = true;
        this.carryStopped = true;
        if (this.carryRetryTimer) clearTimeout(this.carryRetryTimer);
        this.carryRetryTimer = null;
        if (this.columnConfirmTimer) clearTimeout(this.columnConfirmTimer);
        this.columnConfirmTimer = null;
        this.carryRefusedOwnerWrites();
        // A settle waiting to be read again is (a timer of its is set only
        // while one waits and no try is under way, and the try ends it).
        this.retrySettleReads();
        await this.drain();
        await this.transport?.close();
    }
}

export const db =
    DB_MODE === 'memory'
        ? new InMemoryDb()
        : DB_MODE === 'postgres'
        ? new PostgresBackedDb()
        : new FileBackedDb();

/**
 * Hydrate + arm the Postgres store (no-op unless BLACKOUT_DB_MODE=postgres).
 * Cross-replica cache invalidation via Postgres LISTEN/NOTIFY is on by default;
 * set BLACKOUT_DB_PG_NOTIFY=0 to disable (e.g. a known single-instance deploy).
 */
export async function initRuntimeStore(pool: PgPool): Promise<void> {
    if (!(db instanceof PostgresBackedDb)) return;
    const transport =
        process.env.BLACKOUT_DB_PG_NOTIFY === '0'
            ? undefined
            : new PgNotifyTransport(
                  pool as unknown as ConstructorParameters<typeof PgNotifyTransport>[0]
              );
    await db.init(pool, transport);
}

/** Flush write-behind ops + close the change subscription on graceful shutdown. */
export async function drainRuntimeStore(): Promise<void> {
    if (db instanceof PostgresBackedDb) await db.shutdown();
}

/**
 * Await durability of all currently-queued write-behind ops WITHOUT tearing
 * down the change subscription. Critical request paths (e.g. payment capture,
 * entitlement grants) can call this after their mutation and before acking, so
 * a crash cannot lose a financially- or security-significant write that the
 * synchronous mutator API only wrote to the in-memory mirror. No-op unless
 * BLACKOUT_DB_MODE=postgres.
 */
export async function flushRuntimeStoreWrites(): Promise<void> {
    if (db instanceof PostgresBackedDb) await db.drainWrites();
}

/** Runtime store mode, for boot wiring. */
export const RUNTIME_DB_MODE = DB_MODE;
