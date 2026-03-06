# Service-Level Objectives and Error Budget Policy

## User-journey SLOs

- **Authentication availability:** 99.95% monthly.
- **Timeline sync freshness:** 99.9% of syncs under 5 seconds.
- **Message send success:** 99.95% under 3 seconds p95.
- **Federation delivery recovery:** backlog returns to baseline within 30 minutes after dependency recovery.

## Error budget

- Monthly budget for 99.95% SLO: 21m 54s.
- Burn-rate policy:
    - **Page:** 2-hour burn-rate at or above 3x budget-consumption pace.
    - **Ticket:** 24-hour burn-rate at or above 1.5x budget-consumption pace.
- Breach response:
    1. Freeze non-critical releases.
    2. Prioritize reliability fixes until burn-rate stabilizes.
    3. Require incident review + corrective action before feature-only deploys resume.

## Release gate

A release is blocked if any SLO is currently in breach without approved incident commander exception.
