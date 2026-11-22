// Public geocaches on the Coalition map: geocaching phase 1, server side
// (docs/coalitions/GEOCACHING_DESIGN.md; docs/security/coalition-caches-2026-11-22.md).
//
// The operator's decisions of 2026-11-22: a public cache appears 2 hours after
// it is placed (here: 2 hours plus a random part of an hour, so the moment it
// appears does not date the visit); any signed-in member may place one; caches
// are reviewed after reports, not approved first, and a reported cache is
// hidden until a moderator looks; the location features are for people 18 and
// older, by their own statement (the consent record). What is shown to whom is
// in services/coalitionVisibility.ts.
import { randomBytes, randomInt, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { haversineDistanceMeters } from '@blackout/core';
import { db } from '../db/store';
import type { CoalitionCacheRecord } from '../db/types';
import {
    CACHE_AREA_CELL_METERS,
    canSeeCache,
    cacheForOthers,
    cacheForPlacer,
    coarsenPoint,
    placerStatusOf,
    type OthersCacheView,
    type PlacerCacheView,
} from './coalitionVisibility';

const scryptAsync = promisify(scrypt) as (
    password: string,
    salt: string,
    keylen: number
) => Promise<Buffer>;

/** Decision 7: a public cache appears at least this long after it is placed. */
export const PUBLIC_CACHE_DELAY_MS = 2 * 60 * 60 * 1000;
/**
 * And up to this much longer, chosen at random per cache. Without it, anyone
 * who polls the list learns the minute each placer stood at the spot.
 */
export const PUBLIC_CACHE_JITTER_MS = 60 * 60 * 1000;
/**
 * A GPS check-in counts within this distance of the centre of the area
 * everyone is shown, not of the exact spot: answering "within 50 m of the
 * spot" lets anyone binary-search the spot from home. The spot is never more
 * than half the cell's diagonal (36 m) from that centre, so anyone within
 * 39 m of the spot is inside this circle.
 */
export const GPS_FIND_RADIUS_METERS = 75;
/** No 0/O, 1/I/L: a code someone copies off a card should survive the copying. */
export const CACHE_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
/** 10 characters from 31: about 49.5 bits, behind a per-account attempt limit. */
export const CACHE_CODE_LENGTH = 10;

/**
 * Off unless the operator turns it on: the client does not use these routes
 * yet, and phase 1 is not complete without it (KNOWN_LIMITATIONS.md).
 */
export const cachesEnabled = (): boolean => {
    const value = (process.env.BLACKOUT_COALITION_CACHES ?? '').trim().toLowerCase();
    return value === '1' || value === 'true';
};

export interface Position {
    latitude: number;
    longitude: number;
}

/** The code as a person might type it: any case, spaces or dashes. */
export const normalizeCacheCode = (input: string): string =>
    input.toUpperCase().replace(/[^0-9A-Z]/g, '');

/** Shown to the placer once, in groups of four: `K7QM-4XTR-9P`. */
export const formatCacheCode = (code: string): string => code.match(/.{1,4}/g)?.join('-') ?? code;

export const generateCacheCode = (): string => {
    let code = '';
    for (let i = 0; i < CACHE_CODE_LENGTH; i += 1) {
        code += CACHE_CODE_ALPHABET[randomInt(CACHE_CODE_ALPHABET.length)];
    }
    return code;
};

/** scrypt, so a copy of the table does not give the codes away to a quick search. */
export const hashCacheCode = async (code: string, salt: string): Promise<string> =>
    (await scryptAsync(normalizeCacheCode(code), salt, 32)).toString('hex');

const codeMatches = async (cache: CoalitionCacheRecord, typed: string): Promise<boolean> => {
    if (!cache.codeSalt || !cache.codeHash) return false;
    const typedHash = Buffer.from(await hashCacheCode(typed, cache.codeSalt), 'hex');
    const stored = Buffer.from(cache.codeHash, 'hex');
    return typedHash.length === stored.length && timingSafeEqual(typedHash, stored);
};

/** Whether a point is inside any exclusion zone as the zones are now. */
const insideAnyZone = (position: Position): boolean =>
    db
        .listCoalitionExclusionZones()
        .some((zone) => haversineDistanceMeters(position, zone) <= zone.radiusMeters);

const findCountOf = (cacheId: string): number => db.listCoalitionCacheFinds({ cacheId }).length;

const everReported = (cacheId: string): boolean =>
    db.listCoalitionCacheReports({ cacheId }).length > 0;

const visibleTo = (cache: CoalitionCacheRecord, viewerId: string, now: number): boolean =>
    canSeeCache(cache, viewerId, now, cache.placerId === viewerId ? false : insideAnyZone(cache));

export const viewForViewer = (
    cache: CoalitionCacheRecord,
    viewerId: string
): PlacerCacheView | OthersCacheView => {
    const findCount = findCountOf(cache.id);
    if (cache.placerId === viewerId) {
        return cacheForPlacer(cache, findCount, {
            insideZone: insideAnyZone(cache),
            everReported: everReported(cache.id),
        });
    }
    const foundByMe =
        db.listCoalitionCacheFinds({ cacheId: cache.id, finderId: viewerId }).length > 0;
    return cacheForOthers(cache, findCount, foundByMe);
};

/** The status the placer sees, for the data export (services/accountLifecycle.ts). */
export const placerStatusForExport = (cache: CoalitionCacheRecord) =>
    placerStatusOf(cache, {
        insideZone: insideAnyZone(cache),
        everReported: everReported(cache.id),
    });

export interface CreateCacheInput {
    title: string;
    hint?: string;
    note?: string;
    photoMxc?: string;
    proof: 'code' | 'gps';
    position: Position;
}

/**
 * Place a cache. The code (for a code cache) is made here and returned once;
 * only its salted hash is kept. Nothing here looks at the exclusion zones: a
 * cache inside one is stored like any other and simply never shown to anyone
 * else (`visibleTo`).
 */
export const createCache = async (
    placerId: string,
    input: CreateCacheInput,
    now = Date.now()
): Promise<{ cache: CoalitionCacheRecord; code: string | null }> => {
    const code = input.proof === 'code' ? generateCacheCode() : null;
    const codeSalt = code ? randomBytes(16).toString('hex') : null;
    const codeHash = code && codeSalt ? await hashCacheCode(code, codeSalt) : null;
    const delay = PUBLIC_CACHE_DELAY_MS + randomInt(PUBLIC_CACHE_JITTER_MS + 1);
    const cache = db.upsertCoalitionCache({
        id: randomUUID(),
        placerId,
        latitude: input.position.latitude,
        longitude: input.position.longitude,
        title: input.title,
        hint: input.hint ?? null,
        note: input.note ?? null,
        photoMxc: input.photoMxc ?? null,
        proof: input.proof,
        codeSalt,
        codeHash,
        status: 'active',
        heldReason: null,
        visibleFrom: new Date(now + delay).toISOString(),
        removedBy: null,
        moderationNote: null,
    });
    return { cache, code };
};

/**
 * The caches a viewer may see, optionally within `radiusKm` of a position.
 * The radius is tested against what the viewer is shown: the exact spot of
 * their own caches, the cell centre of everyone else's, so asking again with
 * smaller circles narrows nothing. Ordered by id, which is random, not by
 * when each was placed.
 */
export const listCachesForViewer = (
    viewerId: string,
    near?: { position: Position; radiusKm: number },
    now = Date.now()
): Array<PlacerCacheView | OthersCacheView> =>
    db
        .listCoalitionCaches()
        .filter((cache) => visibleTo(cache, viewerId, now))
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((cache) => viewForViewer(cache, viewerId))
        .filter((view) => {
            if (!near) return true;
            const shown = view.mine ? view.position : view.area;
            return haversineDistanceMeters(near.position, shown) <= near.radiusKm * 1000;
        });

export const getCacheForViewer = (
    cacheId: string,
    viewerId: string,
    now = Date.now()
): CoalitionCacheRecord | undefined => {
    const cache = db.getCoalitionCache(cacheId);
    return cache && visibleTo(cache, viewerId, now) ? cache : undefined;
};

export type FindResult =
    | { ok: true; foundAt: string; findCount: number }
    | {
          ok: false;
          reason:
              | 'not_found'
              | 'own_cache'
              | 'code_required'
              | 'wrong_code'
              | 'position_required'
              | 'too_far';
      };

/**
 * Confirm a find. A code cache takes the code; a GPS cache takes the finder's
 * position, compared with the centre of the area everyone is shown and not
 * kept or logged: the find records who and when, never where. Someone who has
 * already found it gets their find back without another comparison.
 */
export const findCache = async (
    cacheId: string,
    finderId: string,
    input: { code?: string; position?: Position },
    now = Date.now()
): Promise<FindResult> => {
    const cache = getCacheForViewer(cacheId, finderId, now);
    if (!cache) return { ok: false, reason: 'not_found' };
    if (cache.placerId === finderId) return { ok: false, reason: 'own_cache' };
    const earlier = db.listCoalitionCacheFinds({ cacheId, finderId })[0];
    if (earlier) return { ok: true, foundAt: earlier.foundAt, findCount: findCountOf(cacheId) };
    if (cache.proof === 'code') {
        if (!input.code) return { ok: false, reason: 'code_required' };
        if (!(await codeMatches(cache, input.code))) return { ok: false, reason: 'wrong_code' };
    } else {
        if (!input.position) return { ok: false, reason: 'position_required' };
        const shownCentre = coarsenPoint(cache.latitude, cache.longitude, CACHE_AREA_CELL_METERS);
        if (haversineDistanceMeters(input.position, shownCentre) > GPS_FIND_RADIUS_METERS) {
            return { ok: false, reason: 'too_far' };
        }
    }
    const find = db.addCoalitionCacheFind({
        id: randomUUID(),
        cacheId,
        finderId,
        foundAt: new Date(now).toISOString(),
    });
    return { ok: true, foundAt: find.foundAt, findCount: findCountOf(cacheId) };
};

export type ReportResult = { ok: true } | { ok: false; reason: 'not_found' | 'own_cache' };

/**
 * Report a cache. A reported active cache is hidden from everyone but its
 * placer until reviewed. Someone whose earlier report on it was already
 * reviewed is not heard again on the same cache: otherwise one account could
 * hide it again after every restore.
 */
export const reportCache = (
    cacheId: string,
    reporterId: string,
    reason: string,
    now = Date.now()
): ReportResult => {
    const cache = getCacheForViewer(cacheId, reporterId, now);
    if (!cache) return { ok: false, reason: 'not_found' };
    if (cache.placerId === reporterId) return { ok: false, reason: 'own_cache' };
    const earlier = db.listCoalitionCacheReports({ cacheId, reporterId })[0];
    if (earlier?.resolved) return { ok: true };
    db.upsertCoalitionCacheReport({
        id: randomUUID(),
        cacheId,
        reporterId,
        reason,
        resolved: false,
    });
    if (cache.status === 'active') {
        db.upsertCoalitionCache({ ...cache, status: 'hidden', heldReason: 'report' });
    }
    return { ok: true };
};

const closeOpenReports = (cacheId: string): void => {
    for (const report of db.listCoalitionCacheReports({ cacheId, resolved: false })) {
        db.upsertCoalitionCacheReport({ ...report, resolved: true });
    }
};

/** The placer takes their own cache down. Nobody sees it afterwards, the placer included. */
export const removeOwnCache = (cacheId: string, placerId: string): boolean => {
    const cache = db.getCoalitionCache(cacheId);
    if (!cache || cache.placerId !== placerId) return false;
    if (cache.status === 'removed' && cache.removedBy === placerId) return false;
    db.upsertCoalitionCache({ ...cache, status: 'removed', removedBy: placerId });
    closeOpenReports(cacheId);
    return true;
};

export interface ModerationEntry {
    cache: Omit<CoalitionCacheRecord, 'codeSalt' | 'codeHash'>;
    /** True when the cache is inside an exclusion zone, so nobody else can see it whatever is done. */
    insideExclusionZone: boolean;
    reports: Array<{ id: string; reporterId: string; reason: string; createdAt: string }>;
}

/**
 * What administrators review, with the exact spot: caches hidden after a
 * report, caches with open reports, and caches placed inside an exclusion
 * zone (nothing needs doing about those, but repeated placements near a
 * shelter are worth noticing). Caches their placers took down are left out.
 */
export const moderationQueue = (): ModerationEntry[] =>
    db
        .listCoalitionCaches()
        .filter((cache) => !(cache.status === 'removed' && cache.removedBy === cache.placerId))
        .map((cache) => ({
            cache,
            insideZone: insideAnyZone(cache),
            open: db.listCoalitionCacheReports({ cacheId: cache.id, resolved: false }),
        }))
        .filter(
            ({ cache, insideZone, open }) =>
                cache.status === 'hidden' ||
                open.length > 0 ||
                (insideZone && cache.status !== 'removed')
        )
        .map(({ cache, insideZone, open }) => {
            const { codeSalt: _salt, codeHash: _hash, ...rest } = cache;
            return {
                cache: rest,
                insideExclusionZone: insideZone,
                reports: open.map((r) => ({
                    id: r.id,
                    reporterId: r.reporterId,
                    reason: r.reason,
                    createdAt: r.createdAt,
                })),
            };
        });

export type ModerateResult =
    | { ok: true; cache: CoalitionCacheRecord }
    | { ok: false; reason: 'not_found' };

/**
 * Restore (show again) or remove a cache, closing its open reports either
 * way. A restore cannot publish a cache inside an exclusion zone: zones are
 * applied when caches are read (`visibleTo`).
 */
export const moderateCache = (
    cacheId: string,
    moderatorId: string,
    action: 'restore' | 'remove',
    note: string | undefined
): ModerateResult => {
    const cache = db.getCoalitionCache(cacheId);
    if (!cache || (cache.status === 'removed' && cache.removedBy === cache.placerId)) {
        return { ok: false, reason: 'not_found' };
    }
    const updated = db.upsertCoalitionCache(
        action === 'restore'
            ? {
                  ...cache,
                  status: 'active',
                  heldReason: null,
                  removedBy: null,
                  moderationNote: note ?? null,
              }
            : { ...cache, status: 'removed', removedBy: moderatorId, moderationNote: note ?? null }
    );
    closeOpenReports(cacheId);
    return { ok: true, cache: updated };
};

/**
 * Add a zone. Caches already inside it stop being shown to others at once,
 * because zones are applied when caches are read; nothing is written to them.
 */
export const addExclusionZone = (
    createdBy: string,
    input: { label: string; position: Position; radiusMeters: number }
) =>
    db.createCoalitionExclusionZone({
        id: randomUUID(),
        label: input.label,
        latitude: input.position.latitude,
        longitude: input.position.longitude,
        radiusMeters: input.radiusMeters,
        createdBy,
        createdAt: new Date().toISOString(),
    });
