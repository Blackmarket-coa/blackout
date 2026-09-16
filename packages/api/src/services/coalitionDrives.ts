/**
 * Coalition drives: the money leg of a campaign.
 *
 * A contribution is a **tip** — the same primitive tips, gifts and project
 * support already use — so it inherits the flat 3% split computed by
 * `computePlatformCommission`, the capture/refund state machine, the ledger
 * export and the FBM webhook return path. Nothing here opens a second payment
 * rail: Blackout records the obligation, FBM is merchant of record, and the
 * money only moves when FBM's `purchase.succeeded` webhook echoes back the
 * `metadata.tipId` we sent it.
 *
 * Commission is deliberately NOT parameterised. Every coalition, every tier
 * and every size pays the same flat rate the rest of the ecosystem pays; the
 * rate lives in `@blackout/core` `marketplaceProviderFees` and is asserted
 * here so a future edit that tries to vary it fails loudly rather than
 * quietly tiering a trust signal.
 */
import {
    allocatePayeeCents,
    computePlatformCommission,
    marketplaceProviderFees,
    type MarketplaceProviderId,
} from '@blackout/core';
import { db } from '../db/store';
import type { CoalitionCampaignRecord, CoalitionCampaignContributionRecord } from '../db/types';
import { emitDomainEvent } from '../modules/domain-events';
import { incrementCounter, logEvent } from './marketplaceObservability';
import { awardCoalitionKarma } from './coalitionReputation';
import { getMarketplaceProvider } from '../integrations/marketplace';
import { createTip, type TipView } from './tips';

const NOW_ISO = () => new Date().toISOString();
const rand = () => Math.random().toString(36).slice(2, 10);

export const newContributionId = (): string => `coac_${rand()}_${Date.now().toString(36)}`;

/**
 * The standard rate for every coalition, and the ceiling.
 *
 * A seller who pays for an FBM plan is charged less than this, and coalition
 * contributions should show and keep the rate actually charged rather than
 * asserting 3% while the marketplace bills 2%. What stays fixed is the
 * direction: nothing may push a coalition ABOVE this, and nothing tiers it by
 * coalition size or KARMA — a discount is bought with a subscription the seller
 * already pays for, not earned by the coalition's standing.
 */
export const COALITION_COMMISSION_BPS = 300;

const DEFAULT_PROVIDER: MarketplaceProviderId = 'freeblackmarket';

/**
 * Guard the invariant at the point of use: if the shared fee table ever rises
 * above the standard 3%, coalition contributions stop rather than silently
 * charging more than the product promises. A table that sits BELOW the ceiling
 * is fine — that is the whole point of the plan ladder.
 */
export function assertFlatCommission(providerId: MarketplaceProviderId = DEFAULT_PROVIDER): void {
    const bps = marketplaceProviderFees[providerId]?.feeBps;
    if (typeof bps !== 'number' || bps > COALITION_COMMISSION_BPS) {
        throw new Error(
            `coalition commission must not exceed ${COALITION_COMMISSION_BPS} bps (provider ${providerId} is ${String(
                bps
            )})`
        );
    }
}

/** Is a quoted rate one we are willing to charge a contributor? */
export function commissionWithinCeiling(bps: unknown): bps is number {
    return (
        typeof bps === 'number' &&
        Number.isInteger(bps) &&
        bps >= 0 &&
        bps <= COALITION_COMMISSION_BPS
    );
}

export interface ContributionSplit {
    grossCents: number;
    feeCents: number;
    netCents: number;
    /** The rate actually applied, so the client shows the real number. */
    feeBps: number;
}

/**
 * Ask the provider what it will really charge on this listing.
 *
 * A quote that cannot be fetched falls back to the standard rate — an outage at
 * FBM must not stop contributions. A quote ABOVE the ceiling returns null, and
 * every caller treats that as "cannot take this money", because clamping the
 * displayed rate down to 3% while FBM charges more would make the split we show
 * a contributor a lie.
 */
export async function quoteCommissionBps(listingId?: string | null): Promise<number | null> {
    if (!listingId) return COALITION_COMMISSION_BPS;
    const provider = getMarketplaceProvider(DEFAULT_PROVIDER);
    if (!provider?.enabled || !provider.getListingFeeBps) return COALITION_COMMISSION_BPS;
    let quoted: number | null = null;
    try {
        quoted = await provider.getListingFeeBps(listingId);
    } catch {
        quoted = null;
    }
    if (quoted === null) return COALITION_COMMISSION_BPS;
    return commissionWithinCeiling(quoted) ? quoted : null;
}

/** Preview the split a contributor will see before they commit. */
export async function previewContribution(
    grossCents: number,
    listingId?: string | null
): Promise<ContributionSplit> {
    assertFlatCommission();
    // A refused quote still has to render a number, and the standard rate is
    // the honest one to show: it is what a contributor would pay if the drive
    // were open. The contribution itself is refused separately.
    const bps = (await quoteCommissionBps(listingId)) ?? COALITION_COMMISSION_BPS;
    const split = computePlatformCommission(grossCents, DEFAULT_PROVIDER, bps);
    return {
        grossCents: split.grossCents,
        feeCents: split.feeCents,
        netCents: split.netCents,
        feeBps: split.feeBps,
    };
}

export interface StartContributionInput {
    campaign: CoalitionCampaignRecord;
    supporterUserId: string;
    /** Whom the money is for; defaults to the campaign's creator. */
    beneficiaryUserId?: string;
    grossCents: number;
    currency?: string;
    note?: string;
    returnUrl?: string;
    /** https origin when the client wants the embedded checkout. */
    embedOrigin?: string;
    embed?: boolean;
}

export interface StartContributionResult {
    /** Null when no checkout could be opened — nothing is recorded in that case. */
    tip: TipView | null;
    split: ContributionSplit;
    redirectUrl: string | null;
    sessionId: string | null;
    embed: boolean;
    /** Set when the checkout leg could not be opened; the tip stays pending. */
    checkoutError?: string;
}

/**
 * Record the pending contribution and open the FBM checkout that will capture
 * it. The idempotency key is derived from the tip id, so a retried click can
 * never double-charge.
 */
export async function startContribution(
    input: StartContributionInput
): Promise<StartContributionResult> {
    assertFlatCommission();

    // Check that a checkout can actually be opened BEFORE recording anything.
    // The previous order wrote the tip first, so every contribution to a drive
    // with no listing behind it left a permanent pending obligation that
    // nothing could ever collect — and the route answered 201 Created for it.
    const provider = getMarketplaceProvider(DEFAULT_PROVIDER);
    if (!provider?.enabled || !input.campaign.fbmListingId) {
        const reason = input.campaign.fbmListingId ? 'provider_unavailable' : 'no_listing';
        incrementCounter('coalition_contribution_unavailable', { reason });
        logEvent('coalition_contribution_unavailable', {
            campaignId: input.campaign.id,
            coalitionId: input.campaign.coalitionId,
            reason,
        });
        return {
            tip: null,
            split: await previewContribution(input.grossCents, input.campaign.fbmListingId),
            redirectUrl: null,
            sessionId: null,
            embed: false,
            checkoutError: reason,
        };
    }

    // What FBM will really charge this listing's seller. Quoted before the tip
    // is written, because the rate is baked into the tip's cents and a tip is
    // the obligation — re-deriving the split later would let the two disagree.
    const feeBps = await quoteCommissionBps(input.campaign.fbmListingId);
    if (feeBps === null) {
        // Above our ceiling. Refuse rather than clamp: showing a contributor a
        // 3% split while the marketplace takes more is the one outcome the flat
        // rate exists to prevent.
        incrementCounter('coalition_contribution_unavailable', {
            reason: 'commission_above_ceiling',
        });
        logEvent('coalition_contribution_unavailable', {
            campaignId: input.campaign.id,
            coalitionId: input.campaign.coalitionId,
            reason: 'commission_above_ceiling',
        });
        return {
            tip: null,
            split: await previewContribution(input.grossCents),
            redirectUrl: null,
            sessionId: null,
            embed: false,
            checkoutError: 'commission_above_ceiling',
        };
    }

    // The person the campaign is for, then the organiser. For a raised
    // mutual-aid campaign that is the neighbour who asked, not the member who
    // raised it on their behalf.
    const beneficiary =
        input.beneficiaryUserId ?? input.campaign.beneficiaryUserId ?? input.campaign.createdBy;
    // A mutual-aid campaign's money belongs to the person who asked, by
    // definition. If none could be derived — a post mirrored from a platform
    // that withholds the requester's id — falling back to the organiser would
    // pay the member who raised it money a contributor meant for a neighbour.
    const unpayableAid = input.campaign.type === 'mutual_aid' && !input.campaign.beneficiaryUserId;
    if (unpayableAid || !db.getUserById(beneficiary)) {
        // A mutual-aid post mirrored in from FBM has no payable author — that
        // projection withholds the requester's id. Refuse rather than quietly
        // paying the organiser money a contributor meant for someone else.
        incrementCounter('coalition_contribution_unavailable', { reason: 'no_beneficiary' });
        logEvent('coalition_contribution_unavailable', {
            campaignId: input.campaign.id,
            coalitionId: input.campaign.coalitionId,
            reason: 'no_beneficiary',
        });
        return {
            tip: null,
            split: await previewContribution(input.grossCents, input.campaign.fbmListingId),
            redirectUrl: null,
            sessionId: null,
            embed: false,
            checkoutError: 'no_beneficiary',
        };
    }
    const tip = createTip({
        senderUserId: input.supporterUserId,
        recipientUserId: beneficiary,
        contextKind: 'coalition_drive',
        contextRef: input.campaign.id,
        grossCents: input.grossCents,
        currency: input.currency ?? 'USD',
        note: input.note ?? null,
        feeBpsOverride: feeBps,
        metadata: {
            coalitionId: input.campaign.coalitionId,
            campaignId: input.campaign.id,
            campaignType: input.campaign.type,
        },
    });
    const split: ContributionSplit = {
        grossCents: tip.grossCents,
        feeCents: tip.feeCents,
        netCents: tip.netCents,
        feeBps,
    };

    const embed = input.embed === true && provider.capabilities.includes('embedded-checkout');
    try {
        const result = await provider.createCheckoutSession({
            userId: input.supporterUserId,
            listingId: input.campaign.fbmListingId,
            idempotencyKey: `coalition-drive:${tip.id}`,
            returnUrl: input.returnUrl,
            embed,
            embedOrigin:
                embed && input.embedOrigin?.startsWith('https://') ? input.embedOrigin : undefined,
            // The bounded echo FBM returns on purchase.succeeded — how the
            // capture finds its way back to this pending row.
            metadata: { tipId: tip.id, campaignId: input.campaign.id },
        });
        incrementCounter('coalition_contribution_started');
        return { tip, split, redirectUrl: result.redirectUrl, sessionId: result.sessionId, embed };
    } catch (error) {
        // A fixed code, never the provider's message: that string carries
        // operator configuration guidance and was being echoed to API callers.
        incrementCounter('coalition_contribution_checkout_failed');
        logEvent('coalition_contribution_checkout_failed', {
            campaignId: input.campaign.id,
            tipId: tip.id,
            error: error instanceof Error ? error.name : 'unknown',
        });
        return {
            tip,
            split,
            redirectUrl: null,
            sessionId: null,
            embed: false,
            checkoutError: 'checkout_unavailable',
        };
    }
}

/**
 * Did anyone other than the organiser actually pay into this campaign?
 *
 * A contribution row exists only because `captureTip` ran, so this reads
 * "money was captured for this campaign" — the one fact about a campaign that
 * Blackout observed rather than was told. The organiser's own contributions do
 * not count: once a campaign can name its own beneficiary and split, paying
 * yourself would otherwise satisfy your own completion award.
 */
export function campaignHasCapturedContributions(
    campaignId: string,
    excludeUserId?: string
): boolean {
    return db
        .listCoalitionCampaignContributions({ campaignId })
        .some((row) => row.supporterUserId !== excludeUserId);
}

export interface RecordContributionInput {
    campaignId: string;
    supporterUserId: string;
    tipId: string;
    amountCents: number;
    currency: string;
}

/**
 * Advance a campaign's progress on capture. Idempotent on the tip id: a
 * replayed webhook returns the existing row and leaves the totals alone.
 * Called from `captureTip`, never from a route.
 */
export function recordContribution(
    input: RecordContributionInput
): { campaign: CoalitionCampaignRecord; contribution: CoalitionCampaignContributionRecord } | null {
    const campaign = db.getCoalitionCampaign(input.campaignId);
    if (!campaign) return null;

    const existing = db.findCoalitionCampaignContributionByTip(input.tipId);
    if (existing) return { campaign, contribution: existing };

    const contribution = db.upsertCoalitionCampaignContribution({
        id: newContributionId(),
        campaignId: campaign.id,
        coalitionId: campaign.coalitionId,
        supporterUserId: input.supporterUserId,
        tipId: input.tipId,
        amountCents: input.amountCents,
        currency: input.currency,
    });

    const priorSupporters = new Set(
        db
            .listCoalitionCampaignContributions({ campaignId: campaign.id })
            .filter((row) => row.id !== contribution.id)
            .map((row) => row.supporterUserId)
    );
    const updated = db.upsertCoalitionCampaign({
        ...campaign,
        raisedCents: campaign.raisedCents + input.amountCents,
        contributorCount: priorSupporters.has(input.supporterUserId)
            ? campaign.contributorCount
            : campaign.contributorCount + 1,
    });

    // Flat, regardless of the amount. A $5 contributor and a $5,000 contributor
    // earn the same 5 KARMA, because scaling reputation with dollars is the
    // rebate pattern that `progression/thresholds.ts` requires stay out of the
    // ladder. Keyed on the tip id, so the capture webhook replaying is safe.
    void awardCoalitionKarma({
        eventType: 'drive_contributed',
        blackoutUserId: input.supporterUserId,
        coalitionId: campaign.coalitionId,
        referenceId: input.tipId,
    });

    // Freeze the division in CENTS at capture, not basis points at settlement.
    // The shares can be re-set later, and a payout computed from whatever the
    // list says next week would not match what the contributor paid into.
    //
    // This stays one payment. Splitting into one tip per payee would mean one
    // card charge per payee for a single contributor, and nobody completes
    // three redirects — so Blackout records the instruction and FBM, which
    // already settles multi-party orders, fans it out.
    const payees = db
        .listCoalitionCampaignPayees({ campaignId: campaign.id })
        .filter((row) => row.active);
    const allocation = allocatePayeeCents(input.amountCents, payees);

    emitDomainEvent({
        module: 'coalitions',
        type: 'coalition.campaign.contribution.recorded',
        payload: {
            coalitionId: campaign.coalitionId,
            campaignId: campaign.id,
            supporterUserId: input.supporterUserId,
            tipId: input.tipId,
            amountCents: input.amountCents,
            raisedCents: updated.raisedCents,
            beneficiaryUserId: campaign.beneficiaryUserId ?? campaign.createdBy,
            ...(allocation.length > 0 ? { allocation } : {}),
        },
    });

    // Goal reached: announce it once, on the crossing.
    if (
        updated.goalCents &&
        updated.raisedCents >= updated.goalCents &&
        campaign.raisedCents < updated.goalCents
    ) {
        emitDomainEvent({
            module: 'coalitions',
            type: 'coalition.campaign.goal.reached',
            payload: {
                coalitionId: campaign.coalitionId,
                campaignId: campaign.id,
                goalCents: updated.goalCents,
                raisedCents: updated.raisedCents,
                reachedAt: NOW_ISO(),
            },
        });
    }

    return { campaign: updated, contribution };
}

export interface ContributionView {
    supporterUserId: string;
    amountCents: number;
    currency: string;
    createdAt: string;
}

/** The supporter wall for a campaign, newest first. */
export function listContributions(campaignId: string): ContributionView[] {
    return db
        .listCoalitionCampaignContributions({ campaignId })
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((row) => ({
            supporterUserId: row.supporterUserId,
            amountCents: row.amountCents,
            currency: row.currency,
            createdAt: row.createdAt,
        }));
}
