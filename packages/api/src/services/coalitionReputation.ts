// Coalition activity → the one ecosystem KARMA ladder.
//
// Blackout owns coalitions; FBM owns reputation. So this emitter says *what
// happened* and lets FBM decide *what it is worth* — the delta table lives in
// `modules/progression/coalition-karma.ts` on the FBM side and is never sent
// from here. A compromised or buggy Blackout process therefore cannot mint
// reputation, only describe events.
//
// Three properties every call site depends on:
//
//  1. **Never throws, never blocks.** Reputation is a side effect of coalition
//     work, not a precondition for it. A drive still completes when FBM is
//     down; the award is simply lost, and the dedupe key below makes a later
//     replay safe.
//  2. **Deterministic replay keys.** `referenceId` is a stable Blackout id (a
//     campaign id, a membership id), so the same logical event delivered twice
//     dedupes at FBM's canonical karma log rather than awarding twice.
//  3. **No money in the payload.** Deltas are flat by design because
//     reputation and capital are required to stay structurally separate. If a
//     coalition award ever needs to scale with dollars, that is a legal-review
//     change on the FBM side, not a field added here.

import { fbmIntegrationTarget } from '../integrations/fbm/integrationRoot';
import { matrixUserIdFor } from './userIdentity';
import { incrementCounter, logEvent } from './marketplaceObservability';

/**
 * Every event here is backed by a captured contribution — money the platform
 * saw move. Founding a coalition, joining one and raising an aid post were
 * awarded once and are gone: each was a row insert by one actor with no
 * counterparty and no cost, so they minted reputation from nothing.
 */
export type CoalitionReputationEvent =
    | 'drive_completed'
    | 'drive_contributed'
    | 'mutual_aid_fulfilled'
    | 'project_delivered'
    | 'quest_completed';

export interface CoalitionReputationInput {
    eventType: CoalitionReputationEvent;
    /** The Blackout member whose ladder moves. */
    blackoutUserId: string;
    coalitionId: string;
    /** Stable Blackout-side id for this logical event; the replay key. */
    referenceId: string;
    occurredAt?: string;
}

const TIMEOUT_MS = 3_000;

type FetchImpl = typeof fetch;
let fetchImpl: FetchImpl | undefined;

/** Test seam: swap the transport without standing up an FBM instance. */
export function __setReputationFetchForTests(impl: FetchImpl | undefined): void {
    fetchImpl = impl;
}

interface Endpoint {
    url: string;
    serviceToken: string;
}

/**
 * The reputation route rides the same §4 service-token surface as the rest of
 * the FBM integration, so it reuses that configuration pair. Unconfigured is a
 * normal state in dev and self-host: callers no-op rather than warn on every
 * coalition action.
 */
function endpoint(env = process.env): Endpoint | null {
    const target = fbmIntegrationTarget(env);
    if (!target) return null;
    return { url: `${target.root}/reputation/events`, serviceToken: target.serviceToken };
}

async function post(input: CoalitionReputationInput, target: Endpoint): Promise<void> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
        const res = await (fetchImpl ?? fetch)(target.url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${target.serviceToken}`,
            },
            body: JSON.stringify({
                blackoutUserId: input.blackoutUserId,
                mxid: matrixUserIdFor(input.blackoutUserId) ?? undefined,
                eventType: input.eventType,
                referenceId: input.referenceId,
                coalitionId: input.coalitionId,
                occurredAt: input.occurredAt ?? new Date().toISOString(),
            }),
            signal: controller.signal,
        });
        if (!res.ok) {
            // Identifiers only — never the member's profile, the coalition's
            // contents, or the response body, which may echo request data.
            incrementCounter('coalition_reputation_rejected');
            logEvent('coalition_reputation_rejected', {
                eventType: input.eventType,
                status: res.status,
            });
            return;
        }
        incrementCounter('coalition_reputation_awarded');
    } catch (error) {
        incrementCounter('coalition_reputation_failed');
        logEvent('coalition_reputation_failed', {
            eventType: input.eventType,
            error: error instanceof Error ? error.name : 'unknown',
        });
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Fire-and-forget award. Call sites use `void awardCoalitionKarma(...)` and
 * carry on: the returned promise resolves even on failure so an unhandled
 * rejection can never take down a coalition request.
 */
export async function awardCoalitionKarma(input: CoalitionReputationInput): Promise<void> {
    const target = endpoint();
    if (!target) return;
    await post(input, target);
}
