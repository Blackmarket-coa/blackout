# Incomplete work tracker

## Requested Synapse P0 marker debt (blocked)

### Closed in this repository
- Confirmed that the requested Synapse files are not present in this checkout:
  - `synapse/handlers/deactivate_account.py`
  - `synapse/federation/federation_client.py`
  - `synapse/media/url_previewer.py`
- Confirmed there is no existing `INCOMPLETE_WORK.md`; this tracker was created to record the blocked request.

### Remaining
- **TRACKED ISSUE: REPO-MISMATCH-SYNAPSE-P0**
  - The requested P0 TODO/FIXME fixes cannot be implemented in this repository because the target files do not exist here.
  - Next action: run this task against a repository that actually contains the Synapse Python sources, then:
    1. replace TODO/FIXME markers with code changes,
    2. add/update tests for each behavior change,
    3. run relevant test targets.
