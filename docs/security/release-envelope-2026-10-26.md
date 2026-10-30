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
below, and the sections they touch now say what the code does. **2026-10-30:**
part 2 had its independent review; its one high finding (the cap of 20 bounded
live switches, not what the server held), five medium, fifteen low and sixteen
untrue sentences are each fixed or explained in "Independent review of part 2,
2026-10-30" below, and §11, §15 and the decisions now say what the code does.

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
    and re-sealing refuse a recipient whose comparison does not count.
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
    fingerprint compared; `current` means both that the compared key signed
    it and that the comparison counts now (P3-M1). Only then may PR 4's
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
    them until they expire). Only the named recipients can read it.
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
-   **The room.** One standing room per account, named "Blackout notices",
    created by the bot with the `public_chat` preset, an invite-only
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
    (recorded on the row as `reinvited_at`). One room per account holds
    within one process: a per-recipient slot serialises finding or making
    the room and a notice that waited reads the room again (P3b-M5), and the
    interval does not start a tick while one runs. A room the homeserver no
    longer has is replaced once per person: every row of theirs that pointed
    at it moves to the replacement (P3b-L3).
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
    never the notice rooms. A recipient who deleted their account drops out
    of `sealedTo` and their pending notice counts as failed, which tells the
    owner the account is gone; the identities directory tells any signed-in
    account the same (P3b-L11).
-   **Retention.** At its first sweep pass on or after 365 days after a
    switch fired (while a sweep runs; with none, nothing is removed), the API
    removes its content, the owner's identity it kept, and every copy. The
    rows stay: the switch with whom it named, the label and timing; each copy
    row with the fingerprint of the key it was sealed to; the notice rows as a
    record that one was sent, with their room until that person deletes their
    account (P3b-L10, P3b-L12). A recipient who wants the message after that
    has to have saved it.
-   **What one account can make the server keep or send** is bounded (P3b-H1):
    at most 20 release switches per owner whose content is held, armed, in
    grace or fired until the removal; at most 10 arms per owner in any 24
    hours; at most 5 held releases naming one person from one owner and 50
    from everyone. So one person receives at most 50 notices in any 365 days,
    each with at most one re-invite. A recipient cannot yet refuse an owner
    (decision 19).
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
    cap on release switches per owner whose content is held bounds what the
    server keeps (decision 4 below, as part 2's review corrected it); the header is signed inside every copy's signature, not
    separately (E7).

## 14. PR 3 as built, part 1: protocol and SDK (`-v44`)

-   **The shared sealing function**,
    `packages/blackout-protocol/src/deaddrop/crypto/hybridSeal.ts`:
    `hybridSeal`, `hybridSealWith` (randomness as a parameter, for vectors
    only) and `hybridOpen`, with the all-zero refusal on both sides
    (`HybridSealError`). The v2 branches of `encryptDeadDrop` and
    `decryptDeadDrop` call it with no transcript.
-   **The envelope**, `packages/blackout-protocol/src/release/envelope.ts`:
    the labels and bounds of §3 and §7; `parseReleaseHeader`,
    `parseReleaseCopy` and `parseReleaseEnvelope` (§8); the byte builders of
    §3 to §6 (transcript, signed bytes, associated data, commitment, content
    hash, the sealed copy's layout); `encryptReleaseContentWith` and
    `decryptReleaseContent`; `sealReleaseCopy` and `sealReleaseCopyWith`,
    which verify the recipient's identity and seal both legs to the verified
    keys; `buildReleaseEnvelope` (a fresh K and nonce, the owner's copy
    first; afterwards K, the commitment's copy of it, the padded text and,
    inside the sealing function, both shared secrets and each wrap key's
    bytes are filled with zeros, **best effort**: JavaScript promises
    nothing about copies an engine made, P3-L3); `releaseSignatureVerifier`,
    which verifies the owner's identity once and parses each copy it is
    handed; `openReleaseCopy`, the recipient's checks of §8, returning the
    header's release id and owner with the text; and `resealReleaseCopy`,
    which refuses a header whose release id is not the switch's
    (`release_mismatch`, P3-H1), then opens the owner's own copy with every
    one of those checks, the content's decryption included (P3-L2), before
    sealing K again. Fixed vectors in `envelopeVectors.ts` (§12).
-   **When a comparison counts**, `release/comparison.ts`:
    `releaseComparisonState` (given the fingerprint that signed a release in
    hand, `other_key` unless it is the one compared, P3-M1) and
    `releaseDirectoryFingerprints`, which computes every fingerprint from an
    identity it verified for that account (§9).
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
    (`ReleaseActionError`, naming the account and the fingerprint the
    directory served, P3-M3) **before sending the envelope or the copy**
    unless the owner's key is the directory's current one and every
    recipient's comparison is `current`; the directory reads are sent first,
    and tell the server whom the owner is about to name (C14). They send
    only the envelope, the timer and the label, or one copy. Arming returns
    the release id and whom the envelope was sealed to (`sealedTo`, P3-H1);
    re-sealing refuses an owner view whose switch id or header is not the
    switch's (`release_mismatch`, P3-H1); the release list refuses an entry
    whose unsigned ids are not its header's (`server_mismatch`, P3-M2). The
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
    `releaseEnvelope.test.ts`, 105 (the labels; the vectors, rebuilt; a
    recipient refusing tampered header fields and copy bytes, a copy moved
    to another release, re-signed by a third party, signed by another key,
    and owner-signed copies that fail at the wrap, the commitment and the
    content; mis-addressed copies and missing key sets; small-order and
    zero X25519; every validator; padding sizes and the cap; building,
    opening and re-sealing with fresh keys, re-sealing's refusals, the
    switch binding and the content check when re-sealing, and that the old
    copy still opens (E14); the comparison rule, the signer included; each
    smaller check on its own, the base64 length pre-check included);
    `releaseEnvelopeActions.test.ts`, 14 (the SDK against a fake API: what
    arming sends and returns, every refusal before it sends and what each
    reports, the swapped owner view, and the release list's refusals);
    `deadmanReleaseContracts.test.ts`, 5; `deaddropPqHybrid.test.ts`, 36 (6
    new, for the shared function); `deaddropCrypto.test.ts`, 11 (2 new) and
    `releaseRecoveryFile.test.ts`, 41 (1 new), for E17.
-   **Every check was removed once, to see a test fail.** 75 checks in
    `envelope.ts`, `comparison.ts`, `hybridSeal.ts` and the SDK were each
    taken out in turn (a scratch script outside the repository, which
    restores the file after each run); each time at least one test failed.
    The review's fixes added 12 more, each removed once the same way (the
    table in "Independent review, 2026-10-29").
    Two survived at first, the verifier's and the decryptor's own parsing,
    which only a direct call reaches, and each has a direct test now. Three
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
    whose) and which is named on fewer than 5 held releases from this owner
    and fewer than 50 from everyone (409 `recipient_limit`, saying whose; one
    code and message for both bounds, so the answer does not say how many
    others named the person, though an owner below 5 who is refused does
    learn the person is at 50: decision 18); every signature under the
    owner's current identity (400 `invalid_release_signature`, saying whose
    copy), which also refuses a header naming any other identity than the
    owner's current one (409 `owner_identity_changed`: the verifier computes
    the fingerprint and compares it, so the service makes no comparison of
    its own); then, after those awaits, the release id is still free (409
    `release_id_taken`, an existence answer for any switch's id, accepted and
    explained at `SWITCH_NOT_FOUND` in the module: P3b-L7, decision 22) and
    the rows are written with no await between, in the mirror: the copies
    first, one row per account, and then the switch, id = release id, no
    room, `release-v1`, the recipients' account ids, the label. In Postgres
    mode each row is its own write-behind upsert, committed after the 201 in
    that order, so a crash between them leaves copies no switch names, which
    nothing lists or serves, and never a switch without copies, which would
    fire and release to nobody; nothing detects the orphaned copies (P3b-L5).
    On one replica two arms with one id cannot both write; across replicas
    the store is eventually consistent and the window applies (P3b-L6). The
    answer is the armed event with the owner's view.
-   **The owner's view** carries `releaseFormat`, `releasedAt` once fired,
    `release` (the header, the owner's identity, the owner's own copy, and
    whom each held copy is sealed to with its fingerprint) while the content
    and the owner's own copy are held, and `notices` counts once fired. It
    never carries the notice rooms or anyone else's copy. A recipient who
    deleted their account drops out of `sealedTo` and their pending notice
    counts as `failed`, so the owner can tell; the directory tells anyone the
    same (P3b-L11).
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
    cancelled switch. Across replicas the store is eventually consistent
    (LISTEN/NOTIFY, typically sub-second), and a cancel on one replica with a
    re-seal on another in that window can leave a sealed copy on a cancelled
    switch: served to nobody, since `releasedCopiesFor` needs `releasedAt`,
    which a cancelled switch never gets, and blanked by a second cancel
    (P3b-L6). Not gated on the flag, which gates arming only (§13).
-   **The release read**, `GET /v1/deadman/releases` (`deadman.read`): each
    fired release switch that sealed a copy to the caller and still holds its
    content, with the header, the owner's identity at arming, when it fired,
    when it is removed, and the caller's own copy; nothing before the
    trigger, nothing of the caller's own switches, nothing of anyone else,
    newest first. `releasedAt` is written with the trigger and only then, and
    is what says a release switch fired. The legacy recipient views
    (`GET /switches?scope=recipient`, `GET /switches/:id`) never show a
    release switch: a recipient gets the same 404 as a stranger.
-   **Limits**, `GET /v1/deadman/limits` (`deadman.read`): whether arming is
    open here and, if not, why (`armingUnavailableReason`: `releases_off` or
    `sweep_off`), the timer bounds, 64 recipients, 64 KiB of text, the three
    padded sizes, the label length, the four bounds of P3b-H1
    (`maxHeldReleaseSwitches` 20, `maxArmsPerDay` 10,
    `maxHeldReleasesPerRecipientFromOwner` 5, `maxHeldReleasesPerRecipient`
    50), the backlog tolerance from the sweep's own configured cadence
    (`deadmanSweepIntervalMs`), the 72-hour backlog window, 365 days of
    retention, 30 days of notice retries.
-   **Cancel** blanks every copy, the owner's own included, with the content;
    a second cancel blanks what a switch cancelled before this code still
    holds. **The sweep** (`sweepOverdueDeadmanSwitches`) fires a release switch
    by writing `triggered` and `releasedAt` in one update and then one notice
    row per recipient whose copy is held and lacks one; a legacy switch
    changes status only. Each pass also removes the content and every copy of
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
-   **The notifier**, `services/deadmanReleaseNotifier.ts`, beside the sweep
    at its cadence under the same `BLACKOUT_DEADMAN_SWEEP` gate
    (`backgroundLoops.ts`). Each tick first writes the rows a fired release
    switch lacks (§11's catch-up), then sends up to 50 due notices, oldest
    first, one at a time; a row for a release switch that has not fired is
    not due and is left alone (P3b-L1). For each: the recipient's standing
    room is reused from an earlier notice, or made by the bot (`createRoom`
    with `name: "Blackout notices"`, `visibility: private`, `preset:
public_chat`, `encrypted: false`, `initial_state` holding an invite-only
    `m.room.join_rules`, the person invited with `is_direct`, `events_default`
    and `invite` at 50: §11 says why that preset) and recorded on the row
    before anything is sent, so a crash makes no second room; finding or
    making the room happens under a per-recipient slot, with the row and the
    room read again once the slot is held, so two notices for one person in
    overlapping ticks make one room (P3b-M5); a person whose membership is
    not `join` or `invite` (left, declined) is invited again through the
    member state endpoint with `is_direct`, at most once per notice
    (`reinvited_at` on the row); a room the homeserver answers 404 for is
    replaced, and every row of that person's that pointed at it moves to the
    replacement (P3b-L3). The notice is one `m.text` with
    `DEADMAN_NOTICE_BODY` and the pointer (`co.bmc.deadman.release`: schema
    version 1 and the release id, which is the switch id, a lowercase UUID
    v4), and nothing else, transaction id
    `deadman-release-<switch>-<recipient>`. **What "sent" means:** the
    homeserver accepted the event. Whether it reaches the person is the
    homeserver's and their client's; the release is the API's own store, and
    the release read works without any notice. Every refused homeserver call
    (create, state read, invite, send; or none configured) and every one that
    throws (a network error: `matrix_<call>_network_error`) is that notice's
    attempt, a retry with backoff from 30 s doubling to a 6-hour cap, for 30
    days from the release, then `failed` with `retry_window_over` (P3b-L2); a
    recipient whose account is gone (`recipient_gone`) or a release that is
    not there to point at (`release_unavailable`: cancelled, removed, or
    never a release) ends the notice at once, and a notice that ends for a
    gone recipient forgets its room. Before a notice is marked sent, the row
    and the account are read again: a deletion that landed during the send
    has ended the row and that stands, and an account gone another way ends
    it (P3b-L14). An in-flight set keeps an overlapping tick off a notice,
    and the interval does not start a tick while the previous one runs; a
    stop ends a tick after the notice in hand. Logs carry counts only.
-   **Account deletion** (`accountLifecycle.ts`): an unfired release switch
    of the account's loses its copies with its content; a fired one keeps its
    content, the owner's identity it was signed with (E13) and the recipients'
    copies, and only the owner's own copy goes, since nothing is re-sealed
    after the trigger and nobody is left to open it. As a recipient: the
    account's copies on others' switches go, fired or not; its pending notices
    end with `recipient_gone`, and a notice whose send was in flight when the
    deletion landed stays `failed` (P3b-L14); every notice row of its forgets
    the room that tied the account to a Matrix id; the switch keeps the
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
    account and deletion blanks its rows); a fired switch's status, since
    `releasedAt` is written with `triggered` and only then; a legacy payload
    that is not JSON, since the parse says so, and the format check covers a
    legacy payload that is. A notice row's status at send time is checked
    now, since the review's P3b-L14 found a deletion could land during the
    send. Each bound of P3b-H1 is checked once, before the signatures: two
    arms racing on one replica can exceed one by one, across replicas by more
    within the refresh window; the held cap is what bounds the content one
    account can make the server keep.
-   **Tests** (`packages/api/test/`): `deadman-releases.integration.test.ts`,
    21 (the flag off and on, and every spelling; the sweep switched off; the
    body's shape and cap; every refusal in order, including a copy re-signed
    by a third party; the arming rate; the held cap at its edge, fired
    switches counted and bytes held flat; the per-recipient bounds, 5 and
    50; each recipient's isolation before and after the trigger and the
    opening with the recipient's keys; re-sealing, its refusals, the race
    with a cancel and its body cap; cancel; the 365-day removal and its
    idempotence; the removal's indexed second pass; content gone while a copy
    is held; legacy switches unchanged, a legacy payload that looks like
    release JSON included; the limits; the export, notice rows included;
    deletion of an owner and of a recipient, before and after the trigger);
    `deadman-release-notices.integration.test.ts`, 21 (the rows the sweep
    writes; the room's creation body and the send's body and transaction id;
    what the notice never carries; room reuse; re-invite, once per notice;
    the replaced room, once per person; each retry and its backoff; a thrown
    call per step; the 30-day window; catch-up, and its indexed cost; a gone
    recipient; a release that is not there; a switch not yet fired; a
    deletion during a send, and a row ended during one; no homeserver
    configured; the overlapping tick, with a bounded wait; two notices for
    one person in overlapping ticks; the interval's running guard; the
    per-tick cap; the stop mid-tick; start and stop);
    `deadman-releases-postgres.integration.test.ts`, 3 (PGlite: a restart,
    `room_id` NULL, `reinvited_at`, a legacy row reading `legacy`, the
    by-switch index after hydration and after a wholesale refresh, a blanked
    copy and a cleared room in Postgres, the down migration refused and then
    run);
    `deadman-releases-file.integration.test.ts`, 1;
    `matrix-client-direct-invite.integration.test.ts`, 2; `postgres-store`
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
    110 killed.
-   **Secret scanners.** Part 2 adds no vector and no key material: its tests
    import PR 2's vectors by path and make every other key in the test
    process. gitleaks over the branch's commits finds nothing, so
    `.gitleaksignore` gains no entry; GitGuardian's pull-request check is
    not run here (§12).

**Read, not run, in part 2:** how Synapse treats `is_direct` on a
`createRoom` invite list (`handlers/room.py` copies it onto each invite
event) and on a member state PUT (`rest/client/room.py` hands the content to
`update_membership`); that an `m.text` in a two-member room notifies and an
`m.notice` does not (`rust/src/push/base_rules.rs`); that the homeserver
keeps a transaction id for about 30 minutes
(`rest/client/transactions.py`, `CLEANUP_PERIOD_MS`), so the transaction id
deduplicates a resend soon after a crash and not one after a long outage; the
push and email behaviour (design §5). The homeserver in the tests is a stub
that records what the API sends.

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
    holds: armed, in grace, or fired until the removal 365 days after the
    trigger. _(Corrected after part 2's review, P3b-H1: as first built the cap
    counted armed and grace switches only, a fired switch's content was held
    365 days outside it, and the "bound on storage of about 10 MB per
    account" written here was false: one account held 20.1 MiB after three
    rounds of arm-and-fire with the live count at 0.)_ What it bounds: a held
    switch is at most about 350 KB of header JSON (a 256 KiB ciphertext in
    base64; 20 of them measured at 6.7 MiB) plus up to 65 sealed copies of
    about 1.8 KB each, so about 6.7 MiB of headers and up to about 2.3 MiB of
    copies per account, held for up to 365 days after firing, in Postgres and
    in every replica's mirror.
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
    content, the owner's identity and the recipients' copies until the 365
    days end, and only the owner's own copy goes; an unfired one loses
    everything. A deleted recipient's copies go at once, fired or not (§15).
13. (Part 2.) Re-sealing is not gated on `BLACKOUT_DEADMAN_RELEASES`: a
    switch armed while the flag was on stays its owner's to keep sealed to
    current keys (§13, §15).
14. (Part 2.) The notifier sends at most 50 notices per tick, retries with
    backoff from 30 s to a 6-hour cap, and the standing room is one per
    account, reused for every release; a notice row keeps its room id until
    the recipient's account is deleted.
15. (Part 2.) `GET /v1/deadman/limits` and `GET /v1/deadman/releases` need
    `deadman.read`, which every session token carries, like the other reads.
16. (Part 2.) A legacy switch's recipient views are unchanged, and a release
    switch is answered there as absent; a release is read through
    `GET /v1/deadman/releases` only.
17. (Part 2, after its review.) Because the cap of decision 4 counts fired
    switches until their removal, an owner whose 20 release switches all
    fired cannot arm another until the oldest is removed, 365 days after it
    fired; cancelling an unfired one frees its place. Confirm the number, or
    choose a larger cap or a separate cap for fired switches.
18. (Part 2, after its review.) At most 10 arms per owner in any 24 hours
    (429, `Retry-After`); at most 5 held releases naming one person from one
    owner and 50 from everyone (409 `recipient_limit`, one code for both
    bounds). The second bound discloses, to an owner below 5 who is refused,
    that the person is at 50 from everyone; a bound on what everyone
    together may do to one person cannot avoid that.
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
script outside the repository; the table is at the end of this section), and
each time at least one test failed. The design document is edited by part 2,
not here.

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
    `switchId`, or its header's `releaseId`, is not `switchId`, before the
    directory is read, anything is signed or anything is sent.
    `armReleaseSwitch` returns, next to the armed event, the release id and
    `sealedTo` (each copy's account id and fingerprint, the owner's own
    first) from the envelope it built, so a client can keep its own record
    of each release's recipients from a source it made, rather than from the
    owner's view, which is the server's word. §8 and §10 say so; the comment
    at `resealReleaseCopy` says what is bound and what is not.
-   **Tests.** `releaseEnvelope.test.ts`: "re-sealing is bound to the switch:
    another release's header and own copy are refused before anything is
    opened (P3-H1)": two envelopes from one owner, A to Bob and B to Carol;
    B's header and own copy with A's id are refused with WebCrypto's `verify`
    and `decrypt` spied and never called; with B's own id the same inputs
    re-seal B and Bob reads B. `releaseEnvelopeActions.test.ts`: "refuses,
    before reading the directory or signing, an owner view that is another
    release's (P3-H1)": a fake API answering `GET /switches/A` with B's
    release, as the review's probe did, gives `ReleaseActionError`
    `release_mismatch`, nothing is sent and only the switch was read;
    another switch's id with A's own release is refused; the honest view of
    A re-seals A. The arming test checks `sealedTo` and that the release id
    returned is the envelope's, not the one the server answered with.
-   **Still open.** The device-side record and the refusal to re-seal a
    release to an account not on it are PR 4's (below).

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
    before any other rule, so `current` now means both that the signer is
    the key compared and that the comparison counts. The `listReleases`
    doc, §8 and §9 name `releaseComparisonState` as the one function that
    decides, and what to pass it.
-   **Test.** `releaseEnvelope.test.ts`: "is other_key when the release in
    hand was signed by a key that is not the one compared (P3-M1)": the
    compared key signing, `current`; another key, served as current or not,
    `other_key`; another key with a stale comparison, `other_key`; the
    compared key with a stale comparison, `stale`; no comparison, `none`.

**P3-M2. `listReleases` handed PR 4 the server's unsigned duplicates of
signed header fields, and `openReleaseCopy` did not return the signed
ones.** `DeadmanReleasedCopy` has `releaseId` and `ownerAccountId` next to
`header.releaseId` and `header.ownerAccountId`; a screen reading the
top-level one, the field that sits next to `releasedAt`, would have named
whoever the server put there under a header whose signature verifies.

-   **Done.** `ReleaseOpenResult` carries `releaseId` and `ownerAccountId`
    from the parsed header, so a screen has no reason to read anything
    else. `listReleases` refuses (`ReleaseActionError`, `server_mismatch`)
    an answer that is not a list and any entry whose top-level `releaseId`
    or `ownerAccountId` is not its header's. The wire type is unchanged,
    since the API half is built against it; §6 says only the header's
    fields are to be shown, and that `releasedAt` and `removesAt` stay the
    server's word.
-   **Tests.** `releaseEnvelope.test.ts`: "Bob opens his copy, and Alice
    opens her own" asserts the whole result, the two fields included.
    `releaseEnvelopeActions.test.ts`: "refuses a released copy whose
    unsigned release id or owner differ from its header's (P3-M2)": the
    honest entry comes back as it was; another owner at the top level,
    another release id, an entry with no header and an answer that is not a
    list are refused.

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
-   **P3-L2. `resealReleaseCopy` never decrypted the content**, so the
    owner's device would have re-sealed, to a new key, a release whose
    content a server had corrupted in storage, and said nothing. Done: after
    the commitment check it decrypts the content with K and refuses
    (`own_copy`, "(content)") if the padding or the UTF-8 fails; §14's
    "every one of those checks" is true now. Test, `releaseEnvelope.test.ts`:
    "re-sealing refuses the owner's own copy of a release whose content K
    does not open (P3-L2)": the owner's own copy, re-signed by the owner over
    a content ciphertext under K with broken padding, is refused; the same
    with readable content re-seals and the recipient reads it.
-   **P3-L3. The record said K was zeroed; copies of K were not.** Done,
    best effort: the commitment's input buffer after the digest, both shared
    secrets and the wrap key's bytes once WebCrypto has imported the key (in
    the shared sealing function, when sealing and when opening), and the
    padded plaintext after encryption are filled with zeros. JavaScript
    gives no guarantee about what an engine has copied, and the record and
    the code now say "best effort". No test of memory would be honest; the
    pq-hybrid test's independent rebuild copies the ML-KEM secret before
    sealing, because the seal now clears it, and says so.
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
    what stays open.
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
source, and what failed (the files otherwise pass 105, 14, 5 and 36). All
twelve were caught; the sources were restored and the diff checked unchanged
after the run.

| Check removed                                                           | Test file                         | Result                                        |
| ----------------------------------------------------------------------- | --------------------------------- | --------------------------------------------- |
| P3-H1, `resealReleaseCopy`: the `release_mismatch` check                | `releaseEnvelope.test.ts`         | 1 failed, 104 passed: the switch binding      |
| P3-H1, `resealRecipient`: the switch id and header check                | `releaseEnvelopeActions.test.ts`  | 1 failed, 13 passed: the swapped view         |
| P3-H1, `armReleaseSwitch`: `sealedTo` returned empty                    | `releaseEnvelopeActions.test.ts`  | 1 failed, 13 passed: what arming sends        |
| P3-M1, `releaseComparisonState`: the `other_key` branch                 | `releaseEnvelope.test.ts`         | 1 failed, 104 passed: the signer case         |
| P3-M2, `openReleaseCopy`: the header's ids in the result                | `releaseEnvelope.test.ts`         | 2 failed, 103 passed: Bob opens; P3-H1        |
| P3-M2, `listReleases`: the comparison with the header                   | `releaseEnvelopeActions.test.ts`  | 1 failed, 13 passed: the release list         |
| P3-M3, the recipient refusal's `servedFingerprint`                      | `releaseEnvelopeActions.test.ts`  | 2 failed, 12 passed: never compared; stale    |
| P3-M3, the owner refusal's `servedFingerprint`                          | `releaseEnvelopeActions.test.ts`  | 1 failed, 13 passed: the owner's key          |
| P3-L2, `resealReleaseCopy`: the content decryption                      | `releaseEnvelope.test.ts`         | 1 failed, 104 passed: content K does not open |
| P3-L3, the seal's clearing of the ML-KEM secret (no test was asked)     | `deaddropPqHybrid.test.ts`        | 1 failed, 35 passed: the rebuild's note       |
| P3-L4, `parseDeadmanNoticePointer`: the pattern (old length check back) | `deadmanReleaseContracts.test.ts` | 1 failed, 4 passed: the id's form             |
| P3-L5, `decodeCanonicalBase64`: the length check before decoding        | `releaseEnvelope.test.ts`         | 1 failed, 104 passed: the 10 MB copy          |

### Still open

-   **The device-side record of a release's recipients (PR 4).**
    `armReleaseSwitch` now returns whom each release was sealed to, from the
    envelope the device built; the screen that keeps that record across
    sessions and refuses to re-seal a release to an account not on it is
    PR 4's. Until then, a server can still list, in the owner's view of
    switch A, a recipient A never named, and if the owner taps re-seal for
    that person the device seals A's key to them: the binding above holds
    the server to the switch and its own release, not to the people on it.
-   **The design's §8 number.** The design says PR 3 adds "a new residual
    risk R11", which is now the voice-token risk; part 2, which edits the
    design and `THREAT_MODEL.md`, makes it R12.
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
(§14's scratch runner, outside the repository; the table is at the end of
this section), and each time at least one test failed. The design document,
`TRUST.md`, `KNOWN_LIMITATIONS.md`, `THREAT_MODEL.md`, the legal changelog
and the deletion screen are edited here too; the trust page is regenerated.

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
    notice does not invite again".
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
    from eleven; the growth stops where the bounds say.
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
    disclosed in `TRUST.md` §1 as plaintext service rooms. Left as it is
    here; the `encrypted` doc now warns the next caller.

**P3b-M2. The deletion screen and `KNOWN_LIMITATIONS.md` said a fired switch
"stays readable to the people it named until 365 days after it fired"; for a
legacy switch, the only kind that can exist today, the payload is served for
ever**, since the sweep writes no `releasedAt` for one and the removal skips
every row without it; and the same file's later paragraph said the opposite
with no 365 days.

-   **Done.** Both sentences qualified: a release switch that fired stays
    readable until 365 days after it fired; a switch armed before releases
    (every switch that exists today) keeps its payload for the people it
    named with no removal date, because a release is not taken back. The
    two `KNOWN_LIMITATIONS.md` paragraphs now agree, and the deletion screen
    (`DataRetentionSection.tsx`) says the same. The removal is not extended
    to fired legacy switches: the design's "existing switches stay as they
    are" holds, and decision 20 asks the operator whether to extend it.
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
    releases costs their copies, not N scans.
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
    lock keeps the loops to one process in Postgres mode, as before.
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
    `notifier_threw`. `inviteToRoom` itself is unchanged: its eight callers
    read its `{ ok, status }` shape. Test: "a homeserver call that throws is
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
    removed"** now excepts the copy kept with a fired release switch, which
    goes 365 days after it fired; `KNOWN_LIMITATIONS.md` adds the fingerprint
    kept on the blanked copy rows.
-   **P3b-L10. What stays after the removal** is now stated in
    `KNOWN_LIMITATIONS.md`'s Retention bullet, the legal changelog, §11, §15
    and the deletion paragraph: whom it named and the fingerprint of the key
    each copy was sealed to, the label and timing, when it fired, and each
    notice's room, status and attempts until that person deletes their
    account. `recipient_fingerprint` is not blanked (the refuted SL-1, below).
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
    title say "before the body is parsed", not "before the body is read".
-   **P3b-L14. A deletion during an in-flight send marked the notice `sent`.**
    Done: before marking sent the notifier reads the row again and never
    overwrites a row that is no longer pending, and reads the account again
    and ends the notice with `recipient_gone` if it is gone. Test: "an
    account deletion that lands during a send stands" (the deletion through
    `confirmAccountDeletion` during a parked send; an account deleted another
    way with its rows untouched; a row ended during the send while the
    account exists: none marked sent).
-   **P3b-L15. The in-flight mutant was killed by a hang.** Done: the overlap
    test races the second tick against a timer and asserts its result, so
    the mutant fails an assertion (the table below).

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
| L4: /limits says why                                                                      | `deadman-releases.integration.test.ts`          | test 1: with the flag off, arming is refused with 409 before the body is read …  |
| L4: the 409 names the sweep                                                               | `deadman-releases.integration.test.ts`          | test 2: with the sweep switched off in the API’s own environment, arming is re…  |
| the route refuses while arming is closed                                                  | `deadman-releases.integration.test.ts`          | test 1: with the flag off, arming is refused with 409 before the body is read …  |
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

### Still open

-   **A recipient-side refusal of an owner** (decision 19), which the
    notifier and the release read would honour: PR 4's or later, the
    operator's. Until then `KNOWN_LIMITATIONS.md` says what any account with
    release keys can do to another's notices room, within the bounds.
-   **Fired legacy switches' payloads** are held with no removal date
    (decision 20); extending the 365-day removal to them is the operator's.
-   **The device-side record of a release's recipients** (part 1's review,
    PR 4) stands as before.
-   What the review did not verify stands: Postgres end to end through the
    routes (PGlite exercises the store and the migration), the multi-replica
    refresh of the two tables under a real transport, the write-behind crash
    window (from the code), anything against a real Synapse beyond the
    review's scratch run of the fork, and whether a deployment ever runs the
    sweep with `BLACKOUT_DEADMAN_SWEEP=0` after releases fired (the API now
    refuses to arm there; nothing can make an existing release's removal run).
-   An aside from the review, outside this PR: `GET /v1/deadman/releases`
    answered 200 (empty) to a still-valid token of a deleted account rather
    than 401; whether the auth middleware checks the user row still exists is
    worth a look.

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
