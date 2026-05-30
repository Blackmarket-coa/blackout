// Phase 3 — Flash mob / time-sensitive sales (AOG §6). A vendor-triggered
// `flash_sale.start` does two things:
//   1. Broadcasts a burst notification to the vendor's public announcement room.
//      (Matrix delivers this to subscribers' devices via their existing pushers —
//      no separate push-notification infrastructure is introduced here.)
//   2. Drops an *ephemeral* high-heat pin on the Coalition spatial map at the
//      vendor's location so the convergence animation draws nearby buyers. The
//      pin is purged within an operational window (default 1h) by the flash-mob
//      sweeper — location data never outlives the event (AOG §8.3).
//
// All best-effort: a Matrix or spatial failure logs + counts, never throws.

import {
    FBM_FLASH_SALE_EVENT_TYPE,
    FBM_MARKETPLACE_SCHEMA_VERSION,
    type FbmFlashSaleContent,
} from '@blackout/protocol';
import { db } from '../../db/store';
import { incrementCounter, logEvent } from '../marketplaceObservability';
import type { FbmBridgeMatrixClient } from './client';
import type { FbmFlashSaleEvent } from './events';
import { postFlashSaleAnnouncement } from './vendorRooms';

/** Deterministic spatial-pin id for a flash sale, so the sweeper can target it. */
export const flashSalePinId = (saleId: string): string => `fbm-flash-${saleId}`;

const purgeWindowMs = (): number => {
    const raw = Number.parseInt(process.env.FBM_FLASH_SALE_PIN_TTL_SECONDS ?? '', 10);
    return (Number.isFinite(raw) && raw > 0 ? raw : 3600) * 1000;
};

function failed(action: string, detail?: unknown): void {
    incrementCounter('fbm_matrix_bridge_action_failed_total', { feature: 'flash_mob', action });
    logEvent('marketplace.fbm_bridge.action_failed', { feature: 'flash_mob', action, detail });
}

export async function startFlashSale(
    event: FbmFlashSaleEvent,
    matrix: FbmBridgeMatrixClient
): Promise<void> {
    const endsAt = new Date(
        Date.parse(event.occurredAt) + event.durationSeconds * 1000
    ).toISOString();

    const block: FbmFlashSaleContent = {
        schemaVersion: FBM_MARKETPLACE_SCHEMA_VERSION,
        vendorId: event.vendorId,
        saleId: event.saleId,
        name: event.name,
        discount: event.discount,
        durationSeconds: event.durationSeconds,
        listingDeepLink: event.listingDeepLink,
        endsAt,
        occurredAt: event.occurredAt,
    };
    const body = `⚡ Flash sale: ${event.name} — ${event.discount} for the next ${Math.round(
        event.durationSeconds / 60
    )} min.${event.listingDeepLink ? ` ${event.listingDeepLink}` : ''}`;

    // 1. Burst broadcast to the public announce room.
    const posted = await postFlashSaleAnnouncement(
        event.vendorId,
        matrix,
        { msgtype: 'm.notice', body, [FBM_FLASH_SALE_EVENT_TYPE]: block },
        event.vendorMxid
    );
    if (!posted) failed('broadcast');

    // 2. Ephemeral heat spike on the spatial map (only if coordinates supplied).
    if (event.latitude !== undefined && event.longitude !== undefined) {
        try {
            db.upsertCoalitionSpatialItem({
                id: flashSalePinId(event.saleId),
                layer: 'vendors',
                title: `Flash sale: ${event.name}`,
                latitude: event.latitude,
                longitude: event.longitude,
                visibility: 'public',
                eventType: 'community_event',
                startsAt: event.occurredAt,
                endsAt,
                status: 'live',
                // Max heat — the doc's "8× weight spike" caps to the heatmap's
                // [0,1] range; the raw multiplier is carried in meta for the client.
                activityLevel: 1,
                source: 'medusa',
                meta: {
                    fbmFlashSaleId: event.saleId,
                    vendorId: event.vendorId,
                    heatMultiplier: 8,
                    ephemeral: true,
                    purgeAt: new Date(Date.now() + purgeWindowMs()).toISOString(),
                },
            });
            incrementCounter('fbm_matrix_flash_sale_pin_total', {});
        } catch (err) {
            failed('spatial_pin', err instanceof Error ? err.message : String(err));
        }
    }

    logEvent('marketplace.fbm_bridge.flash_sale_started', {
        vendorId: event.vendorId,
        saleId: event.saleId,
        endsAt,
    });
}

/** Sweep ephemeral flash-mob pins whose `meta.purgeAt` has passed. */
export function runFlashSalePinSweep(nowMs: number = Date.now()): { purged: number } {
    let purged = 0;
    for (const item of db.listCoalitionSpatialItems()) {
        const meta = item.meta as { ephemeral?: unknown; purgeAt?: unknown } | undefined;
        if (!meta || meta.ephemeral !== true || typeof meta.purgeAt !== 'string') continue;
        if (Date.parse(meta.purgeAt) <= nowMs) {
            if (db.deleteCoalitionSpatialItem(item.id)) purged += 1;
        }
    }
    if (purged > 0) {
        incrementCounter('fbm_matrix_flash_sale_pin_purged_total', {}, purged);
        logEvent('marketplace.fbm_bridge.flash_sale_pins_purged', { purged });
    }
    return { purged };
}
