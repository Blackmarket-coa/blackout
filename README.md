[![Chat](https://img.shields.io/matrix/element-web:matrix.org?logo=matrix)](https://matrix.to/#/#element-web:matrix.org)
![Tests](https://github.com/element-hq/element-web/actions/workflows/tests.yaml/badge.svg)
![Static Analysis](https://github.com/element-hq/element-web/actions/workflows/static_analysis.yaml/badge.svg)
[![Localazy](https://img.shields.io/endpoint?url=https%3A%2F%2Fconnect.localazy.com%2Fstatus%2Felement-web%2Fdata%3Fcontent%3Dall%26title%3Dlocalazy%26logo%3Dtrue)](https://localazy.com/p/element-web)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=element-web&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=element-web)
[![Coverage](https://sonarcloud.io/api/project_badges/measure?project=element-web&metric=coverage)](https://sonarcloud.io/summary/new_code?id=element-web)
[![Vulnerabilities](https://sonarcloud.io/api/project_badges/measure?project=element-web&metric=vulnerabilities)](https://sonarcloud.io/summary/new_code?id=element-web)
[![Bugs](https://sonarcloud.io/api/project_badges/measure?project=element-web&metric=bugs)](https://sonarcloud.io/summary/new_code?id=element-web)

# Element

Element (formerly known as Vector and Riot) is a Matrix web client built using the [Matrix
JS SDK](https://github.com/matrix-org/matrix-js-sdk).

## Repository functionality at a glance

This fork contains the upstream Element Web client architecture plus an expanded steganography
capability set. The high-level flow is:

- **Bootstrap/runtime shell** in `src/vector/*` (feature checks, platform selection, config/language/theme load,
  module/plugin initialization).
- **Core Matrix client** in `src/components`, `src/models`, `src/settings`, and related app infrastructure.
- **Steganography subsystem** in `src/steganography/*` (emoji/image carriers, envelope/chunking,
  detection, ephemeral lifecycle management, and entitlement/audit infrastructure).

For a deeper code-driven walkthrough, see `docs/repository_functionality_analysis.md`.

For governance-focused controls (entitlements, monetization policy, paid-room access governance, and plugin permission boundaries), see `docs/features/governance_features_analysis.md`.

## Blackout reuse status snapshot

From `docs/blackout-reuse-completion-tracker.md`, current implementation status is:

- ✅ **Complete**: Matrix backbone, CRDT foundation, governance lifecycle/voting, delegation, education, mutual-aid board, and sortition.
- ✅ **Complete**: deliberation scale/perf hardening, IPFS room-event/state UX integration, cross-module E2E coverage, and rollout hardening artifacts.

Current priority order from the tracker:

- All previously listed priorities are marked complete and tracked in ongoing maintenance/regression mode.

For the full evidence-backed breakdown, see `docs/blackout-reuse-completion-tracker.md`.

# Supported Environments

Element has several tiers of support for different environments:

- Supported
    - Definition:
        - Issues **actively triaged**, regressions **block** the release
    - Last 2 major versions of Chrome, Firefox, and Edge on desktop OSes
    - Last 2 versions of Safari
    - Latest release of official Element Desktop app on desktop OSes
    - Desktop OSes means macOS, Windows, and Linux versions for desktop devices
      that are actively supported by the OS vendor and receive security updates
- Best effort
    - Definition:
        - Issues **accepted**, regressions **do not block** the release
        - The wider Element Products (including Element Call and the Enterprise Server Suite) do still not officially support these browsers.
        - The element web project and its contributors should keep the client functioning and gracefully degrade where other sibling features (E.g. Element Call) may not function.
    - Last major release of Firefox ESR and Chrome/Edge Extended Stable
- Community Supported
    - Definition:
        - Issues **accepted**, regressions **do not block** the release
        - Community contributions are welcome to support these issues
    - Mobile web for current stable version of Chrome, Firefox, and Safari on Android, iOS, and iPadOS
- Not supported
    - Definition: Issues only affecting unsupported environments are **closed**
    - Everything else

The period of support for these tiers should last until the releases specified above, plus 1 app release cycle(2 weeks). In the case of Firefox ESR this is extended further to allow it land in Debian Stable.

For accessing Element on an Android or iOS device, we currently recommend the
native apps [element-android](https://github.com/element-hq/element-android)
and [element-ios](https://github.com/element-hq/element-ios).

# Getting Started

The easiest way to test Element is to just use the hosted copy at <https://app.element.io>.
The `develop` branch is continuously deployed to <https://develop.element.io>
for those who like living dangerously.

To host your own instance of Element see [Installing Element Web](docs/install.md).

To install Element as a desktop application, see [Running as a desktop app](#running-as-a-desktop-app) below.

# Important Security Notes

## Separate domains

We do not recommend running Element from the same domain name as your Matrix
homeserver. The reason is the risk of XSS (cross-site-scripting)
vulnerabilities that could occur if someone caused Element to load and render
malicious user generated content from a Matrix API which then had trusted
access to Element (or other apps) due to sharing the same domain.

We have put some coarse mitigations into place to try to protect against this
situation, but it's still not good practice to do it in the first place. See
<https://github.com/element-hq/element-web/issues/1977> for more details.

## Configuration best practices

Unless you have special requirements, you will want to add the following to
your web server configuration when hosting Element Web:

- The `X-Frame-Options: SAMEORIGIN` header, to prevent Element Web from being
  framed and protect from [clickjacking][owasp-clickjacking].
- The `frame-ancestors 'self'` directive to your `Content-Security-Policy`
  header, as the modern replacement for `X-Frame-Options` (though both should be
  included since not all browsers support it yet, see
  [this][owasp-clickjacking-csp]).
- The `X-Content-Type-Options: nosniff` header, to [disable MIME
  sniffing][mime-sniffing].
- The `X-XSS-Protection: 1; mode=block;` header, for basic XSS protection in
  legacy browsers.

[mime-sniffing]: https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/MIME_types#mime_sniffing
[owasp-clickjacking-csp]: https://cheatsheetseries.owasp.org/cheatsheets/Clickjacking_Defense_Cheat_Sheet.html#content-security-policy-frame-ancestors-examples
[owasp-clickjacking]: https://cheatsheetseries.owasp.org/cheatsheets/Clickjacking_Defense_Cheat_Sheet.html

If you are using nginx, this would look something like the following:

```
add_header X-Frame-Options SAMEORIGIN;
add_header X-Content-Type-Options nosniff;
add_header X-XSS-Protection "1; mode=block";
add_header Content-Security-Policy "frame-ancestors 'self'";
```

For Apache, the configuration looks like:

```
Header set X-Frame-Options SAMEORIGIN
Header set X-Content-Type-Options nosniff
Header set X-XSS-Protection "1; mode=block"
Header set Content-Security-Policy "frame-ancestors 'self'"
```

Note: In case you are already setting a `Content-Security-Policy` header
elsewhere, you should modify it to include the `frame-ancestors` directive
instead of adding that last line.

# Building From Source

Element is a modular webapp built with modern ES6 and uses a Node.js build system.
Ensure you have a supported Node.js version installed (see [package.json](./package.json): `node >=22.18`).

Using Yarn Classic (`yarn` v1.x) instead of `npm` is recommended. Please see the Yarn [install
guide](https://classic.yarnpkg.com/en/docs/install) if you do not have it already.

1. Install or update Node.js so that `node --version` satisfies `>=22.18`.
1. Install Yarn Classic (`yarn` v1.x) if not present already.
1. Clone the repo: `git clone https://github.com/element-hq/element-web.git`.
1. Switch to the element-web directory: `cd element-web`.
1. Install the prerequisites: `yarn install`.
    - If you're using the `develop` branch, then it is recommended to set up a
      proper development environment (see [Setting up a dev
      environment](./developer_guide.md#setting-up-a-dev-environment) below). Alternatively, you
      can use <https://develop.element.io> - the continuous integration release of
      the develop branch.
1. Configure the app by copying `config.sample.json` to `config.json` and
   modifying it. See the [configuration docs](docs/config.md) for details.
1. `yarn dist` to build a tarball to deploy. Untaring this file will give
   a version-specific directory containing all the files that need to go on your
   web server.

Note that `yarn dist` is not supported on Windows, so Windows users can run `yarn build`,
which will build all the necessary files into the `webapp` directory. The version of Element
will not appear in Settings without using the dist script. You can then mount the
`webapp` directory on your web server to actually serve up the app, which is
entirely static content.

# Running as a Desktop app

Element can also be run as a desktop app, wrapped in Electron. You can download a
pre-built version from <https://element.io/get-started> or, if you prefer,
build it yourself.

To build it yourself, follow the instructions at <https://github.com/element-hq/element-desktop>.

Many thanks to @aviraldg for the initial work on the Electron integration.

The [configuration docs](docs/config.md#desktop-app-configuration) show how to override the desktop app's default settings if desired.

# config.json

Element supports a variety of settings to configure default servers, behaviour, themes, etc.
See the [configuration docs](docs/config.md) for more details.

# Labs Features

Some features of Element may be enabled by flags in the `Labs` section of the settings.
Some of these features are described in [labs.md](https://github.com/element-hq/element-web/blob/develop/docs/labs.md).

# Caching requirements

Element requires the following URLs not to be cached, when/if you are serving Element from your own webserver:

```
/config.*.json
/i18n
/home
/sites
/index.html
```

We also recommend that you force browsers to re-validate any cached copy of Element on page load by configuring your
webserver to return `Cache-Control: no-cache` for `/`. This ensures the browser will fetch a new version of Element on
the next page load after it's been deployed. Note that this is already configured for you in the nginx config of our
Dockerfile.

# Development

Please read through the following:

1. [Developer guide](./developer_guide.md)
2. [Code style](./code_style.md)
3. [Contribution guide](./CONTRIBUTING.md)

## QA audit: scope and current status

This repository includes a broad QA surface. The current practical audit scope
is listed below so contributors can consistently validate both core app changes
and the steganography feature set that is currently under active development.

### Audit scope

- **Environment and dependency health**
    - Validate toolchain compatibility (`node`, `yarn`, lockfile install).
    - Ensure local dependency patching and shared component build complete.
- **Static quality gates**
    - Type checking (`yarn lint:types`) for app, tests, Playwright harness, and
      module system.
    - ESLint + Prettier (`yarn lint:js`) for source and test code.
    - Stylelint (`yarn lint:style`) for PostCSS stylesheets.
- **Automated functional checks**
    - Unit tests (`yarn test ...`) with focus runs for steganography-related
      subsystems when changes touch that area.
- **Steganography-specific quality dimensions**
    - Codec correctness (emoji/image encoding and decoding).
    - Carrier chunking and transport normalization behavior.
    - Entitlement enforcement and audit pathways.
    - Ephemeral data handling and security hardening regressions.

### Current findings from local QA audit

Audit run summary (local run on this branch):

- `yarn install --frozen-lockfile`: **pass**
- `yarn lint:types`: **pass**
- `yarn lint:js`: **pass**
- `yarn lint:style`: **pass**
- `yarn test test/unit-tests/steganography --runInBand`: **pass**
    - 21 suites passed, 184 tests passed.
- `yarn audit --groups dependencies --level moderate`: **fail**
    - 1 moderate vulnerability reported for transitive dependency `counterpart`
      under `@element-hq/web-shared-components` (no upstream patch available).

### Recommended QA baseline before merge

For steganography or cross-cutting changes, run this baseline locally:

```bash
yarn install --frozen-lockfile
yarn lint:types
yarn lint:js
yarn lint:style
yarn test test/unit-tests/steganography --runInBand
yarn audit --groups dependencies --level moderate
```

When touching non-steganography areas, keep the same lint/type/style gates and
run an appropriately scoped Jest target for the modified subsystem.

A concise action checklist for bringing the repo back to a fully green state is in `docs/repo-readiness-next-steps.md`; ongoing prioritization is tracked in `docs/qa-triage-start.md`.

## Steganography toolkit integration

This repository includes a thin integration with
[DominicBreuker/stego-toolkit](https://github.com/DominicBreuker/stego-toolkit)
for fast manual inspection of suspicious PNG/JPG files during stego feature development.

Prerequisites:

- Docker installed and running.

Usage:

```bash
yarn stego:toolkit ./path/to/image.png
```

Equivalent direct script usage:

```bash
./scripts/stego-toolkit-report.sh ./path/to/image.jpg
```

The script launches `dominicbreuker/stego-toolkit` in Docker, mounts the
image folder as `/data`, and runs:

- `check_png.sh` for `.png`
- `check_jpg.sh` for `.jpg` / `.jpeg`

Generated reports are written into the same directory as the analyzed file.

# Translations

To add a new translation, head to the [translating doc](docs/translating.md).

For a developer guide, see the [translating dev doc](docs/translating-dev.md).

# Extending Element Web with Modules

Element Web supports a module system that allows you to extend or modify functionality at runtime. Modules are loaded dynamically and provide a safe, predictable API for customization.

## What are modules?

Modules are extensions that can add or modify Element Web's functionality. They are:

- Built using the [`@element-hq/element-web-module-api`](https://github.com/element-hq/element-modules/tree/main/packages/element-web-module-api)
- Loaded in EW via [config.json](docs/config.md#modules)

# Triaging issues

Issues are triaged by community members and the Web App Team, following the [triage process](https://github.com/element-hq/element-meta/wiki/Triage-process).

We use [issue labels](https://github.com/element-hq/element-meta/wiki/Issue-labelling) to sort all incoming issues.

## Copyright & License

Copyright (c) 2014-2017 OpenMarket Ltd
Copyright (c) 2017 Vector Creations Ltd
Copyright (c) 2017-2025 New Vector Ltd

This software is multi licensed by New Vector Ltd (Element). It can be used either:

(1) for free under the terms of the GNU Affero General Public License (as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version); OR

(2) for free under the terms of the GNU General Public License (as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version); OR

(3) under the terms of a paid-for Element Commercial License agreement between you and Element (the terms of which may vary depending on what you and Element have agreed to).
Unless required by applicable law or agreed to in writing, software distributed under the Licenses is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the Licenses for the specific language governing permissions and limitations under the Licenses.
