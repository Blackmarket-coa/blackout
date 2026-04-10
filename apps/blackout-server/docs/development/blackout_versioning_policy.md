# Blackout versioning policy

Blackout release identifiers MUST follow:

`X.Y.Z-blackout.N`

Where:

* `X.Y.Z` tracks the upstream Synapse semantic version base.
* `-blackout.N` is the fork release-train suffix.
* `N` starts at `1` for the first fork release on top of `X.Y.Z` and increments monotonically.

Examples:

* `1.99.0-blackout.1`
* `1.99.0-blackout.2`
* `1.100.0-blackout.1`

## Release-train ownership requirements

Each release train must include two checked-in artifacts:

* `release/train/checklist.md`
* `release/train/changelog.md`
* `release/train/image_provenance.json`

CI release gate enforces both file existence and required section headings.

## Required changelog sections

`release/train/changelog.md` must contain:

* `## Fork Policy Changes`
* `## Runtime Defaults`
* `## Security Backports`
* `## Backport Tracking`
* `### Upstream patched commit IDs`

## Required checklist sections

`release/train/checklist.md` must contain:

* `## Upstream Diff Review`
* `## CVE Review`
* `## Backport Plan`
* `## Divergence Risk Markers` (required when risky paths changed)

## Minimal maintainer workflow commands

```bash
# 1) Copy templates into release artifacts (or update existing placeholders)
cp docs/templates/release_train/release_checklist_template.md release/train/checklist.md
cp docs/templates/release_train/changelog_template.md release/train/changelog.md

# 2) Fill release metadata and required sections
$EDITOR release/train/checklist.md release/train/changelog.md

# 3) Run the release train gate locally
python scripts-dev/check_release_train_gate.py

# 4) Run compatibility smoke check
python -m pytest tests/rest/client/test_versions.py::VersionsServletTestCase::test_versions_smoke_compatibility
```

## Failing scenarios and how the gate catches them

1. Missing release checklist file:
   * Gate fails with `Missing required release artifact: release/train/checklist.md`.
2. Missing CVE section:
   * Gate fails with `release/train/checklist.md missing section heading: ## CVE Review`.
3. Missing security-backport section in changelog:
   * Gate fails with `release/train/changelog.md missing section heading: ## Security Backports`.
4. Missing upstream patched commit IDs:
   * Gate fails with `release/train/changelog.md missing upstream patched commit IDs ...`.
