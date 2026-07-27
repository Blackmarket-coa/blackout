<!--
  ⚠️ DRAFT — NOT LEGAL ADVICE, NOT YET IN EFFECT.
  Complete every [BRACKETED PLACEHOLDER] and have qualified legal counsel
  review before publishing or referencing from the product. See ./README.md.
-->

# Blackout Privacy Policy (DRAFT)

**Effective date:** [EFFECTIVE DATE — leave blank until published]
**Last updated:** [DATE]

This Privacy Policy explains how [LEGAL ENTITY NAME] ("Blackout", "we", "us")
collects, uses, retains, and shares information when you use the Blackout
communication platform (the "Service"). Blackout is a privacy-first, end-to-end
encrypted communication platform built on the Matrix protocol.

> **Draft note.** The practices below must be reconciled with what the software
> actually does. Primary references in this repository: the data-classification
> matrix (`docs/features/privacy-first-phase0/data-classification-matrix.md`),
> the threat model (`THREAT_MODEL.md`), the metadata-minimization notes
> (`docs/security/metadata-minimization.md`), and the retention notes
> (`apps/blackout-server/docs/message_retention_policies.md`).

## 1. Who we are

The data controller is [LEGAL ENTITY NAME], [REGISTERED ADDRESS]. For privacy
questions or to exercise your rights, contact [PRIVACY CONTACT EMAIL] (and, if
appointed, our Data Protection Officer at [DPO CONTACT]).

## 2. What we collect

**a. Information you provide**

-   **Account information:** username and the credentials you register with. An
    email address is optional and, when provided, is used for account recovery and
    security notifications. (Accounts created via a Matrix identity may have no
    email on file.)
-   **Content you send:** messages, media, and files. Direct and encrypted room
    content is **end-to-end encrypted** — we cannot read it. [CONFIRM SCOPE:
    which surfaces are E2EE vs. server-visible.]
-   **Payment information:** when you tip, subscribe, or transact, payments are
    processed by third-party processors ([Stripe / Patreon / Lago — CONFIRM]). We
    do **not** store full payment-card numbers; we retain transaction metadata
    (amounts, timestamps, processor references) needed to operate the feature.
-   **Support and reports:** information you include in bug reports or support
    requests.

**b. Information collected automatically**

-   **Operational/security metadata:** IP address and request metadata used for
    rate limiting, abuse prevention, and security. [CONFIRM RETENTION WINDOW.]
-   **Matrix protocol metadata:** by design of the federated Matrix protocol, the
    homeserver processes metadata such as room membership, timestamps, and the
    social graph. See `THREAT_MODEL.md` for the metadata-visibility model.
-   **Device/session information:** to maintain your logged-in sessions and enable
    "log out everywhere".
-   **Diagnostics:** if enabled by the operator, aggregated error and performance
    telemetry ([Sentry / OpenTelemetry — CONFIRM which, and whether enabled by
    default]). User identifiers in server logs are pseudonymized.

**c. What we do not do**

-   We do not sell your personal data.
-   We cannot read end-to-end encrypted message content.
-   [CONFIRM: no third-party advertising/tracking cookies, or describe them.]

## 3. How we use information

-   To provide, maintain, and secure the Service.
-   To process payments and creator-economy features you initiate.
-   To prevent abuse, fraud, and violations of the Terms of Service.
-   To communicate essential account and security notices.
-   To comply with legal obligations.

Legal bases (where GDPR applies): performance of a contract, our legitimate
interests in operating and securing the Service, your consent (where required),
and compliance with legal obligations. [CONFIRM per-purpose mapping with
counsel.]

## 4. Encryption

Message content in encrypted rooms and direct messages is protected with Matrix
end-to-end encryption (Megolm/Olm via the Matrix crypto stack); encryption keys
are held on your devices. **Real-time call/voice media is currently transported
over TLS to the media server and is not yet end-to-end encrypted** — see
`THREAT_MODEL.md`. [UPDATE when SFrame media E2EE ships.]

## 5. How we share information

-   **Service providers / sub-processors:** payment processors, email delivery,
    hosting/infrastructure, and (if enabled) error/telemetry providers, acting on
    our behalf under contract. [MAINTAIN A CURRENT SUB-PROCESSOR LIST.]
-   **Federation:** if you interact with users or rooms on other Matrix
    homeservers, protocol data necessary for delivery is shared with those servers
    per the Matrix protocol.
-   **Legal:** where required by law, valid legal process, or to protect rights,
    safety, and the integrity of the Service. See our legal-response practices at
    `docs/features/privacy-first-phase0/legal-response-playbook.md`.
-   **Business transfers:** in a merger, acquisition, or asset sale, subject to
    this Policy. [CONFIRM.]

## 6. Data retention

We keep personal data only as long as necessary for the purposes above or as
required by law. [SPECIFY concrete windows per data category — accounts, logs,
security metadata, payment records — reconciled with the retention notes and the
data-classification matrix.] Encrypted content is retained per your and your
rooms' settings.

## 7. Your rights

Depending on your jurisdiction (e.g. GDPR/EEA, UK, CCPA/California), you may have
the right to access, correct, delete, port, or restrict processing of your
personal data, and to object or withdraw consent. Blackout provides in-product
data export and account deletion (see the data-deletion feature in the app). To
exercise rights, use those tools or contact [PRIVACY CONTACT EMAIL]. You may
also lodge a complaint with your local supervisory authority. [CONFIRM the
server-side effect of deletion matches this statement.]

## 8. International transfers

If we transfer personal data across borders, we use appropriate safeguards
(e.g. Standard Contractual Clauses). [CONFIRM mechanisms and regions with
counsel.]

## 9. Children

The Service is not directed to children under [AGE], and we do not knowingly
collect their personal data. [CONFIRM minimum age with counsel.]

## 10. Changes to this Policy

We will post updates here and, for material changes, provide notice through the
Service. [DEFINE notice mechanism.]

## 11. Contact

[LEGAL ENTITY NAME], [ADDRESS] — [PRIVACY CONTACT EMAIL].
