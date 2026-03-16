# Townhall LiveKit/coturn/TLS provisioning runbook

## Baseline topology

- Edge TLS proxy (`nginx` or equivalent)
- LiveKit SFU service
- coturn relay
- Metrics/log exporters

## Provisioning assets

- `infra/townhall-staging/docker-compose.yml`
- `infra/townhall-staging/livekit.yaml`
- Validation evidence: `docs/operations/evidence/2026-03-16-townhall-provisioning-validation.md`

## Provisioning checklist

1. Create DNS entries for `livekit` and `turn` endpoints.
2. Provision TLS certificates and configure automatic renewal.
3. Configure coturn with long-term credentials and TLS ports.
4. Configure LiveKit with Redis coordination and restricted API keys.
5. Restrict ingress to approved origins and expected media/signaling ports.
6. Validate end-to-end join/publish/subscribe in staging.

## Operational guardrails

- Keep LiveKit server keys only in backend secret storage.
- Rotate TURN and LiveKit credentials on incident or scheduled window.
- Capture provisioning audit entries in release evidence docs.
