import type { Bounty, BountyStatus } from '@blackout/core';
import { db } from '../db/store';

export function listBounties(
    filter: { category?: string; status?: string; coalitionId?: string } = {},
): Bounty[] {
    return db.listBounties(filter);
}

export interface CreateBountyInput {
    id: string;
    category: Bounty['category'];
    title: string;
    description: string;
    creatorId: string;
    rewardType: Bounty['rewardType'];
    rewardSummary: string;
    rewardAmountCents?: number;
    requirements?: string[];
    deliverables?: string[];
    coalitionId?: string;
}

export function createBounty(input: CreateBountyInput): Bounty {
    return db.createBounty(input);
}

export function updateBountyStatus(id: string, status: BountyStatus): Bounty | null {
    return db.updateBountyStatus(id, status) ?? null;
}

/** Transition an open bounty to claimed, recording the claimer. Returns null when missing or not open. */
export function claimBounty(id: string, userId: string): Bounty | null {
    return db.claimBounty(id, userId) ?? null;
}

export function newBountyId(): string {
    return `bounty_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}
