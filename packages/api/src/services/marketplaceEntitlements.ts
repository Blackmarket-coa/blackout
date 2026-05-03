import crypto from 'node:crypto';
import type {
    EntitlementStatus,
    MarketplaceProviderId,
    NormalizedEntitlement,
    NormalizedLifecycleEvent,
} from '@blackout/core';
import { db } from '../db/store';
import type {
    MarketplaceEntitlementRecord,
    MarketplaceLicenseKeyRecord,
    MarketplaceProviderIdString,
} from '../db/types';
import { incrementCounter, logEvent } from './marketplaceObservability';

function generateLicenseKey(): string {
    const bytes = crypto.randomBytes(16);
    const hex = bytes.toString('hex').toUpperCase();
    return `${hex.slice(0, 8)}-${hex.slice(8, 16)}-${hex.slice(16, 24)}-${hex.slice(24, 32)}`;
}

function nowIso(): string {
    return new Date().toISOString();
}

function toNormalized(record: MarketplaceEntitlementRecord): NormalizedEntitlement {
    return {
        id: record.id,
        userId: record.userId,
        providerId: record.providerId as MarketplaceProviderId,
        providerListingId: record.providerListingId,
        sku: record.sku,
        kind: record.kind,
        status: record.status,
        grantedAt: record.grantedAt,
        expiresAt: record.expiresAt,
        sourceEventId: record.sourceEventId,
        metadata: record.metadata,
    };
}

export function hasProcessedWebhookEvent(
    providerId: MarketplaceProviderId,
    eventId: string
): boolean {
    const audit = db.getMarketplaceWebhook(providerId as MarketplaceProviderIdString, eventId);
    return audit?.processedAt !== null && audit?.processedAt !== undefined;
}

export function recordWebhookReceipt(
    providerId: MarketplaceProviderId,
    eventId: string,
    signatureOk: boolean,
    payload: unknown
): void {
    const existing = db.getMarketplaceWebhook(providerId as MarketplaceProviderIdString, eventId);
    if (existing) return;
    db.recordMarketplaceWebhook({
        id: crypto.randomUUID(),
        providerId: providerId as MarketplaceProviderIdString,
        eventId,
        receivedAt: nowIso(),
        processedAt: null,
        signatureOk,
        payload,
    });
    incrementCounter('marketplace_webhook_received_total', { providerId, signatureOk });
}

export function markWebhookProcessed(
    providerId: MarketplaceProviderId,
    eventId: string
): void {
    db.markMarketplaceWebhookProcessed(
        providerId as MarketplaceProviderIdString,
        eventId,
        nowIso()
    );
}

export interface ApplyEventResult {
    entitlement: NormalizedEntitlement | null;
    licenseKey: MarketplaceLicenseKeyRecord | null;
    alreadyProcessed: boolean;
}

export function applyLifecycleEvent(event: NormalizedLifecycleEvent): ApplyEventResult {
    if (hasProcessedWebhookEvent(event.providerId, event.eventId)) {
        const existing = db.findMarketplaceEntitlement({
            userId: event.userId,
            providerId: event.providerId as MarketplaceProviderIdString,
            providerListingId: event.providerListingId,
            sku: event.sku,
        });
        return {
            entitlement: existing ? toNormalized(existing) : null,
            licenseKey: existing ? db.getMarketplaceLicenseKey(existing.id) ?? null : null,
            alreadyProcessed: true,
        };
    }

    if (event.type === 'purchase.succeeded') {
        const id = crypto.randomUUID();
        const timestamp = nowIso();
        const record: MarketplaceEntitlementRecord = {
            id,
            userId: event.userId,
            providerId: event.providerId as MarketplaceProviderIdString,
            providerListingId: event.providerListingId,
            sku: event.sku,
            kind: event.kind,
            status: 'granted',
            grantedAt: event.occurredAt,
            expiresAt: null,
            sourceEventId: event.eventId,
            metadata: event.metadata,
            createdAt: timestamp,
            updatedAt: timestamp,
        };
        db.upsertMarketplaceEntitlement(record);

        let licenseKey: MarketplaceLicenseKeyRecord | null = null;
        if (event.kind === 'software_license') {
            licenseKey = db.upsertMarketplaceLicenseKey({
                entitlementId: id,
                licenseKey: generateLicenseKey(),
                activationsUsed: 0,
                activationsMax:
                    typeof event.metadata['activationsMax'] === 'number'
                        ? (event.metadata['activationsMax'] as number)
                        : 3,
                createdAt: timestamp,
            });
        }

        markWebhookProcessed(event.providerId, event.eventId);
        incrementCounter('marketplace_entitlement_granted_total', {
            providerId: event.providerId,
            kind: event.kind,
        });
        logEvent('marketplace.entitlement.granted', {
            entitlementId: id,
            userId: event.userId,
            providerId: event.providerId,
            providerListingId: event.providerListingId,
            sourceEventId: event.eventId,
        });
        return { entitlement: toNormalized(record), licenseKey, alreadyProcessed: false };
    }

    const existing = db.findMarketplaceEntitlement({
        userId: event.userId,
        providerId: event.providerId as MarketplaceProviderIdString,
        providerListingId: event.providerListingId,
        sku: event.sku,
    });
    if (!existing) {
        markWebhookProcessed(event.providerId, event.eventId);
        return { entitlement: null, licenseKey: null, alreadyProcessed: false };
    }

    let nextStatus: EntitlementStatus = existing.status;
    if (event.type === 'purchase.refunded') nextStatus = 'refunded';
    if (event.type === 'purchase.chargebacked') nextStatus = 'chargebacked';
    if (event.type === 'purchase.failed') nextStatus = 'revoked';

    const updated = db.upsertMarketplaceEntitlement({
        ...existing,
        status: nextStatus,
        updatedAt: nowIso(),
    });
    markWebhookProcessed(event.providerId, event.eventId);
    incrementCounter('marketplace_entitlement_status_change_total', {
        providerId: event.providerId,
        status: nextStatus,
    });
    logEvent('marketplace.entitlement.status_change', {
        entitlementId: updated.id,
        userId: updated.userId,
        providerId: updated.providerId,
        sourceEventId: event.eventId,
        nextStatus,
    });
    return {
        entitlement: toNormalized(updated),
        licenseKey: db.getMarketplaceLicenseKey(updated.id) ?? null,
        alreadyProcessed: false,
    };
}

export function listEntitlementsForUser(userId: string): NormalizedEntitlement[] {
    return db.listMarketplaceEntitlementsByUser(userId).map(toNormalized);
}

export function getEntitlementById(entitlementId: string): NormalizedEntitlement | undefined {
    const record = db.getMarketplaceEntitlement(entitlementId);
    return record ? toNormalized(record) : undefined;
}

export function getLicenseKey(
    entitlementId: string
): MarketplaceLicenseKeyRecord | undefined {
    return db.getMarketplaceLicenseKey(entitlementId);
}

export function resetMarketplaceEntitlementsForTest(): void {
    db.resetMarketplaceForTest();
}
