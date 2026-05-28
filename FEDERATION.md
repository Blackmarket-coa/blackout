# Federation

Blackout is a federated Matrix server. Any standard Matrix homeserver can
federate with it. The server-to-server protocol is the standard
[Matrix S2S API](https://spec.matrix.org/latest/server-server-api/), fully
implemented by both the Python (Synapse) and Rust (continuwuity) server paths.

## How servers find each other

Matrix uses this resolution chain to locate a remote homeserver:

1. **Well-known delegation** — fetch `https://<server_name>/.well-known/matrix/server`
2. **DNS SRV** — query `_matrix-fed._tcp.<host>`, then `_matrix._tcp.<host>`
3. **Fallback** — resolve the hostname and connect on port **8448**

If no well-known or SRV records exist, other servers default to port 8448.
Delegating to port **443** (HTTPS) via `.well-known` is recommended so that
federation traffic shares the same port as client traffic.

## Well-known endpoints

Your server must serve these endpoints on the hostname matching your
`server_name` (or delegated host).

### `/.well-known/matrix/server`

```json
{"m.server": "matrix.example.com:443"}
```

The `m.server` value must be a hostname **with a port**. This tells other
servers where to send federation traffic.

### `/.well-known/matrix/client`

```json
{
    "m.homeserver": {"base_url": "https://matrix.example.com"}
}
```

This tells Matrix clients where to connect. The `base_url` must **not** include
a port if you run on standard HTTPS.

### Serving well-known from continuwuity

The Rust server can serve these directly — set `[global.well_known]` in
`conduwuit.toml`:

```toml
[global.well_known]
client = "https://matrix.example.com"
server = "matrix.example.com:443"
```

### Serving well-known from nginx (Synapse path)

Blackout's Synapse deployment uses nginx to serve static well-known files.
Template variables are rendered at deploy time. See
[`deploy/docker/blackout-backend/well-known/`](deploy/docker/blackout-backend/well-known/)
and the nginx config at
[`deploy/docker/blackout-backend/nginx/nginx.conf`](deploy/docker/blackout-backend/nginx/nginx.conf).

## DNS SRV records (optional)

If well-known delegation is unavailable, add these SRV records for automatic
discovery:

```
_matrix-fed._tcp.example.com.  IN  SRV  10 0 8448 matrix.example.com.
_matrix._tcp.example.com.      IN  SRV  10 0 8448 matrix.example.com.
```

## Firewall & network requirements

| Port   | Protocol  | Purpose                    |
|--------|-----------|----------------------------|
| 443    | TCP       | Client API + delegated federation |
| 8448   | TCP       | Direct federation fallback |
| 3478   | UDP + TCP | TURN media relay           |
| 5349   | TCP       | TURN over TLS              |
| 49160–49200 | UDP  | TURN relay media range     |

Only ports 443 **or** 8448 are strictly required for federation. TURN ports
are needed for voice/video calls.

## Server signing keys

Each homeserver has an Ed25519 signing keypair used to authenticate federation
requests. Other servers verify these signatures before accepting events.

- Generated automatically on first start
- Published at `GET /_matrix/key/v2/server`
- Valid for 7 days from publication time

Verify they are reachable:

```sh
curl -sS https://matrix.example.com/_matrix/key/v2/server | jq .server_name
```

## Federation endpoints

| Endpoint                                              | Purpose                   |
|-------------------------------------------------------|---------------------------|
| `GET /_matrix/federation/v1/version`                  | Protocol version          |
| `PUT /_matrix/federation/v1/send/{txnId}`             | Inbound events            |
| `GET /_matrix/federation/v1/state/{roomId}`           | Room state                |
| `GET /_matrix/federation/v1/backfill/{roomId}`        | Backfill room history     |
| `GET /_matrix/federation/v2/send_join`                | Join a room               |
| `PUT /_matrix/federation/v2/invite/{roomId}/{eventId}`| Invite a remote user      |
| `GET /_matrix/federation/v1/query/profile`            | User profile lookup       |
| `POST /_matrix/federation/v1/user/keys/query`         | Device key query          |
| `GET /_matrix/federation/v1/query/directory`          | Room alias resolution     |
| `GET /_matrix/federation/v1/publicRooms`              | Public room directory     |
| `GET /_matrix/federation/v1/media/download/{id}`      | Media download            |

All standard Matrix S2S endpoints are supported. For the full list, see the
[Matrix spec](https://spec.matrix.org/latest/server-server-api/).

## Configuring your server

### continuwuity (Rust)

Minimal federation config in `conduwuit.toml`:

```toml
server_name = "example.com"
allow_federation = true

[global.well_known]
client = "https://matrix.example.com"
server = "matrix.example.com:443"

turn_uris = ["turn:turn.example.com?transport=udp", "turn:turn.example.com?transport=tcp"]
turn_secret = "your-hmac-sha1-secret"
```

Key federation settings and their defaults:

| Setting                                        | Default | Notes                         |
|------------------------------------------------|---------|-------------------------------|
| `allow_federation`                             | `true`  | Master on/off switch          |
| `allow_public_room_directory_over_federation`  | `false` | Opt-in public room federation |
| `federation_timeout`                           | `60`    | Seconds; 6x for joins         |
| `max_concurrent_inbound_transactions`          | `150`   | Per-server transaction slots  |
| `sender_retry_backoff_limit`                   | `86400` | Max retry backoff (seconds)   |
| `trusted_servers`                              | `["matrix.org"]` | Notary key servers   |
| `forbidden_remote_server_names`                | `[]`    | Regex blocklist for servers   |

### Synapse (Python)

In `homeserver.yaml`, ensure the listener has both `client` and `federation`
resources:

```yaml
listeners:
  - port: 8008
    resources:
      - names: [client, federation]
```

Set TURN for voice/video:

```yaml
turn_uris:
  - "turn:turn.example.com:3478?transport=udp"
turn_shared_secret: "your-shared-secret"
```

Additional Synapse federation settings:

```yaml
allow_profile_lookup_over_federation: true
allow_device_name_lookup_over_federation: false
federation_domain_whitelist: []  # Empty = allow all
```

For production deployments with high federation volume, a dedicated
`federation_sender` worker can be enabled. See
[`infra/single-server-baseline/synapse/workers/federation_sender.yaml`](infra/single-server-baseline/synapse/workers/federation_sender.yaml).

## Testing federation

### Federation tester

Use the Matrix Federation Tester to verify your server is reachable:

https://federationtester.matrix.org

Enter your `server_name` (e.g. `example.com`) and it validates well-known
delegation, SRV records, port connectivity, and key publication.

### Manual checks

```sh
# Check federation version endpoint
curl -sS https://matrix.example.com/_matrix/federation/v1/version

# Check well-known delegation
curl -sS https://example.com/.well-known/matrix/server

# Check server signing keys
curl -sS https://matrix.example.com/_matrix/key/v2/server | jq .server_name
```

## Federation-specific features

### `m.blackout.signal` events

Blackout uses a custom federated event type (`m.blackout.signal`, schema v2)
for cross-community signals. Max serialized payload is 64 KiB. These events
are validated on both local and federated ingress. See
[`apps/blackout-server/docs/development/blackout_federation_schema_minimum.md`](apps/blackout-server/docs/development/blackout_federation_schema_minimum.md).

### Federation links

The Blackout API supports explicit federation links between communities
(types: `zone`, `alliance`, `supply_chain`) via `POST /v1/federation/links`.
These are bridged through Matrix rooms and tracked per-community.

## Troubleshooting

**Well-known returns 404.**
Check that nginx or continuwuity's `[global.well_known]` section is configured.
For Synapse, verify the well-known template files are rendered with valid
values for `$MATRIX_SERVER_NAME` and `$MATRIX_HOMESERVER_URL`.

**Federation tester reports connectivity failure on port 8448.**
If you delegate to port 443 via well-known, port 8448 does not need to be
open. Some testers report this as a warning, not an error.

**DNS resolution is stale.**
conduwuit caches DNS responses for up to 3 days by default
(`dns_min_ttl_nxdomain = 259200`). Restart the server to flush the DNS cache
after DNS changes.

**Federation backlog is growing.**
Check `matrix_federation_sender_backlog` metric. If sustained above 1000 for
20+ minutes, enable the dedicated federation sender worker for Synapse, or
increase `max_concurrent_inbound_transactions` for continuwuity.

**TLS certificate errors from remote servers.**
Ensure your TLS certificate is valid and covers all domains serving federation
traffic. Set up expiry monitoring — Blackout includes a Prometheus alert
(`TLSCertificateExpiry30Days`) for this.

**Blocking a remote server.**
Use `forbidden_remote_server_names` in continuwuity (regex patterns) or
`federation_domain_whitelist` in Synapse to restrict federation to specific
servers.
