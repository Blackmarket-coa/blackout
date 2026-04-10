# Copyright 2014-2016 OpenMarket Ltd
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
import collections.abc
import re
from typing import TYPE_CHECKING, List, Type, Union, cast

import jsonschema

from synapse._pydantic_compat import HAS_PYDANTIC_V2

if TYPE_CHECKING or HAS_PYDANTIC_V2:
    from pydantic.v1 import Field, StrictBool, StrictStr
else:
    from pydantic import Field, StrictBool, StrictStr

from synapse.api.constants import (
    MAX_ALIAS_LENGTH,
    EventContentFields,
    EventTypes,
    Membership,
)
from synapse.api.errors import Codes, SynapseError
from synapse.api.room_versions import EventFormatVersions
from synapse.config.homeserver import HomeServerConfig
from synapse.events import EventBase
from synapse.events.builder import EventBuilder
from synapse.events.utils import (
    CANONICALJSON_MAX_INT,
    CANONICALJSON_MIN_INT,
    validate_canonicaljson,
)
from synapse.http.servlet import validate_json_object
from synapse.rest.models import RequestBodyModel
from synapse.storage.controllers.state import server_acl_evaluator_from_event
from synapse.types import EventID, JsonDict, RoomID, StrCollection, UserID
from synapse.util.blackout import (
    BlackoutSignalValidationResult,
    validate_blackout_signal_content as validate_blackout_signal_content_util,
)

_HEX_256_RE = re.compile(r"^[0-9a-fA-F]{64}$")
_BASE64_256_RE = re.compile(r"^[A-Za-z0-9+/]{43}=$|^[A-Za-z0-9+/]{44}$")


def _is_fixed_length_hash(value: object) -> bool:
    if not isinstance(value, str):
        return False

    if _HEX_256_RE.fullmatch(value):
        return True

    if not _BASE64_256_RE.fullmatch(value):
        return False

    try:
        return len(base64.b64decode(value, validate=True)) == 32
    except Exception:
        return False


def validate_blackout_signal_content(
    content: object,
) -> BlackoutSignalValidationResult:
    """Validate structure for m.blackout.signal payload sections.

    This extends the utility validator with additional strict checks enforced at
    event validation/ingress boundaries.
    """

    result = validate_blackout_signal_content_util(content)

    if not isinstance(content, dict):
        raise ValueError("invalid m.blackout.signal content: must be a JSON object")

    if "sdp_offer" in content and "sdp_answer" in content:
        raise ValueError(
            "invalid m.blackout.signal content: only one of sdp_offer or sdp_answer is allowed"
        )

    ice_candidates = content.get("ice_candidates")
    if ice_candidates is not None:
        if not isinstance(ice_candidates, list):
            raise ValueError(
                "invalid m.blackout.signal content: ice_candidates must be a list"
            )

        for idx, candidate in enumerate(ice_candidates):
            prefix = "ice_candidates[%d]" % (idx,)
            if not isinstance(candidate, dict):
                raise ValueError(
                    f"invalid m.blackout.signal content: {prefix} must be an object"
                )

            if (
                not isinstance(candidate.get("candidate"), str)
                or not candidate["candidate"].strip()
            ):
                raise ValueError(
                    "invalid m.blackout.signal content: %s.candidate must be a non-empty string"
                    % (prefix,)
                )

            if "sdpMLineIndex" in candidate and not isinstance(
                candidate["sdpMLineIndex"], int
            ):
                raise ValueError(
                    "invalid m.blackout.signal content: %s.sdpMLineIndex must be an integer"
                    % (prefix,)
                )

            if "sdpMid" in candidate and (
                not isinstance(candidate["sdpMid"], str)
                or not candidate["sdpMid"].strip()
            ):
                raise ValueError(
                    "invalid m.blackout.signal content: %s.sdpMid must be a non-empty string"
                    % (prefix,)
                )

    chunk_announcements = content.get("chunk_announcements")
    if chunk_announcements is not None:
        if not isinstance(chunk_announcements, list):
            raise ValueError(
                "invalid m.blackout.signal content: chunk_announcements must be a list"
            )

        for idx, chunk in enumerate(chunk_announcements):
            prefix = "chunk_announcements[%d]" % (idx,)
            if not isinstance(chunk, dict):
                raise ValueError(
                    f"invalid m.blackout.signal content: {prefix} must be an object"
                )

            if not _is_fixed_length_hash(chunk.get("chunk_hash")):
                raise ValueError(
                    "invalid m.blackout.signal content: %s.chunk_hash must be a 32-byte hex/base64 hash"
                    % (prefix,)
                )

            merkle_root = chunk.get("merkle_root")
            if merkle_root is not None and not _is_fixed_length_hash(merkle_root):
                raise ValueError(
                    "invalid m.blackout.signal content: %s.merkle_root must be a 32-byte hex/base64 hash"
                    % (prefix,)
                )

    return result


class EventValidator:
    def validate_new(self, event: EventBase, config: HomeServerConfig) -> None:
        """Validates the event has roughly the right format

        Suitable for checking a locally-created event. It has stricter checks than
        is appropriate for an event received over federation (for which, see
        event_auth.validate_event_for_room_version)

        Args:
            event: The event to validate.
            config: The homeserver's configuration.
        """
        self.validate_builder(event)

        if event.format_version == EventFormatVersions.ROOM_V1_V2:
            EventID.from_string(event.event_id)

        required = [
            "auth_events",
            "content",
            "hashes",
            "origin",
            "prev_events",
            "sender",
            "type",
        ]

        for k in required:
            if k not in event:
                raise SynapseError(400, "Event does not have key %s" % (k,))

        # Check that the following keys have string values
        event_strings = ["origin"]

        for s in event_strings:
            if not isinstance(getattr(event, s), str):
                raise SynapseError(400, "'%s' not a string type" % (s,))

        # Depending on the room version, ensure the data is spec compliant JSON.
        if event.room_version.strict_canonicaljson:
            # Note that only the client controlled portion of the event is
            # checked, since we trust the portions of the event we created.
            validate_canonicaljson(event.content)

        if event.type == EventTypes.Aliases:
            if "aliases" in event.content:
                for alias in event.content["aliases"]:
                    if len(alias) > MAX_ALIAS_LENGTH:
                        raise SynapseError(
                            400,
                            (
                                "Can't create aliases longer than"
                                " %d characters" % (MAX_ALIAS_LENGTH,)
                            ),
                            Codes.INVALID_PARAM,
                        )

        elif event.type == EventTypes.Retention:
            self._validate_retention(event)

        elif event.type == EventTypes.ServerACL:
            server_acl_evaluator = server_acl_evaluator_from_event(event)
            if not server_acl_evaluator.server_matches_acl_event(
                config.server.server_name
            ):
                raise SynapseError(
                    400, "Can't create an ACL event that denies the local server"
                )

        elif event.type == EventTypes.PowerLevels:
            try:
                jsonschema.validate(
                    instance=event.content,
                    schema=POWER_LEVELS_SCHEMA,
                    cls=POWER_LEVELS_VALIDATOR,
                )
            except jsonschema.ValidationError as e:
                if e.path:
                    # example: "users_default": '0' is not of type 'integer'
                    # cast safety: path entries can be integers, if we fail to validate
                    # items in an array. However, the POWER_LEVELS_SCHEMA doesn't expect
                    # to see any arrays.
                    message = (
                        '"' + cast(str, e.path[-1]) + '": ' + e.message  # noqa: B306
                    )
                    # jsonschema.ValidationError.message is a valid attribute
                else:
                    # example: '0' is not of type 'integer'
                    message = e.message  # noqa: B306
                    # jsonschema.ValidationError.message is a valid attribute

                raise SynapseError(
                    code=400,
                    msg=message,
                    errcode=Codes.BAD_JSON,
                )

        # If the event contains a mentions key, validate it.
        if EventContentFields.MENTIONS in event.content:
            validate_json_object(event.content[EventContentFields.MENTIONS], Mentions)

    def _validate_retention(self, event: EventBase) -> None:
        """Checks that an event that defines the retention policy for a room respects the
        format enforced by the spec.

        Args:
            event: The event to validate.
        """
        if not event.is_state():
            raise SynapseError(code=400, msg="must be a state event")

        min_lifetime = event.content.get("min_lifetime")
        max_lifetime = event.content.get("max_lifetime")

        if min_lifetime is not None:
            if type(min_lifetime) is not int:  # noqa: E721
                raise SynapseError(
                    code=400,
                    msg="'min_lifetime' must be an integer",
                    errcode=Codes.BAD_JSON,
                )

        if max_lifetime is not None:
            if type(max_lifetime) is not int:  # noqa: E721
                raise SynapseError(
                    code=400,
                    msg="'max_lifetime' must be an integer",
                    errcode=Codes.BAD_JSON,
                )

        if (
            min_lifetime is not None
            and max_lifetime is not None
            and min_lifetime > max_lifetime
        ):
            raise SynapseError(
                code=400,
                msg="'min_lifetime' can't be greater than 'max_lifetime",
                errcode=Codes.BAD_JSON,
            )

    def validate_builder(self, event: Union[EventBase, EventBuilder]) -> None:
        """Validates that the builder/event has roughly the right format. Only
        checks values that we expect a proto event to have, rather than all the
        fields an event would have
        """

        strings = ["room_id", "sender", "type"]

        if hasattr(event, "state_key"):
            strings.append("state_key")

        for s in strings:
            if not isinstance(getattr(event, s), str):
                raise SynapseError(400, "Not '%s' a string type" % (s,))

        RoomID.from_string(event.room_id)
        UserID.from_string(event.sender)

        if event.type == EventTypes.Message:
            strings = ["body", "msgtype"]

            self._ensure_strings(event.content, strings)

        elif event.type == EventTypes.Topic:
            self._ensure_strings(event.content, ["topic"])
            self._ensure_state_event(event)
        elif event.type == EventTypes.Name:
            self._ensure_strings(event.content, ["name"])
            self._ensure_state_event(event)
        elif event.type == EventTypes.Member:
            if "membership" not in event.content:
                raise SynapseError(400, "Content has not membership key")

            if event.content["membership"] not in Membership.LIST:
                raise SynapseError(400, "Invalid membership key")

            self._ensure_state_event(event)
        elif event.type == EventTypes.Tombstone:
            if "replacement_room" not in event.content:
                raise SynapseError(400, "Content has no replacement_room key")

            if event.content["replacement_room"] == event.room_id:
                raise SynapseError(
                    400, "Tombstone cannot reference the room it was sent in"
                )

            self._ensure_state_event(event)
        elif event.type == EventTypes.BlackoutSignal:
            try:
                validate_blackout_signal_content_util(event.content)
            except ValueError as e:
                raise SynapseError(400, str(e), Codes.BAD_JSON)

    def _ensure_strings(self, d: JsonDict, keys: StrCollection) -> None:
        for s in keys:
            if s not in d:
                raise SynapseError(400, "'%s' not in content" % (s,))
            if not isinstance(d[s], str):
                raise SynapseError(400, "'%s' not a string type" % (s,))

    def _ensure_state_event(self, event: Union[EventBase, EventBuilder]) -> None:
        if not event.is_state():
            raise SynapseError(400, "'%s' must be state events" % (event.type,))


POWER_LEVELS_SCHEMA = {
    "type": "object",
    "properties": {
        "ban": {"$ref": "#/definitions/int"},
        "events": {"$ref": "#/definitions/objectOfInts"},
        "events_default": {"$ref": "#/definitions/int"},
        "invite": {"$ref": "#/definitions/int"},
        "kick": {"$ref": "#/definitions/int"},
        "notifications": {"$ref": "#/definitions/objectOfInts"},
        "redact": {"$ref": "#/definitions/int"},
        "state_default": {"$ref": "#/definitions/int"},
        "users": {"$ref": "#/definitions/objectOfInts"},
        "users_default": {"$ref": "#/definitions/int"},
    },
    "definitions": {
        "int": {
            "type": "integer",
            "minimum": CANONICALJSON_MIN_INT,
            "maximum": CANONICALJSON_MAX_INT,
        },
        "objectOfInts": {
            "type": "object",
            "additionalProperties": {"$ref": "#/definitions/int"},
        },
    },
}


class Mentions(RequestBodyModel):
    user_ids: List[StrictStr] = Field(default_factory=list)
    room: StrictBool = False


# This could return something newer than Draft 7, but that's the current "latest"
# validator.
def _create_validator(schema: JsonDict) -> Type[jsonschema.Draft7Validator]:
    validator = jsonschema.validators.validator_for(schema)

    # by default jsonschema does not consider a immutabledict to be an object so
    # we need to use a custom type checker
    # https://python-jsonschema.readthedocs.io/en/stable/validate/?highlight=object#validating-with-additional-types
    type_checker = validator.TYPE_CHECKER.redefine(
        "object", lambda checker, thing: isinstance(thing, collections.abc.Mapping)
    )

    return jsonschema.validators.extend(validator, type_checker=type_checker)


POWER_LEVELS_VALIDATOR = _create_validator(POWER_LEVELS_SCHEMA)
