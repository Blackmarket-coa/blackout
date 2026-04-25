# Integrations profile assets

This folder stores integration bridge configuration used by the optional Docker Compose `integrations` profile.

## Included templates

- `hookshot/config.yml.template` – Matrix Hookshot runtime config template.
- `hookshot/registration.yml.template` – Hookshot appservice registration template consumed by Synapse.
- `mautrix-discord/config.yaml.template` – Mautrix Discord runtime config template.
- `mautrix-discord/registration.yaml.template` – Mautrix Discord appservice registration template consumed by Synapse.
- `mautrix-discord/RUNBOOK.md` – Bridge-specific operations runbook for on-call and deployments.
- `templates/appservice-registration.yml.template` – Generic appservice registration template for dedicated bridges.
- `templates/appservice-config.yml.template` – Generic bridge runtime config template for dedicated bridges.

## Integration architecture note

### Choosing Hookshot vs a dedicated appservice bridge

Use **Hookshot** when:

- The requirement is webhook-style ingress/egress (GitHub/GitLab/Jira/feeds) rather than a full chat-network bridge.
- You need low operational overhead with one service handling multiple webhook providers.
- The traffic profile is mostly event fan-out to Matrix rooms and does not require complex identity mapping.

Use a **dedicated appservice bridge** (`matrix-appservice-discord`, `matrix-appservice-irc`, `matrix-appservice-slack`, and Mautrix bridges) when:

- You need bidirectional, long-lived chat bridging with protocol-specific semantics.
- You need richer user/puppet management, permission models, and media handling.
- You need per-network lifecycle isolation (separate deploy cadence, restart domain, and data retention policy).

Design preference:

1. Prefer Hookshot for webhook/event integrations.
2. Prefer dedicated bridges for third-party chat-network interop.
3. If uncertain, run a short pilot and promote to a dedicated bridge when identity mapping, reliability, or moderation controls exceed Hookshot scope.

### Required operational controls

These controls are mandatory for **all** bridge classes.

#### 1) Registration management

- Store every registration (`registration.yml`) in version control as a template and render secrets at deploy time.
- Keep `id`, sender localpart, and namespace regexes unique per bridge.
- Require a change review for namespace expansions to prevent user/alias takeover.
- Keep an explicit inventory of active registrations in Synapse `app_service_config_files`.

#### 2) Token rotation

- Rotate `as_token` and `hs_token` on a regular schedule (recommended: every 90 days) and immediately on suspected compromise.
- Rotation process must be dual-write safe: stage updated registration + bridge config, restart bridge, then restart Synapse.
- Revoke and delete superseded tokens after successful cutover.

#### 3) Database backups

- Dedicated bridges that maintain state (e.g., portals, ghosts, receipts, encryption metadata) must use scheduled backups.
- Minimum baseline: daily encrypted backup + point-in-time capability for bridge databases.
- Validate restore quarterly in a non-production environment.

#### 4) Alerting and observability

- Alert on bridge process down, sustained message failure rates, backlog growth, and repeated authentication failures.
- Emit structured logs with request IDs / event IDs to correlate Matrix-side and bridge-side failures.
- Define SLOs per bridge (availability and message delivery latency) and review error budgets.

### Security model by bridge class

#### Hookshot security model

- Trust boundary: webhook providers and Matrix homeserver.
- Primary risk: spoofed webhook events, over-broad room targeting, and leaked webhook secrets.
- Required controls:
  - Verify provider signatures/secrets for every inbound webhook.
  - Restrict outbound room mapping to explicit allowlists.
  - Use least-privilege bot power levels; do not grant admin by default.
  - Keep Hookshot registration namespaces tightly scoped.

#### Dedicated appservice bridge security model

- Trust boundary: external chat network APIs, bridge runtime, and Matrix homeserver.
- Primary risk: token compromise, identity spoofing via puppet users, and cross-protocol abuse propagation.
- Required controls:
  - Isolate each bridge with separate credentials, DB, and runtime secret set.
  - Use least-privilege API scopes on external networks.
  - Constrain appservice namespace regexes to owned prefixes only.
  - Apply per-bridge egress controls and rate limits where possible.
  - For E2EE-capable bridges (notably Mautrix), protect crypto material with encrypted at-rest storage and access controls.

## Rendering templates

From `deploy/docker/blackout-backend/`, render files after setting `.env` values:

```bash
docker compose --profile integrations run --rm matrix-hookshot true
```

The Hookshot service startup command renders:

- `integrations/hookshot/config.yml`
- `integrations/hookshot/registration.yml`

The Mautrix Discord startup command renders:

- `integrations/mautrix-discord/config.yaml`
- `integrations/mautrix-discord/registration.yaml`

Generic appservice templates can be rendered with `envsubst` (or your deployment tooling), for example:

```bash
envsubst < integrations/templates/appservice-registration.yml.template > integrations/<bridge>/registration.yml
envsubst < integrations/templates/appservice-config.yml.template > integrations/<bridge>/config.yml
```

## Synapse registration path

Add each rendered registration file path to Synapse `app_service_config_files` in `synapse/homeserver.yaml.template`:

```yaml
app_service_config_files:
  - /integrations/hookshot/registration.yml
  - /integrations/<bridge>/registration.yml
  - /integrations/mautrix-discord/registration.yaml
```

The `synapse` service mounts this folder read-only at `/integrations`.

## Runbook

### Onboarding a bridge

1. Select bridge class (Hookshot vs dedicated appservice) using the architecture criteria above.
2. Copy templates into `integrations/<bridge>/` and render with unique IDs, namespaces, tokens, and endpoint URLs.
3. Add the registration path to Synapse `app_service_config_files`.
4. Provision bridge secrets in the runtime secret store and confirm token ownership/documentation.
5. Start bridge, then verify:
   - appservice registration loaded by Synapse,
   - successful bridge health checks,
   - end-to-end message flow in a test room.
6. Enable alerting and attach the bridge to operational dashboards before production traffic.

### Decommissioning a bridge

1. Freeze new room/user provisioning on the bridge.
2. Remove/disable routing in bridge config and notify affected room owners.
3. Remove registration from Synapse `app_service_config_files` and restart Synapse.
4. Stop bridge workloads and revoke all external + appservice tokens.
5. Archive required logs/DB snapshots according to retention policy, then schedule secure data deletion.
6. Remove bridge inventory entries and close monitoring/alert rules.

### Federation blast-radius handling

Use this procedure when a bridge causes abusive traffic, federated spam bursts, or remote server instability:

1. **Contain quickly**
   - Disable the specific bridge registration (or stop only the offending bridge service).
   - If needed, block affected namespaces/rooms temporarily.
2. **Stabilize federation**
   - Apply temporary outbound rate limits and/or deny rules for impacted remote domains.
   - Coordinate with server admins/moderators to pause auto-portal creation.
3. **Eradicate root cause**
   - Rotate bridge and remote-network credentials.
   - Patch bridge config/policy gaps (namespace scope, allowlists, ACLs).
4. **Recover safely**
   - Re-enable in phases (read-only bridge mode first when supported, then full send).
   - Monitor federation queues, error rates, and moderation reports for at least one full traffic cycle.
5. **Post-incident actions**
   - Record timeline, blast-radius estimate, and control improvements.
   - Update this runbook and bridge-specific SOPs with concrete guardrails.
