-- FBM entitlements ACL sync state: the last Matrix power level the ACL sync
-- worker applied for an (mxid, room) pair, derived from the FBM entitlements
-- service's governance-role `matrixAcls`. Lets the worker skip no-op writes and
-- drives periodic drift-correction reconcile.
--
-- Column names are the snake_case of FbmAclStateRecord.

CREATE TABLE fbm_acl_state (
  mxid TEXT NOT NULL,
  room_id TEXT NOT NULL,
  power_level INTEGER NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (mxid, room_id)
);

CREATE INDEX idx_fbm_acl_state_mxid ON fbm_acl_state (mxid);
