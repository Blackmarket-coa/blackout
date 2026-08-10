/**
 * Ledger export — deliberately a separate module from the Matrix-native and
 * social-graph collectors.
 *
 * These are different systems with different data models, and conflating them
 * would produce an export that quietly lies about provenance. Two things a
 * reader needs to know up front:
 *
 * 1. **Blackout does not own the balances.** Coalition Credits live in the
 *    external Free Black Market (FBM) service, which Blackout reads through a
 *    read-only client (`integrations/fbm/entitlementsContract.ts` exposes no
 *    mutators). If FBM is not configured on a deployment, there is no balance to
 *    export and this reports `available: false` rather than inventing a zero.
 *
 * 2. **There is no "hawala ledger", KARMA, or HRS in this codebase.** Those
 *    terms appear in design documents; a prior audit
 *    (`docs/audits/competitor_depth_analysis_verification_2026_07.md:26`) states
 *    plainly that the hawala ledger "is a docs-only concept", and `KARMA`/`HRS`
 *    have no implementation at all. `GIFT` exists but is a paid tip SKU
 *    (`services/gifts.ts`), not a ledger unit. Exporting fields under those
 *    names would be fabrication, so this module exports what actually exists:
 *    the locally-held point/credit records, plus the FBM balance when reachable.
 */

import { db } from '../../db/store';
import type { TipRecord } from '../../db/types';
import { getEntitlementsClient } from '../../integrations/fbm/entitlementsClientFactory';
import { log } from '../../telemetry/logger';

/** Coalition Credits currency code, per the FBM entitlements contract. */
const COALITION_CREDITS_CURRENCY = 'CC';

/**
 * Same identity bridge the profile/follows/credits surfaces use: a Blackout
 * username is the MXID localpart on the configured homeserver.
 */
const matrixUserIdFor = (username: string): string => {
    const domain = (process.env.MATRIX_HOMESERVER_DOMAIN ?? 'blackout.local').replace(/^@+/, '');
    return `@${username}:${domain}`;
};

export interface ExternalLedgerStanding {
    /**
     * False when FBM is not configured on this deployment, or the call failed.
     * The distinction matters for an export: absent data must not read as "you
     * have nothing".
     */
    available: boolean;
    reason?: 'not_configured' | 'unavailable';
    balanceMinorUnits?: number;
    currency?: string;
    pendingPayouts?: Array<{
        currency: string;
        amountMinorUnits: number;
        expectedSettlementAt: string | null;
    }>;
}

export interface LedgerTip {
    id: string;
    grossCents: number;
    feeCents: number;
    netCents: number;
    currency: string;
    /** Gifts are modelled as single-shot tips carrying a SKU, not as a ledger unit. */
    giftSku: string | null;
    status: string;
    createdAt: string;
}

export interface LedgerExport {
    /**
     * Held by the external FBM service, not by Blackout. Read-through, so this
     * is a snapshot at export time rather than an authoritative record.
     */
    external: ExternalLedgerStanding;
    /** Ledger-shaped records Blackout does hold locally. */
    local: {
        reputationEvents: Array<{
            id: string;
            type: string;
            subject?: string;
            points: number;
            createdAt: string;
        }>;
        migrationCredits: Array<{
            id: string;
            valueCents: number;
            currency: string;
            redeemedAt: string | null;
            createdAt: string;
        }>;
        tipsSent: LedgerTip[];
        tipsReceived: LedgerTip[];
    };
    /**
     * Stated in the payload itself, not just in documentation, so an export
     * read in isolation still explains what it does and does not contain.
     */
    notes: string[];
}

const LEDGER_NOTES = [
    'Coalition Credit balances are held by the external Free Black Market service, not by Blackout. The `external` section is a read-through snapshot taken when this export was generated.',
    'Blackout has no "hawala ledger", KARMA, or HRS balance. Those names appear in design documents but have no implementation, so no such fields are exported.',
    'Amounts are in minor units (cents) and are not converted between currencies.',
];

/**
 * Collect the ledger slice for a user. Never throws: an FBM outage degrades the
 * ledger section to `available: false` rather than failing the whole export, so
 * a user can still retrieve everything else.
 */
export async function collectLedgerExport(userId: string, username: string): Promise<LedgerExport> {
    const local: LedgerExport['local'] = {
        reputationEvents: db
            .listReputationEvents()
            .filter((row) => row.userId === userId)
            .map((row) => ({
                id: row.id,
                type: row.type,
                subject: row.subject,
                // `points` is optional on the record; absent means the event
                // carried no score, which exports as 0 rather than undefined.
                points: row.points ?? 0,
                createdAt: row.createdAt,
            })),
        migrationCredits: db.listMigrationCreditsByUser(userId).map((row) => ({
            id: row.id,
            valueCents: row.valueCents,
            currency: row.currency,
            redeemedAt: row.redeemedAt ?? null,
            createdAt: row.createdAt,
        })),
        tipsSent: db.listTipsBySender(userId, Number.MAX_SAFE_INTEGER).map(toTip),
        tipsReceived: db.listTipsByRecipient(userId, Number.MAX_SAFE_INTEGER).map(toTip),
    };

    return {
        external: await collectExternalStanding(username),
        local,
        notes: LEDGER_NOTES,
    };
}

const toTip = (row: TipRecord): LedgerTip => ({
    id: row.id,
    grossCents: row.grossCents,
    feeCents: row.feeCents,
    netCents: row.netCents,
    currency: row.currency,
    giftSku: row.giftSku,
    status: row.status,
    createdAt: row.createdAt,
});

async function collectExternalStanding(username: string): Promise<ExternalLedgerStanding> {
    const client = getEntitlementsClient();
    if (!client) return { available: false, reason: 'not_configured' };

    try {
        const summary = await client.getSummary(matrixUserIdFor(username));
        const standing = summary.economicStanding;
        return {
            available: true,
            balanceMinorUnits: standing.coalitionCreditsBalanceMinorUnits,
            currency: COALITION_CREDITS_CURRENCY,
            pendingPayouts: standing.pendingPayouts.map((payout) => ({
                currency: payout.currency,
                amountMinorUnits: payout.amountMinorUnits,
                expectedSettlementAt: payout.expectedSettlementAt,
            })),
        };
    } catch (error) {
        // Degrade rather than fail: the rest of the export is still worth
        // delivering, and `available: false` is honest about the gap.
        log.warn('data_export.ledger_unavailable', { error: String(error) });
        return { available: false, reason: 'unavailable' };
    }
}
