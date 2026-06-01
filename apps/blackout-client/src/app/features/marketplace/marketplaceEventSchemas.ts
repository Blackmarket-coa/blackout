// Defensive normalizer for FBM marketplace timeline events. The bridge posts
// these as `m.room.message` (msgtype `m.notice`) with a structured block embedded
// under a `co.bmc.marketplace.*` content key, so non-Blackout clients still see
// the plain `body`. Here we detect that block and hand the timeline a typed,
// validated shape to render a rich card — mirroring the governance eventSchemas
// pattern. Returns `null` for any non-marketplace message so the timeline falls
// back to the normal notice/text render.

import {
    FBM_BARTER_EVENT_TYPE,
    FBM_CREDITS_EVENT_TYPE,
    FBM_CUSTOMER_MESSAGE_EVENT_TYPE,
    FBM_CYCLE_EVENT_TYPE,
    FBM_DEADDROP_POINTER_EVENT_TYPE,
    FBM_DISPUTE_EVENT_TYPE,
    FBM_FLASH_SALE_EVENT_TYPE,
    FBM_INVENTORY_EVENT_TYPE,
    FBM_LEDGER_EVENT_TYPE,
    FBM_LOGISTICS_EVENT_TYPE,
    FBM_ORDER_EVENT_TYPE,
    isFbmBarterEventContent,
    isFbmCreditsEventContent,
    isFbmCustomerMessageContent,
    isFbmCycleEventContent,
    isFbmDisputeEventContent,
    isFbmFlashSaleContent,
    isFbmInventoryEventContent,
    isFbmLedgerEventContent,
    isFbmLogisticsEventContent,
    isFbmOrderEventContent,
    type FbmBarterEventContent,
    type FbmCreditsEventContent,
    type FbmCustomerMessageContent,
    type FbmCycleEventContent,
    type FbmDisputeEventContent,
    type FbmFlashSaleContent,
    type FbmInventoryEventContent,
    type FbmLedgerEventContent,
    type FbmLogisticsEventContent,
    type FbmOrderEventContent,
} from '@blackout/protocol';

export interface FbmDeaddropPointerContent {
    schemaVersion?: number;
    entitlementId: string | null;
    providerListingId?: string;
    kind?: string;
    expiresAt?: string;
}

export type NormalizedMarketplaceEvent =
    | { kind: 'order'; data: FbmOrderEventContent }
    | { kind: 'ledger'; data: FbmLedgerEventContent }
    | { kind: 'inventory'; data: FbmInventoryEventContent }
    | { kind: 'dispute'; data: FbmDisputeEventContent }
    | { kind: 'cycle'; data: FbmCycleEventContent }
    | { kind: 'customer_message'; data: FbmCustomerMessageContent }
    | { kind: 'logistics'; data: FbmLogisticsEventContent }
    | { kind: 'flash_sale'; data: FbmFlashSaleContent }
    | { kind: 'barter'; data: FbmBarterEventContent }
    | { kind: 'credits'; data: FbmCreditsEventContent }
    | { kind: 'deaddrop'; data: FbmDeaddropPointerContent };

const isRecord = (v: unknown): v is Record<string, unknown> =>
    typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Detect and validate a marketplace block embedded in an `m.room.message`
 * content. Returns the typed variant or `null` when none is present/valid.
 */
export const normalizeMarketplaceEventContent = (
    content: Record<string, unknown> | undefined | null
): NormalizedMarketplaceEvent | null => {
    if (!isRecord(content)) return null;

    const order = content[FBM_ORDER_EVENT_TYPE];
    if (isFbmOrderEventContent(order)) return { kind: 'order', data: order };

    const ledger = content[FBM_LEDGER_EVENT_TYPE];
    if (isFbmLedgerEventContent(ledger)) return { kind: 'ledger', data: ledger };

    const inventory = content[FBM_INVENTORY_EVENT_TYPE];
    if (isFbmInventoryEventContent(inventory)) return { kind: 'inventory', data: inventory };

    const dispute = content[FBM_DISPUTE_EVENT_TYPE];
    if (isFbmDisputeEventContent(dispute)) return { kind: 'dispute', data: dispute };

    const cycle = content[FBM_CYCLE_EVENT_TYPE];
    if (isFbmCycleEventContent(cycle)) return { kind: 'cycle', data: cycle };

    const message = content[FBM_CUSTOMER_MESSAGE_EVENT_TYPE];
    if (isFbmCustomerMessageContent(message)) return { kind: 'customer_message', data: message };

    const logistics = content[FBM_LOGISTICS_EVENT_TYPE];
    if (isFbmLogisticsEventContent(logistics)) return { kind: 'logistics', data: logistics };

    const flash = content[FBM_FLASH_SALE_EVENT_TYPE];
    if (isFbmFlashSaleContent(flash)) return { kind: 'flash_sale', data: flash };

    const barter = content[FBM_BARTER_EVENT_TYPE];
    if (isFbmBarterEventContent(barter)) return { kind: 'barter', data: barter };

    const credits = content[FBM_CREDITS_EVENT_TYPE];
    if (isFbmCreditsEventContent(credits)) return { kind: 'credits', data: credits };

    const drop = content[FBM_DEADDROP_POINTER_EVENT_TYPE];
    if (isRecord(drop)) {
        return {
            kind: 'deaddrop',
            data: {
                schemaVersion:
                    typeof drop.schemaVersion === 'number' ? drop.schemaVersion : undefined,
                entitlementId: typeof drop.entitlementId === 'string' ? drop.entitlementId : null,
                providerListingId:
                    typeof drop.providerListingId === 'string' ? drop.providerListingId : undefined,
                kind: typeof drop.kind === 'string' ? drop.kind : undefined,
                expiresAt: typeof drop.expiresAt === 'string' ? drop.expiresAt : undefined,
            },
        };
    }

    return null;
};
