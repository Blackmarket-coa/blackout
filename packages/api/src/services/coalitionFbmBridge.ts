// Blackout → FBM, for the two things FBM cannot derive on its own.
//
// FBM owns commerce and reputation; Blackout owns coalitions. So the coalition
// facts FBM needs — how a coalition's drives are going, and that a goods drive
// wants a shared ordering window — are pushed from here rather than reached for
// from there. That keeps the coalition tables single-writer and means an FBM
// outage costs a refresh, not a coalition.
//
// Both pushes are fire-and-forget and idempotent by construction:
//
//  - Milestones are PUT as ABSOLUTE TOTALS, never increments. Blackout can
//    always recompute the true count from its own rows, so a lost or duplicated
//    delivery self-heals on the next push; an increment API would drift
//    permanently on a single retry.
//  - The order window is keyed on the campaign id, which FBM holds under a
//    unique index, so a retried launch re-uses the window it already opened.
//
// Counts and cents only. Who gave what stays on Blackout: FBM needs the shape
// of a coalition's effort to open a quest gate, not its members' giving history.

import { db } from '../db/store';
import type { CoalitionCampaignRecord } from '../db/types';
import { incrementCounter, logEvent } from './marketplaceObservability';

const TIMEOUT_MS = 4_000;

type FetchImpl = typeof fetch;
let fetchImpl: FetchImpl | undefined;

/** Test seam: swap the transport without standing up an FBM instance. */
export function __setBridgeFetchForTests(impl: FetchImpl | undefined): void {
    fetchImpl = impl;
}

interface Target {
    baseUrl: string;
    serviceToken: string;
}

function target(env = process.env): Target | null {
    const baseUrl = env.FBM_ENTITLEMENTS_BASE_URL;
    const serviceToken = env.FBM_ENTITLEMENTS_SERVICE_TOKEN;
    if (!baseUrl || !serviceToken) return null;
    return { baseUrl: baseUrl.replace(/\/+$/, ''), serviceToken };
}

async function send(
    url: string,
    method: 'POST' | 'PUT',
    body: unknown,
    serviceToken: string,
    counter: string
): Promise<Record<string, unknown> | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
        const res = await (fetchImpl ?? fetch)(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${serviceToken}`,
            },
            body: JSON.stringify(body),
            signal: controller.signal,
        });
        if (!res.ok) {
            // 404 is the ordinary case of a coalition with no FBM cooperative
            // behind it, so it is counted separately from a real failure.
            incrementCounter(res.status === 404 ? `${counter}_unlinked` : `${counter}_rejected`);
            return null;
        }
        incrementCounter(`${counter}_ok`);
        // A body that is not JSON is not a failure of the push itself; the
        // write landed, we just have nothing to read back from it.
        return (await res.json().catch(() => null)) as Record<string, unknown> | null;
    } catch (error) {
        incrementCounter(`${counter}_failed`);
        logEvent(`${counter}_failed`, {
            error: error instanceof Error ? error.name : 'unknown',
        });
        return null;
    } finally {
        clearTimeout(timer);
    }
}

export interface CoalitionMilestones {
    drivesCompleted: number;
    contributingMembers: number;
    raisedCents: number;
}

/**
 * The coalition's joint-drive totals, recomputed from its own rows. Only
 * COMPLETED drives count: an open drive is an intention, and a quest gate that
 * opened on intentions would be worth nothing.
 */
export function computeCoalitionMilestones(coalitionId: string): CoalitionMilestones {
    const campaigns = db.listCoalitionCampaigns({ coalitionId });
    const completed = campaigns.filter(
        (row) => row.status === 'completed' && (row.type === 'drive' || row.type === 'goods_drive')
    );
    const completedIds = new Set(completed.map((row) => row.id));
    const contributions = db
        .listCoalitionCampaignContributions({ coalitionId })
        .filter((row) => completedIds.has(row.campaignId));
    return {
        drivesCompleted: completed.length,
        contributingMembers: new Set(contributions.map((row) => row.supporterUserId)).size,
        raisedCents: contributions.reduce((sum, row) => sum + row.amountCents, 0),
    };
}

/** Push the coalition's current totals. Safe to call on every drive close. */
export async function pushCoalitionMilestones(coalitionId: string): Promise<void> {
    const fbm = target();
    if (!fbm) return;
    const totals = computeCoalitionMilestones(coalitionId);
    await send(
        `${fbm.baseUrl}/v1/integrations/blackout/coalitions/${encodeURIComponent(
            coalitionId
        )}/milestones`,
        'PUT',
        {
            drives_completed: totals.drivesCompleted,
            contributing_members: totals.contributingMembers,
            raised_cents: totals.raisedCents,
        },
        fbm.serviceToken,
        'coalition_milestones'
    );
}

export interface OrderWindowInput {
    campaign: CoalitionCampaignRecord;
    opensAt: string;
    closesAt: string;
    dispatchAt: string;
    pickupLocation?: string;
    pickupInstructions?: string;
}

/**
 * Ask FBM to open the shared batch-ordering window for a goods drive. FBM
 * materialises a participating-producer row and an incoming exchange for every
 * coalition member with a shop — the projection Blackout has no way to write.
 */
export async function openSharedOrderWindow(input: OrderWindowInput): Promise<string | null> {
    const fbm = target();
    if (!fbm) return null;
    const { campaign } = input;
    const body = await send(
        `${fbm.baseUrl}/v1/integrations/blackout/coalitions/${encodeURIComponent(
            campaign.coalitionId
        )}/order-cycles`,
        'POST',
        {
            campaign_id: campaign.id,
            name: campaign.title,
            opens_at: input.opensAt,
            closes_at: input.closesAt,
            dispatch_at: input.dispatchAt,
            ...(input.pickupLocation ? { pickup_location: input.pickupLocation } : {}),
            ...(input.pickupInstructions ? { pickup_instructions: input.pickupInstructions } : {}),
        },
        fbm.serviceToken,
        'coalition_order_window'
    );
    const orderCycleId =
        typeof body?.['order_cycle_id'] === 'string' ? body['order_cycle_id'] : null;
    if (!orderCycleId) return null;
    // Persist the link so the coalition page can send members to the window,
    // and re-read the campaign first: the push is async and the campaign may
    // have moved on while it was in flight.
    const current = db.getCoalitionCampaign(campaign.id);
    if (current && current.fbmOrderCycleId !== orderCycleId) {
        db.upsertCoalitionCampaign({ ...current, fbmOrderCycleId: orderCycleId });
    }
    return orderCycleId;
}

/**
 * Open the window for a goods drive that has just gone live, deriving the
 * window from the campaign's own dates. A goods drive with no end date gets no
 * window: an ordering window with no close never dispatches, and inventing a
 * close date on the coalition's behalf would be worse than leaving it to them.
 */
export async function openWindowForGoodsDrive(
    campaign: CoalitionCampaignRecord
): Promise<string | null> {
    if (campaign.type !== 'goods_drive' || !campaign.endsAt) return null;
    return openSharedOrderWindow({
        campaign,
        opensAt: campaign.startsAt ?? new Date().toISOString(),
        closesAt: campaign.endsAt,
        // Dispatch when ordering closes unless a coordinator reschedules it in
        // FBM, which is where dispatch logistics already live.
        dispatchAt: campaign.endsAt,
    });
}
