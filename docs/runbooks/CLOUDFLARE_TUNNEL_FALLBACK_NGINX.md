# Cloudflare Tunnel Fallback to Direct nginx Ingress

Foundation milestone deliverable per
[`AGGRESSIVE_OPERATIONS_GUIDE.md` §2.4, §4.2, §9.3](../AGGRESSIVE_OPERATIONS_GUIDE.md):
"Cloudflare Tunnel fallback nginx documented" is a Foundation cross-cutting
item; "Cloudflare Tunnel fallback nginx enabled" follows in the
Differentiation milestone.

This runbook covers cutover from Cloudflare Tunnel to the existing
direct-nginx ingress when the tunnel is unavailable, and the cutback when
the tunnel is restored. It does not introduce a new nginx config; the
fallback nginx is the existing single-server-baseline configuration at
[`infra/single-server-baseline/nginx/sites-available/theblackout.app.conf`](../../infra/single-server-baseline/nginx/sites-available/theblackout.app.conf),
served with Let's Encrypt certificates and the proxy snippets at
[`infra/single-server-baseline/nginx/snippets/`](../../infra/single-server-baseline/nginx/snippets/).

The companion runbook
[`../../deploy/docker/production/CLOUDFLARE_TUNNEL_MIGRATION_RUNBOOK.md`](../../deploy/docker/production/CLOUDFLARE_TUNNEL_MIGRATION_RUNBOOK.md)
describes the steady-state tunnel topology this runbook fails *away* from.

---

## When to invoke

Trigger this runbook when one or more of the following are true:

- `cloudflared` agent is unhealthy on the primary host and cannot be
  recovered within the operator's tolerance window.
- Cloudflare Tunnel as a service is degraded such that the BMC public
  endpoints are unreachable but origin services are healthy.
- A scheduled maintenance window requires temporarily removing tunnel
  routing (rare; this is the "differentiation milestone enabled" path,
  not a regular operation).

Do not invoke when:

- The origin services themselves are down. Failing over the ingress does
  not help if the application can't serve. Use the application-level
  runbooks first.
- A specific hostname is misconfigured but others work. Fix the route in
  Cloudflare; do not flip the whole ingress.

The single-point-of-failure context for this decision is
[`../operations/SPOF_MAP.md`](../operations/SPOF_MAP.md) rows 2 and 14
(Cloudflare Tunnel and the cloudflared agent process).

---

## Architecture during fallback

```
Public DNS (Cloudflare)
        │
        ▼
[A/AAAA records pointing at primary host's public IP]
        │
        ▼
nginx on the primary host (ports 80, 443)
        │  - TLS terminated with Let's Encrypt certs
        │  - HSTS, CSP, security-headers from snippets/
        │  - Per-route rate limits (matrix_login, matrix_register,
        │    matrix_media_upload, matrix_federation_ingress)
        ▼
Backend services (Docker network):
   frontend:8080    (blackout web client)
   api:9000         (Blackout API)
   synapse:8008     (Matrix homeserver)
   coturn:9641      (TURN admin)
```

This is the same backend topology as steady-state; only the public path
differs. The Docker network names match
[`infra/single-server-baseline/RUNBOOK.md`](../../infra/single-server-baseline/RUNBOOK.md).

---

## 1) Pre-staged readiness (do this *before* you need it)

These steps must be complete during the Foundation milestone so the failover
in §2 is fast. They do not flip ingress; they make the flip possible.

### 1.1 nginx config staged on the primary host

- [ ] [`infra/single-server-baseline/nginx/sites-available/theblackout.app.conf`](../../infra/single-server-baseline/nginx/sites-available/theblackout.app.conf)
      is rendered onto the host (`/etc/nginx/sites-available/theblackout.app.conf`
      under the standard nginx package, or the equivalent path inside the
      compose nginx container).
- [ ] The proxy and security-headers snippets are at
      `/etc/nginx/snippets/proxy-common.conf` and
      `/etc/nginx/snippets/security-headers.conf`.
- [ ] `nginx -t` passes.

### 1.2 Let's Encrypt certificates obtained

- [ ] `/etc/letsencrypt/live/theblackout.app/{fullchain,privkey,chain}.pem`
      exist and are current. The certbot challenge path
      `^~ /.well-known/acme-challenge/` is handled by the port-80 server in
      the config.
- [ ] Certbot renewal hook is configured. Renewals must work *while* the
      tunnel is the live ingress (i.e., the pre-staged port-80 server has
      a path that is reachable for HTTP-01 challenges, or DNS-01 is in use).
      Document the renewal mechanism wherever the operator can find it.
- [ ] HTTPS handshake against the primary host's public IP (bypassing DNS)
      with `--resolve theblackout.app:443:<host-ip>` returns the expected
      cert.

### 1.3 DNS records pre-prepared

- [ ] Identify every hostname currently routed via Cloudflare Tunnel CNAME.
      Export the current configuration as JSON/CSV for rollback.
- [ ] Pre-create A/AAAA records pointing at the primary host's public IP,
      *paused* or *grey-clouded* (Cloudflare proxy disabled), so they exist
      but do not currently take traffic. These are the records §2 enables.
- [ ] Confirm TTL on the production records is at most 60 seconds. If higher,
      lower it now. Cutover speed during an outage is bounded by TTL.

### 1.4 Firewall and routing

- [ ] Inbound 80/tcp and 443/tcp are reachable from the public internet to
      the primary host. They may be firewalled in steady state if all
      ingress is via tunnel; if so, the firewall rule must be ready to
      flip.
- [ ] Origin certificates: if Cloudflare's "Authenticated Origin Pulls" is
      enabled in steady state, confirm whether the fallback nginx supports
      the same authentication or whether the fallback intentionally relaxes
      that to "Full (strict)" with public Let's Encrypt certs (the
      recommended posture; see §1.2).

### 1.5 Drill validation

- [ ] At least once per Foundation milestone, perform a *dark cutover
      drill*: temporarily resolve a single hostname to the primary host's
      public IP via `/etc/hosts` on a test client, confirm nginx serves the
      expected response, and confirm rate limits are present (`limit_req`
      zones in
      [`infra/single-server-baseline/nginx/sites-available/theblackout.app.conf`](../../infra/single-server-baseline/nginx/sites-available/theblackout.app.conf)).
- [ ] Record the drill in
      [`../operations/evidence/`](../operations/evidence/) per
      [`../operations/BUS_FACTOR_DRILL_CADENCE.md`](../operations/BUS_FACTOR_DRILL_CADENCE.md).

---

## 2) Failover procedure (tunnel → nginx)

Execute when §1 has been completed and the trigger conditions are met.

### 2.1 Confirm the situation

- [ ] Confirm origin services are healthy (Blackout web, Blackout API,
      Synapse, coturn). If any is down, fix that first; failing over the
      ingress will not help.
- [ ] Confirm the tunnel side is the failure (cloudflared logs, Cloudflare
      Zero Trust dashboard tunnel status).

### 2.2 Open ingress on the primary host

- [ ] If 80/443 are firewalled to public, open them now.
- [ ] Start (or confirm running) the nginx process:
      ```
      sudo nginx -t && sudo systemctl reload nginx
      ```
      or for the compose-based deployment, start the `reverse-proxy`
      service per
      [`infra/single-server-baseline/RUNBOOK.md`](../../infra/single-server-baseline/RUNBOOK.md).
- [ ] Confirm `https://theblackout.app/` resolves to the expected cert when
      hit via `--resolve` to bypass DNS.

### 2.3 Flip DNS

For each hostname in §1.3:

- [ ] In Cloudflare DNS:
  - Disable / delete the tunnel CNAME.
  - Activate the pre-prepared A/AAAA record pointing at the primary host's
    public IP. Recommendation: keep proxy on (orange cloud) so Cloudflare
    still terminates TLS at the edge for the public-facing hostname; this
    means TLS mode must be **Full (strict)** and the primary host serves
    Let's Encrypt to Cloudflare.
  - Save.
- [ ] Wait for DNS propagation. With TTL at 60s expect convergence within
      5 minutes for most resolvers.

### 2.4 Validate

- [ ] `https://theblackout.app/` returns the web client.
- [ ] `https://api.theblackout.app/health` returns 200.
- [ ] `https://matrix.theblackout.app/_matrix/client/versions` returns the
      Synapse versions document.
- [ ] `https://matrix.theblackout.app/.well-known/matrix/server` returns
      the JSON declaring `matrix.theblackout.app:443`.
- [ ] Federation traffic to and from at least one peer homeserver succeeds
      (test by sending a message in a federated room from a separate
      account).
- [ ] Synthetic probes (if configured) flip green.

### 2.5 Communicate

- [ ] Coalition and vendor partners notified that ingress is in fallback
      mode and that latency/reliability characteristics may differ briefly.
      Use the milestone-anchored register from
      [`../AGGRESSIVE_OPERATIONS_GUIDE.md` §6.4](../AGGRESSIVE_OPERATIONS_GUIDE.md).
- [ ] Update
      [`../operations/SPOF_MAP.md`](../operations/SPOF_MAP.md)
      row 2 in-place with a dated note "fallback nginx active since YYYY-MM-DD".

---

## 3) Cutback procedure (nginx → tunnel)

Once Cloudflare Tunnel is healthy again.

- [ ] Confirm tunnel health from the Cloudflare Zero Trust dashboard and
      from `cloudflared` logs on the primary host.
- [ ] Re-enable the tunnel ingress rules in cloudflared per
      [`../../deploy/docker/production/CLOUDFLARE_TUNNEL_MIGRATION_RUNBOOK.md`](../../deploy/docker/production/CLOUDFLARE_TUNNEL_MIGRATION_RUNBOOK.md).
- [ ] In Cloudflare DNS, replace each A/AAAA fallback record with the
      tunnel CNAME (the inverse of §2.3).
- [ ] Wait for DNS propagation.
- [ ] Run §2.4 validation again — same checks, but expect tunnel to be the
      live path.
- [ ] If §1.4 firewalled 80/443 in steady state, re-apply that rule once
      cutback is confirmed.
- [ ] Update
      [`../operations/SPOF_MAP.md`](../operations/SPOF_MAP.md)
      row 2 to remove the dated fallback note.

---

## 4) What this runbook does *not* cover

- Cloudflare account loss (a different SPOF — row 10 in
  [`../operations/SPOF_MAP.md`](../operations/SPOF_MAP.md)). If the
  Cloudflare account is compromised or lost, DNS itself is at risk and the
  registrar is the recovery surface.
- DDoS protection. The fallback nginx posture loses Cloudflare's edge
  scrubbing if the proxy/orange-cloud is disabled. The recommendation in
  §2.3 keeps the proxy enabled to retain edge protection; if you disable
  the proxy (grey-cloud), accept the loss of edge mitigation and prepare to
  re-enable quickly if traffic shape changes.
- Differentiation-milestone *always-on* fallback. That's
  [`AGGRESSIVE_OPERATIONS_GUIDE.md` §9.3](../AGGRESSIVE_OPERATIONS_GUIDE.md)'s
  "Cloudflare Tunnel fallback nginx **enabled**" row, which is a different
  posture (active-active or warm standby). This runbook is the
  documented-but-not-enabled path.

---

## Cross-references

- [`../AGGRESSIVE_OPERATIONS_GUIDE.md` §2.4](../AGGRESSIVE_OPERATIONS_GUIDE.md) — unified deployment topology
- [`../AGGRESSIVE_OPERATIONS_GUIDE.md` §4.2](../AGGRESSIVE_OPERATIONS_GUIDE.md) — SPOF mitigations
- [`../AGGRESSIVE_OPERATIONS_GUIDE.md` §9.3](../AGGRESSIVE_OPERATIONS_GUIDE.md) — cross-cutting tracker
- [`../../deploy/docker/production/CLOUDFLARE_TUNNEL_MIGRATION_RUNBOOK.md`](../../deploy/docker/production/CLOUDFLARE_TUNNEL_MIGRATION_RUNBOOK.md) — steady-state tunnel
- [`../../infra/single-server-baseline/RUNBOOK.md`](../../infra/single-server-baseline/RUNBOOK.md) — primary host baseline
- [`../../infra/single-server-baseline/nginx/sites-available/theblackout.app.conf`](../../infra/single-server-baseline/nginx/sites-available/theblackout.app.conf) — fallback nginx config
- [`../operations/SPOF_MAP.md`](../operations/SPOF_MAP.md) — rows 2, 10, 14
- [`../operations/BUS_FACTOR_DRILL_CADENCE.md`](../operations/BUS_FACTOR_DRILL_CADENCE.md) — drill validation
