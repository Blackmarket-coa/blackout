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

Records: docs/security/dependency-advisories-twisted-2026-11-02.md (repository
root) and PATCHES.md, 2026-11-02.
"""

from __future__ import annotations

import struct
from typing import Any, Dict, Optional, Tuple, cast

from twisted.conch import manhole_ssh
from twisted.conch.ssh import channel, common, connection, transport, userauth
from twisted.conch.ssh.keys import Key
from twisted.internet import defer, protocol, reactor
from twisted.internet.address import IPv4Address
from twisted.internet.interfaces import IAddress, IListeningPort, IReactorTCP
from twisted.internet.protocol import ServerFactory
from twisted.python.failure import Failure

from synapse.config.server import ManholeConfig
from synapse.util.manhole import _ephemeral_rsa_key, manhole

from tests.unittest import TestCase

USERNAME = "matrix"
PASSWORD = "rabbithole"


def _settings(priv: Optional[Key] = None, pub: Optional[Key] = None) -> ManholeConfig:
    return ManholeConfig(
        username=USERNAME, password=PASSWORD, priv_key=priv, pub_key=pub
    )


def _host_keys(factory: ServerFactory) -> Tuple[Key, Key]:
    """The RSA host key pair the factory serves.

    `manhole()` returns the ConchFactory as a ServerFactory, and conch types
    these two dicts as bytes to bytes; both hold Key objects.
    """
    conch = cast(manhole_ssh.ConchFactory, factory)
    priv = cast(Key, conch.privateKeys[b"ssh-rsa"])
    pub = cast(Key, conch.publicKeys[b"ssh-rsa"])
    return priv, pub


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


class _Probe:
    """What the client saw, filled in as the session proceeds."""

    def __init__(self) -> None:
        self.authenticated = False
        self.shell_opened = False
        self.output = b""
        self.host_key_blob: Optional[bytes] = None
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
