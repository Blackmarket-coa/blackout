# Data Classification Matrix (Phase 0)

This matrix defines what data exists, where it is allowed, retention expectations, and prohibited joins.

| Data class                 | Examples                                                      | Allowed layer(s)                                | At rest                       | In transit                          | Retention target                     | Forbidden access/join                          |
| -------------------------- | ------------------------------------------------------------- | ----------------------------------------------- | ----------------------------- | ----------------------------------- | ------------------------------------ | ---------------------------------------------- |
| Account identity           | User ID, device ID, auth session IDs                          | Client, Matrix/Federation, Commerce             | Encrypted DB/KV stores        | TLS/mTLS                            | Operational minimum                  | Must not be joined with plaintext content      |
| Payment identity           | Customer ID, invoices, payout account IDs                     | Commerce only                                   | Encrypted billing systems     | TLS/mTLS                            | Finance/legal minimum                | Must not join with room/message plaintext      |
| Entitlements               | Plan tier, feature flags, limit ceilings                      | Commerce + Client                               | Signed tokens + cache         | TLS/mTLS                            | Short-lived + auditable snapshots    | Must not encode social graph/content patterns  |
| Transport metadata         | Event IDs, room IDs, timestamps, sizes, retry counters        | Matrix/Federation, Infrastructure               | Encrypted service storage     | TLS/mTLS                            | Short bounded operational windows    | Must not include plaintext payloads            |
| Encrypted event payload    | Ciphertext event bodies                                       | Matrix/Federation                               | Encrypted storage             | Matrix protocol/TLS                 | TTL-bound per room policy            | Must not be decrypted server-side              |
| Key material (user/device) | Olm/Megolm sessions, local key backup material                | Client only (except encrypted backup artifacts) | OS keystore/secure enclave    | E2EE-protected transport only       | User-controlled lifecycle            | Never available in plaintext to commerce/infra |
| Stego payload artifacts    | Emoji carrier strings, PNG stego bytes                        | Client; transport as opaque data                | Local cache (TTL constrained) | End-to-end encrypted event carriage | TTL + local policy                   | Never decoded server-side                      |
| Abuse control state        | Rate-limit counters, trust tiers, invite velocity             | Governance/Safety + Matrix/Federation           | Encrypted operational stores  | TLS/mTLS                            | Short to moderate bounded windows    | Must not rely on content classification        |
| Legal response metadata    | Account registration timestamps, billing records, server logs | Governance/Safety + Commerce + Infra            | Encrypted archives            | Secure legal workflow               | Jurisdiction-dependent legal minimum | Must exclude message plaintext and keys        |

## Handling rules

1. Default classification for new fields is **restricted** until reviewed.
2. Any proposed cross-class join requires Security/Privacy approval.
3. Analytics events must be red-team reviewed for inadvertent content inferences.
4. Retention reductions take precedence over convenience caching.

## Required controls

- Encryption at rest for all server data classes.
- Mandatory transport encryption between services.
- Access logs for privileged reads of identity/payment/legal metadata.
- Automatic expiry jobs for TTL-bound classes.

## Review cadence

- Review matrix each milestone or whenever a new data class is introduced.
