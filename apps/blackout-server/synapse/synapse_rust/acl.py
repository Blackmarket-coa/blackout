from __future__ import annotations

import fnmatch
import ipaddress
from dataclasses import dataclass
from typing import Sequence


@dataclass(frozen=True)
class ServerAclEvaluator:
    allow_ip_literals: bool
    allow: Sequence[str]
    deny: Sequence[str]

    def server_matches_acl_event(self, server_name: str) -> bool:
        # ACL matching is case-insensitive for DNS names.
        if server_name.startswith("[") and "]" in server_name:
            host = server_name.split("]", 1)[0] + "]"
        else:
            host = server_name.split(":", 1)[0]
        host = host.lower()

        if not self.allow_ip_literals:
            try:
                ipaddress.ip_address(host.strip("[]"))
                return False
            except ValueError:
                pass

        if any(fnmatch.fnmatchcase(host, denied.lower()) for denied in self.deny):
            return False

        if not self.allow:
            return True

        return any(fnmatch.fnmatchcase(host, allowed.lower()) for allowed in self.allow)
