# Semgrep triage — 2026-09-13

Every finding from the ruleset CI runs (`p/security-audit` + `p/secrets`, the
config in `.github/workflows/security.yml`), classified, with the reasoning for
each disposition. Written because the alternative on the table was a blanket
baseline, and a baseline records that 97 things were ignored without recording
whether any of them mattered.

Reproduce with:

```bash
semgrep --config p/security-audit --config p/secrets --metrics=off .
```

**97 before, 95 after.** Two were fixed outright; one more was fixed and its
rule suppressed at the line because the rule matches an import and cannot see
the mitigation. The remaining 95 are triaged below and none is a blanket
suppression.

---

## Fixed

### `detected-private-key` — `synapse/util/manhole.py` (was line 39)

**The one that mattered.** A 2048-bit RSA private key hardcoded in runtime
source. It is upstream Synapse's, so it is published in every copy of Synapse
in the world and is not a secret in any sense.

It is the manhole's SSH **host** key — what an operator's client uses to know
it is talking to the real server. A host key everyone has identifies nothing,
so anyone able to reach the manhole port can present themselves as the server
and collect the manhole password typed at them. That password opens a Python
REPL holding the `HomeServer` object.

`docs/manhole.md` mitigates this by telling operators to bind to localhost,
which is sound and is not a guarantee: its own Docker section has operators
bind `0.0.0.0` and rely on a `-p 127.0.0.1:9000:9000` publish rule, and publish
rules get mistyped.

**Fix:** the key is deleted, not relocated. When no keypair is configured the
manhole now generates an ephemeral one per process and logs that it did. Cost:
the host key changes across restarts, so a pinned client warns —
`manhole_settings.ssh_priv_key_path` remains the way to pin a stable key, and
is now the documented recommendation rather than an optional override of a
known-public default. `docs/manhole.md` and the config manual are updated;
both previously described the fallback as "hardcoded", which was accurate and
is no longer true.

_Verified:_ semgrep on the pre-change file reports `detected-private-key` at
line 39; on the current file it reports nothing.

### `subprocess-shell-true` — `scripts-dev/release.py:584`

`subprocess.run(f"osascript -e '...{message}...'", shell=True)` in the release
script's macOS notification path. `message` is internally generated, so this
was not exploitable, but a release script interpolating a string into a shell
command is a shape worth not having. **Fix:** passed as an argv list, no shell.
The AppleScript is identical.

### `use-defused-xml` — `synapse/handlers/cas.py`

Fixed, then suppressed at the import — in that order, and the order is the
point.

`ET.fromstring(cas_response_body)` parses the CAS server's validation
response. Tested rather than assumed, on Python 3.11:

-   **XXE / external entities: refused.** CPython's ElementTree raises
    `undefined entity` instead of resolving `file:///…`.
-   **Internal entity expansion: live.** A few hundred bytes of nested entity
    declarations expands during parse; the billion-laughs vector is real.

So this is a true positive, and the exposure is a compromised CAS server — or
anyone able to interfere with that HTTP exchange — OOMing the homeserver.

**Fix:** `_parse_cas_xml` rejects any document type declaration before parsing.
Internal entities can only be declared in a DTD, so this removes the vector
rather than mitigating it, and a CAS validation response has no legitimate use
for a DTD. `defusedxml` would satisfy the rule directly but is in the lockfile
only as a transitive of `pysaml2`, an **optional** extra — CAS must not depend
on SAML being installed.

The rule matches the `import` line, so it cannot see a fix at the parse site.
Suppressed there with `# nosemgrep` and the reasoning above. That is the one
line-scoped suppression in this triage.

---

## Not fixed, with reasons

### `header-redefinition` × 59 — nginx configs

**A real defect, not noise, and the largest single bucket.** In nginx,
`add_header` inside a `location` **discards every `add_header` inherited from
the enclosing `server` block**. `infra/single-server-baseline/nginx/sites-available/theblackout.app.conf`
sets `Strict-Transport-Security` at server level for `api.` (line 129) and
`matrix.` (line 169), and then every CORS-bearing location under them calls
`add_header` — so those locations serve no HSTS at all. The `theblackout.app`
apex block is fine: it uses `include snippets/security-headers.conf`, which is
the pattern the other two blocks should follow.

**Why it is nonetheless not urgent:** the apex serves
`max-age=63072000; includeSubDomains; preload`, and `includeSubDomains` covers
`api.` and `matrix.`, so a browser that has seen the apex already enforces HSTS
on them. The gap is defence in depth — plus the api/matrix blocks never set
`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` or CSP at all,
which the apex snippet does.

**Why it is not fixed here:** the fix is `include /etc/nginx/snippets/security-headers.conf;`
in each affected location — 56 mechanical edits to the production ingress of a
live service, and there is no nginx in this environment to run `nginx -t`
against. An untested ingress change that takes the site down is worse than a
missing defence-in-depth header behind a working `preload` HSTS. **This wants
an operator with `nginx -t` in front of them**, and it is the highest-value
item remaining in this file.

### `var-in-href` × 17, `var-in-script-tag` × 4 — Synapse Jinja templates

Upstream Synapse's HTML templates (SSO error pages, fallback auth). Inherited,
not written here. Jinja autoescapes by default, which is why upstream ships
them; the rules flag the shape rather than a proven injection. Reviewing 21
upstream templates for real XSS is a bounded piece of work and a separate one —
it should be done against upstream rather than diverged from it, so a finding
becomes an upstream issue rather than a local patch that conflicts on the next
merge.

### `exec-detected` × 4, `dynamic-urllib-use-detected` × 5 — upstream dev scripts

`scripts-dev/` and Synapse's own tooling: `exec` in development helpers, and
`urllib` calls with computed URLs in the release script. Not reachable from the
running homeserver. Left as-is; the `dynamic-urllib` URLs are constructed from
constants and CLI arguments the maintainer supplies.

### `detected-bcrypt-hash` × 3 — `debian/hash_password.ronn`

Example output in the `hash_password` man page, showing what the tool prints.
Hashes of the literal string `p@ssw0rd` in documentation. Not credentials for
anything. Left visible rather than ignored: a `.semgrepignore` entry would also
hide any future real finding in the `debian/` docs.

### `insecure-hash-algorithm-sha1` × 1 — upstream Synapse

SHA-1 in upstream code where it is used for a non-cryptographic identifier
rather than for integrity or signing. Inherited; an upstream concern.

### `react-dangerouslysetinnerhtml` × 1 — `ProfileModal.tsx`

A user's profile bio rendered as HTML: the classic stored-XSS shape, and the
rule is right to ask. **Verified safe by reading both layers**, not by trusting
the helper's name:

-   `mdToHtml` HTML-escapes the entire string _before_ generating any markup,
    so no attacker tag reaches the output at all;
-   `sanitizeMatrixHtml` then parses the result and allow-lists tags, dropping
    every attribute except `data-mx-*` and an `href` whose scheme is `http`,
    `https`, `mailto` or `mxc`.

Either layer alone would be sufficient. The finding remains reported because a
`nosemgrep` comment does not attach in JSX attribute position — three
placements were tried. The reasoning is in a comment at the call site;
suppressing it would have meant ignoring the whole file, which would also hide
the next `dangerouslySetInnerHTML` somebody adds there.

### `missing-internal` × 1 — `deploy/docker/blackout-backend/nginx/nginx.conf:305`

An nginx `location` that should be marked `internal` if it is only reachable
via `X-Accel-Redirect`. Same class as the header bucket: a real point, in
untestable ingress config, for an operator with `nginx -t`.

---

## What this triage deliberately does not do

No `.semgrepignore` was added and no baseline was created. Every remaining
finding is either upstream code that should be fixed upstream, documentation
examples, or one nginx correctness issue that needs a person who can validate
the config. A baseline would have made the CI job green and left all of that
indistinguishable from noise.
