# Release identities — review of the composition, and PR 2, 2026-10-26

PR 2 of the dead-man release design
([`deadman-release-design-2026-10-24.md`](deadman-release-design-2026-10-24.md),
§8) gives every person a **release identity**: an Ed25519 signing key, an
X25519 key and an ML-KEM-768 key, self-signed and published to the API, with
the private halves on the device and in a passphrase-protected recovery file.
The design's own "Not verified here" said the cryptographic composition in
§4(a) "is a proposal. It needs review against HPKE (RFC 9180) and the
dead-drop suite before any code is written." This record is that review,
written before the code, and the format it fixed. The operator took the
design's recommended answers in §9 (both audiences, with whistleblower-safe
defaults; `deadman.write` minted with arming closed; the safety-code
comparison mandatory; existing switches left as they are).

**State read:** `origin/develop` at `dde3f33`, which includes PR 1 (#979), for
the review; the build was then merged with `develop` at `9d0f81d` (#980 to
#983, among them #981's homeserver-only Matrix id resolver and #983's migration
103).
**Replayed and reviewed:** on 2026-10-26 the branch was replayed onto
`develop` at `df2f64e18d` (#984 to #986), and an independent review of the
whole diff followed. Its findings, and what was done about each, are in the
section "Independent review, 2026-10-26", before the sources; the passages it
changed say so.
**Read** means a claim rests on the code or a standard; **Run** that it was
observed in Node 22.22.0 in this worktree; **Test** names the regression test
that keeps it true. Nothing was run on a phone, a desktop shell or a browser
other than the WebCrypto in Node and in the client's Vitest environment.

**Result:** the composition holds with the changes below. Five of them change
the design (C1, C2, C3, C7 and the PR 3 transcript in C5); the rest fix the
tree or are stated limits. Nothing here makes a release possible: arming
stays closed until PR 4.

| ID  | Finding                                                                                                                                                                  | Verified          | Disposition                                                                                                                   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| C1  | The proposed self-signature covers the three keys only, so nothing binds an identity to an account                                                                       | Read (§4(a))      | Fixed in the format: the signed bytes carry the account id; the API and the client check it                                   |
| C2  | WebCrypto's Ed25519 has no context string, so one key's signatures for different purposes differ only in what they sign                                                  | Read              | Fixed in the format: every message a release key signs starts with its own NUL-terminated label                               |
| C3  | A safety code read as one hash over both identities lets a key-swapping server search for a collision across both sides, at half the code's strength                     | Read (analysis)   | Fixed in the design: one 30-digit half per identity, as Signal does; 60 digits                                                |
| C4  | The tree's base64 decoder accepts whitespace and non-zero trailing bits, so one identity could travel in several forms                                                   | Read              | Fixed for identities: a field decodes only if re-encoding gives the same string, and (since L1, L2) each key has one encoding |
| C5  | Dead-drop v2's key derivation does not bind the recipient's X25519 key, which HPKE's DHKEM and X-Wing do, and passes no associated data to AES-GCM                       | Read              | PR 3 constraint: the seal transcript carries both fingerprints. Dead drops unchanged (no live flow); noted for that work      |
| C6  | `deaddrop-pq-hybrid.md` says the combiner "matches draft-irtf-cfrg-hpke (HPKE hybrid)" and that the suite shipped end to end                                             | Read              | Fixed: that record now says what the construction is, and that no shipped flow uses it                                        |
| C7  | AES-GCM does not commit to its key: one ciphertext can open under two keys to two texts, so recipients sharing a ciphertext hash need not have read the same message     | Read (literature) | PR 3 constraint: a commitment to the content key in the signed data                                                           |
| C8  | The dead-drop code has no all-zero check on the X25519 output; Node's WebCrypto refuses small-order keys itself                                                          | Run; test         | Fixed for identities (a key that contributes nothing is refused); PR 3 adds the check RFC 9180 §7.1.4 requires                |
| C9  | FIPS 203 §7.2 requires a check on an ML-KEM encapsulation key before use                                                                                                 | Read; test        | Fixed for identities: the validator runs it itself, so the API can without a KEM provider                                     |
| C10 | `@noble/hashes`' argon2 was outside its 2022 external audit (self-audited at 2.2.0) and is about 5x slower than native code, a margin an attacker with native code gains | Read              | Accepted with RFC 9106's second recommended parameters and a 12-character minimum; stated here                                |
| C11 | The recovery file's size would show roughly how many people its owner compared codes with                                                                                | Read (analysis)   | Fixed: the plaintext is padded to the dead-drop buckets                                                                       |
| C12 | `deaddrop/crypto/keys.ts` gave browser versions (Chrome 124) that MDN's compatibility data does not                                                                      | Read              | Fixed: the comment cites the data; no device was tested                                                                       |
| C13 | Node rejects a private JWK whose public part does not match; nothing says every browser does                                                                             | Run               | Fixed: the client checks every loaded key against its identity itself                                                         |
| C14 | The directory tells the server who looked up whom, and shows every signed-in account who has release keys and when they changed them                                     | Read              | Disclosed in `THREAT_MODEL.md` §5, `KNOWN_LIMITATIONS.md` and on the screen                                                   |
| C15 | PR 3's signatures are transferable: anyone holding a released copy and the owner's identity can show the owner's release key signed it                                   | Read (analysis)   | For the operator (below); the app must not claim deniability                                                                  |
| C16 | Authenticity is Ed25519 only; confidentiality is hybrid                                                                                                                  | Read              | Accepted; a post-quantum signature would be identity v2                                                                       |

---

## 1. The identity

**Proposed (§4(a) step 1):** an Ed25519 signing key, an X25519 key and an
ML-KEM-768 key, signed with the first and published.

**Fixed format, v1.** The signed bytes are:

| Field                                              | Bytes |
| -------------------------------------------------- | ----- |
| `blackout-release-identity-v1`, then one 0x00 byte | 29    |
| length of the account id, 16-bit big-endian        | 2     |
| the account id, ASCII                              | 1–128 |
| Ed25519 public key (RFC 8032 encoding)             | 32    |
| X25519 public key (RFC 7748 u-coordinate)          | 32    |
| ML-KEM-768 encapsulation key (FIPS 203)            | 1184  |

The signature is pure Ed25519 (RFC 8032, deterministic) over those bytes,
made with the identity's own signing key. On the wire the identity is a JSON
object with exactly six fields: `v` (1), `accountId`, `signingKey`,
`x25519Key`, `mlkem768Key` and `signature`, the last four in standard padded
base64. JSON is never signed: the bytes are rebuilt from the decoded fields,
so there is no JSON canonicalisation to get wrong.

-   **C1, the account.** The proposal signed the keys only. An identity that
    names no account can be presented as anyone's, and two accounts could
    publish the same one. The account id (`sub`, a UUID for every account the
    API creates) is now in the signed bytes. The API refuses an identity that
    names another account than the caller's, and a client refuses one that
    names another account than the one it asked for. The account id must match
    `^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$`, so its bytes are the same on every
    platform. It names an account on this homeserver, not the homeserver: the
    directory serves this deployment only (§4), and a future federated
    directory would need a v2.
-   **C2, labels.** WebCrypto offers Ed25519 without a context string
    (Ed25519ctx is not in it), so what keeps an identity signature from ever
    being valid as some other release signature is the label every signed
    message starts with. Each label ends in 0x00, so no label is a prefix of
    another (`…-v1` against a later `…-v10`). The identity's label is fixed
    now; PR 3's are reserved in §5. A release signing key signs nothing else:
    not Matrix events, not plugins. The client also signs one local check
    message under its own label when it loads keys (§3); that signature never
    leaves the device.
-   **C4, one form.** `fromBase64` in `deaddrop/crypto/encoding.ts` skips
    whitespace and ignores non-zero trailing bits, so `AA==` and `AB==` decode
    alike, as do `AA AA` and `AAAA` (**Run**). An identity field is accepted only if encoding the decoded bytes
    gives back the same string, and only at the exact length. That gave the
    base64 one form but not the keys inside it: the independent review found
    that an X25519 key with its top bit set, or with u of p or more, gives
    the same shared secret as its reduced form and another fingerprint (L2),
    and an Ed25519 key whose y is not reduced is the same case. The validator
    now refuses both (`x25519KeyIsCanonical`, `ed25519PublicKeyIsAcceptable`),
    so one key has one fingerprint.
-   **C8, X25519.** A small-order X25519 key makes every shared secret with it
    zero. The validator computes X25519 with a fresh key against the
    identity's key and refuses it if that fails or gives all zeros. **Run:**
    Node 22's WebCrypto throws `OperationError` for all seven small-order
    encodings libsodium lists, rather than returning zeros. Browsers are
    required to do the same by the WebCrypto secure-curves text, but that was
    not checked on any browser; the zero check covers one that does not.
-   **C9, ML-KEM.** FIPS 203 §7.2 requires the modulus check on an
    encapsulation key before encapsulating to it: every 12-bit coefficient
    in the first 1152 bytes must be below q = 3329. `@noble/post-quantum`
    0.6.1 does this inside `encapsulate` (read, `ml-kem.js`), but the API has
    no KEM provider configured, so the validator does the same check itself;
    a test checks that it refuses what noble refuses.
-   **Ed25519 edge cases.** Implementations differ on non-canonical and
    small-order Ed25519 keys and signatures; the API verifies with OpenSSL
    through Node, a browser with its own library. This record first accepted
    that, reasoning that a weak signing key weakens only the identity of the
    person who chose it. The independent review showed that was wrong (L1): a
    small-order key verifies R = identity, S = 0 over every message, so its
    self-signature proves nobody holds a private key, and anyone could sign
    PR 3's statements for such an identity. **Run:** Node's WebCrypto accepts
    that signature under three encodings of the identity point. The
    validator now refuses, before WebCrypto runs, what libsodium's
    `crypto_sign_verify_detached` refuses: a key whose y is not below p, a
    key of small order (libsodium's seven y values, with either sign bit), an
    R of small order and an S not below L (`ed25519PublicKeyIsAcceptable`,
    `ed25519SignatureIsAcceptable`). Engines that differ on those cases now
    give one answer. Still accepted, as in libsodium: a mixed-order key (a
    large-order point plus a small-order part), under which a signature can
    verify with one engine's equation and not another's. Only the key's
    owner can make one, and it affects only whether their own identity is
    accepted. PR 3 must apply `ed25519SignatureIsAcceptable` to every
    signature it verifies under a release key.
-   **Version.** The label and `v` both say 1. A different key set
    (ML-KEM-1024, a post-quantum signature, C16) is a new version, with a new
    label and so a new fingerprint.

**The fingerprint** is SHA-256 of the signed bytes: 32 bytes, shown as 64
lowercase hex digits in groups of four. It names the account id, all three
public keys and the version, and not the signature, so it names keys, not one
particular signature over them. Second preimages cost 2^256 and collisions
2^128. PR 3 binds it into the seal (§5); the comparison record stores it.

**Private halves.** The client stores the Ed25519 and X25519 private keys as
WebCrypto JWKs and the ML-KEM-768 secret key as its 2400 raw bytes, in
IndexedDB. They are extractable, so that the recovery file can hold them,
which means any code running in the app's origin can read them: an XSS, or
altered app code a server sends a browser (A3). The ML-KEM secret is plain
bytes in JavaScript memory whatever WebCrypto offers.

**Browser support** (MDN browser-compat-data, `api/SubtleCrypto.json` on
`main`, read 2026-10-26; not tested on any device):

| Engine                                   | Ed25519 (generate, import, sign, verify) | X25519 (generate, import, deriveBits) |
| ---------------------------------------- | ---------------------------------------- | ------------------------------------- |
| Chrome, Edge, Android WebView (mirrored) | 137                                      | 133                                   |
| Firefox                                  | 129                                      | 130                                   |
| Safari, iOS (mirrored)                   | 17                                       | 17                                    |
| Node                                     | 16.17 (22.22.0 observed here)            | 16.17                                 |

The desktop app's webview is WebView2 (Chromium) on Windows and WKWebView on
macOS; on Linux it is WebKitGTK, which that data does not cover. The mobile
app uses the device's Android System WebView or iOS WKWebView. **C12:** the
comment in `deaddrop/crypto/keys.ts` said "Chrome 124+" for X25519, which
the data above does not support; it now cites the data. The Release keys
screen tests for both algorithms and IndexedDB before offering anything, and
says the device cannot create release keys if any is missing.

## 2. The safety code

**Proposed (§4, the crux):** "a code from both release identities and both
account ids", compared in person or on a call.

**C3.** If the code is one hash over both identities, a server that swaps
keys controls one input on each side: it gives the owner a false key for the
recipient and the recipient a false key for the owner, and needs only the two
codes to agree. That is a collision search between two sets it can grow at
will, which takes about 2^(n/2) attempts for an n-bit code: a 40-digit code
(133 bits) would fall to about 2^66. Signal's answer is one half per party,
and this design takes it.

**Fixed.**

-   Each identity's half is the first 30 bytes of SHA-512 of
    `blackout-release-safety-code-v1`, 0x00, and the identity's 32-byte
    fingerprint, read as six 5-byte big-endian numbers, each taken mod 100000
    and written as five digits: 30 digits, about 99.66 bits.
-   The code is the two halves in ascending order, joined: 60 digits, shown as
    twelve groups of five, the same on both devices. A code between an
    identity and itself is refused.
-   **If all 60 digits are compared,** a swapped key's half must equal the
    real key's half: a second preimage, about 2^99.66 attempts for each side,
    every attempt a candidate key and two hashes (the fingerprint, then the
    half; only the key that wins needs a signature). A server grinding
    against every account at once divides that by the number of accounts.
-   **Comparing part of the code is far weaker** (the independent review's
    M1). Both screens put the smaller half first. A server that gives each
    person a forged key for the other can search for two forged keys, one
    naming each account, whose halves are equal: a collision between two
    sets it controls, about √(10^30), so 2^50, attempts. If that shared half
    sorts below both real halves (about one try in three, or the server
    grinds for it), the first six groups match on both screens; if above
    both, the last six do. So comparing only the first or only the last six
    groups costs the server about 2^50 in all. Comparing the first k and the
    last k digits costs it about 10^k attempts per side: each forged key needs
    a half that agrees with the real one in k digits at the right end. Reading
    only the first and the last group (k = 5) costs about 10^5 attempts per
    side, seconds of work. The screen says to read all twelve groups and to
    stop at the first that differs (`COMPARE_READ_ALL`).
-   **No iterated hashing.** Signal's numeric fingerprints iterate their hash
    thousands of times; this code hashes once. Iterating N times multiplies
    every cost above by N: with N = 5000, about 2^12.3, the 2^50 collision
    would cost about 2^62 and the first-and-last-group shortcut about
    5 × 10^8 attempts per side. That does not make a partial comparison safe,
    and a full comparison does not need it. It is recommended to the operator
    all the same, and now is the time: nothing depends on v1 yet, while after
    people have compared codes any change needs a new label, both
    derivations during a transition, and everyone comparing again. The cost
    to people is small. **Run:** 5000 awaited WebCrypto SHA-512 calls take
    about 0.2 s in Node 22 on this machine, so about 0.4 s for a code; phones
    and browsers were not measured. Not done in this PR: the derivation is
    the operator's to change.
-   Not offered: copying the code, which invites pasting it into a Blackout
    chat, and a QR code, which needs a camera flow that is not built.

**What it binds:** each half, through its fingerprint, binds one account id,
that account's three public keys and the format version; the code binds both.
It does not bind Matrix ids or display names: if the server answered a Matrix
id with another account, that account's fingerprint gives another half. It
binds no time and no session: the code stays the same while neither identity
changes, and changes when either does.

**What a match proves,** when all twelve groups were read and matched, both
devices run unaltered Blackout code, and the two people really reached each
other (in person, or on a call where each knows the other's voice, which an
adversary who can intercept the call and imitate a voice can defeat): at the
time of comparing, the identity each device holds for the other person is the
one that person's device holds as its own, so neither was given a key the
server put there. **What it does not prove:** that the other person keeps
their private keys safe or their device uncompromised; anything about keys
published later (a later key gives another code, which only a new comparison
shows); anything at all if the app
code was altered, which a server can do to a browser (A3, A11), while the
desktop and mobile apps carry their own copy; that the comparison is mutual
(each device records it only when its own user confirms); or anything about a
switch: comparing tells nobody whether one exists. A comparison carried over
Blackout itself, by message or by a call through Blackout's servers, is not a
comparison against Blackout's server.

**When a comparison stops counting** (the independent review's H1). A
comparison is about two particular identities. The signed bytes carry no
time or sequence number, so a client cannot order identities by themselves,
and a server can serve an old identity as current. PR 3 must therefore count
a comparison only for the identity that is the account's current one when it
is used, and treat it as stale once the device has seen a newer identity for
that account (any other identity the directory served as current after the
comparison), or the directory lists the compared fingerprint as superseded;
the client then asks for a new comparison rather than sealing to the old key.
The API now refuses to make a replaced identity current again
(`release_identity_reused`), which stops an honest server from being used to
roll a key back, but a compelled server can serve whatever it likes, so the
client's rule is the one that holds.

## 3. The recovery file

**Fixed, v1.** A JSON header and one ciphertext:

```json
{
    "format": "blackout-release-recovery",
    "v": 1,
    "kdf": {
        "alg": "argon2id",
        "version": 19,
        "memoryKiB": 65536,
        "iterations": 3,
        "parallelism": 4,
        "salt": "<16 random bytes, base64>"
    },
    "aead": { "alg": "AES-256-GCM", "nonce": "<12 random bytes, base64>" },
    "ciphertext": "<base64>"
}
```

-   **Passphrase.** Normalised to Unicode NFC (so the same passphrase typed on
    two systems gives the same bytes; RFC 8265 does the same for passwords),
    never trimmed, encoded as UTF-8; 12 to 1024 characters. Blackout cannot
    recover a forgotten one.
-   **argon2id**, version 0x13, 64 MiB, 3 passes, 4 lanes, 32-byte output:
    RFC 9106 §4's second recommended option, for when 2 GiB is not
    available, which it is not in a phone's webview. A fresh salt on every
    save gives every file its own key. **Run:** 2.7 to 2.9 s in Node 22 on
    this machine's 2.1 GHz Xeon with `@noble/hashes` 2.2.0, which also
    reproduces the RFC 9106 §5.3 test vector. Phones will be slower; not
    measured. The client runs the asynchronous form so the page stays
    responsive.
-   **C10.** noble's README says its argon2 "can't be fast in JS" and that
    being "5x slower than native code means brute-forcing attackers have
    bigger advantage", and lists argon2 as outside the 2022 Cure53 audit; its
    2.2.0 self-audit covers it. The brief chose argon2id from the dependency
    already in the lockfile. What protects a file someone has copied is
    mostly the passphrase, which is why the screen asks for a long one used
    nowhere else.
-   **AEAD:** AES-256-GCM through WebCrypto, as the dead-drop suite uses, under
    the argon2id output, with a random 96-bit nonce. One key encrypts one
    file, so nonces cannot repeat under a key.
-   **Associated data:** `blackout-release-recovery-v1`, 0x00, then the
    argon2 version, memory, passes and lanes as 32-bit big-endian numbers,
    the salt and the nonce. The reader rebuilds it from the header it parsed,
    so a changed header fails exactly as a wrong passphrase does, and it
    refuses any parameters but v1's before running argon2, so a crafted file
    cannot make the app spend unbounded memory or time. A wrong passphrase and
    a damaged file cannot be told apart, and the app says so.
-   **Contents:** UTF-8 JSON holding the account id, the time it was saved,
    every key set the device holds (current and replaced: each identity with
    its private keys and creation time) and every comparison the device
    recorded (the other account id, the Matrix id it was looked up by, their
    fingerprint, the owner's own fingerprint at the time, and when). Replaced
    keys are kept because §4(a) step 6 has recipients keep superseded private
    keys until the owner re-seals.
-   **C11.** The list of comparisons grows with each person compared, so the
    file's length would say roughly how many people the owner compared codes
    with, to anyone holding the file. The plaintext is padded with the
    dead-drop suite's `pad(…, 'bucket')` (ISO/IEC 7816-4, to 1 KiB, 16 KiB,
    256 KiB, …), so the length shows only the bucket. One key set with a few
    dozen comparisons fits 16 KiB.
-   **On load** the client checks, before keeping anything: every identity in
    the file verifies and matches its stated fingerprint; the file's account
    is the signed-in one; and every private key matches its identity (**C13**:
    an Ed25519 signature under the check label verifies with the identity's
    key; X25519 with the private key and with a fresh key against the
    identity's key agree; the ML-KEM secret key embeds the identity's
    encapsulation key, and an encapsulation to it opens). **Run:** Node
    refuses a JWK whose `x` does not match its `d`; nothing says every
    browser does, so the check does not rely on it.
-   **Which key becomes current** (the independent review's M4). The first
    build made the file's current key set current and demoted the device's,
    even a newer one, after which the screen offered to publish the old key.
    Now the file's key becomes current without asking only when the device
    has none, or the file's is newer (created later) and neither the device
    nor the server lists it as replaced (`planRecoveryLoad`); otherwise the
    screen asks, and "Keep this device's key" keeps it and adds the file's
    key sets as old ones. "Newer" reads the creation times the files and the
    device recorded, so a device with a wrong clock can mislead it; asking is
    the default whenever it cannot tell.
-   **The file name** is `blackout-release-keys.json`, which names no one, and
    the header holds no account id.
-   **What it is not:** a backup Blackout keeps; current after later
    comparisons (the screen says to save a new one); protection against a
    guessable passphrase; or protection against someone who knows the
    passphrase, who can also change the file.

## 4. Where the keys live, and what the server sees

-   The private halves live in IndexedDB (`blackout-release-keys`), keyed by
    Blackout account, and in recovery files the person saves. The client asks
    the browser to keep the site's storage persistent, which browsers may
    refuse; clearing site data deletes the keys. This app never sends a
    private half to the API: the SDK's publish call sends the six public
    fields and nothing else, whatever object it is given (test).
-   The panic wipe (`features/panic/`) clears local storage prefixes, so on
    its own it does not delete release keys; since the independent review
    (H2) it has an option, off by default, "Also delete release keys from
    this device", which clears the `blackout-release-keys` store for every
    account on the device after the screen says what that costs, and the
    screen lists release keys under what stays unless it is ticked. Signing
    out does not delete them either: `logout` (`client/auth.ts`) and
    `logoutClient` (`client/initMatrix.ts`) delete the Matrix stores and the
    session, not `blackout-release-keys`, so the keys stay on the device for
    the next sign-in, and the Release keys screen says so, and names the
    panic wipe's option. The screen's own "Remove release keys from this
    device" deletes them.
-   Two tabs share the store. Every change the screen makes reads the stored
    record and writes the next one in one IndexedDB readwrite transaction
    (`update`), and Remove deletes only the record the tab showed (the
    independent review's M3).
-   The API stores the public identity, its fingerprint, when it was published
    and when it was replaced (`release_identities`, migration 104). **C14:**
    any signed-in account on this homeserver can read any account's current
    and replaced identities, so who has release keys, and when each changed
    them, is visible to all of them, and every lookup tells the server who
    looked up whom, and when.
-   A lookup by Matrix id is a `POST` with the id in the body, so it is not in
    the URL that the front proxy logs with the caller's address (the
    independent review's L5). It resolves only `@localpart:server` where the
    server name is this deployment's and the localpart is exactly an
    account's username. Any other server name resolves to nobody, with the same answer
    as an unknown name. When this was written the shared resolver
    (`resolveBlackoutUserId` in `services/userIdentity.ts`) dropped the server
    name; #981 fixed that before this branch merged it, and the directory now
    uses #981's `matrixLocalpart` and, on top, requires the exact Matrix id
    the account has (another spelling of the localpart, or an account id
    where a Matrix id is asked for, finds nobody). Either check alone would
    refuse another server's name: a test shows it with each one removed.

## 5. Sealing (PR 3), against HPKE and the dead-drop suite

PR 3 builds the seal; what it binds constrains the identity, so it is fixed
here.

**The dead-drop v2 construction** (`pqHybrid.ts`, `envelope.ts`): an
ephemeral X25519 key and an ML-KEM-768 encapsulation; key =
HKDF-SHA-256(ikm = X25519 output ‖ ML-KEM secret, salt = ephemeral key ‖
ML-KEM ciphertext, info = `blackout-deaddrop-v2-hybrid` ‖ transcript, 32
bytes); AES-256-GCM with a random nonce and no associated data.

| HPKE (RFC 9180), base mode, single shot                                          | Dead-drop v2                                           | Release seal, as fixed for PR 3                                           |
| -------------------------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------- |
| KEM: DHKEM(X25519, HKDF-SHA256), or a hybrid such as X-Wing                      | X25519 + ML-KEM-768, combined in one HKDF              | The same, reused                                                          |
| `enc`                                                                            | ephemeral X25519 key (32) and ML-KEM ciphertext (1088) | The same                                                                  |
| The KEM's shared secret binds the recipient's public key (`kem_context`; X-Wing) | **Not bound**                                          | Bound: both fingerprints are in the transcript                            |
| `info` into the key schedule                                                     | label ‖ transcript in the HKDF info                    | The seal transcript below                                                 |
| Labeled HKDF with a suite id                                                     | One fixed label                                        | The fixed label, plus the seal label in the transcript                    |
| Nonce from the key schedule                                                      | Random, under a key used once                          | The same                                                                  |
| `aad`                                                                            | None                                                   | None for the key wrap (the transcript binds the key); the content's below |
| Sender authentication: Auth mode, by static DH                                   | None                                                   | An Ed25519 signature by the owner over the sealed copy                    |

So the construction is HPKE-shaped (a KEM, a KDF over the KEM output with
context, an AEAD) but not HPKE: it is not wire-compatible, and it lacks
HPKE's labeled derivations and its binding of the recipient's key. **C6:**
`deaddrop-pq-hybrid.md` said it "matches draft-irtf-cfrg-hpke (HPKE
hybrid)"; that record now says this, and that no shipped flow uses the
suite. **C5:** HPKE's DHKEM puts the recipient's public key into the
derivation, and X-Wing does the same for its X25519 part, so that the key
depends on which public key the sender encrypted to; their security arguments
use that when the Diffie-Hellman part is the one that holds. Dead drops,
whose transcript is empty, lack it, which belongs to the dead-drop work.

**What PR 3 must do** (§4(a) step 3 of the design now says so):

1.  Reuse `deriveHybridAeadKey` with a transcript, and move the v2 branch of
    `encryptDeadDrop` and the release key wrap onto one shared sealing
    function, so there is one construction. `encryptDeadDrop` itself does
    not fit: it takes no transcript or associated data, and pads, derives a
    clue and stamps an expiry that a key wrap has no use for.
2.  The transcript: `blackout-release-seal-v1`, 0x00, then the release id,
    the owner's account id, the owner's fingerprint, the recipient's account
    id and the recipient's fingerprint, variable fields with 16-bit length
    prefixes. The recipient's fingerprint gives the binding HPKE gets from
    `kem_context` (C5); the owner's ties the copy to the key that signs it.
3.  Refuse an all-zero X25519 output on both sides (C8; RFC 9180 §7.1.4).
4.  **C7.** AES-GCM does not commit to its key: someone who chooses the keys
    can build one ciphertext that opens under two of them to two different
    texts (the "invisible salamanders" result). With one content ciphertext
    and a key sealed to each recipient, whoever holds the owner's release key
    could seal different keys to different recipients, who would then read
    different messages under the same ciphertext hash. The signed data
    carries SHA-256 of `blackout-release-key-commitment-v1`, 0x00 and the
    content key, and each recipient checks its key against it. For two
    recipients to know they read the same message, they also need the same
    signed header, so PR 3 should sign one release header (release id,
    owner, ciphertext hash, key commitment) that every recipient receives
    alike. Without that, the app must not say that everyone given access read
    the same text.
5.  The owner's signature: Ed25519 under its own label,
    `blackout-release-seal-signature-v1` and 0x00, over the transcript's
    fields, SHA-256 of the content nonce and ciphertext, the key commitment,
    and the sealed copy's ephemeral key, ML-KEM ciphertext, nonce and
    ciphertext.
6.  The content: AES-256-GCM under the content key with a random nonce and,
    as associated data, `blackout-release-content-v1`, 0x00, the release id
    and the owner's account id, length-prefixed.
7.  The recipient, before showing anything: the signature verifies under the
    signing key of the owner identity whose fingerprint it compared; the
    recipient account id and fingerprint in it are its own; the opened key
    matches the commitment; the content decrypts.
8.  **A comparison counts only while it is current** (added by the
    independent review, H1): only for the identity that is the account's
    current one, and stale once the device has seen a newer identity for
    that account or the directory lists the compared fingerprint as
    superseded (§2). The owner's client re-asks before sealing to a recipient
    whose comparison is stale, and a recipient's client says a release was
    signed by a key it compared only while that comparison is current.
9.  **Every release signature passes `ed25519SignatureIsAcceptable`** before
    WebCrypto verifies it (R not of small order, S below L), and every key it
    is verified under passed `verifyReleaseIdentity` (L1).

**C15, for the operator.** These signatures are transferable: anyone holding
a recipient's copy and the owner's public identity can show that the owner's
release key signed it. For a whistleblower's release that is provenance; for
an owner who would rather a released copy prove nothing about them, it is the
opposite. HPKE's Auth mode would authenticate the owner to the recipient
without that, but it is classical Diffie-Hellman and authenticates a key, not
a signed statement. The design keeps signatures; nothing in §7 claims
deniability, and nothing may.

**C16.** Authenticity rests on Ed25519 alone, while confidentiality has the
ML-KEM leg. A future attacker able to break Ed25519 could forge signatures
then, which matters for a release opened after that day, not for one opened
before. WebCrypto has no ML-DSA; adding one through `@noble/post-quantum`
would be identity v2.

## 6. PR 2 as built

-   **Protocol** (`packages/blackout-protocol/src/release/`): the identity, its
    signed bytes, fingerprint, signing and validation (`identity.ts`); key
    sets (`createReleaseKeySet`, `checkReleaseKeySet` in `keySet.ts`); the
    safety code (`safetyCode.ts`); the recovery file (`recoveryFile.ts`); the
    directory's wire types (`contracts.ts`). It reuses the dead-drop suite's
    X25519 key generation and agreement, base64, random bytes, AES-GCM key
    import, padding and KEM provider, and WebCrypto for Ed25519, SHA-256 and
    SHA-512. `@noble/hashes` 2.2.0, already in the lockfile through
    `@noble/post-quantum`, is now a direct dependency, for argon2id only;
    `pnpm-lock.yaml` changed in the protocol's importer entry only. Fixed
    vectors in `testVectors.ts`: RFC 8032 and RFC 7748 checks of WebCrypto,
    RFC 9106's argon2id vector, two identities from fixed seeds with their
    signed bytes, fingerprints and signatures, their safety code, and a
    recovery file.
-   **SDK:** `createReleaseIdentityActions` (`getMine`, `publishMine`,
    `getForAccount`, `lookupByMatrixId`); `publishMine` sends the six public
    fields only, and `lookupByMatrixId` posts the Matrix id in the body.
-   **API:** `GET` and `PUT /v1/release-identities/me`,
    `GET /v1/release-identities/:accountId`, and
    `POST /v1/release-identities/lookup` with `{ matrixId }` (a `GET` with
    the id in the query string until the independent review, L5)
    (`packages/api/src/routes/releaseIdentities.ts`,
    `services/releaseIdentities.ts`). A signed-in route with no capability
    scope: the API's routes outside the feature modules are gated by the
    session, and the one write acts on the caller's own identity. A `PUT`
    body must hold exactly the six public fields (a body carrying anything
    else, private keys included, is refused whole); an identity naming
    another account gets 403 before anything else is checked; then the
    identity is checked as in §1 and refused with 400 and the reason. The
    same identity again changes nothing; one the account published before
    and replaced is refused with 409 `release_identity_reused` (H1); a new
    one becomes current and the old one is kept with `superseded_at`, every
    one of them. An account may publish 3 new identities in any 24 hours
    (429 `release_identity_rate_limited`, with `Retry-After`) and 1000 in all
    (409 `release_identity_limit`, a bound on storage only); the first
    build's cap of 32, which locked an account for good, is gone (M2). Every
    miss gets the same 404. Table `release_identities`, migration 104 (103 is
    #983's), wired through the memory, file and Postgres stores and
    `pgDescriptors.ts`: publishing writes the superseded row before the new
    one; account deletion blanks the account's rows one targeted upsert at
    a time (`eraseReleaseIdentity`: keys, signature, fingerprint and account
    id go; the id, format version and times stay), as PR 1 does for
    dead-man switches, rather than resyncing the table (L6); the account
    export lists them.
-   **Client:** Settings → Account & identity → Release keys
    (`apps/blackout-client/src/app/features/release-keys/`), for every
    account, behind no flag: create and publish keys on this device (the
    button says both, and the screen says the listing stays until the
    account is deleted, M5); see whether the server has this device's key,
    none, an older one of this device's, or one this device did not make,
    and in that case who could have published it (H1); save and load a
    recovery file; compare a code with someone by Matrix id, reading all
    twelve groups (M1); see whom this device compared with; replace the keys
    (with what else to do after losing a device, H1) or remove them from the
    device, each after a confirmation. The screen checks every identity it
    fetches, refuses an answer for another Matrix id than the one typed
    (L3), and computes the code from its own fingerprints, never the
    server's. `installReleaseKemProvider()` (`setKemProvider(mlKem768Provider)`)
    runs at startup in `main.tsx`. The screen says what the keys are for and
    that arming isn't available. Settings' account deletion and export text
    now mention release keys, and the policy changelog
    (`docs/legal/CHANGELOG.md`) records the new data the server keeps.

**Tests.** The crypto runs where the dead-drop crypto tests run, the
client's Vitest suite (`apps/blackout-client/tests/unit/sdk/`):
`releaseIdentity.test.ts` (the RFC and release vectors, every format rebuilt
by hand from this record with `node:crypto`; tampered fields, wrong, forged
and unlabelled signatures, non-canonical base64, the seven small-order X25519
keys, an engine that returns zeros, bad ML-KEM coefficients, account
mismatch, private keys that are not the identity's; the safety code),
`releaseRecoveryFile.test.ts` (RFC 9106; the recovery vector, decrypted
independently; a round trip with NFC passphrases; wrong passphrase;
truncated, edited and foreign files; parameters it does not read; keys that
do not fit; bucket padding) and `releaseIdentityActions.test.ts`. The API's:
`packages/api/test/release-identities.integration.test.ts` (the routes
against the client's vectors, the server-name and exact-match rules, the
history rules and publish limits, the POST lookup, deletion, both exports),
`release-identities-postgres.integration.test.ts`
(PGlite across a restart: history and erasure, and two replicas, one erasing
while the other publishes),
`release-identities-file.integration.test.ts` (the same through the file
store) and a case in `auth-lifecycle.integration.test.ts`. The screen's are under
`apps/blackout-client/tests/unit/features/release-keys/` (including
`ReleaseKeysPanel.tabs.test.tsx`, two tabs on one store), and the panic
wipe's in `apps/blackout-client/tests/unit/features/panic/`. The tests the
independent review asked for are listed with its findings below. The main checks
were also removed one at a time, to see a test fail. Two survived that at
first, the all-zero X25519 output (which Node's WebCrypto never reaches) and
the ML-KEM round trip (whose work noble's own hash check had been doing), and
each has a test of its own now. The server-name check still survives it,
because the exact-match check refuses another server's name by itself (§4).

**Gitleaks.** The vectors are fixed, synthetic keys, seeds and a recovery
file made from them, and CI's secret scan flags key-shaped literals. It
flagged three vector lines (the vector identity's X25519 public key, twice,
and the vector recovery file's derived key); they are listed in
`.gitleaksignore` as entry 6, with a comment saying why, and no vector was
weakened or left out. Lines of code it flagged (a field name, a colon and an
expression) were rewritten instead of listed.

## Decisions for the operator to confirm or veto

1.  The safety code is 60 digits, compared as twelve groups of five, with no
    copy button and no QR code (§2).
2.  A recovery passphrase needs 12 characters at least; nothing else is
    required of it, and the app does not suggest one (§3).
3.  An account may publish 3 new identities in any 24 hours and keep 1000 in
    all; every identity is kept, and a replaced one is never made current
    again (M2, H1). The numbers are the operator's to change: three covers a
    first publish and two replacements in a day, and holds a buggy client or
    a stolen session to three a day; 1000 takes 334 days at that rate. Past
    1000, publishing is refused, a lock again, but not one that honest use
    reaches. Requiring a recent sign-in to publish, which the review also
    suggested, is not built. (Until the review: at most 32 identities, then
    refused for good.)
4.  Anyone signed in on this homeserver can read anyone's current and replaced
    identities (C14). A narrower rule would need a contact model the API
    does not have.
5.  `@noble/hashes` is declared at exactly `2.2.0`, the version the lockfile
    resolves, rather than with a range.
6.  The account export lists the caller's identities, and `TRUST.md` §2 says
    so.
7.  PR 3's signatures are transferable (C15).
8.  A lookup by Matrix id must match the account's Matrix id exactly, case
    included: `@Alice:server` does not find the account `alice` (§4).
9.  No capability scope for release identities: a signed-in session is
    enough, as for the API's other routes outside the feature modules (§6).
10. `GET /v1/release-identities/me` was added to the routes the design
    lists, so the client learns its own account id and what the server holds
    for it from the server rather than from the token.
11. The Release keys screen is under Settings → Account & identity, for
    every account, behind no flag.
12. Signing out leaves release keys on the device, and so does the panic
    wipe unless its option "Also delete release keys from this device" is
    ticked; the option is off by default, and the screen shows the key-loss
    warning next to it (§4, H2). Deleting them destroys keys that only a
    recovery file could bring back. The Release keys screen tells people on
    a shared device to remove them before signing out, and its own remove
    button does it.
13. `COMPARE_MEANING` and `compareHow`, the approved §7 wording, were changed
    as little as truth needed (M1): "If all twelve groups match, you have
    each other's real keys, as long as neither of you is running altered app
    code", and "in person. If you can't, use a call where you know their
    voice, though a voice can be imitated and a call intercepted". The code
    screen adds "Read all twelve groups to each other, in order. If any
    group differs, stop." The design's §7 table now carries the same text,
    marked as changed. Confirm or reword.
14. Iterated hashing of the safety code is recommended and not done (§2):
    decide before release, while nothing depends on v1.
15. Account deletion blanks release-identity rows in place (id, format
    version and times stay) rather than deleting them, because the Postgres
    writer has no targeted delete (L6). A delete kind in the writer, the
    write-behind queue and the peer notifications would allow real
    deletion.
16. There is no way to unpublish release keys short of deleting the account
    (M5); the screen says so before anything is made. An unpublish route
    would need a tombstone, so that a removal shows to people who compared.
17. Only the Matrix-id lookup moved to a `POST` (L5); the read by account id
    is still a `GET` with the opaque account id in the path, which the proxy
    logs with the caller's address.
18. Blackout's own app has no screen that signs out other sessions, so the
    guidance after replacing keys names a Matrix client that lists sessions,
    or the password reset with "Sign out of other devices" (H1); a Blackout
    API token already issued to the lost device stays valid until it
    expires, up to 24 hours.

## Not verified here

-   WebCrypto Ed25519 and X25519 on each target: the table in §1 is MDN's
    data, not a test; WebKitGTK is not in it. Whether each browser refuses
    small-order X25519 keys and mismatched JWKs as Node does.
-   argon2id's time and memory on phones and in the desktop shells.
-   That a browser keeps IndexedDB: it may evict a site's storage under
    pressure, or Safari after a period without a visit, unless persistence
    was granted; whether it was granted is not shown.
-   That saving the recovery file works in the desktop and mobile shells. The
    screen uses the same download link the data export uses, and asks people
    to check the file was saved.
-   The desktop and mobile apps' claim to carry their own code (§7 of the
    design): their build configuration only.
-   From the independent review: whether browsers honour `autocomplete="off"`
    on the passphrase fields (several offer to save passwords anyway); the
    small-order and canonical-encoding refusals against any engine but
    Node's WebCrypto; two tabs in a real browser (the tests use
    fake-indexeddb); the targeted erasure on a deployment with more than one
    replica (the test uses two stores on one PGlite, without a change
    transport); the cost of iterated hashing on phones.

## Independent review, 2026-10-26

An independent review read the whole branch (`git diff origin/develop...HEAD`
at `9ad59b3068`), ran probes against it, and reported two high, five medium
and seven low findings, and claims in the docs, the screens and the code that
were not true. It found nothing critical: no private key or passphrase
reaches the server, the account binding holds, and the lookup stays on this
homeserver. The branch was then replayed onto `develop` at `df2f64e18d`, and
each finding was fixed or explained as below. Tests named here run in the
client's Vitest suite (`apps/blackout-client/tests/unit/`) or the API's
(`packages/api/test/`); each new test was also run against the code before
its fix, or with the fix taken out, and failed.

### High

**H1. A replaced identity could be made current again, and nothing caught it
after a comparison** (latent until PR 3). The API made any identity other
than the current one current, an old one included, and a test asserted it; a
stolen session could put back a key its owner had replaced after losing a
device, using only public data, and the owner's own screen called that "a
different release key".

-   **Done.** `PUT /v1/release-identities/me` refuses an identity already in
    the account's history: 409 `release_identity_reused`. When the server
    holds a key that is not one of this device's, the Release keys screen
    says that if the person didn't make it on another device, someone with
    access to their account, or Blackout's server, published it. It does not
    offer to publish a key the server lists as replaced. Replacing keys shows
    what else to do, before and after: sign the lost device out (from a
    Matrix client that lists sessions, or by resetting the password with
    "Sign out of other devices"), and tell the people compared with, outside
    Blackout, that the key changed. PR 3's rule is in §2 and §5, item 8: a
    comparison counts only for the account's current identity, and is stale
    once the device has seen a newer identity or the directory lists the
    compared fingerprint as superseded.
-   **Tests.** `release-identities.integration.test.ts`: "a new identity
    replaces the current one, which stays listed as superseded" (it asserted
    the old behaviour; it now asserts the 409) and "no identity from an
    account's history becomes current again, however old".
    `ReleaseKeysPanel.test.tsx`: "says who could have published a key this
    device did not make…", "does not offer to publish a key the server lists
    as replaced", "says what else to do when replacing keys, before and
    after", and the refusal cases.
-   **Still open.** A compelled server can serve any key as current; against
    that, only PR 3's client rule holds. Decision 18 covers signing out the
    lost device.

**H2. The panic wipe left the private release keys and the list of people
compared with, while its screen said it cleared this app's sensitive data.**

-   **Done.** What the wipe removes was checked in the code. It removes seven
    groups of localStorage entries and, if asked, the stored sign-ins. It
    never touches IndexedDB, so the Matrix client's stores (this device's
    copy of rooms and recent messages, and the encryption keys, which the
    app does not encrypt) and the video vault stay, and its "Also sign out"
    sent nothing to the homeserver. The screen now lists what it removes and
    what stays, says the sign-in option ("Also forget this device's
    sign-ins") does not end the sessions on the server, and says it is not a
    forensic wipe. That part applies to `develop` as it is and went out on
    its own. On this branch the screen also lists release keys and
    comparisons under what stays, and has an option, off by default, "Also
    delete release keys from this device", which shows the key-loss warning
    and clears the release-key store for every account on the device; if
    that fails, the screen says the keys are still there and does not
    reload. The Release keys screen's sign-out note names the option. The
    headline's overclaim is older than this branch, and is recorded here as
    found by this review.
-   **Tests.** `features/panic/PanicSettings.test.tsx`: the screen's lists
    against the prefixes; the wipe removes exactly what is listed; the Matrix
    stores and the video vault are still in IndexedDB afterwards; the
    release-key option off by default, ticked, and failing.

### Medium

**M1. The safety code is strong only if all 60 digits are compared, and the
screen never said so.**

-   **Done.** The code screen says "Read all twelve groups to each other, in
    order. If any group differs, stop." §2 gives the 2^99.66 figure "if all
    60 digits are compared" and the partial-comparison costs: about 2^50 in
    all for either half alone, and about 10^k per side for the first and
    last k digits. The code derivation is unchanged; iterated hashing is
    recommended in §2, with why now (decision 14). `COMPARE_MEANING` and
    `compareHow` changed only as far as needed to be true (decision 13).
-   **Test.** `ReleaseKeysPanel.test.tsx`: "compares a code with someone by
    Matrix id, and records it when they match" (the read-all note).

**M2. The 32-identity cap locked an account for good.**

-   **Done.** The cap is gone and every identity is kept, since H1's refusal
    reads the history. At most 3 new identities in any 24 hours (429, with
    `Retry-After`) and 1000 in all (409 `release_identity_limit`); decision 3
    gives the reasons. Each refusal has its own message on the screen.
-   **Tests.** `release-identities.integration.test.ts`: "at most 3 new
    identities in any 24 hours, then 429 with when to try again" and "the
    history keeps every identity, and only a storage bound of 1000 stops
    publishing". `ReleaseKeysPanel.test.tsx`: "says why a publish was
    refused" (429 and both 409s).

**M3. Two open tabs could erase a new key set or undo "Remove".**

-   **Done.** The device store's `update` reads the record, computes the next
    one and writes it in one IndexedDB readwrite transaction, and `remove`
    deletes only the record the tab showed (§4). A stale tab's Remove leaves
    newer keys alone and says so; a comparison made against keys removed
    elsewhere is not recorded, and one made against keys replaced elsewhere
    is recorded for the key it used, with a note to compare again.
-   **Tests.** `features/release-keys/ReleaseKeysPanel.tabs.test.tsx`, two
    tabs on one fake-indexeddb store: a stale tab's comparison keeps the
    other tab's new keys and does not bring back removed ones, and a stale
    tab's Remove does not delete newer keys. All three fail against the
    previous panel and store. `releaseKeyStore.test.ts`: two changes at
    once, a change built on removed keys, the conditional remove.

**M4. Loading an older recovery file quietly brought back a replaced key.**

-   **Done.** §3, "Which key becomes current". The store test that asserted
    the old merge now asserts each case.
-   **Tests.** `releaseKeyStore.test.ts` (a newer file is taken without
    asking; an older or replaced one asks; the same key changes nothing) and
    `ReleaseKeysPanel.test.tsx` ("asks before an older recovery file's key
    replaces this device's…", "uses the file's key only when told to", "says
    when the file's key is one the server lists as replaced").

**M5. "Create release keys on this device" also published, and nothing could
be unpublished.**

-   **Done.** The buttons read "Create and publish release keys" and "Create
    and publish new release keys", and the screen says before anything is
    made that the listing stays until the account is deleted, with no way to
    unpublish. An unpublish route is not built: open (decision 16).
-   **Test.** `ReleaseKeysPanel.test.tsx`: "creates keys on this device and
    publishes only their public half" (the note and the label).

### Low

-   **L1. Small-order Ed25519 signing keys were accepted.** Fixed (§1,
    "Ed25519 edge cases"). Tests, `sdk/releaseIdentity.test.ts`: the identity
    point, which Node's WebCrypto accepts with R = identity, S = 0; every
    small-order encoding with both sign bits; the review's probe values (y =
    p + 1, "-0", the identity, the point of order 2); unreduced y; a
    small-order R and S of L or more, refused before WebCrypto runs.
-   **L2. Non-canonical X25519 encodings were accepted.** Fixed (§1, C4).
    Tests, `sdk/releaseIdentity.test.ts`: the probe's top-bit key (the same
    shared secret, refused before any X25519 runs) and u = p to p + 18,
    including the probe's u = p + 9; u = 9 still passes.
-   **L3. The lookup showed and recorded the Matrix id the server sent, not
    the one typed.** Fixed: an answer for another Matrix id gives no code,
    and the comparison records the id typed. Test: "refuses a lookup answer
    for another Matrix id than the one typed".
-   **L4. The recovery-passphrase fields invited the browser to save the
    passphrase.** Fixed as far as a page can: `autocomplete="off"` on all
    three. Browsers may offer to save it anyway; `KNOWN_LIMITATIONS.md` says
    not to let one. Test: "does not ask the browser to save a recovery
    passphrase".
-   **L5. The lookup put the target in the URL.** Fixed: `POST
/v1/release-identities/lookup` with `{ matrixId }`, free to change
    because the route was not released. The server still sees who looked up
    whom (C14); the proxy's access log, which records `$request` with
    `$remote_addr`, no longer does. Tests: "the lookup takes the Matrix id in
    a POST body, never in the URL" and the lookup rules, now through the
    body; `sdk/releaseIdentityActions.test.ts`.
-   **L6. Account deletion reconciled the whole table.** Fixed with the
    targeted erasure in §6, since the writer cannot delete one row; real
    deletion is open (decision 15). Test,
    `release-identities-postgres.integration.test.ts`: "an erasure on one
    replica leaves a publish another replica has not mirrored yet" (two
    stores on one PGlite, no change transport; it fails with the old resync
    spec), and the erasure checks in the file, Postgres and lifecycle tests.
-   **L7. Test gaps.** The tests above cover L1, the panic wipe, two tabs,
    and H1 and M4 as fixed rather than as intended. Two gaps stay, stated
    here: ML-KEM-768 keys come only from `@noble/post-quantum`, and no NIST
    known-answer test of ML-KEM-768 key generation runs (the round trip and
    the modulus check do); and the "outside WebCrypto" Ed25519 check uses
    `node:crypto`, the same OpenSSL as Node's WebCrypto, so it is a second
    interface, not an independent implementation. `@noble/curves`, in the
    lockfile through `@noble/post-quantum`, could provide one; it is not
    wired in.

### Claims that were not true, and what they say now

-   The panic screen's headline: H2.
-   `THREAT_MODEL.md` §5, release identities: "a safety-code comparison
    catches a key the server substitutes" and "replaced identities stay
    listed, so a change shows". The row now says a comparison of all 60
    digits shows it at the time of comparing and nothing about later keys,
    and that PR 3 must treat a comparison as stale once a newer identity
    appears or the compared one is listed as replaced. The same overstatement
    in the design's §8 ("so a change shows") and in `KNOWN_LIMITATIONS.md`
    ("only a comparison catches that") is corrected the same way.
-   `THREAT_MODEL.md` R3: "shipped end-to-end"; it now says built and tested,
    in no shipped flow.
-   `pqHybrid.ts`: "HPKE hybrid", and a KEM provider "wired in a follow-up
    dependency PR"; it now says what the construction is (§5) and that the
    provider is wired.
-   This record: §2's 2^99.66 holds "if all 60 digits are compared"; §1's
    "one form" held only for base64 (L2); §1 accepted Ed25519 edge cases
    without seeing that a small-order key needs no private key (L1); §6 and
    decision 3 gave the 32 cap without its permanent lock (M2).
-   `RECOVERY_SAVE_NOTE`: "Anyone who has the file and your passphrase" now
    also names guessing the passphrase on a copy of the file.
-   `DataRetentionSection.tsx`: the public half is removed from Blackout's
    database, "though copies in any backups the operator keeps are not".
-   The create button: M5. `COMPARE_MEANING` and `compareHow`: M1.

## Sources

-   RFC 9180 (HPKE) §4, §5.1 and §7.1.4; RFC 7748 §6.1; RFC 8032 §5.1 and
    §7.1; RFC 9106 §4 and §5.3; RFC 8265 §4.2; FIPS 203 §7.2;
    draft-connolly-cfrg-xwing-kem; Signal's numeric fingerprint
    (`libsignal`'s `NumericFingerprintGenerator`); Albertini et al., "How to
    Abuse and Fix Authenticated Encryption Without Key Commitment" (2022),
    and Dodis et al., "Fast Message Franking" (2018), on invisible
    salamanders.
-   `packages/blackout-protocol/src/deaddrop/crypto/`: `pqHybrid.ts`,
    `sealedBox.ts`, `hkdf.ts`, `keys.ts`, `mlkem768Provider.ts`,
    `envelope.ts`, `encoding.ts`, `padding.ts`, `random.ts`;
    `@noble/post-quantum` 0.6.1 (`ml-kem.js`) and `@noble/hashes` 2.2.0
    (`argon2.js`, README).
-   `packages/api/src/`: `services/auth.ts`, `modules/authz.ts`,
    `middleware/auth.ts`, `middleware/require-user.ts`,
    `services/userIdentity.ts`, `services/accountLifecycle.ts`,
    `db/store.ts`, `db/pgDescriptors.ts`, `db/pgWriter.ts`,
    `db/writeBehindQueue.ts`, `middleware/rate-limit.ts`.
-   `apps/blackout-client/src/`: `app/features/settings/SettingsPage.tsx`,
    `app/features/panic/localTraces.ts`, `platform/localVideoVault.ts`,
    `app/features/settings/accountLifecycleClient.ts`,
    `app/features/deadman/`.
-   MDN browser-compat-data, `api/SubtleCrypto.json`, read 2026-10-26.
