-- Invitation uses that account-number sign-up spent before any Blackout
-- account existed, and the account that later claimed each one.
--
-- POST /v1/auth/account-number mints a Matrix account only; its Blackout row is
-- created on the first token exchange. A presented invitation loses one use
-- when the account is minted, since the invite gate rests on that count. No
-- Blackout account exists yet to record a redemption for or to follow the
-- inviter from, so this row records the use against the new Matrix id. The
-- first POST /v1/invitations/redeem from the Blackout account with that Matrix
-- id claims it (claimed_at, claimed_by_user_id) and writes the redemption row
-- and the follow without spending a second use. A row is claimed at most once;
-- one never claimed keeps its use spent. Account deletion removes the
-- account's rows. See redeemInvitation in
-- packages/api/src/services/invitations.ts and D3 in
-- docs/security/api-findings-triage-2026-10-25.md.
--
-- Without this table the Postgres-backed store would keep admissions in memory
-- only, and after a restart an account's first redeem would spend a second use.
CREATE TABLE IF NOT EXISTS invitation_admissions (
  id TEXT PRIMARY KEY,
  invitation_token_id TEXT NOT NULL,
  matrix_user_id TEXT NOT NULL,
  matrix_invite_ok BOOLEAN,
  created_at TIMESTAMPTZ NOT NULL,
  claimed_at TIMESTAMPTZ,
  claimed_by_user_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_invitation_admissions_token_matrix_user
  ON invitation_admissions (invitation_token_id, matrix_user_id);
