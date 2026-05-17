# Challenge 05 — Steganography round-trip

| Field | Value |
|---|---|
| Slug | `05-stego` |
| GitHub label | `challenge:stego` |
| Aid-post urgency | `medium` |
| Primary surface | `area:steganography` |
| Related docs | [`docs/security/free-tier-steganography-text-emoji.md`](../../security/free-tier-steganography-text-emoji.md), [`src/steganography/`](../../../src/steganography/) |

## The challenge

Encode a steganographic message in a supported carrier, send it to another
tester through Blackout, and verify they can decode it cleanly. Then break
it: try edge cases that should fail gracefully (truncation, re-encoding,
copy/paste through a chat input).

Cover both available carriers if you can: **text** and **emoji**.

## Aid post

```json
{
  "type": "need",
  "category": "tech_support",
  "urgency": "medium",
  "status": "open",
  "title": "C05 — Steganography encode → send → decode round-trip",
  "body": "Encode a stego message, send through Blackout, partner decodes. Then try edge cases (truncation, re-encoding, copy/paste). Brief: docs/coliseum/challenges/05-stego.md",
  "metadata": {
    "challengeId": "05-stego",
    "githubLabel": "challenge:stego"
  }
}
```

## Governance proposal stub

```
Title: Stego carrier surface area for V1.1
Type: multiple_choice
Body: |
  Findings from challenge 05 will tell us which carriers are robust at
  V1 and which need polish. Vote on the V1.1 priority:
    A. Polish existing carriers (text, emoji) before adding any
    B. Add one new carrier (image) and accept text/emoji rough edges
    C. Treat stego as feature-frozen for V1.1; ship fixes only on demand
Quorum: 6+ votes
Deadline: H84
```

## How to claim and report

1. Claim the aid post.
2. Pair with another tester. One encodes a message, the other decodes.
3. Test the happy path first: encode → send via Blackout DM → decode →
   confirm match.
4. Test the edges: truncate the carrier mid-message; re-encode it through a
   different stego function and try to decode the original; copy/paste it
   through a different chat field; quote-reply it.
5. File a [Coliseum finding](https://github.com/Blackmarket-coa/blackout/issues/new?template=coliseum-finding.yml)
   for each distinct behavior. Selecting **05 — Steganography**.

## What a high-signal finding looks like

> Text carrier (zero-width space variant) encoded `"meeting at 9"` —
> decoded correctly end-to-end via Blackout DM. Copy-pasted the carrier
> through a quote-reply: decode returned empty string (expected: either
> original message or explicit decode failure). Edge-case truncation at
> half the carrier length returned a garbled partial; ideal would be a
> decode-failure signal rather than silent partial.

## Why this challenge

Stego is one of Blackout's distinguishing features. It's also the kind of
feature that's easy to ship but hard to make robust against real-world
text manipulation (auto-correct, emoji rendering, URL shorteners). The
testers who try edge cases here give us a much faster signal than internal
review alone.
