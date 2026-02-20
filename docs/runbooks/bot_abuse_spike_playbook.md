# Bot and Abuse Spike Playbook

## Trigger conditions

- Login/registration burst exceeds baseline by >5x for 10 minutes.
- Federation inbound abuse signature match from WAF/modsecurity.
- Media upload abuse threshold breached.

## Temporary degradation modes

1. Switch registration to invite-only.
2. Apply stricter login and registration rate limits.
3. Enforce media upload caps and MIME restrictions.
4. Apply federation endpoint request shaping and queue caps.

## Recovery criteria

- Abuse traffic returns to normal baseline for 30 minutes.
- No active critical security alerts.
- Incident commander approves rollback of temporary controls.
