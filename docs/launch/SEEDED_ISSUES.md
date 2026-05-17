# Seeded Issues — V1 Test Flight

Twelve copy-paste-ready starter issues. File them all at **H-2** (two hours
before launch) using `gh issue create`, then pin a `good first issue` filter
in the README's "For testers" block.

The set was harvested directly from `KNOWN_LIMITATIONS.md` and audit notes —
every issue here points at a real, scoped piece of work.

## Filing them

Prereqs:
- All labels in `.github/labels.yml` have been synced.
- You're in a checkout of `Blackmarket-coa/blackout`.
- `gh auth status` shows you signed in to GitHub.

Each issue below has a fenced `gh` command. Run them in order; the first
output line of each is the URL of the filed issue — paste that into the
launch checklist so we can verify all 12 made it.

---

## 1 — Playbook Q1 SVG drop-in (XS)

Refs `KNOWN_LIMITATIONS.md` §"Playbook Q1 icons". The component already
accepts `leadingIcon`; we just need 4 SVGs in `public/res/svg/playbook/`.

```bash
gh issue create \
  --title "Playbook Q1: drop in solarpunk SVG icons (q1-size-{trio|small|medium|constellation})" \
  --label "good first issue" --label "T-Task" --label "area:onboarding" --label "surface:web" \
  --body "Q1 (\"How many of us are in this den?\") renders without bespoke iconography. The component (\`apps/blackout-client/src/app/features/playbook/picker/QuestionSize.tsx\`) already accepts a \`leadingIcon\` prop, so this is a drop-in once assets land.

**Acceptance**
- Add 4 SVGs under \`public/res/svg/playbook/q1-size-{trio|small|medium|constellation}.svg\`.
- Wire each as the \`leadingIcon\` for the corresponding option.
- No visual regression in dark mode.

See \`KNOWN_LIMITATIONS.md\` § Playbook Q1 icons."
```

## 2 — Marketplace placeholder production guard (S)

Refs `KNOWN_LIMITATIONS.md` §"Placeholder integrations".

```bash
gh issue create \
  --title "Marketplace placeholders: hard-fail in production if *_ENABLED=true is set" \
  --label "good first issue" --label "T-Task" --label "area:governance" --label "surface:server" \
  --body "The Blamazon / MayhemMarketplaze / AntinAmazon integrations are placeholders. Today they silently no-op. We want a runtime guard that hard-fails on boot if \`NODE_ENV=production\` AND any of \`*_ENABLED=true\` is set, so a misconfigured deploy can't pretend to be a marketplace.

**Acceptance**
- Add the guard in \`packages/api/src/integrations/marketplace/{blamazon,mayhemMarketplaze,antinAmazon}.ts\`.
- Unit tests at the matching path that exercise both branches (production+enabled → throws; everything else → ok).
- No change to FBM integration behavior."
```

## 3 — Notification routing harness (Capacitor / mobile) (M)

Refs `KNOWN_LIMITATIONS.md` §"Notification click-to-room routing".

```bash
gh issue create \
  --title "Capacitor: notification click-to-room routing harness" \
  --label "Help Wanted" --label "T-Task" --label "surface:mobile" --label "area:onboarding" \
  --body "We don't have an automated check that a notification payload routes correctly to \`/room/:id?thread=:tid\` on Capacitor. Manual testing is OK for beta but flakey.

**Acceptance**
- Add a Playwright (or Cypress) harness under \`blackout-mobile/\` that mocks a notification payload and asserts the router lands on the correct route.
- Cover at least: room without thread, room with thread, invalid room ID.
- Wire into the mobile-contract CI workflow."
```

## 4 — Notification routing harness (Tauri / desktop) (M)

Sibling of #3.

```bash
gh issue create \
  --title "Tauri: notification click-to-room routing harness" \
  --label "Help Wanted" --label "T-Task" --label "surface:desktop" --label "area:onboarding" \
  --body "Sibling of the Capacitor harness (#3). Same shape, Tauri runtime.

**Acceptance**
- Harness lives under \`blackout-desktop/\`.
- Covers the same three cases as #3.
- Wired into the desktop CI workflow."
```

## 5 — Livestream den chat deep-link analytics (S)

Refs `KNOWN_LIMITATIONS.md` §"Livestream den chat overlay".

```bash
gh issue create \
  --title "Livestream viewer: emit click event for 'Join den chat' deep-link" \
  --label "good first issue" --label "T-Enhancement" --label "area:livekit" --label "surface:web" \
  --body "The livestream viewer's \"Join den chat\" CTA is a deep link today. To plan whether V1.1 needs a fully embedded chat overlay (Workstream D), we need data on whether users actually click through.

**Acceptance**
- Add a click event in \`apps/blackout-client/src/app/features/streams/LivestreamViewer.tsx\` (event name: \`livestream.deeplink.den_chat.click\`).
- Existing analytics wiring picks it up; no new pipeline needed.
- Add a brief comment explaining the V1.1 decision point this enables."
```

## 6 — CONTRIBUTING.md first-PR walkthrough screenshots (XS)

```bash
gh issue create \
  --title "CONTRIBUTING.md: add fork → branch → PR walkthrough screenshots" \
  --label "good first issue" --label "T-Task" --label "area:onboarding" \
  --body "Three screenshots in \`docs/img/contributing/\` covering the GitHub fork → branch → PR flow. Linked from CONTRIBUTING.md \"How to contribute\".

**Acceptance**
- 3 PNGs at 1280px wide, dark-mode GitHub.
- Inline references in CONTRIBUTING.md.
- AUTHORS.rst entry for the contributor."
```

## 7 — Document `co.bmc.coalition` state event schema (S)

```bash
gh issue create \
  --title "Doc: \`co.bmc.coalition\` state event schema" \
  --label "good first issue" --label "T-Task" --label "area:coalition" \
  --body "\`packages/core/src/coalition/events.ts\` is the source of truth for the coalition state event, but it has no narrative doc. Federation peers and plugin authors need one.

**Acceptance**
- New file \`docs/architecture/coalition-state-event.md\`.
- Documents: event type, content shape, valid \`enabledTabs\` values, semantics of \`canopyId\` and \`description\`.
- Cite line numbers in \`events.ts\`."
```

## 8 — Coliseum Coalition smoke test (S)

```bash
gh issue create \
  --title "Coliseum Coalition: Playwright smoke test (5 tabs render)" \
  --label "coliseum" --label "T-Task" --label "H6-12" \
  --body "Once the launch-day Coliseum Coalition is seeded on matrix.theblackout.app, add a Playwright smoke test that:

1. Joins the Coalition as a test user.
2. Confirms all enabled tabs render (\`enabledTabs\` per \`packages/core/src/coalition/events.ts\`).
3. Confirms at least one seeded mutual-aid post is visible.
4. Confirms the seeded governance proposal is visible.

**Acceptance**
- New spec under \`playwright/e2e/coliseum/\`.
- Wired into the standard e2e workflow with the Coliseum room alias as an env input.

Depends on: Coliseum being seeded (B6 of launch prep)."
```

## 9 — Issue / Discussion template YAML validation workflow (XS)

```bash
gh issue create \
  --title "CI: validate \`.github/ISSUE_TEMPLATE\` and \`.github/DISCUSSION_TEMPLATE\` YAML on PR" \
  --label "good first issue" --label "T-Task" \
  --body "Add a GitHub Action that parses every YAML in \`.github/ISSUE_TEMPLATE/\` and \`.github/DISCUSSION_TEMPLATE/\` on PRs that touch those paths, and fails if any file fails to parse.

**Acceptance**
- New workflow file at \`.github/workflows/validate-issue-templates.yml\`.
- Runs on \`pull_request\` paths-filtered to those directories.
- Uses a lightweight YAML parser (no need for full GitHub form-schema validation; that's a bigger project)."
```

## 10 — Label-sync workflow prune-mode audit (S)

```bash
gh issue create \
  --title "Audit label-sync workflow: does it support prune?" \
  --label "T-Task" \
  --body "\`.github/workflows/sync-labels.yml\` calls \`element-hq/element-meta/.github/workflows/sync-labels.yml@develop\`. We dropped ~40 Element-internal labels from \`.github/labels.yml\` during launch prep; if the upstream workflow doesn't prune, those labels are still on the repo until manually deleted in the UI.

**Acceptance**
- Read the upstream workflow.
- If it accepts a \`prune\` input, set it true. If it doesn't, document that label deletions are a manual step in CONTRIBUTING.md.
- Either way, audit the live label set and ensure the dropped labels are gone."
```

## 11 — Mutual-aid lifecycle unit tests (XS)

```bash
gh issue create \
  --title "Tests: mutual-aid \`deriveDisplayStatus\` and \`isPostExpired\`" \
  --label "good first issue" --label "T-Task" --label "area:mutual-aid" \
  --body "\`packages/core/src/coalition/mutualAid.ts\` exports \`deriveDisplayStatus\` and \`isPostExpired\`. Coverage is thin — confirm and fill gaps.

**Acceptance**
- Verify current coverage with \`pnpm test --coverage --filter mutualAid\`.
- Add unit tests for each lifecycle transition (open → in_progress → fulfilled, open → expired, etc.) and each urgency level's effect.
- Target ≥90% coverage on the two functions."
```

## 12 — Tauri code-signing verification doc (M)

```bash
gh issue create \
  --title "Doc: how testers verify the Tauri code-signing chain" \
  --label "Help Wanted" --label "T-Task" --label "surface:desktop" --label "area:onboarding" \
  --body "\`blackout-desktop/\` doesn't have a doc explaining how a tester verifies the signing chain when installing the desktop build. We need one before testers see release builds.

**Acceptance**
- New doc at \`blackout-desktop/docs/signing-verification.md\`.
- Per-OS instructions: macOS (gatekeeper, \`codesign\`), Windows (SmartScreen, signtool), Linux (GPG signature on Flatpak / .deb).
- Linked from the desktop README and CONTRIBUTING.md."
```

---

## Smoke check after filing

After running all 12:

```bash
gh issue list --label "good first issue" --json number,title,labels --limit 20
gh issue list --label "coliseum" --json number,title,labels --limit 20
gh issue list --label "Help Wanted" --json number,title,labels --limit 20
```

Expected: at least 6 `good first issue`, 1 `coliseum`, 3 `Help Wanted`.
Each should carry at least one `surface:*` or `area:*` label.

Then update `docs/launch/PRE_LAUNCH_CHECKLIST.md` ✓ for "seeded issues filed."
