# End-to-end networking test matrix (Cloudflare Tunnel + TLS + DNS)

This matrix is designed for staging-first, then production cutover validation.

## Variables (set before running)

```bash
export STAGING_API_HOST="api-staging.example.com"
export STAGING_WS_HOST="ws-staging.example.com"
export PROD_API_HOST="api.example.com"
export PROD_WS_HOST="ws.example.com"

# optional: expected DNS target for tunnel CNAME checks
export STAGING_TUNNEL_TARGET="11111111-1111-1111-1111-111111111111.cfargotunnel.com"
export PROD_TUNNEL_TARGET="22222222-2222-2222-2222-222222222222.cfargotunnel.com"

# optional: migration timing window for uptime checks
export CHECK_INTERVAL_SEC=30
export CHECK_DURATION_SEC=1800
```

---

## 1) Test matrix overview

| ID | Category | Environment | Goal | Command/Method | Pass criteria | Fail criteria |
|---|---|---|---|---|---|---|
| TLS-1 | TLS validity | Staging/Prod | Cert is valid and not expired | `openssl s_client ... | openssl x509 -noout -dates` | `notAfter` > now + 7d and hostname matches SAN | Expired cert, SAN mismatch, handshake failure |
| TLS-2 | TLS chain | Staging/Prod | Chain trusted from client | `curl -svI https://host/healthz` | No cert verify errors, HTTP response returned | `SSL certificate problem`, 525/526 patterns |
| REDIR-1 | HTTP→HTTPS | Staging/Prod | Port 80 redirects to HTTPS | `curl -sSI http://host/healthz` | 301/302/307/308 + `Location: https://...` | Non-redirect, wrong scheme, missing `Location` |
| REDIR-2 | HSTS | Staging/Prod | HSTS header present | `curl -sSI https://host/healthz` | `Strict-Transport-Security` header exists | Missing HSTS header |
| DNS-1 | DNS propagation | Staging/Prod | Record resolves globally | `dig +short host` from multiple resolvers/regions | Expected answer appears in all regions | NXDOMAIN/SERVFAIL/inconsistent stale targets |
| DNS-2 | Tunnel target | Staging/Prod | CNAME points to tunnel target | `dig +short host CNAME` | Ends with expected `*.cfargotunnel.com` target | Points to legacy or unknown target |
| UPTIME-1 | Uptime during migration | Staging/Prod | No significant outage during cutover | periodic `curl` loop (30m) | Success rate >= 99.9%, no error burst > 2 min | Success < 99.9% or prolonged 5xx/timeouts |
| UPTIME-2 | Websocket stability | Staging/Prod | WS handshake remains healthy | `wscat`/upgrade probe in loop | >= 99% successful upgrades | Repeated upgrade failures/disconnect storms |

---

## 2) Executable test steps

## 2.1 TLS validity and certificate checks

### Step TLS-1A: Check cert dates and subject (staging)

```bash
openssl s_client -connect "${STAGING_API_HOST}:443" -servername "${STAGING_API_HOST}" </dev/null 2>/dev/null \
  | openssl x509 -noout -issuer -subject -dates
```

**Pass:** command succeeds; certificate dates are current; issuer/subject expected for your policy.

**Fail:** expired/not-yet-valid certificate; command errors.

### Step TLS-1B: Check SAN contains hostname

```bash
openssl s_client -connect "${STAGING_API_HOST}:443" -servername "${STAGING_API_HOST}" </dev/null 2>/dev/null \
  | openssl x509 -noout -ext subjectAltName | rg -F "DNS:${STAGING_API_HOST}"
```

**Pass:** SAN includes exact hostname.

**Fail:** SAN missing hostname (browser/client mismatch risk).

### Step TLS-2A: Client trust validation

```bash
curl -svI "https://${STAGING_API_HOST}/healthz" -o /dev/null
curl -svI "https://${PROD_API_HOST}/healthz" -o /dev/null
```

**Pass:** TLS verify succeeds; HTTP headers returned.

**Fail:** verify errors, handshake failure, 525/526 edge issues.

---

## 2.2 HTTP → HTTPS redirect checks

### Step REDIR-1A: Validate redirect behavior

```bash
curl -sSI "http://${STAGING_API_HOST}/healthz"
curl -sSI "http://${PROD_API_HOST}/healthz"
```

**Pass:** status code is 301/302/307/308 and `Location:` starts with `https://` same host/path.

**Fail:** 200 over HTTP, redirect to wrong host, missing `Location`.

### Step REDIR-2A: Verify HSTS header

```bash
curl -sSI "https://${STAGING_API_HOST}/healthz" | rg -i "^strict-transport-security:"
curl -sSI "https://${PROD_API_HOST}/healthz" | rg -i "^strict-transport-security:"
```

**Pass:** HSTS present and non-empty.

**Fail:** missing HSTS header.

---

## 2.3 DNS propagation checks

### Step DNS-1A: Multi-resolver lookup

```bash
for host in "$STAGING_API_HOST" "$PROD_API_HOST"; do
  echo "== $host via Cloudflare 1.1.1.1 =="; dig +short "$host" @1.1.1.1
  echo "== $host via Google 8.8.8.8 =="; dig +short "$host" @8.8.8.8
  echo "== $host via Quad9 9.9.9.9 =="; dig +short "$host" @9.9.9.9
  echo
 done
```

**Pass:** all resolvers return expected records consistently.

**Fail:** inconsistent outputs, NXDOMAIN/SERVFAIL, old target lingering beyond expected TTL window.

### Step DNS-2A: CNAME tunnel target validation

```bash
dig +short "$STAGING_API_HOST" CNAME
printf 'expected: %s\n' "$STAGING_TUNNEL_TARGET"

dig +short "$PROD_API_HOST" CNAME
printf 'expected: %s\n' "$PROD_TUNNEL_TARGET"
```

**Pass:** actual CNAME matches expected tunnel target (or approved alias chain ending in it).

**Fail:** CNAME points elsewhere unexpectedly.

---

## 2.4 Uptime checks during migration window

### Step UPTIME-1A: Continuous HTTPS probe loop

```bash
#!/usr/bin/env bash
set -euo pipefail
host="${1:?usage: ./uptime_probe.sh <host>}"
interval="${CHECK_INTERVAL_SEC:-30}"
duration="${CHECK_DURATION_SEC:-1800}"
end=$((SECONDS + duration))
ok=0
fail=0

while [ "$SECONDS" -lt "$end" ]; do
  code=$(curl -sS -o /dev/null -w '%{http_code}' "https://${host}/healthz" || true)
  ts=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  if [ "$code" = "200" ]; then
    ok=$((ok+1)); echo "$ts host=$host code=$code result=ok"
  else
    fail=$((fail+1)); echo "$ts host=$host code=${code:-ERR} result=fail"
  fi
  sleep "$interval"
done

total=$((ok + fail))
rate=$(awk -v o="$ok" -v t="$total" 'BEGIN{ if (t==0) print 0; else printf "%.4f", (o/t)*100 }')
echo "summary host=$host ok=$ok fail=$fail success_rate=${rate}%"
```

Run for each host:

```bash
bash ./uptime_probe.sh "$STAGING_API_HOST"
bash ./uptime_probe.sh "$PROD_API_HOST"
```

**Pass:** success rate `>= 99.9%`; no continuous failure window > 2 minutes.

**Fail:** success rate `< 99.9%` or sustained outage window > 2 minutes.

### Step UPTIME-2A: Websocket handshake probe (if `wscat` available)

```bash
# npm i -g wscat (if not installed)
for host in "$STAGING_WS_HOST" "$PROD_WS_HOST"; do
  echo "== websocket probe $host =="
  timeout 10 wscat -c "wss://${host}" </dev/null && echo "ok" || echo "fail"
done
```

**Pass:** >=99% successful handshake attempts during test loop.

**Fail:** repeated handshake failures or connection resets outside baseline.

---

## 3) Suggested execution order for migrations

1. Run full matrix in staging baseline (pre-change).
2. Apply staging tunnel/DNS changes.
3. Re-run full matrix in staging and soak for 24h.
4. Approve production cutover.
5. During production cutover, run DNS + uptime checks continuously.
6. At cutover +5m, +30m, +2h, +24h run TLS/redirect/DNS suite.

---

## 4) Exit criteria (global pass/fail)

Migration is **PASS** only if all are true:

- TLS tests (TLS-1/TLS-2) pass for all migrated hostnames.
- HTTP→HTTPS tests (REDIR-1/REDIR-2) pass for all hostnames.
- DNS tests (DNS-1/DNS-2) converge to expected targets in all tested resolvers.
- Uptime tests (UPTIME-1/UPTIME-2) meet thresholds.
- No critical monitoring alarms fire during 24h post-cutover window.

If any criterion fails, classify as **FAIL**, trigger rollback decision per runbook, and open incident timeline.
