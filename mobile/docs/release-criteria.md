# Mobile release criteria and phased rollout

## Core release criteria

- **Crash-free sessions**: >= 99.5% over trailing 24h before expanding rollout.
- **Cold start p95**: <= 2.2s on target tier-1 devices and <= 3.0s on tier-2 devices.
- **Notification delivery SLA**: >= 98% delivered within 30 seconds for high-priority message notifications.
- **Token refresh reliability**: >= 99.9% refresh success over trailing 24h.
- **Push registration reliability**: >= 99% successful device registration after retry policy.

## Staged rollout plan

1. **Internal test tracks (required gate)**
   - iOS: TestFlight internal testers only.
   - Android: Play Console internal testing track only.
   - Duration: at least 48 hours with synthetic and real-user monitoring.
2. **Phase 1 (5%)**
   - Expand to 5% of production audience.
   - Hold for 24 hours, validate SLAs and crash-free targets.
3. **Phase 2 (25%)**
   - Expand to 25% if all targets remain green.
   - Hold for 24 hours.
4. **Phase 3 (50%)**
   - Expand to 50%, watch push and deep-link open funnels.
5. **Phase 4 (100%)**
   - Full rollout with daily monitoring and rollback automation armed.

## Rollback triggers

- Crash-free sessions < 99.0% for 30 minutes.
- p95 cold start exceeds target by >20% for 60 minutes.
- Notification SLA breach for >15 minutes.
- Any token refresh outage affecting >2% of sessions.
