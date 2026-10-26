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

**Status, 2026-10-26:** written and reviewed (§13) before the build. Nothing
here makes a release possible: arming stays closed until PR 4 turns
`BLACKOUT_DEADMAN_RELEASES` on, and that flag is set nowhere.

**State read:** the PR 2 branch at `6ae33bc2e2` (#991), on `develop` at
`8a20ad6a0b`. **Read** means a claim rests on the code or a standard; **Run**
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
bring it forward (§10, R12 in `THREAT_MODEL.md`).

| ID  | Question or finding                                                                                            | Verified          | Disposition                                                                                                                                                                                                      |
| --- | -------------------------------------------------------------------------------------------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E1  | What is sealed to whom: one ciphertext, its key sealed to every recipient and to the owner                     | Read (design)     | Kept; the owner's own copy is what re-sealing opens, and what it costs is stated (§1)                                                                                                                            |
| E2  | The key encapsulation against HPKE's DHKEM and X-Wing                                                          | Read (standards)  | Kept, with a transcript; one sealing function for dead drops and releases (§2)                                                                                                                                   |
| E3  | The recipient's public keys must be bound into the wrap key (C5)                                               | Read              | Bound through the recipient's fingerprint in the transcript, with the owner's, the release id and both accounts (§2, §3)                                                                                         |
| E4  | An all-zero X25519 output (C8, RFC 9180 §7.1.4)                                                                | Run; test         | Refused on both sides, inside the shared function, so dead drops get the check too (§2)                                                                                                                          |
| E5  | New labels must not be confusable with PR 2's                                                                  | Read; test        | Four new NUL-terminated labels, each used in one place; the table of all eight is in §3                                                                                                                          |
| E6  | AES-GCM does not commit to its key (C7)                                                                        | Read (literature) | SHA-256 of a label and the content key in every copy's signed bytes, checked before the content is decrypted (§4)                                                                                                |
| E7  | One header every recipient receives alike (C7)                                                                 | Read (analysis)   | The header's fields are in every copy's signature; no separate header signature, and why (§4, §5)                                                                                                                |
| E8  | Signatures are transferable (C15), and the server holds them from arming on                                    | Read (analysis)   | Stated, for the operator: no deniability is claimed anywhere (§5)                                                                                                                                                |
| E9  | One form per value: JSON shapes, base64, ids                                                                   | Read; test        | Exact field sets, canonical base64 at exact lengths, a fixed-length sealed copy, ids by pattern; JSON is never signed (§6)                                                                                       |
| E10 | Padding and size                                                                                               | Read; test        | Text up to 64 KiB, padded to 1, 16 or 256 KiB; the API refuses a content ciphertext of any other length (§7)                                                                                                     |
| E11 | Identity v1 has no sequence number (decision 19)                                                               | Read              | Nothing is added to the identity; the API checks current identities at arming and re-sealing, the client applies H1 (§9)                                                                                         |
| E12 | When a comparison counts (H1)                                                                                  | Read              | `releaseComparisonState`: only for the account's current identity, stale once a newer one is seen or the compared one is listed as replaced; when sealing, the owner's own key must not have changed either (§9) |
| E13 | A fired release must stay checkable after its owner deletes the account, which erases their release identities | Read              | The owner's identity at arming is kept with the release, and goes with it; the deletion texts say so (§1, §11)                                                                                                   |
| E14 | Re-sealing to a recipient's new key does not take back the old copy                                            | Read (analysis)   | Stated: after a lost device, cancel and arm again, which makes a new content key (§10)                                                                                                                           |
| E15 | What a hostile server can and cannot do                                                                        | Read (analysis)   | §10; hold back, delay and bring forward are accepted (design §3) and named as R12                                                                                                                                |
| E16 | Notices and what they carry (design §5)                                                                        | Read              | A pointer only, in an unencrypted room the bot owns; nothing names the owner, the label, other people or any time (§11)                                                                                          |

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
is used in exactly one place:

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
    key are never derived from the same `info`.
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
(otherwise the owner arms again).

**The recipient, before showing anything** (`openReleaseCopy`): the header
and the copy pass `parseReleaseEnvelope`'s checks; the copy names the
recipient's account and the fingerprint of one of the key sets the device
holds (a replaced one included, since the owner may not have re-sealed yet);
the owner's identity verifies and its fingerprint is the header's; the
signature verifies; the X25519 output is not zero; the wrap opens; K matches
C; the content opens under the release id and owner as associated data; the
padding and the UTF-8 are valid. Whether the owner's key is one the
recipient compared, and the comparison still counts, is a separate check
(§9), which the app must make before saying who sent it.

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
-   **Why that is enough for ordering:** if anyone makes an older key
    current, the owner's device sees a newer identity than the one compared,
    asks for a new comparison, and that comparison fails unless the
    recipient's device holds the same key. A key served under a recipient's
    name cannot get a sealed copy without a matching code.
-   **After the release** the same rule applies to the recipient's view of
    the owner's key. If the owner replaces their keys, or deletes their
    account, after the release, a recipient's comparison stops counting, and
    PR 4's screen can no longer say the release was signed by the key the
    recipient compared; it can say which key signed it, and when the
    comparison was made.

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
and Bob (recipient) are PR 2's vector identities. Fixed inputs: the release
id, K, the content nonce, the message, and for each copy the ephemeral
X25519 scalar, the 32-byte ML-KEM encapsulation seed and the wrap nonce.
Pinned outputs: the padded message's length, the associated data, the
content ciphertext and its hash, the commitment, each copy's transcript,
shared secrets, wrap key, sealed copy, signed bytes and signature, and the
whole envelope. The test rebuilds every byte string from this record's tables
with `node:crypto` (X25519 through `KeyObject`s, HKDF through `hkdfSync`,
AES-256-GCM through `createCipheriv`, Ed25519 through `sign`, SHA-256 through
`createHash`) and noble's ML-KEM with an explicit seed, which is the only
ML-KEM in the tree (PR 2's L7).

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

## Decisions for the operator to confirm or veto

1.  The release id is the switch id, a UUID the owner's device picks; a
    taken id is refused with 409.
2.  The owner's own sealed copy is stored, so re-sealing works without K
    kept on a device, and whoever holds the owner's release keys and session
    can read the message before release (§1).
3.  The owner's public identity is kept with each release switch, so a fired
    release stays checkable after the owner deletes their account, until it
    is removed after 365 days (E13).
4.  At most 20 live (armed or in grace) release switches per owner, a bound
    on storage of about 10 MB per account.
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

-   Everything about the homeserver is read in the fork's code, not run:
    `is_direct` on a `createRoom` invite (`synapse/handlers/room.py`) and on
    a membership set through the state endpoint
    (`synapse/rest/client/room.py`), that an `m.text` in a two-member room
    notifies and an invite notifies, and how long transaction ids are kept.
-   WebCrypto X25519 and Ed25519 and the small-order behaviour on engines
    other than Node's; ML-KEM only through `@noble/post-quantum`.
-   The security arguments in §2 and §4 are from the cited analyses, read,
    not re-proved; the construction has had no external review.

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
