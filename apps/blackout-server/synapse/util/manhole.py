# Copyright 2016 OpenMarket Ltd
# Copyright 2019 New Vector Ltd.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
import inspect
import logging
import sys
import traceback
from typing import Any, Dict, Optional

from twisted.conch import manhole_ssh
from twisted.conch.insults import insults
from twisted.conch.manhole import ColoredManhole, ManholeInterpreter
from twisted.conch.ssh.keys import Key
from twisted.cred import checkers, portal
from twisted.internet import defer
from twisted.internet.protocol import ServerFactory

from synapse.config.server import ManholeConfig

logger = logging.getLogger(__name__)

# The hardcoded manhole keypair that upstream Synapse ships here has been
# removed, and an ephemeral one is generated instead when the operator has not
# configured a key (see `_ephemeral_rsa_key` below).
#
# Why this diverges from upstream: the baked-in key is published in every copy
# of the source, so it is not a secret in any sense. It is the manhole's SSH
# *host* key, which is what an operator's client uses to know it is talking to
# the real server — and every Synapse in the world presenting the same, public
# host key means a client cannot distinguish the server from anything else that
# has read GitHub. Combined with password authentication over that connection,
# an attacker positioned on the manhole port can impersonate the server and
# collect the manhole password. The docs mitigate this by binding the listener
# to localhost, which is sound advice and not a guarantee: the Docker section
# of `docs/manhole.md` has operators set `bind_addresses: ['0.0.0.0']` and rely
# on a `-p 127.0.0.1:9000:9000` publish rule to contain it, and a mistyped
# publish rule is an ordinary mistake.
#
# Generating a key per process costs about a tenth of a second on manhole
# startup and nothing at all when the manhole is disabled, which it is by
# default. The cost is that the host key changes across restarts, so a client
# that pinned the previous one warns — the same warning any rotated host key
# produces. `manhole_settings.ssh_priv_key_path` remains the way to pin a
# stable key, and is now the documented recommendation rather than an optional
# override of a known-public default.


def _ephemeral_rsa_key() -> Key:
    """Generate a fresh 2048-bit RSA key for this process.

    Not cached deliberately: the manhole factory is built once per listener, so
    caching would save nothing and would only widen the window in which the key
    sits in memory.
    """
    from cryptography.hazmat.primitives.asymmetric import rsa

    return Key.fromCryptographyKey(
        rsa.generate_private_key(public_exponent=65537, key_size=2048)
    )


def manhole(settings: ManholeConfig, globals: Dict[str, Any]) -> ServerFactory:
    """Starts a ssh listener with password authentication using
    the given username and password. Clients connecting to the ssh
    listener will find themselves in a colored python shell with
    the supplied globals.

    Args:
        username: The username ssh clients should auth with.
        password: The password ssh clients should auth with.
        globals: The variables to expose in the shell.

    Returns:
        A factory to pass to ``listenTCP``
    """
    username = settings.username
    password = settings.password.encode("ascii")
    priv_key = settings.priv_key
    pub_key = settings.pub_key
    if priv_key is None or pub_key is None:
        # No configured keypair: mint one for this process rather than fall
        # back to a key published in the source. Both halves are replaced
        # together — a configured private key with a generated public half, or
        # the reverse, would not match.
        logger.warning(
            "manhole: no ssh_priv_key_path configured, using an ephemeral host"
            " key. Clients will see a host-key change on every restart. Set"
            " manhole_settings.ssh_priv_key_path to pin a stable key."
        )
        generated = _ephemeral_rsa_key()
        priv_key = generated
        pub_key = generated.public()

    checker = checkers.InMemoryUsernamePasswordDatabaseDontUse(**{username: password})

    rlm = manhole_ssh.TerminalRealm()
    # mypy ignored here because:
    # - can't deduce types of lambdas
    # - variable is Type[ServerProtocol], expr is Callable[[], ServerProtocol]
    rlm.chainedProtocolFactory = lambda: insults.ServerProtocol(  # type: ignore[misc,assignment]
        SynapseManhole, dict(globals, __name__="__console__")
    )

    # type-ignore: This is an error in Twisted's annotations. See
    # https://github.com/twisted/twisted/issues/11812 and /11813 .
    factory = manhole_ssh.ConchFactory(portal.Portal(rlm, [checker]))  # type: ignore[arg-type]

    # conch has the wrong type on these dicts (says bytes to bytes,
    # should be bytes to Keys judging by how it's used).
    factory.privateKeys[b"ssh-rsa"] = priv_key  # type: ignore[assignment]
    factory.publicKeys[b"ssh-rsa"] = pub_key  # type: ignore[assignment]

    # ConchFactory is a Factory, not a ServerFactory, but they are identical.
    return factory  # type: ignore[return-value]


class SynapseManhole(ColoredManhole):
    """Overrides connectionMade to create our own ManholeInterpreter"""

    def connectionMade(self) -> None:
        super().connectionMade()

        # replace the manhole interpreter with our own impl
        self.interpreter = SynapseManholeInterpreter(self, self.namespace)

        # this would also be a good place to add more keyHandlers.


class SynapseManholeInterpreter(ManholeInterpreter):
    def showsyntaxerror(self, filename: Optional[str] = None) -> None:
        """Display the syntax error that just occurred.

        Overrides the base implementation, ignoring sys.excepthook. We always want
        any syntax errors to be sent to the terminal, rather than sentry.
        """
        type, value, tb = sys.exc_info()
        assert value is not None
        sys.last_type = type
        sys.last_value = value
        sys.last_traceback = tb
        if filename and type is SyntaxError:
            # Work hard to stuff the correct filename in the exception
            try:
                msg, (dummy_filename, lineno, offset, line) = value.args
            except ValueError:
                # Not the format we expect; leave it alone
                pass
            else:
                # Stuff in the right filename
                value = SyntaxError(msg, (filename, lineno, offset, line))
                sys.last_value = value
        lines = traceback.format_exception_only(type, value)
        self.write("".join(lines))

    def showtraceback(self) -> None:
        """Display the exception that just occurred.

        Overrides the base implementation, ignoring sys.excepthook. We always want
        any syntax errors to be sent to the terminal, rather than sentry.
        """
        sys.last_type, sys.last_value, last_tb = ei = sys.exc_info()
        sys.last_traceback = last_tb
        assert last_tb is not None

        try:
            # We remove the first stack item because it is our own code.
            lines = traceback.format_exception(ei[0], ei[1], last_tb.tb_next)
            self.write("".join(lines))
        finally:
            # On the line below, last_tb and ei appear to be dead.
            # It's unclear whether there is a reason behind this line.
            # It conceivably could be because an exception raised in this block
            # will keep the local frame (containing these local variables) around.
            # This was adapted taken from CPython's Lib/code.py; see here:
            # https://github.com/python/cpython/blob/4dc4300c686f543d504ab6fa9fe600eaf11bb695/Lib/code.py#L131-L150
            last_tb = ei = None  # type: ignore

    def displayhook(self, obj: Any) -> None:
        """
        We override the displayhook so that we automatically convert coroutines
        into Deferreds. (Our superclass' displayhook will take care of the rest,
        by displaying the Deferred if it's ready, or registering a callback
        if it's not).
        """
        if inspect.iscoroutine(obj):
            super().displayhook(defer.ensureDeferred(obj))
        else:
            super().displayhook(obj)
