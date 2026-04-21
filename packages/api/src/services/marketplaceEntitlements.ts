import crypto from 'node:crypto';
import type {
    EntitlementStatus,
    MarketplaceProviderId,
    NormalizedEntitlement,
    NormalizedLifecycleEvent,
} from '@blackout/core';

interface WebhookAuditRecord {
    providerId: MarketplaceProviderId;
    eventId: string;
    receivedAt: string;
    processedAt: string | null;
    signatureOk: boolean;
    payload: unknown;
}

interface LicenseKeyRecord {
    entitlementId: string;
    key: string;
    activationsUsed: number;
    activationsMax: number;
}

const entitlementsByUser = new Map<string, NormalizedEntitlement[]>();
const entitlementsById = new Map<string, NormalizedEntitlement>();
const webhookAudit = new Map<string, WebhookAuditRecord>();
const licenseKeys = new Map<string, LicenseKeyRecord>();

function auditKey(providerId: MarketplaceProviderId, eventId: string): string {
    return `${providerId}:${eventId}`;
}

function generateLicenseKey(): string {
    const bytes = crypto.randomBytes(16);
    const hex = bytes.toString('hex').toUpperCase();
    return `${hex.slice(0, 8)}-${hex.slice(8, 16)}-${hex.slice(16, 24)}-${hex.slice(24, 32)}`;
}

function putEntitlement(entitlement: NormalizedEntitlement): void {
    entitlementsById.set(entitlement.id, entitlement);
    const list = entitlementsByUser.get(entitlement.userId) ?? [];
    const filtered = list.filter((candidate) => candidate.id !== entitlement.id);
    filtered.push(entitlement);
    entitlementsByUser.set(entitlement.userId, filtered);
}

function updateStatus(entitlement: NormalizedEntitlement, status: EntitlementStatus): NormalizedEntitlement {
    const next = { ...entitlement, status };
    putEntitlement(next);
    return next;
}

export function hasProcessedWebhookEvent(providerId: MarketplaceProviderId, eventId: string): boolean {
    const record = webhookAudit.get(auditKey(providerId, eventId));
    return record?.processedAt !== null && record?.processedAt !== undefined;
}

export function recordWebhookReceipt(
    providerId: MarketplaceProviderId,
    eventId: string,
    signatureOk: boolean,
    payload: unknown
): void {
    webhookAudit.set(auditKey(providerId, eventId), {
        providerId,
        eventId,
        receivedAt: new Date().toISOString(),
        processedAt: null,
        signatureOk,
        payload,
    });
}

export function markWebhookProcessed(providerId: MarketplaceProviderId, eventId: string): void {
    const record = webhookAudit.get(auditKey(providerId, eventId));
    if (record) {
        record.processedAt = new Date().toISOString();
        webhookAudit.set(auditKey(providerId, eventId), record);
    }
}

function findEntitlementForEvent(event: NormalizedLifecycleEvent): NormalizedEntitlement | undefined {
    const list = entitlementsByUser.get(event.userId) ?? [];
    return list.find(
        (candidate) =>
            candidate.providerId === event.providerId &&
            candidate.providerListingId === event.providerListingId &&
            (event.sku ? candidate.sku === event.sku : true)
    );
}

export interface ApplyEventResult {
    entitlement: NormalizedEntitlement | null;
    licenseKey: LicenseKeyRecord | null;
    alreadyProcessed: boolean;
}

export function applyLifecycleEvent(event: NormalizedLifecycleEvent): ApplyEventResult {
    if (hasProcessedWebhookEvent(event.providerId, event.eventId)) {
        const existing = findEntitlementForEvent(event);
        return {
            entitlement: existing ?? null,
            licenseKey: existing ? licenseKeys.get(existing.id) ?? null : null,
            alreadyProcessed: true,
        };
    }

    if (event.type === 'purchase.succeeded') {
        const entitlement: NormalizedEntitlement = {
            id: crypto.randomUUID(),
            userId: event.userId,
            providerId: event.providerId,
            providerListingId: event.providerListingId,
            sku: event.sku,
            kind: event.kind,
            status: 'granted',
            grantedAt: event.occurredAt,
            expiresAt: null,
            sourceEventId: event.eventId,
            metadata: event.metadata,
        };
        putEntitlement(entitlement);

        let licenseKey: LicenseKeyRecord | null = null;
        if (event.kind === 'software_license') {
            licenseKey = {
                entitlementId: entitlement.id,
                key: generateLicenseKey(),
                activationsUsed: 0,
                activationsMax: typeof event.metadata['activationsMax'] === 'number'
                    ? (event.metadata['activationsMax'] as number)
                    : 3,
            };
            licenseKeys.set(entitlement.id, licenseKey);
        }

        markWebhookProcessed(event.providerId, event.eventId);
        return { entitlement, licenseKey, alreadyProcessed: false };
    }

    const existing = findEntitlementForEvent(event);
    if (!existing) {
        markWebhookProcessed(event.providerId, event.eventId);
        return { entitlement: null, licenseKey: null, alreadyProcessed: false };
    }

    let nextStatus: EntitlementStatus = existing.status;
    if (event.type === 'purchase.refunded') nextStatus = 'refunded';
    if (event.type === 'purchase.chargebacked') nextStatus = 'chargebacked';
    if (event.type === 'purchase.failed') nextStatus = 'revoked';

    const updated = updateStatus(existing, nextStatus);
    markWebhookProcessed(event.providerId, event.eventId);
    return {
        entitlement: updated,
        licenseKey: licenseKeys.get(updated.id) ?? null,
        alreadyProcessed: false,
    };
}

export function listEntitlementsForUser(userId: string): NormalizedEntitlement[] {
    return [...(entitlementsByUser.get(userId) ?? [])];
}

export function getEntitlementById(entitlementId: string): NormalizedEntitlement | undefined {
    return entitlementsById.get(entitlementId);
}

export function getLicenseKey(entitlementId: string): LicenseKeyRecord | undefined {
    return licenseKeys.get(entitlementId);
}

export function resetMarketplaceEntitlementsForTest(): void {
    entitlementsByUser.clear();
    entitlementsById.clear();
    webhookAudit.clear();
    licenseKeys.clear();
}
