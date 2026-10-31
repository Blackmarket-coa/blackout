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
were then read again three times, independently; each reading's reports, and
what was done about them, are under the same heading.

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

| ID  | Question or finding                                                                                            | Verified          | Disposition                                                                                                                                                                                                                                                                            |
| --- | -------------------------------------------------------------------------------------------------------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E1  | What is sealed to whom: one ciphertext, its key sealed to every recipient and to the owner                     | Read (design)     | Kept; the owner's own copy is what re-sealing opens, and what it costs is stated (§1)                                                                                                                                                                                                  |
| E2  | The key encapsulation against HPKE's DHKEM and X-Wing                                                          | Read (standards)  | Kept, with a transcript; one sealing function for dead drops and releases (§2)                                                                                                                                                                                                         |
| E3  | The recipient's public keys must be bound into the wrap key (C5)                                               | Read              | Bound through the recipient's fingerprint in the transcript, with the owner's, the release id and both accounts (§2, §3)                                                                                                                                                               |
| E4  | An all-zero X25519 output (C8, RFC 9180 §7.1.4)                                                                | Run; test         | Refused on both sides, inside the shared function, so dead drops get the check too (§2)                                                                                                                                                                                                |
| E5  | New labels must not be confusable with PR 2's                                                                  | Read; test        | Four new NUL-terminated labels, each used in one place; the table of all eight is in §3                                                                                                                                                                                                |
| E6  | AES-GCM does not commit to its key (C7)                                                                        | Read (literature) | SHA-256 of a label and the content key in every copy's signed bytes, checked before the content is decrypted (§4)                                                                                                                                                                      |
| E7  | One header every recipient receives alike (C7)                                                                 | Read (analysis)   | The header's fields are in every copy's signature; no separate header signature, and why (§4, §5)                                                                                                                                                                                      |
| E8  | Signatures are transferable (C15), and the server holds them from arming on                                    | Read (analysis)   | Stated, for the operator: no deniability is claimed anywhere (§5)                                                                                                                                                                                                                      |
| E9  | One form per value: JSON shapes, base64, ids                                                                   | Read; test        | Exact field sets, canonical base64 at exact lengths, a fixed-length sealed copy, ids by pattern; JSON is never signed (§6)                                                                                                                                                             |
| E10 | Padding and size                                                                                               | Read; test        | Text up to 64 KiB, padded to 1, 16 or 256 KiB; the API refuses a content ciphertext of any other length (§7)                                                                                                                                                                           |
| E11 | Identity v1 has no sequence number (decision 19)                                                               | Read              | Nothing is added to the identity; the API checks current identities at arming and re-sealing, the client applies H1 (§9)                                                                                                                                                               |
| E12 | When a comparison counts (H1)                                                                                  | Read; test        | `releaseComparisonState`: only for the account's current identity, stale once a newer one is seen or the compared one is listed as replaced; when sealing, the owner's own key must not have changed either; for a release in hand, `other_key` unless the key compared signed it (§9) |
| E13 | A fired release must stay checkable after its owner deletes the account, which erases their release identities | Read              | The owner's identity at arming is kept with the release, and goes with it; the deletion texts say so (§1, §11)                                                                                                                                                                         |
| E14 | Re-sealing to a recipient's new key does not take back the old copy                                            | Read (analysis)   | Stated: after a lost device, cancel and arm again, which makes a new content key (§10)                                                                                                                                                                                                 |
| E15 | What a hostile server can and cannot do                                                                        | Read (analysis)   | §10; hold back, delay and bring forward are accepted (design §3) and named as R12, which part 2 adds to `THREAT_MODEL.md`                                                                                                                                                              |
| E16 | Notices and what they carry (design §5)                                                                        | Read              | A pointer only, in an unencrypted room the bot owns; nothing names the owner, the label, other people or any time (§11)                                                                                                                                                                |
| E17 | `randomBytes` asked WebCrypto for more than 65,536 bytes at once, so padding to 256 KiB threw                  | Run; test         | Fixed in `randomBytes`, which also fixes dead drops over 16 KiB and PR 2's recovery files past 16 KiB (§14)                                                                                                                                                                            |

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
    removed, 365 days after it fired. The deletion texts in the app and in
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
current identity has the copy's fingerprint (an unknown account, one without
an identity, an identity the account replaced and one it never published are
each refused with their own code); every signature verifies under the
owner's identity; the release id is unused; the timer and label are in
bounds; at most a fixed number of live release switches per owner. **These
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
-   **Delay it**: for as long as it likes; an outage alone delays it by its
    own length plus up to 72 hours (R10).
-   **Bring it forward**: trigger early and give each recipient their copy
    at any time from arming on, a cancelled switch's included if it kept a
    copy (cancel removes them from an honest server's database; backups keep
    them until they expire). Only the named recipients can read it, and,
    until PR 4 keeps the device-side record of each release's recipients,
    anyone the owner's device is made to re-seal it to (the "It cannot"
    bullet on re-sealing).
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
    each recipient whose copy is still held. The notifier also treats a fired
    release switch with a recipient but no row as due, so a crash between the
    two loses nothing. Legacy switches change status only, as today.
-   **The room.** One standing room per account, named "Blackout notices",
    created by the bot with `encrypted: false` (the bot cannot encrypt), as a
    private room with the person invited and `is_direct` set, and power
    levels that let only the bot post or invite (`events_default` and
    `invite` at 50, the person at 0). An earlier notice's room is reused; a
    person who left it, or declined it, is invited again, with `is_direct`,
    when a later notice is due.
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
    so a resend soon after a crash is deduplicated (the homeserver keeps
    transaction ids for a while, not for ever). A notice is "sent" only once
    the homeserver accepted it. It is retried with backoff for 30 days from
    the release, then recorded as failed; the logs carry counts, not who.
    It does not go through `botPostingGate.ts`: it is the bot's own post into
    its own room.
-   **What the owner sees:** when the switch fired, how many recipients were
    given access, and how many notices were sent, are pending and failed;
    never the notice rooms.
-   **Retention.** 365 days after a switch fires, the API removes its content,
    the owner's identity it kept, and every copy; the notice rows stay, as a
    record that one was sent. A recipient who wants the message after that
    has to have saved it.
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
    releases stay for the people named, until the 365 days end.
-   **What changed against the design:** the release id is the switch id
    (one id, chosen by the device because it is in the associated data and
    the transcript); the owner's identity is kept with the release (E13); a
    cap on live release switches per owner bounds storage (decision 4
    below); the header is signed inside every copy's signature, not
    separately (E7).

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

## Decisions for the operator to confirm or veto

1.  The release id is the switch id, a UUID the owner's device picks; a
    taken id is refused with 409.
2.  The owner's own sealed copy is stored, so re-sealing works without K
    kept on a device, and whoever holds the owner's release keys and session
    can read the message before release (§1).
3.  The owner's public identity is kept with each release switch, so a fired
    release stays checkable after the owner deletes their account, until it
    is removed after 365 days (E13).
4.  At most 20 live (armed or in grace) release switches per owner. Part 2's
    independent review found that this alone bounds no storage, since a
    fired release is held for 365 days outside it; the bounds on what
    persists, and on what one account may send another, are part 2's, and
    its record section states them.
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
