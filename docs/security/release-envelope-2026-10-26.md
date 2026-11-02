# Release envelope — composition and review, 2026-10-26

PR 3 of the dead-man release design
([`deadman-release-design-2026-10-24.md`](deadman-release-design-2026-10-24.md),
§8) builds the release itself: the owner's device encrypts a message once,
seals its key to each recipient's release identity and to the owner's own,
and signs each sealed copy; the API holds them until the switch fires, then
gives each recipient their own copy, and the bot sends a notice that only
points. PR 2's record
([`release-identities-2026-10-26.md`](release-identities-2026-10-26.md), §5,
H1 and decisions 7 and 19) fixed what the seal must bind. This record writes
the whole envelope down, compares its key encapsulation with HPKE (RFC 9180)
and X-Wing, and fixes the bytes, before any of it is built. It is to the
envelope what the release-identities record is to the identity.

**Status, 2026-10-26:** written and reviewed (§13) before the build. PR 3 is
built on two stacked branches, so that the cryptography can be reviewed apart
from the plumbing: `-v44`, the protocol and the SDK (§14), and `-v46`, the
API, the migration, the notifier and the documents it changes. Nothing here
makes a release possible: arming stays closed until PR 4 turns
`BLACKOUT_DEADMAN_RELEASES` on, and that flag is set nowhere. **2026-10-29:**
part 1 had its independent review; its one high finding (re-sealing was not
bound to the switch being re-sealed), three medium, six low and twelve untrue
sentences are each fixed or explained in "Independent review, 2026-10-29"
below, and the sections they touch now say what the code does. The fixes
were then read again four times, independently; each reading's reports, and
what was done about them, are under the same heading. **2026-10-30:**
part 2 had its independent review; its one high finding (the cap of 20 bounded
live switches, not what the server held), five medium, fifteen low and sixteen
untrue sentences are each fixed or explained in "Independent review of part 2,
2026-10-30" below, and §11, §15 and the decisions now say what the code does.
Its fixes were then replayed and read again in seven more rounds, the last
on 2026-10-31, and a ninth round built the operator's decisions of that day
with the eighth round's corrections; each is recorded under the same
heading. **2026-10-31:** the operator chose option (c) of decision 18,
confirmed decision 28, asked for the standby's second trigger and two
notifiers at once on one person to be fixed (round 9), and approved PR 4,
the client and device side of the design's build plan
(`deadman-release-design-2026-10-24.md` §8). PR 4 is not built here, and
`BLACKOUT_DEADMAN_RELEASES` stays off everywhere until it is.
**2026-11-01:** a tenth round read round 9's fixes; its high finding (the
sweep's trigger reached the mirror before Postgres accepted it, so a notice
could be sent and a copy listed for a trigger Postgres refused), four medium
and one low in the conditional move, and six untrue or incomplete sentences
are each fixed or explained under the same heading, with decision 30 new.

**State read:** the PR 2 branch at `6ae33bc2e2` (#991), on `develop` at
`8a20ad6a0b`; PR 2 then merged as `e1d4cec964`, which this branch merged. **Read** means a claim rests on the code or a standard; **Run**
that it was observed in Node 22.22.0 in this worktree; **Test** names the
regression test that keeps it true. Nothing was run against a deployment, a
browser other than the WebCrypto in Node and in the client's Vitest
environment, or a real homeserver.

**Result:** the envelope reuses the dead-drop v2 key encapsulation, X25519
and ML-KEM-768 combined in one HKDF-SHA-256, with a transcript that binds the
release, both accounts and both fingerprints (C5), and moves dead drops onto
the same sealing function, so there is one construction. It commits to the
content key in the signed data (C7), refuses an all-zero X25519 output on
both sides (C8), and is authenticated by the owner's Ed25519 signature over
each copy, which is transferable (C15). None of it makes a release happen on
time: the server keeps the timer, and can hold a release back, delay it or
bring it forward (§10, R12, which part 2 adds to `THREAT_MODEL.md`).

| ID  | Question or finding                                                                                            | Verified          | Disposition                                                                                                                                                                                                                                                                                    |
| --- | -------------------------------------------------------------------------------------------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E1  | What is sealed to whom: one ciphertext, its key sealed to every recipient and to the owner                     | Read (design)     | Kept; the owner's own copy is what re-sealing opens, and what it costs is stated (§1)                                                                                                                                                                                                          |
| E2  | The key encapsulation against HPKE's DHKEM and X-Wing                                                          | Read (standards)  | Kept, with a transcript; one sealing function for dead drops and releases (§2)                                                                                                                                                                                                                 |
| E3  | The recipient's public keys must be bound into the wrap key (C5)                                               | Read              | Bound through the recipient's fingerprint in the transcript, with the owner's, the release id and both accounts (§2, §3)                                                                                                                                                                       |
| E4  | An all-zero X25519 output (C8, RFC 9180 §7.1.4)                                                                | Run; test         | Refused on both sides, inside the shared function, so dead drops get the check too (§2)                                                                                                                                                                                                        |
| E5  | New labels must not be confusable with PR 2's                                                                  | Read; test        | Four new NUL-terminated labels, each used in one place; the table of all eight is in §3                                                                                                                                                                                                        |
| E6  | AES-GCM does not commit to its key (C7)                                                                        | Read (literature) | SHA-256 of a label and the content key in every copy's signed bytes, checked before the content is decrypted (§4)                                                                                                                                                                              |
| E7  | One header every recipient receives alike (C7)                                                                 | Read (analysis)   | The header's fields are in every copy's signature; no separate header signature, and why (§4, §5)                                                                                                                                                                                              |
| E8  | Signatures are transferable (C15), and the server holds them from arming on                                    | Read (analysis)   | Stated, for the operator: no deniability is claimed anywhere (§5)                                                                                                                                                                                                                              |
| E9  | One form per value: JSON shapes, base64, ids                                                                   | Read; test        | Exact field sets, canonical base64 at exact lengths, a fixed-length sealed copy, ids by pattern; JSON is never signed (§6)                                                                                                                                                                     |
| E10 | Padding and size                                                                                               | Read; test        | Text up to 64 KiB, padded to 1, 16 or 256 KiB; the API refuses a content ciphertext of any other length (§7)                                                                                                                                                                                   |
| E11 | Identity v1 has no sequence number (decision 19)                                                               | Read              | Nothing is added to the identity; the API checks current identities at arming and re-sealing, the client applies H1 (§9)                                                                                                                                                                       |
| E12 | When a comparison counts (H1)                                                                                  | Read; test        | `releaseComparisonState`: only for the account's current identity, stale once a newer one is seen or the compared one is listed as replaced; when sealing, the owner's own key must not have changed either; for a release in hand, `other_key` unless the key compared signed it (§9)         |
| E13 | A fired release must stay checkable after its owner deletes the account, which erases their release identities | Read              | The owner's identity at arming is kept with the release, and goes with it; the deletion texts say so (§1, §11)                                                                                                                                                                                 |
| E14 | Re-sealing to a recipient's new key does not take back the old copy                                            | Read (analysis)   | Stated: after a lost device, cancel and arm again, which makes a new content key (§10)                                                                                                                                                                                                         |
| E15 | What a hostile server can and cannot do                                                                        | Read (analysis)   | §10; hold back, delay and bring forward are accepted (design §3) and named as R12, which part 2 adds to `THREAT_MODEL.md`                                                                                                                                                                      |
| E16 | Notices and what they carry (design §5)                                                                        | Read; run (fork)  | A pointer only, in a room the bot owns and creates so that the homeserver's backstop leaves it unencrypted (`public_chat`, invite-only: part 2's review found the first build's `private_chat` room encrypted by the fork); nothing names the owner, the label, other people or any time (§11) |
| E17 | `randomBytes` asked WebCrypto for more than 65,536 bytes at once, so padding to 256 KiB threw                  | Run; test         | Fixed in `randomBytes`, which also fixes dead drops over 16 KiB and PR 2's recovery files past 16 KiB (§14)                                                                                                                                                                                    |

---

## 1. What is sealed to whom

-   **The message** is UTF-8 text of 1 to 65,536 bytes. It is padded
    (ISO/IEC 7816-4) to 1 KiB, 16 KiB or 256 KiB (§7) and encrypted once
    with AES-256-GCM under a fresh 256-bit **content key** K and a random
    96-bit nonce, with the release id and the owner's account id as
    associated data. That ciphertext is **the content**.
-   **K is sealed** separately to each recipient's current release identity
    and to the owner's own current identity: one **sealed copy** each (§2).
    Each copy is **signed** by the owner's release signing key, over the copy,
    the content's hash, a commitment to K and the identities it binds (§5).
-   **The API stores** the content, the commitment, every copy and its
    signature, the owner's identity as it was at arming, the timer, the
    owner-only label, and the recipients' account ids. It has no room
    (`room_id` is null).
-   **At release** each recipient is given the content, the header fields,
    the owner's identity and their own copy with its signature, and nothing
    of anyone else's: the header lists no recipients, and a copy names only
    the person it is sealed to. The owner's own copy is never given to
    anyone but the owner.
-   **The owner's copy** exists so that re-sealing (design §4(a) step 6)
    does not need K kept anywhere: the owner's device opens its own copy
    with its release keys, checks it, and seals K again to a recipient's new
    key. What it costs: whoever holds the owner's release private keys (the
    owner's device, or a recovery file and its passphrase) and can read the
    owner's switches (a session) can read the message before the release,
    until the switch is cancelled or the content removed. Without the
    owner's copy, a device that no longer held the message could not read it
    back.
-   **E13, the owner's identity.** A recipient checks the signature under the
    owner's identity. PR 2's account deletion blanks the owner's identities
    in the directory, which would leave a fired release that nobody can check.
    The API therefore keeps a copy of the owner's public identity (the six
    fields, already verified) with each release-format switch, from arming.
    Account deletion removes it with everything else from a switch that has
    not fired; from a fired one it goes only when the release itself is
    removed, at the sweep's first pass at least 365 days after it fired. The
    deletion texts in the app and in
    `KNOWN_LIMITATIONS.md` say so.

## 2. The key encapsulation, against HPKE and X-Wing

### The construction (one sealing function)

For a recipient with X25519 key `pkX` and ML-KEM-768 encapsulation key `pkM`
(their release identity), and the seal transcript `T` (§3):

```
(skE, pkE)  = fresh X25519 key pair                         ephemeral, one per copy
ssX         = X25519(skE, pkX)                               refused if all zero (C8)
(ctM, ssM)  = ML-KEM-768.Encaps(pkM)                         FIPS 203
kWrap       = HKDF-SHA-256(IKM  = ssX || ssM,
                           salt = pkE || ctM,
                           info = "blackout-deaddrop-v2-hybrid" || T,
                           L    = 32)
nW          = 12 random bytes
cW          = AES-256-GCM(kWrap, nW, plaintext = K, aad = empty)    48 bytes
sealed copy = pkE || ctM || nW || cW                         32 + 1088 + 12 + 48 = 1180 bytes
```

The recipient computes `ssX = X25519(skX, pkE)` (refusing all zeros) and
`ssM = ML-KEM-768.Decaps(skM, ctM)`, derives `kWrap` with the same `T`, and
opens `cW`. This is `deriveHybridAeadKey` in `deaddrop/crypto/pqHybrid.ts`
with a transcript, as the release-identities record required (§5, item 1).
The v2 branch of `encryptDeadDrop` and `decryptDeadDrop` moves onto the same
function (`deaddrop/crypto/hybridSeal.ts`), with an empty transcript, so dead
drops derive exactly the keys they derived before (a test rebuilds them
independently), and gain the all-zero check. Dead drops still bind no
recipient key (C5 stays open for that work: no dead drop has a transcript),
and still pass no associated data.

### Compared

|                                     | HPKE base mode, DHKEM(X25519, HKDF-SHA256)                                                                                  | X-Wing (draft-connolly-cfrg-xwing-kem)                                          | Release seal                                                                                                     |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Components                          | X25519                                                                                                                      | ML-KEM-768 and X25519                                                           | ML-KEM-768 and X25519                                                                                            |
| What travels (`enc`)                | `pkE` (32)                                                                                                                  | `ctM` and `pkE` (1120)                                                          | `pkE` and `ctM` (1120), then the wrap's nonce and ciphertext                                                     |
| Combiner                            | `LabeledExtract` over the DH output, then `LabeledExpand` with `kem_context = enc ‖ pkR`, then the key schedule over `info` | SHA3-256 over `ssM`, `ssX`, `pkE`, the recipient's X25519 key and a fixed label | One HKDF-SHA-256: `ssX ‖ ssM` as input keying material, `pkE ‖ ctM` as salt, the dead-drop label and `T` as info |
| Recipient's key in the derivation   | `pkR`, through `kem_context`                                                                                                | the X25519 key only; ML-KEM binds its own key and ciphertext                    | both keys and the account id, through the recipient's fingerprint in `T`                                         |
| ML-KEM ciphertext in the derivation | not applicable                                                                                                              | no: X-Wing relies on ML-KEM's ciphertext binding                                | yes, in the salt                                                                                                 |
| Context                             | `info` in the key schedule                                                                                                  | none of its own (the protocol around it carries context)                        | release id, both account ids, both fingerprints, in `T`                                                          |
| Domain separation                   | `"HPKE-v1"` and a suite id in every label                                                                                   | a fixed label                                                                   | the dead-drop label, then the seal label that starts `T`                                                         |
| AEAD nonce                          | derived from the key schedule                                                                                               | not applicable                                                                  | random, under a key used once                                                                                    |
| Sender authentication               | Auth mode: the sender's static DH key, not transferable                                                                     | none                                                                            | the owner's Ed25519 signature over the copy, transferable (C15)                                                  |
| All-zero DH output                  | the recipient must refuse it (§7.1.4)                                                                                       | not compared here                                                               | refused on both sides                                                                                            |

### Why it is sound

-   **Hybrid confidentiality.** `kWrap` is one HKDF over both shared
    secrets. Treating HKDF-SHA-256 as a random oracle, as KEM-combiner
    analyses do (Giacon, Heuer and Poettering, "KEM Combiners", PKC 2018;
    the concatenation in draft-ietf-tls-hybrid-design rests on the same
    reading of HKDF-Extract), `kWrap` is unpredictable to anyone who cannot
    compute at least one of `ssX` and `ssM`: someone who records sealed
    copies today and later breaks X25519, with a quantum computer say, still
    needs to break ML-KEM-768, and the other way round. AES-256-GCM's tag
    then makes any change to `cW` fail.
-   **Both ciphertext components are in the derivation** (`pkE` and `ctM`
    in the salt). A combiner that hashes only the two secrets is not
    CCA-secure in general (GHP18): a ciphertext component changed without
    changing its secret would leave the key unchanged. X-Wing leaves `ctM`
    out because ML-KEM already binds it; keeping it costs nothing and does
    not rest on that argument.
-   **The recipient's keys are in the derivation (C5).** The recipient's
    fingerprint in `T` is SHA-256 of their identity's signed bytes, which
    hold both public keys and the account id. HPKE's DHKEM puts `pkR` into
    `kem_context` and X-Wing its X25519 key, so that the key depends on
    which public key the sender meant; their proofs use it when the
    Diffie-Hellman part is the one that holds. Here a copy also cannot be
    valid for any other identity: two identities that share an X25519 key
    but not an ML-KEM key (or the reverse) have different fingerprints and
    so different wrap keys.
-   **The context is in the derivation.** The release id, both account ids
    and the owner's fingerprint are in `T`, so a copy moved to another
    release, presented for another recipient, or claimed by another signer
    does not even open, before its signature is looked at. The owner's
    fingerprint matters here: a third party who re-signs someone else's copy
    has to name their own fingerprint in what they sign, and then the copy's
    wrap key no longer matches.
-   **C8, the all-zero output.** A small-order X25519 key makes every shared
    secret zero; if a seal went ahead with `ssX` = 0, the hybrid would rest
    on ML-KEM alone without anyone knowing. RFC 9180 §7.1.4 has the
    recipient refuse it; here both sides do. **Run:** Node 22's WebCrypto
    throws `OperationError` for small-order keys before any output, so the
    check is reached only by an engine that returns zeros; a test stands in
    for one, as PR 2's does. Identities' X25519 keys are already refused at
    publish if they contribute nothing (PR 2, C8); a sealed copy's `pkE` is
    refused unless it is in canonical form (§8).
-   **Keys used once; nonces.** `kWrap` comes from a fresh ephemeral key and
    a fresh encapsulation, so it encrypts exactly one 32-byte K; K encrypts
    exactly one padded message, and re-sealing does not re-encrypt it. A
    random nonce under a key used once is as good as HPKE's derived one.
-   **ML-KEM's implicit rejection.** FIPS 203 decapsulation of a changed
    `ctM` returns a pseudorandom secret rather than an error, so a changed
    `ctM` shows only as the wrap failing to open. Nothing needs to tell the
    two apart.
-   **One salt length.** HMAC hashes a key longer than its 64-byte block, so
    a long salt and its SHA-256 would give the same extraction key. Every
    salt here is exactly 1120 bytes, so no two salts can meet that way.
-   **Strength.** X25519 is about 128-bit classical; ML-KEM-768 is NIST
    category 3; AES-256-GCM and HKDF-SHA-256 are not the weak point.
    Authenticity is Ed25519 alone (C16): a future attacker who can break
    Ed25519 could forge a release then, which matters for a release opened
    after that day.

### What it is not

Not HPKE: not wire-compatible, no labeled extract and expand, no suite id,
no derived nonce, no HPKE modes. Not X-Wing: another combiner hash and more
inputs. Not interoperable with anything outside Blackout. HPKE with a
post-quantum KEM needs an HPKE implementation and a hybrid KEM codepoint,
neither of which WebCrypto or this tree has, and X-Wing would be a second
construction to keep next to the dead-drop one. The labels carry `v1`, so a
later envelope can move to either without ambiguity.

## 3. Transcript and labels

**The seal transcript `T`**, the `info` suffix of every release wrap key:

| Field                                                                   | Bytes     |
| ----------------------------------------------------------------------- | --------- |
| `blackout-release-seal-v1`, then one 0x00 byte                          | 25        |
| length of the release id, 16-bit big-endian, then the release id, ASCII | 2 + 36    |
| length of the owner's account id, then the account id, ASCII            | 2 + 1–128 |
| the owner's fingerprint, raw                                            | 32        |
| length of the recipient's account id, then the account id, ASCII        | 2 + 1–128 |
| the recipient's fingerprint, raw                                        | 32        |

With UUID account ids `T` is 203 bytes. The owner's own copy uses the
owner's account id and fingerprint in both places.

**Every label a release key or a release key's owner uses**, PR 2's and
this record's. Each ends in 0x00, so none is a prefix of another, and each
is used in exactly one place. (The HKDF framing label
`blackout-deaddrop-v2-hybrid`, which precedes `T`, is not one of them and is
not terminated: see "Key derivation" below.)

| Label (then 0x00)                    | Bytes | Where                                                                               | Record   |
| ------------------------------------ | ----- | ----------------------------------------------------------------------------------- | -------- |
| `blackout-release-identity-v1`       | 29    | Ed25519 signed bytes of an identity; their SHA-256 is the fingerprint               | PR 2, §1 |
| `blackout-release-key-check-v1`      | 30    | Ed25519, a local check that a stored key is the identity's; never leaves the device | PR 2, §3 |
| `blackout-release-safety-code-v1`    | 32    | SHA-512 input of a safety-code half                                                 | PR 2, §2 |
| `blackout-release-recovery-v1`       | 29    | AES-GCM associated data of a recovery file                                          | PR 2, §3 |
| `blackout-release-seal-v1`           | 25    | start of `T`, in the HKDF `info` of a wrap key                                      | this, §2 |
| `blackout-release-seal-signature-v1` | 35    | Ed25519 signed bytes of a sealed copy                                               | this, §5 |
| `blackout-release-key-commitment-v1` | 35    | SHA-256 input of the commitment to K                                                | this, §4 |
| `blackout-release-content-v1`        | 28    | AES-GCM associated data of the content                                              | this, §6 |

-   **Signatures.** A release signing key signs three kinds of message, each
    starting with its own label: an identity, a local key check, a sealed
    copy. No message of one kind can be read as another.
-   **Hashes.** The fingerprint, the safety-code half and the commitment
    each hash bytes that start with their own label. The content's hash,
    SHA-256 of the content nonce and ciphertext, has no label: it is a
    digest of public bytes, used only at one fixed place inside a labelled
    signature, and nothing else hashes those bytes.
-   **Key derivation.** A dead drop's `info` is the dead-drop label alone; a
    release wrap's is the dead-drop label followed by `T`, which starts with
    the seal label. No other HKDF in the tree uses that label (the v1 sealed
    box uses `blackout-deaddrop-v1`), so a release wrap key and a dead-drop
    key are never derived from the same `info`. The dead-drop label itself,
    `blackout-deaddrop-v2-hybrid` (27 bytes), has no terminator and no length
    prefix, and `T` follows it directly (`pqHybrid.ts`). That is safe only
    while a dead drop has no transcript and every release transcript starts
    with a terminated label of its own, as today. **The constraint on later
    work (independent review, P3-L1):** a dead-drop transcript, when one is
    added (C5), must start with its own NUL-terminated label that is none of
    the eight above, and the labels test then includes it; or
    `deriveHybridAeadKey` moves to a v3 label with a terminator and a length
    prefix on the transcript. Otherwise a dead-drop `info` beginning
    `blackout-release-seal-v1` 0x00 … and a release wrap's could coincide.
-   **Associated data.** The content's and a recovery file's are distinct,
    and are used under different keys anyway (K and an argon2id output).

## 4. The commitment (C7)

```
C = SHA-256("blackout-release-key-commitment-v1" || 0x00 || K)        32 bytes
```

-   **Why.** AES-GCM is not key-committing: whoever chooses the keys can
    build one ciphertext that decrypts under K1 to one text and under K2 to
    another (Dodis, Grubbs, Ristenpart and Woodage, "Fast Message Franking",
    2018; Albertini et al., "How to Abuse and Fix Authenticated Encryption
    Without Key Commitment", 2022). With one content ciphertext and K sealed
    to each recipient, whoever holds the owner's release key could seal
    different keys to different recipients, who would read different
    messages under the same content hash.
-   **What it does.** C is in every copy's signed bytes (§5). A recipient
    opens its copy, computes C from the K it got, and refuses the release
    unless it matches, before decrypting anything. Two keys with the same C
    are a SHA-256 collision, about 2^128 work. So every copy that carries the
    same C and the same content hash opens to the same K, the same nonce,
    the same ciphertext and (from the signed ids) the same associated data,
    and GCM decryption is a function of those: everyone who passed the
    checks with the same signed header read the same text, whoever signed
    it.
-   **What it costs.** C lets anyone check a guess for K, which is no help
    against a 256-bit random key. It is a hash under its own label, so it
    equals no other hash of K.
-   **Why not derive-then-commit** (deriving the encryption key and the
    commitment both from K): it would also work, and it is the cleaner form
    when nothing else binds the context. Here the same signature binds the
    nonce, the ciphertext and the associated data's fields together with C,
    so the release commits to all of them at once, not only to K; and the
    release-identities record fixed this form.
-   **E7, one header for everyone.** The header is the release id, the
    owner's account id and fingerprint, the content nonce and ciphertext,
    and C. The API stores it once and gives every recipient the same header;
    every copy's signature covers the header's fields. A separate signature
    over the header alone would authenticate nothing more, since each
    recipient checks its own copy's signature, which covers the header, and
    it would not stop someone holding the owner's key from signing two
    headers for two recipients either. So two recipients **know** they read
    the same message only by comparing their headers (C and the content
    hash), out of band. The app may say that someone with the same header
    read the same text; it must not say that everyone given access read the
    same text.

## 5. What the owner signs

Pure Ed25519 (RFC 8032, deterministic) with the owner's release signing key,
one signature per copy, over:

| Field                                                     | Bytes     |
| --------------------------------------------------------- | --------- |
| `blackout-release-seal-signature-v1`, then 0x00           | 35        |
| length of the release id, then the release id             | 2 + 36    |
| length of the owner's account id, then the account id     | 2 + 1–128 |
| the owner's fingerprint                                   | 32        |
| length of the recipient's account id, then the account id | 2 + 1–128 |
| the recipient's fingerprint                               | 32        |
| SHA-256 of the content nonce, then the content ciphertext | 32        |
| C, the commitment to K                                    | 32        |
| the sealed copy: `pkE ‖ ctM ‖ nW ‖ cW`                    | 1180      |

That is the transcript's fields, the content hash, the commitment and the
copy, as the release-identities record fixed (§5, item 5); 1457 bytes with
UUID account ids.

-   **Verified as PR 2 requires (L1).** Every signature passes
    `ed25519SignatureIsAcceptable` (R not of small order, S below L) before
    WebCrypto verifies it, under a signing key from an identity that passed
    `verifyReleaseIdentity` and whose computed fingerprint is the header's.
-   **Why the copy itself is signed,** not only the header: so that nobody
    without the owner's key can make a copy that looks like the owner's, and
    so that the owner's device can check its own copy before re-sealing from
    it. The commitment alone would already stop a server from sealing a key
    of its own choosing to a recipient (it cannot match C without K).
-   **Sign or encrypt first.** The signature covers ciphertext. That allows
    the usual stripping: a third party could remove the owner's signature and
    sign the copy themselves. Here they gain nothing: they would have to name
    their own fingerprint, which changes `T` and so the wrap key (§2), and the
    recipient checks the signer against a key it compared. The other way
    round, a recipient forwarding their copy to someone else: the signed
    bytes name the recipient, so a forwarded copy says whom it was for.
-   **E8, C15: transferable.** Anyone holding a copy and the owner's identity
    can show that the owner's release key signed it. A released copy gives
    each recipient that proof about their own copy. **The server holds every
    copy and signature from the moment of arming:** cryptographic evidence,
    in the operator's hands, that the owner's release key armed this release
    for these accounts with a message of this padded size, stronger than the
    server's own records, which it could have made up. For a whistleblower
    against a compelled operator that matters before anything is released.
    HPKE's Auth mode would authenticate the owner to the recipient without a
    transferable statement, but it authenticates a key rather than a signed
    statement, is classical Diffie-Hellman only, and the design chose
    signatures. Nothing in the app may claim deniability.

## 6. Canonical bytes

-   **JSON is never signed.** Every signed, hashed or authenticated byte
    string is rebuilt from decoded fields, as for identities.
-   **One form per value (E9).** Every binary field is standard padded base64
    accepted only at its exact length and only if re-encoding gives the same
    string (`decodeCanonicalBase64`); fingerprints are 64 lowercase hex
    digits; account ids match PR 2's pattern; the release id is a lowercase
    UUID version 4 (36 characters), made from 16 random bytes; objects have
    exactly the fields listed, and any other field anywhere refuses the whole
    envelope.
-   **The content's associated data:** `blackout-release-content-v1`, 0x00,
    then the release id and the owner's account id, each length-prefixed
    (104 bytes with UUIDs).
-   **The envelope** a device sends to arm (`format: 'release-v1'`):

    ```json
    {
        "v": 1,
        "releaseId": "<lowercase UUID v4>",
        "ownerAccountId": "<the owner's account id>",
        "ownerFingerprint": "<64 hex>",
        "contentNonce": "<12 bytes, base64>",
        "contentCiphertext": "<1040, 16400 or 262160 bytes, base64>",
        "keyCommitment": "<32 bytes, base64>",
        "copies": [
            {
                "recipientAccountId": "<account id>",
                "recipientFingerprint": "<64 hex>",
                "sealedKey": "<1180 bytes, base64>",
                "signature": "<64 bytes, base64>"
            }
        ]
    }
    ```

    The first seven fields are **the header**; `copies` holds exactly one copy
    for the owner and one for each recipient.

-   **The arming request** wraps it: `{ format, checkInIntervalSeconds,
gracePeriodSeconds, label?, envelope }`, nothing else (no `roomId`, no
    `recipients`: the recipients are the copies' accounts other than the
    owner's). The label is the owner's and is never given to a recipient.
-   **What the API keeps:** the switch row with id = the release id,
    `release_format` `release-v1`, no room, the recipients' account ids, and
    in `encrypted_payload` the header with the owner's identity; one
    `deadman_release_wraps` row per copy (switch, recipient account,
    recipient fingerprint, sealed copy, signature).
-   **What a recipient is given** (`GET /v1/deadman/releases`): per release,
    the release id, the owner's account id, when it was released, when it
    will be removed, the header, the owner's identity, and their own copy.
    The release id and the owner's account id beside the header are the
    server's unsigned duplicates of the header's two fields: the SDK's
    `listReleases` refuses an entry where they differ (`server_mismatch`),
    and **only the header's fields, as `openReleaseCopy` returns them
    (`releaseId`, `ownerAccountId`, `ownerFingerprint`), are to be shown**
    (independent review, P3-M2). When it was released and when it will be
    removed stay the server's word.

## 7. Padding and size bounds (E10)

-   **Text only**, 1 to 65,536 bytes of UTF-8, as free dead drops are capped.
    The client refuses more before encrypting.
-   **Padding:** the dead-drop suite's `pad(…, 'bucket')` (ISO/IEC 7816-4,
    reviewed in PR 2 for the recovery file), which leaves at least 16 bytes
    of room: 1,024 bytes for up to 1,008 bytes of text, 16,384 for up to
    16,368, and 262,144 for the rest up to the cap. The server learns which of
    the three it is, and nothing finer.
-   **The content ciphertext** is therefore exactly 1,040, 16,400 or 262,160
    bytes; the protocol's validator, and so the API, refuses any other
    length, which catches a client that forgot to pad.
-   **On opening,** the padding must be valid and the text valid UTF-8 (a
    fatal decoder), or nothing is shown.
-   **Copies:** one for the owner and 1 to 64 recipients, so 2 to 65; each
    copy 1,180 bytes sealed and a 64-byte signature. A largest envelope is
    about 480 KB of JSON; the arming route takes at most 1 MiB.
-   **Timer:** the bounds of today (an interval of 60 seconds to 365 days, a
    grace period of 0 to 30 days); the label up to 280 characters.

## 8. Validators

**Shared** (protocol, run by the API and by clients):

-   `parseReleaseEnvelope`: the exact shape; version 1; the release id's
    form; account ids by pattern; fingerprints; every base64 field canonical
    at its length; the content ciphertext one of the three padded lengths;
    2 to 65 copies, exactly one of them the owner's (naming the owner's
    account and fingerprint) and no account twice; each sealed copy's `pkE`
    in canonical X25519 form; each signature of acceptable form. It returns a
    new object built from the values it checked, or the first problem.
-   `verifyReleaseCopySignature`: the owner's identity passes
    `verifyReleaseIdentity`, names the header's owner account, and its
    computed fingerprint is the header's; the signature verifies over §5's
    bytes.

**The API, on arming** (`POST /v1/deadman/switches`, only while
`BLACKOUT_DEADMAN_RELEASES` is on): the caller is the header's owner; the
owner's current identity in the directory has the header's fingerprint; every
other copy names an account on this server that is not the owner, whose
current identity has the copy's fingerprint (an unknown account and one
without an identity are refused as `unknown_recipient`, an identity the
account replaced as `recipient_identity_superseded`, one it never published
as `recipient_identity_unknown`: three codes, as §15 has them); every
signature verifies under the owner's identity; the release id is unused; the
timer and label are in bounds; at most a fixed number of release switches
per owner whose content is still held (§15, decision 4). **These
catch client bugs, not a hostile server**, which would skip them.

**On re-sealing** (`POST /v1/deadman/switches/:id/reseal`): the caller owns
the switch, which is a release switch that has not fired or been cancelled;
the copy is for one of its recipients, names that account's current
identity, and its signature verifies over the stored header under the
owner's identity named there, which must still be the owner's current one
(otherwise the owner arms again). These, too, catch client bugs, not a
hostile server.

**The owner's device, before re-sealing** (`resealReleaseCopy`, through the
SDK's `resealRecipient(switchId, …)`), which is what holds against a hostile
server (independent review, P3-H1): the owner's view the server answers with
is the switch asked for (`switchId`) and **the header it carries has that
release id**, checked before the directory is read, any signature is checked
or anything is opened; the release id is in the owner's own signature and in
every transcript, so a server cannot answer with another release's header
and own copy and have the device seal that release's key to a person named
only on this one. Then the owner's own copy passes every check a recipient
makes, the content's decryption included (P3-L2), before K is sealed again.
Whom a given release may be re-sealed to is not in anything the owner signed
(E7): the API checks it for an honest server, and PR 4's device-side record
of each release's recipients, from what `armReleaseSwitch` returns, is what
will check it against a hostile one (still open, see the review).

**The recipient, before showing anything** (`openReleaseCopy`): the header
and the copy pass `parseReleaseEnvelope`'s checks; the copy names the
recipient's account and the fingerprint of one of the key sets the device
holds (a replaced one included, since the owner may not have re-sealed yet);
the owner's identity verifies and its fingerprint is the header's; the
signature verifies; the X25519 output is not zero; the wrap opens; K matches
C; the content opens under the release id and owner as associated data; the
padding and the UTF-8 are valid. The result carries the header's release id
and owner account id, the only ones to show (§6). Whether the release was
signed by the key the recipient compared, **and** that comparison still
counts, is `releaseComparisonState`'s, given the result's `ownerFingerprint`
as `signerFingerprint` (§9): the app may say "signed with ‹name›'s release
key, which you compared" only when that one call answers `current`, which
needs both; `other_key` means another key signed it.

## 9. Ordering and comparisons (decision 19, H1)

-   **Identity v1 has no sequence number** (decision 19), so nothing can tell
    that an identity it has not seen is older than one it has. **PR 3 adds
    no order to identities.** Decision 19 (a sequence number or the replaced
    identity's fingerprint in identity v2, or a compare-and-swap on `PUT`)
    stays open for the operator; nothing in the envelope would need to change
    for it, since the envelope binds fingerprints, which name the format
    version.
-   **What PR 3 does instead.** The API refuses to arm or re-seal unless
    every copy names the recipient's identity that is current in the
    directory, and the header the owner's: an honest server with a stale
    client (a device that sealed to a key replaced since) gets a refusal that
    names the account, not a copy nobody can open. The owner's view lists,
    for each recipient, the fingerprint their copy is sealed to, so PR 4 can
    show "‹name›'s release key changed".
-   **What holds against a hostile server is the client's rule (H1),**
    `releaseComparisonState`: a comparison counts only while the identity it
    names is the account's current one in the directory, is not listed as
    replaced there, and the device has not seen any other identity served as
    that account's current one since comparing. When sealing, the owner's
    own fingerprint at the time of the comparison must also still be the
    owner's current one: the recipient's device compared that key, and will
    count a release signed by another one as unconfirmed. The SDK's arming
    and re-sealing refuse a recipient whose comparison does not count. The
    directory's answer is the server's word, whatever its shape:
    `releaseDirectoryFingerprints` computes every fingerprint from an
    identity it verified, and an answer that is not an entry, or that lists
    more identities, the current one and the replaced together, than the API
    keeps for one account in all (`RELEASE_IDENTITY_STORAGE_LIMIT`, 1,000;
    each costs a signature check and two key checks, about 0.6 ms here),
    counts as nothing, refused before any of them is verified, so the
    comparison is `stale` and the SDK refuses as its contract says rather
    than passing on a `TypeError` (the fourth reading; the fifth made the
    bound count the current identity).
-   **Where the third clause is fed from (independent review, P3-M3).** The
    reads that decide what is sealed are the SDK's own, and they report what
    they saw: a refusal (`ReleaseActionError`, `recipient_comparison` or
    `owner_key_not_current`) carries `servedFingerprint`, the fingerprint of
    the identity the directory served as that account's current one,
    computed from the served identity (null if it served none that
    verified); a successful arming returns `sealedTo`, each account and the
    fingerprint its copy was sealed to. PR 4's client records each of these,
    with its own directory reads, as seen since comparing, so that a server
    which serves a newer key once and then puts the compared one back finds
    `seenSinceComparison` holding the newer one, not empty.
-   **Why that is enough for ordering:** if anyone makes an older key
    current, the owner's device sees a newer identity than the one compared,
    asks for a new comparison, and that comparison fails unless the
    recipient's device holds the same key. A key served under a recipient's
    name cannot get a sealed copy without a matching code.
-   **After the release** the same rule applies to the recipient's view of
    the owner's key, with one more input: the key that signed the release in
    hand. `releaseComparisonState` takes it as `signerFingerprint` (the
    `ownerFingerprint` an `openReleaseCopy` result carries, computed from
    the identity that verified) and answers `other_key` unless it is the
    fingerprint compared (`none` when nothing was compared, whatever signed
    the release); `current` means both that the compared key signed it and
    that the comparison counts now (P3-M1). The field is required, so a
    caller judging a release cannot leave it out: `null`, written out, is
    the sealing use, and anything else that is not the fingerprint compared,
    `undefined` forced through a cast included, is `other_key` (the fourth
    reading). Only then may PR 4's
    screen say "signed with ‹name›'s release key, which you compared on
    ‹date›". If the owner replaces their keys, or deletes their account,
    after the release, a recipient's comparison stops counting (`stale`),
    and the screen can no longer say that; it can say which key signed it,
    and when the comparison was made.

## 10. What a hostile server can and cannot do

The server here is the API and its store, the homeserver and whoever runs or
compels them (A3), and in a web browser the app's code (A3, A11). These
follow from §1–§9 and from the design's §3, which accepted the first three.

**It can:**

-   **Hold a release back**: never trigger the switch, never serve the
    copies, never send the notices. Nobody is told.
-   **Delay it**: for as long as it likes; an outage alone, of the sweep or
    of its database, delays it by its own length plus up to 72 hours (R10).
-   **Bring it forward**: trigger early and give each recipient their copy
    at any time from arming on, a cancelled switch's included if it kept a
    copy (cancel removes them from an honest server's database on one API
    process, a cancel the database confirms after the route answered 503
    when it lands; across replicas a re-seal on another replica in the
    refresh window can leave a copy on a cancelled switch until the next
    sweep pass blanks it, §15; backups keep them until they expire). Only the named
    recipients can read it, and, until PR 4 keeps the device-side record of
    each release's recipients, anyone the owner's device is made to re-seal
    it to (the "It cannot" bullet on re-sealing).
-   See everything that is not the message: who armed a switch, whom it
    names, the padded size, every check-in, the label, when it fires, who
    fetched what, and when notices were read.
-   Keep the signed copies, which are transferable evidence that the
    owner's release key armed this release for these accounts (C15, §5).
-   Serve a recipient an older copy it kept after a re-seal. It opens only
    with the old key, to the same message.
-   Drop, delay, repeat or forge notices. A forged notice points at nothing
    the recipient's client can open, or at a real release, which the client
    checks as any other.
-   Serve keys that are not the person's, and in a browser serve altered app
    code, which defeats everything here.
-   Refuse to arm or re-seal.

**It cannot,** given full comparisons of safety codes on unaltered app code:

-   read the message, or K, at any time;
-   forge a release, a copy or a re-seal in the owner's name;
-   change the message, or give two recipients holding the same header
    different texts (§4);
-   make one recipient's copy open for anyone else, or move a copy to another
    release, recipient or signer (§2);
-   have the owner's device seal a release's key to a person not named on
    that release by answering the owner's view of one switch with another
    release's header and own copy: the device refuses a header whose release
    id is not the switch it is re-sealing (§8; independent review, P3-H1,
    which it could do before that check). Whom a given release may be
    re-sealed to is PR 4's device-side record, still open;
-   tell from the content more than which of three sizes it is.

**E14, re-sealing does not revoke.** A re-seal replaces a recipient's copy
in the database; it does not change K. A server that kept the old copy, or a
backup that holds it, together with the recipient's old private key, still
opens the message. When a recipient's device was lost or taken, the owner
should cancel and arm again, which makes a new K; re-sealing is for a key
that changed for other reasons. The same holds for the owner's own keys: an
owner who replaces their release keys after arming should cancel and arm
again, and the API refuses to re-seal under an owner identity that is no
longer current.

## 11. Delivery and notices (design §5), as the API does them

-   **Rows with the trigger.** When the sweep fires a release switch it
    records `released_at` and writes one row in `deadman_release_notices` for
    each recipient whose copy is still held and lacks one. The notifier also
    treats a fired release switch with a recipient but no row as due, so a
    crash between the two loses nothing; a row that exists before its switch
    fires (the other crash shape) is left alone, neither sent nor ended, and
    is sent once the switch fires (P3b-L1). Legacy switches change status
    only, as today.
-   **The room.** One standing room per person and reused (the cases below
    can leave an extra one; so can two notifiers working on one person's
    notices at once, which a claim on the person in Postgres prevents since
    round 9 unless one holds it past its lease, §15, with the notice in
    each; and so can a notifier that stops after a create has answered and
    before its queued record of the room reaches Postgres, where the
    homeserver refuses the alias: the next attempt finds no room and makes
    another, so the person has an invitation in each and the notice in the
    second, §15 and Still open), named "Blackout notices", created by the bot with the `public_chat`
    preset, an invite-only
    `m.room.join_rules` in `initial_state` and `visibility: private`, the
    person invited with `is_direct`, and power levels that let only the bot
    post or invite (`events_default` and `invite` at 50, the person at 0).
    The preset and the join rule are what make the room genuinely
    unencrypted: the homeserver's `encryption_enabled_by_default_for_room_type:
invite`, set by every in-repo template, adds `m.room.encryption` to every
    `private_chat` room after the client's `initial_state` and keys on the
    preset, and `createRoom({ encrypted: false })` only leaves the client's
    own encryption event out (as first built, with `private_chat`, the fork
    encrypted the room around the bot's plaintext post: P3b-M1, run on the
    fork's own code by the review). Under `all`, which no template sets, the
    backstop would encrypt this preset too. An earlier notice's room is
    reused; a person who left it, or declined it, is invited again, with
    `is_direct`, when a later notice is due, at most once per notice
    (recorded on the row as `reinvited_at`). One room per person: within one
    process a per-recipient slot serialises finding or making the room and a
    notice that waited reads the room again (P3b-M5), and the interval does
    not start a tick while one runs; across processes the notifier takes a
    claim on the person in Postgres before anything is read or asked of the
    homeserver for them (`deadman_notice_claims`, round 9: §15); and the
    room carries an alias,
    `#blackout-notices-<hmac>:<server>`, 128 bits of an HMAC over the
    person's Matrix id under a key derived from `JWT_SECRET_PRIMARY`, which
    the homeserver refuses to give a second room before it makes one
    (`M_ROOM_IN_USE`). So a `createRoom` the homeserver finished after the
    notifier stopped waiting, which a timeout does not cancel (the servlet
    is not cancellable), or one another API process made, is found through
    the alias on the next attempt and not made again (round 3 of the review:
    as first fixed, each such attempt left the person an extra, empty room
    with an invite). The alias is resolved fresh, not from the client's
    process cache; the room it names is used only if the bot made it (its
    `m.room.create` is the bot's) and it is the whole room the create makes,
    with the bot in it: the bot's own join, and power levels under which the
    person can neither post nor invite. The homeserver writes the alias after
    it makes the room id and before it sends any event, and then writes the
    room in steps (`handlers/room.py`, `create_room` and
    `_send_events_for_new_room`: `m.room.create` alone, the creator's join
    through `update_membership`, then one batch with the power levels, the
    join rule, the history visibility, the `initial_state` and the name, then
    the invites), so a room found through the alias without all of that is
    taken for a create still in progress and retried once
    (`matrix_alias_room_not_ready`); if it is still so at the notice's next
    attempt, which is due one backoff (30 s at the least) after that first
    look was recorded, it is taken for a create the homeserver abandoned part
    way, a restart or a failure between those writes, which leaves the alias
    naming that incomplete room for good, and the room is made without the
    alias. A room the bot made and has since left is replaced the same way.
    (Round 4 of the review: as round 3 built it, a room with no events was
    "still being made and waited for" for the whole retry window, and every
    later notice to that person the same way, so they got none. Round 5: as
    round 4 left it, a room with the bot's `m.room.create` alone was taken as
    the bot's, and its re-invite was refused, `M_NOT_JOINED`, on every
    attempt for the window; one with the create and the bot's join was used
    with no power levels, so the person at the default 0 could post and
    invite; and the retry was timed from the start of the tick, so after a
    long tick the second look could come seconds after the first.) The room is
    not in the public room list (`visibility: private`); its alias is in the
    homeserver's alias directory and in its `m.room.canonical_alias`, and the
    person sees it as the room's address; nobody without the secret can
    compute it from a Matrix id, so the alias directory does not say who has
    a notices room. What remains: where the homeserver refuses the alias
    itself (an alias policy that forbids the bot answers 403, an appservice
    holding the namespace `M_EXCLUSIVE`), or the alias names a room that is
    gone, that the bot did not make (an admin who shuts a room down with a
    replacement moves its aliases there) or that the homeserver abandoned
    part way, the room is made without an alias, so that the person still gets
    notices, and a create of that room which times out after the homeserver
    made it leaves an extra, empty room with an invite, once per such
    attempt, as before the alias; a create the homeserver is still making
    after a whole backoff is taken for an abandoned one and leaves an extra
    room the same way once it completes; an abandoned create's alias stays
    taken until an admin removes it, so a later room for that person (after
    a purge, say) waits one backoff again and is made without the alias; a
    rotation of the secret between a timed-out create and its retry leaves an
    extra room too, since the alias changes with the key; and two processes
    making one person's room at the same moment (since round 9, only where
    one holds the person's claim past its lease) both pass the alias check,
    and the second's alias write then fails after the homeserver gave it a
    room id but before any event, so that room has nobody in it and nobody
    invited. The bot's own id comes from whoami and is cached for the process
    after the first whoami that is not cut short, by the notifier or by any
    other caller in the API, a failed one included (a refusal, or a network
    error with no answer at all): a failed one caches the client's derived id
    (`@<MATRIX_BOT_LOCALPART or blackout>:<domain>`), and if that is not the
    bot's, every room found through an alias looks like another account's
    and is replaced by one without the alias, the behaviour before it.
    A room the homeserver no longer has is replaced once per person, except
    in the cases this bullet names: every row of theirs that pointed at it
    moves to the replacement (P3b-L3). Until round 10 a notifier whose claim
    statement timed out or failed wrote a retry over the row the claim's
    holder was working on, which could put the gone room back and so lead
    to a second replacement; such a claim now writes nothing (§15).
-   **The notice:** an `m.text` (an `m.notice` would be silent under
    `.m.rule.suppress_notices`) with the fixed body "There is something new
    for you in Blackout. Open Blackout to see it. This room is not end-to-end
    encrypted, so please don't reply here." and a pointer field,
    `co.bmc.deadman.release`, holding a schema version and the release id.
    Nothing else: not the owner, not the label, not anyone else named, no
    time, and not the word "dead-man" in the body. A first notice arrives
    with the invite, so the invite is what notifies; after the person joins,
    each notice in the two-member room notifies.
-   **Sending:** Matrix transaction id `deadman-release-<switch>-<recipient>`,
    so a resend soon after a crash into the same room is deduplicated (the
    homeserver keys a transaction on the request's path, which holds the room
    id, and its 24-hour table on the room too, so the same id in another room
    is another event) for as long as the homeserver keeps the id, which
    depends on how the bot's token was minted
    (§15, "Read, not run"): 30 to 60 minutes, in memory and lost on a
    homeserver restart, for a token without a device (the admin API's
    login-as-user), and 24 hours in its database for one with a device (a
    `/login`). A notice is "sent" only once
    the homeserver accepted it. It is retried with backoff for 30 days from
    the release, then recorded as failed; the logs carry counts, not who.
    Each homeserver call has 30 s to answer (`NOTICE_CALL_TIMEOUT_MS`); one
    that does not is that notice's retry (`matrix_<call>_timeout`) and its
    request is aborted, since the ticks do not overlap and a hung call would
    otherwise hold every other due notice for undici's five-minute default.
    A tick is still a sequence, and a notice makes up to seven calls in turn
    (the state of a known room, a create, the alias lookup, the bot's own id
    until a whoami not cut short by the timeout has been answered, refused or
    failed, the state of the room found,
    a re-invite or a create without the alias, the send), and up to four
    reads of the database among them (before the first call, and right
    before each create, the re-invite and the send: §15), after the claim on
    the person and before its release, each of the thirteen with the same
    30 s: a homeserver or a database that answers nothing holds a tick of 50
    for about 25 minutes, each notice ending at its first call, read or
    claim, and ones that answer each just inside the 30 s can hold one
    notice for about six and a half minutes and a tick of 50 for about five
    and a half hours, with every notice due beyond the 50 waiting for the
    next tick (round 3 of the review: as first written only the first case
    was stated; round 7: the reads round 6 added had no bound and were not
    counted; round 9: the claim and its release added two). It does not go through `botPostingGate.ts`: it is the
    bot's own post into its own room.
-   **What the owner sees:** when the switch fired, how many recipients were
    given access, and how many notices were sent, are pending and failed;
    never the notice rooms. A recipient who deleted their account drops out
    of `sealedTo` (on one API process; across replicas a copy sealed to them
    in the refresh window puts them back, §15) and their pending notice
    counts as failed, which tells the owner the account is gone; the
    identities directory tells any signed-in account the same (P3b-L11).
-   **Retention.** At its first sweep pass on or after 365 days after a
    switch fired (while a sweep runs; with none, nothing is removed), the API
    removes its content, the owner's identity it kept, and every copy. The
    rows stay: the switch with whom it named, the label and timing; each copy
    row with the fingerprint of the key it was sealed to; the notice rows as a
    record that one was sent, with their room until that person deletes their
    account (P3b-L10, P3b-L12; across the API and worker processes, since
    round 6, a row the API process had not seen keeps it until the
    deletion's last statement has run, which can be after the route
    answered, and for good if that statement fails, which is logged, or the
    API process stops before it: §15). A recipient who wants the message
    after that has to have saved it.
-   **The content one account can make the server keep, and what it can make it
    send,** is bounded (P3b-H1; content, not rows: a cancelled switch's rows
    stay, decision 24): at most 20 release switches per owner whose content is
    held, armed, in grace or fired until the removal; at most 10 arms per owner
    in any 24 hours; at
    most 5 held releases naming one person from one owner, and at most 50
    distinct owners with a held release naming them, an owner's several
    counting once (decision 18, option (c), the operator's choice of
    2026-10-31; until then 50 held releases from everyone).
    Each bound is read before the signatures are verified and again right before
    the rows are written, with nothing yielding between, so on one API process
    the bounds hold against arms sent at once (as first fixed they were read
    once, before the signature awaits, and a burst of N arms passed every one:
    round 2 of the review). Across API replicas each replica checks against its
    own mirror, which shows another replica's arms only once that replica's
    write-behind queue has written them to Postgres and told its peers; the
    queue writes one row at a time, in order, and an arm queues one write per
    copy and one for the switch (up to 66), so a burst is itself what lengthens
    the delay, and across replicas a burst can exceed each bound by up to its
    own size until the queues drain. How long that takes was not measured (round
    3 of the review: as written in round 2 this said "typically under a second",
    which nothing measured and the queue's design contradicts in exactly the
    burst case). So, on one process, at most 250 notice rows name one person
    in any 365 days (50 owners, five each; 50 while the bound counted
    releases), each with at most one re-invite, and each sent once the
    homeserver has accepted it; a send the homeserver accepted but answered
    after the 30 s is retried with the same transaction id, which the homeserver
    deduplicates for 30 to 60 minutes for a bot token without a device (and not
    across a homeserver restart) and for 24 hours for one with a device (§15,
    "Read, not run"), so a homeserver that keeps answering every send late for
    longer than that can show the person the same notice more than once: from
    the sixth retry (about 31 minutes in) or the seventh (about 63 minutes) at
    the latest without a device, and from the thirteenth (about 26 hours in)
    with one (30 s doubling to 6 hours). A recipient cannot yet refuse an owner
    (decision 19). The bound on owners is itself a lever (round 5 of the
    review, for the bound then counted in releases), and a broad one (round
    6). One release names up to 64 people and an owner counts once toward each
    person it names, so blocking anyone takes 50 accounts with published
    release keys, and those 50, each arming its 20 held switches naming 64
    different people (two days at the arming rate of 10), fill the bound for
    1,280 people, about 26 people for each account. Counted in releases, as
    until round 9, ten accounts with five arms each naming the same 64 filled
    it, 128 people a day and 256 within the held cap, the same 26 per account
    (in the verifiers' replay of round 6 ten accounts armed 100 releases of
    64 on each of two days, 256 people ended at 50, and the third day's arms
    were refused by the held cap); the operator's choice raises the smallest
    attack, not the cost per person blocked. From then on every other owner
    who names one of those people is refused 409 `recipient_limit` (the owner
    sees it, and one naming the person on no held release can tell it is the
    bound on owners) for as long as those switches are kept armed, which
    takes one check-in per switch per interval (an interval can be up to 365
    days), and for at least 365 days after they fire; a fired one stays after
    its owner's account is deleted (decision 12), and neither a person named
    nor anyone else can clear it through the API (new release keys change
    nothing, the person gets 404 for someone else's cancel, and no admin
    route touches a release). Decision 18 records the choice and the
    alternatives with their cost per person blocked; test 26 of the releases
    file pins what it does now, with two people named by the same arms.
-   **Who learns what from a notice:** the homeserver, nothing new; Apple or
    Google, that a notification came (the app registers `event_id_only`
    pushers); an email provider, the fixed body, for someone with email
    notifications on; anyone who sees the screen, that Blackout wants
    something.

## 12. Fixed test vectors

`packages/blackout-protocol/src/release/envelopeVectors.ts`, imported by
path by the tests and not from the package index, like PR 2's. Alice (owner)
and Bob (recipient) are PR 2's vector identities. **Every value is
synthetic** and protects nothing; each input is a byte range, so anyone can
make every output again:

| Input            | Value                                                                                              |
| ---------------- | -------------------------------------------------------------------------------------------------- |
| Release id       | `7e1f0d2c-3b4a-4596-8a7b-6c5d4e3f2a1b`                                                             |
| Message          | "Vector release message — synthetic, it protects nothing. ✓" (62 bytes of UTF-8, padded to 1,024)  |
| Content key K    | the bytes 0xe0, 0xe1, … 0xff                                                                       |
| Content nonce    | 0xc0 … 0xcb                                                                                        |
| Alice's own copy | ephemeral X25519 scalar 0x10 … 0x2f; ML-KEM encapsulation seed 0x30 … 0x4f; wrap nonce 0xd0 … 0xdb |
| Bob's copy       | ephemeral X25519 scalar 0x50 … 0x6f; ML-KEM encapsulation seed 0x70 … 0x8f; wrap nonce 0x90 … 0x9b |

How each output was made: the content with `encryptReleaseContentWith`
under K and the nonce (padding is deterministic); each ephemeral key by
importing its scalar as PKCS #8 into WebCrypto; each encapsulation with
`ml_kem768.encapsulate(the identity's ML-KEM key, the seed)` in
`@noble/post-quantum` 0.6.1; each copy with `sealReleaseCopyWith` and
Alice's signing key (Ed25519 is deterministic). Pinned: the associated data,
the content ciphertext and its hash, the commitment, and for each copy its
transcript, both shared secrets, the wrap key, the wrapped K, the sealed copy,
the signed bytes' length and SHA-256, and the signature. **Test**,
`releaseEnvelope.test.ts`: every one of them is rebuilt from this record's
tables with `node:crypto` (X25519 through `KeyObject`s, HKDF through
`hkdfSync`, AES-256-GCM through `createCipheriv`, Ed25519 through `sign`,
SHA-256 through `createHash`) and noble's ML-KEM with the seed, the only
ML-KEM in the tree (PR 2's L7); `sealReleaseCopyWith` reproduces both copies;
both open. The shared sealing function's own test in
`deaddropPqHybrid.test.ts` uses its own byte ranges (scalar 0x21 … 0x40,
seed 0x61 … 0x80, nonce 0xa1 … 0xac) and rebuilds its expected values
rather than pinning them.

**Secret scanners.** Several of these values sit under names a scanner reads
as secrets: `contentKey`, `ephemeralX25519Scalar`, `mlkemEncapsulationSeed`,
`x25519SharedSecret`, `mlkemSharedSecret`, `wrapKey`, `wrappedContentKey`,
`sealedKey` and `signature`, and in the tests, lines that name PR 2's vector
private keys (`signingPrivateJwk`, `x25519PrivateJwk`, `mlkem768SecretKey`,
`seeds.ed25519`) or build PKCS #8 keys from them. GitGuardian's pull-request
check, which scans every commit and does not read `.gitguardian.yaml`
(release-identities record, §6), will probably flag some of them. They are
all derived as the table and paragraph above say, from byte ranges, and none
was renamed, split or weakened for a scanner, so an incident on any of them
is the operator's to ignore in the GitGuardian dashboard as a test
credential. gitleaks, which reads `.gitleaksignore`, flagged six vector
lines, each copy's two shared secrets and its wrap key; they are listed as
entry 7 of `.gitleaksignore`, with a comment saying why, and a scan of the
branch then finds nothing.

## 13. Review before the build

Not independent: the same author, before any code, against the constraints
of the release-identities record and the questions below.

-   **C5, C7, C8, C15, H1, decision 19 and §5's notice rules** each have a
    section above that meets them, or says why not.
-   **Could the shared function change dead-drop keys?** Only if the empty
    transcript changed `info`; `deriveHybridAeadKey` appends a transcript
    only when it is non-empty, and the test checks an empty-transcript seal
    against an independent rebuild of the v2 derivation.
-   **Is a recipient told anything about the others?** The header names
    nobody but the owner, a copy only its recipient, the response holds only
    the caller's copy, and the notice names nobody. The padded size says
    nothing about the others.
-   **Can a recipient read before the release?** Only if the server gives
    them their copy early (§10). The release read lists fired switches only,
    and only to their recipients.
-   **Is the API's checking of signatures meaningful?** Against client bugs
    only; it is stated so in §8 and in the code.
-   **Is anything checked after it is used?** The commitment is checked
    before the content is decrypted, and nothing is shown before every check
    in §8 passed.
-   **Does the flag hold anything back?** It gates arming only. Switches armed
    while it was on keep firing, being served and being notified if it is
    turned off: a flag that could hold a release back would be one more way
    to do it.
-   **Does a deleted account leave anything?** A deleted owner's unfired
    switches lose their content, identity copy and copies; a deleted
    recipient's copies are blanked and their pending notices fail; fired
    releases stay for the people named, until the removal at the first sweep
    pass at least 365 days after they fired.
-   **What changed against the design:** the release id is the switch id
    (one id, chosen by the device because it is in the associated data and
    the transcript); the owner's identity is kept with the release (E13); a
    cap on release switches per owner whose content is held bounds the content
    the server keeps, not its rows (decision 4 below, as part 2's review
    corrected it, and decision 24); the header is signed inside every copy's
    signature, not separately (E7); and who can name one person is bounded,
    which the design left open: at most 5 held releases from one owner and at
    most 50 distinct owners (decision 18, after part 2's review; the
    operator chose to count owners rather than releases on 2026-10-31, which
    takes 50 accounts rather than ten to keep everyone else from naming a
    person).

## 14. PR 3 as built, part 1: protocol and SDK (`-v44`)

-   **The shared sealing function**,
    `packages/blackout-protocol/src/deaddrop/crypto/hybridSeal.ts`:
    `hybridSeal` (dead drops; it draws the randomness), `hybridSealWith`
    (release copies, whose `sealReleaseCopy` draws the randomness and passes
    it; also the fixed vectors, which supply it) and `hybridOpen`, with the
    all-zero refusal on both sides (`HybridSealError`). Both shared secrets
    are filled with zeros in a `finally`, so on every path: the key derived,
    or a bad nonce, an all-zero X25519 output or a failed decapsulation
    thrown before it (best effort, P3-L3, the fourth reading). The v2
    branches of `encryptDeadDrop` and `decryptDeadDrop` call `hybridSeal`
    and `hybridOpen` with no transcript.
-   **The envelope**, `packages/blackout-protocol/src/release/envelope.ts`:
    the labels and bounds of §3 and §7; `parseReleaseHeader`,
    `parseReleaseCopy` and `parseReleaseEnvelope` (§8); the byte builders of
    §3 to §6 (transcript, signed bytes, associated data, commitment, content
    hash, the sealed copy's layout); `encryptReleaseContentWith` and
    `decryptReleaseContent` (which clears the padded bytes and the unpadded
    copy once the text is a string; the string cannot be cleared);
    `sealReleaseCopy` and `sealReleaseCopyWith`, which verify the
    recipient's identity and seal to the verified keys (`sealReleaseCopyWith`,
    for the vectors, takes the ML-KEM encapsulation as given, so that leg is
    the caller's to make to the verified key); `buildReleaseEnvelope` (a
    fresh K and nonce, the owner's copy first; afterwards K, the commitment's
    copy of it, the message's UTF-8 bytes (a message over the cap is encoded
    to measure it, and that copy is cleared before the refusal), the padded
    text and, inside the sealing function, both shared secrets, the
    concatenation of them the KDF is fed and each wrap key's bytes are
    filled with zeros,
    **best effort**: JavaScript promises nothing about copies an engine
    made, P3-L3); `releaseSignatureVerifier`,
    which verifies the owner's identity once and parses each copy it is
    handed; `openReleaseCopy`, the recipient's checks of §8, returning the
    header's release id and owner with the text; and `resealReleaseCopy`,
    which refuses a header whose release id is not the switch's
    (`release_mismatch`, P3-H1), then opens the owner's own copy with every
    one of those checks, the content's decryption included (P3-L2), before
    sealing K again. Fixed vectors in `envelopeVectors.ts` (§12).
-   **When a comparison counts**, `release/comparison.ts`:
    `releaseComparisonState` (given the fingerprint that signed a release in
    hand, `other_key` unless it is the one compared, P3-M1; the field is
    required, `null` being the sealing use) and
    `releaseDirectoryFingerprints`, which computes every fingerprint from an
    identity it verified for that account, and counts an answer that is not
    an entry, or that lists more identities, current and replaced together,
    than the API keeps for one account, as nothing (§9).
-   **The wire contracts**, `deadman/releases.ts`: the arming and re-sealing
    bodies, the release read, the owner's view of a release, notice counts,
    the limits, the notice's fixed body, room name and pointer
    (`parseDeadmanNoticePointer`, which takes a release id of the release
    id's form only, P3-L4), and the error codes. `deadman/events.ts`: a
    release switch has no room (`roomId: null`), and the owner's view gains
    the release format, when it fired, the release and the notice counts.
-   **The SDK**, `packages/blackout-sdk/src/deadman/releaseActions.ts`:
    `createDeadmanReleaseActions(client)` with `armReleaseSwitch`,
    `resealRecipient`, `listReleases` and `getLimits`. Arming and re-sealing
    read the directory fresh for the owner and every recipient, and refuse
    (`ReleaseActionError`; `recipient_comparison` and `owner_key_not_current`
    name the account and the fingerprint the directory served, P3-M3;
    `recipient_identity` names the account alone, and
    `owner_key_not_published` neither) **before sending the envelope or the
    copy** unless the owner's key is the directory's current one and every
    recipient's comparison is `current`; the directory reads are sent first,
    and tell the server whom the owner is about to name (C14). They send
    only the envelope, the timer and the label, or one copy. Arming returns
    the release id and whom the envelope was sealed to (`sealedTo`, P3-H1);
    re-sealing refuses an owner view whose switch id or header is not the
    switch's, a header that is not an object included (`release_mismatch`,
    P3-H1); the release list refuses an entry that is not an object with a
    header carrying both ids as strings of their form, and one whose unsigned
    ids are not its header's (`server_mismatch`, P3-M2); a directory answer
    that is not an entry gets the refusal the contract names
    (`recipient_comparison`, `owner_key_not_published` or
    `owner_key_not_current`), not a `TypeError` (the fourth reading). The
    routes they call are the second branch's.
-   **E17, found while building.** WebCrypto's `getRandomValues` fills at most
    65,536 bytes per call and throws `QuotaExceededError` past that, and
    `randomBytes` asked for its whole length in one call. `pad()` builds
    every padded buffer through it, so padding to any bucket past 64 KiB
    threw: a dead drop over 16 KiB with bucket padding, a release over
    16,368 bytes, and a recovery file whose contents pass 16,368 bytes, which
    three key sets do (someone who replaced their release keys twice), or
    one key set with about 35 comparisons (the review measured 34 with a
    45-character Matrix id, 37 with a short one). **Run:** on `e1d4cec964`
    (develop, with PR 2) `sealRecoveryFile` throws for three key sets. Fixed
    in `random.ts`, in its own commit so it can go out alone: `randomBytes`
    fills in 64 KiB calls. **Test:** `deaddropCrypto.test.ts` (a 256 KiB
    fill, each chunk filled; a dead drop padded to 256 KiB),
    `releaseRecoveryFile.test.ts` (three key sets seal to the 256 KiB bucket
    and open); all three fail with the old `randomBytes`.
-   **Tests** (the client's Vitest suite, `apps/blackout-client/tests/unit/sdk/`):
    `releaseEnvelope.test.ts`, 108 (the labels; the vectors, rebuilt; a
    recipient refusing tampered header fields and copy bytes, a copy moved
    to another release, re-signed by a third party, signed by another key,
    and owner-signed copies that fail at the wrap, the commitment and the
    content; mis-addressed copies and missing key sets; small-order and
    zero X25519; every validator; padding sizes and the cap; building,
    opening and re-sealing with fresh keys, re-sealing's refusals, the
    switch binding and the content check when re-sealing, and that the old
    copy still opens (E14); the comparison rule, the signer included and
    the sealing use as an explicit `null`; each smaller check on its own,
    the base64 length pre-check, the directory answer's shape and the cap
    on the identities an entry lists included);
    `releaseEnvelopeActions.test.ts`, 17 (the SDK against a fake API: what
    arming sends and returns, every refusal before it sends and what each
    reports, a directory answer that is not an entry, the swapped owner
    view and one whose header is not an object or whose ids are not the
    switch's, and the release list's refusals, ids of the wrong form
    included);
    `deadmanReleaseContracts.test.ts`, 5; `deaddropPqHybrid.test.ts`, 36 (6
    new, for the shared function, two of which also assert the ML-KEM
    secret cleared when the seal refuses); `deaddropCrypto.test.ts`, 11 (2
    new) and
    `releaseRecoveryFile.test.ts`, 41 (1 new), for E17.
-   **Every check was removed once, to see a test fail.** 75 checks in
    `envelope.ts`, `comparison.ts`, `hybridSeal.ts` and the SDK were each
    taken out in turn (a scratch script outside the repository, which
    restores the file after each run); each time at least one test failed.
    The review's fixes added 12 more, a second reading of those fixes two
    more, a third reading two more and a fourth reading six more, each
    removed once the same way, and a fifth reading ran two more: the exact
    bound it gave the cap, and a guard inside P3-H1's check that none of the
    runs before had taken out alone (the table in "Independent review,
    2026-10-29").
    Two survived at first, the verifier's and the decryptor's own parsing,
    which only a direct call reaches, and each has a direct test now; the
    fifth reading's guard survived the same way until it added one. Three
    checks were removed instead, because another check always made them
    and no test could tell them apart: the decryptor's padded-length check
    (the header's parse makes it), the unwrap's 32-byte check on K (the
    sealed copy's fixed layout makes it), and the opener's account match on
    the key set (the fingerprint names the account, and the key set's own
    check takes the account).

## 15. PR 3 as built, part 2: the API (`-v46`)

Stacked on part 1. Everything here is the server's bookkeeping around the
envelope: it stores what the device sealed, serves it to the people named
once the switch fires, and has the bot point at it. Nothing here can read a
message, and nothing here makes a release happen on time (§10, R12).

-   **Migration 106** (`106_deadman_releases`): `deadman_switches` gains
    `release_format` (existing rows `legacy`) and `released_at`, and
    `room_id` becomes nullable; the tables `deadman_release_wraps` (one sealed
    copy per switch and account: fingerprint, sealed copy, signature) and
    `deadman_release_notices` (per switch and recipient: room, status,
    attempts, last error, next attempt, sent or failed at). The down
    migration refuses to run while any release-format switch exists, since
    reverting would leave it without its copies and fire it as a legacy
    switch. The memory, file and Postgres stores carry both tables; the
    descriptor count is 158. A release switch's `encrypted_payload` holds the
    header and the owner's public identity at arming (E13) as JSON; the owner
    never gets it back as a payload.
-   **Arming**, `POST /v1/deadman/switches`
    (`packages/api/src/modules/deadman.ts`,
    `services/deadmanReleases.ts`): behind `BLACKOUT_DEADMAN_RELEASES`, read
    per request, on for `1` or `true` in any casing with surrounding
    whitespace ignored and off for anything else (`yes`, `on`); and behind
    this process's own `BLACKOUT_DEADMAN_SWEEP` not being `0`, since a switch
    armed where no sweep runs would never fire (the API cannot see a separate
    worker's environment, so a deployment that runs the loops elsewhere
    leaves the variable unset on the API; P3b-L4). The 1 MiB body cap is
    middleware and runs first, flag off or on: a body over it is 413 whatever
    the flag says, a body under it is buffered. Then, with arming closed, the
    route answers 409 `arming_unavailable` with the reason (`releases_off`,
    or `sweep_off` with its own message) before the body is parsed, so
    nothing about the request is stored, as since PR 1 (P3b-L13). Open, after
    the capability, in this order: the body's shape (format `release-v1`, the
    timer, an optional label, the envelope, nothing else);
    `parseReleaseEnvelope`; the caller is the header's owner (403); the timer
    and label bounds; at most 20 release switches per owner whose content is
    still held, armed, in grace or fired until the removal (409
    `release_switch_limit`; decision 4 as corrected, decision 17); at most 10
    arms per owner in any 24 hours, cancelled ones included (429
    `release_arm_rate_limited` with `Retry-After` and `retryAfterSeconds`,
    computed as the identities directory computes its publish limit;
    decision 18); the owner has a current identity (409
    `owner_identity_missing`); each other copy names an account whose
    current identity is the copy's (400 `unknown_recipient` for an account
    with no identity, an account that does not exist included; 409
    `recipient_identity_superseded` for one the account replaced; 400
    `recipient_identity_unknown` for one it never published; each says
    whose) and which this owner names on fewer than 5 held releases, and
    which either this owner already names or fewer than 50 distinct owners
    name (409 `recipient_limit`, saying whose; one code and message for both
    bounds, which hides nothing, since an owner naming the person on no held
    release who is refused learns that 50 other owners do: decision 18,
    option (c), the operator's choice of 2026-10-31; it counted releases,
    50 from everyone, until then); every
    signature under the
    owner's current identity (400 `invalid_release_signature`, saying whose
    copy), which also refuses a header naming any other identity than the
    owner's current one (409 `owner_identity_changed`: the verifier computes
    the fingerprint and compares it, so the service makes no comparison of
    its own); then, after those awaits, the release id is still free (409
    `release_id_taken`, an existence answer for any switch's id, accepted and
    explained at `SWITCH_NOT_FOUND` in the module: P3b-L7, decision 22), and
    every bound still has room, each read again (round 2 of the review: read
    once before the signature awaits, a burst of N arms passed every bound),
    and the owner's current identity is still the row the verifier was built
    from and every recipient's current identity is still the copy's, each
    refused with its own code as before the awaits (round 3: read once, so a
    recipient who rotated during the verification got a held copy sealed to
    a replaced key, and one who deleted their account a held copy their
    deletion's blanking pass had already run past); then the rows are written
    in one store call (`armDeadmanSwitch`): the copies first, one row per
    account, and then the switch, id = release id, no room, `release-v1`,
    the recipients' account ids, the label. In memory and in the file store
    the call writes the mirror. In Postgres it is one awaited call on one
    connection, in the switch's lane of the write-behind queue (after this
    process's earlier writes of that switch, of which a fresh id has none,
    not after its writes to other tables): no switch has the id, the copies
    insert-only, then the switch insert-only `RETURNING` the row; the mirror
    takes the rows only once Postgres has them, they are announced to the
    other processes, and only then is the owner answered 201 (round 11 of
    the review: the rows were write-behind upserts committed after the 201,
    so one dropped left a switch only that process listed, which in the
    deployed layout, where the sweep runs in another process, never fired).
    A stop between the copies and the switch leaves copies no switch names,
    which nothing lists or serves and the named account's deletion blanks
    like any other, and never a switch without copies, which would fire and
    release to nobody. Where the switch's insert finds the id taken after all
    or fails, the copies the call wrote are deleted again, best effort (by
    the call's own `created_at`), and the owner is answered 409
    `release_id_taken` or 500 `switch_write_failed`, nothing in the mirror;
    a call the database does not answer within 30 seconds is 503
    `switch_write_unanswered` with nothing in the mirror, and if it lands
    later the switch and its copies are taken into the mirror and announced
    then (`settleSwitchStatement`), so the owner's list shows it, and arming
    the same envelope again is refused `release_id_taken`. Until the store
    answers, the arm counts toward every bound and its id is taken
    (`armsInFlight`), so a second arm sent meanwhile reads the counts with
    it. A re-seal's copy is still a write-behind upsert: one that failed
    twice and was dropped (`db_write_behind_failed`, `writeBehindQueue.ts`)
    leaves the new copy in that process's mirror only; nothing detects the
    orphaned copies or the missing one (P3b-L5). On one replica two arms with
    one id cannot both write, the bounds hold against arms sent at once, and
    every copy written is sealed to a key current when it is written; across
    replicas the store is eventually consistent and the window, which a
    burst lengthens (§11), applies to all three (P3b-L6): an arm on one
    replica can also seal a copy to a key another replica has just seen
    replaced, or to an account whose deletion it has not seen yet. The
    answer is the armed event with the owner's view.
-   **The owner's view** carries `releaseFormat`, `releasedAt` once fired,
    `release` (the header, the owner's identity, the owner's own copy, and
    whom each held copy is sealed to with its fingerprint) while the content
    and the owner's own copy are held, and `notices` counts once fired. It
    never carries the notice rooms or anyone else's copy. A recipient who
    deleted their account drops out of `sealedTo` (on one API process: an
    arm or a re-seal racing the deletion reads the identities again before
    it writes; across replicas, see the account deletion bullet) and their
    pending notice counts as `failed`, so the owner can tell; the directory
    tells anyone the same (P3b-L11).
-   **Re-sealing**, `POST /v1/deadman/switches/:id/reseal` (64 KiB): the
    caller's own release switch (anything else is the one 404), not fired
    (409 `switch_triggered`), not cancelled (409 `switch_cancelled`), a
    release switch (409 `not_a_release`, a legacy switch whose payload happens
    to be release JSON included); `parseReleaseCopy`; for an account the
    switch names (400 `not_a_recipient`); the owner has a current identity;
    the account's current identity is the copy's; the signature verifies over
    the stored header under the owner's current identity (a header signed by
    a replaced owner identity is `owner_identity_changed`: the owner arms
    again, E14); the switch is read again after the awaits, so, on one
    replica, a cancel that landed meanwhile wins and no copy is written to a
    cancelled switch; and so are the owner's and the recipient's current
    identities, as on arming, so a rotation or an account deletion that
    landed meanwhile is refused with the same codes and nothing is written
    (round 4 of the review: as round 3 left it only the switch was read
    again, and a re-seal racing the recipient's deletion wrote a held copy
    for the deleted account after the deletion's blanking pass, listed in the
    owner's `sealedTo` again and owed a notice when the switch fired; one
    racing a rotation wrote a copy sealed to the key just replaced). Across
    replicas the store is eventually consistent (a
    replica sees another's write once that replica's write-behind queue has
    written it and told its peers through LISTEN/NOTIFY; how long that takes
    grows with the queue and was not measured), and a cancel on one replica
    with a
    re-seal on another in that window can leave a sealed copy on a cancelled
    switch: served to nobody, since `releasedCopiesFor` needs a switch that
    stands fired (`triggered` with its `releasedAt`, `standsFired`; round 11
    of the review: it keyed on `releasedAt` alone, which a switch cancelled
    by its owner's deletion over a trigger committed elsewhere keeps,
    decision 30, and only the emptied content kept such a switch from being
    served), and blanked by the next sweep pass, which blanks the held
    copies of any cancelled release switch (round 11), or by a second
    cancel; a re-seal there racing the
    recipient's deletion or rotation on another replica can likewise write a
    copy for the deleted account or sealed to the replaced key (P3b-L6). Not
    gated on the flag, which gates arming only (§13).
-   **The release read**, `GET /v1/deadman/releases` (`deadman.read`): each
    fired release switch that sealed a copy to the caller and still holds its
    content, with the header, the owner's identity at arming, when it fired,
    when it is removed, and the caller's own copy; nothing before the
    trigger, nothing of the caller's own switches, nothing of anyone else,
    newest first. `releasedAt` is written with the trigger; what says a
    release switch stands fired is its status `triggered` together with it
    (`standsFired`), since the owner's deletion over a trigger committed
    elsewhere leaves a switch cancelled with its `releasedAt` (decision 30;
    round 11 of the review: the readers keyed on `releasedAt` alone). The
    legacy recipient views
    (`GET /switches?scope=recipient`, `GET /switches/:id`) never show a
    release switch: a recipient gets the same 404 as a stranger.
-   **Limits**, `GET /v1/deadman/limits` (`deadman.read`): whether arming is
    open here and, if not, why (`armingUnavailableReason`: `releases_off` or
    `sweep_off`), the timer bounds, 64 recipients, 64 KiB of text, the three
    padded sizes, the label length, the four bounds of P3b-H1
    (`maxLiveReleaseSwitches` 20, `maxArmsPerDay` 10,
    `maxHeldReleasesPerRecipientFromOwner` 5, `maxOwnersNamingRecipient`
    50; part 2 added both, and the second was `maxHeldReleasesPerRecipient`
    until round 9 counted owners), the backlog tolerance from the sweep's own configured cadence
    (`deadmanSweepIntervalMs`), the 72-hour backlog window, 365 days of
    retention, 30 days of notice retries.
-   **Cancel** blanks every copy, the owner's own included, once its
    conditional write has applied; one answered 503 whose statement lands
    later has them blanked when it settles (`settleSwitchStatement`), and a
    write that finds Postgres has the switch cancelled, and each sweep pass
    (`removeExpiredReleases`), blank any copy a cancelled release switch
    still holds (round 11 of the review: until then a cancel that landed
    after its bound left every copy held, the mirror armed and no process
    told, until the owner cancelled again, which nothing told them to). A
    second cancel blanks what a switch cancelled before this code still
    holds, by a conditional write of the content column alone, as the
    365-day removal now writes the content (round 11: both were full-row
    writes from this process's mirror, and the removal on the worker could
    put back a label the owner's deletion on the API process had just
    erased). **The sweep** (`sweepOverdueDeadmanSwitches`) fires a release switch
    by writing `triggered` and `releasedAt` in one update and then one notice
    row per recipient whose copy is held and lacks one; a legacy switch
    changes status only. Every move the sweep makes (into grace, into a
    backlog window, the trigger) is conditional (`advanceDeadmanSwitch`): it
    lands only on a switch still as the sweep read it, the same status and
    the same last check-in. In Postgres that is one statement,
    `UPDATE ... WHERE status = ... AND last_check_in_at = ... RETURNING *`
    on the switch's id, run in the switch's own lane of the write-behind
    queue (after this process's earlier queued writes of that switch and of
    its whole table, not after its writes to other rows or tables, and
    before a write of the switch queued meanwhile; round 11 of the review:
    it ran after every write the process had queued, to any table, so an
    honest check-in behind them was answered 503 and the stalled flag then
    refused every other owner's on the process) and writing only the moved
    columns (`writeDeadmanSwitchIf` in `db/store.ts`). The mirror takes nothing of
    the move until Postgres has answered: applied, the mirror takes the row
    Postgres returned; refused (another process moved, checked in or
    cancelled the switch first), the row Postgres has, read in the same
    turn, and the sweep writes nothing else for it: no notice rows, no event
    (round 9 of the review: a standby whose mirror had not heard of the old
    leader's trigger fired the switch again with a full-row write, and
    Postgres took its later `releasedAt`, which moved the notice window and
    the removal date; a check-in or a cancel the API process committed
    within the change notification's lag was written over the same way).
    Either way the result is announced to the other processes. Until round
    10 the mirror took the move before the statement ran, so while the
    statement waited, the notifier in the same process wrote and sent a
    notice, and the person's read on that process listed their copy, for a
    trigger Postgres then refused; now nothing that process serves or sends
    rests on a move Postgres has not applied. Where this process itself
    wrote the switch while the statement ran (only the owner's deletion
    can: a check-in, a cancel, the second cancel's and the removal's
    blanking of the content and another move are conditional writes
    themselves, the last two since round 11), the fields those writes
    changed are kept over Postgres's
    row and the whole row written after them; a change notification's
    refresh of the mirror is not such a write (round 10: taken for one, it
    put an older status over a cancel another process had committed). So
    the owner's deletion during the statement acts on the switch as the
    mirror then has it, armed, as it does a moment before the statement: it
    cancels the switch and removes its content and copies even over a
    trigger another process committed that this one had not heard of, which
    a deletion in a lagging process does with or without a sweep running
    (the deletion's write is not conditional), and a deletion during this
    process's own move stands over the move, which then writes no notice
    row. Where Postgres has no row for the switch, this process's own write
    of it was dropped (`db_write_behind_failed`; nothing deletes a switch
    row), and the move writes the record whole, insert-only, and applies,
    logged `deadman_switch_row_restored` (round 10: such a switch matched no
    row on every pass and never fired, and nothing said so). A statement
    that fails, or that does not answer within 30 seconds (its turn in the
    queue and the statement together, `switchStatementTimeoutMs`), is logged
    (`deadman_switch_write_failed`) and not made here; it is safe to repeat,
    and the first pass after the database answers does (round 10: one
    failure kept the move in the mirror only, and no pass tried it again,
    while every other process read the switch armed). One whose turn has not
    come when the bound runs out is not run when it comes; one already sent
    can still land, and when it settles the switch is read again, in its
    lane, so after any write of it this process queued meanwhile, taken into
    the mirror unless a newer write or refresh has replaced the entry, and
    announced to the other processes, and a landed cancel's held copies are
    blanked then (round 11: nothing was done when it settled, so the mirror
    said armed until a later pass happened to refresh the row, every copy
    stayed held, and no process was told); the notifier's catch-up writes a
    landed trigger's notice rows, and only its event is not emitted. While
    such a statement has not settled, no other conditional write of a switch
    is sent on this process, on any switch (each is unanswered at once; the
    flag is process-wide on purpose, since one statement the database did
    not answer says the database is not answering, and since round 11 a
    statement waits only for this process's earlier writes of the same
    switch, so a backlog of its other writes no longer sets it), and a
    stalled database ends a pass after about one bound. The store keeps when
    its statements began to stand unanswered and when they settled, and
    notes a check-in or cancel refused unanswered with the switch's last
    check-in as it then stood; the sweep gives a switch due at any moment
    while they stood, or whose owner's write was so refused and whose last
    check-in has not changed since, the backlog window instead of firing it,
    within the tolerance or not, as after an outage of its own
    (`evaluateSweepTransition`'s `stalled`; a note is cleared when a write
    of the switch applies, when a check-in landed anywhere, or when the
    switch is terminal; round 11: a stall an hour before a deadline refused
    the owner's check-in at once, and the first pass after it, within the
    tolerance, fired the switch). Only the process that runs the sweep knows
    its own stalls and refusals: in the deployed layout a check-in the API
    process refused during a database outage that the worker's own
    statements did not meet does not hold the switch back, and it fires at
    its deadline if the database answers within the tolerance (decision 31).
    The owner's check-in and cancel are conditional the same way
    (`updateDeadmanSwitchIf`), on the status and the last check-in the route
    read, and the switch as each refusal read it is looked at before every
    attempt, the last included: one that Postgres refuses because the switch
    fired is answered 409 `switch_triggered` on any attempt and one because
    it was cancelled 409 `switch_cancelled` (the check-in then blanks any
    copy the switch still holds), nothing written (round 11: the third
    refusal was answered `switch_changed` whatever the switch had become);
    one refused because another check-in or the sweep's move into grace
    came first is made again over what Postgres has (three tries, then 409
    `switch_changed`); one the database does not answer in time is answered
    503 `switch_write_unanswered`, since it may or may not have landed and
    doing it again is safe, and one refused at once because another
    statement stands unanswered the same, though it was certainly not sent
    (round 10: the routes wrote full rows
    from their own mirror, so a check-in the app accepted after the worker's
    trigger had committed set the switch back to armed while its
    `releasedAt` stayed set, the person's copy stayed readable and their
    notice was sent, and the owner was told it had checked in). The sweep is
    asynchronous, and the scheduler does not start a pass while one runs,
    and logs a tick it skips for that (`deadman_sweep_tick_skipped`).
    Each pass also removes the content and every copy of
    releases that fired 365 days ago or more, once; the rows stay, the notice
    counts stay. The copies and the notices are listed by switch through an
    index the store keeps (`GroupedMap` in `db/store.ts`: a `Map` whose rows
    are also grouped by switch, kept in step by every `set`, `delete` and
    `clear`, rebuilt by the file store's hydrate and kept by the Postgres
    store's hydration, row refresh and wholesale refresh, which makes a fresh
    map of the same kind), so a pass over N already-removed releases costs N
    indexed lookups and not N scans of every copy row (P3b-M4: the first
    build scanned, 8 s a tick at 10,000 removed releases, and the notifier's
    catch-up scanned the same way for every fired release for 365 days).
-   **The notifier**, `services/deadmanReleaseNotifier.ts`, beside the sweep at
    its cadence under the same `BLACKOUT_DEADMAN_SWEEP` gate
    (`backgroundLoops.ts`). Each tick first writes the rows a fired release
    switch lacks (§11's catch-up), then sends up to 50 due notices, oldest
    first, one at a time; a row for a release switch that has not fired is not
    due and is left alone (P3b-L1). For each: the recipient's standing room is
    reused from an earlier notice, or made by the bot (`createRoom` with
    `name: "Blackout notices"`, `visibility: private`, `preset: public_chat`,
    `encrypted: false`, `initial_state` holding an invite-only
    `m.room.join_rules`, the person invited with `is_direct`, `events_default`
    and `invite` at 50: §11 says why that preset; and `room_alias_name`, the
    person's alias) and recorded on the row before anything is sent: in the
    mirror at once, and in Postgres once the queued write lands, which the
    read before the send waits for. A process that stops between the
    create's answer and that write (a crash, or a restart while the database
    is stalled) leaves Postgres without the room, and where the homeserver
    refuses the alias the next holder of the person's claim, finding no room,
    makes another, so the person has an invitation in each (with the alias,
    the next create finds the first's room; round 9 of the review: this said
    a crash after the answer made no second room); a create the homeserver refuses with
    `M_ROOM_IN_USE` has its alias resolved fresh and the room it names used if
    its `m.room.create` is the bot's (the bot's id from whoami, cached as §11
    says) and it carries the bot's join and power levels under which the person
    can neither post nor invite (`aliasRoomComplete`), with the person invited
    again as for a known room; one without all of that yet is retried once
    (`matrix_alias_room_not_ready`), and one still so at the notice's next
    attempt, due one backoff after the first look was recorded, is taken for a
    create the homeserver abandoned part way and gets a room without the alias
    (round 4 of the review for a room with no events, round 5 for the create
    alone, the create and the bot's join, and the retry's timing); a create
    refused for the alias itself (403, `M_EXCLUSIVE`) or an alias naming a room
    that is gone or not the bot's gets a room without the alias, any other
    refusal is a retry (§11 says what each leaves: round 3 of the review);
    finding or making the room happens under a per-recipient slot, with the row
    and the room read again once the slot is held, so two notices for one person
    in overlapping ticks make one room (P3b-M5); a person whose membership is
    not `join` or `invite` (left, declined) is invited again through the member
    state endpoint with `is_direct`, at most once per notice (`reinvited_at` on
    the row); a room the homeserver answers 404 for is replaced, and every row
    of that person's that pointed at it moves to the replacement (P3b-L3). The
    notice is one `m.text` with `DEADMAN_NOTICE_BODY` and the pointer
    (`co.bmc.deadman.release`: schema version 1 and the release id, which is the
    switch id, a lowercase UUID v4), and nothing else, transaction id
    `deadman-release-<switch>-<recipient>`. **What "sent" means:** the
    homeserver accepted the event. Whether it reaches the person is the
    homeserver's and their client's; the release is the API's own store, and the
    release read works without any notice. Every refused homeserver call
    (create, state read, invite, send; or none configured) and every one that
    throws (a network error: `matrix_<call>_network_error`) is that notice's
    attempt, a retry with backoff from 30 s doubling to a 6-hour cap, timed from
    when the retry is recorded on the tick's clock (the tick's `now` moved on by
    the time the tick has run: round 5; it was timed from the tick's start), for
    30 days from the release, then `failed` with `retry_window_over` (P3b-L2); a
    recipient whose account is gone (`recipient_gone`) or a release that is not
    there to point at (`release_unavailable`: cancelled, removed, or never a
    release) ends the notice at once, and a notice that ends for a gone
    recipient forgets its room. The row is read again after every homeserver
    call and before anything is written to it: a deletion that landed while the
    room was being found or made, or during the send, has ended the row with
    `recipient_gone`, and that stands whatever the call answered (the room made
    for a deleted account is not recorded on the row, no re-invite is, nothing
    is sent, and no later error, attempt or backoff is written over the reason
    the row ended); a row ended any other way meanwhile is left as it is; and
    the account is read again before a row is marked sent, so one gone another
    way ends it (P3b-L14, and its round 2: as first fixed only the `sent` branch
    read the row again, so a deletion during `createRoom` put the new room on
    the ended row and a deletion during a send the homeserver refused was
    written over with the refusal). That read is the notifier's own process's
    mirror. Where the deletion runs in another process, as
    `deploy/docker/production` always has it (the loops in `worker`,
    `BLACKOUT_BACKGROUND_WORKERS_DISABLED=1` on `app`), or two notifiers have
    one notice (a leader taking over from another), five things carry the
    database's view into the notifier. Before an attempt reads anything or
    asks the homeserver anything for a person, it takes the person's claim in
    Postgres (`claimDeadmanNoticeRecipient`, one statement: an insert into
    `deadman_notice_claims` with
    `ON CONFLICT (recipient_account_id) DO UPDATE ... WHERE`
    `deadman_notice_claims.expires_at <= now() RETURNING holder`), with a
    fresh holder token per attempt and the expiry in the database's
    clock, `NOTICE_CLAIM_LEASE_CALLS` call timeouts after it was taken, 7.5
    minutes, longer than the thirteen bounded steps of an attempt); no
    transaction is held open across homeserver calls. A process that cannot
    take it, or cannot tell whether it has (its claim statement failed or
    did not answer within the call timeout), asks the homeserver nothing for
    the person, writes nothing, and counts the notice `elsewhere`; its row
    stays due (round 10 of the review: a claim that timed out or failed
    became a retry, written over the row the holder was working on with
    the room this process's mirror held, so with the person's room purged
    and replaced it put the gone room back, the holder stopped before its
    send, and the next attempt made a second replacement, with no lease
    overrun and no stopped process). The claim is given up
    after the row's write, once the process's queued writes have been
    attempted (`releaseDeadmanNoticeRecipient` drains first, then deletes the
    row where this holder still has it), so the next holder's first read sees
    them; one whose statement timed out and then landed is given up when it
    lands, and one whose giving up fails or times out ends at its expiry.
    It is not mirrored, and on one process (the memory and file stores) it is
    always granted (round 9 of the review, the operator's request of
    2026-10-31: two notifiers at once, the alias refused, each made the
    person a room and sent there). Every change the notifier writes is
    conditional in Postgres (`updateDeadmanReleaseNoticeIf`:
    `ON CONFLICT ... DO UPDATE ... WHERE status = 'pending'`, or
    `WHERE room_id =` the room a row is moved off), and the creation of a row,
    by the sweep or the notifier's catch-up, is insert-only there
    (`ON CONFLICT ... DO NOTHING`), as it is in the mirror. Before anything is
    asked of the homeserver, and again right before each create, the re-invite
    and the send, the notifier reads the person's copy and the notice row from
    Postgres itself, after its own queued writes have been attempted
    (`checkDatabase`, through `readDeadmanReleaseCommitted`), each read with
    the call timeout (`database_read_timeout`, a retry; round 7: round 6's
    reads had no bound). A row Postgres has as sent or ended is not this
    notifier's to send, and one it has pending with a retry set for later
    than the read is not this attempt's either (round 8): nothing is written
    to either, and the stored row goes into the mirror (when the process wrote
    nothing to it during the read; where a write of this process's to the row
    was dropped the stored row is the older one, and a room or a re-invite the
    mirror has on a row still pending is kept, round 8). The first of those
    reads also takes the person's newest row with a room from Postgres, and a
    notice whose own row names no room uses whichever of that and the
    mirror's newest was written later (round 8). So a leader taking over
    within the change notification's lag, whose catch-up wrote the row its
    mirror lacked as pending and due, sends nothing the old leader sent,
    leaves a retry the old leader set until its time (an alias room still
    being made gets its whole backoff from the old leader's first look), and
    takes the room the old leader recorded on any of the person's notices
    rather than make another (round 7: insert-only kept Postgres at `sent`,
    but the new leader's own tick sent the notice again from its mirror,
    deduplicated only while the homeserver kept the transaction id, and with
    the alias refused made a second room, invited the person into it and sent
    there; round 8: it attempted at once a notice the old leader had set to
    retry, taking an alias room still being made for an abandoned one seconds
    after the old leader's first look, and with the alias refused it made a
    second room for a newer notice of the person's whose room only the old
    leader's rows recorded). An account
    deletion blanks every copy sealed to the account before it ends the
    notices and deletes the user row, so once it has committed, no room is
    made, nobody invited and nothing sent for that person after the next of
    those reads, whether or not the API process had heard of the notice row
    (round 7: with no read right before a create or a re-invite, a deletion
    that committed while a known room's state was read, up to 30 s, still got
    a room made for the person's Matrix id or them invited again, with nothing
    recorded). A copy the notifier's mirror holds and Postgres has no row for
    (its write failed twice and was dropped) ends the notice `failed` with
    `copy_unavailable`, unsent (round 7: round 6's read ended it
    `recipient_gone` for a person who still exists; decision 28). And the
    deletion finishes with one statement in Postgres (`finishAccountDeletion`,
    which the route awaits after `confirmAccountDeletion` and after it revokes
    the deleting session's token; it first waits, with no bound, until the
    deletion's queued writes have been attempted, a write that fails twice
    being dropped and logged, as everywhere in Postgres mode, and then waits
    for the statement at most 10 s, decision 27; round 8: the bound covered
    the first wait too, so past it the route answered before any of the
    deletion's writes were in Postgres, and the worker then made the person a
    room, invited them and sent the notice) that ends every notice row still
    pending to the account and forgets the room of every one of theirs, rows
    the API process never saw included. So a deletion the API
    process committed stands in the database whenever its change notification
    reaches the worker; until it does, the worker's mirror and its tick's
    count can say sent. What it leaves: a create, a re-invite or a send that
    was already on its way to the homeserver when the deletion committed
    (after the read just before it) can still reach the person, and the row
    then has no room (for a row the API process had not seen and a send in
    flight, `failed` with `recipient_gone` if the deletion's last statement
    came first, and `sent` if the worker's write did); a deletion that commits
    after the worker's write to a row the API process had seen lands over it,
    as its own full-row write (no room; `failed` with `recipient_gone`, for a
    notice the homeserver accepted, unless the API process had already seen
    it sent); a process that stops after a create has answered and before
    its record of the room is in Postgres leaves, with the alias refused, an
    extra room with only an invitation in it (above); two notifiers work on
    one person's notices at once only when one holds the claim past its
    lease (an attempt slower than its thirteen bounded steps, a process
    paused, or its writes still queued behind a stalled database when the
    lease ends; since round 10, one whose claim statement fails or times
    out writes nothing, which as round 9 left it was a second way in), and can then, with the alias refused, each make the person
    a room and send there, and the transaction id is deduplicated only
    within one room, so the person can get an invitation and the notice in
    each of two rooms (in one room, a second send of one notice is dropped
    while the homeserver keeps the id); and until the deletion's last statement has
    run, which can be after the route answered when it outlasts the route's
    10 s, and for good if it fails (logged, and the deletion still answered)
    or the API process stops before it, a row the API process had not seen
    keeps what the worker wrote, a room and `sent` included where the send had
    begun first (one still pending the worker ends itself at its next read,
    since the copy is blank in Postgres by the answer, unless that write was
    dropped). Round 5 of the review: the worker's full-row upsert landed
    over the API's committed deletion whenever the notification came after
    the send answered, and Postgres ended `sent` with the room. Round 6: the
    conditional writes guarded only rows the deletion had ended, so a row the
    worker's sweep wrote moments before the deletion, which the API process
    had not yet heard of, was sent after the deletion committed and kept its
    room for good; and the catch-up's creation was a plain upsert, so a
    leader that had the fired switch but not yet the row the old leader sent
    wrote it back to pending with no attempts in Postgres. Each call has `NOTICE_CALL_TIMEOUT_MS`, 30 s, to answer,
    and one
    that does not is that notice's retry (`matrix_<call>_timeout`) with its
    request aborted: the ticks do not overlap, so without that one connection
    the homeserver accepted and never answered held every due notice for
    undici's default of five minutes; every one of the seven calls a notice can
    make (state, create, alias lookup, whoami, state of the room found,
    re-invite or a create without the alias, send) hands its signal to `fetch`
    (round 3: as first fixed, only createRoom's abort was pinned by a test),
    and each of the up to four database reads among them, and the claim and
    its release around them, has the same bound, though a database call that
    timed out goes on in the background, since it cannot be aborted. A tick
    is still a sequence: 50 notices whose every first call, read or claim
    times out take about 25 minutes, a homeserver and a database that answer
    each just inside the 30 s can hold one notice about six and a half
    minutes (thirteen steps) and a tick of 50 about five and a half hours
    (§11), and the
    worker's shutdown waits for a tick in flight only up to its own bound. An in-flight set keeps an overlapping tick off a notice, and
    the interval does not start a tick while the previous one runs; a stop ends
    a tick after the notice in hand. Logs carry counts, and for a throw that is
    not a homeserver call the error's message; never who or where. A row another
    process ended while a tick had it in hand is counted as it ended: `failed`,
    or, if it was sent there, `elsewhere`, beside an overlapping tick's skip
    (round 4: every such row was counted `failed`, so with two notifiers during
    a leader handover one tick's log said failed for notices the other had
    delivered).
-   **Account deletion** (`accountLifecycle.ts`): an unfired release switch
    of the account's loses its copies with its content; a fired one keeps its
    content, the owner's identity it was signed with (E13) and the recipients'
    copies, and only the owner's own copy and the label go, since nothing is
    re-sealed after the trigger and nobody is left to open it. As a recipient:
    the account's copies on others' switches go, fired or not, and on one API
    process none is written after it, since an arm or a re-seal that was
    verifying meanwhile reads the identities again before it writes (round 3
    for arming, round 4 for re-sealing); across replicas one in the refresh
    window can still write a copy sealed to the account, held until that
    switch is cancelled or its content removed (P3b-L6); its pending notices
    end with `recipient_gone`, and a notice whose homeserver call was in
    flight when the deletion landed stays `failed` with that reason, with no
    room, re-invite or attempt recorded on it (P3b-L14; with the deletion on
    the API process and the notifier in the worker, in Postgres through the
    conditional writes above, and in the worker's mirror once the change
    notification reaches it: round 5), though the homeserver may still have
    accepted that call's notice. For a notice row the API process had not
    yet heard of, the worker's reads from Postgres and the deletion's last
    statement carry it (round 6, and round 7 for the reads before a create
    and a re-invite): such a row whose send was in flight ends `failed` with
    `recipient_gone` and no room if the last statement comes first, and
    `sent` with no room if the worker's write does (round 7: this bullet said
    it stayed `failed` either way); every notice row of its forgets the room
    that tied the account to a Matrix id (across processes through that last
    statement, which can finish after the route answered; until it does, and
    for good if it fails, which is logged, a row the API process had not seen
    keeps what the worker wrote); the route answers only once the deletion's
    own writes have been attempted in Postgres, so from then on the worker
    makes no room, invites nobody and sends nothing for the person after its
    next read (round 8; a write that failed twice and was dropped aside); the
    switch keeps the
    account id among its recipients, as legacy switches do. What stays after
    a blank, named here because the user-facing texts name it too: each
    blanked copy row keeps the account id and the fingerprint of the key it
    was sealed to (the owner's own row included), and each notice row keeps
    the account id, status, attempts, last error and timestamps (P3b-L10; the
    refuted SL-1 is below). **The export** lists a release switch's format,
    when it fired and its notice counts, never a copy; the releases given to
    the account as `GET /releases` gives them (`deadmanReleases`); and the
    notice rows about the account as recipient (`deadmanNotices`: switch,
    room, re-invite, status, attempts, last error, times), for fired switches
    only, so an unfired switch naming the account is in no part of its export
    (P3b-L8).
-   **Checks not written, because another check always makes them** (as §14
    removed three): the owner's fingerprint against the header, which the
    verifier computes and compares; a recipient account's existence, since an
    account that does not exist has no identities (publishing needs the
    account and deletion blanks its rows); until round 11, a fired switch's
    status, since `releasedAt` is written with `triggered`, but the owner's
    deletion over a trigger committed elsewhere leaves a cancelled switch
    with it (decision 30), so the readers check both now (`standsFired`); a
    legacy payload
    that is not JSON, since the parse says so, and the format check covers a
    legacy payload that is. A notice row's status at send time is checked
    now, since the review's P3b-L14 found a deletion could land during the
    send. Each bound of P3b-H1 is checked twice on purpose: before the
    signatures, so a refused arm costs no verification, and again with
    nothing yielding before the writes, so on one replica exactly the bound
    passes a burst of arms (round 2 of the review: checked once, a burst of
    N passed every bound, and "two arms racing can exceed one by one" was
    not true, since N racing exceeded it by N − 1); across replicas by up to
    the size of a burst, until the replicas' write-behind queues drain (§11).
    The held cap is what bounds the content
    one account can make the server keep; the rows are not bounded: a
    cancelled release switch's row and its blanked copy rows stay, so an
    account that arms and cancels at the rate adds up to 10 switch rows and
    650 blanked copy rows a day for good, about 230 KB a day as JSON in the
    mirror at 64 recipients and a full label (about 11 KB at one recipient),
    which decision 24 asks about. The per-recipient bounds are read twice
    per copy per arm (before the signatures and again before the writes),
    each time through the store's by-recipient index (round 2: as first
    fixed, a scan of every copy row per copy), and the owner's two bounds
    twice per arm through a by-owner index of the switches (round 3: as
    first fixed, a filter over every switch row, four times per arm). The
    identities an arm or a re-seal reads, the owner's and each recipient's,
    before the signatures and again after them, are listed through a
    by-account index of the release identities (round 4: each read filtered
    and sorted every identity row, so one pass over 64 copies took 13.5 ms
    at 10,000 identity rows and 168 ms at 100,000, twice per arm, and the
    first pass ran for arms then refused at the identity step, which write
    nothing and count toward no bound; through the index it took 0.1 to 0.2
    ms at each size), rebuilt by the file store's hydrate and kept by the
    Postgres store's hydration and refreshes as the others are.
-   **Tests** (`packages/api/test/`): `deadman-releases.integration.test.ts`,
    27 (the flag off and on, and every spelling; the sweep switched off; the
    body's shape and cap; every refusal in order, including a copy re-signed
    by a third party; the arming rate; the held cap at its edge, fired
    switches counted and bytes held flat; the per-recipient bounds, 5 from
    one owner and 50 owners, an owner's several releases counting once; arms
    sent at once at the edge of each bound, an owner already naming the
    person among them; each recipient's
    isolation before and after the trigger and the
    opening with the recipient's keys; re-sealing, its refusals, the race
    with a cancel and its body cap; cancel; the 365-day removal and its
    idempotence; the removal's indexed second pass; content gone while a copy
    is held; legacy switches unchanged, a legacy payload that looks like
    release JSON included; the limits; the export, notice rows included;
    deletion of an owner and of a recipient, before and after the trigger;
    a person's rows, an owner's switches and an account's release identities
    listed through their indexes; a key change or a deletion during an arm's
    verification, and during a re-seal's; fifty accounts filling the bound
    on owners of two people named by the same arms, which ten accounts with
    five releases each no longer do, pinned as the trade-off decision 18
    accepts; the deletion route revoking the session and then finishing the
    deletion in the database, answering when that step fails, waiting for
    the deletion's own writes first with no bound and for the last statement
    only up to its bound);
    `deadman-release-notices.integration.test.ts`, 32 (the rows the sweep
    writes; the room's creation body, its alias computed independently under
    the server's secret, and the send's body and transaction id;
    what the notice never carries; room reuse; re-invite, once per notice;
    the replaced room, once per person; each retry and its backoff; a thrown
    call per step; the 30-day window; catch-up, and its indexed cost; a gone
    recipient; a release that is not there; a switch not yet fired; a
    deletion during a send, during a send the homeserver refuses, and a row
    ended during one; a deletion while the room is found or made, under each
    call; a call that never answers, ended at the timeout, each of the seven
    with its request aborted; a create the homeserver finished after the
    timeout, found through the alias; the room made without the alias when
    the alias cannot be used, and when the room it names is still not the
    whole room with the bot in it at the next attempt (no events, the create
    alone, the create and the bot's join, a room the bot left, power levels
    that let the person post, or invite, or give the person their own level);
    a retry timed from when it is recorded, after
    a long tick; a deletion during the alias lookup,
    whoami and a create without the alias; a row another process sent
    meanwhile, counted as its; no homeserver
    configured; the overlapping tick, with a bounded wait; two notices for
    one person in overlapping ticks, and with the alias refused while one of
    them replaces a purged room, the other then using the replacement; the
    interval's running guard, the notifier's and the sweep's; the
    per-tick cap; the stop mid-tick; start and stop; a database read that
    never answers, ended at the timeout);
    `deadman-releases-postgres.integration.test.ts`, 3 (PGlite: a restart,
    `room_id` NULL, `reinvited_at`, a legacy row reading `legacy`, the
    by-switch, by-recipient, by-owner and by-account indexes after hydration
    and after a wholesale refresh, a blanked
    copy and a cleared room in Postgres, the down migration refused and then
    run);
    `deadman-release-notices-postgres.integration.test.ts`, 15 (the worker's
    notifier on PGlite beside a second store as the API process, which runs
    the deletion's own release writes and its last statement and announces
    its changes as the transport would: a deletion committed there during the
    send, the create, the re-invite or the state read of a known room, or
    before a tick past the window, told before or after the call answers,
    stands in Postgres, and so does one of a notice row the API process had
    not seen, before the tick, during the create (the alias refused
    included), the state read or the send, or after the worker recorded it
    sent, with the sends, the rooms made, the invites and the state reads
    counted and every change to the rows recorded by a trigger, so that
    nothing after the deletion sets one back to pending or gives one a room
    even for a moment; the conditional write by status and by room; the
    creation of a row insert-only; the end after a send for an account found
    gone, against a sent another notifier committed; the writer's refusal of
    a guard it cannot carry; a leader taking over that sends nothing the old
    one sent and makes no second room, with the alias or without, with the
    old one's room recorded and its send refused (left until the old one's
    retry time, then sent once in its room), and with the trigger not yet
    heard of; a copy held in the mirror and not in Postgres; the row read
    from Postgres kept out of the mirror when this process wrote it during
    the read; a new leader leaving an alias room still being made until the
    old leader's backoff ends, then sending into it; a new leader with the
    alias refused using the room the old one recorded on another of the
    person's notices, also when its mirror names an older room; a room or a
    re-invite whose write was dropped kept on a pending row, and not on a row
    ended elsewhere; `finishAccountDeletion`, which the deletion route
    awaits, returning only after the deletion's own writes, with a stalled
    drain and with a stalled last statement, for a row the API process had
    seen and one it had not (the route's own order is test 27 of the
    releases file, in memory); a standby's sweep, whose mirror has not heard
    of a trigger, a check-in or a cancel, moving nothing in Postgres and
    writing no notice row; a retry another process records after an
    attempt's first read, which stops the attempt at its next read; and two
    notifiers on two stores, the alias refused, making the person one room
    and sending each notice once, the claim taken before the first read,
    given up only after the holder's write, and one left by a stopped
    process holding the person until it expires);
    `deadman-releases-file.integration.test.ts`, 1 (with the notifier's
    conditional write applied, refused and by room across restarts);
    `matrix-client-direct-invite.integration.test.ts`, 4 (`is_direct`, the
    alias and a refusal's error code, the alias lookup's cache and signal,
    whoami's signal); `postgres-store`
    (158 descriptors) and `background-loops` (the notifier among the loops)
    updated. The envelopes in these tests are built with the protocol as the
    owner's device builds them, and the vectors' Alice and Bob stand in for
    an owner and a recipient so the server checks the identities the client's
    known-answer tests pin; every other key is made fresh in the test process.
-   **Every check was removed once, to see a test fail.** 110 checks in
    `modules/deadman.ts` (20), `services/deadmanReleases.ts` (48),
    `services/deadmanReleaseNotifier.ts` (32) and
    `services/accountLifecycle.ts` (10) were each taken out in turn, with
    §14's scratch runner outside the repository, which restores the file
    after each run, and the test file that pins each was run; each time at
    least one test failed. The first run had 111 mutations and five
    survivors: four checks no test told apart, which each have a test now (a
    sweep event's null room; a stored owner identity without an identity's
    shape, served to nobody; a blank copy while the content is still held,
    served to nobody; the catch-up's leaving unfired switches alone), and one
    branch another line always made, the owner's own copy on a fired switch
    at the owner's deletion, which the loop over every copy sealed to the
    account blanks anyway, so the branch was removed. The second run: 110 of
    110 killed. The review's forty checks and round 2's seventeen (the second
    table in the review section) were each removed once too; round 2's one
    survivor, the row read once the recipient's slot is held, was given the
    case that tells it apart (a notice waiting for a deleted person's slot
    makes no room of its own) and then failed as the rest did; round 3's
    thirty, round 4's and round 5's checks are in their tables there too.
-   **Secret scanners.** Part 2 adds no vector and no key material: its tests
    import PR 2's vectors by path and make every other key in the test
    process. gitleaks over the branch's commits finds nothing, so
    `.gitleaksignore` gains no entry; GitGuardian's pull-request check is
    not run here (§12).

**Read, not run, in part 2:** how Synapse treats `is_direct` on a
`createRoom` invite list (`handlers/room.py` copies it onto each invite
event) and on a member state PUT (`rest/client/room.py` hands the content to
`update_membership`); that an `m.text` in a two-member room notifies and an
`m.notice` does not (`rust/src/push/base_rules.rs`); how long the homeserver
keeps a transaction id, which depends on how the bot's token was minted, and
no deployment document says: 30 to 60 minutes in memory for every requester
(`rest/client/transactions.py`: `CLEANUP_PERIOD_MS`, a cleanup every 30
minutes of entries older than 30), lost on a homeserver restart, which is
all a token without a device gets (one from the admin API's login-as-user,
`rest/admin/users.py`); and, for a token with a device (a `/login`), also
24 hours in the database (`event_txn_id_device_id`, written by
`storage/databases/main/events.py`, looked up by `handlers/message.py`
before an event is made, and cleaned every 5 minutes of rows older than a
day by `storage/databases/main/events_worker.py`), so the transaction id
deduplicates a resend soon after a crash and not one after a long outage
(as first written, "about 30 minutes": round 4 of the review); the push and
email behaviour (design §5); that `create_room` writes the alias after it
makes the room id and before `_send_events_for_new_room` sends the first
event (`handlers/room.py`), so a create interrupted between the two leaves
the alias naming a room with no events (the verifiers ran this on the
fork's own code: the create answered 500, the alias then resolved to a room
whose admin state answered 200 with an empty list, and a create with the
alias was refused `M_ROOM_IN_USE` an hour later); and, for the notices
room's alias
(round 3 of the review), that `createRoom` refuses a taken
`room_alias_name` with `M_ROOM_IN_USE` before it makes a room, makes a room
id before an alias policy (403) or an appservice's namespace (`M_EXCLUSIVE`)
refuses the alias and before any event, and sends `m.room.canonical_alias`
with it (`handlers/room.py`, `create_room`; `handlers/directory.py`); that
the default `alias_creation_rules` allow every alias and no in-repo template
sets them, and the appservice's exclusive alias namespace is `#blackout_.*`,
which `#blackout-notices-` does not match, so the bot token the deployment
documents (an admin user's) may create the alias, and a bot token that was
the appservice's own would be refused it (`M_EXCLUSIVE`) and get rooms
without one (`config/room_directory.py`, `appservice/__init__.py`,
`deploy/matrix-appservice/registration.yaml`); that a purge deletes the
room's aliases and a shutdown with a replacement moves them to it
(`storage/databases/main/purge_events.py`, `handlers/room.py`); and that the
`createRoom` servlet is not cancellable, so an aborted request still makes
the room (`rest/client/room.py`). The homeserver in the tests is a stub that
records what the API sends.

## Decisions for the operator to confirm or veto

1.  The release id is the switch id, a UUID the owner's device picks; a
    taken id is refused with 409.
2.  The owner's own sealed copy is stored, so re-sealing works without K
    kept on a device, and whoever holds the owner's release keys and session
    can read the message before release (§1).
3.  The owner's public identity is kept with each release switch, so a fired
    release stays checkable after the owner deletes their account, until it
    is removed after 365 days (E13).
4.  At most 20 release switches per owner whose content the server still
    holds: armed, in grace, or fired until the removal at the first sweep pass
    at least 365 days after the trigger. _(Corrected after part 2's review,
    P3b-H1: as first built the cap counted armed and grace switches only, a
    fired switch's content was held 365 days outside it, and the "bound on
    storage of about 10 MB per account" written here was false: one account
    held 20.1 MiB after three rounds of arm-and-fire with the live count at
    0.)_ What it bounds: a held
    switch is at most about 350 KB of header JSON (a 256 KiB ciphertext in
    base64; 20 of them measured at 6.7 MiB) plus up to 65 sealed copies of
    about 1.8 KB each, so about 6.7 MiB of headers and up to about 2.3 MiB of
    copies per account, held until the first sweep pass at least 365 days
    after firing (with no sweep running, for good), in Postgres and in every
    replica's mirror. It bounds content, not rows: a cancelled
    release switch's row and its blanked copy rows (recipient id, fingerprint,
    timestamps) stay for good, so arming and cancelling at the rate of
    decision 18 adds up to 10 switch rows and 650 copy rows a day, about
    230 KB a day as JSON at 64 recipients and a full label, about 11 KB at
    one recipient (decision 24). The bounds hold on one API process against
    arms sent at once; across replicas a burst can exceed each by up to its
    own size until the replicas' write-behind queues drain (§11).
5.  The header is signed inside each copy's signature rather than once
    (E7); recipients learn they read the same text only by comparing.
6.  Transferable signatures, held by the server from arming (C15, E8).
7.  Re-sealing does not revoke an old copy; the advice after a lost device is
    to cancel and arm again (E14).
8.  A person who left or declined their notices room is invited again when a
    later notice is due.
9.  Notices are retried for 30 days, then recorded as failed for the
    operator, with counts in the logs.
10. The flag `BLACKOUT_DEADMAN_RELEASES` gates arming only (§13).
11. Decision 19 stays open: no order is added to identities in PR 3 (§9).
12. (Part 2.) When an owner deletes their account, a fired release keeps its
    content, the owner's identity and the recipients' copies until the
    removal at the first sweep pass at least 365 days after it fired, and
    only the owner's own copy and the label go; an unfired one loses
    everything. A deleted recipient's copies go at once, fired or not
    (§15).
13. (Part 2.) Re-sealing is not gated on `BLACKOUT_DEADMAN_RELEASES`: a
    switch armed while the flag was on stays its owner's to keep sealed to
    current keys (§13, §15).
14. (Part 2.) The notifier sends at most 50 notices per tick, retries with
    backoff from 30 s to a 6-hour cap, and the standing room is one per
    person, reused for every release, and kept to one by the per-recipient
    slot within a process, by a claim on the person in Postgres across
    processes (round 9 of the review), and by the room's alias across a
    timed-out create, except where §11 says (decision 25); a notice row keeps
    its room id until the recipient's account is deleted. Across the API and
    worker processes (round 6 of the review, §15), a row the API process had
    not seen keeps it until the deletion's last statement has run, which can
    be after the route answered, since the route waits for it at most 10 s,
    and for good if that statement fails (logged) or the API process stops
    before it.
15. (Part 2.) `GET /v1/deadman/limits` and `GET /v1/deadman/releases` need
    `deadman.read`, which every session token carries, like the other reads.
16. (Part 2.) A legacy switch's recipient views are unchanged, and a release
    switch is answered there as absent; a release is read through
    `GET /v1/deadman/releases` only.
17. (Part 2, after its review.) Because the cap of decision 4 counts fired
    switches until their removal, an owner whose 20 release switches all
    fired cannot arm another until the oldest is removed, at the first sweep
    pass at least 365 days after it fired; cancelling an unfired one frees
    its place. Confirm the number, or choose a larger cap or a separate cap
    for fired switches.
18. (Part 2, after its review. **Decided by the operator on 2026-10-31:
    option (c), built in round 9.**) At most 10 arms per owner in any 24 hours
    (429, `Retry-After`); at most 5 held releases naming one person from one
    owner, and at most 50 distinct owners with a held release naming one
    person, an owner's several releases naming them counting once (409
    `recipient_limit`, one code for both bounds), so at most 250 held
    releases name one person, 250 notices in any 365 days on one API process.
    The second bound discloses, to an owner that names the person on no held
    release and is refused, that 50 other owners do; a bound on what everyone
    together may do to one person cannot avoid that. What it costs, as
    decided: it is still a lever. One release names up to 64 people and an
    account counts once toward each person it names, so blocking anyone takes
    50 accounts, each with published release keys (the cost: creating the
    accounts and one identity publish each, then the arms), and those 50,
    each arming its 20 held switches naming 64 different people (two days at
    the arming rate), fill the bound for 1,280 people, about 26 for each
    attacking account, the same cost per person blocked as when it counted
    releases. From then on every other owner who names one of those people is
    refused 409 `recipient_limit` (the owner sees the refusal; it is not
    silent) for as long as those switches are kept armed, which takes one
    check-in per switch per interval, and an interval can be up to 365 days,
    and for at least 365 days after they fire, until the removal; an
    attacker's account deletion frees only its unfired switches (decision 12
    keeps a fired one for the people it named). Neither the people named nor
    anyone else can clear it through the API: new release keys change
    nothing, a person gets 404 for someone else's cancel, and no admin route
    touches a release (an operator could only edit the database). In a
    dead-man tool that blocks a safety function for chosen people, and for a
    whole group at once. Test 26 of the releases file pins it as decided:
    ten accounts with five fired releases each naming the same two people no
    longer fill the bound; fifty accounts' fired releases do, and refuse a
    51st owner, 409 `recipient_limit`, until the removal; one of the fifty
    may still name them, up to its own five; the people named cannot clear
    it.
    _(Round 5 of the review: the bound, then counted in releases, was a
    lever, which this decision did not say; round 6: it reached many people,
    not one. Counted in releases, ten accounts with five arms each naming the
    same 64 people filled it, 128 people a day and 256 within the held cap,
    the same 26 per account. The options the operator chose from, with their
    cost per person blocked: (a) keep it so; (b) count only unfired releases:
    the same breadth, held only while the attacker keeps the switches armed,
    and fired releases naming one person bounded only by how many accounts
    name them; (c) count distinct owners: the smallest attack rises from ten
    accounts to 50, at the same 26 people per account, and what one person
    can be named on rises from 50 held releases to 250; (d) drop the bound:
    nobody can be blocked, and what one person can be sent is bounded only by
    how many accounts an attacker can make, which depends on how sign-up is
    gated; (e) a recipient-side refusal, under which a refused owner's
    releases stop counting and stop notifying, so each person can clear it
    themselves: decision 19, PR 4's or later, not built, and still open
    there.)_
19. (Part 2, after its review.) A person who left or declined their notices
    room is invited again at most once per notice (decision 8, bounded).
    A recipient cannot yet refuse an owner: any account with release keys can
    name them, within the bounds above, and the only way out is to delete
    the account, since release keys cannot be unpublished (identities
    record, decision 16). A refusal that the notifier and the release read
    honour is PR 4's or later; `KNOWN_LIMITATIONS.md` says so meanwhile.
20. (Part 2, after its review.) The removal after 365 days is not extended to
    fired legacy switches: their payload is served to the people they named
    with no removal date, as the design's "existing switches stay as they
    are" has it, and the deletion screen and `KNOWN_LIMITATIONS.md` now say
    so (P3b-M2). Extend it to them, or not.
21. (Part 2, after its review.) Arming is refused with `sweep_off` where the
    API's own `BLACKOUT_DEADMAN_SWEEP` is `0`, since the API cannot know that
    a sweep runs anywhere else; a deployment that runs the loops in a separate
    worker leaves the variable unset on the API (P3b-L4).
22. (Part 2, after its review.) `release_id_taken` stays an existence answer
    for any switch's id (P3b-L7): the ids are unguessable, rows are
    permanent, and the only ways to know an id are to own the switch or to
    have been told it after the trigger.
23. (Part 2, after its review.) The export of an account includes the notice
    rows about it, for fired switches only (P3b-L8).
24. (Part 2, after its review's round 2.) The rows of a cancelled release
    switch (the switch row with whom it named, the label and timing, and one
    blanked copy row per account with the fingerprint of the key it was
    sealed to) are never deleted, as no dead-man row is; at the arming rate
    that is up to 10 switch rows and 650 copy rows a day per account, for
    good. Keep them, as the record of what was armed, or let a cancelled
    release switch's rows be deleted after some time.
25. (Part 2, after its review's round 3.) The notices room carries an alias,
    an HMAC of the person's Matrix id under a key derived from
    `JWT_SECRET_PRIMARY`, so that a create the homeserver finished after the
    notifier's 30 s, or one another process made, is found rather than made
    again (§11). What it costs: the person sees the alias as the room's
    address; a rotation of `JWT_SECRET_PRIMARY` changes every alias (a room
    already made is still found through the rows, but a create that timed
    out across the rotation is not found and another is made); and where the
    homeserver refuses the alias (an alias policy, an appservice's
    namespace), the alias names a room that is gone or not the bot's, or it
    names a room the homeserver abandoned after writing the alias (decision
    26), the room is made without it, and a slow homeserver can then leave
    an extra, empty room again. Keep this key, give the alias a secret of its
    own that is never rotated with the JWT secret, or drop the alias and
    accept the extra rooms a slow homeserver leaves.
26. (Part 2, after its review's round 4.) A room found through the person's
    alias that is not yet the whole room the create makes, with the bot in it
    (no `m.room.create`; or the bot's, without the bot's join or without
    power levels that keep the person from posting and inviting: round 5) is
    waited for one backoff, timed from when the first look was recorded (30
    s at the least, longer if the first look came after earlier retries;
    round 5: it was timed from the start of the tick that looked, so after a
    long tick the wait could be seconds, which this decision did not say),
    and is then taken for a create the homeserver abandoned part way, which
    never completes, and the room is made without the alias (§11); a room
    the bot made and has since left is replaced the same way. What it costs:
    a homeserver merely slower than that leaves the person an extra room once
    its create completes; and the
    abandoned alias stays taken in the homeserver's directory until an admin
    removes it, so a later room for that person (after a purge) waits one
    backoff again and has no alias. Confirm the wait, choose a longer one
    (fewer extra rooms from a slow homeserver, later notices after an
    abandoned create; it would need a timestamp on the notice row), or have
    the bot delete an alias whose room it found incomplete twice (it created
    the alias, and its admin token may) so that a later create is covered by
    the alias again, at the cost of one more homeserver call that can fail.
27. (Part 2, after its review's round 7; changed in round 8; its costs
    completed in round 9.) The account
    deletion route revokes the deleting session's token first (only that
    token: the account's other access tokens are not revoked there), then
    waits, with no bound, until every write the API process had queued, the
    deletion's own among them, has been attempted in Postgres (a write that
    fails twice is dropped and logged, as everywhere in Postgres mode), and
    then waits at most 10 s (`ACCOUNT_DELETION_FINISH_TIMEOUT_MS`) for the
    deletion's last statement in the database (`finishAccountDeletion`); past
    that it logs `account_deletion_finish_timeout` and answers, and the
    statement goes on with nobody waiting for it, landing when it can. What
    it costs: a database that never hands the API process a connection, or a
    query that never answers once connected (a lock wait, a connection the
    network dropped after it was made), holds the answer for good from the
    API's side, with the session's token already revoked: the pool is given
    neither a connection timeout nor a statement timeout
    (`config/postgres.ts`), and a connection timeout alone would not end the
    second case (a statement or query timeout would). In front of a reverse
    proxy the request ends at the proxy's read timeout instead, where it has
    one: the app calls the API same-origin, through the site configs'
    `location /v1/`, which sets `proxy_read_timeout 1h` in both nginx site
    configs (`infra/nginx/sites-available/theblackout.app.conf` and the
    single-server baseline's), over the shared snippet's 300 s; production's
    Caddy (`deploy/docker/production/Caddyfile`, `reverse_proxy app:3000`)
    sets no read timeout at all (round 10 of the review: this said 300 s), so
    a stalled deletion holds the screen for up to an hour behind nginx, and
    behind Caddy until the browser gives up, and the deletion screen then says the deletion
    may not have finished (round 9: it said "Deletion failed"), although the
    API process has already deleted the account in its mirror, revoked the
    token and queued the deletion's writes: they land when the database
    answers, and if the process stops first the deletion is lost: the
    account is still in Postgres, and every process has it again after a
    restart (round 9 of the review; round 7's bound had kept the answer from
    waiting on this, and round 8 brought the wait back). And until the
    deletion's writes have been attempted, which the answer waits for, the
    worker can still make
    the person a room, invite them and send them a notice (round 8: inside
    the bound, the route could answer while Postgres still held the copies
    and the pending rows, and the worker did all three after the answer).
    Past the 10 s, a deletion is answered before its last statement has run,
    so, until it does, a notice row the API process had not seen that the
    worker had already sent keeps its room in Postgres, as when the
    statement fails; one still pending the worker ends itself at its next
    read, since the copy is blank there by the answer, unless that write was
    dropped, in which case the worker can still make a room, invite and send
    until the last statement has run. Confirm the two waits,
    choose another bound for the last statement, bound the first wait too
    (round 7's behaviour, with the cost above), or give the pool a
    connection timeout and a statement timeout so that a stalled first wait
    ends in dropped writes, logged, rather than no answer.
28. (Part 2, after its review's round 7. **Confirmed by the operator on
    2026-10-31.**) A notice whose copy the
    notifier's process holds in its mirror and Postgres does not (its write
    failed twice and was dropped, `db_write_behind_failed`) ends `failed`
    with `copy_unavailable`, unsent (with the notifier in a worker of its
    own, the worker never had the copy and writes no notice for that
    person). The alternative is to send it from the mirror (the behaviour
    before round 6 on one process), which points the person at a release
    that process serves until it restarts and nothing serves after. The
    operator confirmed ending it unsent.
29. (Part 2, after its review's round 8.) The held cap keeps the names part 1
    shipped on `develop`: `DeadmanLimits.maxLiveReleaseSwitches` in
    `GET /v1/deadman/limits`, `DEADMAN_MAX_LIVE_RELEASE_SWITCHES` and
    `DEADMAN_RELEASE_ERRORS.liveLimit` (wire value `release_switch_limit`),
    although since P3b-H1 it counts every release switch whose content is
    still held, fired ones until their removal, not only live ones; their
    docstrings say so. Part 2 had renamed all three to "held", a contract
    change for anything built on `develop`, which nothing in the tree uses.
    Confirm the old names, or rename them in a change of their own that
    exports both names for a release and says so in the protocol's notes.
30. (Part 2, after its review's round 10.) The owner's account deletion
    writes each of their switches from the deleting process's mirror,
    unconditionally (`eraseDeadmanSwitch`, a full-row write; the copies are
    blanked the same way), so where the API runs as more than one process a
    deletion that reaches a process which has not yet heard of a trigger
    another process committed cancels that release and removes its content
    and copies, although it fired; the people named may already have been
    sent their notice, and one not yet sent ends unsent (`copy_unavailable`
    or `release_unavailable`). Round 10 made the check-in, the cancel and
    the sweep's moves conditional in Postgres; the deletion was left as it
    was, and §15, `KNOWN_LIMITATIONS.md`, the deletion screen, the changelog
    and the threat model's row now state it. Confirm it (the deletion and
    the trigger at the same moment, the owner present to delete, and either
    order defensible), or have the deletion's erase and its copy blanking
    conditional on the switch not having fired in Postgres (erase as fired
    when it has, keeping the copies), at the cost of the deletion awaiting a
    statement per switch, as the check-in now does.
31. (Part 2, after its review's round 11.) A database that does not answer a
    process's switch statements is treated by the sweep in that process as
    an outage of its own: a switch due while they stood, or whose owner's
    check-in or cancel that process refused unanswered meanwhile, gets the
    backlog window instead of firing (§15). The stall and the refusal are
    known to that process alone. In `deploy/docker/production` the API
    process refuses the check-ins and the worker runs the sweep, so a
    check-in refused on the API during a database outage that the worker's
    own statements did not meet (no switch of its own was due then) does not
    hold the switch back, and it fires at its deadline if the database
    answers within the tolerance. Confirm it (the outage must coincide with
    both the owner's check-in and no due switch of the worker's, and the
    owner can check in again once the database answers), or have the API
    process carry the refused attempt into Postgres once the database
    answers (a column on the switch, written then, which the sweep reads), at
    the cost of a write per refusal and a migration.

## Not verified here

-   That GitGuardian's check on this branch's pull request flags only the
    synthetic values §12 lists, and that ignoring those incidents turns it
    green: the check runs only on a pull request, which this work does not
    open.
-   Everything about the homeserver is read in the fork's code, not run:
    `is_direct` on a `createRoom` invite (`synapse/handlers/room.py`) and on
    a membership set through the state endpoint
    (`synapse/rest/client/room.py`), that an `m.text` in a two-member room
    notifies and an invite notifies, and how long transaction ids are kept.
-   WebCrypto X25519 and Ed25519 and the small-order behaviour on engines
    other than Node's; ML-KEM only through `@noble/post-quantum`.
-   The security arguments in §2 and §4 are from the cited analyses, read,
    not re-proved; the construction has had no external review beyond the
    independent review below, which rebuilt the vectors and read the
    construction against this record, and did not re-prove the arguments
    either.

## Independent review, 2026-10-29

An independent review read part 1 of PR 3 (`git diff origin/develop...HEAD`
at `7fcb107e3e`, seven commits and a develop merge), rebuilt every pinned
vector value from this record's stated inputs with `node:crypto` and noble's
ML-KEM rather than the package's functions, ran the three test files one at a
time, and ran probes against the protocol function and the SDK with a fake
server. It reported one high finding, three medium, six low, and twelve
sentences in this record, the identities record and the code that were not
true of the code as it stood. Its verdict, as written:

> The cryptography is what the record says it is: I rebuilt every pinned
> vector value (transcript, both shared secrets, wrap key, wrapped K, sealed
> copy, signed bytes and their hash, the Ed25519 signature, the content
> ciphertext, its hash, the commitment and the associated data) from the
> stated byte-range inputs with `node:crypto` and noble's ML-KEM, not with
> the package's functions, and all 51 checks matched; the byte orders match
> §2, §3, §5 and §6; the HKDF salt/info/IKM order is as written; the all-zero
> X25519 output is refused on both sides inside the one shared function; the
> commitment is inside what the owner signs and is checked before any content
> is decrypted; a copy moved to another release, recipient or signer, or
> re-signed by a third party, fails as the record says, and I found no way
> for a server or a recipient to change the message or K. The one High
> finding is not in the sealing but around it: **re-sealing is not bound to
> the switch being re-sealed.** `resealReleaseCopy` opens whatever header
> and own copy it is handed, and the SDK's `resealRecipient(switchId, …)`
> never checks that what the server returned for `switchId` is that release.
> A hostile server that answers `GET /switches/A` with release B's header and
> B's own copy gets the owner's device to seal B's content key to a person
> named only on A, under a valid owner signature; I ran this against the SDK
> with a fake server and the recipient opened B. This contradicts the
> record's §10 ("it cannot … make one recipient's copy open for anyone
> else"), the code comment "a server cannot make the owner re-seal another
> key", and the design's "only the named recipients can read it". The fix is
> a one-line binding plus a test. Below it are three Mediums that are about
> what PR 4 will be able to say truthfully (the signer-is-the-compared-key
> check exists nowhere in part 1; the SDK hands PR 4 the server's unsigned
> duplicates of the signed header fields; the H1 "seen since" clause has no
> feed from the SDK's own directory reads), some Lows, and a short list of
> sentences that are not true of the code as it stands. The 101 + 41 + 12
> tests I ran pass, reach the source (the package's `exports` point at
> `src/index.ts`), and do what their names say.

Each finding was then fixed or explained as below, on this branch, in the
commits after `f55bfe3aa4`. Tests named here run in the client's Vitest suite
(`apps/blackout-client/tests/unit/sdk/`); every new check was taken out once,
the one test file that pins it run, and the source restored (a scratch
script outside the repository; the table is under "Every new check removed
once" below), and each time at least one test failed. The design document is
edited by part 2, not here.

### High

**P3-H1. Re-sealing was not bound to the switch being re-sealed.**
`resealReleaseCopy` checked that the header parsed, that the copy was the
owner's own under the header's owner, that the key set was sound, that the
copy's signature verified under the owner's own identity and that K matched
the commitment; it never checked that the header was the release the owner
asked to re-seal, and `resealRecipient` used `owned.release.header` and
`owned.release.ownCopy` without comparing `owned.switchId` or the header's
`releaseId` with `switchId`. Nothing the owner signs names a release's
recipients (E7, by design), so nothing on the device could tell that the
person it was sealing to was never on that release, and the owner's
signature on the copy is transferable evidence (C15) that the owner sealed B
to them.

-   **Done.** `ResealReleaseCopyInput` has a required `releaseId`, the switch
    the owner is acting on; `resealReleaseCopy` refuses
    (`ReleaseEnvelopeError`, `release_mismatch`) unless the parsed header's
    release id is that one, right after the header parses and before the
    own copy is parsed, any signature is checked or anything is opened. The
    release id is in the owner's own signature and in every transcript, so
    a server cannot forge a header for A that carries B's content.
    `resealRecipient` passes `switchId` through and refuses
    (`ReleaseActionError`, `release_mismatch`) when the owner view's
    `switchId`, or its header's `releaseId`, is not `switchId`, or its
    header is not an object at all, before the directory is read, anything
    is signed or the copy is sent (the owner's view is read first: that one
    `GET` is what is being checked).
    `armReleaseSwitch` returns, next to the armed event, the release id and
    `sealedTo` (each copy's account id and fingerprint, the owner's own
    first) from the envelope it built, so a client can keep its own record
    of each release's recipients from a source it made, rather than from the
    owner's view, which is the server's word. §8 and §10 say so; the comment
    at `resealReleaseCopy` says what is bound and what is not.
-   **Tests.** `releaseEnvelope.test.ts`: "re-sealing is bound to the switch:
    another release's header and own copy are refused before any signature
    is checked or anything is opened, and the same inputs under the right id
    are verified, opened and re-sealed (P3-H1)": two envelopes from one
    owner, A to Bob and B to Carol; B's header and own copy with A's id are
    refused with WebCrypto's `verify` and `decrypt` spied and never called;
    with B's own id, under the same spies, the same inputs re-seal B, both
    spies are called (so they are known to bind; the fifth reading) and Bob
    reads B. `releaseEnvelopeActions.test.ts`: "refuses, before reading the
    directory or signing, an owner view that is another release's (P3-H1)":
    a fake API answering `GET /switches/A` with B's release, as the review's
    probe did, gives `ReleaseActionError` `release_mismatch`, no copy is
    sent (no `POST`) and only the switch was read (two `GET`s, one per call;
    the test's `sent()` counts `POST`s); another switch's id with A's own
    release is refused; the honest view of A re-seals A. "refuses, with
    release_mismatch and not a TypeError, an owner view whose header is not
    an object, or whose ids are not the switch's (the fifth reading)": a
    header that is `null` or a string, a header whose release id is a number
    and a view with no switch id each give `ReleaseActionError`
    `release_mismatch`, no `POST` and one `GET`; the honest view re-seals.
    The arming test checks `sealedTo` and that the release id returned is
    the envelope's, not the one the server answered with.
-   **Still open.** The device-side record and the refusal to re-seal a
    release to an account not on it are PR 4's (below); the fourth reading
    replayed the two moves the binding does not close, and "Still open"
    says what that record must be keyed by.

### Medium

**P3-M1. The check "this release was signed by the key I compared" existed
nowhere, and the SDK's instructions pointed PR 4 at a function that did not
make it.** `releaseComparisonState` answered whether a comparison still
counted for an account; it never took the fingerprint that signed the
release in hand. A server holding a key of its own that names the owner's
account (the identities record's H1: PR 2 cannot stop a key the server
itself puts in the directory) could sign a release with it while serving the
compared key as current, and a screen following the `listReleases` doc would
have said "signed with Alice's release key, which you compared".

-   **Done.** `ReleaseComparisonStateInput` takes `signerFingerprint`, the
    `ownerFingerprint` an `openReleaseCopy` result carries; when given and
    not the compared fingerprint the state is the new `other_key`, decided
    before any other rule once there is a comparison (with none the state
    is `none`, whatever signed the release), so `current` now means both
    that the signer is the key compared and that the comparison counts. The
    `listReleases` doc, §8 and §9 name `releaseComparisonState` as the one
    function that decides, and what to pass it: the `ok` result's
    `ownerFingerprint`, a string. The field is required (the fourth reading,
    below; the third had left it optional): `null`, written out, is the
    sealing use, where no release is in hand and the signer rule is not
    applied, and anything else that is not the compared fingerprint is
    `other_key`, so a caller judging a release cannot leave the field out,
    or forward a failed open's absent signer through a cast, and get
    `current`.
-   **Test.** `releaseEnvelope.test.ts`: "is other_key when the release in
    hand was signed by a key that is not the one compared (P3-M1)": the
    compared key signing, `current`; another key, served as current or not,
    `other_key`; another key with a stale comparison, `other_key`; the
    compared key with a stale comparison, `stale`; no comparison, `none`.
    "takes the sealing use only as an explicit null: a signer left out is
    other_key, not current (the fourth reading)": `undefined` forced through
    a cast, and the empty string, are `other_key`; `null` is the sealing use.

**P3-M2. `listReleases` handed PR 4 the server's unsigned duplicates of
signed header fields, and `openReleaseCopy` did not return the signed
ones.** `DeadmanReleasedCopy` has `releaseId` and `ownerAccountId` next to
`header.releaseId` and `header.ownerAccountId`; a screen reading the
top-level one, the field that sits next to `releasedAt`, would have named
whoever the server put there under a header whose signature verifies.

-   **Done.** `ReleaseOpenResult` carries `releaseId` and `ownerAccountId`
    from the parsed header, so a screen has no reason to read anything
    else. `listReleases` refuses (`ReleaseActionError`, `server_mismatch`)
    an answer that is not a list, an entry that is not an object whose
    `header` is an object carrying a string `releaseId` and a string
    `ownerAccountId`, and an entry whose top-level `releaseId` or
    `ownerAccountId` is not its header's (the first version of this check
    compared the two with `!==` alone, so two absent ids agreed and `null`,
    `{}` and an entry with no ids anywhere came back as releases; the second
    reading, below, caught it), and whose two ids are of their forms,
    `RELEASE_ID_PATTERN` and `RELEASE_ACCOUNT_ID_PATTERN` (two ids that
    agree but read `../x` or `<script>` are not ids a client may key or
    route by; the third reading caught that). The wire type is unchanged,
    since the API half is built against it; §6 says only the header's
    fields are to be shown, and that `releasedAt` and `removesAt` stay the
    server's word.
-   **Tests.** `releaseEnvelope.test.ts`: "Bob opens his copy, and Alice
    opens her own" asserts the whole result, the two fields included.
    `releaseEnvelopeActions.test.ts`: "refuses a released copy whose
    unsigned release id or owner differ from its header's (P3-M2)": the
    honest entry comes back as it was; another owner at the top level,
    another release id, an entry with no header and an answer that is not a
    list are refused; so are `null`, `{}`, a string, a number, an array, an
    entry whose header is `{}` or has undefined ids, one with neither header
    nor ids, one whose header has no ids beside no top-level ids, one whose
    header is an array, and one whose id is a number on both sides. "refuses
    a released entry whose ids agree but are not of the id forms (the third
    reading of P3-M2)": `../x`, an uppercase UUID and the id with a trailing
    newline as the release id, and `<script>`, an empty string and the
    account id with a trailing space as the owner, each the same on both
    sides, are refused; the honest entry still comes back as it was.

**P3-M3. The H1 "seen since comparing" clause had no feed from the SDK's
own directory reads, which are the reads that decide what is sealed.** The
SDK read the directory for the owner and every recipient, computed the
served fingerprints and discarded them: a `stale` refusal did not say which
key it saw, so a device could not record it, and a server that served a
newer key once and then put the compared one back found
`seenSinceComparison` empty.

-   **Done.** `ReleaseActionError.servedFingerprint` carries, on
    `recipient_comparison` and `owner_key_not_current`, the fingerprint of
    the identity the directory served as that account's current one,
    computed from the served identity (null when it served none that
    verified), next to `accountId`; a successful arming returns `sealedTo`
    (P3-H1). §9 says where the third clause is fed from.
-   **Test.** `releaseEnvelopeActions.test.ts`, the refusal cases: a
    directory serving Bob's new key gives `servedFingerprint` equal to that
    key's computed fingerprint and not the string the entry states; another
    key of the owner's served as current gives that key's; an identity of
    another account served as the owner's gives null; a recipient never
    compared with still reports the key served.

### Low

-   **P3-L1. The HKDF `info` framing has no separator between the dead-drop
    label and the transcript, and that label is not terminated.** No format
    change: a dead drop has no transcript and every release transcript
    starts with its own terminated label, so the two `info` values cannot
    meet today. The constraint on later work is written down in §3, in
    `deaddrop-pq-hybrid.md` and in `pqHybrid.ts`: a dead-drop transcript,
    when one is added, starts with its own NUL-terminated label that is none
    of the eight, or the derivation moves to a v3 label with a terminator
    and a length prefix. The `pqHybrid.ts` comments no longer say
    `transcript_hash` (claim 9). No test now; the labels test takes the
    dead-drop label when that work lands.
-   **P3-L2. `resealReleaseCopy` never decrypted the content**, so it made
    every check a recipient makes but that one. What the check closes is
    narrower than the first version of this entry said (the third reading,
    below): a ciphertext a server changes in storage was refused already,
    since the owner's own copy's signature covers SHA-256(nonce ‖
    ciphertext) and `unwrapCopy` checks it before the wrap, the commitment
    and the content, and a server cannot re-sign (a probe that flips one
    byte of the stored ciphertext is refused with `own_copy` "(signature)";
    the content check never sees it). The content check refuses a release
    the owner's own key signed over content that does not open or unpad
    under K, which takes a client bug or whoever holds the owner's key, so
    the device does not re-seal, as readable, something made unreadable.
    Done: after the commitment check it decrypts the content with K and
    refuses (`own_copy`, "(content)") if the decryption, the padding or the
    UTF-8 fails; §14's "every one of those checks" is true now. Test,
    `releaseEnvelope.test.ts`:
    "re-sealing refuses the owner's own copy of a release whose content K
    does not open (P3-L2)": the owner's own copy, re-signed by the owner over
    a content ciphertext under K with broken padding, is refused; the same
    with readable content re-seals and the recipient reads it.
-   **P3-L3. The record said K was zeroed; copies of K were not.** Done,
    best effort: the commitment's input buffer after the digest; both shared
    secrets, the concatenation of them the KDF is fed
    (`deriveHybridAeadKey`; the first fix cleared the two inputs and left
    this copy, the second reading caught it) and the wrap key's bytes once
    WebCrypto has imported the key (in the shared sealing function, when
    sealing and when opening; since the fourth reading the two secrets are
    cleared in a `finally`, so on the refusal paths too, where before an
    all-zero X25519 output, a bad nonce or a failed decapsulation left the
    other secret as it was); the message's UTF-8 bytes, a copy
    `encodeReleaseMessage` makes and `pad` copies again (the third reading
    found it uncleared and unnamed; the fourth found the copy made of a
    message over the cap dropped uncleared on that refusal, and it is
    cleared before the refusal now), and the padded plaintext after
    encryption; and, after decryption, the padded bytes and the unpadded copy
    (`decryptReleaseContent`, also from the second reading, since the P3-L2
    check now decrypts the content on the owner's device when re-sealing)
    are filled with zeros. The decrypted text is a string, which nothing can
    clear, on the recipient's device or on the owner's during that check:
    that is the trade P3-L2 makes. JavaScript gives no guarantee about what
    an engine has copied, and the record and the code say "best effort". No
    test of memory would be honest; the
    pq-hybrid test's independent rebuild copies the ML-KEM secret before
    sealing, because the seal now clears it, and says so, and the seal's
    two refusal tests (an all-zero X25519 output, a bad nonce) assert that
    the secret they passed in is zeros afterwards, which checks the `fill`,
    not what an engine kept.
-   **P3-L4. `parseDeadmanNoticePointer` took any string of up to 64
    characters as a release id**, from an unencrypted room the homeserver
    controls. Done: it applies `RELEASE_ID_PATTERN`. Test,
    `deadmanReleaseContracts.test.ts`: "points only with a string of the
    release id's form (P3-L4)": `../x`, an uppercase UUID, `r-1`, a
    version-1 UUID, an unhyphenated one and one with a trailing newline are
    all null.
-   **P3-L5. A copy's base64 was decoded before its length was checked**, so
    a hostile server could make `openReleaseCopy` decode a very long string
    before refusing it. Done: `decodeCanonicalBase64`, given a length,
    refuses before decoding a string whose length is not that of the base64
    of that many bytes (4 × ⌈length / 3⌉). Test, `releaseEnvelope.test.ts`:
    "a copy's base64 is measured before it is decoded (P3-L5)": a 10 MB
    `sealedKey` is refused with `fromBase64` spied and never called, and a
    copy of the right length is decoded, so the spy is known to bind.
-   **P3-L6. Record and comment inconsistencies.** Each is in the list below.

### Claims that were not true, and what they say now

1.  `envelope.ts`, the comment at `resealReleaseCopy`: "K comes from the
    owner's own copy, opened … after every check a recipient makes …, so a
    server cannot make the owner re-seal another key." True of another key;
    not of another release (P3-H1), and the content was not among the
    checks (P3-L2). It now says the header must carry the release id of the
    switch the owner is acting on and why, that every check a recipient
    makes is made, the content's included, and that nothing on the device
    says who was named on a release.
2.  §10, "It cannot … make one recipient's copy open for anyone else, or
    move a copy to another release, recipient or signer", and the design's
    "only the named recipients can read it": it could not move a copy, but
    it could have the owner's device mint one for a person not named on
    that release. §10 now lists that, with the binding that closes it and
    what stays open. The design's two sentences (its §3 table cell and the
    §4(a) verdict) are part 2's to qualify, and "Still open" says so.
3.  §14, "`resealReleaseCopy`, which opens the owner's own copy with every
    one of those checks": every check up to K; not the content. True now
    (P3-L2), and the sentence also names the release-id check.
4.  §14, "`buildReleaseEnvelope` (… K zeroed afterwards)": the `contentKey`
    buffer was; the commitment's copy of K, the wrap keys and the shared
    secrets were not. It now says what is cleared, and "best effort".
5.  §14, "refuse (`ReleaseActionError`) before sending anything", and the
    SDK test's header "refuses, before anything is sent": the directory
    reads for the owner and every recipient are sent first, and tell the
    server whom the owner is about to name. Both now say "before sending
    the envelope or the copy; the directory is read first" (C14 covers the
    disclosure).
6.  The result paragraph and E15, "R12 in `THREAT_MODEL.md`": there is no
    R12 in `THREAT_MODEL.md` on this branch (R11 is now the voice-token
    risk). Both now say "R12, which part 2 adds to `THREAT_MODEL.md`". The
    design's §8 still says PR 3 adds "R11"; part 2 edits the design.
7.  §8's last sentence and the SDK's `listReleases` doc, "judge its owner's
    key with `releaseComparisonState` before saying who sent it": that
    function did not look at which key signed the release. Both now say to
    pass the signer's fingerprint, that `current` needs both, and that this
    one call decides (P3-M1).
8.  Identities record §5 item 4, "PR 3 should sign one release header
    (release id, owner, ciphertext hash, key commitment) that every
    recipient receives alike": PR 3 signs the header's fields inside each
    copy's signature instead (E7, decision 5). The item now carries a note
    saying so and pointing at §4 here.
9.  `pqHybrid.ts`, "`info = "blackout-deaddrop-v2-hybrid" || transcript_hash`"
    and "Optional transcript hash binding more context": the transcript is
    appended raw, and a release transcript is 203 bytes of structured
    fields. Both say so now, with the P3-L1 constraint beside them.
10. `events.ts`, "Switches armed before 2026-10-26 are in the `legacy`
    format": the date was this record's. It now says before the release
    migration (PR 3, part 2), and that arming in that format has been
    closed since PR 1.
11. §14, E17, "one key set with about 45 comparisons": the review measured
    34 with a 45-character Matrix id and about 37 with a short one. Now
    "about 35", with the measurement.
12. §3, "Each ends in 0x00, so none is a prefix of another": true of the
    eight labels; the HKDF framing label `blackout-deaddrop-v2-hybrid`, which
    precedes `T`, is not terminated and was not in the table. §3 now says so
    (P3-L1).

### Every new check removed once

Each row: the check taken out, the one test file run against the mutated
source, and what failed (the files now pass 108, 17, 5 and 36; the rows
from the first four readings give each file's count at their time: 105 or
108, 14 to 16, 36). All twenty-four were caught (twelve from the review's
fixes, two from the second reading's, two from the third's, six from the
fourth's, two from the fifth's, one of them a guard inside P3-H1's check
that the runs before had never taken out alone); the sources were restored
and checked unchanged after the run (the diff for the first two readings, a
byte-for-byte comparison since).

| Check removed                                                                                     | Test file                         | Result                                                         |
| ------------------------------------------------------------------------------------------------- | --------------------------------- | -------------------------------------------------------------- |
| P3-H1, `resealReleaseCopy`: the `release_mismatch` check                                          | `releaseEnvelope.test.ts`         | 1 failed, 104 passed: the switch binding                       |
| P3-H1, `resealRecipient`: the switch id and header check                                          | `releaseEnvelopeActions.test.ts`  | 1 failed, 13 passed: the swapped view                          |
| P3-H1, `armReleaseSwitch`: `sealedTo` returned empty                                              | `releaseEnvelopeActions.test.ts`  | 1 failed, 13 passed: what arming sends                         |
| P3-M1, `releaseComparisonState`: the `other_key` branch                                           | `releaseEnvelope.test.ts`         | 1 failed, 104 passed: the signer case                          |
| P3-M2, `openReleaseCopy`: the header's ids in the result                                          | `releaseEnvelope.test.ts`         | 2 failed, 103 passed: Bob opens; P3-H1                         |
| P3-M2, `listReleases`: the comparison with the header                                             | `releaseEnvelopeActions.test.ts`  | 1 failed, 13 passed: the release list                          |
| P3-M3, the recipient refusal's `servedFingerprint`                                                | `releaseEnvelopeActions.test.ts`  | 2 failed, 12 passed: never compared; stale                     |
| P3-M3, the owner refusal's `servedFingerprint`                                                    | `releaseEnvelopeActions.test.ts`  | 1 failed, 13 passed: the owner's key                           |
| P3-L2, `resealReleaseCopy`: the content decryption                                                | `releaseEnvelope.test.ts`         | 1 failed, 104 passed: content K does not open                  |
| P3-L3, the seal's clearing of the ML-KEM secret (no test was asked)                               | `deaddropPqHybrid.test.ts`        | 1 failed, 35 passed: the rebuild's note                        |
| P3-L4, `parseDeadmanNoticePointer`: the pattern (old length check back)                           | `deadmanReleaseContracts.test.ts` | 1 failed, 4 passed: the id's form                              |
| P3-L5, `decodeCanonicalBase64`: the length check before decoding                                  | `releaseEnvelope.test.ts`         | 1 failed, 104 passed: the 10 MB copy                           |
| Second reading, `listReleases`: the entry's shape (round 1's `!==` alone put back)                | `releaseEnvelopeActions.test.ts`  | 1 failed, 13 passed: `null` came back as a release             |
| Second reading, `listReleases`: the string requirement on the header's ids alone                  | `releaseEnvelopeActions.test.ts`  | 1 failed, 13 passed: a header with no ids came back            |
| Third reading, `listReleases`: the release id's form (`RELEASE_ID_PATTERN`)                       | `releaseEnvelopeActions.test.ts`  | 1 failed, 14 passed: `../x` came back as a release             |
| Third reading, `listReleases`: the owner's account id's form                                      | `releaseEnvelopeActions.test.ts`  | 1 failed, 14 passed: `<script>` came back as owner             |
| Fourth reading, `releaseComparisonState`: `undefined` taken as the sealing marker too (`!= null`) | `releaseEnvelope.test.ts`         | 1 failed, 107 passed: a signer left out was `current`          |
| Fourth reading, `releaseDirectoryFingerprints`: the entry-is-an-object check                      | `releaseEnvelope.test.ts`         | 1 failed, 107 passed: `null` threw a `TypeError`               |
| Fourth reading, `releaseDirectoryFingerprints`: the `superseded`-is-an-array check                | `releaseEnvelope.test.ts`         | 1 failed, 107 passed: `undefined` threw a `TypeError`          |
| Fourth reading, `checkOwnerKey`: the owner entry's shape                                          | `releaseEnvelopeActions.test.ts`  | 1 failed, 15 passed: `null` threw a `TypeError`                |
| Fourth reading, `releaseDirectoryFingerprints`: the cap on replaced identities                    | `releaseEnvelope.test.ts`         | 1 failed, 107 passed: 1,001 identities were verified           |
| Fourth reading, `hybridSealWith`: the secrets cleared only once a key was derived (the old form)  | `deaddropPqHybrid.test.ts`        | 2 failed, 34 passed: the zero refusal; the bad nonce           |
| Fifth reading, `resealRecipient`: the header-is-an-object guard alone, the rest of the check kept | `releaseEnvelopeActions.test.ts`  | 1 failed, 16 passed: a `null` header threw a `TypeError`       |
| Fifth reading, `releaseDirectoryFingerprints`: the current identity not counted toward the cap    | `releaseEnvelope.test.ts`         | 1 failed, 107 passed: 1,000 beside a current one were verified |

### Second reading of the fixes, 2026-10-29

The fixes above were then read again, independently, against the code and
against this record, with probes of the SDK (`{ releases: [null] }` and its
kin against `listReleases`) and a read of every buffer the clearing touches.
Seven reports came back, about five things; each is fixed or reworded here,
and the two new checks are in the table above.

1.  **`listReleases` accepted entries that were not entries** (reported
    twice: as a replay of the server attack, and as a gap in the fix). The
    check compared the header's ids with the entry's using `!==` alone, so
    two absent ids agreed: `{ releases: [null] }`, `[{}]`, `['x']`, `[42]`,
    `[{ header: {} }]` and an entry with no ids on either side were
    returned as a `DeadmanReleasesResponse` the SDK had vouched for. Nothing
    false could be shown from them (`openReleaseCopy` refuses each with
    `shape`, and §6 allows only its result to be shown), so robustness
    rather than a hole; but a new check with a hole in it. An entry must now
    be an object whose `header` is an object with both ids as strings,
    repeated at the top level; the P3-M2 test lists each of those
    non-entries as refused.
2.  **The concatenation of both shared secrets was never cleared** (reported
    twice: as a gap in P3-L3's fix, and as a claim that `hybridSeal.ts`,
    §14 and P3-L3 above made, true of the two inputs and not of the 64-byte
    copy `deriveHybridAeadKey` made of them for the KDF, a copy the code
    made, not an engine). `ikm` is filled with zeros once the KDF has run,
    and the three sentences name the concatenation.
3.  **The P3-L2 check left the plaintext uncleared on the owner's device.**
    Re-sealing now decrypts the whole message, into a padded buffer, an
    unpadded copy and a string, and dropped all three as they were, where
    before P3-L2 the plaintext never existed on the owner's device during a
    re-seal. `decryptReleaseContent` clears both buffers on every path; the
    string cannot be cleared, and P3-L3 above and §14 say so.
4.  **§10's "It can" list still said, unqualified, "Only the named
    recipients can read it"**, two bullets above the admission that a server
    can have the device re-seal a release to a person it never named until
    PR 4 keeps the device-side record (the review's claim 2 named this
    sentence; the first fix added the "It cannot" bullet and left this one).
    It is qualified now.
5.  **Two descriptions overstated what the code does.** P3-H1's "Done" said
    `resealRecipient` refuses "before … anything is sent", and the SDK
    test's comment said "Nothing may be signed or sent", while the `GET` of
    the owner's view is sent first and the test's `sent()` counts `POST`s
    only: the same word claim 5 corrected for arming. Both now say the copy
    is not sent and the view is read first. And the `other_key` rule was
    described as decided "before any other rule" and "whatever the
    comparison's state", while with no comparison the function answers
    `none` first, as its own test pins; P3-M1 above, §9 and the comment in
    `comparison.ts` now say "once there is a comparison".

### Third reading of the fixes, 2026-10-29

The fixes and the second reading's were read a third time, independently,
with replays of the server's moves against the SDK and the protocol function
(`listReleases` fed ids that agree but are not ids; `releaseComparisonState`
fed a failed open's signer; `resealReleaseCopy` fed a ciphertext a server
changed) and a reading of this record against the code. Nine reports came
back; each is fixed or reworded here, and the two new checks are in the
table above.

1.  **`listReleases` accepted ids that agreed but were not ids.**
    `{ header: { releaseId: '../x' }, releaseId: '../x' }` and `<script>` as
    the owner's account on both sides passed `releasedEntryIsConsistent`,
    which checked that each id was a string equal to its duplicate and
    nothing else, and were returned to the caller. Not exploitable in part
    1: the SDK never puts an entry's id into a path (the only release route
    is `GET /v1/deadman/releases`), `openReleaseCopy` refuses such a header
    (`release_id`, `account_id`), and §6 allows only its result to be shown.
    But P3-L4's own reason, attacker-chosen bytes entering the client's
    release card, applies to these two fields the moment PR 4 keys or routes
    anything by an entry's id before opening it. Both ids must now match
    their forms (`RELEASE_ID_PATTERN`, `RELEASE_ACCOUNT_ID_PATTERN`); the
    P3-M2 test has a case for each, and each pattern was removed once.
2.  **`releaseComparisonState` skipped the signer rule when
    `signerFingerprint` was `undefined`.** That was the sealing use by
    design, where no release is in hand; but the same optional field was
    what the `listReleases` doc told PR 4 to pass when judging a release,
    and a caller that forwarded a failed open's (absent) `ownerFingerprint`
    would get `current` for a release signed by another key. In typed code
    the `ok: false` branch of `ReleaseOpenResult` has no `ownerFingerprint`,
    so that takes a cast, and a failed open has no text to show, so the
    exposure is a wrong status line on a caller bug. Kept as one function,
    as P3-M1 settled. This reading left the field optional, and had the
    field's doc in `comparison.ts`, the `listReleases` doc and P3-M1 above
    say that the signer is the `ok` result's `ownerFingerprint`, a string,
    that a failed open's state is never asked, and that leaving the field
    out, or `undefined`, was the sealing use. The fourth reading's item 1,
    below, reversed that last part: the field is required, `null` alone is
    the sealing use, and `undefined` is `other_key`; the three places say
    so now.
3.  **The design's sentence was left untrue with no pointer.** The review's
    claim 2 named this record's §10 and the design's §3 table cell and §4(a)
    verdict, "only the named recipients can read it"; §10 was qualified,
    the design was left to part 2 (the commit says so), and "Still open" did
    not say that an untrue sentence remained there or whose it was. It does
    now, and claim 2 above points at it.
4.  **P3-L2's stated threat was not what the content check closes.** This
    entry said the owner's device "would have re-sealed … a release whose
    content a server had corrupted in storage", and the comment at
    `resealReleaseCopy` attributed that outcome to the content check. Not
    so before or after the fix: the owner's own copy's signed bytes carry
    SHA-256(nonce ‖ ciphertext), `unwrapCopy` checks that signature before
    the wrap, the commitment and the new decryption, and a server cannot
    re-sign, so a changed ciphertext was always refused with `own_copy`
    "(signature)". A probe (one byte of the stored ciphertext flipped) shows
    the "(content)" refusal is never reached for a server-side change. What
    the check adds is a refusal for content the owner's own key signed that
    does not open or unpad under K, a client bug or the key's holder, which
    is what the test builds. P3-L2 above and both comments say so.
5.  **§10's "Bring it forward" bullet pointed at the wrong "It cannot"
    bullet.** It said "the last", which is the padded-size bullet; the
    re-sealing bullet is the fifth of six. It says "the bullet on
    re-sealing" now.
6.  **§14 and the table disagreed on the second reading's checks**, one
    against two. The table was right (two `listReleases` mutations); §14
    says two, and counts this reading's two.
7.  **"The table is at the end of this section" was not where the table
    is**: two subsections follow it. The sentence names the subsection.
8.  **P3-H1's "Tests" bullet still said "nothing is sent"** for the swapped
    view, the wording the second reading's item 5 corrected in the "Done"
    bullet and the test's comment; the `GET` of the owner's view is sent,
    twice, since the test calls re-seal twice, and `sent()` counts `POST`s.
    It now says no copy is sent and the switch was read twice.
9.  **P3-L3's inventory left out a copy the code itself makes.**
    `encodeReleaseMessage` returns `utf8Encode(text)`, a fresh buffer of the
    whole message; `pad` copies it into the padded buffer and returns only
    that; `encryptReleaseContentWith` cleared the padded buffer alone, and
    its comment presented the caller's string as the only uncleared
    plaintext. The encoded bytes are bound and filled with zeros in the same
    `finally`, and §14, P3-L3 and the comment name them. No test, as for the
    rest of P3-L3.

### Fourth reading of the fixes, 2026-10-29

The fixes and the three readings' were read a fourth time, independently,
in two passes: a replay of every attack the review and the readings named
against the fixed SDK and protocol functions (the re-seal confusion and its
variants, a forged signer, swapped ids, the served fingerprint and
`sealedTo`, the notice pointer, the base64 lengths, each with its check
removed once), and a reading of the fixes' quality and of this record's
claims against the code. Thirteen reports came back, about nine things.
Each is fixed on 2026-10-30, kept with its reason written down, or recorded
for PR 4, as below; the six new checks are in the table above.

1.  **`releaseComparisonState` returned `current` when `signerFingerprint`
    was left out or `undefined`** (reported as a replay note: a release
    screen that forgets the optional field reproduces P3-M1 for a
    server-forged identity). The two uses, sealing with no signer and
    judging a release with one, shared one function selected by the
    presence of an optional field, and only the doc told the judging caller
    to pass it; the one caller in part 1, the sealing use in
    `releaseActions.ts`, was correct, and typed code cannot reach a failed
    open's signer without a cast, so this was a hardening gap for PR 4, not
    a live defect. Fixed as suggested: the field is required, typed
    `string | null`; `null`, written out, is the sealing use (the SDK passes
    it), and anything else that is not the compared fingerprint, `undefined`
    through a cast included, is `other_key`. The one behaviour change is for
    `undefined`, which skipped the signer rule and fell through to the
    remaining ones, so the answer was whatever they gave (`current`, or
    `stale` when the comparison no longer counted), and is `other_key` now
    once there is a comparison; with none it is `none`, as before. Test:
    `releaseEnvelope.test.ts`, "takes the sealing use only as an explicit
    null". §9, P3-M1 above, `comparison.ts` and the `listReleases` doc say
    so.
2.  **A directory entry whose `superseded` was not iterable, or that was
    `null`, made `releaseDirectoryFingerprints` throw a raw `TypeError`**
    ("entry.superseded is not iterable", "Cannot read properties of null"),
    which the SDK passed on in place of the `ReleaseActionError` its
    contract promises; a string `superseded` was iterated character by
    character, each refused, and arming went on. Nothing was sent on any of
    these paths, so no confidentiality impact; the contract was not met and
    a screen would have got an untyped error. Fixed: the function takes the
    entry as `unknown`, and an entry that is not an object, is for another
    account or whose `superseded` is not an array counts as nothing, as does
    a `current` or a replaced item that is not an object; the SDK's
    `checkOwnerKey` likewise treats an answer that is not an entry as one
    that lists no identity. The verifier's probe, re-run, shows every shape
    refused with `recipient_comparison` and no `POST`. Tests:
    `releaseEnvelope.test.ts`, "a directory answer that is not an entry
    counts as nothing, and does not throw"; `releaseEnvelopeActions.test.ts`,
    "a directory answer that is not an entry, with the refusal the contract
    names and not a TypeError".
3.  **The client verified every `superseded` identity an entry listed, with
    no cap**: 1,000 cost 0.6 s here, 10,000 cost 6.2 s, and arming reads
    the directory once per recipient, up to 64, so one arming could be made
    to verify 64 × N identities before refusing; the same class as P3-L5.
    The API keeps at most `RELEASE_IDENTITY_STORAGE_LIMIT` (1,000)
    identities for one account in all, current and replaced, so an honest
    server never lists more than that as replaced. Fixed: an entry listing
    more than that many replaced identities counts as nothing, before any of
    them is verified; the probe's 10,000 now cost 0 ms. What remains is the
    bound itself: an honest server at it costs 0.6 s a read here, more on a
    phone, and a hostile one can still make each read cost that. Test:
    `releaseEnvelope.test.ts`, "refuses, before verifying any of them, an
    entry listing more replaced identities than the API keeps":
    `verifyReleaseIdentity` spied, 1,001 replaced, never called; two
    replaced, called three times, so the spy is known to bind. The bound as
    this reading set it, more than 1,000 as replaced, was one looser than
    the invariant it cites, since an honest entry's current identity is one
    of the 1,000; the fifth reading's item 3, below, counts it.
4.  **P3-L3's "cleared by the seal" held only on the derive-and-import
    path** (reported twice: as a fix-quality gap and as the unqualified
    claim on `HybridSealRandomness.encapsulation`). `refuseZero` threw
    before `importDerivedKey`, whose `finally` did the clearing, so an
    all-zero X25519 output when sealing left the ML-KEM secret as it was,
    and a `decapsulate` throw when opening left the X25519 secret; a bad
    nonce threw before anything. Negligible in practice (the ML-KEM secret
    belongs to an encapsulation whose ciphertext is never sent; the X25519
    secret of a failed open is known to whoever chose the ephemeral), and
    in the release path reachable only with an engine that returns zeros,
    which Node's WebCrypto does not (a decapsulation throws on lengths the
    copy's parser has already fixed). Fixed as suggested: both functions clear whichever secrets
    exist in a `finally` around everything from the nonce check (or the key
    agreement) to the AEAD call, and `importDerivedKey` clears the key's
    bytes alone. The field's doc, the file header, §14 and P3-L3 say "on
    every path". Tests: the pq-hybrid file's two refusal tests (zero output,
    bad nonce) assert the secret passed in is zeros afterwards.
5.  **`listReleases` refuses the whole list when one entry is malformed**,
    so one bad row from an honest-but-buggy server hides every release from
    the recipient. Kept, deliberately. A hostile server can return an empty
    list anyway, so filtering buys nothing against it; against an honest
    server with a bug, a loud refusal that names the server's answer as
    malformed is the right signal, where a quietly shorter list would hide
    the bug behind a screen that looks complete; and a server that
    describes one release differently from its own signed header is not one
    whose other rows the SDK should vouch for as a list. The tests assert
    the all-or-nothing form, so a change to it is a decision, not a drift;
    PR 4 can ask for a filter-and-count form if its screen needs one.
6.  **P3-H1's two residuals** (reported by both passes, each saying "none
    in part 1"). The binding closes the view swap the review demonstrated
    and every variant replayed (A's id with B's release; B's id with A's; no
    `switchId`; a string header; an object `releaseId`; `switchId` as an
    array; a renamed header, which the signature refuses), with nothing
    signed and no `POST`. Two moves remain, and nothing on the device can
    refuse them: (a) an honest view of A whose `sealedTo` lists, as "key
    changed", a person the owner compared with but named only on B, so that
    the owner taps re-seal and the device seals A's K to someone never on A,
    who then opens A; (b) B's own, self-consistent view served under B's id
    with that person listed, so that the owner, shown B's row as the one
    they take for A, re-seals B to them. In both the header is the switch's
    own and every check passes; the switch list, its labels and `sealedTo`
    are all the server's word (E7). Not a refutation of the fix; "Still
    open" now says what PR 4's record must be keyed by and that consuming
    `armReleaseSwitch`'s result is load-bearing.
7.  **§14 and `hybridSeal.ts` said `hybridSealWith` takes its randomness
    "for vectors only" and that "production code calls `hybridSeal`".**
    True of dead drops; not of release copies, whose `sealReleaseCopy` draws
    the ephemeral key, the encapsulation and the nonce itself and calls
    `hybridSealWith` through `sealVerified`. `hybridSeal` is called by the
    dead-drop v2 branch alone. Both now say who calls what.
8.  **P3-L3's inventory named the message's UTF-8 bytes as cleared, but a
    message over the cap was dropped uncleared.** `encodeReleaseMessage`
    encoded the whole message to measure it and threw from outside the
    `finally` that clears the encoded bytes. The copy is filled with zeros
    before the refusal now, and §14 and P3-L3 name that path.
9.  **Two "nothing sent" sentences remained in the SDK test file**, at the
    arming refusals' helper and at the re-seal refusals' test name, after
    claim 5 and the second and third readings corrected the same word
    elsewhere; `GET`s precede each refusal and `sent()` counts `POST`s. Both
    now say no envelope, or no copy, is sent. And **§14 said
    `sealReleaseCopyWith` seals "both legs to the verified keys"**: its
    X25519 leg is the verified identity's, its ML-KEM leg whatever
    encapsulation the caller passed, as its own doc says; true of
    `sealReleaseCopy`, half-true of the vectors-only form. §14 says so.

### Fifth reading of the fixes, 2026-10-30

The fourth reading's fixes were verified in turn, independently: each check
they added was taken out once more, the review's attacks and the readings'
were replayed against the fixed SDK and protocol functions, and this record
was read against the code a fifth time. Seven reports came back. Six are
about this part's code, tests and this record, none a defect in what is
sealed or sent, and each is fixed as below; the two new mutation rows are in
the table above. The seventh is the API half's: the wire type's doc on
`switchId` in `events.ts` still reads "server-issued", while the P3-H1
binding compares the owner view's `switchId` with its header's `releaseId`,
so a release switch's id must be the release id the device chose (decision
1), and the API must store it as such; that is for the merge of the two
halves to check, and is not changed here.

1.  **One guard in `resealRecipient` was not pinned.** The P3-H1 check
    refuses an owner view whose `switchId` or header's `releaseId` is not
    the switch's and, between the two, a header that is not an object at
    all; with that guard alone taken out the actions file stayed green (16
    of 16), because every test's header was an object, and a `null` header
    would have thrown a `TypeError` from reading its `releaseId` in place
    of the SDK's own `ReleaseActionError`, the form §14 promises for a
    malformed directory answer. HEAD refused each shape correctly (the
    verifier's replay: a `null` header, a string header, a numeric
    `releaseId`, no `switchId`, all `release_mismatch` with no `POST`); the
    gap was a test's. Test:
    `releaseEnvelopeActions.test.ts`, "refuses, with release_mismatch and
    not a TypeError, an owner view whose header is not an object, or whose
    ids are not the switch's": those four views, each `ReleaseActionError`
    `release_mismatch`, no `POST`, one `GET`; the honest view re-seals. With
    the guard taken out the `null` header fails it with "expected TypeError:
    Cannot read properties of null … to be an instance of
    ReleaseActionError" (1 failed, 16 passed).
2.  **The P3-H1 protocol test's spies were not shown to bind.** It asserted
    WebCrypto's `verify` and `decrypt` were never called on the refusal and
    restored both spies before the honest re-seal ran, so nothing in the
    test showed they would have been called on the success path (a spy on
    the wrong object passes as well). The mutation was killed by the
    `release_mismatch` assertion alone; only the "before anything is
    opened" half was unproven. The honest re-seal now runs under the same
    spies and the test asserts both were called, the way the P3-L5 test
    does for `fromBase64`; its name says what it shows.
3.  **The cap on listed identities was one looser than the invariant it
    cites.** `RELEASE_IDENTITY_STORAGE_LIMIT` bounds an account's
    identities in all, current and replaced, so an honest entry has at most
    999 replaced beside a current one; the fourth reading refused only more
    than 1,000 as replaced, so 1,000 replaced beside a current one, 1,001
    in all, was verified. No honest entry changes hands and the cost bound
    moves by one identity; a precision fix. `releaseDirectoryFingerprints`
    now counts the current identity, when the entry has one, toward the
    limit and refuses when the two together exceed it. The test's numbers
    are the boundary: 1,000 replaced beside a current one, refused, nothing
    verified; 999 beside one, verified, 1,000 checks; 1,000 with no current
    one, verified. With the fourth reading's form put back the first case
    is verified (1 failed, 107 passed); with the cap removed, the same. §9,
    §14 and `comparison.ts` say "current and replaced together".
4.  **Three sentences of this record were out of date or over-general.**
    The third reading's item 2 said, in the present tense, that leaving the
    signer out was the sealing use, which the fourth reading reversed; it
    now says what that reading did and points at the fourth's item 1. The
    fourth reading's item 1 said `undefined` "was `current`"; before the
    fix it skipped the signer rule and fell through to the remaining ones,
    so a stale comparison gave `stale`, and the item says so. §14's SDK
    bullet said every refusal names the account and the fingerprint the
    directory served; only `recipient_comparison` and
    `owner_key_not_current` carry the fingerprint, `recipient_identity`
    names the account alone, and `owner_key_not_published`,
    `release_mismatch`, `not_a_release` and `server_mismatch` name neither,
    as `ReleaseActionError`'s own doc says; the bullet is exact now.
5.  **The rest of the section, re-read.** The counts in §14 and the table
    (twenty-four checks removed; 17 tests in the actions file) and the
    sentences on the cap and on P3-H1's tests were brought to what the code
    and the tests do; the four readings were not found to contradict one
    another elsewhere.

### Still open

-   **The device-side record of a release's recipients (PR 4).**
    `armReleaseSwitch` now returns whom each release was sealed to, from the
    envelope the device built; the screen that keeps that record across
    sessions and refuses to re-seal a release to an account not on it is
    PR 4's. Until then, a server can still list, in the owner's view of
    switch A, a recipient A never named, and if the owner taps re-seal for
    that person the device seals A's key to them: the binding above holds
    the server to the switch and its own release, not to the people on it.
    The fourth reading replayed both forms against the fixed SDK (its item
    6): an honest view of A listing a compared person named only on B, and
    B's own view served as the row the owner takes for A. Nothing in part 1
    can refuse either, because the switch list, its labels and `sealedTo`
    are the server's word. So, for PR 4, consuming `armReleaseSwitch`'s
    result is load-bearing, not optional: the device-side record is keyed
    by the `releaseId` the SDK returns from the envelope it built, never by
    an id from the server's list, and holds that envelope's `sealedTo`; the
    re-seal screen shows the device's recipients for that release, not the
    server's `sealedTo`; and a re-seal to an account not on the record is
    refused (the SDK can take the record as an input to `resealRecipient`
    and enforce it when given; that is PR 4's to add, with the record).
-   **The design's §8 number.** The design says PR 3 adds "a new residual
    risk R11", which is now the voice-token risk; part 2, which edits the
    design and `THREAT_MODEL.md`, makes it R12.
-   **The design's two sentences on who can read an early release.** The
    design's §3 table says of an operator releasing early "**Yes**, but only
    the named recipients can read it", and its §4(a) verdict that the server
    can "release it early to the named recipients". Until PR 4 keeps the
    device-side record, anyone the owner's device is made to re-seal it to
    can read it as well (§10, "Bring it forward"); the review's claim 2
    named both. Part 2, which edits the design, qualifies them as §10 is.
-   What the review did not verify stands: browsers other than Node's
    WebCrypto, whether `fill(0)` clears anything an engine has copied,
    ML-KEM beyond `@noble/post-quantum` (PR 2's L7), and whether PR 4 feeds
    `seenSinceComparison` from its own reads, which the SDK's reads now make
    possible for theirs (P3-M3).

## Independent review of part 2, 2026-10-30

An independent review read part 2 of PR 3 (the diff from the part-1 branch,
`-v44`, to `HEAD` at `18b928b189`: eight commits, 30 files) through six lens reviews (arming and re-sealing, storage
and lifecycle, the sweep and notifier, the recipient read side, claims and
documents, tests and mutation), each running probes against the Hono app
through `app.request` with the Matrix stub, and three verifiers who tried to
refute every finding ranked Medium or higher; the room's encryption state was
run against the fork's own Synapse code under twisted.trial, in scratch. It
reported no critical finding, one high, five medium, fifteen low, sixteen
sentences in this record, the design, the user-facing documents and the code
that were not true of the code as it stood, and one finding it refuted. Its
verdict, as written:

> The API does what §15 says, in the order it says, and the boundary that matters holds everywhere
> it was probed: a recipient gets their own copy and nothing else, nothing before the trigger;
> a stranger and a recipient before the trigger get one identical 404 (same body, same headers,
> timings within noise over 3,000 requests); the owner's view never carries another person's copy
> or a notices room; the export is produced by the same function as the release read; every log
> line carries counts; the arm route's refusal codes reveal nothing the identities directory does
> not already give any signed-in account; and the 17 + 13 + 3 + 1 + 2 tests pass, reach the source
> and do what their names say. Nothing here lets the server or a recipient read a message, and no
> finding is Critical. The one High is a bound that is not what the records say it is: the cap of 20
> counts armed and grace switches only, a fired switch's ~343 KB of header JSON and its copies are
> held 365 days outside it, and the sweep fires a minimum-timer switch within ~90 s, so one signed-in
> account with published keys adds about 6.7 MiB of held content per round (measured 6.7 → 13.4 →
> 20.1 MiB over three rounds with the live count at 0 between them), into Postgres and into every
> replica's heap, for a year, and sends about 13 undeletable notices a minute to any account that
> has published keys, which can neither refuse an owner nor unpublish; decision 4's "a bound on
> storage of about 10 MB per account" is false. Five Mediums follow: the "Blackout notices" room is
> created end-to-end encrypted by the fork under all three deployable templates (run on the fork's
> own code: the room's state carries `m.room.encryption`), so the one sentence every recipient
> reads, four records and a test title say what the code does not do, understating rather than
> overstating; the deletion screen's "until 365 days after it fired" is false for every switch that
> exists today, since the removal skips legacy switches and their payload is served for ever; "It
> cannot read the message" is stated without §10's load-bearing condition in the threat model,
> `KNOWN_LIMITATIONS.md` and the changelog, and a run with a planted key read the message; the
> 365-day removal rescans every copy row for every already-removed release on every tick,
> quadratic and synchronous (8.3–8.8 s per no-op tick at 10,000 removed releases), and the notifier's
> catch-up has the same shape from the first firing; and an overlapping notifier tick gives one
> person two standing rooms, against decision 14. Fifteen Lows follow as proposed, unverified; one
> refuted finding is recorded so it is not raised again; and the record sentences that need to
> change are listed at the end.

Each finding was then fixed or explained as below, on this branch, in the
commits after `18b928b189`. Tests named here are in `packages/api/test/` and
run one file at a time under `BLACKOUT_DB_MODE=memory`; every new check was
taken out once, the one test file that pins it run, and the source restored
(§14's scratch runner, outside the repository; the tables are at the end of
this section), and each time at least one test failed. The design document,
`TRUST.md`, `KNOWN_LIMITATIONS.md`, `THREAT_MODEL.md`, the legal changelog
and the deletion screen are edited here too; the trust page is regenerated.
The fixes then had a second pass from the same verifiers, who replayed the
attacks against them and read every sentence they changed; what that pass
found, and what was done about each, is under "Round 2" below, and what each
later pass found in the previous round's fixes under "Round 3" to "Round 6".

### High

**P3b-H1. The cap of 20 bounded live switches, not what the server held.**
`liveReleaseSwitchCount` counted `armed` and `grace` only; a fired switch's
header JSON (about 343 KB at the largest message) and its copies were held
365 days outside it, the sweep fires a minimum-timer switch within about
90 s, and nothing bounded arms per day or who may be named how often. One
account with published keys armed 20 switches naming one person, let them
fire, and armed 20 more: 6.7, 13.4, 20.1 MiB held after three rounds with
the live count at 0 between them, and 60 notices into a room the person
could neither refuse nor stop being re-invited to. Decision 4's "a bound on
storage of about 10 MB per account" was false.

-   **Done.** Four bounds, each in `services/deadmanReleases.ts` and reported
    by `GET /limits`: (a) the cap of 20 counts every release switch whose
    content is still held (`releaseContentHeld`: armed, in grace, or fired
    until the 365-day removal; cancelled and legacy switches do not count),
    refused 409 `release_switch_limit`; (b) at most 10 arms per owner in any
    24 hours, cancelled ones included, refused 429 `release_arm_rate_limited`
    with `Retry-After` and `retryAfterSeconds` computed as the identities
    directory computes its publish limit; (c) at most 5 held releases naming
    one person from one owner and 50 from everyone, refused 409
    `recipient_limit` with the `recipientAccountId`, one code and message for
    both bounds, checked per copy after the identity state and before any
    signature; (d) a person who left or declined their room is invited again
    at most once per notice, recorded on the row (`reinvited_at`, a column
    added to migration 106, which has run nowhere). Decision 4 and §15 now say
    what the cap bounds, with the measured numbers; §11 and
    `KNOWN_LIMITATIONS.md` say what one account can do to another's notices
    room and that a recipient cannot yet refuse an owner (decisions 17–19).
    (e) Round 2: every bound is read again right before the rows are written,
    with nothing yielding between; as first fixed each was read once, before
    the signature awaits, and a burst of N arms sent at once passed every one
    (the verifiers' replay: 30 at once from one owner armed 30 against a rate
    of 10 and a cap of 20; 100 at once naming one person armed 100 against 5;
    ten owners at once took a person from 49 to 59 against 50), so every "at
    most" sentence was true of arms made one after another only.
-   **Tests.** `deadman-releases.integration.test.ts`: "at most 10 release
    arms in any 24 hours: the 11th is 429 with Retry-After, and fits again a
    day after the first" (the header equals the body, about a day; a
    cancelled arm counts; one more fits once the first is a day old, and only
    one); "at most 20 release switches per owner with content held: fired
    ones count until their removal, cancelled and legacy ones do not, and
    held bytes stop growing" (20 armed, the 21st refused; 19 fired, the
    bytes held measured before and after five more refused arms and equal;
    a cancel frees a place; the 365-day removal frees the fired ones'); "at
    most 5 held releases from one owner may name one person, and 50 from
    everyone; one code for both" (the 6th from one owner refused, a cancel
    frees a place, fired ones count, another owner may still name them, the
    owner may still name someone else; ten owners' 50 accepted and the 51st
    refused with the same code, message and fields). `GET /limits` asserts
    every bound. `deadman-release-notices.integration.test.ts`: "a person
    who left is invited again at most once per notice: a retry of the same
    notice does not invite again". Round 2: "arms sent at once at the edge of
    each bound: exactly the bound passes and the rest are refused with its
    code" (30 at once from a fresh owner: 10 armed, 20 refused 429; 15 at
    once at 19 held: 1 armed, 14 refused 409 `release_switch_limit`; 15 at
    once naming one person: 5 and 10 `recipient_limit`; a person at 45 from
    nine owners, ten more owners at once: 5 and 5; nothing written for any
    refused arm).
-   **Run.** The review's probe (`review/arming-resealing/probe2.mts`),
    re-run against this branch with one address per account: the rate, "10
    armed, then 429 release_arm_rate_limited retry-after=86400"; the cap,
    with the arms backdated past the rate window so the cap is what is
    measured, "round 1: armed 20, refused 409 release_switch_limit ×1; held
    content 6.7 MiB + copies 65 KiB; victims' notice rows [5,5,5,5]", rounds
    2 and 3 "armed 0, refused 409 release_switch_limit ×21 ... held content
    6.7 MiB", unchanged, and after the +365-day removal "held 0, content
    0.0 MiB; next arm 201"; the per-recipient bounds, "201 ×5, 409
    recipient_limit" from one owner and "50 armed, then 409 recipient_limit"
    from eleven; the growth stops where the bounds say, for arms made one
    after another. Round 2, the verifiers' concurrent scenarios re-run
    against the re-check (`fix/round2/probe-h1-round2.mts`, in scratch): "30
    concurrent arms, one owner, 30 people, held 0 before: 201 ×10, 429
    release_arm_rate_limited ×20; after: switches 10 (held 10), content 3.35
    MiB" where before the re-check it read 201 ×30 and 10.06 MiB; "at 19
    held, 10 concurrent arms: 201 ×1, 409 release_switch_limit ×9; held 20"
    (before: 201 ×2, held 21); "30 concurrent arms all naming one person: 201
    ×5, 409 recipient_limit ×25; victim's notice rows 5" (before: 201 ×30,
    notice rows 30); "victim named on 49, 10 owners arm at once: 201 ×1, 409
    recipient_limit ×9; now named on 50" (before: 201 ×10, named on 59); "100
    concurrent arms, one owner, all naming one person: 201 ×5, 409
    recipient_limit ×95 in 123 ms; victim's notice rows 5" (before: 201 ×100,
    notice rows 100). The row residue, measured in the same run: ten
    arm-and-cancel a day of 64 recipients and a 280-character label leave 10
    switch rows and 650 blanked copy rows, 228 KiB of JSON, per day, with
    content and copies at 0.
-   **Still open.** A recipient-side refusal of an owner that the notifier
    and the release read honour (decision 19); whether 20, 10, 5 and 50 are
    the numbers the operator wants (decisions 17, 18).

### Medium

**P3b-M1. The "Blackout notices" room was created end-to-end encrypted by
the homeserver.** The notifier asked for `private_chat` with `encrypted:
false`, which only leaves the client's own `m.room.encryption` out of
`initial_state`; under `encryption_enabled_by_default_for_room_type:
invite`, set by all three deployable templates, the fork adds
`m.room.encryption` to every `private_chat` room after the client's
`initial_state` (`handlers/room.py`, `_send_events_for_new_room`). The review
ran it on the fork's own code: the room's state carried the encryption event
around the bot's plaintext post, so the notice body, §11, §15, E16, the
design's §5, `TRUST.md`, `KNOWN_LIMITATIONS.md`, `THREAT_MODEL.md`, the
notifier's header and a test title said the room was unencrypted when it
was not (understating what the room was marked as, and showing every
recipient "Encryption is now enabled" above a plaintext message).

-   **Done.** The room is created with `preset: 'public_chat'`, `visibility:
'private'` and an explicit `m.room.join_rules` of `invite` in
    `initialState`, keeping the name, the invite with `is_direct` and the
    power-level override. Read in the fork: the preset's join rule is sent
    only when `initial_state` has none (`room.py`, the `if (EventTypes.JoinRules,
"") not in initial_state` branch); `public_chat` is encrypted only under
    `all`, which no template sets (`config/room.py`); `public_chat` sends no
    `m.room.guest_access` event (guests cannot join, which is wanted; the
    private preset's `can_join` is not) and leaves the invite level at 50,
    which the override sets anyway; `history_visibility` is `shared` for
    both presets. The review's scratch run of the fixed body gave `[create,
history_visibility, join_rules(invite), member, name, power_levels]` with
    no encryption event; that run is not repeated here (the fork's Python
    under twisted.trial is not part of this branch's gates), and is what
    "run (fork)" in E16 refers to. Every sentence about the room now says
    what it is and why: the notifier's header and the `createRoom` call,
    `matrix-client.ts`'s doc of `encrypted` (which now says what it does not
    do), §11, §15, E16, design §5, `TRUST.md` §1 (the default's list names
    this room as the one invite-only room created unencrypted on purpose,
    and the bullet says why; `trust.html` regenerated), `KNOWN_LIMITATIONS.md`,
    `THREAT_MODEL.md` §5, the legal changelog, the test's title and the
    test file's header. The notice body is unchanged and true.
-   **Tests.** `deadman-release-notices.integration.test.ts`, test 2 (renamed):
    the exact `createRoom` body, `preset: 'public_chat'`, `visibility:
'private'`, `initial_state` holding exactly the invite join rule, the
    name, the power levels, the invite and `is_direct`, and no
    `m.room.encryption` anywhere in it.
    `matrix-client-direct-invite.integration.test.ts`: the notifier's
    arguments give that body, and a call without `initialState` sends none.
-   **Not this PR's.** `services/fbmMatrixBridge/vendorRooms.ts` pairs
    `private_chat` with `encrypted: false` the same way for the vendor space
    and its rooms, so those are encrypted by the backstop too; a space holds
    hierarchy state only, which Matrix never encrypts, and the rooms are
    disclosed in `TRUST.md` §1 as plaintext service rooms. So do
    `services/coalitionSpaces.ts` (a space, with an explicit join rule in
    `initialState`) and `services/discordServerImport.ts` (imported rooms,
    which their comment says are not meant to hold conversation): three
    sites, not one, each marked encrypted by the backstop. Left as they are
    here; the `encrypted` doc now warns the next caller.

**P3b-M2. The deletion screen and `KNOWN_LIMITATIONS.md` said a fired switch
"stays readable to the people it named until 365 days after it fired"; for a
legacy switch, the only kind that can exist today, the payload is served for
ever**, since the sweep writes no `releasedAt` for one and the removal skips
every row without it; and the same file's later paragraph said the opposite
with no 365 days.

-   **Done.** Both sentences qualified: a release switch that fired stays
    readable until 365 days after it fired (round 4: until at least 365 days
    after, removed at the server's first sweep after that); a switch armed
    before releases (every switch that exists today) keeps its payload for the
    people it named with no removal date, because a release is not taken back.
    The two `KNOWN_LIMITATIONS.md` paragraphs now agree, and the deletion screen
    (`DataRetentionSection.tsx`) says the same. The removal is not extended to
    fired legacy switches: the design's "existing switches stay as they are"
    holds, and decision 20 asks the operator whether to extend it.
-   **Test.** None of code: a sentence. The existing legacy test asserts the
    payload is still held two retention periods on.

**P3b-M3. "It cannot read the message" was stated without §10's condition**
in `THREAT_MODEL.md` R12, `KNOWN_LIMITATIONS.md` and the legal changelog; the
review's run planted a key in the directory as a recipient's current one,
armed on unaltered protocol code without the comparison, and the operator
opened the copy before any trigger.

-   **Done.** One clause in each place, and in `TRUST.md`'s bullet: the
    server cannot read or forge a message as long as safety codes were
    compared with each person named and nobody's app code was altered; in a
    web browser the server supplies that code; without the comparison a key
    the server planted reads the message from arming on, and the API cannot
    tell. No code change.

**P3b-M4. `removeExpiredReleases` rescanned every copy row for every
already-removed release on every tick, for ever** (8.3–8.8 s per no-op tick at
10,000 removed releases), and the notifier's catch-up scanned the same way
for every fired release from its first firing.

-   **Done.** `db/store.ts` gains `GroupedMap`, a `Map` whose rows are also
    indexed under a second key, kept in step by `set`, `delete` and `clear`;
    the copies and the notices are grouped by switch, so
    `listDeadmanReleaseWraps` and `listDeadmanReleaseNotices` cost the
    group's size. The file store's hydrate builds the grouped maps; the
    Postgres store's hydration and peer row refresh go through `set`, and its
    wholesale refreshes (`rehydrateAll`, a peer's table resync) make a fresh
    map of the same kind (`freshMapLike`). The half-removal repair test is
    unchanged and passes: nothing skips a removed switch, each just costs its
    own copies. The catch-up uses the same listing, so a tick over N fired
    releases costs their copies, not N scans. Round 2: the copies and the
    notices are grouped by recipient account as well (`GroupedMap` takes a
    grouping per index), so the per-recipient bounds, read once per copy on
    every arm, the release read, account deletion and the notifier's room
    lookup cost that person's rows; as first fixed each was a scan of every
    copy row, up to 64 per arm.
-   **Tests.** `deadman-releases.integration.test.ts`: "the 365-day removal
    lists each release's copies by switch: a pass over releases already
    removed does not scan the copies": 1,500 removed releases with three
    copies each; the second pass removes 0, and every iterator of the copies
    map and of the notices map (`values`, `entries`, `keys`, `forEach`,
    `Symbol.iterator`), spied, is called 0 times while the pass runs and one
    release's notices are counted; under 2 s. `deadman-release-notices.integration.test.ts`:
    "the catch-up lists each fired release's copies by switch": 1,000 fired
    releases with their notices sent, a tick with a homeserver that throws
    if touched, result all zero, the copies map not iterated.
    `deadman-releases-postgres.integration.test.ts` asserts the index after
    hydration and after `rehydrateAll`; the file test after a restart.

**P3b-M5. An overlapping notifier tick gave one person two standing rooms.**
The in-flight set was keyed per notice; two notices for one person, both
due, each found no room and each made one; and the interval did not wait for
a tick that outlived it.

-   **Done.** `startDeadmanReleaseNotifier`'s tick has a running guard, as
    `authRowsPruneScheduler.ts` does, so a tick that outlives the interval is
    not overlapped. Finding or making a person's room happens under a
    per-recipient slot (a promise chain per account), and a notice that
    waited reads its row and the person's room again before deciding, so the
    second notice reuses the first's room. Within one process; the leader
    lock keeps the loops to one process outside a leader handover, during
    which the old leader finishes the notice in hand while a standby may
    already run its own notifier (the alias and the `elsewhere` count cover
    that overlap: round 4; as first written this said the lock keeps the
    loops to one process, with no handover).
-   **Tests.** `deadman-release-notices.integration.test.ts`: "two notices for
    one person in overlapping ticks make one room: the second waits for the
    first's room and reuses it" (one `createRoom` while the first is parked,
    both sent into that room, a bounded wait); "the interval does not start a
    tick while the previous one runs" (the real `setInterval` at 15 ms with a
    parked `createRoom`: one tick in flight after ten intervals, both notices
    sent by later ticks); the existing overlap test now waits a bounded time
    for the second tick and fails rather than hangs (P3b-L15).

### Low

-   **P3b-L1. A notice row that existed before its switch fired was ended as
    `release_unavailable`, and the trigger then wrote no row.** Done: a row
    whose switch is a release switch with content held, not cancelled and not
    fired is not due and is left alone; the trigger writes rows for
    recipients lacking one, as before; a cancelled or legacy switch's row
    still ends `release_unavailable`. Test: "a notice row for a release
    switch that has not fired is left alone, and is sent once the switch
    fires" (due 0 and the row untouched before the trigger; one row after it;
    sent, and the owner's counts read sent 1).
-   **P3b-L2. A network error on the re-invite threw out of the whole tick.**
    Done: every homeserver call for one notice (state read, invite, create,
    send) runs under `guarded`, which turns a throw into that notice's retry
    with `matrix_<call>_network_error`; anything else that throws inside one
    notice is logged (counts and the error string only) and retried as
    `notifier_threw`. `inviteToRoom`'s answer is unchanged (round 2 added an
    optional `signal`): its eight callers read its `{ ok, status }` shape. Test:
    "a homeserver call that throws is
    that notice's attempt: counted, backed off, and the tick goes on to the
    next notice" (the invite, the state read and the create each thrown in
    turn; attempts, `lastError`, the backoff; the other due notice sent).
-   **P3b-L3. A purged room was replaced once per notice pointing at it.**
    Done: when a 404 room is replaced, every notice row of that person's that
    pointed at it moves to the replacement. Test: "a purged room is replaced
    once per person" (the pending notice at X and the newer one both end at Y;
    one replacement room; two sends into it).
-   **P3b-L4. Arming and `/limits` ignored `BLACKOUT_DEADMAN_SWEEP`.** Done:
    `armingAvailability` refuses with 409 `arming_unavailable`, reason
    `sweep_off` and its own message, where this process's environment has the
    sweep off, and `/limits` answers `armingAvailable: false,
armingUnavailableReason: 'sweep_off'` (`releases_off` comes first when
    both are off). The API's own environment is what it can see
    (decision 21). Test: "with the sweep switched off in the API's own
    environment, arming is refused with 409 and /limits says why".
-   **P3b-L5. The switch row and the copies are N+1 write-behind upserts in
    Postgres mode.** Done: the copies are written first and the switch last,
    so a crash between the upserts leaves copies no switch names rather than
    a switch that fires with copies missing; §15 and `KNOWN_LIMITATIONS.md`
    say what the window is and that nothing detects the orphaned copies.
    Test: the arming test spies `createDeadmanSwitch` and asserts both copies
    are in the store when the switch is written.
-   **P3b-L6. The race claims held within one process only.** §15 now says so
    for arming and re-sealing, with what the cross-replica window can leave
    (a sealed copy on a cancelled switch, served to nobody, blanked by a
    second cancel). No conditional write was built.
-   **P3b-L7. `release_id_taken` is an existence answer for any switch id.**
    Kept; the `SWITCH_NOT_FOUND` comment, §15 and decision 22 say why it is
    accepted: unguessable ids, permanent rows, ids known only to owners and
    told recipients, a signed envelope per probe, the status not revealed.
-   **P3b-L8. The export omitted the notice rows about the account.** Done:
    `deadmanNotices` on `AccountExport` (switch, room, re-invite, status,
    attempts, last error, times), for fired switches only, so a crash-shape
    row for an unfired switch tells the person nothing before the release.
    Test: the export test asserts the row, its absence for an unfired
    switch, and the route.
-   **P3b-L9. The deletion screen's "the public half of your release keys is
    removed"** then excepted the copy kept with a fired release switch, which
    goes 365 days after it fired (round 4: the screen now says "which goes
    with that release", which is removed at the first sweep at least 365
    days after it fired); `KNOWN_LIMITATIONS.md` adds the fingerprint
    kept on the blanked copy rows.
-   **P3b-L10. What stays after the removal** was then stated in
    `KNOWN_LIMITATIONS.md`'s Retention bullet, the legal changelog, §11, §15
    and the deletion paragraph: whom it named and the fingerprint of the key
    each copy was sealed to, the label and timing, when it fired, and each
    notice's room, status and attempts until that person deletes their
    account (round 4: that read as if status and attempts go at deletion,
    which is not what the code does; deletion clears the room and keeps
    status and attempts, and the texts now say each notice's status and
    attempts, and its room until that person deletes their account).
    `recipient_fingerprint` is not blanked (the refuted SL-1, below).
-   **P3b-L11. The owner's view reveals that a named recipient deleted their
    account** (`sealedTo` shrinks, `notices.failed` rises). Documented in §11
    and §15; the same fact is public through the identities directory.
-   **P3b-L12. `releasedAt` and `removesAt` docstrings** now say the first is
    the server's record of the trigger, the server's word (§10), and the
    second is when the content becomes due for removal, taken at the sweep's
    first pass on or after it, while a sweep runs; the Retention bullet says
    "at its first sweep pass on or after".
-   **P3b-L13. Three record sentences were not exactly what the code does.**
    (a) §8's "each refused with their own code" said four; an unknown account
    and one without an identity share `unknown_recipient`, so §8 now names the
    three codes as §15 has them. (b) The flag
    parses `1` or `true` in any casing, surrounding whitespace ignored; §15,
    the service's comment and `.env.example` say so, and test 1 pins `TRUE`,
    `true` and `1 ` as on and `yes` and `on` as off. (c) The 1 MiB cap is
    middleware and runs first; §15, the module's comment and the test's
    title say "before the body is parsed", not "before the body is read"
    (round 2: this entry claimed the title had changed when it had not; test
    1 and PR 1's test in `deadman-routes.integration.test.ts` are renamed
    now, and the one comment in the test file that said "read" too).
-   **P3b-L14. A deletion during an in-flight send marked the notice `sent`.**
    Done: before marking sent the notifier reads the row again and never
    overwrites a row that is no longer pending, and reads the account again
    and ends the notice with `recipient_gone` if it is gone. Test: "an
    account deletion that lands during a send stands" (the deletion through
    `confirmAccountDeletion` during a parked send; an account deleted another
    way with its rows untouched; a row ended during the send while the
    account exists: none marked sent). Round 2: only the `sent` branch read
    the row again, so a deletion during a send the homeserver then refused
    was written over with the refusal (`matrix_send_status_500`, attempts 1,
    a new backoff), and a deletion during `createRoom` or the state read was
    not seen in find-or-make, which recorded the new room on the ended row
    and sent into it. Now the row is read again after every homeserver call
    and before any write to it, whatever the step was; the tests are below.
-   **P3b-L15. The in-flight mutant was killed by a hang.** Done: the overlap
    test races the second tick against a timer and asserts its result, so
    the mutant fails an assertion (the table below).

### Round 2: what the verifiers found in the fixes

The verifiers replayed every attack against the fixed branch and read every
sentence the fixes changed. Eleven residuals, each fixed or explained here;
the tests and the mutation table for them are at the end of this section.

-   **The bounds held for sequential arms only (High as raised).** Every
    bound was read before the signature awaits and the rows were written
    after them, so N arms sent at once all read the pre-burst counts: 30 at
    once from one owner armed 30 (rate 10, cap 20, 10 MiB held); 150 from one
    address armed 120 (the global limiter's 120 a minute) and 40 MiB; 100 at
    once naming one person armed 100 against 5; ten owners at once took a
    person from 49 named to 59 against 50. Sequential bursts saw each other's
    writes, so growth was no longer unbounded, but each "at most" in the
    records, `KNOWN_LIMITATIONS.md`, `TRUST.md`, `THREAT_MODEL.md` and the
    changelog was overstated by the size of a burst, and the recipient-side
    number, a promise to the person named, by 24×. Done: `armReleaseSwitch`
    reads every bound again after the signature awaits, beside the id check,
    with nothing yielding before the writes, so on one replica exactly the
    bound passes a burst; the sentences now say so, and what replicas can do.
    Test: "arms sent at once at the edge of each bound: exactly the bound
    passes and the rest are refused with its code". Run: the verifiers'
    probe, re-run (below).
-   **A deletion during find-or-make was not seen (Low).** `resolveRoom`
    recorded the new room on the row after `createRoom` or the state read
    without reading the row's status, so a deletion that landed meanwhile had
    its ended row given a room again, undoing "every notice row of theirs
    forgets the room", and the invite and the send went into a room made for
    a deleted account. Done: the row is read again after each homeserver call
    in find-or-make; a row no longer pending ends the notice as
    `recipient_gone` with nothing recorded on it (the room the homeserver made
    stands, empty). Test: "a deletion that lands while the room is being
    found or made is seen before anything is recorded: no room on the row, no
    re-invite, no send" (during `createRoom`, during the state read of an
    existing room, during the re-invite of someone who left).
-   **A refused send after a deletion overwrote the ended row (Low).** The
    `retry` branch wrote `lastError`, `attempts` and `nextAttemptAt`
    unconditionally, so the row said `matrix_send_status_500` where the
    deletion had written `recipient_gone`. Done: the row is read again before
    any branch writes; one no longer pending is counted as failed and left as
    it is. Test: test 13's fourth case (a send the homeserver refuses with
    500 during a deletion: `recipient_gone`, attempts 0, the backoff
    unchanged).
-   **The running guard serialised every notice behind a call with no
    timeout (Low).** `matrix-client.ts` set no timeout on any request, so a
    homeserver that accepted a connection and never answered held one notice
    for undici's default (300 s on Node 22 / undici 6), the tick's loop is
    sequential, and no other tick starts meanwhile; before the guard an
    overlapping tick carried the other due notices. Done: each of the
    notifier's four calls has `NOTICE_CALL_TIMEOUT_MS`, 30 s, through a race
    that does not rely on the client honouring it, and an `AbortSignal` the
    four `matrix-client.ts` calls now pass to `fetch`, so the request is
    aborted and the notice is a retry with `matrix_<call>_timeout`. What
    remains, stated in the header, §11, §15 and `KNOWN_LIMITATIONS.md`: a tick
    is a sequence, so 50 notices whose every call times out take about 25
    minutes. Test: "a homeserver call that never answers ends at the call
    timeout as that notice's retry, and the next notice is not held behind
    it" (a `createRoom` parked for ever, the tick done within the shortened
    timeout, the row's reason, the signal aborted, the other notice sent).
-   **The per-recipient bound scanned the copies map (Low).**
    `listDeadmanReleaseWrapsForRecipient` filtered every copy row, once per
    copy per arm, so an envelope of 64 copies cost 64 scans of every copy on
    the server, on the request path; the `GroupedMap` indexed by switch only.
    Done: `GroupedMap` takes one grouping per index, and the copies and the
    notices are grouped by switch and by recipient; the file store's hydrate
    and the Postgres store's refresh rebuild both. Test: "a person's copies
    and notices are listed through the index, not a scan: the per-recipient
    bounds and the room lookup cost that person's rows" (1,500 other
    switches, seven naming one person, every iterator of both maps spied and
    called 0 times, the counts right); the Postgres and file tests assert the
    by-recipient listing after a restart and a wholesale refresh.
-   **The row residue under the rate was unstated (Low).** The held cap
    bounds content and the rate bounds arms, but rows are never deleted, so
    arm-and-cancel adds up to 10 switch rows and 650 blanked copy rows a day
    per account for good; the Bounds bullet, decision 4 and §15 stated the
    content bound only. Done: each now says the row figure (about 230 KB a
    day as JSON at 64 recipients and a full label, about 11 KB at one
    recipient), and decision 24 asks whether a cancelled release switch's
    rows may be deleted.
-   **`KNOWN_LIMITATIONS.md` said a deleted account's notice rows keep their
    room (Medium as a claim).** The deletion paragraph said "the record of
    each notice (its room, status and attempts) stays"; `accountLifecycle.ts`
    clears the room on every notice row of the deleted recipient, and the
    changelog and §15 said so. Done: "its status and attempts, with its room
    forgotten".
-   **Test 1's title still said "before the body is read" (Low).** The
    record's L13 entry said the title had been changed; it had not, and PR
    1's test in `deadman-routes.integration.test.ts` and one comment in the
    test file said the same. Done: both titles and the comment say "parsed";
    the pre-existing quotation in `deadman-and-feeds-triage-2026-10-12.md` is
    a record of what that test was called then and is left.
-   **"Never a switch without copies" was true of a crash only (Low).** A
    copy's write-behind upsert that fails twice is dropped
    (`db_write_behind_failed`) while the switch's, queued after it, may
    succeed: a switch without that copy, with no crash, and nothing detects
    it. Done: §15 and the Durability bullet say so. A sweep-time check that a
    fired switch's held copies cover its recipients was not built.
-   **The "Not this PR's" note named one of three `private_chat` +
    `encrypted: false` sites (Low).** Done: `coalitionSpaces.ts` and
    `discordServerImport.ts` are named beside `vendorRooms.ts`.
-   **The record and user-facing sentences stated the bounds flatly.** Done
    with the first item: §11, §15, decision 4, the service's comments,
    `KNOWN_LIMITATIONS.md` (Who can name you, Bounds), `TRUST.md` §1,
    `THREAT_MODEL.md` and the changelog say the bounds hold on one API
    process against arms sent at once and can be exceeded across replicas by
    what lands within the store's refresh window.

### Round 3: what the verifiers found in the fixes

A third pass replayed the attacks against round 2's fixes (the bounds, the
room's state on the fork, the overlap, the removal's cost and the indexes'
survival, the deletion races), checked each round-2 fix against every store
and caller and with its check removed, and read every corrected sentence.
Fifteen findings, two of them Medium as claims and the rest Low; each fixed
or explained here, with the tests and the mutation table at the end of this
section.

-   **A create that timed out on this side but succeeded on the homeserver left
    an extra room (Low).** Synapse's `createRoom` servlet is not cancellable, so
    the aborted request still made the room with its invite; nothing recorded
    it, and the retry, and any other notice for the person in that tick, made
    another: under a homeserver that kept answering `createRoom` after 30 s, one
    empty "Blackout notices" invite per attempt, about 130 over the retry window
    by the verifiers' count, while `TRUST.md`, §11, decision 14 and
    `KNOWN_LIMITATIONS.md` said one room per person. Done: the room is created
    with an alias, an HMAC of the person's Matrix id under a key derived from
    `JWT_SECRET_PRIMARY`; Synapse refuses a taken alias with `M_ROOM_IN_USE`
    before it makes a room, and on that answer the notifier resolves the alias
    fresh and uses the room it names if the bot made it, with the person invited
    again as for a known room, and waits for one still being made (round 4: for
    one backoff; one still without its `m.room.create` at the next attempt is
    taken for a create the homeserver abandoned, below; round 5: or still
    without the bot's join or the power levels, the backoff timed from when the
    first look was recorded). Where the alias cannot be used (refused by the
    homeserver, or naming a room that is gone or not the bot's) the room is made
    without it, rather than the person getting no notice for the retry window;
    §11 says what that leaves, and decision 25 asks about the key. Tests: "a
    createRoom the homeserver finished after the call timed out is found by the
    room's alias on the retry: one room per person, fresh from the directory"
    (the verifiers' scenario D: two due notices, the first create answered after
    the timeout, one room in all, the second notice sent in the same tick
    through the alias, the retry reusing it; one notice alone, its retry found
    through the alias; the same after a purge freed the alias); "when the alias
    cannot be used the room is made without it" (a 403 and an `M_EXCLUSIVE`
    refusal, an alias naming a room the homeserver answers 404 for and one an
    admin made, a room still being made waited for; a 500 not taken for an alias
    refusal); "a deletion that lands during the alias lookup, the bot's id or a
    create without the alias is seen before anything more is asked or recorded";
    and in `matrix-client-direct-invite.integration.test.ts` the alias, a
    refusal's error code, the lookup's cache and signal, and whoami's signal.
-   **"Typically under a second" (Medium as a claim).** `KNOWN_LIMITATIONS.md`
    and §11 put a number on the cross-replica window that nothing measured,
    and §15 said "typically sub-second". A replica sees another's arms only
    once that replica's write-behind queue, one FIFO chain writing one row at
    a time and publishing each change after its upsert, has reached them, and
    an arm queues up to 66 upserts, so the burst the sentence was about is
    what lengthens the window. Done: the number is gone from both, and §11,
    §15, decision 4, `KNOWN_LIMITATIONS.md`, `TRUST.md` and the changelog say
    that across replicas a burst can exceed each bound by up to its own size
    until the queues drain, which was not measured.
-   **The abort was pinned for `createRoom` only (Low).** Removing the signal
    from `getRoomStateAdmin`'s or `sendEvent`'s `fetch` survived the notices
    suite (the verifiers' V02 and V03). Done: test 15 now parks the state read
    of a known room, the re-invite, the send, the alias lookup and the bot's
    id, and asserts each row's `matrix_<call>_timeout` and that each signal
    was aborted; V02 and V03 are C01 and C02 in the table below and fail it.
-   **A homeserver that answers slowly was not stated (Low).** The header and
    `KNOWN_LIMITATIONS.md` gave what a homeserver that answers nothing holds;
    one that answers each call just inside the timeout holds a notice for
    every call it makes. Done: both, §11 and §15 say a notice makes up to
    seven calls (with the alias), so about three and a half minutes for one
    notice and about three hours for a tick of 50.
-   **The owner's bounds scanned every switch row (Low).** The held cap and
    the rate each filtered every switch, twice per arm. Done: the switches
    map is a `GroupedMap` grouped by owner, rebuilt on the file store's
    hydrate and kept by the Postgres store's refresh. Tests: test 22 spies
    the switches map's iterators too and reads both bounds; the file and
    Postgres tests list switches by owner after a restart and a refresh.
-   **The identities were read before the awaits only (Low).** A recipient
    who rotated during an arm's verification got a held copy sealed to a
    replaced key, and one who deleted their account a held copy their
    deletion's blanking pass had already run past, counted toward that
    account's bound for 365 days. Done: the post-await block reads the
    owner's identity (the same row the verifier was built from) and every
    recipient's again, refusing with the existing codes. Test: "a key change
    or a deletion during an arm's verification is seen before the rows are
    written" (a recipient's rotation and erased keys, the owner's rotation
    and erased keys, no switch or copy written; the same arm accepted when
    nothing changes).
-   **`THREAT_MODEL.md`'s Release identities row said deletion "removes the
    public halves" (Medium as a claim).** For an owner with a fired release
    switch the full public identity stays in that switch until the removal,
    at least 365 days (round 6: "for up to 365 days" understated it), and is
    served to its recipients. Done: the row carries the exception
    the deletion screen and `KNOWN_LIMITATIONS.md` carry, and the
    changelog's 2026-10-26 entry points at the 2026-10-29 one.
-   **§15, "read once per copy per arm" (Low).** Twice, before the
    signatures and again before the writes. Done.
-   **§15, "Logs carry counts only" (Low).** Two warnings carry a thrown
    error's message. Done there and in the notifier's header: counts, and
    for a throw that is not a homeserver call the error's message; never who
    or where.
-   **"Only the owner's own copy goes" (Low).** The label goes too. Done in
    §15, decision 12 and the changelog's deletion bullet;
    `KNOWN_LIMITATIONS.md`'s deletion paragraph says the label is removed.
-   **The P3b-L2 entry said `inviteToRoom` was unchanged (Low).** Round 2
    gave it an optional `signal`. Done: its answer is unchanged.
-   **`THREAT_MODEL.md`'s and `TRUST.md`'s headers (Low).** Both dated their
    dead-man text 2026-10-29 though round 1 and round 2 rewrote it on
    2026-10-30. Done: each has a 2026-10-30 entry naming the room's creation,
    the comparison condition, the bounds and the one-process qualifier.
-   **Test 2's title stated what the homeserver does (Low).** The test pins
    the body the API sends; the stub cannot model the backstop. Done: "the
    notifier asks for a direct room with the body the homeserver's backstop
    leaves unencrypted (public_chat, an invite-only join rule in
    initial_state) ...". The fork-side test the review proposed under
    `tests/blackout_runtime/` was not added (still open, below).
-   **§11, "one person receives at most 50 notices in any 365 days" (Low).**
    True of notice rows; a send the homeserver accepted but answered after
    the 30 s is retried with the same transaction id, which it deduplicates
    for about 30 minutes (round 4: 30 to 60 minutes in its memory for a
    token without a device, 24 hours in its database for one with a device),
    so a homeserver that keeps doing that past the
    sixth retry can show the same notice twice. Done: §11 says at most 50
    notice rows, each sent once accepted, with that case.
-   **Commit trailers (Low, for whoever merges).** No file this branch adds
    or changes names a model (round 4: as first written, "no tracked file",
    which is not true of some older documents elsewhere in the tree, which
    this branch does not touch); every fix commit's message ends with the
    attribution lines the session's harness requires. Rewriting them would
    take a rebase or an amend, which this work does not do; left to whoever
    merges.

### Round 4: what the verifiers found in the fixes

A fourth pass replayed the attacks against round 3's fixes (the bounds, the
room's body on the fork, the overlap, the removal's cost and the indexes'
survival, a deletion racing a send), checked each round-3 fix with its check
removed, and read the corrected sentences, the review's lists and this
section again. Fourteen findings once the lenses' overlaps are merged: one
High as a claim, two Medium (one a regression of round 3's alias, one a
claim), the rest Low; each fixed or explained here, with the tests and the
mutation table at the end of this section.

-   **An alias naming a room whose create never finished stopped that
    person's notices for good (Medium as raised).** The fork's `create_room`
    makes the room id and writes the alias (`create_association`) before
    `_send_events_for_new_room` sends `m.room.create`; a restart, or a
    failure sending the first events, between the two leaves the alias
    naming a room whose admin state answers 200 with an empty list, for good
    (the verifiers ran it on the fork's own code: the create answered 500,
    the alias resolved to that room, and a create with the alias was refused
    `M_ROOM_IN_USE` an hour later). The notifier took such a room for one
    still being made and retried it for the whole 30-day window, and every
    later notice to that person the same way, since no row knew a room and
    the alias stayed taken: in the verifiers' probes, 129 attempts, no room
    and no send, then `retry_window_over`, and a later release stuck the
    same way. Round 3's own report had said it removed exactly this shape
    for a stale alias. Done: such a room is retried once
    (`matrix_alias_room_not_ready`); if the notice's previous attempt
    already found it so, one backoff earlier (round 5: as built here the
    backoff ran from the tick's start, so after a long tick it could be
    seconds; it now runs from when that attempt was recorded, and a room
    with the bot's create but without the bot's join or the power levels
    goes the same way), it is taken for an abandoned
    create and the room is made without the alias, as for a room that is
    gone (`checkRoom`, `deadmanReleaseNotifier.ts`). What that leaves, stated
    in §11, the notifier's header, decision 26 and `KNOWN_LIMITATIONS.md`: a
    create merely slower than a backoff leaves an extra room once it
    completes, and the abandoned alias stays taken until an admin removes it.
    Test: test 27 of the notices file ("a room found through the alias that
    still has no m.room.create at the notice's next attempt is taken for a
    create the homeserver abandoned"): the first tick retries and makes
    nothing, the second, one backoff later, makes one room without the alias
    and sends, and a later release reuses that room with no alias lookup;
    test 17's room still being made is still waited for. Run: the verifiers'
    three probes, re-run (`fix/r4/probes/`, in scratch): the person's notice
    sent at its second attempt, one room, and the later release sent.
-   **Re-sealing had the race round 3 closed for arming (Low).**
    `resealReleaseCopy` read the identities before its signature await and,
    after it, only the switch. A recipient who rotated during the
    verification got a copy sealed to the key just replaced; one whose
    account deletion ran meanwhile got a fresh held copy written after the
    deletion's blanking pass, listed in the owner's `sealedTo` again, owed a
    notice row when the switch fired and held until a cancel or the removal,
    which made "a deleted recipient's copies go" untrue on one process. Done:
    the re-seal calls `identitiesStillCurrent` for its copy after the
    switch is read again, refusing with the existing codes. Test: test 25 of
    the releases file ("a key change or a deletion during a re-seal's
    verification is seen before the copy is written"): a rotation, the
    recipient's full account deletion (the copy stays blank, `sealedTo` is
    empty, no notice row after the sweep), the owner's rotation and the
    owner's erased keys, each refused with nothing written, and the same
    re-seal accepted when nothing changes. Run: the verifiers' two probes,
    re-run: `recipient_identity_superseded` and `unknown_recipient`, no copy
    held for the deleted account, `sealedTo` empty, no notice row. Across
    replicas the window stays (P3b-L6), now stated in §15, the deletion
    texts and Still open.
-   **No test pinned that the alias is keyed by the server's secret (Low).**
    The verifiers' A1, an HMAC under a constant key, passed the notices
    suite; with it anyone on the homeserver, or over federation, could
    check through the alias directory whether a Matrix id has a notices
    room, which says it was named on a fired release. Done: test 2 computes
    the alias on its own from `JWT_SECRET_PRIMARY` and the purpose label and
    checks it is not an unkeyed hash of the Matrix id; A1 (U06 below) and a
    changed purpose label (U07) now fail it.
-   **The identities' re-read was a second full scan (Low).** Every identity
    read filtered and sorted every release-identity row, twice per copy per
    arm after round 3: the verifiers measured one pass over 64 copies at
    13.5 ms with 10,000 identity rows and 167.8 ms with 100,000, on the
    request path, and the first pass also ran for arms refused at the
    identity step, which write nothing and count toward no bound. Done: the
    identities map is a `GroupedMap` grouped by account, rebuilt by the file
    store's hydrate and kept by the Postgres store's hydration and
    refreshes; the same probe now reads 0.1 to 0.2 ms at each size. Tests:
    test 22 spies the identities map's iterators as well and reads an
    account's identities, its current one and three fingerprints' states
    through the index; the Postgres test lists an account's identities after
    hydration and after a wholesale refresh; the identities' own file-store
    test lists them after a restart.
-   **A notice another process ended was counted failed (Low).** With two
    notifiers on one store (two processes during a leader handover), the
    second counted every row it found no longer pending as failed, sent ones
    included: in the verifiers' scenario E its tick logged two failed for
    two delivered notices. Nothing was written. Done: such a row is counted
    as it ended, `failed` or, if it was sent, in a new `elsewhere` count,
    which also counts an overlapping tick's skip. Test: test 28 (a row
    another process marks sent while this tick waits for its room: counted
    `elsewhere`, the row as the other left it, nothing sent); test 20's
    skip is counted `elsewhere`. Run: scenario E re-run, the second
    instance's tick two due, none sent, none failed and two elsewhere.
-   **Two comments said the room is in no directory (Low).** The header said
    `private` puts it "in no directory", and `createNoticeRoom`'s comment "out
    of every directory"; since round 3 its alias is in the homeserver's
    alias directory and in the room's `m.room.canonical_alias`, and only
    the public room list leaves it out. Done: both, test 2's comment, §11 and
    design §5 say that, and that the alias cannot be computed without the
    secret.
-   **`THREAT_MODEL.md`'s Dead-man row said the server cannot read a release,
    with no condition (High as a claim).** The Confidentiality column said
    "ciphertext it cannot read" and the Integrity column "cannot read, alter
    or forge one", both unconditional, while R12 in the same file had carried
    the safety-code condition since round 1 and the file's header said so;
    the review's list had named R12 only. Done: both columns carry R12's
    condition (a safety code compared with each person named, nobody's app
    code altered; in a web browser the server supplies that code).
-   **The same row stated three more things flatly (Low).** "One per person",
    which round 3 qualified everywhere else; the bounds "exceeded across
    replicas only within the store's refresh window", which round 3 replaced
    elsewhere with "by up to a burst's own size until the write-behind queues
    drain, not measured"; and "cancel clears the content and every copy".
    Done: the row says one per person and reused, with the extra-room cases
    in `KNOWN_LIMITATIONS.md`, the round-3 wording for replicas, and cancel
    on one API process with what a re-seal on another replica can leave.
-   **"Cancel removes every copy" was flat in four places (Low).** §10,
    `KNOWN_LIMITATIONS.md`'s Retention bullet, the `THREAT_MODEL.md` row and
    the changelog; round 3's claims list said §10 was handled, and §10 was
    not changed. Within one process cancel wins (the re-seal reads the
    switch again); across replicas a re-seal on another replica in the
    refresh window can leave a sealed copy on the cancelled switch, served to
    nobody, until a second cancel that nothing tells the owner to make. Done:
    each says so. The same window is now stated for a deletion's copies (the
    deletion screen, `KNOWN_LIMITATIONS.md`, the changelog, §15).
-   **The user-facing extra-room list lacked the wrong bot id, and the
    caching was understated (Low).** `KNOWN_LIMITATIONS.md` listed a refused
    alias, a room gone or not the bot's, and a rotated secret, not a wrong
    derived id for the bot; and §11, §15 and the header said the derived id
    is cached after a whoami "the homeserver refused" or "has answered",
    where `matrix-client.ts` caches it after any whoami not cut short, a
    network error with no answer included, and from any caller in the API.
    Done: the list has the case ("where the server has the bot's own id
    wrong") and the abandoned create; the three say when it is cached.
-   **The transaction id's lifetime was "about 30 minutes" (Low).** In the
    fork that is the in-memory cache only, kept 30 to 60 minutes and lost on
    a homeserver restart, which is all a token without a device gets (the
    admin API's login-as-user); a token with a device (a `/login`) is also
    deduplicated for 24 hours from the database (`event_txn_id_device_id`).
    No deployment document says which the bot's token is. Done: §11 (Sending
    and the bounds bullet, with the retry from which a repeat can come for
    each), §15's "Read, not run", the header and design §5 say both.
-   **Retention sentences said 365 days, and the notice clause read as if
    status and attempts go at deletion (Low).** The deletion screen and
    `KNOWN_LIMITATIONS.md` said a fired release stays readable "until 365
    days after it fired"; the removal runs at the sweep's first pass on or
    after that, and never while no sweep runs, as the Retention bullet
    already said. The Retention bullet and the changelog said "each notice's
    room, status and attempts until that person deletes their account";
    deletion clears the room and keeps the rest. Done: each place says at
    least 365 days, removed at the server's first sweep after that, and
    each notice's status and attempts, and its room until that person
    deletes their account.
-   **"No tracked file names a model" (Medium as a claim).** True of the
    files this branch adds or changes, not of the tree: some older documents
    elsewhere do, which this branch does not touch. The round-3 entry above
    now says "no file this branch adds or changes". Every commit of the
    branch ends with the attribution lines the session's harness requires,
    which name a model; rewriting them needs a rebase, which this work does
    not do, and they stay for whoever merges, as before.
-   **A notices-suite run that failed five tests once (Low, process).** One
    verifier's first run of a mutant failed tests 14, 20, 21, 24 and 26 and
    was not reproduced in eight baseline runs. Explained: another verifier
    was applying mutants to the worktree in place in the same minutes, and
    those five are exactly the tests its in-flight-guard mutant fails (its
    log `mut-N05-inflight.log`, in scratch); a re-run of the first mutant
    alone passed. No test was changed for that run. This round's mutants
    ran on a `git archive` snapshot outside the worktree; separately, test
    20 now releases its parked create in a `finally`, so a failure there no
    longer leaves a notice in flight under tests 24 and 26 (which a mutant
    showed it did), and the two new tests move rows earlier tests leave
    pending (test 26 leaves one for the next leader) out of their ticks
    first.

### Round 5: what the verifiers found in the fixes

A fifth pass replayed the attacks against round 4's fixes (the bounds, the
room's body, the overlap, the indexes, a deletion racing a send, this time
with the deletion and the notifier in separate processes as the production
compose runs them), probed the alias path with the shapes the fork's
`createRoom` can leave, and read the corrected sentences again. Twelve
findings: three Medium (one an attack, one a fix's gap, one a claim), the
rest Low. Each is fixed or explained here, with the tests and the mutation
table at the end of this section.

-   **The bound of 50 from everyone is a lever, and the records did not say
    so (Medium as raised).** `heldReleasesNaming` counts every copy on a
    release whose content is held, and a fired release's content is held
    until its removal, so in the verifiers' replay ten accounts, five arms
    each at the minimum timer and one sweep, filled one person's 50; a
    genuine owner naming that person was then refused 409 `recipient_limit`,
    after the person published new release keys too, the person's cancel of
    one of those releases answered 404, 364 days later it was still refused,
    and only after the removal sweep 366 days on was it accepted; an owner
    whose account was deleted after firing five kept all five held.
    Decision 18 named only the bound's disclosure. Not changed in code: which
    bound replaces it is the operator's, and each alternative keeps a lever
    (decision 18 lists them with their costs: keep it; count only unfired
    releases, which an attacker defeats by checking in; count distinct
    owners, the same lever at 50 accounts; drop the bound, which leaves a
    person's notices bounded only by how many accounts an attacker can make;
    or the recipient-side refusal, decision 19). Done: decision 18, §11's
    bounds bullet, `KNOWN_LIMITATIONS.md` (a bullet of its own, "The bound of
    50 can be used to stop others naming you", and a pointer from Bounds),
    `TRUST.md` §1 (and `trust.html`, regenerated), the `THREAT_MODEL.md`
    Dead-man row's Availability column and the changelog say who can fill
    it (ten accounts with published release keys, five arms each, in a
    day; round 6: for up to 64 people with the same five arms, which this
    said as one person), for how long (while those switches are kept armed
    by check-ins, and at least 365 days after they fire, deleted owners' fired ones
    included), that neither the person nor anyone else can clear it, and
    that the refused owner sees the 409. Test: test 26 of the releases file
    ("a known trade-off, pinned (decision 18): ...") fills a person's 50
    from ten accounts, fires them, and checks the genuine owner's refusal,
    the person's new keys, the person's 404 on cancel, the refusal a day
    before the removal and the arm accepted at it; a mutant counting only
    unfired releases (P01 below) fails it.
-   **A deletion on the API process was written over by the worker (P3b-L14
    across processes, Low as raised).** Round 4's fix re-read the row from the
    notifier's own mirror. In `deploy/docker/production` the loops run in
    `worker` and account deletion on `app`, and each Postgres mutator queued a
    full-row upsert, so when the app's change notification reached the worker
    after the send had answered, the worker's write (`sent`, with the room it
    recorded) landed over the app's committed `failed` / `recipient_gone` / no
    room: in the verifiers' probe on PGlite, Postgres ended `sent` with
    `!created-1`, and a replica booting then read it so. Done: a conditional
    notice write in the store,
    `updateDeadmanReleaseNoticeIf(switch, recipient, expected, patch)`, applied
    in the mirror only while the row holds `expected` and carried into Postgres
    as
    `INSERT ... ON CONFLICT ... DO UPDATE ... WHERE deadman_release_notices.<col> = $n`
    (a guard taken from the call's arguments by its mutator spec, passed through
    the write-behind queue to `upsertRecord`; a guard field with no column or
    value throws rather than drop the condition; every other mutator is
    unchanged). Every write the notifier makes uses it: `status = 'pending'` for
    the room, the re-invite stamp, sent, retry and every end, and `room_id =`
    the old room for the rows moved off a purged one. (Round 6: not every
    write; the creation of a row by the sweep and the catch-up was a plain
    upsert, now insert-only, and the conditions guarded only rows the deletion
    had reached, not one the API process had not yet heard of. Both below.)
    What it leaves, stated in §15, the notifier's header and the deletion texts: until the app's
    notification arrives the worker's mirror and its tick's count say sent; a
    deletion that commits after the worker's write lands over it as its own
    full-row write, which leaves no room and, unless the app had already seen
    the row sent, `failed` with `recipient_gone` for a notice the homeserver
    accepted; and a notice whose send was in flight when the deletion landed can
    still arrive (now said in the deletion screen, `KNOWN_LIMITATIONS.md`'s
    deletion paragraph and the changelog). Tests: the new
    `deadman-release-notices-postgres.integration.test.ts`, the worker's real
    notifier on PGlite beside a second store as the API process: test 1 runs
    eight variants (the room known, made in the attempt, or purged and replaced;
    the deletion during the send, the create or the re-invite, or before a tick
    past the retry window; a send the homeserver refuses; the notification
    during the call or after) and requires Postgres, the worker's mirror once
    told and a replica booting afterwards to read `failed`, `recipient_gone`, no
    room, and the earlier row not moved onto a replacement; test 2 drives the
    store method by status and by room. Run: the verifiers' probe
    (`fix/r4-replay/l14-xproc.mts`, in scratch), re-run: all three of its
    variants now end `failed` / `recipient_gone` / null in Postgres and in a
    booting replica.
-   **An alias room abandoned after `m.room.create` and before the bot's
    join stopped that person's notices for good (Medium as raised).** The
    fork's `createRoom` persists the create event alone, then the creator's
    join through `update_membership`, then one batch (power levels, join
    rule, history visibility, `initial_state`, name), then the invites
    (`handlers/room.py`, `_send_events_for_new_room`). `checkRoom` accepted
    any room whose `m.room.create` was the bot's, and re-invited the person
    into one the bot had never joined, which the fork refuses
    (`event_auth.py`, `M_NOT_JOINED`): in the verifiers' probe, 129
    attempts, no send, then `retry_window_over`, and a later release stuck
    the same way. The record's "leaves the alias naming a room with no
    events for good" was not true of this shape. Done: a room found through
    the alias is used only when it is the whole room the create makes with
    the bot in it, the bot's join and power levels under which the person
    can neither post nor invite (`aliasRoomComplete`); anything less goes
    through round 4's rule (retried once as a create in progress, then
    replaced by a room without the alias), and so does a room the bot made
    and has since left. The stand-in homeserver's created rooms now carry
    the state the fork's create leaves (`createdRoomState`), so a complete
    room found through the alias is still used at the first look. Test:
    test 27 of the notices file, now over five shapes (no events, the create
    alone, the create and the bot's join, the whole room the bot has left,
    power levels that let the person post), each retried once with nobody
    invited, then a room without the alias at the next attempt and reused
    after; and the whole room used at once. Run: the verifiers' two probes
    (`fix/fq5/probes/`, in scratch), re-run: the person's notice sent at
    the second attempt, one room made, no invite into the abandoned room,
    and the later release sent.
-   **An alias room abandoned after the bot's join and before the batch was
    used with no power levels (Low as raised).** The person, at the default
    0 with `events_default` and `invite` at 0, could post and invite anyone,
    contrary to §11's "power levels that let only the bot post or invite".
    Done by the same check; the shape is in test 27; the verifiers' probe
    now sends into a room made without the alias, not into the bare one.
-   **"Waited for one backoff (30 s at the least)" was not guaranteed (Medium,
    claim).** The retry was timed from the tick's start (`now`), so a notice
    reached late in a long tick (behind a call that ran to the 30 s timeout) was
    due again as it was written, and its second look came at the next interval
    fire, seconds after the first: in the verifiers' probe, `nextAttemptAt` 21
    ms before the first look, and the second look 8 ms after it. Done in code
    rather than in the sentences: the tick's clock is its `now` moved on by the
    time the tick has run, and a retry is due one backoff after it is recorded,
    so the second look comes at least one backoff after the first however long
    the tick ran. The seven places the verifiers listed now say that the wait
    runs from when the first look was recorded. Tests: test 29 ("a retry is
    timed from when it was recorded, not from the tick's start ..."), a held
    create run to a 300 ms timeout before the alias notice's first look: due at
    least 300 ms plus a backoff after the tick's `now`, not due at the old time,
    and sent with a room without the alias at its own; the tests that ticked at
    a fixed offset now tick at the row's own next attempt and check the retry
    against the tick's run time. Run: the verifiers' probe
    (`fix/claims/wait-shorter.mts`, real time, the production timeout), re-run:
    `nextAttemptAt` 30000 ms after the first look, and the immediate second tick
    found nothing due.
-   **Model names in the tree and in this branch's commit trailers (Low,
    claim).** Not acted on in this round: the two attribution lines at the
    end of every commit message are the ones the session's harness requires,
    and rewriting them needs a rebase, which this work does not do; the
    older documents elsewhere in the tree that name a model belong to a
    separate change on develop. The round-4 sentence (claim 44) stays as it
    was, and is accurate.
-   **"Until 365 days after it fired" was still flat in four places (Low).**
    `THREAT_MODEL.md`'s Release identities row, `KNOWN_LIMITATIONS.md`'s "who
    can name you" bullet, the changelog's 2026-10-26 entry and `removesAt`'s
    comment in `deadmanReleases.ts`; also §1 of this record. Done: each says the
    removal happens at the first sweep at least 365 days after it fired
    (`removesAt`'s comment adds: while a sweep runs).
-   **§11's Sending bullet: whoami "until ... answered or has failed once"
    (Low).** A whoami cut short by the timeout caches nothing. Done: "until a
    whoami not cut short by the timeout has been answered, refused or
    failed".
-   **Entries in this section described superseded wording as current
    (Low).** P3b-M2's Done, P3b-L9, P3b-L10 and the round-3 entry on the
    transaction id. Done: each now says "then" or carries a "(round 4: ...)"
    pointer to what the texts say now; P3b-L10's says that deletion clears
    the room and keeps status and attempts.
-   **P3b-M5's Done said the leader lock keeps the loops to one process
    (Low).** Not during a handover, which round 4's own test 28 rests on.
    Done: "outside a leader handover, during which the old leader finishes
    the notice in hand while a standby may already run its own notifier".
-   **Still open said the alias was "run only against the stub" (Low).** The
    verifiers ran the taken-alias refusal and an interrupted create on the
    fork in scratch. Done: Still open says which parts were run on the fork
    and which were read in it.
-   **`TRUST.md`'s review header said "kept to one per person" with no
    qualifier (Low).** Done: "except in the cases KNOWN_LIMITATIONS.md
    lists", with the bound of 50 named too, and `trust.html` regenerated
    (`node tools/ci/build-trust-page.mjs`).

### Round 6: what the verifiers found in the fixes

A sixth pass replayed the attacks against round 5's head (`abff30b035`):
the bound of 50 with releases that name 64 people, the deletion across the
app/worker split with a notice row the API process had not yet seen, the
notifier's writes during a leader handover, and the checks round 5 added,
each removed once on a snapshot of the branch. Fourteen findings: one
Medium (an attack's breadth the records understated), the rest Low. Each is
fixed or explained here, with the tests and the mutation table at the end of
this section. One more defect, of this round's own making, is recorded with
them.

-   **The lever of the bound of 50 reaches far more people than the records
    said (Medium as raised).** Every statement of round 5's lever described
    one person. One release names up to 64 (`RELEASE_MAX_RECIPIENTS`), and
    the bound of 5 from one owner is per person, so five arms naming the same
    64 people put each at 5 from that owner: in the verifiers' replay ten
    accounts, 100 arms of 64 on each of two days, put 256 people at 50, the
    third day's arms were refused by the held cap, and a genuine owner naming
    any of them was refused 409 `recipient_limit`. Decision 18 compared its
    options by their cost to an attacker at one person each, which overstated
    that cost by 64 to 256 times; option (c), counting distinct owners, was
    "the same lever, at 50 accounts rather than ten", where 50 accounts block
    about 1,280 people. Not changed in code, as round 5 said: which bound
    replaces it is the operator's. Done: decision 18 states the breadth (64
    people per five arms; 128 a day at the arming rate; 256 within the held
    cap of 20; about 26 people per attacking account), that one check-in per
    switch per interval keeps an armed one counted and that an interval can
    be 365 days, and each option's cost per person blocked, (c) included: it
    raises the smallest attack from ten accounts to 50, not the cost per
    person; §11's bounds bullet, Still open, `KNOWN_LIMITATIONS.md` (the
    bullet now "... and many people at once"), `TRUST.md` §1 and its header
    (and `trust.html`, regenerated), the `THREAT_MODEL.md` Dead-man row's
    Availability column and its last-updated note, and the changelog say the
    same; the round-5 entry points here. Test: test 26 of the releases file
    now names two people in every one of the fifty arms and checks both end
    at 50, the genuine owner is refused for each, and both can be named again
    after the removal sweep.
-   **A comment gave a protection as the reason for one code (Low).**
    `recipientHasRoom` said the two bounds share a code because a second one
    "would say how many others have named the person"; an owner below its own
    5 who is refused learns that anyway (decision 18). Done: the comment says
    the shared code hides nothing, and why.
-   **Not every notifier write was conditional in Postgres (Low as raised).**
    `createDeadmanReleaseNotice`, which the sweep's trigger and the
    notifier's catch-up call, was a plain upsert: in the mirror it writes only
    a missing row, in Postgres it wrote the whole row over whatever was there.
    A process with the fired switch in its mirror but not yet the row (a
    leader taking over within the change notification's lag) set a row the
    old leader had sent back to pending with no attempts, and the next tick
    to read it sent the notice again (the verifiers' probe on PGlite:
    `fix/r5v/catchup-create.mts`). Done: the mutator spec is insert-only
    (`insertIfAbsent`: `ON CONFLICT ... DO NOTHING`), carried through the
    write-behind queue to `upsertRecord`, which refuses a guard on such a
    write. Test: test 3 of `deadman-release-notices-postgres` (a standby
    booted before the trigger, told of the switch and not the row, writes the
    row; Postgres keeps the sent row, attempts and room; a replica booting
    reads it sent; the standby, told of the row, reads it sent). Run: the
    verifiers' probe, re-run: Postgres stays `sent` with one attempt, and the
    old leader's next tick finds nothing due and sends nothing. _(Round 7:
    this fixed what Postgres keeps, not the re-send. The new leader's own
    tick, in the same lag, sent the notice again from the pending row its
    mirror held, and with the alias refused made a second room; neither the
    run nor test 3 ran the new leader's notifier. Fixed in code in round 7,
    below.)_
-   **A deletion on the API process did not reach a notice row it had not yet
    seen (Low as raised, a claim).** The conditional writes guarded only the
    rows the deletion had ended. A row the worker's sweep wrote moments before
    the deletion, whose change notification had not reached the API process,
    was left pending; the deletion blanked the copy and deleted the user, the
    worker then sent the notice after the deletion had committed and recorded
    it `sent` with its room, and nothing cleared it (the verifiers' probe:
    `fix/claims-r5-verify/unseen-row.mts`). So "a deletion the API process
    committed first stands in the database", "every notice row of its forgets
    the room", decision 14's "until the recipient's account is deleted", §11's
    Retention, `KNOWN_LIMITATIONS.md`'s and the deletion screen's "a notice
    still owed to you is dropped" and the changelog's sentence were not true
    across the split. Done in code rather than in the sentences: before it
    makes a room and again before it sends, the notifier reads the person's
    copy from Postgres itself, after its own queued writes
    (`readDeadmanReleaseWrapCommitted`, through `copyHeldInDatabase`); a
    deletion blanks every copy sealed to the account first, so once one has
    committed nothing is made or sent for that person _(round 7: not true for
    a create or a re-invite that followed a state read, which read only the
    mirror; the copies are blanked before the notices are ended and the user
    row deleted, not before everything else; both corrected in round 7,
    below)_. And the deletion
    finishes with one statement in Postgres (`finishAccountDeletion`, awaited
    by the route after `confirmAccountDeletion`;
    `endDeadmanReleaseNoticesOfDeletedAccount` on the Postgres store, once its
    queue has drained, so the route also answers only once the deletion's
    queued writes have been attempted _(round 7: written here as "in the
    database", which a write dropped after failing twice is not; the route
    now revokes the session first and waits at most 10 s)_) that ends every notice row still pending to the account and
    forgets the room of every one, rows the API process never saw included;
    the rows it changed go into its mirror and are announced to the other
    processes. What it leaves, now said in §15, the notifier's header, decision
    14, §11, `KNOWN_LIMITATIONS.md` and the changelog: a notice whose send had
    begun when the deletion committed can still arrive (its row then has no
    room); and if the last statement fails (logged; the deletion is still
    answered) or the API process stops before it, a row it had not seen keeps
    what the worker wrote, a room included where the send had begun first. The
    deletion screen's sentence was true once the code was, and is unchanged.
    The release part of the deletion is now `eraseReleaseCopiesAndNoticesOf`
    (next entry). Tests: test 1 of `deadman-release-notices-postgres` adds five
    variants in which the API process booted before the sweep wrote the row
    (deleted before the tick, with no room and with a known one: no room made,
    no send; during the create: one room made, no send; during the send: one
    send, the row `failed` with no room; after the worker recorded it sent:
    `sent` with no room), and every variant now checks the API process's own
    mirror, delivers to the worker what that process announced, as the
    transport would, and requires, through a trigger on PGlite that records
    every change to a notice row, that nothing after the deletion set a row of
    the person's back to pending or gave one a room (added after round 5's
    W09 and W11 survived against this round's code, below); test 27 of the releases file checks that the route runs
    the last step after the deletion's writes and still answers when it
    throws. Run: the verifiers' probe, re-run: no send, and Postgres, the
    worker's mirror and a replica booting all read `failed`,
    `recipient_gone`, no room.
-   **This round's own slip: a database read that did not wait for the
    process's own writes.** `3155c4856a` dropped the drain from
    `readDeadmanReleaseWrapCommitted` just before it was committed, on the
    reasoning that a copy is always written long before its switch can fire,
    and the Postgres notices file was not run again after that edit; at that
    commit it fails. A release armed and fired in one process within the
    write-behind queue's lag has its copy still queued, the read finds no
    committed copy, and the notice is ended as `recipient_gone`, so the person
    is never told. `a868a8c7c5` puts the drain back; removing it is Y09 below,
    which test 1 catches. The commits are not rewritten, so `3155c4856a` stays
    in the history with a failing test.
-   **The cross-process test copied the deletion by hand (Low).** Done: the
    copy-and-notice writes of the deletion are `eraseReleaseCopiesAndNoticesOf`
    (store given), which `confirmAccountDeletion` calls with the process's
    store and the test with the API process's; the test also runs
    `finishAccountDeletion` on that store, as the route does. Removing the call
    from `confirmAccountDeletion` (Y17) fails the in-memory deletion tests.
-   **The end the notifier writes after a send for an account found gone was
    called equivalent, and is not (Low, claim).** Round 5's mutation note said
    its condition (W16) changes nothing observable. During a leader handover
    another notifier may already have committed `sent`; with the account gone
    another way the unconditional write turned that into `failed` (the
    verifiers' probe, `fix/claims-r5-verify/w16.mts`). Done: test 4 of
    `deadman-release-notices-postgres` has that case (the worker's send held,
    a second store commits `sent` with its room, the account leaves the
    worker's view, the send released: Postgres and a booting replica keep
    `sent` and the other room), W16 now fails it, and round 5's note says so.
-   **Halves of round 5's checks no test reached (Low).** The verifiers'
    mutants V1 (`aliasRoomComplete` without "the person cannot invite"), V2
    (the person's own level in `users` not read) and V3 (`upsertRecord`'s
    refusal of a guard it cannot carry disabled) passed every test. Done:
    test 27 of the notices file has two more shapes, power levels that keep
    the person from posting but let them invite (`events_default` 50,
    `invite` 0) and power levels that give the person their own level of 100,
    each waited for once and then replaced; test 5 of
    `deadman-release-notices-postgres` checks that a guard field with no
    column, one with no value, and a guard on an insert-only write each
    throw, write nothing, and that a guard the writer can carry lands. Y20,
    Y21 and Y22 below are V1, V2 and V3, and fail.
-   **No test ran the file store's conditional write (Low).** Every notifier
    write goes through `updateDeadmanReleaseNoticeIf`; the file-store restart
    test covered only the unconditional one, and the verifiers' V4 (its
    `persist()` removed) passed. Done: the test runs it applied (a retry with a
    room), refused by its condition and by room, each read back after
    reopening the store, the room lookup and the by-switch listing included;
    Y24 below is V4, and fails.
-   **Verification in a shared worktree (Low).** The verifiers found another
    agent's mutant in this worktree while their own in-worktree mutants ran,
    so either could have undone the other partway through a run; they re-ran
    theirs on a `git archive` snapshot with the same outcomes. Done: every
    mutant of this round ran on a snapshot of `a868a8c7c5` outside the
    worktree (`fix/r6/snap`), and round 5's seventeen were run again there
    against this round's code; two of them, W09 and W11, then survived, and
    the cross-process test gained the check that kills them again (below).
    Round 5's own table was run on a snapshot too (`fix/r5/mut`), so it is not
    affected by another agent's edits.
-   **§15 said the releases file had 25 tests (Low).** It had 26, the
    twenty-sixth being the pin the sentence names; it now has 27. Done, with
    the other files' counts.
-   **Retention was still "up to 365 days" in two places and a flat "365 days
    after" in five (Low).** The removal runs at the first sweep pass at least
    365 days after the trigger, and with no sweep running never. Done: decision
    4 (twice), the round-3 entry, decisions 12 and 17, §13, and the protocol's
    `maxHeldReleaseSwitches` docstring.
-   **"What one account can make the server keep is bounded" without "content,
    not rows" in four places (Low).** Done: §11's bounds bullet, §13,
    `THREAT_MODEL.md`'s Dead-man row and the docstring, and the changelog's
    sentence as well.
-   **Model names in the commit trailers and in older documents (Low, twice
    raised).** Not acted on, as in round 5: the two attribution lines are the
    ones the session's harness requires and rewriting them needs a rebase or a
    squash at merge, the operator's to decide; the older documents that name a
    model are on `develop` and belong to a change there. The round-4 sentence
    (claim 44) stays as it was.

No new operator decision this round: decision 18 is restated with the
lever's breadth and each option's cost per person blocked.

### Round 7: develop merged in, and what the verifiers found in round 6's fixes

**Develop first.** Part 1 (#993) merged, and `develop` at `f6da7b7d16` also
carries #994 (dependency advisories for npm, the Synapse fork and the desktop
app) and #995 (a QuickSwitcher test fix). It was merged into this branch as
`4ea3f844d4`, with no rebase. Two files conflicted, both documents.
`THREAT_MODEL.md`: prettier had reflowed the asset table on each side, so one
changed row on each side showed as the whole table; this branch's table is
kept with develop's one changed row (the "OIDC tokens" row, `cfd9ab0123`),
and `git diff -w origin/develop` shows only this branch's own rows. This
record, three hunks: the status paragraph keeps both sides; §10's "Bring it
forward" keeps this branch's qualification to one API process and develop's
sentence on a copy re-sealed to whoever the owner's device is made to re-seal
it to; decision 4 keeps this branch's text. Where the two sides said
different things, the code decided. Develop's status paragraph said part 1's
fixes "were then read again three times"; its part-1 section has a second,
third, fourth and fifth reading, so four, and the sentence predates the
fifth: it now says four. Develop's decision 4 said "at most 20 live (armed
or in grace) release switches per owner"; that was part 1's state, and part
2's code counts every release switch whose content is still held
(`heldReleaseSwitchCount`, fired switches until their removal), so this
branch's decision 4 stands, with the correction note that says what the
review found. Every other line develop's five corrections of part 1's
sections added (`90449c9b49`, `06b5bddd4c`, `9de9dbcf78`, `252e54d9c2`,
`aef836b5c2`) was checked, line by line against the merge base, to be in the
merged file. The gate runner then ran on the merge commit against
`origin/develop` (`fix/gates-r7/`, in scratch), and every gate passed: the
API's lint and typecheck, its PR gate (2,040 tests) and post-merge suite
(2,160), launch smoke (14), the client's typecheck, lint and suite (3,643
passed, 3 skipped), parity (2 of 2), the migrations, the trust page, room
encryption, the feature registry, auth secrets, prettier and gitleaks.
Against develop's own CI on `f6da7b7d16`: its client suite ran the same
3,643 and 3 (six more than this branch had before the merge, part 1's
fourth and fifth readings' tests); its API integration job ran 1,971 and its
full API suite 2,091, and the 69 more here are part 2's own (27, 29, 5, 3, 1
and 4 in its six files).

A seventh pass replayed the attacks against round 6's head (`215eff7c6d`):
the catch-up's create during a leader handover, the deletion across the
app/worker split while the notifier is between calls, and the claims round 6
made about both. Thirteen findings: two Medium (a re-send and a second room
from the new leader's own tick; a room made or an invite sent after a
deletion committed), the rest Low. Each is fixed or explained here, with the
tests and the mutation table at the end of this section.

-   **A leader taking over still sent the notice again, from its own mirror
    (Medium as raised; also raised Low twice, as an attack replay and as a
    claim).** Round 6 made the catch-up's create insert-only, so Postgres
    kept the old leader's `sent`. But the new leader's mirror held the
    pending row its create had just written, the same tick listed it as due,
    and the notifier read only the copy from Postgres and the row from the
    mirror: it found the room through the alias and sent again with the same
    transaction id, deduplicated only while the homeserver kept the id (30
    to 60 minutes in memory for a token without a device, lost on a restart),
    and with the alias refused it made a second room, invited the person into
    it and sent there, so its mirror named a room Postgres did not. Its tick
    counted the notice `sent`. The verifiers' probes on PGlite:
    `fix/replay-r6/catchup-standby-tick.mts`, `fix/r6verify/leader-resend.mts`,
    `leader-resend-noalias.mts` and `fix/claims-r6v/handover-resend.mts`.
    Round 6's run had checked only the old leader's next tick, and test 3
    never ran the standby's notifier. So round 6's Done, §15 ("it was sent
    again" given as fixed), the notifier's header and catch-up comment ("does
    not set it back to pending", true of Postgres and not of the mirror the
    leader sends from), and `KNOWN_LIMITATIONS.md`'s "the bot makes one such
    room for you and reuses it" were not true. Done in code: the notifier's
    reads from the database (`checkDatabase`, through the store's new
    `readDeadmanReleaseCommitted`, which replaces
    `readDeadmanReleaseWrapCommitted`) read the notice row as well as the
    copy, before anything is asked of the homeserver and right before each
    create, the re-invite and the send. A row Postgres has as sent or ended
    is not sent and nothing is written to it; and the Postgres store puts the
    stored row into its mirror when the process wrote nothing to the row
    during the read (the same object before the drain and after the query),
    so the new leader also takes the room the old one recorded on that
    notice's row rather than make another, and counts the notice
    `elsewhere` (round 8: only on that row; for another of the person's
    notices it still made a second room with the alias refused, and the
    refresh did not compare the stored retry time with now). A write this process
    makes to the row during the read is kept, since it is newer than what the
    read returned (a deletion on the same process, say); the row from
    Postgres then still stops the send, through a step that writes nothing
    (`ended`). The final writes count attempts from the row as read at the
    end, which the database's may have replaced. Tests: test 6 of
    `deadman-release-notices-postgres` (the worker as the new leader, a
    second store as the old one firing and sending through the real client
    with the notifier's own create body): sent with the alias, sent with the
    alias refused, the room recorded and the send refused with the alias
    refused (the new leader sends once, in the old leader's room, attempts
    2), the same with the new leader's send refused too (a retry, attempts
    2), and sent with the new leader never told of the trigger (its own sweep
    fires the switch again, below); each with no second room, nobody invited
    again, and the new leader's mirror reading as Postgres does, with the old
    room.
    Test 8 hooks the read's query so that a write lands while it is in
    flight: a deletion on the same process at the read before the send
    stands in the mirror and in Postgres, and a row another process sent is
    still not sent while this one writes the row during every read. Without
    the fix test 6 fails (Z00 below, the fix taken out whole: the second
    send); each of its parts is removed alone too (Z01 to Z06). Run: the
    verifiers' four probes of it, re-run against this round's code
    (`fix/r7/probe/`): the new leader's tick sends nothing, makes no room and
    counts the notice `elsewhere`, and Postgres and its mirror read `sent`
    with the old leader's room. What is left, now in
    §15, the notifier's header and `KNOWN_LIMITATIONS.md`: two notifiers
    that both read one notice pending before either has recorded it can
    both send it (deduplicated as above only within one room: round 8) and,
    with the alias refused, each make the person a room, and then each sends
    in its own room.
-   **The sweep on a standby whose mirror has not heard of the trigger fires
    the switch again (Low, read by the verifiers, not run).** Run here, in
    test 6's last variant and in `fix/r7/probe/standby-sweep.mts`: the
    standby's sweep writes the switch unconditionally, as every sweep write
    is, so Postgres takes the standby's `releasedAt` (in the probe, 5 s after
    the old leader's), which moves the notices' retry window and the
    content's removal date later by the lag; its
    notice rows are insert-only and its notifier now sends nothing the old
    leader sent. Not changed in code: a conditional trigger write in Postgres
    would close it, as the notice writes have, and was not built here; now
    said in §15 and Still open.
-   **A room made, or the person invited, after the deletion had committed,
    across processes (Medium, a claim).** The worker read the copy from
    Postgres at the start of the attempt and again before the send. Between
    them it read the state of the person's known room (up to 30 s) and then,
    reading only its mirror, made a new room for the deleted person when the
    known one was purged, or invited them again when they had left. Their
    Matrix account still exists (deletion does not deactivate it), so the
    invite reached them, with nothing recorded and nothing sent (the
    verifiers' probe: `fix/claims-r6v/state-window.mts`, four cases). So §15,
    the round-6 entry and the notifier's header, "once one has committed
    nothing is made or sent for that person", were not true across
    processes. Done in code: the read is also made right before each create
    (with and without the alias) and right before the re-invite. What is
    left: a create, a re-invite or a send already on its way to the
    homeserver when the deletion committed, after the read just before it,
    can still reach the person, as on one process; the deletion screen,
    `KNOWN_LIMITATIONS.md` and the changelog now say the invitation to the
    notices room can arrive as well as the notice. Tests: test 1 of
    `deadman-release-notices-postgres` gains five variants: the deletion
    lands during the state read with the known room purged and with the
    person gone from it, each for a row the API process had seen and one it
    had not (no room made, nobody invited, no send), and during the create
    with the alias where the homeserver refuses the alias, for a row the API
    process had not seen (no room made without it); and the variant with a
    known room deleted before the tick checks that the known room's state is
    not read at all. Z07 to Z09 below remove each read and fail. Run: the
    verifiers' probe, re-run: no create and no invite in any of its four
    cases.
-   **The deletion route revoked the session only after an await (Low).**
    Round 6 put `await finishAccountDeletion` between the deletion and
    `revokeSession`, so the token that asked for the deletion went on
    working on the same process during the drain and the end statement
    (round 8: as written here, "other requests could run as the deleted
    account"; only that token is revoked, before or after, and the
    account's other access tokens are not), and a stalled pool (`pg.Pool`
    has no connection timeout) held the answer and the revocation for good.
    Done: the route revokes first, then awaits the end, which waits at most
    `ACCOUNT_DELETION_FINISH_TIMEOUT_MS` (10 s; logged as
    `account_deletion_finish_timeout`, and the end goes on unwaited;
    decision 27; round 8 took the drain of the deletion's own writes out of
    that bound). Test: test 27 of the releases file checks that the session
    is revoked when the end runs, and that an end that never answers is
    waited for only up to the bound.
-   **The notifier's database reads had no bound (Low).** Round 6's reads (a
    drain of the whole write-behind queue, a connection, a query) were
    awaited outside the call timeout, twice per notice, so a stalled
    connection held the tick and, through the running guard, every later
    one; the header's arithmetic and the interval's docstring ("each call it
    makes is bounded") left them out. Done: each read has the call timeout
    (`database_read_timeout`, that notice's retry; a database error is a
    retry too, `notifier_threw`); a read that timed out goes on in the
    background, since it cannot be aborted. The header, §11, §15 and
    `KNOWN_LIMITATIONS.md` now count up to seven homeserver calls and four
    reads per notice: a homeserver or a database that answers nothing holds
    a tick of 50 for about 25 minutes, and ones that answer each just inside
    the 30 s hold one notice for about five and a half minutes and a tick of
    50 for about four and a half hours. Test: the last test of the notices
    file (a read that never answers ends that notice's attempt at the
    shortened timeout, before anything is asked of the homeserver, and the
    next notice is sent).
-   **A copy whose write was dropped ended its notice as `recipient_gone`
    (Low).** On one Postgres process the mirror keeps a copy whose write
    failed twice, and the read route serves it until a restart; round 6's
    read of the copy from Postgres found none and ended the notice
    `recipient_gone` for a person who still exists, a change of behaviour
    nothing documented. Done: such a notice ends `failed` with
    `copy_unavailable`, unsent (decision 28 offers sending it from the
    mirror instead), and `KNOWN_LIMITATIONS.md`'s Durability bullet says so,
    and that with the notifier in a worker of its own, which never had the
    copy, no notice row is written for that person at all, as before.
    Test: test 7 of `deadman-release-notices-postgres`.
-   **§15's deletion bullet said an in-flight notice "stays `failed`", for a
    row the API process had not seen too (Low, a claim).** For such a row
    whose send answers before the deletion's last statement, the worker's
    `sent` lands (the row is pending in Postgres) and the last statement
    only clears the room (the verifiers' probe:
    `fix/claims-r6v/unseen-send-order.mts`). Done: the bullet says `failed`
    with no room if the last statement comes first and `sent` with no room if
    the worker's write does, as §15's notifier bullet already did.
-   **The protocol's `recipient_limit` docstring still gave the shared code
    as hiding how many others named the person (Low, a claim).** Done: it
    uses `recipientHasRoom`'s wording, and §15 drops the clause.
-   **"The route answers only when the deletion is in the database" and
    "before anything else" (Low, claims).** `drain()` resolves once the queue
    has run, and a write that fails twice is logged and dropped; and a
    deletion consumes the token and erases scheduled messages and the
    owner's switches before it blanks the copies. Done: the store's comments,
    §15 and the round-6 entry say "once the deletion's queued writes have
    been attempted (a write that fails twice is dropped and logged, as
    everywhere in Postgres mode)", and §15 adds that the route now waits for
    that at most 10 s; and the copies are blanked "before the notices are
    ended and the user row is deleted".
-   **"Once per account" and "one standing room per account" in two opening
    sentences (Low, a claim).** Done: the notifier's header and design §5
    item 2 say one per person and reused, except where §11 says, and so
    does `findDeadmanNoticeRoom`'s comment.
-   **Model names in the commit trailers and in older documents (Low, twice
    raised).** Not acted on, as in rounds 5 and 6: the two attribution lines
    are the ones the session's harness requires, and rewriting them needs a
    rebase or a squash at merge, the operator's to decide; the older
    documents that name a model are on `develop` and belong to a change
    there. Claim 44 stays as it was.

Two new operator decisions this round: 27 (the deletion route's bound on
its last step) and 28 (a dropped copy's notice).

### Round 8: what the verifiers found in round 7's fixes

An eighth pass replayed the attacks against round 7's head (`dbc50a2ae5`)
and checked every finding marked fixed in the memory, file and Postgres
stores, on the sweep, notifier, route and account-deletion paths, with every
test mutated independently and the leader handover replayed on PGlite
against round 7's code and round 6's. Fourteen findings, eleven distinct:
two Medium, both about claims (the deletion route's bound, and the
duplicate the homeserver was said to drop), the rest Low, one of them a
regression round 7 introduced. Each is fixed or explained here; the tests
and the mutation table follow.

-   **During a handover lag the new leader attempted at once a notice the
    old leader had set to retry, and took an alias room still being made for
    an abandoned one (Low, raised twice: as an attack replay and as a
    regression of round 7's refresh).** The catch-up writes the row the
    mirror lacks as due now (`nextAttemptAt` is the release time). Round 7's
    read then put the stored row in the mirror (attempts 1,
    `matrix_alias_room_not_ready`, the retry 30 s on), but the decision that
    the row was due had been made on the catch-up row, and nothing compared
    the stored retry time with now. `checkRoom` read the stored
    `lastError` as this notice's first look, at least one backoff earlier,
    and took the room for an abandoned create seconds after the old leader
    had looked; the room was made without the alias and the notice sent
    there, and the slow create, which carries the person's invite, then
    finished as a second room. Round 6 had waited the backoff. So
    `KNOWN_LIMITATIONS.md`'s "it waits one retry (at least 30 seconds after
    it first looked)" and round 5's "a retry waits a backoff from when it is
    recorded" were not true across a handover. The verifiers' probes:
    `fix/replay-r7v/handover-alias-wait.mts` and
    `fix/verify-fq/handover-backoff.mts` (with round 6's code for the
    control: `handover-backoff-r6.log`). Done in code: `checkDatabase`
    (now `readDatabase` and `judgeCommitted`) ends an attempt whose stored
    row is pending with its retry later than the read's clock with a step
    that writes nothing (`notDue`, counted `elsewhere`); the row, which the
    store has put in the mirror with that time, is attempted at it. On one
    process a row listed as due is due, so nothing changes there. Tests:
    test 9 of `deadman-release-notices-postgres` (the verifiers' shape: the
    alias names a room with the bot's `m.room.create` alone, the old leader
    recorded its first look, the new leader ticks a second later and
    neither reads the room's state nor makes a room; at the retry time,
    the create finished, it sends into that one room); test 6's variant
    with the old leader's send refused now checks that the new leader
    leaves the row until the old leader's retry time and then sends once in
    the old room. R00 and R02 below remove the check and the step.
-   **A new leader made the person a second room for another of their
    notices when the alias was refused (Low, raised twice: as an attack
    replay and as a claim).** Round 7's refresh brought in only the row of
    the notice being processed, and `resolveRoom` found the person's room
    through `findDeadmanNoticeRoom`, from the mirror alone. A new leader
    whose mirror lacked the room the old leader had recorded on the person's
    other notice (one the old leader sent, or the new leader's own sweep
    firing a newer release) found no room, the alias was refused, and it
    made a second one: the verifiers' probes
    `fix/replay-r7v/handover-other-notice.mts` and
    `fix/verify-fq/other-notice-room.mts` ("sweep" mode, two rooms; in
    "both-old" mode the catch-up's order happened to process the old
    notice first, one room). The old leader had stopped, so this is neither
    "the same notice" nor "at the same moment", and the notifier's header,
    §15 and the round-7 entry ("takes the room the old leader recorded
    rather than make another"), `KNOWN_LIMITATIONS.md`, `TRUST.md` and
    `trust.html` ("two of them working on the same notice at the same
    moment") and the threat model's row said less than the server does.
    Done in code: the first database read of an attempt also reads the
    person's newest row with a room from Postgres (one indexed query on
    `recipient_account_id`, in the same connection and under the same
    bound, so a notice still makes at most four database reads), and a
    notice whose own row names no room takes whichever of that and the
    mirror's newest was written later (`newer`), so a mirror still naming
    a room the old leader replaced does not win over the replacement.
    Tests: test 10 (the alias refused; the new leader's own sweep fires a
    newer release for the person the old leader sent to, and, second, the
    new leader's mirror still names a room the homeserver purged and the old
    leader replaced; each time the new release's notice goes into the old
    leader's room and no room is made). R03 to R06 remove the read, the
    store's query, its use and the comparison. What is left is two
    notifiers working on one person's notices at the same moment (below).
    _(Round 9: not all that was left. A worker that stops after a create
    has answered and before its record of the room reaches Postgres leaves,
    with the alias refused, a second room too, with no second notifier at
    the same time; round 9's entry.)_
-   **"The stored row is at least as new as the mirror's" (Low, raised
    twice: by reading the code, and as a claim with the re-invite).** A write
    that fails twice is dropped (`db_write_behind_failed`) and the drain
    still resolves, so after a dropped write the refresh put the older
    stored row back over the mirror's. A dropped `roomId` was then lost
    from the mirror too, and the `sent` upsert, a full-row write, no longer
    carried it into Postgres as it had in round 6 (with the alias refused
    the next attempt made a new room); a dropped `reinvitedAt` let the next
    attempt invite the person again, past "at most once per notice". Done in
    code: while the stored row is pending, a room or a re-invite the mirror
    has and Postgres lacks is kept, so neither is repeated and the next
    write carries them into Postgres; and the store's comment says the
    stored row is at least as new unless one of this process's writes to it
    was dropped, and what then happens. Test: test 11 (the column cleared in
    Postgres after the write stands in for the drop, as test 7 stands in for
    a dropped copy; the re-invite: not invited a second time for the notice;
    the room, alias refused: no second room; each reaches Postgres with the
    next write; and a row a deletion on a second store ended does not get
    the mirror's room back). R07 to R09 (R09, the condition that the stored
    row is pending, survived the test as first written, which had no row
    ended elsewhere; the last case was added for it).
-   **The deletion route could answer before any of the deletion's writes
    were in Postgres (Medium, a claim).** Round 7 raced the whole of
    `endDeadmanReleaseNoticesOfDeletedAccount`, which starts with a drain of
    the API process's queue, against the 10 s bound. When the queue or a
    connection stalled, which is the case the bound exists for, the route
    answered while Postgres still held the person's copies and pending
    rows, and the worker then made them a room, invited them and sent the
    notice after the answer, for a row the API process had seen as well as
    one it had not (the verifiers' probe:
    `fix/claims-r7v/stalled-deletion.mts`). Decision 27 and the user-facing
    texts said less than that. Done in code:
    `finishAccountDeletion` first waits, with no bound, for the drain of
    every write the process had queued (the deletion's among them), and
    bounds only the last statement. So by the answer the copies are blank
    in Postgres (a dropped write aside) and the worker makes no room,
    invites nobody and sends nothing for the person after its next read;
    the cost is that a pool that never hands out a connection holds the
    answer, the token having been revoked first (decision 27, rewritten,
    with giving the pool a connection timeout as an option). The deletion
    screen, `KNOWN_LIMITATIONS.md` and the changelog now say that a notice
    still owed is dropped once the deletion is confirmed, that across the
    API and worker processes the confirmation waits until the server has
    tried to write the deletion to its database and until then the bot can
    still send a notice, and that the last step can finish after the
    confirmation. Tests: test 12 of `deadman-release-notices-postgres` (it
    calls `finishAccountDeletion`, which the route awaits, not the route
    itself, whose order test 27 pins in memory: round 9 retitled it; the
    app's connections stall on a gate: with the drain stalled the call
    has not returned after 600 ms and Postgres still holds the copy, and it
    returns once the gate opens; with the last statement stalled it returns
    at the shortened bound with the copy blank in Postgres, for a row the
    app had seen and one it had not; after each return the worker's tick
    makes no room, invites nobody and sends nothing, and the row ends
    `failed` with `recipient_gone`, no room); test 27 of the releases file
    (the drain runs first, and a drain longer than the bound holds the
    answer). R10 to R13. Run: the verifiers' probe, against this round's
    code, with the drain stalled: the route had not answered when the
    probe's tick ran (below).
-   **"The homeserver drops the second send" (Medium, a claim).** Five
    records paired it with two notifiers each making a room with the alias
    refused, where it is false: Synapse keys a transaction on the request's
    path, which holds the room id (`rest/client/transactions.py`,
    `_get_transaction_key`), and its 24-hour table on
    `(room_id, user_id, device_id, txn_id)`
    (`storage/schema/main/delta/74/05_events_txn_id_device_id.sql`), so the
    same id sent into two rooms is two events, read here in the fork. Done:
    `KNOWN_LIMITATIONS.md`, §15, the round-7 entry, Still open and the
    notifier's header say that the person can then get an invitation and
    the notice in each of two rooms, and that a repeat is dropped only
    within one room; §11's Sending bullet and the header's transaction-id
    paragraph say the deduplication is per room; design §5 item 2 qualifies
    "one `m.text` per recipient per release"; `TRUST.md` §1 (and
    `trust.html`, regenerated), the threat model's row and the changelog
    agree. Not changed in code: two notifiers at once during a handover
    stays a documented residual (Still open).
-   **§15's "does not finish within the route's 10 s" (Low, a claim).** The
    statement goes on after the bound and lands. Now "until it has run,
    which can be after the route answered".
-   **The policy changelog's "once per person" and "a slow homeserver ...
    an extra, empty one" (Low, a claim).** Round 7 had changed `TRUST.md` §1
    for the handover case and left the changelog. Done: the entry says a
    room is made for each person who has none and reused, that a slow or
    interrupted homeserver can leave an extra one with only an invitation in
    it, and that two copies of the background work during a handover with
    the alias refused can each make a room and post the notice in each; it
    now also says it was corrected on 2026-10-30 and 2026-10-31, before it
    took effect, with `git log -p` as the record, which is how `TRUST.md`'s
    dates of those days are recorded there.
-   **The deletion route's comment: revoking first means "no other request
    on this process runs as the deleted account" (Low, a claim).** Only the
    deleting session's token is revoked; the account's other access tokens
    are not (`purgeUserAuthArtifacts` deletes refresh tokens, and the
    middleware refuses only a revoked jti or a token issued before a
    per-user cutoff the deletion does not set). Done: the route's comment,
    test 27's comment and the round-7 entry say so. Setting the per-user
    cutoff at deletion would refuse them; it is not done here, since it is
    the review's aside in Still open (a still-valid token of a deleted
    account answered 200), outside this PR.
-   **A test helper still stated claim 71 (Low).** `deleteOnApp` in the
    Postgres notices file said every write the deletion queued "is in
    Postgres" by the answer. Done: its comment and its message say the
    writes have been attempted.
-   **The wire types renamed develop's exports (Low, fix quality).**
    Checked against `origin/develop` (`f6da7b7d16`): part 2 had renamed
    `DeadmanLimits.maxLiveReleaseSwitches`, `DEADMAN_MAX_LIVE_RELEASE_SWITCHES`
    and `DEADMAN_RELEASE_ERRORS.liveLimit` to "held", which changes a field
    of `GET /v1/deadman/limits` and two exports for anything built on
    develop. No rename is needed for correctness: the names stay as part 1
    shipped them, with docstrings that say what they count since P3b-H1 and
    why the name is older, and the new limits fields stay beside them.
    `git diff origin/develop -- packages/blackout-protocol packages/blackout-sdk`
    now removes no export and no field, only comment lines. Decision 29
    asks whether to rename them later, with both names exported.
-   **Model names in the commit trailers and in older documents (Low).** Not
    acted on, as in rounds 5 to 7: the two trailer lines are required by the
    session's harness, rewriting them needs a rebase or a squash at merge,
    the operator's to decide, and the older documents that name a model are
    on `develop` and belong to a change there.

Run: the verifiers' five probes of this round were run again against this
round's code (`fix/r8/probe/`, in scratch; each imports the worktree's
code). `handover-other-notice.mts`, with a
second tick added at the old leader's retry time: the first tick at 2 s
counts both notices `elsewhere` and sends nothing, the second sends the
pending notice once, into the old leader's room, and the person is in one
room, with the alias refused and with it allowed (round 7's code: a second
room with the alias refused, and the notice sent 28 s early either way).
`handover-alias-wait.mts` and `handover-backoff.mts`: the new leader's tick a
second or two after the old leader's first look counts the notice
`elsewhere`, reads no room's state, makes no room and sends nothing, and
Postgres keeps the old leader's row (round 7's: a room made without the
alias, the notice sent there, two rooms). `other-notice-room.mts`, "sweep"
and "both-old": one room made for the person in all, the new release's
notice in the old leader's room (round 7's "sweep": two). And
`stalled-deletion.mts`, changed to start the route without awaiting it,
since the route now waits for the stalled drain: the route had not
answered when the probe's worker tick ran (that tick, during the stall,
made the person a room and sent the notice, which is the "until then" the
texts now state), it answered 1,054 ms in, once the gate opened, and the
worker's tick after the answer had nothing due; Postgres ended `failed`,
`recipient_gone`, no room.

One new operator decision this round, 29 (the held cap's names), and
decision 27 is rewritten for the deletion route's two waits.

### Round 9: the operator's decisions of 2026-10-31, and what the verifiers found in round 8's fixes

The operator decided on 2026-10-31: option (c) of decision 18; decision 28
confirmed; the standby that fires a switch again and two notifiers on one
person's notices at once, both documented residuals until then, to be fixed;
PR 4 approved; decisions 27 and 29 left open. A ninth pass read round 8's
head (`9fffb126a5`) and found twelve findings, all Low: one sentence about
encryption in `TRUST.md`, three checks round 8's refactor had left unpinned
by any test (fix quality), seven sentences that said more or less than the
code does, and the model names in the history. The round was done in two
sittings: the first committed the three code changes and the tests for the
unpinned checks (`cae378c593`, `9e90292dc6`, `bba364c5d8`, `c43e036c37`,
`3be2966120`) and stopped before the documents, most of the mutation run
and the gates; the second read those commits again against what follows,
finished the documents, ran the mutants and the gates, and committed the
rest. Each item is fixed or explained here; the mutation table follows.

-   **Decision 18, option (c): the bound on one person counts owners
    (`cae378c593`).** `recipientHasRoom` refused a new release naming a
    person once 50 held releases from everyone named them, so ten accounts
    with five fired releases each filled it. It now counts distinct owners
    with a held release naming the person (`heldReleasesNaming`'s
    `fromOwner`, a map by owner, whose size is the count): an owner that
    already names the person is bounded only by its own 5, and one that does
    not is refused 409 `recipient_limit` once 50 others do, before the
    signatures and again before the writes, as every bound is. The protocol
    constant and the limits field are named for what they count,
    `DEADMAN_MAX_OWNERS_NAMING_RECIPIENT` and `maxOwnersNamingRecipient`
    (they were `DEADMAN_MAX_HELD_RELEASES_PER_RECIPIENT` and
    `maxHeldReleasesPerRecipient`); checked against `origin/develop`
    (`f6da7b7d16`): neither the old names nor the new are there, since part 2
    added them, so unlike decision 29's names this changes no contract
    `develop` has. What the choice costs, stated now in decision 18, §11,
    §13, §15, `KNOWN_LIMITATIONS.md`, `TRUST.md` §1 (and `trust.html`,
    regenerated), the threat model's row and the changelog: blocking anyone
    takes 50 accounts rather than ten, at the same 26 people per attacking
    account (50 accounts with 20 held switches naming 64 different people
    each block 1,280 people in two days), for as long as the switches are
    kept armed and at least 365 days after they fire, and nobody named can
    clear it; and up to 250 held releases can now name one person, 250
    notices in 365 days on one API process, where it was 50. Tests: test 8
    of the releases file (ten owners with five each no longer fill it; the
    50th owner passes and the 51st is refused; one of the 50 may name the
    person again up to its own five), test 9 (arms sent at once at each
    edge, an owner already naming the person in the same burst), the limits
    test and test 26, which pins the trade-off as decided. S01 to S04.
-   **Decision 28 confirmed.** A notice whose copy Postgres does not hold
    ends `failed` with `copy_unavailable`, unsent, as built in round 7.
    Marked decided.
-   **A standby whose mirror had not heard of a trigger fired the switch
    again (round 7's residual; done: `9e90292dc6`, `3be2966120`).** Every
    move the sweep makes of a switch now goes through `advanceDeadmanSwitch`,
    which lands only on a switch still as the sweep read it, the same status
    and the same last check-in. In Postgres it is one statement,
    `UPDATE ... WHERE status = ... AND last_check_in_at = ... RETURNING *`
    on the switch's id, of the moved columns alone, run in the write-behind queue's order (`enqueueCall`:
    after every write the process queued before it, before any queued after,
    so an erase of the label this process queued while the statement ran
    cannot land between the statement and the read that follows it); when it
    changes no row, the switch is read from Postgres into the mirror, what
    this process wrote to it meanwhile kept and written after, and the sweep
    writes nothing else for it, no notice rows and no event. So the old
    leader's `releasedAt` stands, and so do a check-in and a cancel the API
    process committed within the change notification's lag, which the
    unconditional write had also put back. The first sitting's version ran
    the statement on a connection of its own after a drain, and conditioned
    on `released_at IS NULL` too; the second commit moved it into the queue
    and dropped that condition, which the status condition already implies
    (a fired switch is `triggered`, which the sweep never moves from) and so
    could not be shown to fail alone. In memory and in the file store the
    mirror is the database, and the condition holds trivially. A database
    error is logged (`deadman_switch_advance_failed`) and the move kept in
    the mirror, as a dropped write-behind write is; the sweep is now
    asynchronous, and its scheduler does not start a pass while one runs
    (the second sitting added a test for that guard, which the first had
    left unpinned: a memory test with a pass parked on its first move finds
    one pass in flight after ten intervals; Q01). Test: test 13 of the Postgres notices file (two stores on PGlite; the
    other store fired the switch and sent its notice, fired it and has not
    sent, checked it in, or cancelled it, while the standby's mirror still
    has it armed and due: Postgres keeps the first `releasedAt`, the check-in
    and the cancel; the standby's mirror takes them; its sweep writes no
    notice row; the notice is sent once in all, or not at all; the old
    leader having fired it while this process erased its label during the
    statement, Postgres keeps the first `releasedAt` and the erase; and
    another process having changed the label, the switch fires and the label
    stays, only the moved columns written).
    T01 to T08. Moved from Still open. (Round 10: the move was in the
    mirror while its statement waited, so the notice could be sent and the
    copy listed for a trigger Postgres then refused; the error path kept it
    in the mirror after one failure; the merge took a change notification
    for this process's write; and a switch whose arming write was dropped
    never fired. Fixed in round 10; claims 92 and 93. Round 11: the last
    only where the arming process runs the sweep; in the deployed layout it
    never fired, and the arm now awaits its own insert.)
-   **Two notifiers on one person's notices at once (rounds 7 and 8's
    residual; done: `bba364c5d8`).** Before an attempt reads anything from
    the database or asks the homeserver anything for a person, the notifier
    takes the person's claim in a new table, `deadman_notice_claims`, added
    to this PR's own migration 106: one conditional upsert that inserts the
    row or takes it over only where the claim there has expired, `RETURNING`
    the holder, with a fresh token per attempt and the expiry in the
    database's clock, `NOTICE_CLAIM_LEASE_CALLS` (15) call timeouts after it
    was taken, 7.5 minutes, longer than the thirteen bounded steps an attempt
    can take. No transaction is held open across homeserver calls. A process
    that cannot take the claim asks the homeserver nothing for the person,
    writes nothing and counts the notice `elsewhere`; its row stays due. The
    claim is given up after the row's write, once the process's queued
    writes have been attempted, so the next holder's first read sees them;
    one whose request timed out is not given up and ends at its expiry
    (round 10: a claim that timed out or failed wrote a retry over the
    holder's row; now it writes nothing and is given up if it lands; claim
    95). On
    one process (the memory and file stores) it is always granted and the
    per-recipient slot does the work, as before; in Postgres a second notice
    of the same person in an overlapping tick of one process is left too.
    Test: test 15 of the Postgres notices file (the worker and a worker
    thread with its own store, mirror and notifier on the same PGlite and
    stand-in homeserver, `test/_fixtures/notifierProcess.ts`, the alias
    refused: with one notice and with two for one person, the thread's tick
    while the worker holds the claim asks nothing and writes nothing, and
    the person has one room with each notice sent once into it; the claim is
    taken before the first read; it is given up only after the holder's
    write; and one left by a stopped process holds the person until it
    expires, and no longer). C01 to C06. What is left, said in §11, §15, the
    notifier's header, `KNOWN_LIMITATIONS.md`, `TRUST.md` §1, the threat
    model's row, the changelog and Still open: two notifiers work on one
    person's notices at once only where one holds the claim past its lease
    (an attempt slower than its thirteen steps, a paused process, or one
    whose queued writes still wait on a stalled database when its release
    timed out and the lease ends), and can then, with the alias refused,
    each make the person a room and send there. The claim adds two bounded
    steps to a notice, so one notice can now take thirteen timeouts (about
    six and a half minutes against a homeserver and a database that answer
    just inside each) and a tick of 50 about five and a half hours; §11,
    §15 and `KNOWN_LIMITATIONS.md` counted seven calls and four reads, five
    and a half minutes and four and a half hours, and now count these. A
    claim left by a stopped process keeps the account id and an expiry until
    the next claim for that person replaces it, and for good if the account
    is deleted first (the deletion does not remove it); the changelog and
    `KNOWN_LIMITATIONS.md`'s deletion paragraph say so.
-   **PR 4 approved.** Recorded in this record's status, the design's status
    and Still open; PR 4 is not built here, and `BLACKOUT_DEADMAN_RELEASES`
    stays off everywhere.
-   **`TRUST.md` §1's bold sentence (Low, a safety claim).** "Every private
    room and direct message is end-to-end encrypted by default" stood
    without exception; the notices room, a direct message the bot leaves
    unencrypted on purpose, appeared as the exception twelve lines later.
    Done: the sentence names the exception in place; `trust.html`
    regenerated.
-   **The first read's judgement, the not-due step at the later reads, and
    the half of `newer` where the room read after the slot's wait wins were
    pinned by no test (Low, fix quality, three findings; done:
    `c43e036c37`).** Round 8's verifiers removed each alone (their G04, F02
    and F05) and both notices files still passed. The first read: tests 6
    (the old leader's room recorded and its send refused, before its retry
    time), 7 (`copy_unavailable`) and 12 (the deletion's last statement
    stalled, a row the app had not seen) now give the person a known room
    and assert its state is not read. The later reads: test 14 of the
    Postgres notices file parks the worker on the known room's state read
    (the person has left it) and on its create with the refused alias, while
    another store records a retry: no re-invite, no create without the alias
    and no send before that time, then one send at it. `newer`: a new memory
    test (the person's two notices in overlapping ticks with the alias
    refused, one replacing their purged room while the other waits for the
    slot: the second uses the replacement, and no third room is made). V01
    to V03 are the verifiers' three mutants, run again on this round's code.
-   **A worker that stops after a create has answered leaves a second room
    with the alias refused (Low, a claim).** The room is recorded with a
    queued write, which reaches Postgres only when the queue runs; a process
    that stops before then leaves Postgres without the room, and the next
    attempt, finding none with the alias refused, makes another, with no
    second notifier at the same time (the verifiers' probe,
    `fix/r8v-claims/crash-after-create.mts`). §15 ("a crash after the
    answer makes no second room"), the notifier's comment, round 8's "What
    is left" (a correction appended there), `KNOWN_LIMITATIONS.md`,
    `TRUST.md` §1, the threat model's row, the changelog and Still open now
    say it. Not changed in code: waiting for the room's write before going
    on would narrow the window, not close it, since the stop can come
    between the homeserver's answer and the write.
-   **Decision 27's costs (Low, a claim).** A query that never answers once
    connected holds the deletion's answer as a stalled pool does, and a
    connection timeout would not end it; a proxy in front ends the request
    first, and the screen then said "Deletion failed" although the API
    process had applied the deletion, revoked the token and queued the
    writes, which are lost if it stops before the database answers. Done:
    decision 27 and the `accountLifecycle.ts` comment say so, and the option
    names a statement timeout beside the connection timeout; the deletion
    screen's error now says the deletion may not have finished and that a
    server that stopped answering may have applied it and could still lose
    it on a restart. Read, not run against a proxy.
-   **"A notice still owed to you is dropped once your deletion is
    confirmed" (Low, a claim).** The confirmation waits only until the
    deletion's writes have been attempted; a blanked copy whose write fails
    twice is dropped, and until the last statement has run the worker can
    still make a room, invite and send after the confirmation. And the wait
    happens wherever the server uses a database, one process included. Done:
    the deletion screen, `KNOWN_LIMITATIONS.md` and the changelog say both;
    `KNOWN_LIMITATIONS.md` also says what a proxy's timeout leaves.
-   **Decision 14's "unless the deletion's last statement fails" (Low, a
    claim).** Claim 80 had corrected §15. Done: decision 14 uses §15's
    wording (until the statement has run, which can be after the route
    answered, and for good if it fails or the API process stops before it),
    and so does §11's retention bullet, which had the same older form.
-   **Design §5 item 2 (Low, a claim).** "One `m.text` per recipient per
    release" was qualified for the handover only; a repeat is dropped only
    while the homeserver keeps the transaction id (claim 34). Done.
-   **The notifier's comment, "it lands only on a row still as this process
    read it" (Low, a claim).** The guard is `status = 'pending'`, on a
    full-row write. Done in `bba364c5d8`: "only on a row still pending
    there".
-   **Test 12's title and the record (Low, a claim).** The test calls
    `finishAccountDeletion`, which the route awaits, not the route. Done:
    retitled in `c43e036c37`; round 8's entry and §15 say what it calls.
-   **Model names in the history (Low).** Beyond round 8's entry, the
    verifiers counted the commits' author and committer name. Not acted on,
    by the operator's instruction for this branch, as for the trailers in
    rounds 5 to 8: rewriting them needs a rebase or a squash at merge, and
    the older documents that name a model are on `develop`.

Run: the verifiers' probe of the stopped worker, adapted for the claim
(`fix/r9d/probe/crash-after-create-r9.mts`, in scratch; it imports the
worktree's code), the alias refused. Process 1 made the person's room and
stalled before its record of it reached Postgres (Postgres: pending, no
room), and its claim's release timed out, so the claim stayed. Process 2,
booted from Postgres, left the notice to it while the claim held
(`elsewhere` 1, nothing asked of the homeserver), and once the claim's
lease had passed (15 of the probe's 300 ms call timeouts) it made the
person a second room and sent the notice there: an invitation in each
room. That is the residual as now stated: the claim delays it by the lease
and does not close it.

Not done this round, unchanged: decisions 27 and 29 are the operator's, as
written; the "aside found while probing round 6" stays as it is in Still
open. No new operator decision this round; decisions 18 and 28 are marked
decided, and decisions 14 and 27 are rewritten for the verifiers' findings.

### Round 10: what the verifiers found in round 9's fixes

A tenth pass read round 9's head (`4d963efd46`) and found, in round 9's
conditional move of a switch, one High and four Medium findings and one Low
(fix quality), and in the documents one Medium and five Low (claims). The
High: the sweep put the trigger into the mirror before Postgres had accepted
it, so in the deployed worker, where the notifier runs beside the sweep at
the same cadence, a notice was written and sent, and on a process that also
serves the API a person's copy was listed, for a trigger Postgres then
refused. Each is fixed or explained here; the mutation table follows the
round-9 one. `origin/develop` is still `f6da7b7d16`, so nothing was merged.

-   **The trigger reached the mirror before Postgres accepted it (High, fix
    quality; done).** `advanceDeadmanSwitch` set the moved record in the
    mirror and then awaited the conditional `UPDATE`. While it waited, the
    notifier's catch-up saw the mirror's `releasedAt` and wrote the notice
    row (insert-only, so it reached Postgres), its due list passed it, and
    the send went out; `releasedCopiesFor` listed the person's copy; and
    when Postgres refused the move (the owner's check-in on the API process
    had committed first), the mirror went back to armed while Postgres kept
    the notice row `sent`, so the real trigger later wrote no row and sent
    nothing (the verifiers' `notice-during-statement.mts` and
    `copy-during-statement.mts`). Now the shared conditional write
    (`writeDeadmanSwitchIf` in `db/store.ts`) leaves the mirror alone until
    Postgres has answered: applied, the mirror takes the row Postgres
    returned; refused, the row Postgres has, read in the same turn; either
    way the result is announced to the other processes. The verifiers'
    other suggestion, holding `releasedAt` back and putting only the status
    in the mirror, was not taken: a legacy switch's recipient read keys on
    the status alone (`GET /switches?scope=recipient`), so it would have
    served a legacy payload for a trigger Postgres then refused. Test: test 1
    of the new `deadman-switch-writes-postgres.integration.test.ts` (two
    stores on PGlite; the check-in committed on the other store; a notifier
    tick and the person's read while this process's statement waits: the
    mirror has the switch armed with no `releasedAt`, the read lists nothing,
    the tick sends nothing, no notice row; afterwards the mirror has the
    committed check-in; the real trigger an hour later is notified once). W01,
    W09.
-   **One failure of the statement lost the trigger in Postgres for good
    (Medium, fix quality; done).** The catch logged and returned the moved
    record, so the move stayed in the mirror; `enqueueCall` does not retry,
    every later pass saw the mirror triggered and tried nothing, the notice
    was sent from the worker, and every other process read the switch armed
    until the worker restarted (`one-blip.mts`). The comment and §15 said
    "as a write-behind write that failed twice is". Now a failed statement is
    logged (`deadman_switch_write_failed`) and nothing of it is in the
    mirror; the statement is safe to repeat, and the next pass makes it.
    Test 2 of the new file (the first `UPDATE` throws once: no move, nothing
    in the mirror, no copy listed, nothing sent; the next pass fires it in
    Postgres, a fresh store hydrates it fired, and the notice is sent once).
    W02.
-   **A switch whose own arming write was dropped never fired (Medium, fix
    quality, a regression of round 9; done where the arming process runs the
    sweep, which the deployed layout's API does not: round 11 made the arm
    await its own insert).** The `UPDATE` matched no row,
    the read found none, and the sweep put `before` back and returned with
    no log, on every pass, while the owner's list showed the switch armed
    (`dropped-arm-never-fires.mts`); the full-row upsert before round 9 had
    inserted it. Nothing deletes a switch row, so a missing row is a dropped
    write: the statement now inserts the record whole, insert-only, applies,
    and logs `deadman_switch_row_restored`. `KNOWN_LIMITATIONS.md`'s
    Durability item says what that leaves (the switch is in that process's
    memory only until then; round 11: in the deployed layout, where the
    sweep runs in another process, "until then" never came). Test 3 (the switch's `INSERT` fails twice: the
    pass fires it, Postgres has it whole and triggered, the person's copy is
    listed and the notice sent). W06.
-   **The no-row merge put an older status over a committed cancel (Medium,
    fix quality; done).** Round 9 took anything in the mirror that was not
    its own moved record for a write of this process's, and wrote the
    mirror's fields over the row Postgres had; a change notification's
    refresh does that too, and in this very race (the check-in that defeats
    the move also notifies), so a check-in's notification applied during the
    statement and a cancel committed after it ended with Postgres armed again
    (`merge-over-cancel.mts`); and when the move applied, a pre-move entry a
    notification had put in the mirror was left there. Now this process's
    own writes to the switch while its statement runs are noted as they are
    made (the write-through wrapper, `noteOwnSwitchWrite`): only the fields
    they changed are kept over Postgres's row, and the whole row is written
    after them, every column, so Postgres ends as the mirror is; with no
    such write, Postgres's row is taken as it is and nothing is written, and
    the applied branch takes Postgres's row too. Only the owner's deletion
    can write a switch blindly now (below), so that is the one case the
    merge serves (round 11: not so as written; the second cancel and the
    365-day removal were full-row writes from the mirror too, and are
    conditional writes of the content column since round 11). Tests: test 4 of the new file (the verifiers' sequence:
    the cancel stands in Postgres and in the mirror, and nothing is queued),
    and test 13 of the Postgres notices file, whose variants changed: the
    owner's deletion during the statement, over a trigger the old leader
    committed, now leaves the switch cancelled and emptied with the first
    `releasedAt` (it acts on the switch as the mirror then has it, armed, as
    it does a moment before the statement; round 9's test expected the
    trigger kept, which was an effect of the move already being in the
    mirror); a label this process writes during the statement is kept over a
    trigger; and a deletion during this process's own move stands over the
    move, which then writes no notice row (`advanceDeadmanSwitch` returns
    nothing when this process's own write moved the status). W07, W08, W10.
-   **A check-in the app accepted after the worker's trigger set the switch
    back to armed (Medium, fix quality; done).** The check-in and cancel
    routes wrote full rows from their own mirror, unconditionally; the
    app's upsert set `armed` while `released_at`, absent from its record,
    stayed set, so the person's copy stayed readable and their notice was
    sent, the owner was told it had checked in, the owner's view showed no
    notice counts, and later check-ins were accepted
    (`checkin-over-trigger.mts`; it existed before round 9 in this order).
    Now both routes write through `updateDeadmanSwitchIf`, conditional in
    Postgres the same way on the status and the last check-in the route
    read: refused because the switch fired, they answer 409
    `switch_triggered` and write nothing (cancel blanks the copies only after
    its write applied); refused because another check-in or the sweep's move
    into grace came first, the check-in is made again over what Postgres has
    (three tries, then 409 `switch_changed`); not answered in time, 503
    `switch_write_unanswered`, since it may or may not have landed and doing
    it again is safe. In memory and in the file store the condition is
    checked against the mirror, which is the database. Test 5 of the new
    file, through the routes (`app.request`): on a process whose mirror has
    not heard of the trigger, the check-in and the cancel answer 409
    `switch_triggered`, Postgres keeps the trigger, its `releasedAt` and the
    content, the mirror takes it, the copy stays held and listed, and a later
    check-in is refused too; a check-in after another process's check-in is
    made over it with its own time. Test 2 has the 503. R01 to R05. The
    verifiers' probe writes the route's old full-row write itself, not
    through the route, so run again it still shows the old outcome; test 5
    is that sequence through the route.
-   **The statement waited behind the queue with no limit, and the running
    guard then held every later pass (Low, fix quality; done).** Now the
    wait for the queue's turn and the statement together is bounded
    (`switchStatementTimeoutMs`, 30 seconds, a field a test shortens). A
    statement that does not answer in time is logged and not made here; if
    its turn has not come when the bound runs out, it is not run when it
    comes; one already sent can still land, and the next pass then finds it
    applied in Postgres and takes it, the notifier's catch-up writes a
    release's notice rows, and only its event is not emitted. While such a
    statement has not settled, every write of the process is queued behind
    it, so no further conditional write of a switch is queued (each is
    unanswered at once): a stalled database ends a pass after about one
    bound, and the check-in route answers 503. (Round 11: the statement
    waited behind every write the process had queued, to any table, which
    the verifiers found; it now waits only for this process's earlier
    writes of the same switch, the flag stays process-wide, and a landed
    statement is taken and announced when it settles.) The scheduler logs each tick
    its guard skips (`deadman_sweep_tick_skipped`, counts only). Tests: test
    2 of the new file (a statement held past a 200 ms bound: the pass ends,
    nothing in the mirror, a second pass while it stands queues nothing and
    waits out no bound, the owner's check-in answers 503; once it lands, the
    next pass takes it from Postgres, the catch-up writes the row, and the
    notice is sent once; a move queued behind a held write past the bound is
    not run when its turn comes, and the next pass makes it), and test 24 of
    the notices file (the skipped ticks are logged). W03, W04, W05, K01.
-   **A notifier whose claim statement timed out or failed wrote over the
    holder's row (Medium, claims; fixed in code).** `boundedDatabase` threw
    `database_claim_timeout`, `processOne` made that a retry, and the tick
    wrote it with `updateDeadmanReleaseNoticeIf`, guarded only on `pending`,
    as a full-row upsert of this process's mirror row: `attempts`, the
    error, a later `nextAttemptAt` and whatever room the mirror held, over
    the row the claim's holder was working on. With the person's room
    purged and replaced, that put the gone room back, the holder stopped
    before its send (`elsewhere`), and the next attempt made a second
    replacement, with no lease overrun and no stopped process (the
    verifiers' `claim-timeout-write.mts` and `claim-timeout-purged.mts`). A
    claim statement that throws did the same as `notifier_threw`. Now a
    claim whose statement fails or does not answer in time is treated as
    held elsewhere: nothing is asked of the homeserver or written, the row
    stays due, and the notice is counted `elsewhere`
    (`deadman_release_notice_claim_unanswered` logged); one that lands after
    the bound is given up when it lands. So the sentences the verifiers named
    ("a process that cannot take it ... writes nothing", "only where one
    holds the claim past its lease", §11's "replaced once per person") are
    true again; §15, §11, the notifier's header, `KNOWN_LIMITATIONS.md` and
    the changelog now also say that a failed or unanswered claim writes
    nothing, and §11 that until round 10 it was a second way to an extra
    room. Both probes run again: `retried` 0 and `elsewhere` 1, the holder's
    row unchanged, the notice accepted once, and "ONE ROOM" and "ONE
    REPLACEMENT ROOM". Test 16 of the
    Postgres notices file (the worker thread holds the claim, has replaced
    the purged room and is held before its send; the worker's claim
    statement times out, and in a second run throws: counted elsewhere, no
    retry, no room asked for, the holder's row unchanged in Postgres, the
    notice sent once into the one replacement; and a late claim with no
    other holder is given up when it lands, the row untouched and sent at
    the next tick). N01, N02.
-   **§11's room bullet left out the stopped worker (Low, claims; done).**
    Its list of what can leave an extra room now includes a notifier that
    stops after a create has answered and before its queued record of the
    room reaches Postgres, with the alias refused, so design §5 item 2's
    pointer to §11 is complete.
-   **The sweep scheduler's comment, "re-emits nothing and fires nothing
    twice" (Low, claims).** On a database error it did both in the
    standby's own process. True now: a failed or unanswered move is not
    made, and the comment says so.
-   **Decision 27's proxy timeout (Low, claims; done).** It said 300 s, the
    nginx configs' shared snippet. The app calls the API same-origin through
    `location /v1/`, which sets `proxy_read_timeout 1h` in both nginx site
    configs, and production's Caddy (`reverse_proxy app:3000`) sets no read
    timeout at all; checked with `git grep proxy_read_timeout -- infra
deploy` and the Caddyfile. Decision 27 and the `accountLifecycle.ts`
    comment now say so.
-   **"A hold ... left behind when it stopped" (Low, claims; done).** A
    claim the notifier gave up on that landed later, and one whose giving
    up failed, were left too, for good if the account is deleted first.
    The first is now given up when it lands; `KNOWN_LIMITATIONS.md`, the
    changelog and migration 106's comment say "left behind when it stopped
    or could not give it up". Migration 106 is this PR's own and on no
    deployment (`origin/develop` lacks it), so its comment can change
    without a checksum mismatch anywhere it has been applied for real.
-   **Model names in the history (Low).** No action, as in rounds 5 to 9:
    the two trailer lines are required on this branch's commits; the older
    documents on `develop` that name a model need their own change.

What the round also found by reading, and states. The owner's deletion
writes a switch from the deleting process's mirror, unconditionally
(`eraseDeadmanSwitch`, a full-row write), so a deletion in a process that
has not yet heard of a trigger another process committed cancels and empties
that release, its copies included; it did so before round 9 and does with or
without a sweep running. §15, `KNOWN_LIMITATIONS.md`'s deletion paragraph,
the deletion screen, the changelog and the threat model's row now say so,
and decision 30 asks whether to make it conditional.

Run: the verifiers' eight probes, again, on this round's code (in scratch,
`fix/r10/probes/`): `notice-during-statement` (mirror armed when the tick
started, the tick `due` 0 and `sent` 0, no room, no notice row, and the real
trigger an hour later sent once), `copy-during-statement` (mirror armed and
nothing listed during the statement), `one-blip` (no move on the failed
pass, Postgres triggered at the next one, a fresh store sees it),
`dropped-arm-never-fires` (fired at the first pass, the copy listed),
`merge-over-cancel` (Postgres and both mirrors cancelled),
`checkin-over-trigger` (unchanged, as above: it writes the old route's
write itself), and the two claim probes (above).

Not done this round, unchanged: decisions 27 and 29 are the operator's, as
written; the "aside found while probing round 6" stays as it is in Still
open. New operator decision: 30.

### Round 11: what the verifiers found in round 10's fixes

An eleventh pass read round 10's head (`a24630476b`). The attack-replay
verifier found nothing: H1's four bounds held over three rounds and 24 arms
of 64 copies each, with every way around them refused; M1's recorded room
body and the fork's state matched the record; M5 and L15 kept one room per
person under overlapping ticks, two module instances and a refused alias; M4's
no-op passes and the catch-up stayed linear and indexed across a restart on
the file and the Postgres store; L14 held in memory and across processes. The
fix-quality verifier found two Medium and four Low in round 10's fixes, the
claims verifier three Medium and five Low in the documents; the two overlap
on the landed cancel and the dropped arm. Each is fixed or explained here;
the mutation table follows round 10's. `origin/develop` is still
`f6da7b7d16`, so nothing was merged.

-   **A check-in or cancel waited behind the process's whole write-behind
    queue (Medium, fix quality; done).** `writeDeadmanSwitchIf` ran through
    `enqueueCall`, which waited on the queue's one tail: after every write the
    process had queued before it, to any table. A backlog of those past the
    30-second bound answered an honest owner 503 `switch_write_unanswered`,
    set the stalled flag, and the flag then answered every other owner on that
    process 503 at once until the statement settled (the verifiers'
    `checkin-behind-queue.mts`: a check-in behind a backlog took 3.5 s on
    PGlite, and with a 1 ms round trip and a 2 s bound owner A got 503 at
    2.0 s and owner B 503 in 1 ms). Before round 10 a check-in never waited
    for the queue. Now the queue keeps lanes (`writeBehindQueue.ts`): the
    last queued operation on each row (an upsert, a scoped call) and on each
    whole table (a resync), and a scoped call waits only on its row's lane
    and its table's, not on the tail; a queued write of that row, and a
    resync of that table, waits for a scoped call in flight on it, and so
    does everything queued after that write; `drain` waits for the calls
    too. Every switch statement (`writeDeadmanSwitchIf`, and round 11's
    `armDeadmanSwitch`) runs in the switch's lane. So a check-in waits only
    for this process's earlier writes of the same switch and for the
    database, and round 9's order holds: one after a plain write of the
    switch whose insert is still queued waits for the insert and is made
    over the row. The stalled flag stays process-wide, on purpose: one
    statement the database did not answer says the database is not
    answering, and a stalled database should cost a pass one bound, not one
    per switch; with the lane a backlog of other writes no longer sets it,
    and §15 and `KNOWN_LIMITATIONS.md` say so and describe what a statement
    waits for as the process's own earlier writes to the same switch. Test 6
    of `deadman-switch-writes-postgres.integration.test.ts` (a check-in
    behind a held write to another table answers 200 within a 200 ms bound;
    one behind a held plain write of its own switch is 503, its statement
    not run when its turn comes, and the next check-in is made; a check-in
    after a plain write of the switch whose insert is held waits for it and
    applies over the row, with no `deadman_switch_row_restored`). Q01, Q02.
-   **A dropped arming write never fired in the deployed layout (Medium, fix
    quality and claims; done in code).** Round 10's insert-whole restore
    runs only in the process whose mirror holds the switch; in
    `deploy/docker/production` the API process arms with the loops disabled
    and only the worker sweeps, and the write-behind queue announces only
    writes that succeeded, so a dropped arm left a switch only the API
    process listed, which the worker never had and never fired, while the
    owner was answered 201 and their list said armed (the verifiers'
    `dropped-arm-split.mts`). Round 10's "so it still fires" and "done" held
    only where the arming process runs the sweep. Now arming is one awaited
    store call (`armDeadmanSwitch`): in Postgres one call on one connection
    in the switch's lane that checks no switch has the id, writes the copies
    insert-only and then the switch insert-only `RETURNING` it (L5's order
    kept: a stop between them leaves copies no switch names, which nothing
    lists or serves and the named account's deletion blanks like any other);
    the mirror takes the rows only once Postgres has them, they are
    announced, and only then is the owner answered 201. A statement that
    finds the id taken after all, or fails, deletes the copies it wrote
    (best effort, by the call's own `created_at`) and is answered 409
    `release_id_taken` or 500 `switch_write_failed`, nothing in the mirror;
    one not answered within the bound is 503 `switch_write_unanswered` with
    nothing in the mirror, and if it lands later the switch and its copies
    are taken and announced when it settles (below), so the owner's list
    then shows it, and arming the same envelope again is `release_id_taken`.
    Until the store answers, the arm counts toward every bound and its id is
    taken (`armsInFlight` in `deadmanReleases.ts`), so a second arm sent
    meanwhile reads the counts with it. The insert-whole restore on the
    sweep's and the check-in's path stays for rows dropped before this
    change, and its sentences say so. `KNOWN_LIMITATIONS.md`'s Durability
    item, the round-9 and round-10 entries and §15 now say what the code
    does. Test 7 of the switch-writes file (the insert fails: 500, one
    statement not retried, nothing in the mirror, no row and no copy rows in
    Postgres, a worker store hydrates nothing, the owner's list is empty;
    the insert held past a 200 ms bound: 503, nothing in the mirror, and
    once it lands the switch and both copies are in the mirror, announced
    once, a worker store lists them, and the same envelope is 409
    `release_id_taken`; a confirmed arm is in Postgres at the 201 and a
    worker store fires it) and test 8 (the fifth arm naming a person held at
    its insert, the sixth sent meanwhile refused `recipient_limit`); the
    file store's test 2 (the arm, a taken id, a check-in and a cancel through
    the conditional write and the second cancel's content write, each read
    back from a reopened file). Q10, Q12, Q13, Q23.
-   **A database stall failed every check-in at once, and the switch then
    fired at its deadline if the database answered within the tolerance
    (Medium, claims; fixed in code).** While a statement stood unanswered,
    every check-in and cancel was 503 without its statement being sent, and
    the first pass after the stall, within the 15-minute tolerance of a
    deadline, fired a switch whose owner had checked in an hour before it
    (the verifiers' `checkin-during-stall.mts`). "An outage delays a release"
    and the 503 sentences understated it. Now a stall is an outage of the
    sweep for the switches it kept from moving: the store keeps when its
    switch statements began to stand unanswered and when they settled
    (`switchStalls`, the newest 64), and notes a check-in or cancel refused
    `unanswered` with the switch's last check-in as it then stood
    (`unansweredOwnerWrites`, in the process, not in Postgres); the sweep
    gives a switch due at any moment while they stood, or whose owner's
    write was so refused and whose last check-in has not changed since, the
    backlog window instead of firing it, within the tolerance or not
    (`evaluateSweepTransition`'s `stalled`), and clears the note when a
    write of the switch applies, when a check-in landed anywhere, or when
    the switch is terminal. Only the process that runs the sweep knows its
    own stalls and refusals: in the deployed layout a check-in the API
    process refused during a database outage that the worker's own
    statements did not meet (no switch of the worker's was due then) does
    not hold the switch back, and §15, `KNOWN_LIMITATIONS.md` and the threat
    model say so (decision 31 asks whether to carry the refusal into
    Postgres once it answers). The sentences now say that during a stall the
    statement is not sent, so it was certainly not recorded, that an
    unconfirmed move is tried at the first pass after the database answers,
    that no switch moves on the process while one stands, and that an outage
    of the database defers a release as an outage of the sweep does. Test 9
    of the switch-writes file (the verifiers' sequence: a due switch's move
    held past a 200 ms bound, the owner's check-in an hour before the
    deadline 503 in under 150 ms with no statement sent; a switch due while
    the stall stood gets the window at the next pass within the tolerance;
    the owner's switch gets the window at its deadline plus five minutes
    with a 15-minute tolerance, `backlogGraceStartedAt` set, `releaseAt` 72
    hours out, `releasedAt` null; another owner refused the same way whose
    check-in then landed on another process fires as usual; the owner's
    next check-in lands and ends the window, and the note is cleared). Q04,
    Q05, Q06, Q24.
-   **A cancel answered 503 whose statement landed left every copy held, the
    mirror armed, and told no process (Low, fix quality; Medium, claims;
    done).** The route blanked the copies only after an `applied` answer,
    and the timed-out statement's settle handler only cleared the flag, so a
    landed cancel left Postgres cancelled and emptied with every copy held,
    the mirror and the owner's view armed, no announcement, a later check-in
    answered `switch_cancelled` and the panel said the text was removed
    while the copies stayed until a second cancel nobody was told to make
    (the verifiers' `cancel-503-landed.mts`). The same settle path left a
    landed trigger unannounced, so "in the moment before your deletion"
    understated the window. Now when a timed-out statement settles having
    landed, `settleSwitchStatement` reads the switch again in its lane
    (after any write of it this process queued meanwhile), takes it into the
    mirror unless a newer write or refresh replaced the entry or a
    conditional write of it is in flight, takes an arm's copies the mirror
    lacks, announces the switch (and each such copy) to the other processes,
    and blanks the held copies of a switch found cancelled
    (`blankHeldCopiesOf`); a refused write that reads the switch cancelled
    blanks them too, as does the check-in's `switch_cancelled` answer and
    each sweep pass (`removeExpiredReleases`, for any cancelled release
    switch still holding copies, which also catches the cross-replica
    re-seal §15 described). §15, §10, `KNOWN_LIMITATIONS.md` (Retention and
    the check-in bullet), the threat model's row, the deletion screen and
    the changelog now say so, and "in the moment before" became "in the
    moments before ... a firing is announced once the database confirms it".
    Tests: test 10 of the switch-writes file (the verifiers' sequence: 503,
    nothing in the mirror, then once it lands the mirror has it cancelled,
    both copies are blanked in Postgres, the release read lists nothing, the
    switch is announced once, the owner's view says cancelled with no
    release, a store told of it agrees, and a fresh process holds no copy),
    test 4 (a refused move over a cancel committed elsewhere queues only the
    two copies' blanking, the switch row untouched, and does so with no
    sweep pass), test 12 (a check-in finding the switch cancelled on its
    third attempt blanks them) and test 13 (the removal pass blanks a
    cancelled switch's held copies; the check-in's answer does too). Q07,
    Q07b, Q08, Q09, Q15, Q18.
-   **The announcement after a conditional switch write was untested (Low;
    done).** Test 11 of the switch-writes file gives this process a
    recording transport: an applied move publishes one `deadmanSwitches`
    `u` for the id, a store refreshed from it has the switch fired with its
    `releasedAt` and the person's held copy, and a refused move (the owner
    checked in on the other process first) publishes once too. The file's
    transport records every announcement from round 11 on, and tests 2, 7
    and 10 assert on it. Q25 (the verifiers' X1, the publish removed) fails
    it.
-   **Unpinned answers (Low; done).** The cancel's 503 is test 10; a
    check-in or cancel refused three times over other check-ins is 409
    `switch_changed` with three attempts made and nothing written (test 12,
    through the routes, another process checking in before each attempt);
    the file store's check-in and cancel through `updateDeadmanSwitchIf`
    and its arm are read back from a reopened file (the file test's test 2).
    On the third attempt the routes now look at the switch as the refusal
    read it before giving up, so a refusal over a trigger is 409
    `switch_triggered` and over a cancel 409 `switch_cancelled` (the
    check-in blanking the copies) on any attempt (test 12; §15 and
    `KNOWN_LIMITATIONS.md` say so). Q14.
-   **"A cancelled switch never gets `releasedAt`" (Low, claims; fixed in
    code).** The owner's deletion over a trigger committed elsewhere leaves
    the switch `cancelled` with its `releasedAt` (decision 30; round 10's
    test 13 asserts it), and `releasedCopiesFor`, the notifier's `processOne`,
    its catch-up and `awaitsTrigger` keyed on `releasedAt` alone, so only the
    emptied content kept such a switch unserved. Now `standsFired`
    (`triggered` with `releasedAt`) is what every reader asks, and the
    removal pass too; §15's two sentences and "Checks not written" say so.
    Test 14 (a fired and listed release, cancelled with `releasedAt` and
    content kept: not listed, the catch-up writes nothing, its pending
    notice ends `release_unavailable`, nothing sent). Q19, Q20.
-   **"Only the owner's deletion can write a switch blindly now" (Low,
    claims; fixed in code).** The second cancel (`updateDeadmanSwitch(id,
{ encryptedPayload: '' })`) and the 365-day removal wrote the whole row
    from this process's mirror, and the removal on the worker could put
    back a label the owner's deletion on the API process had just erased.
    Both are conditional writes of the content column now
    (`updateDeadmanSwitchIf`, on the switch as read); a second cancel the
    database does not answer is 503, and a removal it refuses or does not
    answer is left for the next pass. The blind switch writers left are the
    owner's deletion (`eraseDeadmanSwitch`, decision 30) and the plain
    `createDeadmanSwitch` and `updateDeadmanSwitch`, which no route calls in
    Postgres mode any more (the memory and file stores' arm uses the first).
    The round-10 entry and §15 say so. Test 13 (a fired switch whose label
    the API process erased: the worker's removal empties the content and the
    label stays erased; a cancelled switch with its payload kept and its
    label erased in Postgres: the second cancel empties the content and the
    label stays erased). Q16, Q17.
-   **Outage sentences (Low; done).** `KNOWN_LIMITATIONS.md`'s Durability
    and check-in bullets and §15 now say: an unconfirmed move is tried at
    the first pass after the database answers; while a statement stands
    unsettled no switch moves on that process; a database outage longer
    than the tolerance, and since round 11 any stall since the switch was
    due, defers an overdue switch by the backlog window as a sweep outage
    does; and "An outage delays a release" names the sweep's and the
    database's outages, with check-ins refused meanwhile.
-   **Model names in the history (Low).** No action, as in rounds 5 to 10:
    the two trailer lines are required on this branch's commits; the older
    documents on `develop` that name a model need their own change.

Claims that were not true, and what they say now (this round's): §15's
"after every write the process queued before it" (now the switch's lane);
"only the owner's deletion can [write a switch blindly]" (the second cancel
and the removal too; now conditional); "the next pass does" (the first pass
after the database answers); "the next pass then finds it applied ... and
only its event is not emitted" (now taken and announced when it settles);
§15's "**Cancel** blanks every copy" and §10's "cancel removes them ... on
one API process" (now with the landed-late case and the sweep's blanking);
§15's "which a cancelled switch never gets" and "`releasedAt` is written
with the trigger and only then" twice (now `standsFired`); round 10's "so it
still fires" and "done" for the dropped arm (where the arming process runs
the sweep; the deployed layout's case is this round's fix); §15 and
`KNOWN_LIMITATIONS.md`'s "the rows are written ... each row is its own
write-behind upsert, committed after the 201" (now one awaited call before
the 201); `KNOWN_LIMITATIONS.md`'s "An outage delays a release by its own
length plus up to 72 hours" twice and "it may or may not have been
recorded" (now with the stall, during which it was certainly not sent, and
the database's outage); "tried again at the next pass" (the first pass after
the database answers); "in the moment before your deletion" in
`KNOWN_LIMITATIONS.md`, the deletion screen, the changelog and the threat
model's row (now "in the moments before ... a firing is announced once the
database confirms it"); and "until it is cancelled again" in §10, §15,
`KNOWN_LIMITATIONS.md` and the threat model (until the next sweep pass
blanks it).

Run: the verifiers' four probes, again, on this round's code (in scratch,
`fix/r11/probes/`, importing the worktree's sources): `cancel-503-landed`
(the cancel answered 503; once it landed, Postgres cancelled and emptied,
both copies blanked, one notification published, the mirror and the owner's
view cancelled, a check-in afterwards 409 `switch_cancelled`, and a fresh
process holding no copy), `checkin-during-stall` (the check-in an hour before
the deadline 503 in 29 ms with one `UPDATE` sent in all; the first pass after
the stall, five minutes past the deadline with a 15-minute tolerance, moved
the switch to `grace` with `released_at` null), `dropped-arm-split` (the arm
with its insert failing answered `write_failed`; no row, no notification, the
worker's store neither has nor lists it, the app's mirror has nothing, the
owner's list is empty, and a check-in on the switch is 404), and
`checkin-behind-queue` with the verifier's 1 ms round trip and 2 s bound
(three sign-outs' resyncs of 3,000 refresh-token rows ahead in the queue, each
about 6 s on PGlite: owner A's check-in 200 in 18 ms, owner B's 200 in 4 ms,
where round 10's code gave A 503 at 2.0 s and B 503 in 1 ms).

Not done this round, unchanged: decisions 27, 29 and 30 are the operator's,
as written, and decision 30's conditional erase was not built; the "aside
found while probing round 6" stays as it is in Still open. New operator
decision: 31. Not pinned by a test: the reverse lane order (a plain write of
a switch queued while its statement is in flight waiting for the statement),
stated in Still open.

### Claims that were not true, and what they say now

1.  Decision 4, §13, §15, `deadmanReleases.ts` and the protocol's constant:
    "a bound on storage of about 10 MB per account", "bounds storage only".
    The cap bounded live switches; fired ones were held outside it. Now the
    cap counts held content, and decision 4 states the measured numbers.
2.  §11, §15, E16, P3-L4's comment, design §5, `TRUST.md`, `KNOWN_LIMITATIONS.md`,
    `THREAT_MODEL.md`, the notifier's header and a test title: the room "is
    not end-to-end encrypted ... the bot cannot encrypt". The fork encrypted
    it. Now the room is created so that it is not, and each sentence says how.
3.  `DataRetentionSection.tsx` and `KNOWN_LIMITATIONS.md`: a fired switch
    "stays readable ... until 365 days after it fired". True of a release
    switch; a legacy switch's payload is held with no removal date. Both say
    so now, and the two `KNOWN_LIMITATIONS.md` paragraphs agree.
4.  `KNOWN_LIMITATIONS.md`, R12, the legal changelog: "It cannot read the
    message." Now with §10's condition, and `TRUST.md`'s bullet carries it.
5.  §11 and decision 14, "one standing room per account"; §15, "a crash makes
    no second room". One per account per non-overlapping tick, and once per
    notice after a purge. Now one per person within one process, with the
    slot, the running guard and the move of rows.
6.  §11, "a crash between the two loses nothing". A row before the trigger
    was ended and never re-created. Now left alone and sent after the trigger.
7.  §15, "every refused homeserver call ... is a retry"; the notifier's
    "nothing here throws for one bad notice". A thrown invite threw out of
    the tick. Now every call is guarded per notice.
8.  §15, "answers 409 before the body is read"; the module's comment; test
    1's title. The body cap runs first. Now "before the body is parsed", with
    the cap named first.
9.  §8, "each refused with their own code". Three codes, as §15 has it; §8
    names them now.
10. §15 and `.env.example`, "on only for `1` or `true`". Any casing and
    surrounding whitespace; both say so.
11. §15, "no copy is written to a cancelled switch"; §10's "cancel removes
    them from an honest server's database". Within one process; §15 says
    what the cross-replica window can leave.
12. §15, "the rows are written with no await between". In the mirror; the
    Postgres upserts commit after the answer. §15 says so, and the order is
    now copies first.
13. §15, "its pending notices end with `recipient_gone`". Not when the
    deletion landed during the send. Now it does, and §15 says so.
14. The protocol's `releasedAt` and `removesAt` docstrings and the Retention
    bullet. Now the server's word, and the sweep's first pass on or after.
15. `DataRetentionSection.tsx`, "the public half of your release keys is
    removed". Except the copy kept with a fired release switch; it says so.
16. `KNOWN_LIMITATIONS.md`'s Retention bullet and the legal changelog, by
    omission: what stays after the removal. Both say it now.
17. (Round 2.) §11, §15, decision 4, `deadmanReleases.ts`,
    `KNOWN_LIMITATIONS.md`, `TRUST.md`, `THREAT_MODEL.md` and the changelog:
    "at most 20 / 10 / 5 / 50", and "two arms racing on one replica can
    exceed a bound by one". True of arms made one after another; a burst of
    N exceeded each by N − 1. Now every bound is read again before the
    writes, and each sentence says on one process, and what replicas can do.
18. (Round 2.) `KNOWN_LIMITATIONS.md`'s deletion paragraph: "the record of
    each notice (its room, status and attempts) stays". The code forgets the
    room. Now "its status and attempts, with its room forgotten".
19. (Round 2.) Test 1's title and PR 1's test: "before the body is read"; the
    L13 entry above said the title had been changed. Both renamed to
    "parsed", and the entry says what happened.
20. (Round 2.) §15 and `KNOWN_LIMITATIONS.md`: "never a switch without
    copies", of a crash. A copy's upsert dropped after its retry leaves one
    with no crash; both say so.
21. (Round 2.) §15's "its pending notices end with `recipient_gone`" and the
    notifier's header, "a deletion that landed during the send has already
    ended the row, and that stands": not when the homeserver then refused the
    send, and not when the deletion landed during `createRoom`. Now the row
    is read again after every call and before any write, and both say so.
22. (Round 2.) The notifier's header and §15 described the running guard
    without its consequence: one hung call held every notice for five
    minutes. Now each call ends at 30 s, and both say what a tick can still
    take.
23. (Round 2.) The M1 note above named one other `private_chat` +
    `encrypted: false` site; there are three. It names them.
24. (Round 3.) `TRUST.md` §1, §11, decision 14, `KNOWN_LIMITATIONS.md` and
    the changelog: one room per person. A `createRoom` the homeserver
    finished after the timeout left an extra room per attempt. Now the
    room's alias finds it, and each says what can still leave one.
25. (Round 3.) `KNOWN_LIMITATIONS.md` and §11, "typically under a second";
    §15, "typically sub-second". Measured by nothing, and contradicted by the
    write-behind queue in the burst case the sentences were about. Now: by
    up to a burst's own size until the queues drain, not measured.
26. (Round 3.) The notifier's header and `KNOWN_LIMITATIONS.md` stated a
    homeserver that answers nothing and not one that answers slowly. Now
    both, with the number of calls a notice makes.
27. (Round 3.) `THREAT_MODEL.md` §5, the Release identities row: "account
    deletion removes the public halves"; the changelog's 2026-10-26 entry,
    the same. Except the identity kept with a fired release; the row says
    so and the entry points at the later one.
28. (Round 3.) §15, "read once per copy per arm". Twice.
29. (Round 3.) §15, "Logs carry counts only". Counts, and a thrown error's
    message.
30. (Round 3.) §15, decision 12 and the changelog, "only the owner's own
    copy goes". The label goes too.
31. (Round 3.) The P3b-L2 entry, "`inviteToRoom` itself is unchanged".
    Round 2 added a `signal`; its answer is unchanged.
32. (Round 3.) The `THREAT_MODEL.md` and `TRUST.md` headers dated the
    dead-man text 2026-10-29. Each now has its 2026-10-30 entry.
33. (Round 3.) Test 2's title: the homeserver's backstop "leaves" the room
    unencrypted, which the stub cannot show. Now the body the API asks for.
34. (Round 3.) §11, "one person receives at most 50 notices in any 365
    days". Notice rows; a send accepted and answered late can repeat once
    the transaction id has aged out. Now said.
35. (Round 4.) §11, §15, the round-3 entry, the notifier's comments, test
    17's title: a room found through the alias with no `m.room.create` "is
    still being made and is waited for". Not when the homeserver abandoned
    the create after writing the alias; that room never completes. Now it is
    waited for one backoff and then replaced by a room without the alias,
    and each says what that leaves (round 5: one backoff from when the first
    look was recorded, claim 50).
36. (Round 4.) The notifier's header and `createNoticeRoom`'s comment: the
    room is "in no directory", "out of every directory". Its alias is in the
    alias directory; only the public room list leaves it out. Now said.
37. (Round 4.) `THREAT_MODEL.md` §5, the Dead-man row: "ciphertext it cannot
    read", "cannot read, alter or forge one". Now with R12's condition.
38. (Round 4.) The same row: "one per person", "exceeded across replicas only
    within the store's refresh window", "cancel clears ... every copy". Now
    qualified as everywhere else.
39. (Round 4.) §10, `KNOWN_LIMITATIONS.md`, the changelog: cancel removes
    every copy. On one API process; across replicas a re-seal can leave one.
    The record's claim 11 had said §10 was handled; it was not changed then.
40. (Round 4.) §15, `KNOWN_LIMITATIONS.md`, the deletion screen, the
    changelog: a deleted recipient's copies are removed. Not when a re-seal
    raced the deletion, on one process; now refused there, and the
    cross-replica window is stated.
41. (Round 4.) `KNOWN_LIMITATIONS.md`'s extra-room cases, without a wrong bot
    id; §11, §15 and the header, the derived id cached after a whoami "the
    homeserver refused" or "has answered". Any whoami not cut short, from any
    caller. Now said.
42. (Round 4.) §11, §15 and the header: transaction ids kept "about 30
    minutes", "for a while". 30 to 60 minutes in memory, or 24 hours in the
    database for a token with a device. Now said.
43. (Round 4.) The deletion screen and `KNOWN_LIMITATIONS.md`, "until 365 days
    after it fired"; the Retention bullet and the changelog, a notice's
    "room, status and attempts until that person deletes their account". At
    least 365 days, removed at the first sweep after; status and attempts
    stay after deletion. Now said.
44. (Round 4.) The round-3 entry: "no tracked file names a model". No file
    this branch adds or changes does; some older documents elsewhere do.
45. (Round 4.) `NotifierResult.failed`, "ended without a send", counted rows
    another process had sent. Now counted as they ended.
46. (Round 5.) Decision 18 and the documents stating the bound of 50
    (`KNOWN_LIMITATIONS.md`, `TRUST.md`, `THREAT_MODEL.md`, the changelog),
    by omission: that ten accounts can fill one person's 50 and hold it,
    and nobody can clear it. Now said, with the alternatives for the
    operator.
47. (Round 5.) §15, the notifier's header and `KNOWN_LIMITATIONS.md`'s
    "with its room forgotten": a deletion during a send "stays failed ...
    with no room". Not across the app/worker split; now true there through
    the conditional writes, with what that leaves stated.
48. (Round 5.) §11 and the notifier's header: an abandoned create "leaves
    the alias naming a room with no events for good". Also with the create
    alone, or the create and the bot's join; now each shape is named and
    replaced.
49. (Round 5.) §11 and the header: the room has "power levels that let only
    the bot post or invite". Not one found through the alias after a create
    abandoned before the batch; now such a room is not used.
50. (Round 5.) Decision 26, §11, the notifier's header and `checkRoom`'s
    comment, the round-4 entry, claim 35 and `KNOWN_LIMITATIONS.md`: "waited
    for one backoff (30 s at the least)". Not after a long tick; now true in
    code, and each says the wait runs from when the first look was recorded.
51. (Round 5.) `THREAT_MODEL.md`'s Release identities row,
    `KNOWN_LIMITATIONS.md`, the changelog's 2026-10-26 entry, `removesAt`'s
    comment and §1: "until 365 days after it fired". Now at the first sweep
    at least 365 days after.
52. (Round 5.) §11's Sending bullet: whoami "until a whoami has been
    answered or has failed once". Not one cut short by the timeout. Now said.
53. (Round 5.) P3b-M2's Done, P3b-L9, P3b-L10 and the round-3 entry
    described wording that later rounds replaced as what the texts say now.
    Now each points at the current wording.
54. (Round 5.) P3b-M5's Done: "the leader lock keeps the loops to one
    process". Except during a handover. Now said.
55. (Round 5.) Still open: the alias "run only against the stub". Two of its
    cases were run on the fork in scratch. Now said.
56. (Round 5.) `TRUST.md`'s review header: the notices room "kept to one per
    person". Now with the exception the section body states.
57. (Round 5.) The deletion screen, `KNOWN_LIMITATIONS.md` and the changelog,
    the deletion: "a notice still owed to you is dropped". One the bot was
    already sending can still arrive. Now said.
58. (Round 6.) Decision 18, §11, the round-5 entry, Still open,
    `KNOWN_LIMITATIONS.md`, `TRUST.md`, `THREAT_MODEL.md` and the changelog:
    ten accounts "fill one person's 50". The same arms fill it for up to 64
    people: 128 a day, 256 within the held cap, about 26 per attacking
    account, and decision 18's options were costed at one person each. Now
    said, with each option's cost per person blocked.
59. (Round 6.) `recipientHasRoom`'s comment: one code for both bounds
    because a second "would say how many others have named the person". It
    hides nothing from an owner below 5. Now said.
60. (Round 6.) §15, the round-5 entry and the notifier's header: "every
    notifier write is also conditional in Postgres". The creation of a row
    was a plain upsert; now insert-only, and said.
61. (Round 6.) §15, the notifier's header, decision 14, §11's Retention,
    `KNOWN_LIMITATIONS.md` and the changelog: a deletion the API process
    committed "stands in the database", and every notice row of the account
    "forgets the room". Not for a row the API process had not yet seen. Now
    true through the worker's read of the copy from Postgres and the
    deletion's last statement, with what that leaves stated.
62. (Round 6.) Round 5's mutation note: W16 "is equivalent ... nothing
    observable changes". It can land over another notifier's `sent`; now a
    test kills it, and the note says so.
63. (Round 6.) §15: the releases file has 25 tests. 26 then, 27 now.
64. (Round 6.) Decision 4 and the round-3 entry, "for up to 365 days";
    decisions 4, 12 and 17, §13 and the protocol's docstring, a flat "365
    days after". At least 365 days, at the first sweep pass after. Now said.
65. (Round 6.) §11, §13, `THREAT_MODEL.md` and the protocol's docstring,
    what one account can make the server keep "is bounded". The content is;
    the rows are not. Now said.
66. (Round 7.) Round 6's entry, §15, the notifier's header and its catch-up
    comment: the catch-up's create "does not set it back to pending", given
    as stopping the re-send after a leader handover. True of Postgres; the
    new leader's own tick sent it again from its mirror, and with the alias
    refused made a second room. Now fixed in code, and said.
67. (Round 7.) `KNOWN_LIMITATIONS.md`: "The bot makes one such room for you
    and reuses it." Not in the alias-refused handover; now with the cases
    that leave an extra room, two notifiers at once included.
68. (Round 7.) §15, the round-6 entry and the notifier's header: "once one
    has committed nothing is made or sent for that person". Across processes
    a room was made, or the person invited, after a deletion committed during
    a state read. Now read right before each create and re-invite too, with
    what is left stated; the user-facing texts add the invitation.
69. (Round 7.) §15's deletion bullet: an in-flight notice "stays `failed`",
    a row the API process had not seen included. Such a row ends `sent` with
    no room if the worker's write comes first. Now said.
70. (Round 7.) The protocol's `recipient_limit` docstring and §15: one code
    "so the answer does not say how many others have named that person". It
    hides nothing from an owner below 5. Now said.
71. (Round 7.) The store's comments, §15 and the round-6 entry: the route
    answers "only when the deletion is in the database" / "durable"; the
    copies are blanked "before anything else". The queued writes have been
    attempted (one that fails twice is dropped), and the copies go before the
    notices end and the user row is deleted. Now said.
72. (Round 7.) The notifier's header, §11, §15 and `KNOWN_LIMITATIONS.md`:
    "a notice makes up to seven calls", "about three and a half minutes" and
    "about three hours"; the interval's docstring, "each call it makes is
    bounded". Round 6's database reads were in neither, and unbounded. Now
    bounded and counted: seven calls and four reads, five and a half minutes,
    four and a half hours.
73. (Round 7.) The notifier's header and design §5 item 2: the room made
    "once per account", "one standing room per account". One per person and
    reused, except where §11 says. Now said.
74. (Round 7.) Develop's status paragraph, merged: part 1's fixes "were then
    read again three times". Four: the second to the fifth reading. Now said.
75. (Round 8.) The notifier's header, §15 and the round-7 entry: a new leader
    "takes the room the old leader recorded rather than make another";
    `KNOWN_LIMITATIONS.md`, `TRUST.md` §1, `trust.html` and the threat
    model's row: an extra room only from two processes "working on the same
    notice at the same moment". A new leader alone made a second room for
    another of the person's notices with the alias refused. Now fixed in
    code, and the residual named as two of the person's notices too.
76. (Round 8.) `KNOWN_LIMITATIONS.md`: "it waits one retry (at least 30
    seconds after it first looked)"; round 5: "a retry waits a backoff from
    when it is recorded". Across a handover the second look came seconds
    after the first. Now fixed in code, and true as written.
77. (Round 8.) The store's comment and §15: the stored row "is at least as
    new as the mirror's", and "the stored row goes into the mirror". Not
    after a dropped write. Now qualified, and a pending row keeps a room or
    a re-invite the mirror has and Postgres lacks.
78. (Round 8.) `KNOWN_LIMITATIONS.md`, §15, the round-7 entry, Still open and
    the notifier's header: with two notifiers, "the homeserver drops the
    second" send; design §5 item 2: "One `m.text` per recipient per
    release". Only within one room. Now said there and in §11, `TRUST.md`
    §1, the threat model's row and the changelog.
79. (Round 8.) Decision 27, §15, the deletion screen, `KNOWN_LIMITATIONS.md`
    and the changelog on the deletion route's bound: past it the route
    answered before any of the deletion's writes were in Postgres, and the
    worker then made a room, invited and sent. Now fixed in code, and the
    texts say what the confirmation waits for.
80. (Round 8.) §15: a row the API process had not seen keeps what the worker
    wrote when the last statement "does not finish within the route's 10 s".
    It goes on and lands. Now "until it has run".
81. (Round 8.) The policy changelog: the notices room made "once per person",
    an extra one from "a slow homeserver" and "empty". Now with the handover
    case, which posts the notice in each room.
82. (Round 8.) The deletion route's comment, test 27's comment and the
    round-7 entry: revoking first means no other request "runs as the
    deleted account". Only the deleting session's token is revoked. Now said.
83. (Round 8.) The Postgres notices file's `deleteOnApp`: every write the
    deletion queued "is in Postgres" by the answer, claim 71's sentence left
    in a test. Now "attempted".
84. (Round 9.) `TRUST.md` §1, in bold: "Every private room and direct
    message is end-to-end encrypted by default." The notices room is a
    direct message the bot leaves unencrypted on purpose. Now the sentence
    names that exception; `trust.html` regenerated.
85. (Round 9.) §15, "a crash after the answer makes no second room"; the
    notifier's comment, "a crash here does not make a second room"; round
    8's "What is left is two notifiers ... at the same moment"; and the
    extra-room cases in `KNOWN_LIMITATIONS.md`, `TRUST.md` §1, the threat
    model's row, the changelog and Still open. A worker that stops before
    its queued record of the room lands leaves, with the alias refused, a
    second room with no second notifier. Now said in each.
86. (Round 9.) Decision 27 and the `accountLifecycle.ts` comment: a pool
    that never hands out a connection "holds the answer for good", with a
    connection timeout as the option. A query that never answers holds it
    too, which a connection timeout does not end, and a proxy ends the
    request first while the deletion stands in the API process and its
    writes are still queued; the screen then said "Deletion failed". Now
    said, the option includes a statement timeout, and the screen says the
    deletion may not have finished.
87. (Round 9.) The deletion screen, `KNOWN_LIMITATIONS.md` and the
    changelog: "a notice still owed to you is dropped once your deletion is
    confirmed", the wait attached to deployments that run the background
    work separately. A blanked copy whose write was dropped lets the worker
    send after the confirmation until the last statement has run, and the
    wait happens wherever there is a database. Now said.
88. (Round 9.) Decision 14 and §11's retention bullet: a row keeps its room
    "unless the deletion's last statement fails". Also until it has run,
    which can be after the answer, and for good if the API process stops
    first. Now §15's wording.
89. (Round 9.) Design §5 item 2's qualifier named only the handover. A
    repeat in one room is dropped only while the homeserver keeps the
    transaction id. Now said.
90. (Round 9.) The notifier's comment: a conditional write "lands only on a
    row still as this process read it". Only on a row still pending. Now
    said.
91. (Round 9.) Test 12's title, round 8's entry and §15: "the deletion
    route answers ...". The test calls `finishAccountDeletion`, which the
    route awaits. Now retitled, and the record says so.
92. (Round 10.) Round 9's entry and test 13's comment: a check-in the API
    process committed within the lag "stands", and the notice "is sent
    once in all, or not at all". While the sweep's statement waited, the
    same process wrote and sent the notice and listed the person's copy for
    a trigger Postgres then refused, and the real trigger later sent
    nothing; test 13 ran the notifier only after the sweep had finished.
    Now true in code (the mirror takes a move only once Postgres has applied
    it), and test 1 of the switch-writes file runs a tick during the
    statement.
93. (Round 10.) Round 9's entry, §15 and the store's comment: a database
    error keeps the move in the mirror "as a write-behind write that failed
    twice is". It had failed once, and nothing retried it. Now the move is
    not made and the next pass makes it; said in §15 and the comment.
94. (Round 10.) The sweep scheduler's comment: the conditional move
    "re-emits nothing and fires nothing twice". On a database error it did
    both in the standby's own process. True now; the comment says why.
95. (Round 10.) §15 and round 9's entry: "a process that cannot take [the
    claim] ... writes nothing ... its row stays due", and in §15, §11, the
    notifier's header, `KNOWN_LIMITATIONS.md`, `TRUST.md` §1, the threat
    model and the changelog, two notifiers work on one person's notices at
    once "only" where one holds the claim past its lease, and §11's "a room
    the homeserver no longer has is replaced once per person". A claim
    statement that timed out or threw wrote a retry over the holder's row,
    which could lead to a second replacement room. Now true in code (such a
    claim writes nothing); §15, §11, the notifier's header,
    `KNOWN_LIMITATIONS.md` and the changelog also say a failed or unanswered
    claim leaves the person's notices alone.
96. (Round 10.) §11's room bullet: its list of what can leave an extra room
    lacked the notifier that stops after a create has answered (round 8's
    R8-5), which design §5 item 2 points readers to. Now listed.
97. (Round 10.) Decision 27: the proxy's read timeout is "300 s in the nginx
    configs' shared proxy snippet". The app's same-origin `location /v1/`
    sets 1 hour in both site configs, and production's Caddy sets none. Now
    said there and in the deletion's comment.
98. (Round 10.) `KNOWN_LIMITATIONS.md`, the changelog and migration 106's
    comment: a leftover claim row is one "left behind when it stopped". One
    the notifier gave up on that landed later, or whose giving up failed,
    was left too. The first is now given up when it lands; the sentences say
    "stopped or could not give it up".

### Raised and refuted

**SL-1 (storage lens; Medium as raised).** Account deletion leaves, on each
blanked copy row, the deleted account's id and the fingerprint of the key the
copy was sealed to, and on each notice row the account id, status, attempts
and timestamps. The observable fact holds and is now stated (P3b-L10). The
harm paths do not: the fingerprint is SHA-256 over bytes that include the
account id, so a deleted account's fingerprint matches no identity published
under another account; the server keeps the account id in the switch's
recipients by decision 12 anyway; identity rows are keyed by random ids and
blanked without account or fingerprint, so nothing links back; no API serves
a blanked copy row; and the user-facing sentences are literally true, since a
hash of the public keys is not "the public half" and cannot be inverted to
it. Not re-raised; `recipient_fingerprint` is not blanked.

### Every new check removed once

Each row: the check taken out, the one test file run against the mutated
source, and the test that failed (the files otherwise pass 21, 21, 3 and 1).
Forty checks, forty caught; the sources were restored and the diff checked
unchanged after the run. A forty-first mutant, dropping the "is the copy
still held" test inside the per-recipient count, survived: a cancelled
switch's content is blanked, so the content test already skipped its copies,
and the check had no observable effect; it was removed rather than kept
untested, and the function's comment says what a blanked copy on a held
switch means. The two mutants of P3b-L14 were first shadowed by each other
(a deletion removes the account too) and were re-run against a test case that
ends the row while the account exists.

| Check removed                                                                             | Test file                                       | What failed                                                                      |
| ----------------------------------------------------------------------------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------- |
| H1(a): the cap counts held content, fired switches included (the old live count put back) | `deadman-releases.integration.test.ts`          | test 7: at most 20 release switches per owner with content held: fired ones co…  |
| H1(a): the held cap is checked                                                            | `deadman-releases.integration.test.ts`          | test 7: at most 20 release switches per owner with content held: fired ones co…  |
| H1(b): the arming rate is checked                                                         | `deadman-releases.integration.test.ts`          | test 6: at most 10 release arms in any 24 hours: the 11th is 429 with Retry-Af…  |
| H1(b): a cancelled arm still counts toward the rate                                       | `deadman-releases.integration.test.ts`          | test 6: at most 10 release arms in any 24 hours: the 11th is 429 with Retry-Af…  |
| H1(b): Retry-After says when one more fits                                                | `deadman-releases.integration.test.ts`          | test 6: at most 10 release arms in any 24 hours: the 11th is 429 with Retry-Af…  |
| H1(c): the per-recipient bounds are checked                                               | `deadman-releases.integration.test.ts`          | test 8: at most 5 held releases from one owner may name one person, and 50 fro…  |
| H1(c): the 5-from-one-owner bound                                                         | `deadman-releases.integration.test.ts`          | test 8: at most 5 held releases from one owner may name one person, and 50 fro…  |
| H1(c): the 50-from-everyone bound                                                         | `deadman-releases.integration.test.ts`          | test 8: at most 5 held releases from one owner may name one person, and 50 fro…  |
| H1(a): the number 20                                                                      | `deadman-releases.integration.test.ts`          | test 7: at most 20 release switches per owner with content held: fired ones co…  |
| H1(b): the number 10                                                                      | `deadman-releases.integration.test.ts`          | test 6: at most 10 release arms in any 24 hours: the 11th is 429 with Retry-Af…  |
| H1(c): the number 5                                                                       | `deadman-releases.integration.test.ts`          | test 8: at most 5 held releases from one owner may name one person, and 50 fro…  |
| H1(c): the number 50                                                                      | `deadman-releases.integration.test.ts`          | test 8: at most 5 held releases from one owner may name one person, and 50 fro…  |
| H1(b): the Retry-After header on the 429                                                  | `deadman-releases.integration.test.ts`          | test 6: at most 10 release arms in any 24 hours: the 11th is 429 with Retry-Af…  |
| H1(e): /limits reports every bound                                                        | `deadman-releases.integration.test.ts`          | test 14: GET /limits says what the arming form may say, from the deployment’s o… |
| L4: arming closed where the sweep is off                                                  | `deadman-releases.integration.test.ts`          | test 2: with the sweep switched off in the API’s own environment, arming is re…  |
| L4: /limits says why                                                                      | `deadman-releases.integration.test.ts`          | test 1: with the flag off, arming is refused with 409 before the body is parsed… |
| L4: the 409 names the sweep                                                               | `deadman-releases.integration.test.ts`          | test 2: with the sweep switched off in the API’s own environment, arming is re…  |
| the route refuses while arming is closed                                                  | `deadman-releases.integration.test.ts`          | test 1: with the flag off, arming is refused with 409 before the body is parsed… |
| L5: the copies are written before the switch (the switch first, as first built)           | `deadman-releases.integration.test.ts`          | test 3: with the flag on, an owner arms a release switch: the row, one copy pe…  |
| L8: only fired switches’ notice rows are exported                                         | `deadman-releases.integration.test.ts`          | test 15: the export lists an owner’s release switches without any copy, and a r… |
| L8: the notice rows are exported                                                          | `deadman-releases.integration.test.ts`          | test 15: the export lists an owner’s release switches without any copy, and a r… |
| M4: copies listed by switch through the index, not a scan                                 | `deadman-releases.integration.test.ts`          | test 20: the 365-day removal lists each release’s copies by switch: a pass over… |
| M4: notices listed by switch through the index, not a scan                                | `deadman-releases.integration.test.ts`          | test 20: the 365-day removal lists each release’s copies by switch: a pass over… |
| M4: a wholesale refresh of the Postgres mirror keeps the index                            | `deadman-releases-postgres.integration.test.ts` | test 1: a release switch, its copies and its notices survive a restart; it has…  |
| M4: the file store rebuilds the index on hydrate                                          | `deadman-releases-file.integration.test.ts`     | test 1: a release switch, its copies and its notices survive a restart of the …  |
| M1: the public_chat preset                                                                | `deadman-release-notices.integration.test.ts`   | test 2: the notifier makes a direct room the homeserver’s backstop leaves unen…  |
| M1: the invite-only join rule in initial_state                                            | `deadman-release-notices.integration.test.ts`   | test 2: the notifier makes a direct room the homeserver’s backstop leaves unen…  |
| M5: the interval’s running guard                                                          | `deadman-release-notices.integration.test.ts`   | test 17: the interval does not start a tick while the previous one runs          |
| M5: the per-recipient slot around find-or-create                                          | `deadman-release-notices.integration.test.ts`   | test 16: two notices for one person in overlapping ticks make one room: the sec… |
| M5: the room is read again after the slot is acquired                                     | `deadman-release-notices.integration.test.ts`   | test 3: a later release to the same person reuses their room, with no new invi…  |
| the in-flight guard (P3b-L15: killed by an assertion now, not a hang)                     | `deadman-release-notices.integration.test.ts`   | test 15: an overlapping tick does not send a notice twice or make a second room  |
| L1: a row for an unfired switch is left alone                                             | `deadman-release-notices.integration.test.ts`   | test 9: a notice row for a release switch that has not fired is left alone, an…  |
| L1: a cancelled switch’s row is not “awaiting the trigger”                                | `deadman-release-notices.integration.test.ts`   | test 8: a notice for a recipient who is gone, or for a release that is not the…  |
| L2: a thrown homeserver call is that notice’s retry                                       | `deadman-release-notices.integration.test.ts`   | test 10: a homeserver call that throws is that notice’s attempt: counted, backe… |
| L2: the throw is caught per notice, not per tick                                          | `deadman-release-notices.integration.test.ts`   | test 10: a homeserver call that throws is that notice’s attempt: counted, backe… |
| L3: every row pointing at a purged room moves to the replacement                          | `deadman-release-notices.integration.test.ts`   | test 12: a purged room is replaced once per person: every notice row that point… |
| L14: a row ended during the send is not marked sent                                       | `deadman-release-notices.integration.test.ts`   | test 13: an account deletion that lands during a send stands: the row stays fai… |
| L14: the account is read again before marking sent                                        | `deadman-release-notices.integration.test.ts`   | test 13: an account deletion that lands during a send stands: the row stays fai… |
| H1(d): re-invite at most once per notice                                                  | `deadman-release-notices.integration.test.ts`   | test 11: a person who left is invited again at most once per notice: a retry of… |
| H1(d): the re-invite is recorded on the row                                               | `deadman-release-notices.integration.test.ts`   | test 10: a homeserver call that throws is that notice’s attempt: counted, backe… |

Round 2's checks, the same way (`fix/mut/spec-round2.py`, in scratch; the
test numbers are the files' after round 2: releases 23, notices 23, Postgres
3, file 1). Seventeen checks; sixteen caught on the first run, and the
seventeenth, the row read once the recipient's slot is held, survived
because every later call re-reads the row, so a test that only looked at the
row could not tell it apart; it is observable (without it a notice that
waited for a deleted person's slot makes one more room for them before its
own re-read ends it), so test 14 gained that case and the mutant then failed
it. The sources were restored after each run and the diff checked unchanged.

| Check removed                                                                    | Test file                                       | What failed                                                                      |
| -------------------------------------------------------------------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------- |
| H1 round 2: the held cap and the rate are read again before the writes           | `deadman-releases.integration.test.ts`          | test 9: arms sent at once at the edge of each bound: exactly the bound passes a… |
| H1 round 2: the held cap is read again (the rate still is)                       | `deadman-releases.integration.test.ts`          | test 9                                                                           |
| H1 round 2: the rate is read again (the held cap still is)                       | `deadman-releases.integration.test.ts`          | test 9                                                                           |
| H1 round 2: the per-recipient bounds are read again before the writes            | `deadman-releases.integration.test.ts`          | test 9                                                                           |
| index: copies listed by recipient through the index, not a scan                  | `deadman-releases.integration.test.ts`          | test 22: a person’s copies and notices are listed through the index, not a scan… |
| index: notices listed by recipient through the index, not a scan                 | `deadman-releases.integration.test.ts`          | test 22                                                                          |
| index: the file store rebuilds the by-recipient index on hydrate                 | `deadman-releases-file.integration.test.ts`     | test 1: a release switch, its copies and its notices survive a restart of the …  |
| index: a wholesale refresh of the Postgres mirror keeps every grouping           | `deadman-releases-postgres.integration.test.ts` | test 1: a release switch, its copies and its notices survive a restart; it has…  |
| L14 round 2: the row is read again after the state read                          | `deadman-release-notices.integration.test.ts`   | test 14: a deletion that lands while the room is being found or made is seen b…  |
| L14 round 2: the row is read again after the re-invite, before it is recorded    | `deadman-release-notices.integration.test.ts`   | test 14                                                                          |
| L14 round 2: the row is read again after createRoom, before the room is recorded | `deadman-release-notices.integration.test.ts`   | test 14                                                                          |
| L14 round 2: a retry or failure is not written over a row ended meanwhile        | `deadman-release-notices.integration.test.ts`   | test 13: an account deletion that lands during a send stands: the row stays fai… |
| L14 round 2: the row is read again once the slot is held (survived, then caught) | `deadman-release-notices.integration.test.ts`   | test 14, its fourth case                                                         |
| timeout: a homeserver call that never answers ends at the call timeout           | `deadman-release-notices.integration.test.ts`   | test 15: a homeserver call that never answers ends at the call timeout as that … |
| timeout: the row says the call timed out                                         | `deadman-release-notices.integration.test.ts`   | test 15                                                                          |
| timeout: the signal is handed to createRoom so the request is aborted            | `deadman-release-notices.integration.test.ts`   | test 15                                                                          |
| timeout: matrix-client passes the signal to the createRoom request               | `deadman-release-notices.integration.test.ts`   | test 15                                                                          |

Round 3's checks, the same way (`fix/mut/spec-round3.py`, in scratch; the
test numbers are the files' after round 3: releases 24, notices 26, file 1,
client 4). Thirty checks; twenty-nine caught on the first run. The thirtieth,
the row read again after the alias lookup, survived: the client answers the
bot's id from its cache once known, so the next read of the row, right after
it, ended the notice with no call between them that a test could see. It is
observable (without it, the bot's id is asked for on a deleted person's
notice), so test 18 counts the calls for the bot's id on a stand-in, and the
mutant then failed it. The verifiers' own V02 and V03 (the state read's and
the send's `fetch` without the signal) are C01 and C02 and now fail test 15.
The sources were restored after each run and the diff checked unchanged.

| Check removed                                                                                | Test file                                         | What failed                                                                        |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------- |
| T01: identities: the owner's and the recipients' identities are read again before the writes | `deadman-releases.integration.test.ts`            | test 24: a key change or a deletion during an arm’s verification is seen before t… |
| T02: identities: each recipient's identity is read again (the owner's still is)              | `deadman-releases.integration.test.ts`            | test 24                                                                            |
| T03: identities: the owner's identity is read again (the recipients' still are)              | `deadman-releases.integration.test.ts`            | test 24                                                                            |
| T04: index: an owner's switches listed through the index, not a scan                         | `deadman-releases.integration.test.ts`            | test 22: a person’s copies, notices and switches are listed through the index, no… |
| T05: index: the file store rebuilds the by-owner index on hydrate                            | `deadman-releases-file.integration.test.ts`       | test 1: a release switch, its copies and its notices survive a restart of the fi…  |
| N01: alias: the create names the person's alias                                              | `deadman-release-notices.integration.test.ts`     | test 2: the notifier asks for a direct room with the body the homeserver’s backs…  |
| N02: alias: a taken alias is resolved, not retried                                           | `deadman-release-notices.integration.test.ts`     | test 15: a homeserver call that never answers ends at the call timeout as that no… |
| N03: alias: resolved fresh, not from the client's process cache                              | `deadman-release-notices.integration.test.ts`     | test 16: a createRoom the homeserver finished after the call timed out is found b… |
| N04: alias: the room it names is used only if the bot made it                                | `deadman-release-notices.integration.test.ts`     | test 17: when the alias cannot be used the room is made without it: an alias the … |
| N05: alias: a room still being made is waited for, not replaced                              | `deadman-release-notices.integration.test.ts`     | test 17                                                                            |
| N06: alias: a refused alias falls back to a room without it                                  | `deadman-release-notices.integration.test.ts`     | test 17                                                                            |
| N07: alias: only an alias refusal falls back, not any refusal                                | `deadman-release-notices.integration.test.ts`     | test 17                                                                            |
| N08: alias: M_EXCLUSIVE (an appservice namespace) is an alias refusal                        | `deadman-release-notices.integration.test.ts`     | test 17                                                                            |
| N09: alias: a room that is gone or not the bot's falls back, not retried for the window      | `deadman-release-notices.integration.test.ts`     | test 17                                                                            |
| N10: alias: the row is read again after the alias lookup (survived, then caught)             | `deadman-release-notices.integration.test.ts`     | test 18: a deletion that lands during the alias lookup, the bot’s id or a create … |
| N11: alias: the row is read again after the bot's id                                         | `deadman-release-notices.integration.test.ts`     | test 18                                                                            |
| N12: alias: the row is read again after a create without the alias                           | `deadman-release-notices.integration.test.ts`     | test 18                                                                            |
| N13: abort: the signal is handed to the state read                                           | `deadman-release-notices.integration.test.ts`     | test 15                                                                            |
| N14: abort: the signal is handed to the re-invite                                            | `deadman-release-notices.integration.test.ts`     | test 15                                                                            |
| N15: abort: the signal is handed to the send                                                 | `deadman-release-notices.integration.test.ts`     | test 15                                                                            |
| N16: abort: the signal is handed to the alias lookup                                         | `deadman-release-notices.integration.test.ts`     | test 15                                                                            |
| N17: abort: the signal is handed to the bot's id                                             | `deadman-release-notices.integration.test.ts`     | test 15                                                                            |
| C01: abort: matrix-client passes the signal to the state read (the verifiers' V02)           | `deadman-release-notices.integration.test.ts`     | test 15                                                                            |
| C02: abort: matrix-client passes the signal to the send (the verifiers' V03)                 | `deadman-release-notices.integration.test.ts`     | test 15                                                                            |
| C03: abort: matrix-client passes the signal to the direct re-invite                          | `deadman-release-notices.integration.test.ts`     | test 15                                                                            |
| C04: abort: matrix-client passes the signal to the alias lookup                              | `deadman-release-notices.integration.test.ts`     | test 15                                                                            |
| C05: abort: matrix-client passes the signal to whoami                                        | `matrix-client-direct-invite.integration.test.ts` | test 4: botUserId hands its signal to whoami, and an aborted request caches noth…  |
| C06: whoami: an aborted request caches no fallback id                                        | `matrix-client-direct-invite.integration.test.ts` | test 4                                                                             |
| C07: alias: matrix-client honours cache: false                                               | `deadman-release-notices.integration.test.ts`     | test 16                                                                            |
| C08: alias: matrix-client surfaces a refusal's Matrix error code                             | `deadman-release-notices.integration.test.ts`     | test 15                                                                            |

Round 4's checks, the same way (`fix/r4/mut/spec-round4.py`, in scratch,
run on a `git archive` snapshot of the branch outside the worktree, so no
other agent's edit could mix with a mutant; the test numbers are the files'
after round 4: releases 25, notices 28). Nine checks; nine caught on the
first run, and the sources were compared with the commit after the run. U09
first also failed tests 24 and 26, because test 20 left its parked create
shut when its assertion failed; with the gate released in a `finally`, it
fails test 20 alone.

| Check removed                                                                                    | Test file                                     | What failed                                                                        |
| ------------------------------------------------------------------------------------------------ | --------------------------------------------- | ---------------------------------------------------------------------------------- |
| U01: re-seal: the owner's and the recipient's identities are read again after the await          | `deadman-releases.integration.test.ts`        | test 25: a key change or a deletion during a re-seal’s verification is seen befor… |
| U02: index: an account's release identities listed through the index, not a scan                 | `deadman-releases.integration.test.ts`        | test 22: a person’s copies, notices, switches and release identities are listed t… |
| U03: index: the file store rebuilds the by-account index on hydrate                              | `release-identities-file.integration.test.ts` | test 1: published, replaced and erased identities survive a restart of the file s… |
| U04: alias: a room still without m.room.create at the next attempt is taken for an abandoned one | `deadman-release-notices.integration.test.ts` | test 27: a room found through the alias that still has no m.room.create at the no… |
| U05: alias: the first look at a room with no m.room.create is a retry, not a replacement         | `deadman-release-notices.integration.test.ts` | test 17 (and 27)                                                                   |
| U06: alias: keyed by the server's secret (the verifiers' A1, a constant key)                     | `deadman-release-notices.integration.test.ts` | test 2: the notifier asks for a direct room with the body the homeserver’s backst… |
| U07: alias: the key is derived for this purpose                                                  | `deadman-release-notices.integration.test.ts` | test 2                                                                             |
| U08: count: a row another process sent is not counted failed                                     | `deadman-release-notices.integration.test.ts` | test 28: a notice another process sent while this tick had it in hand is counted … |
| U09: count: an overlapping tick's skip is counted elsewhere                                      | `deadman-release-notices.integration.test.ts` | test 20: an overlapping tick does not send a notice twice or make a second room    |

Round 5's checks, the same way (`fix/r5/mut/spec-round5.py`, in scratch,
run on a `git archive` snapshot of the branch outside the worktree; the
test numbers are the files' after round 5: notices 29, notices on Postgres
2, releases 26). Seventeen mutants, sixteen caught on the first run, and
the sources were compared with the commit after the run. The seventeenth,
W16, the condition on the end the notifier writes after a send when the
account is found gone, survived, and was called equivalent here: the write
it guards sets the same status, reason and empty room as the deletion it
could land over (only the timestamps differ), so nothing observable
changes. (Round 6: not equivalent. During a leader handover the write can
also land over a `sent` another notifier committed, for an account gone
another way, and without the condition it turned that `sent` into
`failed`; test 4 of the notices-on-Postgres file now has that case, and W16
fails it, below.) P01 is not a check this round added but the behaviour test 26
pins: counting only unfired releases toward the 50 fails it.

| Check removed                                                                       | Test file                                              | What failed                                                                      |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------- |
| W01: alias room: the bot must have joined it                                        | `deadman-release-notices.integration.test.ts`          | test 27: a room found through the alias that is still not the whole room the cr… |
| W02: alias room: it must carry power levels                                         | `deadman-release-notices.integration.test.ts`          | test 27                                                                          |
| W03: alias room: its power levels keep the person from posting and inviting         | `deadman-release-notices.integration.test.ts`          | test 27                                                                          |
| W04: alias room: completeness is checked at all (the bot's create alone was enough) | `deadman-release-notices.integration.test.ts`          | test 27                                                                          |
| W05: retry: timed from when it is recorded, not from the tick's start               | `deadman-release-notices.integration.test.ts`          | test 29: a retry is timed from when it was recorded, not from the tick’s start…  |
| W06: cross-process: the sent write is conditional                                   | `deadman-release-notices-postgres.integration.test.ts` | test 1: an account deletion the API process committed while the worker had a n…  |
| W07: cross-process: the retry write is conditional                                  | `deadman-release-notices-postgres.integration.test.ts` | test 1                                                                           |
| W08: cross-process: the worker's own end (window over) is conditional               | `deadman-release-notices-postgres.integration.test.ts` | test 1                                                                           |
| W09: cross-process: the room made in the attempt is recorded conditionally          | `deadman-release-notices-postgres.integration.test.ts` | test 1                                                                           |
| W10: cross-process: a row is moved off a purged room only while it still names it   | `deadman-release-notices-postgres.integration.test.ts` | test 1                                                                           |
| W11: cross-process: the re-invite stamp is conditional                              | `deadman-release-notices-postgres.integration.test.ts` | test 1                                                                           |
| W12: store: the write-behind queue passes the guard                                 | `deadman-release-notices-postgres.integration.test.ts` | tests 1 and 2                                                                    |
| W13: store: the Postgres wrapper takes the guard from the call                      | `deadman-release-notices-postgres.integration.test.ts` | tests 1 and 2                                                                    |
| W14: store: the guard compares the stored row (`DO UPDATE ... WHERE`)               | `deadman-release-notices-postgres.integration.test.ts` | tests 1 and 2                                                                    |
| W15: store: the mirror applies the guard too                                        | `deadman-release-notices-postgres.integration.test.ts` | test 2: the store’s conditional notice write: applied in Postgres only while t…  |
| W16: cross-process: the recipient-gone end after a send is conditional (equivalent) | `deadman-release-notices-postgres.integration.test.ts` | survived (equivalent, above)                                                     |
| P01: pin: the 50 counts fired releases until their removal (decision 18 changed)    | `deadman-releases.integration.test.ts`                 | tests 8, 22 and 26                                                               |

Round 6's checks, the same way (`fix/r6/mut/spec-round6.py`, in scratch, run
on a `git archive` snapshot of `a868a8c7c5` outside the worktree, waiting for
the machine's load before each; the test numbers are the files' after round
6: releases 27, notices 29, notices on Postgres 5, file 1). Twenty-five
mutants, twenty-five caught on the first run, the sources compared with the
snapshot after each. Y20 to Y22 and Y24 are the verifiers' V1 to V4; W16 is
round 5's survivor, now caught. Round 5's other sixteen mutants were run again
on the same snapshot against this round's code (`spec-round5-rerun.json`, W12
re-spelled for the queue's new argument): fourteen were caught, and W09 (the
condition on the room recorded after a create) and W11 (on the re-invite
stamp) survived. Their unconditional writes still land after the deletion and
set the person's row back to pending with a room, and the worker's read of the
copy from Postgres then ends it again, so the final row, all the test looked
at, was right; for that moment Postgres held a deleted person's notice pending
in a room, which a crash or a booting replica would have read. Test 1 now
records every change to a notice row with a trigger on PGlite and requires
that, once the deletion has committed, no write sets a row of the person's
back to pending or gives one a room (`01f189b394`); on a snapshot of that
commit both fail it ("room made now, during the create" and "person left,
during the re-invite": nothing after the deletion put a row back).

| Check removed                                                                               | Test file                                              | What failed                                                                                 |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| Y01: insert-only: the notice creation's spec (a plain upsert put back)                      | `deadman-release-notices-postgres.integration.test.ts` | test 3: a notice row is created only where Postgres has none (Postgres set back to pending) |
| Y02: insert-only: the writer's `ON CONFLICT ... DO NOTHING`                                 | `deadman-release-notices-postgres.integration.test.ts` | test 3                                                                                      |
| Y03: insert-only: the write-behind queue passes it on                                       | `deadman-release-notices-postgres.integration.test.ts` | test 3                                                                                      |
| Y04: insert-only: the Postgres wrapper takes it from the spec                               | `deadman-release-notices-postgres.integration.test.ts` | test 3                                                                                      |
| Y05: unseen row: the copy read from the database before a room is made                      | `deadman-release-notices-postgres.integration.test.ts` | test 1, a row the app had not seen, deleted before the tick: a room was made                |
| Y06: unseen row: the copy read from the database again before the send                      | `deadman-release-notices-postgres.integration.test.ts` | test 1, the same, deleted during the create: the notice was sent                            |
| Y07: unseen row: the check reads the database, not the mirror                               | `deadman-release-notices-postgres.integration.test.ts` | test 1, the same, deleted before the tick: the tick did not end it                          |
| Y08: unseen row: the Postgres store reads the committed row                                 | `deadman-release-notices-postgres.integration.test.ts` | test 1, as Y07                                                                              |
| Y09: unseen row: the read waits for the process's own queued writes (3155c4856a's slip)     | `deadman-release-notices-postgres.integration.test.ts` | test 1, the first variant: a release armed and fired at once was ended, not sent            |
| Y10: end pass: the deletion finishes in the database at all                                 | `deadman-release-notices-postgres.integration.test.ts` | test 1: the deletion's writes were not in the database when it returned                     |
| Y11: end pass: a pending row ends                                                           | `deadman-release-notices-postgres.integration.test.ts` | test 1, a row the app had not seen, deleted before the tick: the row still pending          |
| Y12: end pass: every row forgets its room                                                   | `deadman-release-notices-postgres.integration.test.ts` | test 1, the same, deleted during the send: the room kept                                    |
| Y13: end pass: a row already sent, with a room, is reached too                              | `deadman-release-notices-postgres.integration.test.ts` | test 1, the same, deleted after it was recorded sent: the room kept                         |
| Y14: end pass: the rows it changed go into the API process's mirror                         | `deadman-release-notices-postgres.integration.test.ts` | test 1, the first unseen variant: the API process's mirror had no row                       |
| Y15: end pass: the rows it changed are announced to the other processes                     | `deadman-release-notices-postgres.integration.test.ts` | test 1, deleted during the send: the worker's mirror, once told, still said sent            |
| Y16: end pass: the deletion's own writes are in Postgres first, so before the route answers | `deadman-release-notices-postgres.integration.test.ts` | test 1: the deletion's writes were not in the database when it returned                     |
| Y17: `confirmAccountDeletion` runs the extracted copy-and-notice writes                     | `deadman-release-notices.integration.test.ts`          | test 13: an account deletion that lands during a send stands: the row stays fai…            |
| Y18: the deletion route awaits `finishAccountDeletion`                                      | `deadman-releases.integration.test.ts`                 | test 27: the account deletion route finishes the deletion in the database once …            |
| Y19: a failure of the last step is logged, and the deletion is answered                     | `deadman-releases.integration.test.ts`                 | test 27                                                                                     |
| Y20: alias room: the person cannot invite (V1)                                              | `deadman-release-notices.integration.test.ts`          | test 27: a room found through the alias that is still not the whole room the cr…            |
| Y21: alias room: the person's own level in `users` counts (V2)                              | `deadman-release-notices.integration.test.ts`          | test 27                                                                                     |
| Y22: writer: a guard field with no column or value throws (V3)                              | `deadman-release-notices-postgres.integration.test.ts` | test 5: the writer refuses a conditional write it cannot carry into Postgres, …             |
| Y23: writer: an insert-only write refuses a guard                                           | `deadman-release-notices-postgres.integration.test.ts` | test 5                                                                                      |
| Y24: file store: the conditional write persists (V4)                                        | `deadman-releases-file.integration.test.ts`            | test 1: a release switch, its copies and its notices survive a restart of the …             |
| W16: round 5's survivor: the recipient-gone end after a send is conditional                 | `deadman-release-notices-postgres.integration.test.ts` | test 4: after a send, the end for an account found gone is conditional too: du…             |

Round 7's checks, the same way (`fix/mut/spec-round7.py` and `run7.py`, in
scratch, run on a `git archive` snapshot of `7257a66f46` outside the
worktree, waiting for the machine's load before each, every source restored
and the snapshot compared with a fresh archive of that commit afterwards; the
test numbers are the files' after round 7: releases 27, notices 30, notices
on Postgres 8, file 1). Fourteen mutants for this round's code, Z00 being
the whole fix of the handover re-send taken out at once (round 6's
behaviour); seven of round 6's re-spelled for the rewritten read and end
(Y05 to Y10 and Y19); and round 6's other eighteen run again unchanged.
Thirty-nine mutants, thirty-nine caught on the first run.

| Check removed                                                                             | Test file                                              | What failed                                                                                 |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| Z00: handover: the notice row not read from Postgres at all (round 6's code)              | `deadman-release-notices-postgres.integration.test.ts` | test 6, sent with the alias: sent again                                                     |
| Z01: handover: the stored row put into the mirror                                         | `deadman-release-notices-postgres.integration.test.ts` | test 6, the same: the new leader's mirror still pending                                     |
| Z02: handover: a row Postgres has as sent or ended ends the attempt (`ended`)             | `deadman-release-notices-postgres.integration.test.ts` | test 8, sent elsewhere, this process writing the row during each read: sent                 |
| Z03: handover: the mirror takes the stored row only when this process wrote nothing to it | `deadman-release-notices-postgres.integration.test.ts` | test 8, a deletion here during the read before the send: sent                               |
| Z04: handover: nothing written for `ended`                                                | `deadman-release-notices-postgres.integration.test.ts` | test 8, sent elsewhere: the mirror's own write overwritten                                  |
| Z05: handover: attempts counted from the row as read at the end (sent)                    | `deadman-release-notices-postgres.integration.test.ts` | test 6, the old room recorded and its send refused: attempts 1, not 2                       |
| Z06: handover: attempts counted from the row as read at the end (retry)                   | `deadman-release-notices-postgres.integration.test.ts` | test 6, the same, refused again for the new leader                                          |
| Z07: deletion window: the read right before a create with the alias                       | `deadman-release-notices-postgres.integration.test.ts` | test 1, room purged, deleted during the state read: a room was made                         |
| Z08: deletion window: the read right before a create without the alias                    | `deadman-release-notices-postgres.integration.test.ts` | test 1, an unseen row, alias refused, deleted during the create with it: a room was made    |
| Z09: deletion window: the read right before the re-invite                                 | `deadman-release-notices-postgres.integration.test.ts` | test 1, person left, deleted during the state read: invited                                 |
| Z10: bound: the database read has the call timeout                                        | `deadman-release-notices.integration.test.ts`          | test 30: a database read that never answers ends at the call timeout…: the tick did not end |
| Z11: dropped copy: `copy_unavailable`, not `recipient_gone`                               | `deadman-release-notices-postgres.integration.test.ts` | test 7: `recipient_gone`                                                                    |
| Z12: route: the session revoked before the await                                          | `deadman-releases.integration.test.ts`                 | test 27: the last step ran before the session was revoked                                   |
| Z13: route: the wait for the last step bounded                                            | `deadman-releases.integration.test.ts`                 | test 27: the wait is bounded                                                                |
| Y05: round 6's read before anything is asked of the homeserver (re-spelled)               | `deadman-release-notices-postgres.integration.test.ts` | test 1, an unseen row, room known, deleted before the tick: its state was read              |
| Y06: round 6's read before the send (re-spelled)                                          | `deadman-release-notices-postgres.integration.test.ts` | test 1, an unseen row, deleted during the create: sent                                      |
| Y07: round 6's check reads the database, not the mirror (re-spelled)                      | `deadman-release-notices-postgres.integration.test.ts` | test 1, deleted before the tick: the tick did not end it                                    |
| Y08: round 6's Postgres store reads the committed rows (re-spelled)                       | `deadman-release-notices-postgres.integration.test.ts` | test 1, as Y07                                                                              |
| Y09: round 6's read waits for this process's own queued writes (re-spelled)               | `deadman-release-notices-postgres.integration.test.ts` | test 1, the first variant: a release armed and fired at once was ended, not sent            |
| Y10: round 6's end pass runs at all (re-spelled)                                          | `deadman-release-notices-postgres.integration.test.ts` | test 1: the deletion's writes were not in the database when it returned                     |
| Y19: round 6's failure of the last step logged and the deletion answered (re-spelled)     | `deadman-releases.integration.test.ts`                 | test 27: the deletion stands and is answered                                                |
| Y01 to Y04: round 6's insert-only creation, each part (unchanged)                         | `deadman-release-notices-postgres.integration.test.ts` | test 3, each                                                                                |
| Y11 to Y16: round 6's end pass, each part (unchanged)                                     | `deadman-release-notices-postgres.integration.test.ts` | test 1, each                                                                                |
| Y17: round 6's extracted copy-and-notice writes (unchanged)                               | `deadman-release-notices.integration.test.ts`          | test 13                                                                                     |
| Y18: round 6's route awaits `finishAccountDeletion` (unchanged)                           | `deadman-releases.integration.test.ts`                 | test 27                                                                                     |
| Y20, Y21: round 6's alias-room halves (unchanged)                                         | `deadman-release-notices.integration.test.ts`          | test 27, each                                                                               |
| Y22, Y23: round 6's writer refusals (unchanged)                                           | `deadman-release-notices-postgres.integration.test.ts` | test 5, each                                                                                |
| Y24: round 6's file store's conditional write persists (unchanged)                        | `deadman-releases-file.integration.test.ts`            | test 1: a conditional write survives a restart                                              |
| W16: round 5's survivor, the recipient-gone end after a send conditional (unchanged)      | `deadman-release-notices-postgres.integration.test.ts` | test 4                                                                                      |

Round 8's checks, the same way (`fix/mut/spec-round8.py`, run with
`run7.py` on a `git archive` snapshot of `c84c49bd85` outside the worktree,
waiting for the machine's load before each, every source restored
afterwards; the test numbers are the files' after round 8: releases 27,
notices 30, notices on Postgres 12). Thirteen mutants; twelve were caught
on the first run. R09 survived (test 11 had no row another process had
ended); the case was added (`649807ea83`) and R09 run again on a snapshot of
that commit, where it was caught. Round 7's mutants were not run again this
round: the database read they edit was split and takes a clock, so most of
their spellings no longer apply, and the checks they removed are each still
pinned by the tests named in round 7's table, which pass.

| Check removed                                                                                  | Test file                                              | What failed                                                                                 |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| R00: not due: a row Postgres has set to retry later ends the attempt (round 7's code)          | `deadman-release-notices-postgres.integration.test.ts` | test 6, the old room recorded and its send refused: attempted before the retry time; test 9 |
| R02: not due: nothing written for the step                                                     | `deadman-release-notices-postgres.integration.test.ts` | test 6: not counted elsewhere; test 9: Postgres not as the old leader left it               |
| R03: person's room: the first read asks Postgres for it                                        | `deadman-release-notices-postgres.integration.test.ts` | test 10, its own sweep fires a newer release: a second room                                 |
| R04: person's room: the Postgres store queries it                                              | `deadman-release-notices-postgres.integration.test.ts` | test 10, the same                                                                           |
| R05: person's room: `resolveRoom` uses it (the mirror's alone)                                 | `deadman-release-notices-postgres.integration.test.ts` | test 10, the same                                                                           |
| R06: person's room: the newer of the mirror's and Postgres's (the mirror's first)              | `deadman-release-notices-postgres.integration.test.ts` | test 10, its mirror names a room the old leader replaced: a second room                     |
| R07: dropped write: a room the mirror has and Postgres lacks is kept                           | `deadman-release-notices-postgres.integration.test.ts` | test 11, the room, alias refused: a second room                                             |
| R08: dropped write: a re-invite the mirror has and Postgres lacks is kept                      | `deadman-release-notices-postgres.integration.test.ts` | test 11, the re-invite: invited a second time for the notice                                |
| R09: dropped write: kept only while the stored row is pending                                  | `deadman-release-notices-postgres.integration.test.ts` | first run: survived; on `649807ea83`, test 11: a row ended elsewhere kept its room          |
| R10: deletion: the deletion's own writes drained before the bounded last statement (round 7's) | `deadman-release-notices-postgres.integration.test.ts` | test 12, the drain stalls: answered before the writes                                       |
| R11: deletion: the same, against the route's test                                              | `deadman-releases.integration.test.ts`                 | test 27: the deletion's own writes not first                                                |
| R12: deletion: the drain bounded too (drained inside a race with the bound)                    | `deadman-release-notices-postgres.integration.test.ts` | test 12, the drain stalls: answered before the writes                                       |
| R13: deletion: the last statement still bounded                                                | `deadman-release-notices-postgres.integration.test.ts` | test 12, the last statement stalls: not answered at the bound                               |

Round 9's checks, the same way (`fix/mut/spec-round9.py`, run with `run7.py`
on a `git archive` snapshot of `3be2966120` outside the worktree, waiting
for the machine's load before each, every source restored afterwards; the
test numbers are the files' after round 9: releases 27, notices 32, notices
on Postgres 15). Twenty-two mutants, all caught. The first sitting ran S01
to S04 and T01 to T04 and stopped with T05's edit still in the snapshot's
store; the second restored it, checked the snapshot against `3be2966120`,
and ran the rest. T06 (the sweep's statement on a connection of its own,
outside the queue's order) failed no assertion on its first run: the
Postgres notices file stopped answering and was killed at the runner's 900
s. Run again with each test bounded at 120 s (T06b), 12 of the file's 15
tests failed, test 1 first (a switch armed and fired at once: the
statement ran before the arming's queued write had reached Postgres,
matched no row, and nothing fired), and one was cancelled at its bound.
Q01 and T06b ran on a snapshot of `17df059a88`, the commit that adds Q01's
test. V01 to V03 are round 8's verifiers' G04, F02 and F05, spelled as
they spelled them.

| Check removed                                                                            | Test file                                              | What failed                                                                               |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| S01: owners: the bound counts releases again (50 in all)                                 | `deadman-releases.integration.test.ts`                 | test 8: owner 10 refused; tests 9 and 26                                                  |
| S02: owners: an owner already naming the person counted as a new one                     | `deadman-releases.integration.test.ts`                 | test 8: 409 for one of the fifty naming the person again; tests 9 and 26                  |
| S03: owners: the 51st owner let through                                                  | `deadman-releases.integration.test.ts`                 | test 8: 201 where 409 `recipient_limit`; tests 9 and 26                                   |
| S04: owners: the bound of 5 from one owner dropped                                       | `deadman-releases.integration.test.ts`                 | test 8: 201 where 409 `recipient_limit`; test 9                                           |
| T01: sweep move: unconditional in Postgres                                               | `deadman-release-notices-postgres.integration.test.ts` | test 13, fired and sent by the old leader: the first `releasedAt` did not stand           |
| T02: sweep move: the status condition dropped                                            | `deadman-release-notices-postgres.integration.test.ts` | test 13, the same                                                                         |
| T03: sweep move: the last check-in condition dropped                                     | `deadman-release-notices-postgres.integration.test.ts` | test 13, checked in on the API process: fired                                             |
| T04: sweep move: no row, the mirror not refreshed from Postgres                          | `deadman-release-notices-postgres.integration.test.ts` | test 13, fired and sent by the old leader: the mirror did not take it                     |
| T05: sweep move: no row, this process's write meanwhile not merged and written after     | `deadman-release-notices-postgres.integration.test.ts` | test 13, the label erased here during the statement: the first `releasedAt` did not stand |
| T06: sweep move: on its own connection, outside the queue's order                        | `deadman-release-notices-postgres.integration.test.ts` | the file never finished (900 s); T06b: 12 of 15 failed, test 1 first, nothing fired       |
| T07: sweep move: every column written, not only the moved ones                           | `deadman-release-notices-postgres.integration.test.ts` | test 13, the label changed on the API process: the label not kept                         |
| T08: sweep trigger: notice rows written though the move did not land                     | `deadman-release-notices-postgres.integration.test.ts` | test 13, fired and sent by the old leader: the standby's sweep wrote a notice row         |
| Q01: sweep scheduler: the running guard                                                  | `deadman-release-notices.integration.test.ts`          | the sweep's interval test: more than one pass in flight after ten intervals               |
| C01: claim: always granted in Postgres                                                   | `deadman-release-notices-postgres.integration.test.ts` | test 15, one notice: not left to the holder                                               |
| C02: claim: a refused claim ignored by the notifier                                      | `deadman-release-notices-postgres.integration.test.ts` | test 15, the same                                                                         |
| C03: claim: taken after the first read                                                   | `deadman-release-notices-postgres.integration.test.ts` | test 15: the person's notices read before the claim                                       |
| C04: claim: given up before the attempt's writes are attempted                           | `deadman-release-notices-postgres.integration.test.ts` | test 15: the claim not held while the holder's write waits                                |
| C05: claim: never expires                                                                | `deadman-release-notices-postgres.integration.test.ts` | test 15, a stopped process's claim: not sent once it expired                              |
| C06: claim: never given up                                                               | `deadman-release-notices-postgres.integration.test.ts` | test 15, one notice: the claim not given up                                               |
| V01: the first read's judgement removed, the read kept (G04)                             | `deadman-release-notices-postgres.integration.test.ts` | tests 6, 7 and 12: the known room's state read                                            |
| V02: the later reads ignore the not-due step (F02)                                       | `deadman-release-notices-postgres.integration.test.ts` | test 14, parked on the known room's state: not counted elsewhere                          |
| V03: the room read at the attempt's start wins over the mirror's (F05, `stored ?? mine`) | `deadman-release-notices.integration.test.ts`          | the slot test: a third room                                                               |

Round 10's checks, the same way (`fix/mut/spec-round10.py`, run with
`run7.py` on a copy of the worktree's packages with this round's edits, in
scratch outside the worktree, waiting for the machine's load before each,
every source restored afterwards; the test numbers are the files' after
round 10: notices 32, notices on Postgres 16, the new switch-writes file 5).
Eighteen mutants, all caught. W04 survived its first run: the second pass's
statement, queued behind the held one, timed out unseen and was then
skipped, so nothing the test asserted changed; test 2 now counts the
bound's log lines during that pass (none with the guard, one without), and
W04 failed on the second run, as did W05 and R05 run again with it.

| Check removed                                                                            | Test file                                              | What failed                                                                              |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| W01: the mirror takes the move before Postgres answers (round 9's order)                 | `deadman-switch-writes-postgres.integration.test.ts`   | test 1: the move in the mirror while its statement waits                                 |
| W02: a failed statement keeps the move in the mirror, counted as made                    | `deadman-switch-writes-postgres.integration.test.ts`   | test 2: counted as moved                                                                 |
| W03: no bound on the statement (the timeout 100 times longer)                            | `deadman-switch-writes-postgres.integration.test.ts`   | test 2: the pass did not end after the bound                                             |
| W04: while one stands unanswered, further statements still queued                        | `deadman-switch-writes-postgres.integration.test.ts`   | second run, test 2: the second pass waited out the bound                                 |
| W05: a statement whose turn came after the bound still run                               | `deadman-switch-writes-postgres.integration.test.ts`   | test 2: the move run when its turn came                                                  |
| W06: no row in Postgres: nothing inserted (round 9)                                      | `deadman-switch-writes-postgres.integration.test.ts`   | test 3: it did not fire                                                                  |
| W07: this process's own writes during the statement not noted                            | `deadman-release-notices-postgres.integration.test.ts` | test 13, the deletion here over the old leader's trigger: the mirror not as Postgres     |
| W08: anything in the mirror unlike the read taken for an own write (a refresh included)  | `deadman-switch-writes-postgres.integration.test.ts`   | test 4: a write queued over the committed cancel                                         |
| W09: refused: the mirror not refreshed from Postgres                                     | `deadman-switch-writes-postgres.integration.test.ts`   | test 1: the mirror did not take the committed check-in                                   |
| W10: the move counted as made though this process's own write moved the status meanwhile | `deadman-release-notices-postgres.integration.test.ts` | test 13, the deletion here during its own move: the sweep wrote a notice row             |
| R01: the Postgres store's check-in and cancel conditional on the mirror only             | `deadman-switch-writes-postgres.integration.test.ts`   | test 5: the check-in answered 200 over the trigger                                       |
| R02: the check-in an unconditional full-row write again                                  | `deadman-switch-writes-postgres.integration.test.ts`   | test 5: 200 where 409                                                                    |
| R03: the cancel an unconditional full-row write again                                    | `deadman-switch-writes-postgres.integration.test.ts`   | test 5: the cancel answered 200 over the trigger                                         |
| R04: a check-in refused over another check-in not tried again                            | `deadman-switch-writes-postgres.integration.test.ts`   | test 5: `switch_changed` where `switch_triggered`, and the check-in over another refused |
| R05: an unanswered check-in answered as made, from the mirror                            | `deadman-switch-writes-postgres.integration.test.ts`   | test 2: 200 where 503                                                                    |
| N01: a claim that timed out or threw is a retry again (round 9)                          | `deadman-release-notices-postgres.integration.test.ts` | test 16, the claim timed out: not counted elsewhere                                      |
| N02: a claim that lands after the bound not given up                                     | `deadman-release-notices-postgres.integration.test.ts` | test 16: the late claim still held                                                       |
| K01: a tick the sweep's guard skips not logged                                           | `deadman-release-notices.integration.test.ts`          | test 24: the skipped ticks not logged                                                    |

Round 11's checks, the same way (`fix/mut/spec-round11.py`, run with
`run7.py` in the worktree, waiting for the machine's load before each,
every source restored afterwards and `git status` checked; the test numbers
are the files' after round 11: the switch-writes file 14, the file store's 2;
Q25 ran on a scratch copy of the head while the gates ran in the worktree).
Twenty-two mutants, all caught. Five survived their first run, each because
the test meant to pin the check did not isolate it: Q04 and Q24 because a
fake-time pass an hour on had already given the switch the window by the
ordinary tolerance rule (test 9 now makes the real-time pass first, and
lands the other owner's check-in before the fake-time pass); Q09 and Q15
because the sweep's removal pass, or the store's own refused-branch
blanking, blanked the copies the mutated check had left (test 4 now refuses
a move directly with no pass, and test 13 checks the check-in's answer on a
mirror told of the cancel); Q13 because the two arms of the burst happened
to serialize (test 8 now holds the fifth arm's insert at the database while
the sixth is sent). Each then failed on its second run.

| Check removed                                                                        | Test file                                            | What failed                                                                                   |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Q01: a scoped call waits on the whole queue again (round 10's order)                 | `deadman-switch-writes-postgres.integration.test.ts` | test 6: the check-in behind a held write to another table 503                                 |
| Q02: a queued upsert does not take its row's lane                                    | `deadman-switch-writes-postgres.integration.test.ts` | test 6: the check-in did not wait for the switch's queued insert (written whole in its place) |
| Q04: no stall recorded                                                               | `deadman-switch-writes-postgres.integration.test.ts` | second run, test 9: the switch due during the stall fired                                     |
| Q05: an owner's write refused unanswered not noted                                   | `deadman-switch-writes-postgres.integration.test.ts` | test 9: the owner's switch fired at its deadline                                              |
| Q06: the sweep ignores the stall                                                     | `deadman-switch-writes-postgres.integration.test.ts` | test 9: the same                                                                              |
| Q24: a check-in that landed elsewhere does not clear the note                        | `deadman-switch-writes-postgres.integration.test.ts` | second run, test 9: the other owner's switch given the window, not fired                      |
| Q07: a statement that settles after its bound not taken into the mirror or announced | `deadman-switch-writes-postgres.integration.test.ts` | test 10: the mirror still armed after the cancel landed                                       |
| Q07b: the same                                                                       | `deadman-switch-writes-postgres.integration.test.ts` | test 2: the landed trigger not in the mirror, not announced                                   |
| Q08: a landed cancel's copies not blanked when it settles                            | `deadman-switch-writes-postgres.integration.test.ts` | test 10: both copies still held in Postgres                                                   |
| Q09: a refused write that reads the switch cancelled does not blank its copies       | `deadman-switch-writes-postgres.integration.test.ts` | second run, test 4: the copies still held after the refused move                              |
| Q10: a failed or unanswered arm insert answered as armed from the mirror (round 10)  | `deadman-switch-writes-postgres.integration.test.ts` | test 7: 201 where 500                                                                         |
| Q12: the copies an arm wrote before its insert failed not taken back                 | `deadman-switch-writes-postgres.integration.test.ts` | test 7: copy rows left in Postgres for a switch that is not there                             |
| Q13: an arm this process is writing does not count toward the bounds                 | `deadman-switch-writes-postgres.integration.test.ts` | second run, test 8: the sixth arm armed where `recipient_limit`                               |
| Q14: the third attempt answers `switch_changed` before looking at the switch         | `deadman-switch-writes-postgres.integration.test.ts` | test 12: `switch_changed` where `switch_triggered`                                            |
| Q15: a check-in that finds the switch cancelled leaves its copies held               | `deadman-switch-writes-postgres.integration.test.ts` | second run, test 13: the copies still held after the 409                                      |
| Q16: the second cancel writes the whole row from the mirror                          | `deadman-switch-writes-postgres.integration.test.ts` | test 13: the erased label put back                                                            |
| Q17: the removal writes the whole row from the mirror                                | `deadman-switch-writes-postgres.integration.test.ts` | test 13: the erased label put back                                                            |
| Q18: the removal pass leaves a cancelled switch's held copies                        | `deadman-switch-writes-postgres.integration.test.ts` | test 13: the copies still held after the pass                                                 |
| Q19: `standsFired` keys on `releasedAt` alone                                        | `deadman-switch-writes-postgres.integration.test.ts` | test 14: the cancelled switch's copy still listed                                             |
| Q20: the notifier's `processOne` keys on `releasedAt` alone                          | `deadman-switch-writes-postgres.integration.test.ts` | test 14: the notice not ended `release_unavailable`                                           |
| Q23: the memory and file arm does not refuse a taken id                              | `deadman-releases-file.integration.test.ts`          | test 2: `armed` where `id_taken`                                                              |
| Q25: the announcement after a conditional switch write removed (the verifiers' X1)   | `deadman-switch-writes-postgres.integration.test.ts` | test 11: no `deadmanSwitches` `u` published for the applied move                              |

### Still open

-   **A recipient-side refusal of an owner** (decision 19), which the
    notifier and the release read would honour: PR 4's or later, the
    operator's (PR 4 itself was approved on 2026-10-31; the design's list for
    it does not include a refusal). Until then `KNOWN_LIMITATIONS.md` says
    what any account with release keys can do to another's notices room,
    within the bounds.
-   **The bound of 50 owners naming one person** stays a lever, as the
    operator decided (decision 18, option (c), 2026-10-31; built in round
    9): 50 accounts with release keys, each arming its 20 held switches
    naming 64 different people, fill it for 1,280 people in two days, about
    26 people per account, and keep every other owner from naming any of
    them while their switches stay armed (one check-in per switch per
    interval, which can be 365 days) and for at least 365 days after they
    fire, and nobody can clear it; counted in releases, as before, ten
    accounts did the same. What would let each person clear it is the
    recipient-side refusal above; test 26 of the releases file pins it as
    decided.
-   **Fired legacy switches' payloads** are held with no removal date
    (decision 20); extending the 365-day removal to them is the operator's.
-   **The rows of cancelled release switches** stay for good (decision 24);
    deleting them after some time is the operator's.
-   **Across API replicas** a burst can exceed each bound by up to its own
    size until the replicas' write-behind queues drain, and how long that
    takes was not measured; in the same window an arm or a re-seal on one
    replica can seal a copy to a key another replica has seen replaced or to
    an account whose deletion it has not seen yet, and a re-seal can leave a
    copy on a switch another replica cancelled. A conditional write in
    Postgres would close it and was not built for the bounds or the copies
    (P3b-L6); the notice rows have one since round 5
    (`updateDeadmanReleaseNoticeIf`), for the notifier's writes only, and
    since round 6 their creation is insert-only in Postgres and the
    deletion ends them there with one statement; since round 9 the sweep's
    moves of a switch are conditional there too (`advanceDeadmanSwitch`),
    and the notifier takes a claim on each person there; since round 10 the
    owner's check-in and cancel are conditional there as well
    (`updateDeadmanSwitchIf`), and a move reaches a process's mirror only
    once Postgres has applied it; since round 11 an arm's rows are one
    awaited insert-only call, so they are in Postgres at the 201, though the
    bounds are still read from the mirror.
-   **The owner's deletion over a trigger another process committed**
    (decision 30): the deletion writes each switch from the deleting
    process's mirror, unconditionally, so where that mirror has not heard of
    the trigger it cancels the release and removes its content and copies;
    the people named may have been told by then, and their notice ends
    unsent if it had not gone. Stated in §15, `KNOWN_LIMITATIONS.md`, the
    deletion screen, the changelog and the threat model's row; a conditional
    erase was not built here.
-   **A switch move whose statement answered after its bound and landed**
    is read again, taken into the mirror and announced to the other
    processes when it settles (round 11; until then it was found only when
    a later pass happened to refresh the row, and nothing was announced),
    and its notice rows are written by the notifier's catch-up; its domain
    event is still not emitted.
-   **The sweep knows only its own process's stalls** (decision 31): a
    database stall is recorded, and a check-in or cancel refused unanswered
    noted, in the process where they happened, and the sweep there gives
    such a switch the backlog window; in the deployed layout the worker's
    sweep does not learn of a check-in the API process refused during a
    database outage its own statements did not meet, and such a switch fires
    at its deadline if the database answers within the tolerance. Carrying
    the refused attempt into Postgres once it answers was not built here.
-   **A plain write of a switch queued while that switch's conditional
    statement is in flight** waits for the statement (the row's lane), and so
    does everything queued after it; the other order, the statement waiting
    for the switch's earlier queued writes, is pinned by test 6 of the
    switch-writes file, this one is not.
-   **The notices room's alias** (decisions 25 and 26): its key, and what it
    leaves (§11): a room made without the alias where the homeserver refuses it
    or the alias names a room that is gone, not the bot's, one the bot has left,
    or one abandoned part way (before its first event, before the bot's join, or
    before the power levels), whose create can then leave an extra room again if
    it times out after the homeserver made it; an abandoned create's alias taken
    until an admin removes it, and a create merely slower than one backoff taken
    for an abandoned one; a rotation of the secret between a timed-out create
    and its retry; and two processes making one person's room at once (since
    round 9, only where one holds the person's claim past its lease), which
    leaves an empty room id nobody is in. The fork-side test of the room's
    creation under `tests/blackout_runtime/` that the review proposed, which
    would back test 2 with a run, was not added.
-   **A notifier that stops right after a create answered** (a crash, or a
    restart while the database is stalled), before its queued record of the
    room has reached Postgres: the next holder of the person's claim finds no
    room, and where the homeserver refuses the alias it makes the person
    another, so they have an invitation in each, the notice in the second
    (round 8's verifiers, `fix/r8v-claims/crash-after-create.mts`; with the
    alias, the next create finds the first room). Waiting for the room's
    write to land before going on would narrow the window, not close it (the
    stop can come between the homeserver's answer and the write); not built
    here.
-   **Two notifiers with one person's notices at once** only where one holds
    the person's claim past its lease (an attempt slower than its thirteen
    bounded steps, a paused process, or its writes still queued behind a
    stalled database when the lease ends; since round 10, one whose claim
    statement fails or times out writes nothing, which as round 9 left it
    was a second way in): both can then, where the
    homeserver refuses the alias, each make the person a room and send there,
    and the transaction id is deduplicated only within one room, so the
    person can get an invitation and the notice in each of two rooms (round
    9 added the claim; rounds 7 and 8 found the case without it).
-   **A known room the bot was removed from** (an admin's shutdown without a
    purge, which kicks the bot and the person and keeps the room) is not
    replaced: its state still answers, so each notice to that person invites
    them again, is refused, and retries until its window closes. Replacing a
    known room the bot is not in was not built here, since a wrong idea of
    the bot's own id would then replace every person's room; the alias path
    makes that check only for a room no row knows yet.
-   **The device-side record of a release's recipients** (part 1's review,
    PR 4, which the operator approved on 2026-10-31 and is not built) stands
    as before.
-   What the review did not verify stands: Postgres end to end through the
    routes (PGlite exercises the store and the migration), the multi-replica
    refresh of the two tables under a real transport, the write-behind crash
    window (from the code), anything against a real Synapse beyond the
    review's scratch run of the fork (the alias: the taken-alias refusal and
    an interrupted create were run on the fork in scratch by the verifiers;
    the rest, the abandoned shapes of round 5 included, read in the fork and
    run against the stub), and whether a deployment ever runs
    the
    sweep with `BLACKOUT_DEADMAN_SWEEP=0` after releases fired (the API now
    refuses to arm there; nothing can make an existing release's removal run).
-   An aside from the review, outside this PR: `GET /v1/deadman/releases`
    answered 200 (empty) to a still-valid token of a deleted account rather
    than 401; whether the auth middleware checks the user row still exists is
    worth a look.
-   An aside found while probing round 6, outside this PR and present on
    `develop`: a Postgres-backed mutator whose spec is a `resync` reconciles a
    whole table to the calling process's mirror (`resyncMap`: it deletes every
    row the mirror lacks, then writes every row the mirror has), so across
    processes it undoes what another process wrote within the change
    notification's lag. Run in scratch on PGlite (`fix/r6/aside/`): an account
    deletion on one process (`deleteUser`, `resync('users')`) deleted from
    Postgres an account another process had created moments before; and the
    worker's prune of expired revocations (`pruneExpiredRevokedSessions`,
    `resync('revokedSessions')`) deleted a session revocation the API process
    had just written, so a process booting afterwards, or the API process once
    told of the worker's reload, no longer treats that token as revoked. In
    `deploy/docker/production` the API process and the worker are two such
    processes. Read in the code, not run: the other `resync` mutators
    (`purgeUserAuthArtifacts`, the token consumers, `revokeRefreshTokenFamily`
    and the rest) have the same shape. It needs its own change; nothing here
    depends on it, and the release tables use targeted writes only.

## Sources

-   RFC 9180 (HPKE) §4.1, §5.1 and §7.1.4; RFC 7748 §5 and §6.1; RFC 8032
    §5.1; RFC 5869; FIPS 203; draft-connolly-cfrg-xwing-kem;
    draft-ietf-tls-hybrid-design; Giacon, Heuer and Poettering, "KEM
    Combiners" (PKC 2018); Dodis, Grubbs, Ristenpart and Woodage, "Fast
    Message Franking" (CRYPTO 2018); Albertini, Duong, Gueron, Kölbl, Luykx
    and Schmieg, "How to Abuse and Fix Authenticated Encryption Without Key
    Commitment" (USENIX Security 2022).
-   `docs/security/release-identities-2026-10-26.md` (§1, §2, §5, H1, L1,
    decisions 7, 19), `docs/security/deadman-release-design-2026-10-24.md`
    (§3, §4(a), §5, §7, §8), `docs/security/deaddrop-pq-hybrid.md`.
-   `packages/blackout-protocol/src/deaddrop/crypto/`: `pqHybrid.ts`,
    `envelope.ts`, `keys.ts`, `hkdf.ts`, `padding.ts`, `encoding.ts`,
    `mlkem768Provider.ts`; `packages/blackout-protocol/src/release/`;
    `@noble/post-quantum` 0.6.1.
-   `packages/api/src/`: `modules/deadman.ts`, `services/deadmanScheduler.ts`,
    `services/deadmanSweepScheduler.ts`, `services/scheduledMessageDispatcher.ts`,
    `services/releaseIdentities.ts`, `services/accountLifecycle.ts`,
    `integrations/matrix-client.ts`, `db/store.ts`, `db/pgWriter.ts`,
    `db/pgDescriptors.ts`; `apps/blackout-server/synapse/handlers/room.py`,
    `apps/blackout-server/synapse/rest/client/room.py`,
    `apps/blackout-server/rust/src/push/base_rules.rs`.
