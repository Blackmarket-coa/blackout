/* Copyright 2026 The Matrix.org Foundation C.I.C.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

CREATE TABLE IF NOT EXISTS e2e_device_key_revocations (
    user_id TEXT NOT NULL,
    device_id TEXT NOT NULL,
    key_identifier TEXT NOT NULL,
    revoked_ts BIGINT NOT NULL,
    PRIMARY KEY (user_id, device_id, key_identifier)
);

CREATE INDEX IF NOT EXISTS e2e_device_key_revocations_lookup
    ON e2e_device_key_revocations(user_id, key_identifier);

CREATE INDEX IF NOT EXISTS e2e_device_key_revocations_device_lookup
    ON e2e_device_key_revocations(user_id, device_id);
