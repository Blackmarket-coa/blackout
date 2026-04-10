# synapse/ NotImplementedError audit

## Scope
- Directory audited: `synapse/`
- Runtime gap pattern audited: `raise NotImplementedError(...)`

## Commands executed
- `rg -n "raise NotImplementedError\(" synapse`
- `rg -n "NotImplementedError" synapse`
- `python tests/check_runtime_notimplemented.py`

## Disposition by file
No concrete `raise NotImplementedError(...)` statements were found under `synapse/`.

`NotImplementedError` references that exist are **not** runtime gaps:

- `synapse/http/federation/srv_resolver.py`
  - Imports / handles Twisted's `DNSNotImplementedError` (third-party DNS resolver exception).
  - **Category:** external-exception handling (not a local `raise NotImplementedError`).

- `synapse/federation/sender/__init__.py`
  - Abstract API surface is modeled via `@abc.abstractmethod` methods on `AbstractFederationSender`.
  - Class docstring explicitly documents that this is intentional and preferred over runtime
    `raise NotImplementedError` stubs.
  - **Category A:** valid abstract interface.

## Category summary
- **A) valid abstract interface:** `synapse/federation/sender/__init__.py` (`AbstractFederationSender`).
- **B) concrete runtime gap:** none found in `synapse/`.

## Runtime-path safety checks
- `tests/check_runtime_notimplemented.py` statically parses all `synapse/**/*.py`
  modules via `ast` and fails if runtime `raise NotImplementedError` sites are introduced.
- `tests/test_runtime_notimplemented_audit.py` adds a pytest regression check that:
  - asserts there are no runtime `raise NotImplementedError` paths under `synapse/`; and
  - verifies `srv_resolver` only references Twisted's `DNSNotImplementedError`.
