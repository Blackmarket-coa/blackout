"""Pins for the MSC3861 client assertions, which authlib 1.9.1 now signs with joserfc.

``synapse/api/auth/msc3861_delegated.py`` authenticates its token
introspection requests with ``client_secret_jwt`` or ``private_key_jwt``
(RFC 7523). From 1.7.0 authlib builds and signs those assertions through
joserfc, and nothing else in the tree exercises them: the upstream tests use
``client_secret_post``, and upstream has since removed experimental MSC3861.

Each test drives a real introspection request, takes the posted
``client_assertion`` and checks it independently of authlib: the signature
with ``cryptography`` or ``hmac``, and the header and claims as JSON.

Record: docs/security/dependency-advisories-server-desktop-2026-10-30.md
(repository root).
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
from typing import Any, Dict, Tuple
from unittest.mock import AsyncMock, Mock
from urllib.parse import parse_qs

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import padding, rsa

from twisted.test.proto_helpers import MemoryReactor

from synapse.server import HomeServer
from synapse.util import Clock

# Imported as a module, not as names: trial collects every TestCase class in
# this module's namespace, and that suite already runs on its own.
import tests.handlers.test_oauth_delegation as delegation_tests
from tests.test_utils import FakeResponse
from tests.unittest import HomeserverTestCase, skip_unless
from tests.utils import HAS_AUTHLIB, checked_cast

ASSERTION_TYPE = "urn:ietf:params:oauth:client-assertion-type:jwt-bearer"
KID = "blackout-test-kid"


def _b64url_uint(value: int) -> str:
    raw = value.to_bytes((value.bit_length() + 7) // 8, "big")
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def _b64url_decode(segment: str) -> bytes:
    return base64.urlsafe_b64decode(segment + "=" * (-len(segment) % 4))


def _private_jwk(key: rsa.RSAPrivateKey) -> Dict[str, str]:
    public = key.public_key().public_numbers()
    private = key.private_numbers()
    return {
        "kty": "RSA",
        "kid": KID,
        "n": _b64url_uint(public.n),
        "e": _b64url_uint(public.e),
        "d": _b64url_uint(private.d),
        "p": _b64url_uint(private.p),
        "q": _b64url_uint(private.q),
        "dp": _b64url_uint(private.dmp1),
        "dq": _b64url_uint(private.dmq1),
        "qi": _b64url_uint(private.iqmp),
    }


# Generated per run, so no private key is committed.
_SIGNING_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)
_OTHER_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)


class _ClientAssertionTestCase(HomeserverTestCase):
    """Sends one introspection request and returns what was posted."""

    client_auth: Dict[str, Any] = {}

    def default_config(self) -> Dict[str, Any]:
        config = super().default_config()
        config["public_baseurl"] = delegation_tests.BASE_URL
        config["disable_registration"] = True
        config["experimental_features"] = {
            "msc3861": {
                "enabled": True,
                "issuer": delegation_tests.ISSUER,
                "client_id": delegation_tests.CLIENT_ID,
                **self.client_auth,
            }
        }
        return config

    def make_homeserver(self, reactor: MemoryReactor, clock: Clock) -> HomeServer:
        self.http_client = Mock(spec=["get_json"])
        self.http_client.get_json.side_effect = delegation_tests.get_json
        self.http_client.user_agent = b"Synapse Test"

        hs = self.setup_test_homeserver(proxied_http_client=self.http_client)

        # Imported here, once authlib is known to be available.
        from synapse.api.auth.msc3861_delegated import MSC3861DelegatedAuth

        self.auth = checked_cast(MSC3861DelegatedAuth, hs.get_auth())
        return hs

    def _introspect(self) -> Tuple[Dict[str, Any], bytes, bytes]:
        """Checks the posted form and the assertion's claims, and returns the
        assertion's header, its signing input and its signature."""
        self.http_client.request = AsyncMock(
            return_value=FakeResponse.json(code=200, payload={"active": False})
        )
        before = int(time.time())
        self.get_success(self.auth._introspect_token("mockAccessToken"))
        after = int(time.time())

        self.http_client.request.assert_called_once()
        kwargs = self.http_client.request.call_args[1]
        self.assertEqual(kwargs["method"], "POST")
        self.assertEqual(kwargs["uri"], delegation_tests.INTROSPECTION_ENDPOINT)
        fields = parse_qs(kwargs["data"].decode("utf-8"))

        self.assertEqual(fields["token"], ["mockAccessToken"])
        self.assertEqual(fields["client_assertion_type"], [ASSERTION_TYPE])
        self.assertNotIn("client_secret", fields)
        (assertion,) = fields["client_assertion"]

        header_b64, claims_b64, signature_b64 = assertion.split(".")
        header = json.loads(_b64url_decode(header_b64))
        claims = json.loads(_b64url_decode(claims_b64))

        # RFC 7523 sec. 3: iss and sub are the client, aud is where it is sent.
        self.assertEqual(claims["iss"], delegation_tests.CLIENT_ID)
        self.assertEqual(claims["sub"], delegation_tests.CLIENT_ID)
        self.assertEqual(claims["aud"], delegation_tests.INTROSPECTION_ENDPOINT)
        self.assertIsInstance(claims["jti"], str)
        self.assertTrue(claims["jti"])
        self.assertEqual(claims["exp"] - claims["iat"], 3600)
        self.assertTrue(before <= claims["iat"] <= after)
        self.assertEqual(header["typ"], "JWT")

        signing_input = f"{header_b64}.{claims_b64}".encode("ascii")
        return header, signing_input, _b64url_decode(signature_b64)


@skip_unless(HAS_AUTHLIB, "requires authlib")
class PrivateKeyJwtTestCase(_ClientAssertionTestCase):
    client_auth = {
        "client_auth_method": "private_key_jwt",
        "jwk": _private_jwk(_SIGNING_KEY),
    }

    def test_assertion_is_rs256_signed_with_the_configured_key(self) -> None:
        header, signing_input, signature = self._introspect()

        self.assertEqual(header["alg"], "RS256")
        # PrivateKeyJWTWithKid adds the kid, which Keycloak needs.
        self.assertEqual(header["kid"], KID)

        _SIGNING_KEY.public_key().verify(
            signature, signing_input, padding.PKCS1v15(), hashes.SHA256()
        )
        # And the check above is a real one.
        with self.assertRaises(InvalidSignature):
            _OTHER_KEY.public_key().verify(
                signature,
                signing_input,
                padding.PKCS1v15(),
                hashes.SHA256(),
            )


@skip_unless(HAS_AUTHLIB, "requires authlib")
class ClientSecretJwtTestCase(_ClientAssertionTestCase):
    client_auth = {
        "client_auth_method": "client_secret_jwt",
        "client_secret": delegation_tests.CLIENT_SECRET,
    }

    def test_assertion_is_hs256_signed_with_the_client_secret(self) -> None:
        header, signing_input, signature = self._introspect()

        self.assertEqual(header["alg"], "HS256")
        self.assertNotIn("kid", header)

        expected = hmac.new(
            delegation_tests.CLIENT_SECRET.encode("utf-8"),
            signing_input,
            hashlib.sha256,
        ).digest()
        self.assertTrue(hmac.compare_digest(signature, expected))
        # And the check above is a real one.
        wrong = hmac.new(b"another-secret", signing_input, hashlib.sha256)
        self.assertFalse(hmac.compare_digest(signature, wrong.digest()))
