from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Iterable, Tuple


@dataclass(frozen=True)
class CRDTOperation:
    key: str
    value: str
    site: str
    counter: int


class AutomergePrototypeCRDT:
    """Deterministic map-style CRDT prototype for runtime validation.

    Uses LWW register semantics with (counter, site) ordering.
    """

    def __init__(self) -> None:
        self._state: Dict[str, Tuple[int, str, str]] = {}

    def apply(self, op: CRDTOperation) -> None:
        current = self._state.get(op.key)
        incoming = (op.counter, op.site, op.value)
        if current is None or incoming[:2] >= current[:2]:
            self._state[op.key] = incoming

    def merge(self, other: "AutomergePrototypeCRDT") -> None:
        for key, (counter, site, value) in other._state.items():
            self.apply(CRDTOperation(key=key, value=value, site=site, counter=counter))

    def snapshot(self) -> Dict[str, Tuple[int, str, str]]:
        return dict(self._state)

    def import_snapshot(self, snapshot: Dict[str, Tuple[int, str, str]]) -> None:
        self._state = dict(snapshot)

    def values(self) -> Dict[str, str]:
        return {key: value for key, (_, _, value) in self._state.items()}

    def apply_many(self, operations: Iterable[CRDTOperation]) -> None:
        for op in operations:
            self.apply(op)
