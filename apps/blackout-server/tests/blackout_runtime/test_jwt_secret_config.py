"""JWT login refuses, at startup, an HS* secret that authlib refuses per token.

From authlib 1.9.0 an HMAC key that is empty, or that contains PEM or SSH key
text anywhere (``-----BEGIN ``, ``ssh-rsa `` and four more markers), raises
ValueError on every verify. ``JwtHandler`` catches only authlib's JoseError,
so such a secret made every JWT login answer 500. The fork checks the secret
in ``JWTConfig`` (``synapse/config/jwt.py``) instead.

Records: docs/security/dependency-advisories-server-desktop-2026-10-30.md
(repository root) and PATCHES.md, 2026-10-30.
"""

from __future__ import annotations

from typing import Any, Dict

from synapse.config import ConfigError
from synapse.config.homeserver import HomeServerConfig

from tests.unittest import TestCase, skip_unless
from tests.utils import HAS_AUTHLIB, default_config

# A PEM header over a fragment, not a usable key: authlib's marker check reads
# only the bytes, and the config parses no key for an asymmetric algorithm.
PUBLIC_KEY_TEXT = "-----BEGIN PUBLIC KEY-----\nMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQc=\n"


@skip_unless(HAS_AUTHLIB, "requires authlib")
class JwtSecretConfigTestCase(TestCase):
    def _parse(self, jwt_config: Dict[str, Any]) -> HomeServerConfig:
        config_dict = {**default_config("test"), "jwt_config": jwt_config}
        config = HomeServerConfig()
        config.parse_config_dict(config_dict, "", "")
        return config

    def test_unusable_hmac_secrets_are_refused(self) -> None:
        for algorithm in ("HS256", "HS384", "HS512"):
            for secret in (
                "",
                "abc-----BEGIN xyz",
                "my ssh-rsa shared secret",
                PUBLIC_KEY_TEXT,
            ):
                with self.subTest(algorithm=algorithm, secret=secret):
                    with self.assertRaises(ConfigError) as cm:
                        self._parse(
                            {"enabled": True, "secret": secret, "algorithm": algorithm}
                        )
                    self.assertEqual(cm.exception.path, ("jwt_config", "secret"))

    def test_plain_hmac_secret_is_accepted(self) -> None:
        config = self._parse(
            {"enabled": True, "secret": "plain-secret", "algorithm": "HS256"}
        )
        self.assertTrue(config.jwt.jwt_enabled)
        self.assertEqual(config.jwt.jwt_secret, "plain-secret")

    def test_public_key_for_asymmetric_algorithm_is_not_checked(self) -> None:
        config = self._parse(
            {"enabled": True, "secret": PUBLIC_KEY_TEXT, "algorithm": "RS256"}
        )
        self.assertEqual(config.jwt.jwt_secret, PUBLIC_KEY_TEXT)

    def test_disabled_jwt_login_is_not_checked(self) -> None:
        config = self._parse({"enabled": False, "secret": "", "algorithm": "HS256"})
        self.assertFalse(config.jwt.jwt_enabled)
