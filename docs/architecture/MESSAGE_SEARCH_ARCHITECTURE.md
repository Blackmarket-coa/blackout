# Message Search Architecture Proposal

## Goals and non-goals

### Goals
- Provide fast, relevant search across direct messages, group rooms, and channels.
- Enforce tenant, room, and per-message ACLs at query time.
- Support typo tolerance, phrase search, filters, and time slicing.
- Minimize privacy risk by avoiding plaintext indexing when possible.
- Honor legal/operational retention without data resurrection.

### Non-goals
- Full semantic vector search in v1 (can be layered later).
- Cross-tenant analytics over message bodies.

## 1) Indexing strategy

### Logical model
Use a **dual-store architecture**:
1. **Source of truth**: primary message store (authoritative events, redactions, retention state).
2. **Search index**: OpenSearch/Elasticsearch cluster for low-latency retrieval.

Index one document per visible message event, with optional denormalized room metadata.

### Ingestion pipeline
- Capture events from the message write path via append-only event stream (Kafka/NATS/Redis Streams).
- Build an idempotent indexer keyed by `{tenant_id, room_id, event_id, index_version}`.
- Process mutations:
  - `create` -> index doc
  - `edit` -> reindex doc with same stable id
  - `redact/delete` -> hard delete doc (or tombstone + async purge)
  - membership/ACL change -> mark affected room for backfill of ACL projection

### Field mapping
Recommended fields:
- `tenant_id` (keyword)
- `room_id` (keyword)
- `event_id` (keyword)
- `sender_id` (keyword)
- `timestamp` (date, millis)
- `body` (text with analyzer)
- `body_exact` (keyword for exact matches up to capped length)
- `mentions` (keyword)
- `attachments.filename` (text + keyword)
- `message_type` (keyword)
- `lang` (keyword)
- `visibility_acl` (flattened/set of principals or policy references)
- `retention_expiry_at` (date)

### Analyzer strategy
- Language-aware analyzers by detected language (`lang`), fallback standard analyzer.
- `body` subfields:
  - `body.stemmed` for recall
  - `body.shingles` for phrase quality
  - `body.prefix` (edge n-gram) for typeahead only
- Custom token filters for usernames, hashtags, and emoji aliases.

### Scale and index lifecycle
- Partition indices by tenant and time (e.g., monthly): `msg-{tenant}-{yyyyMM}`.
- Use Index Lifecycle Management (ILM): hot -> warm -> delete aligned with retention policy.
- Alias pattern:
  - write alias: `msg-{tenant}-write`
  - read alias: `msg-{tenant}-search`
- Blue/green index versioning (`v1`, `v2`) for schema migrations with dual-write + shadow-read.

## 2) Query syntax

Expose **simple syntax for users** and map to structured DSL server-side.

### User-facing grammar
- Terms: `incident outage`
- Phrase: `"database failover"`
- Required/excluded: `+postgres -mysql`
- Field filters:
  - `from:@alex`
  - `room:#ops`
  - `before:2026-03-01`
  - `after:2026-02-01`
  - `has:link|file|image`
  - `type:message|notice`
- Optional fuzzy suffix: `failuer~` (edit distance 1/2)

### Server parsing and validation
- Parse to AST, then compile to backend query DSL.
- Enforce safe limits:
  - max clauses
  - max wildcard expansion
  - max date span for unaudited users
- Reject expensive regex/wildcard-at-prefix patterns in v1.

### API contract (example)
```json
{
  "query": "\"database failover\" from:@alex after:2026-02-01 -staging",
  "room_ids": ["!abc:example"],
  "limit": 50,
  "cursor": "opaque"
}
```

## 3) Ranking

Use a **hybrid lexical ranking** pipeline.

### Candidate retrieval
- BM25 over `body.stemmed` + phrase matches on `body.shingles`.
- Small fuzzy expansion for short terms when no strong exact hits.

### Re-ranking features
Weighted blend:
- Text relevance score (primary)
- Exact phrase boost
- Proximity boost (query terms close together)
- Recency decay (configurable half-life, e.g., 14 days)
- Social/contextual boosts (same room, same participants) only if privacy-safe

### Deterministic tie-breaks
- Newer timestamp first, then `event_id` for stable pagination.

### Evaluation
- Build offline relevance set from anonymized click logs and curated judgments.
- Track NDCG@10, MRR, zero-result rate, p95 latency.
- Run interleaving/A-B tests per tenant cohort when enabled.

## 4) Privacy constraints

### Access control enforcement
- Query-time filter by tenant and ACL policy (room membership at query time + message visibility flags).
- Never trust client-provided room scope alone; always intersect with server-authorized scope.

### Encryption-aware approach
For E2EE rooms, choose policy explicitly:
1. **Client-side local index** (best privacy, limited global search).
2. **Server index of encrypted-derived tokens** (blind index / keyed hashes; lower recall, weaker UX).
3. **Opt-in searchable decryption enclave** (highest complexity/compliance burden).

Default recommendation: local-only search for strict E2EE, server search for non-E2EE.

### Data minimization
- Do not index message bodies for rooms flagged `no_server_index`.
- Exclude highly sensitive message types (secrets, one-time tokens) via classifier/rules.
- Store only required metadata in index; no IP/device fields in search docs.

### Auditing and abuse prevention
- Audit log every search request with requester, scope, and reason code (for enterprise modes).
- Rate-limit and anomaly-detect broad scraping behavior.

## 5) Retention interactions

Retention must apply to both source and derived search data.

### Policy model
- Effective expiry = `min(global_policy, tenant_policy, room_policy, legal_hold_override)`.
- Write `retention_expiry_at` into each indexed document at ingestion/update.

### Deletion flow
- At expiry: hard-delete from primary store and issue delete-by-id to search index.
- Run periodic reconciliation job to purge index orphans.
- ILM delete phase should be a coarse safety net, not sole enforcement mechanism.

### Redaction/legal hold edge cases
- Redaction: immediate tombstone in index, purge body fields first, then full delete.
- Legal hold: suspend deletion but tag documents with hold reason and audit trail.
- Hold release: re-evaluate expiry and enqueue deferred deletions.

## Rollout plan

1. MVP: lexical search, room/date/sender filters, ACL enforcement, retention delete hooks.
2. Hardening: relevance tuning, typo tolerance, audit dashboards, backfill tooling.
3. Advanced: optional semantic rerank, federated/multi-region query routing, E2EE privacy mode enhancements.

## SLO targets
- p95 query latency: < 350 ms for 30-day scope, < 700 ms for 1-year scope.
- Indexing freshness: 99% searchable within 10 seconds.
- ACL leakage incidents: 0 tolerated (block release on any confirmed leak).
