"""JWT login refuses, at startup, an HS* secret it could not use or anyone could.

``JwtHandler`` verifies each token with
``JsonWebToken([algorithm]).decode(token, key=secret)``. That raises
ValueError, which the handler does not catch, from authlib 1.9.0 for a key that
contains PEM or SSH key text anywhere (``-----BEGIN ``, ``ssh-rsa `` and four
more markers), and from 1.9.1 for an empty key, so every JWT login answered
500. Under authlib 1.6.12 an empty key accepted tokens anyone could sign. The
secret may also be a JWK, as a mapping or as JSON text, which authlib unpacks
on every verify.

``JWTConfig`` (``synapse/config/jwt.py``) now makes the handler's call once at
startup, with a token signed with the empty key, and refuses an empty or
missing secret before that on any authlib version.

Records: docs/security/dependency-advisories-server-desktop-2026-10-30.md
(repository root) and PATCHES.md, 2026-10-30.
"""

from __future__ import annotations

import base64
import json
from typing import Any, Dict

from synapse.config import ConfigError
from synapse.config.homeserver import HomeServerConfig
from synapse.rest.client import login

from tests.unittest import HomeserverTestCase, TestCase, skip_unless
from tests.utils import HAS_AUTHLIB, default_config

LOGIN_URL = b"/_matrix/client/r0/login"

# A PEM header over a fragment, not a usable key: authlib's marker check reads
# only the bytes, and the config parses no key for an asymmetric algorithm.
PUBLIC_KEY_TEXT = "-----BEGIN PUBLIC KEY-----\nMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQc=\n"


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _oct_jwk(raw: bytes, **extra: str) -> Dict[str, str]:
    return {"kty": "oct", "k": _b64url(raw), **extra}


# Refused under the locked authlib (>=1.9.1).
REFUSED_SECRETS: Dict[str, Any] = {
    "empty string": "",
    "null": None,
    "PEM marker inside": "abc-----BEGIN xyz",
    "SSH marker inside": "my ssh-rsa shared secret",
    "public key text": PUBLIC_KEY_TEXT,
    "JWK mapping, empty k": {"kty": "oct", "k": ""},
    "JWK JSON text, empty k": '{"kty": "oct", "k": ""}',
    "JWK mapping, PEM k": _oct_jwk(b"-----BEGIN PUBLIC KEY-----"),
    "JWK JSON text, PEM k": json.dumps(_oct_jwk(b"-----BEGIN PUBLIC KEY-----")),
    "JWK mapping, use enc": _oct_jwk(b"plain-secret", use="enc"),
    "empty key set": {"keys": []},
    "key set with an empty k": {"keys": [{"kty": "oct", "k": "", "kid": "a"}]},
    "JSON text that does not parse": "{not json}",
    # HMAC pads a key with zero bytes, so this is the empty key.
    "a zero byte": "\x00",
}

ACCEPTED_SECRETS: Dict[str, Any] = {
    "plain secret": "plain-secret",
    "JWK mapping": _oct_jwk(b"plain-secret"),
    "JWK JSON text": json.dumps(_oct_jwk(b"plain-secret")),
    "key set": {
        "keys": [
            _oct_jwk(b"first-secret", kid="first"),
            _oct_jwk(b"second-secret", kid="second"),
        ]
    },
}


def _parse(jwt_config: Dict[str, Any]) -> HomeServerConfig:
    config_dict = {**default_config("test"), "jwt_config": jwt_config}
    config = HomeServerConfig()
    config.parse_config_dict(config_dict, "", "")
    return config


@skip_unless(HAS_AUTHLIB, "requires authlib")
class JwtSecretConfigTestCase(TestCase):
    def test_unusable_hmac_secrets_are_refused(self) -> None:
        for algorithm in ("HS256", "HS384", "HS512"):
            for label, secret in REFUSED_SECRETS.items():
                with self.subTest(algorithm=algorithm, secret=label):
                    with self.assertRaises(ConfigError) as cm:
                        _parse(
                            {"enabled": True, "secret": secret, "algorithm": algorithm}
                        )
                    self.assertEqual(cm.exception.path, ("jwt_config", "secret"))

    def test_usable_hmac_secrets_are_accepted(self) -> None:
        for algorithm in ("HS256", "HS384", "HS512"):
            for label, secret in ACCEPTED_SECRETS.items():
                with self.subTest(algorithm=algorithm, secret=label):
                    config = _parse(
                        {"enabled": True, "secret": secret, "algorithm": algorithm}
                    )
                    self.assertTrue(config.jwt.jwt_enabled)
                    self.assertEqual(config.jwt.jwt_secret, secret)

    def test_public_key_for_asymmetric_algorithm_is_not_checked(self) -> None:
        config = _parse(
            {"enabled": True, "secret": PUBLIC_KEY_TEXT, "algorithm": "RS256"}
        )
        self.assertEqual(config.jwt.jwt_secret, PUBLIC_KEY_TEXT)

    def test_disabled_jwt_login_is_not_checked(self) -> None:
        config = _parse({"enabled": False, "secret": "", "algorithm": "HS256"})
        self.assertFalse(config.jwt.jwt_enabled)


@skip_unless(HAS_AUTHLIB, "requires authlib")
class JwtLoginWithJwkSecretTestCase(HomeserverTestCase):
    """A JWK secret the check accepts logs in, so the check does not refuse
    a shape the handler can use."""

    servlets = [login.register_servlets]

    def default_config(self) -> Dict[str, Any]:
        config = super().default_config()
        config["jwt_config"] = {
            "enabled": True,
            "secret": ACCEPTED_SECRETS["key set"],
            "algorithm": "HS256",
        }
        return config

    def _login(self, kid: str, raw_key: bytes) -> Any:
        from authlib.jose import jwt

        token = jwt.encode({"alg": "HS256", "kid": kid}, {"sub": "frog"}, raw_key)
        return self.make_request(
            "POST",
            LOGIN_URL,
            {"type": "org.matrix.login.jwt", "token": token.decode("ascii")},
        )

    def test_each_key_of_the_set_logs_in(self) -> None:
        for kid, raw_key in (("first", b"first-secret"), ("second", b"second-secret")):
            with self.subTest(kid=kid):
                channel = self._login(kid, raw_key)
                self.assertEqual(channel.code, 200, channel.json_body)
                self.assertEqual(channel.json_body["user_id"], "@frog:test")

    def test_a_key_under_the_wrong_kid_is_refused(self) -> None:
        channel = self._login("first", b"second-secret")
        self.assertEqual(channel.code, 403, channel.json_body)
