# Verifying the Blackout Desktop signing chain

Before you trust a Blackout Desktop build — especially one downloaded from a
GitHub Release rather than built locally — verify that it was signed by the
Blackout project and hasn't been tampered with in transit. This page has
per-OS instructions plus a note on the Tauri auto-updater signature that
applies to every platform.

Reference facts (from `src-tauri/tauri.conf.json`):

-   **App identifier:** `co.bmc.blackout`
-   **Product name:** `Blackout`
-   **macOS signing identity:** `Developer ID Application: Blackout`
-   **Windows:** SHA-256 digest, Authenticode cert (thumbprint pinned via
    `WINDOWS_CERTIFICATE_THUMBPRINT`), timestamped against DigiCert
-   **Auto-updater:** artifacts are signed with the Tauri updater key; the public
    key ships in the app (`plugins.updater.pubkey`)

> If any check below fails, **do not run the build.** Report it on the
> `#security` channel or open a `security-concern` issue.

---

## macOS (Gatekeeper + `codesign`)

macOS builds are Developer-ID signed and notarized. From a terminal, against
the `.app` (inside the mounted `.dmg`, or after copying to `/Applications`):

```bash
# 1. Gatekeeper assessment — the app must be "accepted" as a Developer ID app.
spctl --assess --type execute --verbose=4 /Applications/Blackout.app
#   expected: .../Blackout.app: accepted
#             source=Developer ID  (or "Notarized Developer ID")

# 2. Code-signature integrity — deep verify every nested binary.
codesign --verify --deep --strict --verbose=2 /Applications/Blackout.app
#   expected: valid on disk / satisfies its Designated Requirement

# 3. Inspect the signing authority — confirm it is the Blackout Developer ID.
codesign --display --verbose=4 /Applications/Blackout.app 2>&1 | grep Authority
#   expected: Authority=Developer ID Application: Blackout (…)
#             Authority=Developer ID Certification Authority
#             Authority=Apple Root CA

# 4. Notarization staple — the ticket must be attached and valid.
xcrun stapler validate /Applications/Blackout.app
#   expected: The validate action worked!
```

A missing staple (step 4) with everything else passing usually means an
older or manually re-zipped build — prefer a build that staples cleanly.

---

## Windows (SmartScreen + `signtool` / PowerShell)

Windows installers (`.msi` / NSIS `.exe`) are Authenticode-signed and
timestamped. When you launch the installer, SmartScreen should show the
verified publisher rather than an "Unknown publisher" warning.

Using the SDK's `signtool`:

```powershell
# Verify the Authenticode signature and full chain, using the Authenticode policy.
signtool verify /pa /v .\Blackout_x64_en-US.msi
#   expected: "Successfully verified" with a timestamp present
```

Or with pure PowerShell (no SDK required):

```powershell
$sig = Get-AuthenticodeSignature .\Blackout_x64_en-US.msi
$sig.Status                              # expected: Valid
$sig.SignerCertificate.Subject           # expected: the Blackout / BMC subject
$sig.SignerCertificate.Thumbprint        # must match the pinned WINDOWS_CERTIFICATE_THUMBPRINT
$sig.TimeStamperCertificate.Subject      # expected: a DigiCert timestamp authority
```

The thumbprint is the strongest check: compare `Thumbprint` against the value
published for the release (the same value CI feeds to
`WINDOWS_CERTIFICATE_THUMBPRINT`). A `Valid` status with a mismatched
thumbprint means a different signer — treat it as untrusted.

---

## Linux (GPG signature on `.deb` / AppImage)

Linux packages are distributed with a detached GPG signature alongside each
artifact (e.g. `blackout_0.1.0_amd64.deb` + `blackout_0.1.0_amd64.deb.asc`).

```bash
# 1. Import the Blackout release signing key (published on the Releases page /
#    project keyserver). Confirm the fingerprint out-of-band before trusting it.
gpg --import blackout-release-signing.asc
gpg --fingerprint releases@theblackout.app

# 2. Verify the detached signature against the downloaded artifact.
gpg --verify blackout_0.1.0_amd64.deb.asc blackout_0.1.0_amd64.deb
#   expected: Good signature from "Blackout Releases <releases@theblackout.app>"

# For .deb specifically you can also verify the embedded dpkg-sig, if present:
dpkg-sig --verify blackout_0.1.0_amd64.deb
```

For the AppImage, verify the same way against its `.asc`. A "Good signature"
whose key fingerprint you have **not** confirmed out-of-band is not yet
trustworthy — validate the fingerprint against a second channel first.

---

## Auto-updater signature (all platforms)

Independently of the OS package signature, Tauri's updater verifies every
update artifact against the public key baked into the installed app
(`plugins.updater.pubkey` in `tauri.conf.json`). This means:

-   You do **not** need to re-verify OS signatures on auto-applied updates — a
    payload that isn't signed by the matching Tauri updater private key is
    rejected before it is applied.
-   The update manifest (`latest.json`) carries the signature the app checks. If
    the project ever rotates `TAURI_UPDATER_PUBKEY`, older installs will refuse
    the new updates by design and must be reinstalled from a freshly verified
    package using the steps above.

---

## What "verified" gets you

Passing the checks for your platform confirms two things: the build was
produced and signed by the Blackout project (authenticity), and the bytes you
have match what was signed (integrity). It does **not** by itself attest to the
source revision — for that, cross-reference the release tag and the build
provenance in `.github/workflows/blackout-desktop-tauri.yml`.
