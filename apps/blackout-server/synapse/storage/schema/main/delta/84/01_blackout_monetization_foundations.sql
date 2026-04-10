/* Copyright 2026 The Matrix.org Foundation C.I.C.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 */

CREATE TABLE IF NOT EXISTS blackout_user_entitlements (
    user_id TEXT PRIMARY KEY,
    tier TEXT NOT NULL,
    status TEXT NOT NULL,
    updated_ts BIGINT NOT NULL,
    source_event_id TEXT,
    billing_customer_id TEXT,
    billing_subscription_id TEXT
);

CREATE TABLE IF NOT EXISTS blackout_billing_webhook_events (
    event_id TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    event_type TEXT NOT NULL,
    received_ts BIGINT NOT NULL,
    processed_ts BIGINT NOT NULL,
    status TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS blackout_user_entitlements_tier_idx
    ON blackout_user_entitlements (tier);

