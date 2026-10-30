# Copyright 2015 Niklas Riekenbrauck
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

import base64
import hashlib
import hmac
import json
from typing import Any, Callable, Dict, List, Optional

from synapse.types import JsonDict
from synapse.util.check_dependencies import check_requirements

from ._base import Config, ConfigError

# The HMAC algorithms authlib implements for JWT login, and their hashes.
_HMAC_DIGESTS: Dict[str, Callable[..., Any]] = {
    "HS256": hashlib.sha256,
    "HS384": hashlib.sha384,
    "HS512": hashlib.sha512,
}


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _empty_key_token(algorithm: str, kid: Optional[str]) -> str:
    """A compact JWT signed with the empty HMAC key, as anyone could sign one."""
    header: JsonDict = {"alg": algorithm, "typ": "JWT"}
    if kid is not None:
        header["kid"] = kid
    signing_input = "%s.%s" % (
        _b64url(json.dumps(header).encode("utf-8")),
        _b64url(json.dumps({"sub": "jwt-config-startup-check"}).encode("utf-8")),
    )
    signature = hmac.new(
        b"", signing_input.encode("ascii"), _HMAC_DIGESTS[algorithm]
    ).digest()
    return "%s.%s" % (signing_input, _b64url(signature))


class JWTConfig(Config):
    section = "jwt"

    def read_config(self, config: JsonDict, **kwargs: Any) -> None:
        jwt_config = config.get("jwt_config", None)
        if jwt_config:
            self.jwt_enabled = jwt_config.get("enabled", False)
            self.jwt_secret = jwt_config["secret"]
            self.jwt_algorithm = jwt_config["algorithm"]

            self.jwt_subject_claim = jwt_config.get("subject_claim", "sub")

            # The issuer and audiences are optional, if provided, it is asserted
            # that the claims exist on the JWT.
            self.jwt_issuer = jwt_config.get("issuer")
            self.jwt_audiences = jwt_config.get("audiences")
            check_requirements("jwt")
            self._check_hmac_secret()
        else:
            self.jwt_enabled = False
            self.jwt_secret = None
            self.jwt_algorithm = None
            self.jwt_subject_claim = None
            self.jwt_issuer = None
            self.jwt_audiences = None

    def _check_hmac_secret(self) -> None:
        """Refuse an HS* secret that JWT login could not use, or that anyone could.

        ``JwtHandler`` verifies each token with
        ``JsonWebToken([algorithm]).decode(token, key=secret)``. From authlib
        1.9.0 that raises ValueError, which the handler does not catch, when
        the key is empty or contains PEM or SSH key text anywhere, so every
        JWT login would answer 500. Before 1.9.1 an empty key verified a token
        anyone could sign (GHSA-8m4g-j4wp-wgcg).

        So this makes the handler's own call once, with a token signed with
        the empty key. authlib prepares the secret as it would for a login (a
        JWK given as a mapping or as JSON text included) and checks the
        signature. The secret passes only when that check fails, as it must
        for a usable key. An empty or missing secret is refused first, on any
        authlib version. (Blackout fork patch, see PATCHES.md, 2026-10-30.)
        """
        algorithm = self.jwt_algorithm
        if not self.jwt_enabled or algorithm not in _HMAC_DIGESTS:
            return

        path = ("jwt_config", "secret")
        if not self.jwt_secret:
            raise ConfigError(
                f"jwt_config.secret must be set to a non-empty {algorithm} key", path
            )

        from authlib.jose import JsonWebToken
        from authlib.jose.errors import BadSignatureError
        from authlib.jose.rfc7519.jwt import prepare_raw_key

        jwt = JsonWebToken([algorithm])
        try:
            # authlib picks a key from a key set by the token's kid, so try
            # each kid the set names. With none, it takes a set's only key.
            raw_key = prepare_raw_key(self.jwt_secret)
            kids: List[Optional[str]] = []
            if isinstance(raw_key, dict) and isinstance(raw_key.get("keys"), list):
                for key in raw_key["keys"]:
                    if isinstance(key, dict) and key.get("kid") is not None:
                        kids.append(key["kid"])
            for kid in kids or [None]:
                try:
                    jwt.decode(_empty_key_token(algorithm, kid), key=self.jwt_secret)
                except BadSignatureError:
                    continue
                raise ConfigError(
                    f"jwt_config.secret works as an empty {algorithm} key, "
                    "so anyone could sign a login token",
                    path,
                )
        except ConfigError:
            raise
        except Exception as e:
            raise ConfigError(
                f"jwt_config.secret cannot be used as an {algorithm} key: "
                f"{type(e).__name__}: {e}",
                path,
            ) from e
