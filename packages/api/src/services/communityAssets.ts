/**
 * User-created assets: stickers, memes and coins.
 *
 * Creation is open to everyone, so approval is what stops an open pipe from
 * becoming a distribution channel for whatever anyone uploads. An asset is
 * inert until approved: it cannot be relayed, and `resolveSubject` refuses to
 * render it, so there is no path by which a pending upload travels.
 *
 * Authorship is permanent. `creatorId` is set once and no operation reassigns
 * it, because it is what Founding Contributor credentials and any future credit
 * split are computed from.
 */
import { randomUUID } from 'node:crypto';
import { foundingCredentialsFor, foundingSlotsRemaining } from '@blackout/core';
import { db } from '../db/store';
import type {
    CommunityAssetKind,
    CommunityAssetRecord,
    CommunityAssetReportRecord,
} from '../db/types';

export type AssetFailure =
    | { kind: 'not_found' }
    | { kind: 'not_owner' }
    | { kind: 'not_pending' }
    | { kind: 'not_approved' };

export type AssetResult<T> = { ok: true; value: T } | { ok: false; error: AssetFailure };

export interface CreateAssetInput {
    creatorId: string;
    kind: CommunityAssetKind;
    name: string;
    description?: string | null;
    mediaUrl: string;
}

/** Submit an asset. It starts pending and shares with nobody until reviewed. */
export function createAsset(input: CreateAssetInput): CommunityAssetRecord {
    return db.upsertCommunityAsset({
        id: randomUUID(),
        creatorId: input.creatorId,
        kind: input.kind,
        name: input.name.trim().slice(0, 120),
        description: input.description?.trim().slice(0, 500) || null,
        mediaUrl: input.mediaUrl,
        status: 'pending',
        reviewedBy: null,
        reviewNote: null,
        reviewedAt: null,
        foundingOrdinal: null,
    });
}

/**
 * Approve an asset, stamping the next founding ordinal for its kind.
 *
 * The ordinal is assigned here and stored rather than derived on read, so
 * retiring an early asset later cannot renumber everyone who came after it — a
 * credential someone already earned should not move because of someone else.
 */
export function approveAsset(
    assetId: string,
    reviewerId: string,
    note?: string | null
): AssetResult<CommunityAssetRecord> {
    const asset = db.getCommunityAsset(assetId);
    if (!asset) return { ok: false, error: { kind: 'not_found' } };
    if (asset.status !== 'pending') return { ok: false, error: { kind: 'not_pending' } };

    return {
        ok: true,
        value: db.upsertCommunityAsset({
            ...asset,
            status: 'approved',
            reviewedBy: reviewerId,
            reviewNote: note?.trim().slice(0, 500) || null,
            reviewedAt: new Date().toISOString(),
            foundingOrdinal: db.highestFoundingOrdinal(asset.kind) + 1,
        }),
    };
}

export function rejectAsset(
    assetId: string,
    reviewerId: string,
    note?: string | null
): AssetResult<CommunityAssetRecord> {
    const asset = db.getCommunityAsset(assetId);
    if (!asset) return { ok: false, error: { kind: 'not_found' } };
    if (asset.status !== 'pending') return { ok: false, error: { kind: 'not_pending' } };

    return {
        ok: true,
        value: db.upsertCommunityAsset({
            ...asset,
            status: 'rejected',
            reviewedBy: reviewerId,
            // A rejection says why, so the creator can answer it rather than
            // guess.
            reviewNote: note?.trim().slice(0, 500) || null,
            reviewedAt: new Date().toISOString(),
        }),
    };
}

/**
 * Retire an approved asset: it stops travelling from now on.
 *
 * The row and its founding ordinal stay. Existing relay chains that carried it
 * keep their history — the item really did travel — and the ordinal is left
 * alone so nobody else's credential shifts.
 */
export function retireAsset(
    assetId: string,
    actorId: string,
    note?: string | null
): AssetResult<CommunityAssetRecord> {
    const asset = db.getCommunityAsset(assetId);
    if (!asset) return { ok: false, error: { kind: 'not_found' } };
    if (asset.status !== 'approved') return { ok: false, error: { kind: 'not_approved' } };

    return {
        ok: true,
        value: db.upsertCommunityAsset({
            ...asset,
            status: 'retired',
            reviewedBy: actorId,
            reviewNote: note?.trim().slice(0, 500) || null,
            reviewedAt: new Date().toISOString(),
        }),
    };
}

/** Report an approved asset. Idempotent per reporter. */
export function reportAsset(
    assetId: string,
    reporterId: string,
    reason: string
): AssetResult<CommunityAssetReportRecord> {
    const asset = db.getCommunityAsset(assetId);
    if (!asset) return { ok: false, error: { kind: 'not_found' } };
    return {
        ok: true,
        value: db.upsertCommunityAssetReport({
            id: randomUUID(),
            assetId,
            reporterId,
            reason: reason.trim().slice(0, 500),
            resolved: false,
        }),
    };
}

/** Attribution for a single asset — who made it, and what it earned them. */
export function assetAttribution(assetId: string) {
    const asset = db.getCommunityAsset(assetId);
    if (!asset) return null;
    return {
        assetId: asset.id,
        creatorId: asset.creatorId,
        kind: asset.kind,
        foundingOrdinal: asset.foundingOrdinal,
        credentials: foundingCredentialsFor(asset.creatorId, db.listCommunityAssets()),
    };
}

/** Every founding credential a person holds, plus what is still open. */
export function foundingStatusFor(userId: string) {
    const assets = db.listCommunityAssets();
    return {
        credentials: foundingCredentialsFor(userId, assets),
        slotsRemaining: {
            sticker: foundingSlotsRemaining(db.highestFoundingOrdinal('sticker')),
            meme: foundingSlotsRemaining(db.highestFoundingOrdinal('meme')),
            coin: foundingSlotsRemaining(db.highestFoundingOrdinal('coin')),
        },
    };
}
