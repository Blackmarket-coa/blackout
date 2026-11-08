# Using the synapse manhole

The "manhole" allows server administrators to access a Python shell on a running
Synapse installation. This is a very powerful mechanism for administration and
debugging.

**_Security Warning_**

Note that this will give administrative access to synapse to **all users** with
shell access to the server. It should therefore **not** be enabled in
environments where untrusted users have shell access.

## Configuring the manhole

To enable it, first add the `manhole` listener configuration in your
`homeserver.yaml`. You can find information on how to do that
in the [configuration manual](usage/configuration/config_documentation.md#manhole_settings).
The configuration is slightly different if you're using docker.

#### Docker config

If you are using Docker, set `bind_addresses` to `['0.0.0.0']` as shown:

```yaml
listeners:
  - port: 9000
    bind_addresses: ['0.0.0.0']
    type: manhole
```

When using `docker run` to start the server, you will then need to change the command to the following to include the
`manhole` port forwarding. The `-p 127.0.0.1:9000:9000` below is important: it
ensures that access to the `manhole` is only possible for local users.

```bash
docker run -d --name synapse \
    --mount type=volume,src=synapse-data,dst=/data \
    -p 8008:8008 \
    -p 127.0.0.1:9000:9000 \
    matrixdotorg/synapse:latest
```

#### Native config

If you are not using docker, set `bind_addresses` to `['::1', '127.0.0.1']` as shown.
The `bind_addresses` in the example below is important: it ensures that access to the
`manhole` is only possible for local users).

```yaml
listeners:
  - port: 9000
    bind_addresses: ['::1', '127.0.0.1']
    type: manhole
```

### Security settings

The following config options are available:

- `username` - The username for the manhole (defaults to `matrix`)
- `password` - The password for the manhole (defaults to `rabbithole`)
- `ssh_priv_key_path` - The path to a private SSH key, the manhole's host key:
  an RSA, Ed25519 or ECDSA (P-256, P-384 or P-521) key, unencrypted, in the
  format `ssh-keygen` writes. Synapse refuses to start if the file holds a
  public key, or an EC key on any other curve (one `openssl` wrote, say),
  which the SSH server has no key type for.
- `ssh_pub_key_path` - The path to the matching public SSH key. Optional: when
  it is unset, the public half is derived from the private key. When it is set,
  it must be the public half of the key at `ssh_priv_key_path`; a public key of
  another type, or of another key, stops startup with a configuration error.
  Set on its own, without `ssh_priv_key_path`, it is ignored with a warning,
  since a host key must be able to sign.

Until the change that locked Twisted 26.10.0 in this build, this page named
these `ssh_priv_key` and `ssh_pub_key`. The configuration parser reads only the
`_path` names and accepts unknown keys without complaint, so a config written
from the old text runs on an ephemeral host key (and, before that change, did
not start at all). Until the same change, only an RSA host key worked: with an
Ed25519 or ECDSA key the manhole started without a warning and every connection
to it failed, and a mismatched key pair was not refused.

For example:

```yaml
manhole_settings:
  username: manhole
  password: mypassword
  ssh_priv_key_path: '/home/synapse/manhole_keys/id_ed25519'
  ssh_pub_key_path: '/home/synapse/manhole_keys/id_ed25519.pub'
```

### Set a host key. This build will not use a shared one.

Upstream Synapse falls back to a keypair hardcoded in `synapse/util/manhole.py`
when no key is configured. **This build has removed it** and generates a fresh
key for each process instead.

The removed key was published in every copy of the Synapse source, so it was
not a secret. It is the manhole's SSH _host_ key — what your client uses to
know it is talking to your server — and a host key everyone has is a host key
that identifies nothing. Anyone able to reach the manhole port could present
themselves as your server and collect the manhole password you typed at them.
Binding to localhost, as this page recommends, contains that in the normal
case; the Docker instructions above nonetheless have you bind `0.0.0.0` and
rely on a `-p 127.0.0.1:9000:9000` publish rule, and publish rules get
mistyped.

The practical consequence: with no `ssh_priv_key_path` configured, the manhole
logs a warning at startup and its host key changes every restart, so your ssh
client will report a changed host key each time. A client then has nothing
stable to check the key against and cannot tell a restart from an impersonator,
so a key that changes on every restart protects the password you type less
than a pinned one. To get a stable one, generate a keypair and point
`ssh_priv_key_path` at its private half (`ssh_pub_key_path` is optional):

```bash
ssh-keygen -t ed25519 -f /home/synapse/manhole_keys/id_ed25519 -N ""
```

An RSA key (`ssh-keygen -t rsa -b 4096`) or an ECDSA key (`-t ecdsa`) works as
well. The key is a _host_ key: it lets your ssh client check that it is talking
to your server. The keys that encrypt the session are agreed afresh by the SSH
key exchange on each connection.

That is the recommended setup for anything you use more than once, and it is
now genuinely private rather than an override of a public default.

## Accessing synapse manhole

Then restart synapse, and point an ssh client at port 9000 on localhost, using
the username and password configured in `homeserver.yaml` - with the default
configuration, this would be:

```bash
ssh -p9000 matrix@localhost
```

Then enter the password when prompted (the default is `rabbithole`).

This gives a Python REPL in which `hs` gives access to the
`synapse.server.HomeServer` object - which in turn gives access to many other
parts of the process.

Note that, prior to Synapse 1.41, any call which returns a coroutine will need to be wrapped in `ensureDeferred`.

As a simple example, retrieving an event from the database:

```pycon
>>> from twisted.internet import defer
>>> defer.ensureDeferred(hs.get_datastores().main.get_event('$1416420717069yeQaw:matrix.org'))
<Deferred at 0x7ff253fc6998 current result: <FrozenEvent event_id='$1416420717069yeQaw:matrix.org', type='m.room.create', state_key=''>>
```
