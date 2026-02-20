# Secrets Rotation and Break-Glass Access Policy

## Rotation policy

- Rotate privileged credentials every 90 days.
- Rotate immediately on suspected compromise.
- Rotate after staff offboarding that had privileged access.

## Scope

- Matrix homeserver DB credentials.
- Object-storage backup keys.
- Federation signing and transport keys.
- Monitoring/alerting API tokens.

## Rotation workflow

1. Generate replacement secret in approved KMS/HSM-backed store.
2. Update staged environment and validate health checks.
3. Roll replacement to production with canary-first rollout.
4. Revoke prior secret and confirm revocation in audit logs.
5. Record ticket ID, approver, and completion timestamp.

## Break-glass policy

- Requires two-person approval (Incident Commander + Security).
- Time-boxed elevated access grant (max 60 minutes).
- Full command/session logging mandatory.
- Post-incident secret rotation required within 24 hours.
