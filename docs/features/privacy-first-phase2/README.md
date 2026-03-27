# Phase 2 Implementation Artifacts — Client-Only Steganography Toolkit

This directory contains completion evidence for **Phase 2 — Client-Only Steganography Toolkit** from the privacy-first steganographic messaging roadmap.

## Workstream deliverables

### 1. Emoji carrier encoder/decoder with deterministic chunking

- `src/steganography/EmojiStego.ts` — Byte↔emoji encoding with 256-emoji pool, invisible ZWJ/ZWNJ/ZWS marker prefix, and 16-byte binary header.
- `src/steganography/CarrierChunking.ts` — Deterministic chunking with `mxstego:v1:` framing for transport-safe splitting.
- `src/steganography/CarrierTransport.ts` — Transport normalization and reassembly of chunked carriers.

### 2. PNG-only image stego with integrity checks (AEAD + CRC/optional RS)

- `src/steganography/ImageStego.ts` — Least Significant Bit (LSB) encoding into PNG images with 17-byte binary header (magic + version + length + CRC-32 + expiry).
- `src/steganography/crc32.ts` — CRC-32 checksums for payload integrity verification.
- `src/steganography/ReedSolomon.ts` — Reed-Solomon error correction (16 symbols default) for emoji carriers.

### 3. Carrier compatibility validator for platform-safe character sets

- `src/steganography/CarrierCompatibility.ts` — Validates emoji carriers against platform rendering consistency rules.
- `src/steganography/EmojiValidator.ts` — Validates the emoji pool for bijection, UTF-8 round-trip safety, and cross-platform distinctness.

### 4. Versioning format for stego payload headers

- `src/steganography/types.ts` — `STEGO_PROTOCOL_VERSION`, `STEGO_MAGIC` bytes, and `StegoHeader` type with version-aware forward compatibility.
- `src/steganography/EnvelopeV1.ts` — Versioned envelope serialization/deserialization.
- `src/steganography/StegoCodec.ts` — Rejects messages with `version > STEGO_PROTOCOL_VERSION` via `UnsupportedVersion` error code.

## Security requirements evidence

### No stego encode/decode network calls

All steganography encode and decode operations execute entirely in-process without issuing network requests. Automated tests in `Phase2SecurityExit-test.ts` intercept `fetch()` and `XMLHttpRequest.open()` and assert zero remote network calls across all code paths:

- Emoji encode/decode (StegoCodec + low-level EmojiStego)
- EmojiString encode/decode
- Image encode/decode (raw ImageData, no network fetch)
- Reed-Solomon encode/decode
- Carrier compatibility validation
- Carrier chunking/reassembly
- Carrier transport prepare/normalize

The one use of `fetch()` in `ImageStego.ts:dataUrlToImageData()` operates exclusively on `data:` URLs (local embedded data), never remote HTTP(S) endpoints.

### Decoding only after decryption and authenticity checks

The StegoCodec operates on already-encrypted payloads — it receives encrypted bytes from the Matrix E2EE layer and returns encrypted bytes to the caller. The codec never performs decryption:

- `StegoCodec.decode()` returns `{ payload: Uint8Array }` — raw encrypted bytes
- `header.plaintext` is always `""` — the caller is responsible for Matrix E2EE decryption
- CRC-32 integrity verification runs before any payload is returned
- Reed-Solomon error correction validates data integrity for emoji strategies
- Protocol version checking rejects unknown versions before processing

Automated assertions in `Phase2SecurityExit-test.ts` verify all three properties.

## Exit criteria evidence

### Property tests for round-trip correctness and corruption handling

Automated property-style tests cover:

- **Round-trip correctness**: 50 random payloads per emoji strategy + 20 random image payloads + 30 carrier transport round-trips (`Phase2SecurityExit-test.ts`, `CarrierTransportProperty-test.ts`)
- **Corruption handling**: Adversarial mutation corpus, fuzzed random strings, and truncated/reversed/appended carriers (`StegoCodecHardening-test.ts`)
- **Boundary conditions**: Empty input, maximum payload sizes, protocol version mismatches (`StegoCodecDiagnostic-test.ts`)

### Telemetry review confirms no plaintext/stego payload collection

The `StegoDecodeFailureTelemetryEvent` type is deliberately restricted to aggregate fields:

| Field              | Type                                                              | Leakage risk                                |
| ------------------ | ----------------------------------------------------------------- | ------------------------------------------- |
| `code`             | Error code enum                                                   | None — finite set of machine-readable codes |
| `carrierType`      | `"emoji" \| "image" \| "unknown"`                                 | None — coarse 3-value enum                  |
| `lengthBucket`     | `"0" \| "1-32" \| "33-128" \| "129-512" \| "513-2048" \| "2049+"` | None — bucketed, no exact sizes             |
| `rsAttempted`      | boolean                                                           | None                                        |
| `rsCorrected`      | boolean                                                           | None                                        |
| `hasPartialHeader` | boolean                                                           | None                                        |

Automated tests in `Phase2SecurityExit-test.ts` verify:

1. Only the six allowed keys appear in telemetry events.
2. Serialized telemetry never contains plaintext, raw carrier content, or base64-encoded payloads.
3. Length is always bucketed (string range), never an exact number.
4. Carrier type is always one of three coarse values.
5. Successful decodes produce zero telemetry events (no payload exposure path).

## Test file inventory

| Test file                                                        | Coverage area                                |
| ---------------------------------------------------------------- | -------------------------------------------- |
| `test/unit-tests/steganography/Phase2SecurityExit-test.ts`       | Phase 2 security/exit requirement assertions |
| `test/unit-tests/steganography/StegoCodec-test.ts`               | Core codec encode/decode, strategy selection |
| `test/unit-tests/steganography/StegoCodecDiagnostic-test.ts`     | Diagnostic error reporting                   |
| `test/unit-tests/steganography/StegoCodecHardening-test.ts`      | Adversarial inputs, fuzzing                  |
| `test/unit-tests/steganography/EmojiStego-test.ts`               | Emoji encoding/decoding                      |
| `test/unit-tests/steganography/ImageStego-test.ts`               | Image LSB steganography                      |
| `test/unit-tests/steganography/ReedSolomon-test.ts`              | Error correction                             |
| `test/unit-tests/steganography/EmojiValidator-test.ts`           | Emoji pool validation                        |
| `test/unit-tests/steganography/EnvelopeV1-test.ts`               | Envelope serialization                       |
| `test/unit-tests/steganography/StegoDetector-test.ts`            | Incoming message detection                   |
| `test/unit-tests/steganography/CarrierChunking-test.ts`          | Chunking logic                               |
| `test/unit-tests/steganography/CarrierCompatibility-test.ts`     | Carrier validation                           |
| `test/unit-tests/steganography/CarrierTransport-test.ts`         | Transport normalization                      |
| `test/unit-tests/steganography/CarrierTransportProperty-test.ts` | Property-based transport tests               |
| `test/unit-tests/steganography/crc32-test.ts`                    | Checksum validation                          |

## Phase 2 completion checklist

- [x] Emoji carrier encoder/decoder with deterministic chunking.
- [x] PNG-only image stego with integrity checks (CRC-32 + Reed-Solomon).
- [x] Carrier compatibility validator for platform-safe character sets.
- [x] Versioning format for stego payload headers inside encrypted bodies.
- [x] No stego encode/decode network calls (automated assertions).
- [x] Decoding only after decryption and authenticity checks (automated assertions).
- [x] Property tests for round-trip correctness and corruption handling.
- [x] Telemetry review confirms no plaintext/stego payload collection (automated assertions).
