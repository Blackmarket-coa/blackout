// Centralised env-flag accessors for the FBM → Matrix bridge. Read at call time
// (not module load) so tests can toggle them per case.

/** Master gate. Off by default until the bridge is rolled out. */
export const bridgeEnabled = (): boolean =>
    process.env.FBM_MATRIX_BRIDGE_ENABLED === '1' ||
    process.env.FBM_MATRIX_BRIDGE_ENABLED?.toLowerCase() === 'true';

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
