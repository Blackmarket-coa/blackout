# Minimum Federation-Safe `m.blackout.signal` Schema + Test Cases

Date: 2026-02-27  
Owner: Protocol Engineer

## Minimum required content (schema_version = 2)

Federated and local acceptance requires:

- Top-level event type: `m.blackout.signal`
- `content.schema_version` must equal `2`
- `content.message_metadata.message_id` (non-empty string)
- `content.message_metadata.sender_key_id` (non-empty string)
- `content.message_metadata.content_class` in:
  - `webrtc-session`
  - `chunk-announcement`
  - `offline-retrieval`
  - `control`

Max serialized payload size: **64 KiB**.  
All other supported sections are optional (`ice_candidates`, `sdp_offer`, `sdp_answer`, `chunk_announcements`, `offline_retrieval`, `self_destruct_after`) and are validated if present.

## Rejection rules

Events are rejected when:

- Unknown top-level signal content fields are present.
- Required `message_metadata` fields are missing.
- Section shapes are invalid (e.g. malformed `sdp_offer`, wrong candidate shape).
- Hash / redundancy semantic checks fail.

## Test case set (published)

### Positive

1. Minimal valid signaling event (`message_metadata` only).
2. SDP offer + required metadata.
3. Chunk announcements with valid hash and redundancy metadata.

### Negative

1. Missing `message_metadata`.
2. Unknown root field in signal content.
3. Invalid chunk hash / merkle hash format.
4. Invalid ICE candidate shape.

## Implementation linkage

- Validation code: `synapse/util/blackout.py`
- Local ingress enforcement: `synapse/handlers/message.py`
- Federated ingress enforcement: `synapse/handlers/federation_event.py`
- Regression tests: `tests/util/test_blackout.py`, `tests/handlers/test_message.py`, `tests/handlers/test_federation_event.py`
