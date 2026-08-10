# Data export

Every Blackout user can download everything the server holds about them, in one
click, in JSON, on any tier including Free.

From the app: **Settings → Privacy & data → Download your data**
(`DataRetentionSection.tsx`, testid `feature-toggle-data-export`). That button
previously called the older `/v1/auth/account/export`, which returns roughly ten
tables — so the UI was serving the weaker of the two exports while this one was
reachable only by curl. It now calls `/v1/data-export`.

Over HTTP:

```bash
curl -H "Authorization: Bearer $BLACKOUT_TOKEN" \
     https://api.theblackout.app/v1/data-export

# or save it straight to a file
curl -OJ -H "Authorization: Bearer $BLACKOUT_TOKEN" \
     "https://api.theblackout.app/v1/data-export?download=1"
```

That is the whole interface. No support ticket, no waiting for a job, no tier
check.

## Why this exists

Blackout already had an export — `GET /v1/transparency/audit-export` — but it
returns **HTTP 402** below the Coalition tier. Most users therefore had no way to
get their own data at all, which cannot support a data-portability claim. This
endpoint is free and stays free; see
[`docs/legal/policy-change-process.md`](../legal/policy-change-process.md) for
what changing that would require.

The two coexist. `audit-export` remains a tiered org-scoped capability;
`/v1/data-export` is the personal export everyone gets. Nothing in the export
path consults an entitlement, and nothing should start to.

## What you get

```jsonc
{
    "manifest": {
        "schema": "blackout.data-export.v1",
        "generatedAt": "2026-08-10T…",
        "userId": "…",
        "matrixHistory": { "included": false, "reason": "…", "howToExport": "…" },
        "excluded": ["Password hash…", "OAuth tokens…"]
    },
    "account": {
        /* profile, linked accounts, votes, posts, dead drops, … */
    },
    "socialGraph": {
        /* follows, profile, invitations, ring memberships */
    },
    "ledger": {
        /* external FBM standing + local credits, tips, reputation */
    }
}
```

The three sections are split by **system of record**, not flattened, because
they have genuinely different guarantees. Flattening them would hide which
numbers Blackout actually owns.

| Section       | Source                             | Notes                                                                                  |
| ------------- | ---------------------------------- | -------------------------------------------------------------------------------------- |
| `account`     | Blackout DB                        | Reuses the existing GDPR/DSAR export (`exportUserData`), so the two cannot drift apart |
| `socialGraph` | Blackout DB + process memory       | Follows and profiles are **not yet persisted** — see below                             |
| `ledger`      | External FBM service + Blackout DB | Balances are read through; Blackout does not own them                                  |

## Your messages are not in here, and that is the point

The export does **not** contain the contents of your encrypted rooms. The server
holds ciphertext and no keys — it cannot read them, so it cannot put them in a
file it generates. **A server-generated export that did contain your message
history would be evidence against the encryption claim.**

To export encrypted history, use a signed-in client, which has your keys:
Settings → Encryption → Export room keys, or your client's room-export feature.

Synapse's own `admin_cmd export-data` is vendored in `apps/blackout-server`, but
it is an operator CLI and for encrypted rooms it would only ever emit ciphertext.

The `manifest.matrixHistory` field says all of this inside the payload, so an
export read on its own is not mistaken for data loss.

## Honest gaps

These are stated in the payload as well as here, because a caveat that only
lives in documentation is a caveat most people never see.

-   **Follows and profiles are process-memory only.** They reset when the API
    restarts (`services/follows.ts`, `services/profileStore.ts`). Every section
    carries a `durability` marker of `persisted` or `process-memory`, and
    `socialGraph.warnings` names the affected ones. **An empty `following` list may
    mean the server forgot, not that you follow nobody.** Persisting them is
    tracked work; when it lands, the markers flip.
-   **Coalition Credit balances belong to FBM.** When that service is not
    configured or is unreachable, `ledger.external` reports
    `{ available: false, reason: "not_configured" | "unavailable" }` rather than a
    zero balance. An FBM outage degrades that one section; the rest of the export
    still succeeds.
-   **There is no hawala ledger, KARMA, or HRS balance.** Those names appear in
    design documents but have no implementation
    ([prior audit](../audits/competitor_depth_analysis_verification_2026_07.md)).
    `GIFT` exists but is a paid tip SKU, not a ledger unit. Exporting fields under
    those names would be fabrication, so the export says so in `ledger.notes`
    instead.

## What is deliberately withheld

-   **Credentials.** Password hash, OAuth tokens and API keys for linked
    integrations, vault ciphertext keys, canary tokens. These are credentials, not
    your data; exporting them would turn portability into a credential dump. A test
    asserts the password hash appears nowhere in the serialized payload.
-   **Other people's data.** A social graph is shared by construction. Edges _you_
    created are exported in full; inbound edges (your followers, who redeemed your
    invites) are reduced to counts. Handing you a list of everyone who follows you
    would export their associations under the banner of your portability.

## Rate limiting

Five exports per minute per user by default (`EXPORT_RATE_LIMIT_MAX`), keyed by
authenticated user rather than IP so users behind one NAT do not exhaust each
other. The limiter is deliberately **not** fail-closed: a Redis outage should not
stand between someone and their own data.

## Implementation notes

| Path                                                        | Role                                     |
| ----------------------------------------------------------- | ---------------------------------------- |
| `packages/api/src/routes/dataExport.ts`                     | Route, auth, rate limit, download header |
| `packages/api/src/services/dataExport/index.ts`             | Orchestrator, manifest, schema id        |
| `packages/api/src/services/dataExport/socialGraphExport.ts` | Connections                              |
| `packages/api/src/services/dataExport/ledgerExport.ts`      | Ledger, kept separate on purpose         |

**Why it is synchronous.** Every table is mirrored in process memory
(`db/store.ts`), so collection is a Map scan rather than a query. A job table
plus a leader-elected background runner plus artifact storage would add real
migration risk to solve a cost this shape does not yet have. The collector split
is what keeps that reversible: moving a collector behind a queue later does not
change the response shape.

**The limit, stated plainly:** this is O(rows in the largest scanned table) per
call, held in memory. The rate limiter bounds the blast radius. If the store ever
moves off the in-memory mirror, revisit this before the tables grow.

**Schema versioning.** `manifest.schema` is `blackout.data-export.v1`. Adding a
field does not bump it; removing one or changing a field's meaning does.
