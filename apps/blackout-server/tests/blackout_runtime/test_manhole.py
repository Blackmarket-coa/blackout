"""The manhole's host key, and a client gets a shell.

``synapse/util/manhole.py`` mints an ephemeral RSA host key when the operator
has not configured a usable one (the fork removed upstream's hardcoded key on
2026-09-13). Until this change the helper called ``Key.fromCryptographyKey()``,
which ``twisted.conch.ssh.keys.Key`` has never had, so a homeserver with a
``type: manhole`` listener without a configured key pair (either path unset)
raised AttributeError in ``start_listening`` and never came up. The helper now
uses ``Key(keyObject)``.

A configured private key with no public key is now used as it is, with its
public half derived from it, and nothing is logged. Before this change it took
the ephemeral path like a config with no key (and so crashed as above), under a
warning that said no private key was configured. A configured public key with
no private key cannot serve as a host key: it is ignored, an ephemeral pair is
used, and the warning says so.

These tests build the factory as ``listen_manhole`` does and, in the session
tests, connect to it over loopback TCP with twisted.conch's client: password
authentication, a pty, a shell, and an expression evaluated in the manhole's
namespace. Nothing here pins Twisted's own session semantics (26.10.0 allows
one shell request per channel, 26.4.0 allowed more); the shell must simply
open.

The host key is filed under its own key type. Until this change ``manhole()``
filed every key under ``b"ssh-rsa"``, as upstream does, while Twisted offers the
signature algorithms of the key it holds and then looks the negotiated one up
by key type, so an Ed25519 or ECDSA key at ``ssh_priv_key_path`` started without
a word and every connection failed. ``synapse/config/server.py`` now also
refuses, at config load, a public key at ``ssh_priv_key_path``, a configured
public key that is not the private key's public half, and an EC key on a curve
Twisted has no SSH key type for (which loads, and which ``manhole()`` would
otherwise fail on with a bare KeyError). The session tests for those key types
load the key files through the homeserver config, as a deployment does.

Records: docs/security/dependency-advisories-twisted-2026-11-02.md (repository
root) and PATCHES.md, 2026-11-02.
"""

from __future__ import annotations

import os
import shutil
import struct
import tempfile
from typing import Any, Dict, List, Optional, Tuple, cast

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec, ed25519

from twisted.conch import manhole_ssh
from twisted.conch.ssh import channel, common, connection, transport, userauth
from twisted.conch.ssh.keys import Key
from twisted.internet import defer, protocol, reactor
from twisted.internet.address import IPv4Address
from twisted.internet.interfaces import IAddress, IListeningPort, IReactorTCP
from twisted.internet.protocol import ServerFactory
from twisted.python.failure import Failure

from synapse.config._base import ConfigError
from synapse.config.homeserver import HomeServerConfig
from synapse.config.server import ManholeConfig
from synapse.util.manhole import _ephemeral_rsa_key, manhole

from tests.unittest import TestCase
from tests.utils import default_config

USERNAME = "matrix"
PASSWORD = "rabbithole"


def _settings(priv: Optional[Key] = None, pub: Optional[Key] = None) -> ManholeConfig:
    return ManholeConfig(
        username=USERNAME, password=PASSWORD, priv_key=priv, pub_key=pub
    )


def _host_keys(factory: ServerFactory) -> Tuple[Key, Key]:
    """The host key pair the factory serves, whatever type it is filed under.

    `manhole()` returns the ConchFactory as a ServerFactory, and conch types
    these two dicts as bytes to bytes; both hold Key objects. Each holds one
    entry, under the same name; which name is `HostKeyTypeTestCase`'s subject,
    so the session tests can reach a factory that files it wrongly.
    """
    conch = cast(manhole_ssh.ConchFactory, factory)
    assert len(conch.privateKeys) == 1, conch.privateKeys
    assert conch.privateKeys.keys() == conch.publicKeys.keys()
    priv = cast(Key, next(iter(conch.privateKeys.values())))
    pub = cast(Key, next(iter(conch.publicKeys.values())))
    return priv, pub


def _rsa_key() -> Key:
    return _ephemeral_rsa_key()


def _ed25519_key() -> Key:
    return Key(ed25519.Ed25519PrivateKey.generate())


def _ecdsa_key(curve: ec.EllipticCurve) -> Key:
    return Key(ec.generate_private_key(curve))


def _key_kinds() -> List[Tuple[str, Key]]:
    """One private key of each type the manhole must serve."""
    return [
        ("RSA", _rsa_key()),
        ("Ed25519", _ed25519_key()),
        ("ECDSA P-256", _ecdsa_key(ec.SECP256R1())),
        ("ECDSA P-384", _ecdsa_key(ec.SECP384R1())),
        ("ECDSA P-521", _ecdsa_key(ec.SECP521R1())),
    ]


def _write_key_files(directory: str, name: str, key: Key) -> Tuple[str, str]:
    """Write `key` as ssh-keygen writes it: OpenSSH private key and `.pub`.

    Returns the private and public file paths.
    """
    crypto_key = key._keyObject
    priv_path = os.path.join(directory, name)
    with open(priv_path, "wb") as f:
        f.write(
            crypto_key.private_bytes(
                serialization.Encoding.PEM,
                serialization.PrivateFormat.OpenSSH,
                serialization.NoEncryption(),
            )
        )
    pub_path = priv_path + ".pub"
    with open(pub_path, "wb") as f:
        f.write(
            crypto_key.public_key().public_bytes(
                serialization.Encoding.OpenSSH, serialization.PublicFormat.OpenSSH
            )
            + b" manhole-test\n"
        )
    return priv_path, pub_path


def _write_pem_private_key(directory: str, name: str, key: Key) -> str:
    """Write `key` as `openssl ecparam -genkey` does: a PEM `EC PRIVATE KEY`.

    ssh-keygen cannot write a key on a curve OpenSSH has no name for
    (cryptography refuses the OpenSSH serialization of secp256k1), so only a
    PEM file can put one at `ssh_priv_key_path` or `ssh_pub_key_path`.
    """
    path = os.path.join(directory, name)
    with open(path, "wb") as f:
        f.write(
            key._keyObject.private_bytes(
                serialization.Encoding.PEM,
                serialization.PrivateFormat.TraditionalOpenSSL,
                serialization.NoEncryption(),
            )
        )
    return path


def _load_manhole_settings(
    priv_path: Optional[str] = None, pub_path: Optional[str] = None
) -> ManholeConfig:
    """Parse a homeserver config whose manhole_settings name these files."""
    settings: Dict[str, str] = {"username": USERNAME, "password": PASSWORD}
    if priv_path is not None:
        settings["ssh_priv_key_path"] = priv_path
    if pub_path is not None:
        settings["ssh_pub_key_path"] = pub_path
    config_dict = default_config("test")
    config_dict["manhole_settings"] = settings
    config = HomeServerConfig()
    config.parse_config_dict(config_dict, "", "")
    return config.server.manhole_settings


def _key_dir(test: TestCase) -> str:
    """A scratch directory for key files, removed when `test` ends."""
    directory = tempfile.mkdtemp(prefix="manhole-keys-")
    test.addCleanup(shutil.rmtree, directory)
    return directory


class EphemeralKeyTestCase(TestCase):
    def test_helper_returns_a_private_rsa_key(self) -> None:
        key = _ephemeral_rsa_key()
        self.assertIsInstance(key, Key)
        self.assertEqual(key.type(), "RSA")
        self.assertEqual(key.size(), 2048)
        self.assertFalse(key.isPublic())
        self.assertTrue(key.public().isPublic())

    def test_each_process_gets_its_own_key(self) -> None:
        # The point of the change: no two processes share a host key.
        self.assertNotEqual(
            _ephemeral_rsa_key().public().blob(), _ephemeral_rsa_key().public().blob()
        )

    def test_factory_without_a_configured_key_mints_a_matching_pair(self) -> None:
        with self.assertLogs("synapse.util.manhole", level="WARNING") as logs:
            factory = manhole(_settings(), {})
        self.assertEqual(len(logs.records), 1)
        message = logs.records[0].getMessage()
        self.assertIn("no ssh_priv_key_path configured", message)
        self.assertIn("ephemeral host key", message)

        priv, pub = _host_keys(factory)
        self.assertIsInstance(priv, Key)
        self.assertIsInstance(pub, Key)
        self.assertFalse(priv.isPublic())
        self.assertTrue(pub.isPublic())
        # Both halves are replaced together, so the public half served to
        # clients is the one the private half answers for.
        self.assertEqual(priv.public().blob(), pub.blob())

    def test_factory_uses_a_configured_key_unchanged(self) -> None:
        priv = _ephemeral_rsa_key()
        pub = priv.public()
        got_priv, got_pub = _host_keys(manhole(_settings(priv, pub), {}))
        self.assertIs(got_priv, priv)
        self.assertIs(got_pub, pub)

    def test_configured_private_key_alone_is_used_with_its_public_half(
        self,
    ) -> None:
        # ssh_priv_key_path set, ssh_pub_key_path unset: the configured key is
        # the host key, its public half is derived from it, and nothing warns.
        priv = _ephemeral_rsa_key()
        with self.assertNoLogs("synapse.util.manhole", level="WARNING"):
            factory = manhole(_settings(priv, None), {})
        got_priv, got_pub = _host_keys(factory)
        self.assertIs(got_priv, priv)
        self.assertTrue(got_pub.isPublic())
        self.assertEqual(got_pub.blob(), priv.public().blob())

    def test_configured_public_key_alone_is_ignored_with_a_warning(self) -> None:
        # ssh_pub_key_path set, ssh_priv_key_path unset: a public key cannot
        # sign, so it cannot be the host key. An ephemeral pair is used, and
        # the warning says the public key was ignored rather than that nothing
        # was configured.
        configured_pub = _ephemeral_rsa_key().public()
        with self.assertLogs("synapse.util.manhole", level="WARNING") as logs:
            factory = manhole(_settings(None, configured_pub), {})
        self.assertEqual(len(logs.records), 1)
        message = logs.records[0].getMessage()
        self.assertIn(
            "ssh_pub_key_path is configured without ssh_priv_key_path", message
        )
        self.assertIn("ignored", message)
        self.assertIn("ephemeral host key", message)
        self.assertNotIn("no ssh_priv_key_path configured", message)

        priv, pub = _host_keys(factory)
        self.assertFalse(priv.isPublic())
        self.assertNotEqual(pub.blob(), configured_pub.blob())
        self.assertEqual(priv.public().blob(), pub.blob())


class HostKeyTypeTestCase(TestCase):
    """The factory files the host key where Twisted's server looks for it."""

    def test_each_key_type_is_filed_under_its_own_name(self) -> None:
        for kind, priv in _key_kinds():
            factory = cast(manhole_ssh.ConchFactory, manhole(_settings(priv), {}))
            key_type = priv.sshType()
            self.assertEqual(list(factory.privateKeys), [key_type], kind)
            self.assertEqual(list(factory.publicKeys), [key_type], kind)

            # What Twisted does with the factory: the server offers the
            # signature algorithms of the keys it holds, then looks the
            # negotiated one up by key type.
            factory.startFactory()
            self.addCleanup(factory.stopFactory)
            server = factory.buildProtocol(None)
            self.assertEqual(
                server.supportedPublicKeys, priv.supportedSignatureAlgorithms(), kind
            )
            for algorithm in server.supportedPublicKeys:
                pub, got_priv = server._getHostKeys(algorithm)
                self.assertIs(got_priv, priv, (kind, algorithm))
                self.assertEqual(pub.blob(), priv.public().blob(), (kind, algorithm))

    def test_a_second_factory_leaves_the_first_ones_key_alone(self) -> None:
        # ConchFactory declares both dicts on the class; the factories must
        # not share them.
        first_key = _ed25519_key()
        second_key = _rsa_key()
        first = manhole(_settings(first_key), {})
        manhole(_settings(second_key), {})
        priv, pub = _host_keys(first)
        self.assertIs(priv, first_key)
        self.assertEqual(pub.blob(), first_key.public().blob())


def _another_key_like(key: Key) -> Key:
    """A fresh private key of the same SSH key type as `key`."""
    if key.type() == "RSA":
        return _rsa_key()
    if key.type() == "EC":
        return _ecdsa_key(key._keyObject.curve)
    return _ed25519_key()


def _file_name(kind: str) -> str:
    return kind.replace(" ", "_").replace("-", "")


class ManholeKeyConfigTestCase(TestCase):
    """synapse/config/server.py refuses a host key the manhole could not use."""

    def _refusal(
        self, label: str, priv_path: str, pub_path: Optional[str] = None
    ) -> ConfigError:
        try:
            _load_manhole_settings(priv_path, pub_path)
        except ConfigError as e:
            return e
        raise self.failureException(f"{label}: the config loaded, no ConfigError")

    def test_public_key_at_the_private_key_path_is_refused(self) -> None:
        directory = _key_dir(self)
        for kind, key in _key_kinds():
            _, pub_path = _write_key_files(directory, _file_name(kind), key)
            e = self._refusal(kind, pub_path)
            self.assertEqual(e.path, ("manhole_settings", "ssh_priv_key_path"), kind)
            self.assertIn(pub_path, e.msg, kind)
            self.assertIn("holds a public key", e.msg, kind)
            self.assertIn(key.sshType().decode("ascii"), e.msg, kind)

    def test_public_key_of_another_type_is_refused(self) -> None:
        directory = _key_dir(self)
        pairs = [
            ("Ed25519 and RSA", _ed25519_key(), _rsa_key()),
            ("RSA and ECDSA", _rsa_key(), _ecdsa_key(ec.SECP256R1())),
            # Two ECDSA curves are two SSH key types.
            ("P-256 and P-384", _ecdsa_key(ec.SECP256R1()), _ecdsa_key(ec.SECP384R1())),
        ]
        for i, (label, priv, other) in enumerate(pairs):
            priv_path, _ = _write_key_files(directory, f"priv{i}", priv)
            _, other_pub_path = _write_key_files(directory, f"other{i}", other)
            e = self._refusal(label, priv_path, other_pub_path)
            self.assertEqual(e.path, ("manhole_settings", "ssh_pub_key_path"), label)
            self.assertIn(
                f"{other_pub_path} holds a {other.sshType().decode('ascii')} key",
                e.msg,
                label,
            )
            self.assertIn(
                f"{priv_path} a {priv.sshType().decode('ascii')} key", e.msg, label
            )

    def test_public_key_of_another_key_of_the_same_type_is_refused(self) -> None:
        directory = _key_dir(self)
        for kind, priv in _key_kinds():
            other = _another_key_like(priv)
            self.assertEqual(other.sshType(), priv.sshType(), kind)
            name = _file_name(kind)
            priv_path, _ = _write_key_files(directory, "priv_" + name, priv)
            _, other_pub_path = _write_key_files(directory, "other_" + name, other)
            e = self._refusal(kind, priv_path, other_pub_path)
            self.assertEqual(e.path, ("manhole_settings", "ssh_pub_key_path"), kind)
            self.assertIn(
                f"{other_pub_path} is not the public half of the private key file"
                f" {priv_path}",
                e.msg,
                kind,
            )

    def test_a_key_on_a_curve_without_an_ssh_name_is_refused(self) -> None:
        # Twisted loads a PEM EC key on any curve cryptography knows, but has
        # an SSH key type for P-256, P-384 and P-521 only. Before this check
        # the config loaded such a key, and the manhole stopped startup with
        # the bare KeyError pinned below, naming no setting.
        directory = _key_dir(self)
        k1_path = _write_pem_private_key(
            directory, "secp256k1.pem", _ecdsa_key(ec.SECP256K1())
        )
        e = self._refusal("secp256k1 at ssh_priv_key_path", k1_path)
        self.assertEqual(e.path, ("manhole_settings", "ssh_priv_key_path"))
        self.assertIn(k1_path, e.msg)
        self.assertIn("curve secp256k1", e.msg)
        self.assertIn("P-256, P-384 or P-521", e.msg)

        # What the check stands in for: the key loads, Twisted has no SSH type
        # for it, and `manhole()` itself raises the KeyError.
        loaded = Key.fromFile(k1_path)
        self.assertEqual(loaded.type(), "EC")
        self.assertFalse(loaded.isPublic())
        self.assertRaises(KeyError, loaded.sshType)
        self.assertRaises(KeyError, manhole, _settings(loaded), {})

    def test_a_key_on_a_curve_without_an_ssh_name_at_the_public_key_path_is_refused(
        self,
    ) -> None:
        # The same file at ssh_pub_key_path, beside a P-256 key that would
        # otherwise load: refused at that setting. Before this check the
        # comparison of the two key types raised the KeyError itself.
        directory = _key_dir(self)
        k1_path = _write_pem_private_key(
            directory, "secp256k1.pem", _ecdsa_key(ec.SECP256K1())
        )
        p256_path, _ = _write_key_files(
            directory, "id_ecdsa", _ecdsa_key(ec.SECP256R1())
        )
        e = self._refusal("secp256k1 at ssh_pub_key_path", p256_path, k1_path)
        self.assertEqual(e.path, ("manhole_settings", "ssh_pub_key_path"))
        self.assertIn(k1_path, e.msg)
        self.assertIn("curve secp256k1", e.msg)

    def test_matching_pairs_and_private_keys_alone_load(self) -> None:
        directory = _key_dir(self)
        for kind, priv in _key_kinds():
            priv_path, pub_path = _write_key_files(directory, _file_name(kind), priv)

            pair = _load_manhole_settings(priv_path, pub_path)
            assert pair.priv_key is not None and pair.pub_key is not None
            self.assertFalse(pair.priv_key.isPublic(), kind)
            self.assertTrue(pair.pub_key.isPublic(), kind)
            self.assertEqual(pair.priv_key.sshType(), priv.sshType(), kind)
            self.assertEqual(pair.pub_key.blob(), priv.public().blob(), kind)

            alone = _load_manhole_settings(priv_path)
            assert alone.priv_key is not None
            self.assertIsNone(alone.pub_key, kind)
            self.assertEqual(alone.priv_key.public().blob(), priv.public().blob(), kind)


class _Probe:
    """What the client saw, filled in as the session proceeds."""

    def __init__(self) -> None:
        self.authenticated = False
        self.shell_opened = False
        self.output = b""
        self.host_key_blob: Optional[bytes] = None
        self.key_alg: Optional[bytes] = None
        self.closed: "defer.Deferred[None]" = defer.Deferred()

    def fail(self, reason: Failure) -> None:
        if not self.closed.called:
            self.closed.errback(reason)


class _Session(channel.SSHChannel):
    """A client session: pty, shell, one expression, then close."""

    name = b"session"

    def __init__(self, probe: _Probe, conn: connection.SSHConnection) -> None:
        super().__init__(conn=conn)
        self._conn = conn
        self.probe = probe
        self._sent = False

    def channelOpen(self, specificData: bytes) -> None:
        pty = common.NS(b"xterm") + struct.pack(">4L", 24, 80, 0, 0) + common.NS(b"")
        d = self._conn.sendRequest(self, b"pty-req", pty, wantReply=True)
        d.addCallback(
            lambda _: self._conn.sendRequest(self, b"shell", b"", wantReply=True)
        )
        d.addCallbacks(self._shell_opened, self.probe.fail)

    def _shell_opened(self, _: object) -> None:
        self.probe.shell_opened = True

    def dataReceived(self, data: bytes) -> None:
        self.probe.output += data
        if not self._sent and b">>> " in self.probe.output:
            self._sent = True
            self.write(b"answer + 1\r")
        elif self._sent and b"42" in self.probe.output:
            # Everything this test needs has arrived; the client closes, as an
            # operator's ssh client would on exit.
            ssh_transport = self._conn.transport
            assert ssh_transport is not None
            ssh_transport.loseConnection()


class _Connection(connection.SSHConnection):
    def __init__(self, probe: _Probe) -> None:
        super().__init__()
        self.probe = probe

    def serviceStarted(self) -> None:
        self.probe.authenticated = True
        self.openChannel(_Session(self.probe, conn=self))


class _UserAuth(userauth.SSHUserAuthClient):
    def __init__(self, password: bytes, instance: connection.SSHConnection) -> None:
        super().__init__(USERNAME.encode("ascii"), instance)
        self._password = password

    def getPassword(self, prompt: Optional[bytes] = None) -> "defer.Deferred[bytes]":
        return defer.succeed(self._password)

    def getPublicKey(self) -> None:
        return None


class _ClientTransport(transport.SSHClientTransport):
    probe: _Probe

    def verifyHostKey(self, hostKey: bytes, fingerprint: str) -> "defer.Deferred[bool]":
        self.probe.host_key_blob = hostKey
        self.probe.key_alg = self.keyAlg
        return defer.succeed(True)

    def connectionSecure(self) -> None:
        self.requestService(
            _UserAuth(PASSWORD.encode("ascii"), _Connection(self.probe))
        )

    def connectionLost(self, reason: Optional[Failure] = None) -> None:
        super().connectionLost(reason)
        if not self.probe.closed.called:
            self.probe.closed.callback(None)


class _ClientFactory(protocol.ClientFactory):
    def __init__(self, probe: _Probe) -> None:
        self.probe = probe

    def buildProtocol(self, addr: Optional[IAddress]) -> _ClientTransport:
        p = _ClientTransport()
        p.probe = self.probe
        return p

    def clientConnectionFailed(self, connector: object, reason: Failure) -> None:
        self.probe.fail(reason)


class ManholeSessionTestCase(TestCase):
    """A real SSH session to the factory `listen_manhole` builds, over loopback."""

    # Key generation, the key exchange and the manhole's own output are all
    # fast on loopback; this bounds a hung handshake rather than a slow one.
    timeout = 60

    def _session(
        self, settings: ManholeConfig, namespace: Dict[str, Any]
    ) -> "defer.Deferred[Tuple[_Probe, Key]]":
        """Serve `manhole(settings, namespace)` on loopback and run one session.

        Fires with what the client saw and the public key the factory serves,
        once both ends of the connection have closed.
        """
        factory = manhole(settings, namespace)
        _, host_key = _host_keys(factory)

        # Watch the server side of the one connection close as well, so the
        # test leaves nothing behind for trial's reactor check.
        server_closed: "defer.Deferred[None]" = defer.Deferred()

        class WatchedServerTransport(transport.SSHServerTransport):
            def connectionLost(self, reason: Optional[Failure] = None) -> None:
                super().connectionLost(reason)
                if not server_closed.called:
                    server_closed.callback(None)

        factory.protocol = WatchedServerTransport

        tcp: IReactorTCP = reactor
        port: IListeningPort = tcp.listenTCP(0, factory, interface="127.0.0.1")
        self.addCleanup(port.stopListening)
        host = port.getHost()
        assert isinstance(host, IPv4Address)

        probe = _Probe()
        tcp.connectTCP(host.host, host.port, _ClientFactory(probe))

        async def run() -> Tuple[_Probe, Key]:
            await probe.closed
            await server_closed
            self.assertTrue(probe.authenticated, "password authentication failed")
            self.assertTrue(probe.shell_opened, "the shell request was refused")
            text = probe.output.decode("utf-8", "replace")
            self.assertIn(">>> ", text)
            self.assertIn("42", text)
            return probe, host_key

        return defer.ensureDeferred(run())

    def test_client_opens_a_shell_and_evaluates_in_the_namespace(
        self,
    ) -> "defer.Deferred[None]":
        async def run() -> None:
            probe, host_key = await self._session(_settings(), {"answer": 41})
            # The host key the client was shown is the ephemeral public half.
            self.assertEqual(probe.host_key_blob, host_key.blob())

        return defer.ensureDeferred(run())

    def test_client_is_shown_the_configured_private_keys_public_half(
        self,
    ) -> "defer.Deferred[None]":
        # Only ssh_priv_key_path configured: the server signs the key exchange
        # with that key, so the client completes it against the derived
        # public half and is shown that, not an ephemeral key.
        priv = _ephemeral_rsa_key()

        async def run() -> None:
            probe, host_key = await self._session(_settings(priv, None), {"answer": 41})
            self.assertEqual(host_key.blob(), priv.public().blob())
            self.assertEqual(probe.host_key_blob, priv.public().blob())

        return defer.ensureDeferred(run())

    def test_client_gets_a_shell_on_a_configured_ed25519_key(
        self,
    ) -> "defer.Deferred[None]":
        # Only ssh_priv_key_path, an Ed25519 key in ssh-keygen's format, read
        # through the homeserver config. Before the key was filed under its own
        # type, the server offered ssh-ed25519, the client took it, and the
        # server's lookup under that name raised KeyError: no session.
        priv = _ed25519_key()
        priv_path, _ = _write_key_files(_key_dir(self), "id_ed25519", priv)
        settings = _load_manhole_settings(priv_path)

        async def run() -> None:
            probe, host_key = await self._session(settings, {"answer": 41})
            self.assertEqual(probe.key_alg, b"ssh-ed25519")
            self.assertEqual(host_key.blob(), priv.public().blob())
            self.assertEqual(probe.host_key_blob, priv.public().blob())

        return defer.ensureDeferred(run())

    def test_client_gets_a_shell_on_a_configured_ecdsa_key_pair(
        self,
    ) -> "defer.Deferred[None]":
        # Both paths, an ECDSA P-256 pair, read through the homeserver config.
        priv = _ecdsa_key(ec.SECP256R1())
        priv_path, pub_path = _write_key_files(_key_dir(self), "id_ecdsa", priv)
        settings = _load_manhole_settings(priv_path, pub_path)

        async def run() -> None:
            probe, host_key = await self._session(settings, {"answer": 41})
            self.assertEqual(probe.key_alg, b"ecdsa-sha2-nistp256")
            self.assertEqual(host_key.blob(), priv.public().blob())
            self.assertEqual(probe.host_key_blob, priv.public().blob())

        return defer.ensureDeferred(run())

    def test_client_gets_a_shell_on_the_other_ecdsa_curves(
        self,
    ) -> "defer.Deferred[None]":
        # P-384 and P-521 sign with SHA-384 and SHA-512; each gets a session.
        directory = _key_dir(self)

        async def run() -> None:
            for curve, key_type in (
                (ec.SECP384R1(), b"ecdsa-sha2-nistp384"),
                (ec.SECP521R1(), b"ecdsa-sha2-nistp521"),
            ):
                priv = _ecdsa_key(curve)
                priv_path, _ = _write_key_files(directory, curve.name, priv)
                settings = _load_manhole_settings(priv_path)
                probe, _ = await self._session(settings, {"answer": 41})
                self.assertEqual(probe.key_alg, key_type)
                self.assertEqual(probe.host_key_blob, priv.public().blob())

        return defer.ensureDeferred(run())

    def test_client_gets_a_shell_on_a_configured_rsa_key_file(
        self,
    ) -> "defer.Deferred[None]":
        # RSA through the same path, still served as before: the client takes
        # rsa-sha2-512, which Twisted's lookup maps to ssh-rsa.
        priv = _rsa_key()
        priv_path, _ = _write_key_files(_key_dir(self), "id_rsa", priv)
        settings = _load_manhole_settings(priv_path)

        async def run() -> None:
            probe, host_key = await self._session(settings, {"answer": 41})
            self.assertEqual(probe.key_alg, b"rsa-sha2-512")
            self.assertEqual(probe.host_key_blob, priv.public().blob())

        return defer.ensureDeferred(run())
