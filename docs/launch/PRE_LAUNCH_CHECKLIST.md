# Pre-Launch Checklist — V1 Test Flight

Run at **T-2 hours** against the launch branch. Each box must be ticked or
explicitly waived (with reason) before opening the welcome room to public
sign-ups. Borrowed substance from [`docs/launch-smoke-suite.md`](../launch-smoke-suite.md);
this checklist focuses on the **launch governance** layer (community-facing
artifacts, roles, ops) rather than the technical smoke suite.

> **Do not skip this checklist.** A broken link in TESTERS.md at H0 is a
> retention-killer in the first 30 minutes. The 2-hour buffer exists so we
> can fix anything that surfaces here.

## Tier 1 — Identity sweep

- [ ] [`CODE_OF_CONDUCT.md`](../../CODE_OF_CONDUCT.md) exists at repo root and renders on GitHub.
- [ ] [`CONTRIBUTING.md`](../../CONTRIBUTING.md) shows "Contributing to Blackout" (not Element).
- [ ] `grep -ci element /home/user/blackout/CONTRIBUTING.md` returns 0 (or only legal-attribution lines you intentionally kept).
- [ ] [`.github/CODEOWNERS`](../../.github/CODEOWNERS) routes catch-all to `@Blackmarket-coa/blackout-maintainers`.
- [ ] [`.github/FUNDING.yml`](../../.github/FUNDING.yml) shows Blackout channels — sponsor heart on the repo home points to either GitHub Sponsors or `https://theblackout.app/donate`, never `matrixdotorg`.
- [ ] [`README.md`](../../README.md) first three lines do not contain Element Web shields; "For testers" block is present and the four links inside resolve.
- [ ] GitHub Community Standards (`https://github.com/Blackmarket-coa/blackout/community`) shows green for: Description, README, Code of conduct, Contributing, License, Security policy, Issue templates, PR template.

## Tier 2 — Issue and Discussion templates

- [ ] `https://github.com/Blackmarket-coa/blackout/issues/new/choose` shows **10 templates**: bug-web, bug-desktop, bug-mobile, bug-federation, bug-voice-video, bug-performance, onboarding-confusion, coliseum-finding, security-concern, enhancement. Each renders without a YAML error.
- [ ] `https://github.com/Blackmarket-coa/blackout/discussions/new/choose` shows **6 categories** matching `DISCUSSION_TEMPLATE/` files: Roadmap, Plugin Ideas, Governance, UX Feedback, Steganography, Federation Policy. (Requires the maintainer to create matching categories in repo settings beforehand.)
- [ ] Discussion categories exist in repo settings (matching the YAML category names exactly).

## Tier 2 — Labels

- [ ] Labels sync completed. Spot-check 5 new labels exist:
  - [ ] `coliseum`
  - [ ] `role:scout`
  - [ ] `severity:critical`
  - [ ] `challenge:onboarding`
  - [ ] `H0-6`
- [ ] Spot-check 2 dropped labels are gone:
  - [ ] `A-EMS`
  - [ ] `Z-t3chguy`
- [ ] If the upstream sync-labels workflow doesn't prune, the dropped labels were manually deleted in the GitHub UI.

## Tier 3 — Contributor onboarding docs

- [ ] [`TESTERS.md`](../../TESTERS.md) renders on GitHub.
- [ ] TESTERS.md sign-up link → `matrix.theblackout.app` loads. Smoke-test the sign-up flow on a fresh browser profile end-to-end.
- [ ] [`CONTRIBUTOR_ROLES.md`](../../CONTRIBUTOR_ROLES.md) renders; all role anchors and cross-links work.
- [ ] [`docs/coliseum/README.md`](../coliseum/README.md) renders; the challenge index table links to all 8 brief files.
- [ ] Each brief at `docs/coliseum/challenges/0{1..8}-*.md` contains a JSON fenced code block that parses:
  ```bash
  for f in docs/coliseum/challenges/0*.md; do
    python3 -c "import json,sys,re; [json.loads(b) for b in re.findall(r'\`\`\`json\n(.*?)\n\`\`\`', open(sys.argv[1]).read(), re.S)]" "$f" || echo "FAIL: $f"
  done
  ```

## Hosted instance (matrix.theblackout.app)

- [ ] Sign-up flow works (verified above as part of TESTERS.md check).
- [ ] `#welcome:theblackout.app` exists, auto-join on signup confirmed (or explicit join instruction in TESTERS.md works).
- [ ] `#blackout-dev:theblackout.app` exists, joinable.
- [ ] **Coliseum Coalition** created with `co.bmc.coalition` state event matching the launch-day configuration in [`docs/coliseum/README.md`](../coliseum/README.md).
- [ ] **8 aid posts** seeded — one per challenge — visible in the Coliseum's mutual-aid feed.
- [ ] **1 priority-order proposal** (challenge 06's seed) visible in the Coliseum.
- [ ] Coliseum room alias pinned in `#welcome` and listed in TESTERS.md (or alias has been updated in TESTERS.md to match what was created).

## CI and seeded issues

- [ ] `gh run list --branch main --limit 5` shows green CI within the last 6 hours.
- [ ] All 12 seeded issues from [`SEEDED_ISSUES.md`](SEEDED_ISSUES.md) filed:
  ```bash
  gh issue list --label "good first issue" --json number,title --limit 20  # ≥ 6
  gh issue list --label "coliseum" --json number,title --limit 20          # ≥ 1
  gh issue list --label "Help Wanted" --json number,title --limit 20       # ≥ 3
  ```
- [ ] Each filed issue has at least one `surface:*` or `area:*` label.

## Moderation

- [ ] [`docs/launch/MODERATOR_BRIEFING.md`](MODERATOR_BRIEFING.md) merged.
- [ ] Briefing sent to each named operator (via DM in `#blackout-dev` or out of band).
- [ ] Each named operator has acknowledged receipt. Track acks in a private maintainer-only issue; do not list operator names in the public repo without consent.
- [ ] At least 3 operators acked. If fewer, decide whether to delay launch or proceed with reduced coverage.

## Daily build report H0 instantiated

- [ ] `docs/launch/builds/H0.md` exists, instantiated from [`DAILY_BUILD_REPORT.template.md`](DAILY_BUILD_REPORT.template.md), with H0 boilerplate ("First hour: ignition. Stats below update at H06.").
- [ ] First daily report scheduled in your calendar for H48 (then H72, then H96).

## Rollback plan

The 96-hour test flight is a planned window. If we have to abort in the
first 6 hours:

- [ ] Documented action: lock new sign-ups on `matrix.theblackout.app` (via homeserver config), pin a banner in `#welcome` explaining the pause, close all open `coliseum-finding` issues with the `needs-postpone` label.
- [ ] Established who has the authority to pull the trigger: at least two maintainers, one of whom is reachable at all times during the window.
- [ ] Cribbed from [`docs/runbooks/bot_abuse_spike_playbook.md`](../runbooks/bot_abuse_spike_playbook.md) for the operational pattern.

## Final go / no-go

- [ ] Go.
- [ ] No-go. Reason: ____. New target launch time: ____.

When you tick **Go**, the next action is to post the H0 launch announcement
in `#welcome:theblackout.app`.

---

For the **technical** smoke suite (homeserver health, federation peers,
LiveKit reachability, etc.), run [`docs/launch-smoke-suite.md`](../launch-smoke-suite.md)
in parallel with this checklist.
