-- Den auto-welcome ledger (BLACKOUT_DEN_GREETER). Durable dedupe for the
-- appservice bot's one-time welcome message so a re-join — or a Synapse
-- transaction replay under a fresh txn id — never re-greets. No `id` column: the
-- natural key is the (room_id, user_id) pair, matching the pgDescriptors override
-- and the in-memory `${roomId}:${userId}` map key. TEXT ids / no cross-table FKs
-- to match the string-keyed write-through store, like 074_canary_tokens. Column
-- names are camelToSnake of DenGreetingRecord.
CREATE TABLE den_greetings (
  room_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  greeted_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (room_id, user_id)
);
