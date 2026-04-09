# Networking security review: Cloudflare Tunnel, TLS, and DNS

Scope: Dockerized services behind Cloudflare Tunnel with Cloudflare-managed DNS and edge TLS.

---

## 1) Threat model

### 1.1 Assets to protect

- Availability and integrity of public API/websocket endpoints.
- Confidentiality/integrity of in-transit data (edge and origin paths).
- DNS record integrity for all production/staging hostnames.
- Tunnel credentials, API tokens, and origin certificate private keys.
- Admin/control-plane access (Cloudflare dashboard/API, CI deploy keys, SSH keys).

### 1.2 Trust boundaries

1. Public internet → Cloudflare edge.
2. Cloudflare edge → cloudflared connector.
3. cloudflared connector → reverse proxy/app network (Docker bridge).
4. CI/CD runner → production host via SSH.
5. Secrets store/filesystem → containers.

### 1.3 Adversaries

- Opportunistic internet attackers (credential stuffing, DDoS, scan/exploit).
- Targeted attacker with token theft objective (CI secret exfiltration, phishing).
- Supply-chain attacker via compromised container image/tag.
- Insider with over-privileged Cloudflare/API/host access.
- DNS hijacker (registrar or provider account takeover, poisoned records).

### 1.4 Primary attack paths

- Stolen Cloudflare API token used to alter DNS/tunnel routes.
- Stolen tunnel credentials (`credentials.json`) to run rogue connectors.
- TLS downgrade or misconfiguration (`Full`/`Flexible` instead of `Full (strict)`).
- Exposed origin service bypassing Cloudflare controls.
- CI workflow abuse to deploy untrusted image/tag.
- Expired/revoked cert causing outage and emergency insecure rollback.

### 1.5 Risk ranking (high-level)

- **Critical:** DNS/tunnel control-plane compromise; origin exposed publicly; insecure TLS mode.
- **High:** credential leakage (CI secrets, tunnel JSON, private keys), image tampering.
- **Medium:** weak monitoring/alerting causing delayed detection.
- **Low:** documentation drift and runbook incompleteness.

---

## 2) Misconfiguration checklist

Use this as a periodic audit list (weekly for prod, monthly for staging).

### 2.1 Cloudflare Tunnel

- [ ] Tunnel token/credentials are unique per environment (no shared prod/staging cred file).
- [ ] `credentials.json` is **not** in git, backups, or world-readable file paths.
- [ ] `cloudflared` image is pinned to a specific tag (not `latest`).
- [ ] `cloudflared` container has `restart: unless-stopped` and health visibility via logs/metrics.
- [ ] Ingress rules end with explicit `http_status:404` catch-all.
- [ ] Tunnel maps only required hostnames (no wildcard unless explicitly needed).
- [ ] Connector runs on a private Docker network; no unnecessary published ports.

### 2.2 TLS certificate management

- [ ] Cloudflare SSL mode is **Full (strict)** for staging and production.
- [ ] Origin cert private key permissions are restricted (`0400`/`0600`) and root-owned.
- [ ] Certificate SANs exactly match required hostnames.
- [ ] Automated expiry monitoring exists (<21d warning, <7d critical).
- [ ] Rotation procedure is tested (staging first) and documented.
- [ ] No `noTLSVerify: true` in production ingress definitions.
- [ ] Legacy self-signed cert exceptions are removed after migration.

### 2.3 DNS changes

- [ ] Registrar MFA + hardware-backed 2FA enabled for all privileged users.
- [ ] DNS API tokens are least privilege (zone-specific, scoped, time-bounded where possible).
- [ ] High-risk records (apex/auth/webhooks) are locked with approval workflow.
- [ ] TTL is intentionally set before migration and restored post-cutover if needed.
- [ ] DNSSEC status is enabled and validated where supported.
- [ ] Record changes are auditable (who/what/when) via logs.
- [ ] Monitoring alerts exist for unexpected record drift.

### 2.4 Origin/network hardening

- [ ] Origin ingress from internet is blocked except required management paths.
- [ ] Host firewall allows only expected egress for tunnel and ops.
- [ ] Reverse proxy admin interfaces are not publicly reachable.
- [ ] Docker daemon access is restricted; socket not mounted into app containers.
- [ ] Service-to-service traffic is on private/internal network where possible.

### 2.5 CI/CD and operations

- [ ] Deploy workflow requires protected branch + environment approvals.
- [ ] Image tags are immutable (digest pin preferred in production).
- [ ] Deploy keys are unique, rotated, and scoped to minimal host actions.
- [ ] Secret scanning is enabled for repo and CI logs/artifacts.
- [ ] Rollback commands are pre-tested and available in runbook.

---

## 3) Minimum secure defaults (baseline)

Apply these defaults before production launch.

### 3.1 Control plane and identity

- Enforce SSO + MFA for Cloudflare and GitHub org accounts.
- Use least-privilege API tokens:
  - DNS edit only for specific zone/records.
  - Tunnel management only for specific tunnel where possible.
- Separate credentials by environment (`staging`/`prod` never shared).

### 3.2 Tunnel and container defaults

- Pin images (`cloudflare/cloudflared:<fixed-version>`).
- Run tunnel with explicit config and fail-closed ingress catch-all.
- Keep `cloudflared` and reverse-proxy on private Docker network.
- Avoid host networking mode.
- Log retention at least 14 days for incident reconstruction.

### 3.3 TLS defaults

- Cloudflare mode: **Full (strict)** only.
- TLS min version 1.2 (prefer 1.3 where possible).
- Rotate origin certs on a fixed schedule (e.g., every 90 days) even if long-lived.
- Store private keys outside image layers; mount read-only at runtime.

### 3.4 DNS defaults

- Enable DNSSEC.
- Use short TTL (60-300s) during cutovers only; restore normal TTL after stabilization.
- Maintain IaC/source-of-truth for DNS records.
- Alert on unauthorized DNS changes in near-real time.

### 3.5 Deployment defaults

- Use canary/staged migration: staging burn-in (24h) before prod cutover.
- Require post-deploy health checks and synthetic probes before completion.
- Keep legacy ingress available during rollback window.

---

## 4) Incident response playbook

Two critical scenarios: **certificate expiry/failure** and **DNS hijack/suspicious change**.

### 4.1 Cert expiry / TLS failure playbook

#### Detection signals

- TLS synthetic checks fail.
- Spike in TLS handshake failures / 525/526 edge errors.
- Certificate expiry alerts (<7 days) or immediate expiration event.

#### Immediate response (0-15 min)

1. Declare incident and assign commander/comms/ops roles.
2. Confirm blast radius (hostnames, regions, only prod or both envs).
3. Check active cert on edge + origin:

   ```bash
   openssl s_client -connect api.example.com:443 -servername api.example.com </dev/null 2>/dev/null \
     | openssl x509 -noout -issuer -subject -dates
   ```

4. Verify Cloudflare SSL mode did not change from `Full (strict)`.
5. If origin cert is expired/invalid, deploy emergency rotated cert/key to reverse proxy and reload.

#### Containment and recovery (15-60 min)

- Rotate any potentially exposed cert/private key material.
- Revalidate tunnel-to-origin handshake.
- Run post-fix probes (HTTP + websocket + key user journeys).
- Keep traffic on hardened path; **do not downgrade TLS mode** as a shortcut.

#### Post-incident (same day)

- Root cause analysis (expiry monitoring miss, renewal failure, config drift).
- Add/adjust expiry alarms and renewal canaries.
- Document corrective actions with owners/dates.

### 4.2 DNS hijack / unauthorized record change playbook

#### Detection signals

- DNS drift alert triggers.
- Unexpected ASN/IPs in DNS resolution checks.
- Traffic or auth anomalies correlated with DNS change audit logs.

#### Immediate response (0-15 min)

1. Declare security incident and freeze all non-essential changes.
2. Lock down control-plane access:
   - revoke/rotate suspected API tokens,
   - force re-auth for privileged users,
   - validate MFA state.
3. Export current DNS records and audit trail for forensics.
4. Restore known-good DNS records from approved snapshot.

#### Containment and recovery (15-90 min)

- Reissue all secrets potentially exposed during hijack window:
  - Cloudflare API tokens,
  - tunnel credentials,
  - CI deploy keys if at risk.
- Verify registrar settings, nameserver integrity, and DNSSEC status.
- Confirm tunnel CNAME targets and Cloudflare proxy flags are correct.
- Run full post-cutover verification command set.

#### Evidence and communications

- Preserve logs: Cloudflare audit logs, CI logs, host auth logs, DNS history.
- Notify stakeholders with timeline, impact, mitigations.
- If required, initiate customer/security disclosure workflow.

### 4.3 Recovery verification checklist (both scenarios)

- [ ] `dig +short` returns expected tunnel targets for all hostnames.
- [ ] TLS cert chain/validity confirmed for all public endpoints.
- [ ] Synthetic checks green in multiple regions for at least 30 minutes.
- [ ] Error rates and latency back to baseline.
- [ ] No unexplained control-plane activity remains.

---

## Recommended alarm thresholds (quick reference)

- Cert expiry: warn `<21d`, critical `<7d`.
- TLS 525/526 error rate: warning `>0.5%/5m`, critical `>2%/5m`.
- DNS drift: any high-priority hostname record change outside deployment window.
- Tunnel disconnect flaps: `>3/10m` warning, `no active connection >1m` critical.
- HTTP 5xx: warning `>2%/5m`, critical `>5%/5m`.
