// Phase 3 — Governance ↔ FBM round-trip (AOG §3.2). When a Blackout governance
// proposal resolves, the winning decision is fired BACK to FBM as an outbound
// `governance.proposal.resolved` webhook so FBM can apply it (update a price,
// close an Order Cycle, adjust stock allocation). Reuses the existing
// outbound-event-webhook pipeline (signed HMAC delivery + retries).

import { tallyVotes } from '@blackout/core';
import { db } from '../db/store';
import { dispatchEvent } from './outboundEventWebhooks';
import { incrementCounter, logEvent } from './marketplaceObservability';

export interface ProposalResolution {
    proposalId: string;
    communityId: string;
    /** Winning option id (highest votes); null on a tie or no votes. */
    result: string | null;
    tally: ReturnType<typeof tallyVotes>;
    resolvedAt: string;
}

/** Pick the single highest-voted choice, or null on an empty/tied result. */
function winningChoice(tally: ReturnType<typeof tallyVotes>): string | null {
    if (tally.length === 0) return null;
    const sorted = [...tally].sort((a, b) => b.votes - a.votes);
    if (sorted.length > 1 && sorted[0]!.votes === sorted[1]!.votes) return null; // tie
    return sorted[0]!.choice;
}

/**
 * Tally a proposal and fire the resolution back to FBM. Best-effort on the
 * webhook (fire-and-forget); returns the resolution for the caller's response.
 * Returns null when the proposal is unknown.
 */
export function resolveProposalAndNotifyFbm(proposalId: string): ProposalResolution | null {
    const vote = db.getVote(proposalId);
    if (!vote) return null;

    const tally = tallyVotes(db.getVoteEntries(proposalId));

    // Idempotency: a proposal resolves exactly once. If it is already resolved,
    // return the stored resolution WITHOUT re-tallying the terminal state or
    // re-firing the outbound FBM webhook. Previously `/resolve` had no
    // write-back or guard, so every call re-dispatched a fresh event.
    if (vote.resolvedAt) {
        return {
            proposalId,
            communityId: vote.communityId,
            result: vote.result ?? null,
            tally,
            resolvedAt: vote.resolvedAt,
        };
    }

    const result = winningChoice(tally);
    // Persist the terminal state + result so the proposal actually closes and
    // subsequent resolves are idempotent. (Casting votes is already rejected once
    // the vote is no longer `active` — see the governance `/votes` handler.)
    const resolved = db.resolveVote(proposalId, result);
    const resolution: ProposalResolution = {
        proposalId,
        communityId: vote.communityId,
        result,
        tally,
        resolvedAt: resolved?.resolvedAt ?? new Date().toISOString(),
    };

    // Fire-and-forget outbound webhook to FBM (owned by the proposer's account so
    // it routes to that user's registered outbound subscriptions, e.g. an FBM
    // coalition-admin connector). Never blocks or fails the resolution. A stable
    // `dedupeKey` derived from the resolution lets the receiver dedupe retries.
    void dispatchEvent({
        type: 'governance.proposal.resolved',
        blackoutUserId: vote.proposerId,
        dedupeKey: `${proposalId}.resolved`,
        data: {
            proposalId,
            communityId: vote.communityId,
            title: vote.title,
            result,
            tally,
        },
        occurredAt: resolution.resolvedAt,
    }).catch((err) =>
        logEvent('governance.fbm_bridge.dispatch_threw', {
            proposalId,
            error: err instanceof Error ? err.message : String(err),
        })
    );

    incrementCounter('governance_proposal_resolved_total', {});
    logEvent('governance.fbm_bridge.resolved', {
        proposalId,
        communityId: vote.communityId,
        result,
    });
    return resolution;
}
