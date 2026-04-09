# Registration control architecture

Scope: API-first registration controls for invite-only onboarding, domain allowlisting, layered rate limiting/abuse throttles, and admin override paths.

---

## 1) Goals and non-goals

### Goals

- Support **invite-only mode** with single-use or multi-use invites.
- Enforce **email domain allowlist** (global and tenant-scoped variants).
- Add **rate limits** (IP, device fingerprint, email, invite token dimensions).
- Add **abuse throttles** with risk scoring and progressive friction.
- Provide auditable **admin override** controls with reason codes and expiry.

### Non-goals

- Replacing identity provider internals.
- CAPTCHA provider implementation details (treated as pluggable).
- Full fraud-model implementation (only integration points and storage are defined).

---

## 2) High-level architecture

```text
Client
  -> API Gateway / Edge
    -> Registration Middleware Chain
      1. Request normalization & identity hints extraction
      2. Global rate limiter (IP + ASN + CIDR)
      3. Domain policy evaluator
      4. Invite policy evaluator
      5. Abuse engine (risk score + throttle policy)
      6. Admin override evaluator
      7. Registration service (create user + audit events)
    -> PostgreSQL + Redis
```

Key storage split:

- **PostgreSQL**: source-of-truth for policy objects, invites, overrides, audits.
- **Redis**: hot path counters, sliding windows, token bucket states, short-lived locks.

---

## 3) API contract

All endpoints are prefixed with `/v1/registration`.

## 3.1 Public endpoints

### `POST /v1/registration/precheck`

Performs non-mutating eligibility checks before registration UX proceeds.

**Request**

```json
{
  "email": "user@example.com",
  "invite_code": "INV-ABC123",
  "fingerprint_id": "fp_...",
  "tenant_id": "optional-tenant",
  "client": {
    "ip": "inferred server-side",
    "user_agent": "..."
  }
}
```

**200 Response**

```json
{
  "eligible": true,
  "requirements": {
    "invite_required": true,
    "captcha_required": false,
    "email_domain_allowed": true
  },
  "limits": {
    "retry_after_seconds": 0,
    "remaining_attempts_window": 4
  },
  "decision_id": "dec_01J..."
}
```

**4xx/429 examples**

```json
{
  "eligible": false,
  "error": {
    "code": "DOMAIN_NOT_ALLOWED",
    "message": "Email domain is not permitted",
    "retry_after_seconds": 0
  },
  "decision_id": "dec_01J..."
}
```

Error codes (public-safe):

- `INVITE_REQUIRED`
- `INVITE_INVALID`
- `INVITE_EXHAUSTED`
- `DOMAIN_NOT_ALLOWED`
- `RATE_LIMITED`
- `ABUSE_THROTTLED`
- `CAPTCHA_REQUIRED`

### `POST /v1/registration`

Creates pending account (or final account, depending on verification policy).

**Request**

```json
{
  "email": "user@example.com",
  "password": "opaque client payload",
  "invite_code": "INV-ABC123",
  "captcha_token": "optional",
  "fingerprint_id": "fp_...",
  "tenant_id": "optional-tenant",
  "decision_id": "dec_01J..."
}
```

**201 Response**

```json
{
  "user_id": "usr_01J...",
  "status": "pending_verification",
  "next_step": "verify_email"
}
```

**409/429 Response**

```json
{
  "error": {
    "code": "ABUSE_THROTTLED",
    "message": "Registration temporarily blocked",
    "retry_after_seconds": 900
  }
}
```

### `POST /v1/registration/invite/validate`

Validates invite code without consuming it.

**Request**

```json
{
  "invite_code": "INV-ABC123",
  "email": "user@example.com"
}
```

**200 Response**

```json
{
  "valid": true,
  "invite": {
    "max_uses": 1,
    "remaining_uses": 1,
    "expires_at": "2026-12-31T23:59:59Z",
    "domain_restrictions": ["example.com"]
  }
}
```

## 3.2 Admin endpoints (RBAC: `registration_admin`)

### `PUT /v1/admin/registration/policy`

Upserts global/tenant registration policy.

```json
{
  "tenant_id": null,
  "invite_only": true,
  "domain_allowlist_enabled": true,
  "default_rate_policy": "strict",
  "abuse_policy": "progressive_challenge"
}
```

### `POST /v1/admin/registration/invites`

Creates invite(s).

```json
{
  "tenant_id": null,
  "max_uses": 1,
  "expires_at": "2026-08-01T00:00:00Z",
  "allowed_domains": ["example.com"],
  "metadata": {"campaign": "beta-wave-3"}
}
```

### `POST /v1/admin/registration/overrides`

Creates temporary override for specific actor (email/domain/ip/device).

```json
{
  "scope": "email",
  "scope_value": "vip@partner.com",
  "action": "ALLOW",
  "reason_code": "SUPPORT_ESCALATION",
  "expires_at": "2026-04-16T00:00:00Z"
}
```

### `GET /v1/admin/registration/audit?actor=...&from=...&to=...`

Retrieves append-only decision trail.

---

## 4) DB schema changes (PostgreSQL)

## 4.1 Core policy tables

```sql
create table registration_policy (
  id bigserial primary key,
  tenant_id text null,
  invite_only boolean not null default true,
  domain_allowlist_enabled boolean not null default true,
  default_rate_policy text not null default 'strict',
  abuse_policy text not null default 'progressive_challenge',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id)
);

create table registration_domain_allowlist (
  id bigserial primary key,
  tenant_id text null,
  domain text not null,
  is_active boolean not null default true,
  created_by text not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, domain)
);

create index idx_registration_domain_allowlist_active
  on registration_domain_allowlist (tenant_id, domain)
  where is_active = true;
```

## 4.2 Invite tables

```sql
create table registration_invite (
  id bigserial primary key,
  invite_code_hash text not null unique,
  tenant_id text null,
  created_by text not null,
  max_uses integer not null default 1,
  used_count integer not null default 0,
  expires_at timestamptz null,
  is_revoked boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (max_uses > 0),
  check (used_count >= 0 and used_count <= max_uses)
);

create table registration_invite_domain (
  id bigserial primary key,
  invite_id bigint not null references registration_invite(id) on delete cascade,
  domain text not null,
  unique (invite_id, domain)
);

create table registration_invite_use (
  id bigserial primary key,
  invite_id bigint not null references registration_invite(id) on delete cascade,
  user_id text null,
  email text not null,
  ip inet null,
  fingerprint_id text null,
  consumed_at timestamptz not null default now()
);
```

## 4.3 Overrides and audits

```sql
create type registration_override_scope as enum ('email','domain','ip','fingerprint','tenant');
create type registration_override_action as enum ('ALLOW','BYPASS_INVITE','BYPASS_DOMAIN','BYPASS_THROTTLE','DENY');

create table registration_override (
  id bigserial primary key,
  tenant_id text null,
  scope registration_override_scope not null,
  scope_value text not null,
  action registration_override_action not null,
  reason_code text not null,
  created_by text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz null
);

create index idx_registration_override_lookup
  on registration_override (tenant_id, scope, scope_value, expires_at)
  where revoked_at is null;

create table registration_decision_audit (
  id bigserial primary key,
  decision_id text not null unique,
  tenant_id text null,
  email_hash text null,
  ip inet null,
  fingerprint_id text null,
  invite_id bigint null references registration_invite(id),
  result text not null,
  reason_codes text[] not null,
  risk_score integer not null,
  rate_bucket_snapshot jsonb not null,
  override_id bigint null references registration_override(id),
  created_at timestamptz not null default now()
);

create index idx_registration_decision_audit_created_at
  on registration_decision_audit (created_at desc);
```

## 4.4 Backfill / migration notes

- Default policy row should be inserted in migration transaction.
- Existing users are unaffected; controls apply to new registrations only.
- Invite codes should be stored as **hashes** (e.g., HMAC-SHA256), never plaintext.

---

## 5) Middleware design

Order is critical to reduce cost and preserve security semantics.

## 5.1 Middleware chain

1. **Context extractor**
   - Normalize email/domain, parse tenant, infer client IP from trusted headers.
   - Derive stable fingerprint dimensions (if provided).

2. **Admin override pre-check**
   - Resolve active `ALLOW`/`DENY` overrides.
   - Hard `DENY` short-circuits request.

3. **Rate limit middleware**
   - Redis token buckets keyed by:
     - `reg:ip:<ip>`
     - `reg:email:<email_hash>`
     - `reg:domain:<domain>`
     - `reg:fp:<fingerprint_id>`
   - Return `429` with `Retry-After` when exceeded.

4. **Invite policy middleware**
   - If invite-only active, require invite code.
   - Verify hash match, not expired/revoked, usage not exhausted.
   - Optionally enforce invite-domain restrictions.

5. **Domain allowlist middleware**
   - If enabled, domain must exist in active allowlist.
   - Supports tenant override of global default.

6. **Abuse throttle middleware**
   - Build risk score from heuristics:
     - repeated attempts,
     - ASN reputation,
     - disposable email indicators,
     - velocity anomalies.
   - Actions by threshold:
     - low: allow,
     - medium: require CAPTCHA,
     - high: temporary block (`ABUSE_THROTTLED`).

7. **Registration handler**
   - Re-check invite row with transaction lock (`SELECT ... FOR UPDATE`).
   - Consume invite use atomically.
   - Create user/pending-user record.

8. **Audit sink (async acceptable)**
   - Persist decision event with reason codes and final outcome.

## 5.2 Pseudocode (simplified)

```pseudo
ctx = extractContext(req)
policy = loadPolicy(ctx.tenant)
override = findOverride(ctx)
if override.action == DENY: reject(403)

if !rateLimiter.allow(ctx): reject(429, retryAfter)

if policy.invite_only and !override.bypassInvite:
  invite = validateInvite(req.invite_code, ctx)
  if !invite.ok: reject(invite.error)

if policy.domain_allowlist_enabled and !override.bypassDomain:
  if !domainAllowed(ctx.domain): reject(403, DOMAIN_NOT_ALLOWED)

risk = scoreRisk(ctx)
if !override.bypassThrottle:
  decision = throttleDecision(risk)
  if decision == CHALLENGE and !captchaValid(req): reject(403, CAPTCHA_REQUIRED)
  if decision == BLOCK: reject(429, ABUSE_THROTTLED)

user = createUserTransactional(ctx, invite)
audit(decision_id, ctx, allow)
return 201
```

## 5.3 Admin override safety controls

- All overrides require:
  - `reason_code`,
  - `expires_at` (max TTL, e.g., 7 days),
  - actor identity and ticket reference.
- Dual-control for `BYPASS_THROTTLE` on production.
- Real-time alert when `DENY` or broad-scope override (`domain`/`tenant`) is created.

---

## 6) Rate limit and throttle baseline policies

Initial baseline (tune per traffic):

- IP: `10 / 10m` registration attempts.
- Email hash: `5 / 1h`.
- Domain: `100 / 10m`.
- Fingerprint: `8 / 30m`.
- Invite code validate endpoint: `20 / 10m` per IP.

Abuse thresholds:

- Risk `<40`: allow.
- Risk `40-69`: require CAPTCHA.
- Risk `>=70`: block 15 minutes.

---

## 7) Observability and audit requirements

- Metrics:
  - `registration_attempt_total{result,reason}`
  - `registration_rate_limited_total{dimension}`
  - `registration_abuse_challenge_total`
  - `registration_abuse_block_total`
  - `registration_override_active{scope,action}`
- Logs:
  - structured decision logs with `decision_id` correlation.
- Alerts:
  - spike in `DOMAIN_NOT_ALLOWED` (possible campaign abuse),
  - spike in `BYPASS_THROTTLE` overrides,
  - invite exhaustion anomalies.

---

## 8) Security and compliance notes

- Hash PII where possible in audit tables (email hash vs raw email).
- Use data retention policy for audit rows (e.g., 180 days hot, archived after).
- Ensure override and invite admin endpoints are protected by RBAC + MFA.
- Add immutable audit export path for incident investigations.
