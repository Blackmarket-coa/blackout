# Divergence guardrails policy

This policy defines where Blackout may diverge from upstream Synapse while preserving interoperability.

## Allowed divergence (with controls)

1. **Operational tooling and deployment bootstrap**
   - container startup scripts, runbooks, CI scaffolding.
2. **Operator-facing defaults and feature flags**
   - additive and reversible via configuration.
3. **Fork-only metadata and docs**
   - release process, ownership, observability scaffolding.
4. **Experimental extensions**
   - only additive and behind explicit flags.

## Prohibited divergence

1. **Breaking Matrix protocol behavior by default**
   - client-server/federation endpoint semantics must remain compatible.
2. **Silent auth/signing/federation behavior drift**
   - risky areas require explicit review markers and compatibility evidence.
3. **Undocumented security backport omissions**
   - release notes must track upstream patched commit IDs.

## Risky path classes requiring markers

The following path classes are treated as high-risk divergence:

* `synapse/api/auth*`
* `synapse/config/auth.py`
* `synapse/handlers/federation*`
* `synapse/federation/*`
* `synapse/crypto/*`
* `synapse/rest/key/*`

If any are modified, add checked path markers under
`release/train/checklist.md -> ## Divergence Risk Markers`.

## Compatibility evidence requirement

For behavior-affecting changes, include:

* client compatibility smoke test evidence
* federation compatibility smoke test evidence
* rollback note (how to disable/revert via config where applicable)
