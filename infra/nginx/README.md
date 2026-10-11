# Production DNS + Nginx reverse proxy for `theblackout.app`

This deployment exposes the following hostnames over TLS:

- `theblackout.app` (frontend)
- `chat.theblackout.app` (frontend alias)
- `api.theblackout.app` (backend API)
- `matrix.theblackout.app` (Synapse)
- `turn.theblackout.app` (TURN health/admin HTTPS endpoint)

> TURN media traffic itself (`3478/udp`, `3478/tcp`, `5349/tcp`, plus relay UDP range) is **not** proxied by HTTP Nginx and should terminate directly on coturn.

## Files in this folder

- `nginx.conf`: hardened global Nginx config (includes `merge_slashes off` for Matrix-safe URI handling).
- `snippets/proxy-common.conf`: shared upstream proxy headers and timeout/body settings.
- `snippets/security-headers.conf`: security headers for frontend hosts.
- `snippets/hsts.conf`: HSTS for the Matrix host. The site config includes it
  at server level and again in every block there that sets its own
  `add_header`, because nginx drops inherited `add_header` directives in such a
  block. `nginx -t` fails if this file is missing.
- `sites-available/theblackout.app.conf`: host-based routing and upstream definitions. It also holds the
  Black Mask chat panel's two locations (`/embed`, `/embed/*`) and the `map` blocks that decide their
  framing headers; see "Black Mask chat panel" below.

## 1) DNS implementation

Create the following records in your DNS provider:

| Type | Name | Value | TTL | Purpose |
|---|---|---|---|---|
| A | `@` | `<PUBLIC_IPV4_OF_NGINX_HOST>` | 300 | apex frontend |
| A | `chat` | `<PUBLIC_IPV4_OF_NGINX_HOST>` | 300 | chat frontend |
| A | `api` | `<PUBLIC_IPV4_OF_NGINX_HOST>` | 300 | API |
| A | `matrix` | `<PUBLIC_IPV4_OF_NGINX_HOST>` | 300 | Synapse endpoint |
| A | `turn` | `<PUBLIC_IPV4_OF_NGINX_HOST>` | 300 | TURN DNS name |
| AAAA (optional) | same five names | `<PUBLIC_IPV6_OF_NGINX_HOST>` | 300 | IPv6 |

Optional (for legacy federation clients looking up `theblackout.app` directly):

| Type | Name | Value |
|---|---|---|
| SRV | `_matrix._tcp.theblackout.app` | `10 0 443 matrix.theblackout.app.` |

## 2) Nginx deployment instructions

Assuming Ubuntu/Debian host:

```bash
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx
sudo mkdir -p /var/www/certbot
```

Install configs:

```bash
sudo cp infra/nginx/nginx.conf /etc/nginx/nginx.conf
sudo cp infra/nginx/snippets/proxy-common.conf /etc/nginx/snippets/proxy-common.conf
sudo cp infra/nginx/snippets/security-headers.conf /etc/nginx/snippets/security-headers.conf
sudo cp infra/nginx/snippets/hsts.conf /etc/nginx/snippets/hsts.conf
sudo cp infra/nginx/sites-available/theblackout.app.conf /etc/nginx/sites-available/theblackout.app.conf
sudo ln -sfn /etc/nginx/sites-available/theblackout.app.conf /etc/nginx/sites-enabled/theblackout.app.conf
```

Validate and reload:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

### Upstream service expectations

- Frontend (`theblackout.app`, `chat.theblackout.app`) at `127.0.0.1:8080`
- API (`api.theblackout.app`) at `127.0.0.1:9000`
- Synapse (`matrix.theblackout.app`) at `127.0.0.1:8008`
- Optional coturn HTTPS status (`turn.theblackout.app/healthz`) at `127.0.0.1:9641`

If your ports differ, update upstream blocks in `sites-available/theblackout.app.conf`.

### Black Mask chat panel (`/embed`)

The frontend container (the `apps/blackout-client` image) decides whether the chat panel at `/embed`
may be framed, from `BLACK_MASK_FRAME_ANCESTORS` (`docs/black-mask-chat-panel-and-account-link.md`,
step 2). This proxy adds `X-Frame-Options: DENY` and a CSP with `frame-ancestors 'none'` to everything,
except on `/embed` and `/embed/*` when the container's response carries a `frame-ancestors` list in the
form that image writes: there it leaves its own two out and repeats the container's list. Upstream
errors and older frontend images get the usual headers. Nothing is frameable until the variable is set
on the frontend container. `node tools/ci/check-embed-proxy-framing.mjs` checks the two locations
against `snippets/security-headers.conf`; it runs in CI.

## 3) Synapse reverse proxy requirements

In Synapse config (`homeserver.yaml`), ensure proxy awareness is enabled:

```yaml
x_forwarded: true
```

This works with the Nginx-provided headers from `proxy-common.conf`:

- `X-Forwarded-For`
- `X-Forwarded-Proto`
- `X-Forwarded-Host`
- `X-Forwarded-Port`

### Matrix path semantics protection

To avoid federation/client signature issues:

- `merge_slashes off;` set globally.
- No URI rewrite in Matrix location (`proxy_pass http://blackout_synapse;` with no URI suffix).
- No normalization/canonicalization middleware in front of Nginx.

## 4) TLS certificate automation + renewal

Issue one SAN cert covering all five names:

```bash
sudo certbot --nginx \
  -d theblackout.app \
  -d chat.theblackout.app \
  -d api.theblackout.app \
  -d matrix.theblackout.app \
  -d turn.theblackout.app \
  --agree-tos -m ops@theblackout.app --no-eff-email --redirect
```

Verify automated renewal timer:

```bash
systemctl list-timers | grep certbot
```

Dry-run renewal test:

```bash
sudo certbot renew --dry-run
```

Optional explicit deploy hook:

```bash
echo 'deploy_hook = systemctl reload nginx' | sudo tee -a /etc/letsencrypt/renewal/theblackout.app.conf
```

## 5) Validation commands + expected outputs

### DNS

```bash
dig +short theblackout.app A
```
Expected: your public IPv4.

```bash
dig +short chat.theblackout.app A
```
Expected: same IPv4 as apex.

```bash
dig +short matrix.theblackout.app A
```
Expected: same IPv4 as apex.

### TLS and host routing

```bash
curl -I https://theblackout.app
```
Expected: `HTTP/2 200` (or `304`), includes security headers like `strict-transport-security`, `content-security-policy`.

```bash
curl -sI https://theblackout.app/embed | grep -iE '^(x-frame-options|content-security-policy)'
```
Expected with `BLACK_MASK_FRAME_ANCESTORS` unset on the frontend: `x-frame-options: DENY` and
`frame-ancestors 'none'`. With a list set: no `x-frame-options`, `frame-ancestors <your list>` twice
(the frontend's header and this proxy's copy), and this proxy's CSP without `frame-ancestors`.

```bash
curl -sI https://theblackout.app/ | grep -iE '^(x-frame-options|content-security-policy)'
```
Expected whatever the variable says: `x-frame-options: DENY` and a CSP with `frame-ancestors 'none'`.

```bash
curl -I https://api.theblackout.app/health
```
Expected: `HTTP/2 200` from API health endpoint.

```bash
curl -s https://matrix.theblackout.app/.well-known/matrix/client | jq
```
Expected JSON includes `"base_url": "https://matrix.theblackout.app"`.

```bash
curl -I https://matrix.theblackout.app/_matrix/client/versions
```
Expected: `HTTP/2 200` from Synapse with Matrix version payload.

```bash
curl -i https://turn.theblackout.app/healthz
```
Expected: `HTTP/2 200` if TURN admin endpoint enabled; otherwise `404` (by current config).

### Nginx + certbot

```bash
sudo nginx -t
```
Expected: `syntax is ok` and `test is successful`.

```bash
sudo certbot renew --dry-run
```
Expected: dry-run renewal succeeds for `theblackout.app` certificate lineage.
