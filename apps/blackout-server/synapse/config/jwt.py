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
import logging
from typing import Any, Callable, Dict, List, Optional

from synapse.types import JsonDict
from synapse.util.check_dependencies import check_requirements

from ._base import Config, ConfigError

logger = logging.getLogger(__name__)

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
            self._check_enabled()
            self.jwt_secret = jwt_config["secret"]
            self.jwt_algorithm = jwt_config["algorithm"]

            self.jwt_subject_claim = jwt_config.get("subject_claim", "sub")

            # The issuer and audiences are optional, if provided, it is asserted
            # that the claims exist on the JWT.
            self.jwt_issuer = jwt_config.get("issuer")
            self.jwt_audiences = jwt_config.get("audiences")
            check_requirements("jwt")
            self._check_algorithm()
            self._check_hmac_secret()
        else:
            self.jwt_enabled = False
            self.jwt_secret = None
            self.jwt_algorithm = None
            self.jwt_subject_claim = None
            self.jwt_issuer = None
            self.jwt_audiences = None

    def _check_enabled(self) -> None:
        """Refuse an ``enabled`` that is not a YAML boolean.

        JWT login is on whenever ``enabled`` is truthy, so a string turned it
        on: ``"false"``, or ``${JWT_ENABLED:-false}`` left as text by
        ``envsubst``, which expands no default. ``null``, an empty value, and
        numbers are refused too, so that the configuration says ``true`` or
        ``false``. A missing ``enabled`` still means off. (Blackout fork
        patch, see PATCHES.md, 2026-10-31.)
        """
        if not isinstance(self.jwt_enabled, bool):
            raise ConfigError(
                "jwt_config.enabled must be true or false (a YAML boolean), "
                "not %r" % (self.jwt_enabled,),
                ("jwt_config", "enabled"),
            )

    def _check_algorithm(self) -> None:
        """Refuse an algorithm that would let anyone log in, or no one.

        ``JwtHandler`` passes the one configured algorithm to
        ``JsonWebToken([algorithm])``. With ``none``, authlib accepts an
        unsigned token for any user, whatever the secret. With a name that is
        not one of authlib's JWS algorithms (a JWE algorithm, a typo, a
        lowercase name), every token is refused, because a JWE token would
        need its ``enc`` in the same list. (Blackout fork patch, see
        PATCHES.md, 2026-10-30.)
        """
        if not self.jwt_enabled:
            return

        from authlib.jose import JsonWebSignature

        algorithm = self.jwt_algorithm
        usable = sorted(a for a in JsonWebSignature.ALGORITHMS_REGISTRY if a != "none")
        if algorithm == "none":
            raise ConfigError(
                "jwt_config.algorithm cannot be none: an unsigned token would "
                "log in as any user",
                ("jwt_config", "algorithm"),
            )
        if not isinstance(algorithm, str) or algorithm not in usable:
            raise ConfigError(
                "jwt_config.algorithm must be one of %s, not %r"
                % (", ".join(usable), algorithm),
                ("jwt_config", "algorithm"),
            )

    def _check_hmac_secret(self) -> None:
        """Refuse an HS* secret that JWT login could not use, or that anyone could.

        ``JwtHandler`` verifies each token with
        ``JsonWebToken([algorithm]).decode(token, key=secret)``. That raises
        ValueError, which the handler does not catch, from authlib 1.9.0 when
        the key contains PEM or SSH key text anywhere, and from 1.9.1 when it
        is empty, so every JWT login would answer 500. Before 1.9.1 an empty
        key verified a token anyone could sign (GHSA-8m4g-j4wp-wgcg).

        So this makes the handler's own call, with a token signed with the
        empty key. authlib prepares the secret as it would for a login (a JWK
        given as a mapping or as JSON text included) and checks the
        signature. A key passes only when that check fails, as it must for a
        usable key. An empty or missing secret is refused first, on any
        authlib version.

        In a key set, authlib picks the member whose ``kid`` equals the
        token's with ``==``, whatever the JSON types. So a member whose
        ``kid`` is present and is not a string (``5``, ``true``, ``null``) is
        refused first, naming its index: ``kid: 5`` would be chosen by a
        token whose ``kid`` is ``5``, and ``kid: true`` by one whose ``kid``
        is ``true`` or ``1``, and no string ``kid`` stands for those. That
        also refuses a set that loaded before this check, a usable key under
        ``kid: 5`` among them: failing closed is the point. Then
        the set is checked under each distinct string ``kid`` it names, or,
        when it names none, with a token without one, which authlib serves
        from a one-key set only. A member without a ``kid`` in a set that
        names others is never chosen, so it is not tried. A key that works
        as the empty key refuses the whole set. A key that cannot be used for
        the algorithm (an RSA or EC JWK, ``use: enc``) only logs a warning
        when another key in the set can be used: the handler serves the
        usable keys, and answers a token naming the other one with a 500, as
        it did before this check. A set with no usable key is refused.
        (Blackout fork patch, see PATCHES.md, 2026-10-30 and 2026-10-31.)
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

        def cannot_use(reason: str) -> ConfigError:
            return ConfigError(
                f"jwt_config.secret cannot be used as an {algorithm} key: {reason}",
                path,
            )

        try:
            raw_key = prepare_raw_key(self.jwt_secret)
        except Exception as e:
            raise cannot_use(f"{type(e).__name__}: {e}") from e

        is_set = isinstance(raw_key, dict) and isinstance(raw_key.get("keys"), list)
        members: List[Any] = raw_key["keys"] if is_set else [raw_key]
        # authlib picks a set's member with ``k.get("kid") == kid``, whatever
        # the JSON types: a member filed under the kid 5 is chosen by a token
        # whose kid is 5 or 5.0, and one under true by true, 1 or 1.0. No
        # string kid tried below stands for those. RFC 7517 sec. 4.5 makes
        # kid a string, so refuse any other, before the other checks.
        if is_set:
            for index, key in enumerate(members):
                if (
                    isinstance(key, dict)
                    and "kid" in key
                    and not isinstance(key["kid"], str)
                ):
                    kid_text = json.dumps(key["kid"], default=repr)
                    raise cannot_use(
                        f"keys[{index}] has a kid that is not a string "
                        f"({kid_text}); a JWK kid is a string (RFC 7517)"
                    )

        # An empty k fails in 1.9.1 but verifies in 1.6.12, so refuse it here
        # whichever version is installed, in a key set too.
        for key in members:
            if isinstance(key, dict) and key.get("k") == "":
                named = "" if key.get("kid") is None else f" (kid {key['kid']!r})"
                raise cannot_use(f"a JWK with an empty k{named}")

        # Every kid in a set is a string now, and a string is equal only to a
        # string, so a token reaches a member only by naming its kid, or, with
        # no kid, when the member is the set's only key. Try each distinct
        # kid; with none, try without one.
        kids: List[str] = []
        if is_set:
            for key in members:
                kid = key.get("kid") if isinstance(key, dict) else None
                if isinstance(kid, str) and kid not in kids:
                    kids.append(kid)

        jwt = JsonWebToken([algorithm])
        unusable: Dict[Optional[str], Exception] = {}
        candidates: List[Optional[str]] = [*kids] if kids else [None]
        for kid in candidates:
            try:
                jwt.decode(_empty_key_token(algorithm, kid), key=self.jwt_secret)
            except BadSignatureError:
                continue
            except Exception as e:
                unusable[kid] = e
                continue
            where = "" if kid is None else f" (the key with kid {kid!r})"
            raise ConfigError(
                f"jwt_config.secret{where} works as an empty {algorithm} key, "
                "so anyone could sign a login token",
                path,
            )

        if not unusable:
            return
        if not kids:
            error = unusable[None]
            raise cannot_use(f"{type(error).__name__}: {error}") from error

        reasons = [
            f"kid {kid!r}: {type(error).__name__}: {error}"
            for kid, error in unusable.items()
        ]
        if len(unusable) == len(kids):
            raise cannot_use(
                "no key in the set can be used (%s)" % "; ".join(reasons)
            ) from next(iter(unusable.values()))
        for reason in reasons:
            logger.warning(
                "jwt_config.secret: a key cannot be used as an %s key, so a login "
                "token naming it will fail: %s",
                algorithm,
                reason,
            )
