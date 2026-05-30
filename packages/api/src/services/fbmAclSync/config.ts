// Env-flag accessors for the ACL sync worker. Read at call time so tests can
// toggle per case.

export const aclSyncEnabled = (): boolean =>
    process.env.FBM_ACL_SYNC_ENABLED === '1' ||
    process.env.FBM_ACL_SYNC_ENABLED?.toLowerCase() === 'true';
