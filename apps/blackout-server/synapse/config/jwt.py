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

from typing import Any

from synapse.types import JsonDict
from synapse.util.check_dependencies import check_requirements

from ._base import Config, ConfigError


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
        """Refuse an HS* secret that authlib would refuse on every login.

        From authlib 1.9.0 an HMAC key that is empty, or that contains PEM or
        SSH key text anywhere, raises ValueError when a token is verified.
        JwtHandler does not catch that, so every JWT login would answer 500.
        Import the key here, as authlib's HMAC algorithms do, and stop at
        startup instead. (Blackout fork patch, see PATCHES.md, 2026-10-30.)
        """
        if not self.jwt_enabled or not str(self.jwt_algorithm).startswith("HS"):
            return

        from authlib.jose import OctKey

        try:
            OctKey.import_key(self.jwt_secret)
        except ValueError as e:
            raise ConfigError(
                f"jwt_config.secret cannot be used as an {self.jwt_algorithm} key: {e}",
                ("jwt_config", "secret"),
            )
