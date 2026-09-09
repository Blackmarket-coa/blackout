// Centralised env-flag accessors for the FBM → Matrix bridge. Read at call time
// (not module load) so tests can toggle them per case.

/** Master gate. Off by default until the bridge is rolled out. */
export const bridgeEnabled = (): boolean =>
    process.env.FBM_MATRIX_BRIDGE_ENABLED === '1' ||
    process.env.FBM_MATRIX_BRIDGE_ENABLED?.toLowerCase() === 'true';

/**
 * Gate for the Coalition aid-board mirror, separately from the Matrix gate.
 *
 * `aid.request.*` is the one bridge family that writes to `coalition_aid_posts`
 * rather than to a Matrix room, so it must not wait on a Matrix rollout — and,
 * equally, turning the Matrix bridge on must not silently start publishing
 * other people's asks on the map. Off by default, like the gate above.
 */
export const aidMirrorEnabled = (): boolean =>
    process.env.FBM_AID_MIRROR_ENABLED === '1' ||
    process.env.FBM_AID_MIRROR_ENABLED?.toLowerCase() === 'true';

/** Dead-drop room TTL in hours (AOG §4.1 default: 72). */
export const ttlHours = (): number => {
    const raw = Number.parseInt(process.env.FBM_DEADDROP_TTL_HOURS ?? '', 10);
    return Number.isFinite(raw) && raw > 0 ? raw : 72;
};

/** Dispute-room read-only retention in days (AOG §5.2 default: 90). */
export const disputeRetentionDays = (): number => {
    const raw = Number.parseInt(process.env.FBM_DISPUTE_RETENTION_DAYS ?? '', 10);
    return Number.isFinite(raw) && raw > 0 ? raw : 90;
};

/** Comma-separated MXIDs the dispute mediator is round-robin assigned from. */
export const mediatorPool = (): string[] =>
    (process.env.FBM_DISPUTE_MEDIATOR_POOL ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
