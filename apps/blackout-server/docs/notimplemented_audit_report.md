# NotImplementedError runtime audit (synapse/)

Date: 2026-02-23

## Scope

Audit command used:

```bash
rg -n "raise\s+NotImplementedError|NotImplementedError" synapse
```

## File-by-file disposition

### `synapse/federation/sender/__init__.py`

- **Classification:** A (valid abstract interface / non-runtime reference)
- **Findings:**
  - The `NotImplementedError` references are in comments only.
  - `AbstractFederationSender` uses `abc.ABCMeta` + `@abc.abstractmethod` for interface requirements, which is the preferred abstract mechanism.
  - No runtime `raise NotImplementedError` path exists in this file.
- **Action:** No code change required.

### `synapse/http/federation/srv_resolver.py`

- **Classification:** A (external typed exception)
- **Findings:**
  - Uses Twisted's `DNSNotImplementedError` import/handling, which is a typed DNS resolver exception from dependency code, not a local raw `raise NotImplementedError`.
  - No runtime `raise NotImplementedError` path exists in this file.
- **Action:** No code change required.

## Category B (concrete runtime gaps)

- **Result:** None found in `synapse/`.
- Since there were no Category B sites, no behavior changes or additional regression tests were required for this audit.
