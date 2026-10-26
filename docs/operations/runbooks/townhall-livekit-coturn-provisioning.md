# Townhall LiveKit/coturn/TLS provisioning runbook

## Baseline topology

-   Edge TLS proxy (`nginx` or equivalent)
-   LiveKit SFU service
-   coturn relay
-   Metrics/log exporters

## Provisioning assets

-   `infra/townhall-staging/docker-compose.yml`
-   `infra/townhall-staging/livekit.yaml`
-   Validation evidence: `docs/operations/evidence/2026-03-16-townhall-provisioning-validation.md`

## Provisioning checklist

1. Create DNS entries for `livekit` and `turn` endpoints.
2. Provision TLS certificates and configure automatic renewal.
3. Configure coturn with long-term credentials and TLS ports.
4. Configure LiveKit with Redis coordination and restricted API keys.
5. Where the Blackout API's voice rooms use this LiveKit, send its webhooks to
   the API, or a voice-room mute or removal is not applied to someone who
   reconnects with a token issued before it:
   `webhook: { api_key: <the API's LIVEKIT_API_KEY>, urls: [http://<api-host>:<port>/v1/voice/livekit/webhook] }`,
   to the API's internal address (`packages/api/README.md`, "LiveKit's
   webhook"). `api_key` must be one of LiveKit's `keys`, or it does not start.
6. Restrict ingress to approved origins and expected media/signaling ports.
7. Validate end-to-end join/publish/subscribe in staging.

## Operational guardrails

-   Keep LiveKit server keys only in backend secret storage.
-   Rotate TURN and LiveKit credentials on incident or scheduled window.
-   Capture provisioning audit entries in release evidence docs.
