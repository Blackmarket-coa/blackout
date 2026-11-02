"""The manhole starts without a configured host key, and a client gets a shell.

``synapse/util/manhole.py`` mints an ephemeral RSA host key when the operator
has not configured one (the fork removed upstream's hardcoded key on
2026-09-13). Until 2026-11-02 the helper called ``Key.fromCryptographyKey()``,
which ``twisted.conch.ssh.keys.Key`` has never had, so a homeserver with a
``type: manhole`` listener and no key raised AttributeError in
``start_listening`` and never came up. The helper now uses ``Key(keyObject)``.

These tests build the factory as ``listen_manhole`` does and, in the last one,
connect to it over loopback TCP with twisted.conch's client: password
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
        self.assertIn("ephemeral host key", "\n".join(logs.output))

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

    def test_client_opens_a_shell_and_evaluates_in_the_namespace(
        self,
    ) -> "defer.Deferred[None]":
        namespace: Dict[str, Any] = {"answer": 41}
        factory = manhole(_settings(), namespace)
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

        async def run() -> None:
            await probe.closed
            await server_closed
            self.assertTrue(probe.authenticated, "password authentication failed")
            self.assertTrue(probe.shell_opened, "the shell request was refused")
            # The host key the client was shown is the ephemeral public half.
            self.assertEqual(probe.host_key_blob, host_key.blob())
            text = probe.output.decode("utf-8", "replace")
            self.assertIn(">>> ", text)
            self.assertIn("42", text)

        return defer.ensureDeferred(run())
