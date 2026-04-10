# Scope boundary (canonical)

`docs/scope_boundary.md` is the single source of truth for scope classification used by project trackers.

## in-scope (required-now)

Work that is required to satisfy the current release objective and cannot be deferred without increasing release risk or violating explicit acceptance criteria.

## required-later

Work that is accepted as necessary, but not required to achieve the current release objective. This work remains planned and tracked for a subsequent release window.

## not-in-scope

Work that is intentionally excluded from the current release objective. It may be roadmap material, optional process improvement, or strategic follow-on work.

## deferred-with-signoff

Work that would normally be in-scope, but is deferred only with explicit sign-off from the accountable owner. Deferred items must include:

- approver,
- defer decision date,
- rationale,
- and trigger/date for re-evaluation.

## mapping rules for classifying tasks

Apply the first matching rule:

1. If an item blocks current release acceptance criteria or creates unacceptable operational/compliance risk now, classify as **in-scope (required-now)**.
2. If an item is required by roadmap but does not block current release acceptance, classify as **required-later**.
3. If an item is intentionally excluded from current release commitments, classify as **not-in-scope**.
4. If an in-scope item is postponed by explicit decision, classify as **deferred-with-signoff** and attach sign-off metadata.
5. Every open tracker item must carry one of these labels, and any document listing scope labels must reference this file instead of redefining terms.
