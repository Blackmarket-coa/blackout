/**
 * Federated ops, townhall, and revenue ops contracts (BKL-010).
 *
 * Mirrors the federation health, townhall lifecycle, and revenue ops
 * panels that `apps/blackout-web` panelizes today, lifted into a typed
 * protocol so canonical and legacy hosts agree on alert/lifecycle/snapshot
 * shapes.
 */

import type { EventEnvelope } from '../common/types';

export const FEDERATED_OPS_PROTOCOL_VERSION = 1 as const;

export const FEDERATED_OPS_EVENT_NAMES = {
    federationAlertStatus: 'co.bmc.federation.alert.status',
    townhallLifecycle: 'co.bmc.townhall.lifecycle',
    revenueOpsSnapshot: 'co.bmc.revenue.ops.snapshot',
} as const;

export type FederatedOpsEventName =
    (typeof FEDERATED_OPS_EVENT_NAMES)[keyof typeof FEDERATED_OPS_EVENT_NAMES];

/**
 * Severity for a federation alert. `info` is the floor; `critical` causes
 * the canonical health panel to surface a banner.
 */
export type FederationAlertSeverity = 'info' | 'warning' | 'critical';

export interface FederationAlertStatusPayload {
    /** Alert id (server-issued; opaque to receivers). */
    alertId: string;
    /** Severity level. */
    severity: FederationAlertSeverity;
    /** Short human-readable headline. */
    headline: string;
    /** Optional remote homeserver this alert is scoped to. */
    homeserver?: string;
    /** ISO-8601 timestamp the status was published. */
    publishedAt: string;
    /** Whether the alert is currently active (`false` indicates resolved). */
    active: boolean;
}

/**
 * Townhall lifecycle phases. Mirrors the legacy townhall tabs:
 * scheduling → live → archived.
 */
export type TownhallLifecyclePhase =
    | 'scheduled'
    | 'live'
    | 'archived'
    | 'cancelled';

export interface TownhallLifecyclePayload {
    /** Townhall id (opaque). */
    townhallId: string;
    /** Phase the townhall transitioned into. */
    phase: TownhallLifecyclePhase;
    /** ISO-8601 timestamp the phase took effect. */
    occurredAt: string;
    /** Topic of the townhall; informational only. */
    topic: string;
    /** Optional reason for cancellation; informational only. */
    cancellationReason?: string;
}

export interface RevenueOpsSnapshotPayload {
    /** Snapshot id. */
    snapshotId: string;
    /** ISO-8601 timestamp the snapshot was assembled. */
    capturedAt: string;
    /**
     * Currency code (ISO-4217). Receivers should treat unknown codes
     * defensively rather than throwing.
     */
    currency: string;
    /**
     * Aggregate revenue figures, expressed as base-unit strings to avoid
     * float precision drift (mirrors the BKL-003 treasury snapshot
     * convention).
     */
    figures: {
        gross: string;
        net: string;
        refunds: string;
        chargebacks: string;
    };
    /** Optional commentary from the operator. */
    notes?: string;
}

export type FederationAlertStatusEvent = EventEnvelope<
    'blackout.federation.alert.status',
    FederationAlertStatusPayload
>;

export type TownhallLifecycleEvent = EventEnvelope<
    'blackout.townhall.lifecycle',
    TownhallLifecyclePayload
>;

export type RevenueOpsSnapshotEvent = EventEnvelope<
    'blackout.revenue.ops.snapshot',
    RevenueOpsSnapshotPayload
>;
