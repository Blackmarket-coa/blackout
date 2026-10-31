"""JWT login refuses, at startup, an HS* secret it could not use or anyone could.

``JwtHandler`` verifies each token with
``JsonWebToken([algorithm]).decode(token, key=secret)``. That raises
ValueError, which the handler does not catch, from authlib 1.9.0 for a key that
contains PEM or SSH key text anywhere (``-----BEGIN ``, ``ssh-rsa `` and four
more markers), and from 1.9.1 for an empty key, so every JWT login answered
500. Under authlib 1.6.12 an empty key accepted tokens anyone could sign. The
secret may also be a JWK, as a mapping or as JSON text, which authlib unpacks
on every verify.

``JWTConfig`` (``synapse/config/jwt.py``) now makes the handler's call at
startup, with a token signed with the empty key, and refuses an empty or
missing secret, or a JWK with an empty ``k``, before that on any authlib
version. A key set is checked under each ``kid``: a key that cannot be used
for HS* only logs a warning while another key can be used. It also refuses
``algorithm: none``, with which authlib accepts an unsigned token, and any name
that is not one of authlib's JWS algorithms.

Records: docs/security/dependency-advisories-server-desktop-2026-10-30.md
(repository root) and PATCHES.md, 2026-10-30.
"""

from __future__ import annotations

import base64
import json
from typing import Any, Dict

from cryptography.hazmat.primitives.asymmetric import ec

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


def _oct_jwk(raw: bytes, **extra: Any) -> Dict[str, Any]:
    return {"kty": "oct", "k": _b64url(raw), **extra}


def _ec_public_jwk(kid: str) -> Dict[str, str]:
    """A P-256 public JWK, made at run time, as an identity provider's JWKS has."""
    numbers = ec.generate_private_key(ec.SECP256R1()).public_key().public_numbers()
    return {
        "kty": "EC",
        "crv": "P-256",
        "x": _b64url(numbers.x.to_bytes(32, "big")),
        "y": _b64url(numbers.y.to_bytes(32, "big")),
        "kid": kid,
    }


EC_PUBLIC_JWK = _ec_public_jwk("idp-ec")
SIGN_ONLY_JWK = _oct_jwk(b"sign-only-secret", kid="sign-only", key_ops=["sign"])


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
    # A usable key does not make up for an empty one.
    "key set with a usable key and an empty k": {
        "keys": [
            _oct_jwk(b"first-secret", kid="first"),
            {"kty": "oct", "k": "", "kid": "empty"},
        ]
    },
    "key set whose second key is a zero byte": {
        "keys": [
            _oct_jwk(b"first-secret", kid="first"),
            _oct_jwk(b"\x00", kid="zero"),
        ]
    },
    "key set with no usable key": {"keys": [EC_PUBLIC_JWK, SIGN_ONLY_JWK]},
    "key set of two keys without a kid": {
        "keys": [_oct_jwk(b"first-secret"), _oct_jwk(b"second-secret")]
    },
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
    "key set of one key without a kid": {"keys": [_oct_jwk(b"only-secret")]},
}

# A usable key next to one HS* cannot use: accepted with a warning naming the
# other key, because the handler serves the usable one (as it did before the
# startup check).
MIXED_SECRETS: Dict[str, Any] = {
    "an EC public JWK": {
        "keys": [_oct_jwk(b"first-secret", kid="first"), EC_PUBLIC_JWK]
    },
    "an oct JWK that may only sign": {
        "keys": [_oct_jwk(b"first-secret", kid="first"), SIGN_ONLY_JWK]
    },
}

# Refused at jwt_config.algorithm: none would accept an unsigned token for any
# user, and the rest are not JWS algorithms authlib implements, so every token
# would be refused.
REFUSED_ALGORITHMS: Dict[str, Any] = {
    "none": "none",
    "NONE": "NONE",
    "lowercase": "hs256",
    "a JWE algorithm": "dir",
    "unknown": "HS1024",
    "empty": "",
    "null": None,
    "a list": ["HS256"],
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

    def test_mixed_key_sets_are_accepted_with_a_warning(self) -> None:
        for algorithm in ("HS256", "HS384", "HS512"):
            for label, secret in MIXED_SECRETS.items():
                with self.subTest(algorithm=algorithm, secret=label):
                    with self.assertLogs("synapse.config.jwt", "WARNING") as logs:
                        config = _parse(
                            {"enabled": True, "secret": secret, "algorithm": algorithm}
                        )
                    self.assertEqual(config.jwt.jwt_secret, secret)
                    self.assertEqual(len(logs.output), 1, logs.output)
                    self.assertIn(repr(secret["keys"][1]["kid"]), logs.output[0])
                    self.assertNotIn("'first'", logs.output[0])

    def test_unusable_algorithms_are_refused(self) -> None:
        for label, algorithm in REFUSED_ALGORITHMS.items():
            with self.subTest(algorithm=label):
                with self.assertRaises(ConfigError) as cm:
                    _parse(
                        {
                            "enabled": True,
                            "secret": "plain-secret",
                            "algorithm": algorithm,
                        }
                    )
                self.assertEqual(cm.exception.path, ("jwt_config", "algorithm"))

    def test_public_key_for_asymmetric_algorithm_is_not_checked(self) -> None:
        for algorithm in ("RS256", "ES256", "PS512", "EdDSA"):
            with self.subTest(algorithm=algorithm):
                config = _parse(
                    {"enabled": True, "secret": PUBLIC_KEY_TEXT, "algorithm": algorithm}
                )
                self.assertEqual(config.jwt.jwt_secret, PUBLIC_KEY_TEXT)

    def test_disabled_jwt_login_is_not_checked(self) -> None:
        for algorithm in ("HS256", "none"):
            with self.subTest(algorithm=algorithm):
                config = _parse(
                    {"enabled": False, "secret": "", "algorithm": algorithm}
                )
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


@skip_unless(HAS_AUTHLIB, "requires authlib")
class JwtLoginWithMixedKeySetTestCase(HomeserverTestCase):
    """A set with a usable key and an EC public JWK starts, the usable key logs
    in, and a token naming the EC key does not."""

    servlets = [login.register_servlets]

    def default_config(self) -> Dict[str, Any]:
        config = super().default_config()
        config["jwt_config"] = {
            "enabled": True,
            "secret": MIXED_SECRETS["an EC public JWK"],
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

    def test_the_usable_key_logs_in(self) -> None:
        channel = self._login("first", b"first-secret")
        self.assertEqual(channel.code, 200, channel.json_body)
        self.assertEqual(channel.json_body["user_id"], "@frog:test")

    def test_a_token_naming_the_ec_key_does_not_log_in(self) -> None:
        # authlib raises ValueError for an EC JWK as an HS256 key, which the
        # handler does not catch: a 500, as before the startup check.
        channel = self._login("idp-ec", b"first-secret")
        self.assertNotEqual(channel.code, 200, channel.json_body)
        self.assertNotIn("access_token", channel.json_body)
