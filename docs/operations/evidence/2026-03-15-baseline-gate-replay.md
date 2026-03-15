# Evidence — Baseline gate replay (pnpm/Turbo)

Date: 2026-03-15
Branch: `work`
Commit under test: `570ce20de77199b50d284338114c3ce5ff3b0dde`
Verifier: Codex (GPT-5.2-Codex)

## Scope

Repository baseline gate replay for deployment readiness on branch head.

## Commands and outcomes

1. `pnpm install --no-frozen-lockfile`
   - Exit code: `0`
   - Output summary:
     - `Scope: all 8 workspace projects`
     - `Lockfile is up to date, resolution step is skipped`
     - `Already up to date`

2. `pnpm lint`
   - Exit code: `0`
   - Output summary:
     - `turbo run lint`
     - `Tasks: 10 successful, 10 total`
     - Typecheck/lint tasks passed across `@blackout/{config,core,design,desktop,mobile,ui,web}`
     - Non-blocking Turbo warnings: missing configured output files for `@blackout/{core,design,ui}#build`

3. `pnpm test`
   - Exit code: `0`
   - Output summary:
     - `turbo run test`
     - `Tasks: 10 successful, 10 total`
     - Workspace test commands (`tsc --noEmit`) passed for all scoped packages/apps
     - Non-blocking Turbo warnings: missing configured output files for `@blackout/{core,design,ui}#build`

4. `pnpm audit --audit-level moderate`
   - Exit code: `0`
   - Output summary:
     - `No known vulnerabilities found`

## Conclusion

Baseline gate sequence completed successfully on branch head with all required commands passing.
