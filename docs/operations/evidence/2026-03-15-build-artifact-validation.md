# Evidence — Production build artifact and runtime config validation

Date: 2026-03-15
Branch: `work`
Commit under test: `c1fd1c460c03a108f51499062dc4f10c36868da4`
Verifier: Codex (GPT-5.2-Codex)

## Scope

Validate build artifact generation and runtime config assumptions for deployment readiness.

## Commands and outcomes

1. `pnpm build`
   - Exit code: `0`
   - Output summary:
     - `turbo run build`
     - `Tasks: 7 successful, 7 total`
     - Build tasks executed across `@blackout/{config,core,design,desktop,mobile,ui,web}`
     - Non-blocking Turbo warnings: missing configured output files for `@blackout/{core,design,ui}#build`

2. `pnpm dist`
   - Applicability check outcome: **not applicable in current monorepo root**.
   - Evidence commands:
     - `node -e "const p=require('./package.json'); console.log('root has dist script:', Object.prototype.hasOwnProperty.call(p.scripts||{},'dist'));"`
     - `rg -n '"dist"\s*:' package.json apps/*/package.json packages/*/package.json`
   - Results:
     - Root scripts do not define `dist` (`root has dist script: false`).
     - No workspace package exposes a `dist` script in checked `package.json` files.

3. Artifact existence verification
   - Command: `rg --files packages apps | rg '/dist/|\\.js$|\\.d\\.ts$'`
   - Observed output files include:
     - `packages/config/dist/index.js`
     - `apps/web/dist/index.js`
     - `apps/mobile/dist/index.js`
     - `apps/desktop/dist/index.js`

4. Artifact size/checksum snapshot
   - Command: `stat -c "%s bytes" <artifact>` and `sha256sum <artifact>`
   - Results:
     - `packages/config/dist/index.js` — `44 bytes` — `827c148a2159c5d098f9fe33185b555382ad63931193dda5f41f6af38a6a4445`
     - `apps/web/dist/index.js` — `44 bytes` — `827c148a2159c5d098f9fe33185b555382ad63931193dda5f41f6af38a6a4445`
     - `apps/mobile/dist/index.js` — `44 bytes` — `827c148a2159c5d098f9fe33185b555382ad63931193dda5f41f6af38a6a4445`
     - `apps/desktop/dist/index.js` — `44 bytes` — `827c148a2159c5d098f9fe33185b555382ad63931193dda5f41f6af38a6a4445`

5. Runtime config assumption validation
   - Commands:
     - `test -f config.sample.json`
     - `node -e "JSON.parse(require('fs').readFileSync('config.sample.json','utf8'));"`
     - `test -f config.json`
   - Results:
     - `config.sample.json` exists and parses as valid JSON.
     - `config.json` is absent in this environment (expected for fresh clone/CI image before deploy config injection).
   - Reference workflow:
     - README documents `config.sample.json -> config.json` setup before runtime usage.

## Environment-specific notes

- This repository’s current top-level build flow is `pnpm build` (Turbo monorepo). A `pnpm dist` command is not currently defined at root/workspace level.
- Turbo emits non-blocking `outputs` warnings for some package build tasks; build still exits successfully.

## Conclusion

Production build generation passes for the current branch head, artifacts are present and checksummed, and runtime config assumptions are validated against the sample-config workflow.
