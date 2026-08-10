<!--
  ⚠️ DRAFT TEMPLATES — NOT LEGAL ADVICE, NOT YET IN EFFECT.
  These documents were generated as a starting point for the Blackout launch.
  They MUST be reviewed and completed by qualified legal counsel before being
  published or referenced from the product. Do not represent them as effective
  policy until that review is done and the [BRACKETED] placeholders are filled.
-->

# Blackout — Legal Documents (DRAFT)

This directory holds first-party draft legal documents for the Blackout
platform, created to close the pre-launch gap where no Privacy Policy or Terms
of Service existed in the repository (audit finding **H11**).

| File                       | Purpose                                               | Status                              |
| -------------------------- | ----------------------------------------------------- | ----------------------------------- |
| `privacy-policy.md`        | How Blackout collects, uses, retains, and shares data | **DRAFT — counsel review required** |
| `terms-of-service.md`      | The agreement between Blackout and its users          | **DRAFT — counsel review required** |
| `CHANGELOG.md`             | Dated record of every privacy/monetization commitment | **In effect**                       |
| `policy-change-process.md` | How those commitments are allowed to change           | **In effect**                       |

The two documents marked _in effect_ are engineering and product commitments
backed by verifiable code, and are live now. They are **not** a substitute for
the counsel-reviewed Privacy Policy and Terms above, and neither they nor
[`TRUST.md`](../../TRUST.md) should be described as a published privacy policy
until that review lands.

## Before launch (checklist)

-   [ ] Have qualified legal counsel review and complete both documents.
-   [ ] Fill every `[BRACKETED PLACEHOLDER]` (legal entity, jurisdiction, contact
        addresses, DPO, sub-processor list, governing law, effective date).
-   [ ] Reconcile the data practices described here with what the code actually
        does (see the data-classification matrix under
        `docs/features/privacy-first-phase0/`).
-   [ ] Publish the finalized documents at stable public URLs.
-   [ ] Wire them into the registration terms flow. The client's terms
        acceptance is a Matrix UIA `m.login.terms` step
        (`apps/blackout-client/src/app/components/uia-stages/TermsStage.tsx`), which
        is driven by the **homeserver** — configure the Synapse
        `user_consent` / policy URLs (and any `m.login.terms` policies) to point at
        the published documents so acceptance is recorded at sign-up.
-   [ ] Link both documents from the app footer / settings and the marketing site.
-   [ ] Set a review cadence (e.g. annually and on any material data-practice
        change).

## Why this matters for GA

Blackout processes private messages, payment data (Stripe/Patreon/Lago), and
email, and already presents a terms-acceptance screen at registration. Shipping
to general availability without a published Privacy Policy and Terms of Service
is a legal blocker in most jurisdictions (GDPR/CCPA transparency obligations and
payment-processor requirements), and it undermines the acceptance UI that is
already in the product.

_These drafts are engineering scaffolding to unblock that work — they are not a
substitute for legal counsel._
