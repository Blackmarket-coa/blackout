# Minimal Legal Response Playbook (Phase 0)

This playbook defines what the system can provide in legal processes without contradicting E2EE and client-side steganography guarantees.

## 1. Operating posture

- Provide lawful, scoped metadata responses where required.
- Do not claim capabilities the system does not have.
- Preserve cryptographic integrity and user safety guarantees.

## 2. Data categories for response

### Can generally provide (subject to jurisdiction and lawful process)

- Account registration metadata (timestamps, account identifiers).
- Billing/subscription records held by commerce providers.
- Operational service logs (request timestamps, coarse routing/service events).

### Cannot provide by design

- Message plaintext.
- Decoded stego payload content.
- End-user private keys or decrypted room keys.
- Historical plaintext archives that were never collected.

## 3. Intake and triage workflow

1. Validate legal request scope, jurisdiction, and authority.
2. Map requested fields to the data classification matrix.
3. Reject or narrow requests that exceed system capability or lawful scope.
4. Produce response package with chain-of-custody metadata.
5. Record request in transparency ledger (where legally allowed).

## 4. Escalation triggers

Escalate to legal + security leadership when requests:

- demand decryption capabilities that do not exist,
- seek broad proactive monitoring inconsistent with architecture,
- conflict with local law/data minimization requirements,
- require emergency disclosure workflows.

## 5. Internal guardrails

- Legal tooling must not include plaintext-content search interfaces.
- Response generation uses pre-approved metadata exports only.
- Every response references request ID, legal basis, and reviewer approvals.

## 6. Transparency and accountability

- Publish periodic transparency metrics when lawful:
    - number/type of legal requests,
    - percentage fulfilled/partially fulfilled/rejected,
    - categories of data produced.
- Include plain-language statement that E2EE plaintext is not server-accessible.
