# Plugin-Only Customization Policy (PR-1 Freeze Baseline)

## Status
- Effective in PR-1 guardrails phase.
- Runtime behavior is intentionally unchanged in this phase.

## Policy
1. **No ad hoc shell/runtime customization paths.**
2. **All custom behavior must map to named feature modules or plugin boundaries.**
3. **Shell extension points stay minimal:** only feature composition and plugin registration entrypoints are valid injection points.
4. **Matrix client-server compatibility and federation semantics are preserved:** no protocol contract rewrites for UX-only goals.
5. **Migration remains additive and reversible through feature flags and registration controls.**

## Approved extension points
- `src/app/core/features/registry.ts`
- `src/app/core/features/plugins.ts`
- `src/app/core/features/composition.ts`

## Guardrails introduced in PR-1
- **Registration freeze snapshot:** `registeredFeatureModuleIds` is the allowlist for feature injection.
- **CI registration check:** unregistered feature IDs in plugin modules fail guard checks.
- **Legacy import gate expansion:** shell/runtime entrypoints cannot import `bmc-*` modules directly.
- **Lint guard:** shell/runtime entrypoint files reject direct `bmc-*` imports.

## Why this is federation-safe
These guardrails only constrain composition/injection boundaries and static imports. They do not alter Matrix SDK contracts, event payload semantics, or protocol behavior.

## Rollout / rollback
- Rollout: keep guards enabled in CI and lint, then migrate custom logic behind plugin modules in later PRs.
- Rollback: if a guard blocks urgent work, temporarily disable the specific CI script invocation or lint override in one commit, then restore after module registration is corrected.
