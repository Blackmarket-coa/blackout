# Edge Federation Tuning Guide (BO-602)

Status: Draft baseline
Owner: Federation Lead
Updated: 2026-03-16

## Goals

- Maintain acceptable federation behavior on unstable links.
- Reduce retry storms and queue amplification on low-bandwidth nodes.

## Recommended baseline

- Prefer shorter client timeouts with bounded exponential backoff.
- Cap long retry delays to avoid unbounded stale queue growth.
- Prioritize auth/state-critical events ahead of non-critical fanout bursts.
- Enable targeted quarantine controls for unstable or hostile peers.

## Validation checklist

- [ ] Retry/backoff profile verified on staging unstable-link simulation.
- [ ] Queue growth alert thresholds tuned for edge profile.
- [ ] Recovery latency measured after induced outage window.
