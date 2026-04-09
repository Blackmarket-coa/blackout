# Free-Tier Steganography Design for Text + Emoji Channels

## 1) Goals and constraints

**Goal:** allow low-cost, low-risk hidden signaling in ordinary chat messages using only Unicode text and emoji, with no binary attachments and no server-side secret storage.

**Free-tier constraints:**
- No custom ML classification in the critical path.
- No per-user dedicated key escrow.
- Must survive copy/paste and mainstream mobile keyboards.
- Decode should be feasible in <10 ms for short messages on low-end phones.

## 2) Channel model

We define two independent covert channels:

1. **Text channel (T-channel):** encodes bits via controlled lexical/syntactic variants in natural text.
2. **Emoji channel (E-channel):** encodes bits via emoji choice and sequence order from constrained sets.

A message can carry either channel or both. Combined payload is interleaved and protected with integrity checks.

## 3) Threat model (pragmatic)

- **Passive observer:** can read plaintext messages but does not know session secret.
- **Active normalizer:** may autocorrect punctuation, normalize whitespace, or replace unsupported emoji.
- **Abusive sender:** may try to embed prohibited content or evade moderation.

Out of scope for free tier:
- Robustness against targeted forensic linguistic analysis.
- High-bandwidth exfiltration.

## 4) Session bootstrap

Each conversation derives a **stego session key**:

- `K_session = HKDF(master_secret, conversation_id || epoch_day)`
- Rotate daily (`epoch_day`) to limit replay and pattern accumulation.

The key is used for:
- Pseudorandom variant selection.
- Payload whitening (`XOR` with stream from `K_session`).
- MAC tag generation.

No key = no reliable decode.

## 5) Encoding rules

## 5.1 Common frame format (both channels)

Before mapping to tokens, payload is framed:

- `version` (3 bits)
- `channel_flags` (2 bits: text, emoji)
- `payload_len` (12 bits, bytes)
- `payload` (N bytes)
- `crc16` (16 bits)
- `tag` (32-bit truncated HMAC-SHA256 over all prior fields + nonce)
- `nonce` (24 bits random)

Then apply:
1. Whitening with `K_session` stream.
2. FEC block code (recommended Hamming(15,11) for free tier).

## 5.2 Text channel (T-channel) mapping

Use a curated **variant dictionary** of semantically equivalent forms that are moderation-safe and language-specific.

Examples of 1-bit pairs:
- `"and"` (0) vs `"&"` (1)
- `"because"` (0) vs `"cuz"` (1)
- Oxford comma absent (0) vs present (1) in 3-item lists

Examples of 2-bit sets (size 4):
- sentence ending: `.`, `!`, `…`, `~`

Rules:
- Only substitute when fluency score remains above threshold.
- Max 1 substitution per 12 visible words.
- Never alter protected spans: URLs, mentions, code blocks, legal disclosures.
- Maintain readability grade within ±1 of source baseline.

Bit assignment is keyed permutation per day to reduce statistical fingerprinting.

## 5.3 Emoji channel (E-channel) mapping

Use platform-stable emoji sets with high cross-platform rendering consistency.

Create groups of 4 interchangeable emoji per semantic bucket (2 bits/symbol), e.g.:
- positive reaction set: 🙂, 😄, 😊, 😌
- confirmation set: 👍, 👌, ✅, 🙌

Rules:
- Max 1 stego emoji per 20 visible characters.
- Avoid skin-tone and gender modifiers in free tier (too normalization-prone).
- Avoid ZWJ-heavy emoji (family/profession composites).
- If native message already has emoji, piggyback by swapping within same semantic bucket.

Optional order coding:
- For exactly 3 emoji at end-of-message, permutation index (0..5) carries 2 bits (discard 2 permutations).

## 6) Decoding rules

1. Detect candidate carriers (text variants, emoji buckets) under current and previous day key.
2. Recover symbol stream in message order.
3. Reverse keyed permutation mapping.
4. FEC decode and correct bit errors.
5. De-whiten with `K_session`.
6. Validate `crc16` and HMAC tag.
7. Accept only if both integrity checks pass.

If decode fails, return `NO_PAYLOAD` silently (do not expose partial plaintext).

## 7) Failure detection

Failure classes:
- **Structural:** insufficient symbols for declared length.
- **Integrity:** CRC mismatch.
- **Authenticity:** HMAC tag mismatch.
- **Confidence:** carrier anomaly score too high (likely natural text collision).

Client telemetry counters (privacy-safe aggregate):
- attempted decodes
- integrity failures
- corrected-by-FEC count
- hard failures after FEC

Server policy for free tier: if channel in a conversation exceeds 30% hard failures over 24h, auto-disable stego for that conversation for next 24h.

## 8) False-positive mitigation

- Require **dual validation**: CRC + keyed HMAC tag.
- Minimum payload threshold: reject frames <8 bytes unless explicit control opcode.
- Daily key rotation + nonce uniqueness window.
- Carrier confidence gate:
  - T-channel: minimum 5 valid variant opportunities in message.
  - E-channel: minimum 2 valid bucket hits.
- Language lock: decode only when detected language matches sender profile or channel default.

This makes accidental natural-language collisions extremely unlikely.

## 9) Performance limits (free tier defaults)

- Max encoded payload per message: **64 bytes** before FEC.
- Max decode budget per message: **10 ms** on reference low-end device.
- Max candidate messages scanned in timeline pass: **200**.
- Memory cap for decode buffers: **256 KB**.
- Recommended throughput: **<= 1 hidden message per 5 visible messages** to reduce detectability.

Expected net bitrate (realistic):
- T-channel: 0.2–0.6 bits/word.
- E-channel: 1–2 bits per stego emoji.
- Combined typical chat: ~10–40 hidden bytes/message at good carrier density.

## 10) Abuse and safety considerations

## 10.1 Abuse risks

- Covert coordination for harassment or evasion.
- Hidden distribution of policy-violating instructions.
- Exfiltration of personal data in moderated chats.

## 10.2 Safety controls for free tier

1. **Opt-in + transparency:** conversation setting indicates stego is enabled.
2. **Rate limits:** strict per-user hidden payload quota/day.
3. **Moderation-first pipeline:** moderation runs on visible text regardless of stego.
4. **Stego kill-switch:** trust & safety can disable globally or by conversation.
5. **Keyword-trigger hardening:** when high-risk terms detected, disable encoding for message.
6. **No file bridge:** free tier cannot encode arbitrary binary blobs; UTF-8 text only.
7. **Auditability:** store only metadata (decode success/failure counts), not recovered payload, unless explicit enterprise compliance mode.

## 10.3 User safety UX

- Show non-technical warning: "Hidden metadata channel is on."
- One-tap disable per chat.
- If repeated decode failures occur, prompt to reset session key.

## 11) Reference pseudocode

```text
encode(msg, payload, K):
  frame = pack(version, flags, len(payload), payload, crc16(payload), nonce)
  frame.tag = trunc32(HMAC(K, frame))
  bits = FEC_encode(whiten(frame, K))
  carriers = select_carriers(msg)
  mapped = map_bits_to_text_emoji(bits, carriers, K)
  return render(msg, mapped)

decode(msg, K):
  symbols = extract_symbols(msg)
  bits = unmap_symbols(symbols, K)
  raw = dewhiten(FEC_decode(bits), K)
  if !valid_crc(raw) or !valid_hmac(raw, K): return NO_PAYLOAD
  return raw.payload
```

## 12) Rollout recommendation

- Phase 1: E-channel only, 16-byte payload cap, internal beta.
- Phase 2: add T-channel for English with conservative dictionary.
- Phase 3: per-locale dictionaries + adaptive carrier scoring.

This staged rollout contains risk while validating false-positive and abuse controls.
