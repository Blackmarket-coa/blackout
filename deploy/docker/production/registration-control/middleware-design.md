# Registration middleware design

This document specifies middleware execution order and behavior for registration decisions.

## Request processing order

1. **Context extraction**
   - Normalize input email/domain.
   - Resolve tenant and trusted client IP.
   - Attach correlation/decision ID.

2. **Admin override lookup**
   - Match active override by scope priority:
     1) email
     2) fingerprint
     3) ip
     4) domain
     5) tenant
   - If override action `DENY`, return `403` immediately.

3. **Rate limiter**
   - Token buckets in Redis:
     - `reg:ip:{ip}`
     - `reg:email:{sha256(email)}`
     - `reg:fp:{fingerprint}`
     - `reg:domain:{domain}`
   - On failure: return `429` + `Retry-After` and persist audit row.

4. **Invite gate**
   - If `invite_only=true`, require invite code unless override includes `BYPASS_INVITE`.
   - Validate invite by hashed code, expiration, revoked flag, and remaining uses.
   - If invalid/exhausted, return `403/409` with safe error code.

5. **Domain allowlist gate**
   - If `domain_allowlist_enabled=true`, ensure domain active in allowlist unless override includes `BYPASS_DOMAIN`.
   - Reject with `DOMAIN_NOT_ALLOWED` if unmatched.

6. **Abuse throttle**
   - Compute risk score from velocity + reputation signals.
   - Threshold actions:
     - `<40` allow
     - `40-69` challenge (captcha)
     - `>=70` block (`429`) unless override includes `BYPASS_THROTTLE`

7. **Registration transaction**
   - Start DB transaction.
   - Re-validate invite row `FOR UPDATE` (if used) and consume atomically.
   - Create pending user.
   - Commit.

8. **Audit write + metrics emit**
   - Persist decision with reason codes and risk score.
   - Emit structured logs and counters.

## Pseudocode

```pseudo
ctx = extract(req)
policy = policyStore.get(ctx.tenant)
override = overrideStore.match(ctx)

if override.action == DENY:
  deny(403, ADMIN_DENY)

if !rateLimiter.allow(ctx):
  deny(429, RATE_LIMITED)

if policy.invite_only and !override.has(BYPASS_INVITE):
  invite = inviteService.validate(ctx.inviteCode, ctx)
  if !invite.ok:
    deny(invite.httpStatus, invite.errorCode)

if policy.domain_allowlist_enabled and !override.has(BYPASS_DOMAIN):
  if !domainAllowlist.contains(ctx.tenant, ctx.domain):
    deny(403, DOMAIN_NOT_ALLOWED)

risk = abuseEngine.score(ctx)
if !override.has(BYPASS_THROTTLE):
  action = abuseEngine.action(risk)
  if action == CHALLENGE and !captcha.valid(req.captchaToken):
    deny(403, CAPTCHA_REQUIRED)
  if action == BLOCK:
    deny(429, ABUSE_THROTTLED)

with transaction:
  inviteService.consumeIfPresent(invite)
  user = userService.createPending(ctx)

audit.log(allow, ctx, risk)
return 201
```

## Failure semantics

- Fail closed on policy store or abuse engine timeout.
- Fail open only for metrics/audit sink, with retry queue.
- Never expose internal risk score in public API.

## Admin override controls

- Require `registration_admin` role + MFA.
- Mandatory fields: `reason_code`, `expires_at`, support ticket ID.
- Max override TTL: 7 days.
- Auto-expire and periodic cleanup job every hour.
- Real-time alert on `BYPASS_THROTTLE` and `DENY` creation.
