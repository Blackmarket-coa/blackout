# Whisperlists Product Specification

Status: Draft (MVP definition)  
Last updated: 2026-04-09  
Owner: Product + Trust & Safety + Privacy Engineering

## 1) Product summary

**Whisperlists** is a privacy-forward list feature for creating, organizing, and selectively sharing sensitive collections (people, places, tasks, resources, and notes) without exposing full list membership to unintended audiences.

Whisperlists is designed for users who need:
- Personal organization with strong privacy defaults.
- Controlled collaboration in small trusted circles.
- Fine-grained sharing where recipients can see only what they need.

---

## 2) Core jobs-to-be-done (JTBD)

## 2.1 Primary JTBD

1. **Capture quickly, organize later**
   - “When I discover something important, I want to save it instantly into a list so I don’t lose it.”
2. **Share safely with minimal exposure**
   - “When I share a list with trusted people, I want to reveal only relevant items and metadata.”
3. **Coordinate privately in small groups**
   - “When planning with others, I want collaborative editing/comments without making the full list public.”
4. **Retain control after sharing**
   - “When trust changes, I want to revoke access and ensure old links/exports are no longer valid.”

## 2.2 Secondary JTBD

- “Help me understand who accessed or changed sensitive list content.”
- “Let me separate ephemeral planning notes from durable list entries.”
- “Allow me to publish sanitized subsets while keeping the source list private.”

## 2.3 Non-goals (MVP)

- Large public community discovery feed.
- Real-time open editing by hundreds of users.
- Full marketplace/monetization workflows.

---

## 3) Target users and use cases

### User segments
- **Individual planners**: private shortlists, watchlists, reading lists.
- **Trusted small teams (2-20 users)**: confidential project coordination.
- **Community moderators/organizers**: curated recommendation packs with partial visibility.

### Canonical use cases
- Private personal list with optional one-off share link.
- Invite-only collaborative list with role-based access.
- Parent private list + public/sanitized child list for broader distribution.

---

## 4) Product principles

1. **Private by default**: every new list starts private.
2. **Least-privilege sharing**: give the minimum required access.
3. **Explicit audience clarity**: users always see who can currently access what.
4. **Reversible decisions**: access can be revoked with immediate effect for future requests.
5. **Safe collaboration over virality**: optimize trust and control, not growth hacks.

---

## 5) Privacy model

## 5.1 Data classification

- **List metadata**: title, description, tags, visibility state.
- **List entries**: content payload + optional attachments + source URLs.
- **Collaboration metadata**: comments, edit history, membership/roles.
- **Security telemetry**: access logs, policy decisions, abuse signals.

Each class has separate retention, encryption, and export rules.

## 5.2 Visibility model

List-level visibility (MVP):
- **Private**: owner-only.
- **Shared-invite**: explicit invitees only.
- **Link-restricted**: possession of signed link + optional passcode/expiration.

Item-level visibility (MVP):
- **Inherit list visibility** (default).
- **Restricted item** (owner/moderator can hide specific entries from some collaborators).

## 5.3 Privacy controls

- Default private list creation.
- Expiring links (e.g., 24h/7d/custom).
- Access revocation invalidates existing link tokens.
- Download/export permissions independently configurable from read access.
- Sensitive-item marking to disable resharing by non-owners.

## 5.4 Data protection requirements

- Encryption in transit (TLS) and at rest (KMS-managed keys).
- Scoped access tokens with short TTL.
- Immutable audit trail for access grants/revocations.
- Regional data residency controls (where available).
- Privacy-safe analytics (aggregated, de-identified by default).

## 5.5 User transparency requirements

- “Who can access this” panel available at all times.
- Per-list access log summary (recent viewers/editors).
- Plain-language legal/privacy notices on share creation.

---

## 6) Sharing and collaboration behavior

## 6.1 Roles (MVP)

- **Owner**: full control, delete/export/manage roles.
- **Editor**: add/edit/remove entries, comment, cannot change ownership.
- **Viewer**: read-only, optional comment permission by policy.

## 6.2 Invite and link flows

- Direct invite by account ID/email.
- Link share with configurable expiration and optional passcode.
- Optional domain allowlist for organization-scoped sharing.
- Pending invite state with revoke-before-accept support.

## 6.3 Collaboration UX

- Item comments and lightweight reactions.
- Edit history per item and list-level changelog.
- Conflict handling: last-write-wins + visible activity log (MVP).
- Presence indicators for active collaborators (future-ready, optional in MVP).

## 6.4 Revocation behavior

On revoke:
- Future API/UI access denied immediately.
- Existing active sessions receive token invalidation on refresh/next call.
- Shared links become invalid according to revoked policy.
- Prior recipients keep only data they already copied/exported (explicit warning shown at share time).

---

## 7) Abuse prevention and trust & safety

## 7.1 Threat model (MVP)

- Harassment through unwanted repeated sharing.
- Non-consensual doxxing/sensitive content distribution.
- Spam list invitations and malicious links.
- Coordinated misuse via disposable accounts.

## 7.2 Prevention controls

- Invite rate limits per user/IP/device risk tier.
- Link creation throttles and suspicious pattern detection.
- Content heuristics for high-risk PII leakage indicators.
- Account age/reputation gates for broad link sharing.

## 7.3 User safety controls

- Block user and suppress future invites.
- Report list/report item/report user flows.
- One-click “leave and remove access” for collaborators.
- Safety interstitials for externally shared links.

## 7.4 Moderation/ops controls

- Admin review queue with policy reason codes.
- Emergency kill-switch for compromised sharing mode.
- Evidence retention window for abuse investigations.
- Structured appeals workflow with SLA targets.

---

## 8) MVP scope vs future scope

## 8.1 MVP scope (must ship)

- Create/edit/delete private lists.
- Invite-based sharing with Owner/Editor/Viewer roles.
- Link sharing with expiration + optional passcode.
- Item CRUD + comments + basic change history.
- Access revocation and audit log basics.
- Abuse reporting + invite/link rate limiting.
- Minimal compliance notices and consent copy at share time.

## 8.2 Post-MVP (next)

- Granular per-item ACL matrix and policy templates.
- Organization admin controls (SSO policy, domain enforcement, DLP hooks).
- Advanced moderation automation and trust scoring.
- Real-time collaborative cursors/presence with merge assistance.
- Safe public publishing mode with moderation gate.
- Advanced search and semantic deduplication.

## 8.3 Future vision

- Cross-list federation and package sharing across trusted orgs.
- Encrypted collaboration spaces with optional client-side key control.
- Compliance-grade legal hold and eDiscovery exports.
- AI assistant for list hygiene/summarization with strict privacy guardrails.

---

## 9) Functional requirements (MVP)

1. User can create a private list in <= 2 interactions.
2. User can invite collaborator with selected role.
3. Owner can revoke any collaborator at any time.
4. User can create expiring link with optional passcode.
5. Viewer cannot edit content unless upgraded.
6. Owner can view recent access events.
7. User can report abusive list/item/user.

---

## 10) Success metrics

### Activation
- % new users creating first list within 24h.
- % lists with at least 1 item within 24h.

### Collaboration
- % lists shared at least once.
- Invite acceptance rate.
- Weekly collaborative edits per shared list.

### Privacy/safety
- % new lists left private (healthy privacy baseline).
- Revocation success latency (p95).
- Abuse report rate and substantiation rate.
- Time-to-action on high-risk abuse reports.

### Reliability
- List fetch/edit success rate.
- Permission-check error rate.
- Audit log write success rate.

---

## 11) Open questions

1. Should link viewers require authenticated accounts for regulated tenants?
2. What is the default retention for deleted items and audit events?
3. Which regions require explicit extra consent text for shared sensitive content?
4. Do we allow offline exports in MVP or defer to post-MVP?
