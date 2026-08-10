/**
 * Self-service data export.
 *
 * One request returns everything the server holds for the calling user, in
 * portable JSON, free at every tier. It exists because Blackout intends to make
 * a public data-portability claim, and the only export that existed
 * (`GET /v1/transparency/audit-export`) returned HTTP 402 below the Coalition
 * tier — a paywalled export cannot back that claim.
 *
 * ## Three domains, kept separate
 *
 * The payload is split by *system of record*, not flattened, because the three
 * have genuinely different data models and different guarantees:
 *
 * - `account`  — Blackout's own DB (reuses `exportUserData`, the existing
 *                GDPR/DSAR export, so the two never drift apart).
 * - `socialGraph` — connections. Partly process-memory, and says so.
 * - `ledger`   — mostly *not Blackout's data*: Coalition Credit balances live in
 *                the external FBM service and are read through.
 *
 * ## What is deliberately absent: your messages
 *
 * This export does **not** contain the contents of your encrypted rooms, and
 * that is the system working rather than a gap to apologize for. The server
 * cannot read them — it holds ciphertext and no keys, which is the whole point
 * of the encryption claim. An export produced server-side that *did* contain
 * your message history would be evidence against that claim.
 *
 * Matrix history export belongs in the client, which has the keys. Synapse's own
 * `admin_cmd export-data` is vendored in `apps/blackout-server` but is an
 * operator CLI, and for encrypted rooms it would only ever emit ciphertext.
 * `manifest.matrixHistory` states this in the payload so a user reading the file
 * alone is not left wondering where their messages went.
 *
 * ## Why synchronous
 *
 * Every table is mirrored in process memory (`db/store.ts`), so collection is a
 * Map scan rather than a query, and the response is built in one pass. A job
 * table plus a background runner would add schema, a leader-elected loop, and
 * somewhere to store generated artifacts — real risk against a stack with prior
 * migration incidents — to solve a cost this shape does not yet have. The
 * collector split below is what makes that reversible: moving a collector behind
 * a job queue later does not change the response shape.
 *
 * The honest limit: this is O(rows in the largest scanned table) per call, held
 * in memory. `exportRateLimit` on the route bounds the blast radius. If the
 * store moves off the in-memory mirror, revisit this.
 */

import { exportUserData, type AccountExport } from '../accountLifecycle';
import { collectLedgerExport, type LedgerExport } from './ledgerExport';
import { collectSocialGraphExport, type SocialGraphExport } from './socialGraphExport';

/** Bump when a field is removed or its meaning changes; additions do not. */
export const DATA_EXPORT_SCHEMA = 'blackout.data-export.v1';

export interface DataExportManifest {
    schema: typeof DATA_EXPORT_SCHEMA;
    generatedAt: string;
    userId: string;
    /**
     * Says plainly what this file does not contain and where to get it, so the
     * export is self-describing when read outside the product.
     */
    matrixHistory: {
        included: false;
        reason: string;
        howToExport: string;
    };
    /** What was deliberately withheld, and why. */
    excluded: string[];
}

export interface DataExport {
    manifest: DataExportManifest;
    account: AccountExport;
    socialGraph: SocialGraphExport;
    ledger: LedgerExport;
}

const MATRIX_HISTORY_REASON =
    'Your messages are end-to-end encrypted. The server stores them as ciphertext and does not hold the keys, so it cannot include their contents in an export it generates. That is the encryption guarantee working as intended — a server-side export containing your message history would mean the server could read it.';

const MATRIX_HISTORY_HOW =
    "Export encrypted room history from a signed-in client, which holds your keys: Settings → Encryption → Export room keys, or use your client's room-export feature.";

const EXCLUDED = [
    'Password hash and authentication credentials.',
    'OAuth tokens and API keys for linked integrations (Twitch, YouTube, Discord, OBS). These are credentials, not your data, and exporting them would turn a portability feature into a credential dump.',
    'Vault item ciphertext keys and canary tokens.',
    "Other users' personal data in shared records — follower identities and invitation redeemers are counted rather than listed.",
];

/**
 * Build the full export for a user. Returns null when the user does not exist.
 *
 * Async only because the ledger section reads through to FBM; that call
 * degrades internally rather than throwing, so a partial outage still yields a
 * complete file with an honest `available: false`.
 */
export async function buildDataExport(
    userId: string,
    username: string
): Promise<DataExport | null> {
    const account = exportUserData(userId);
    if (!account) return null;

    const [socialGraph, ledger] = [
        collectSocialGraphExport(userId),
        await collectLedgerExport(userId, username),
    ];

    return {
        manifest: {
            schema: DATA_EXPORT_SCHEMA,
            generatedAt: new Date().toISOString(),
            userId,
            matrixHistory: {
                included: false,
                reason: MATRIX_HISTORY_REASON,
                howToExport: MATRIX_HISTORY_HOW,
            },
            excluded: EXCLUDED,
        },
        account,
        socialGraph,
        ledger,
    };
}

/** Suggested filename for a downloaded export. */
export const dataExportFilename = (userId: string, generatedAt: string): string =>
    `blackout-export-${userId}-${generatedAt}.json`;
