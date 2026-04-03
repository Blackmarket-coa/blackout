# Backlog Prioritization — Ranked Top 20 (2026-04-03)

## Prioritization method
Ranking is optimized by three required lenses:
1. **User friction removed per point of effort** (highest weight)
2. **Operational fit expansion potential** (second weight)
3. **Strategic differentiation retained** (third weight)

### Scoring model
- Friction Removed (FR): 1-5
- Operational Fit Expansion (OF): 1-5
- Differentiation Retained (DR): 1-5
- Effort points (EP): 1, 2, 3, 5, 8
- **Priority Score = ((FR * 0.5) + (OF * 0.3) + (DR * 0.2)) / EP**

---

## Ranked top 20

| Rank | Backlog Item | FR | OF | DR | EP | Priority Score | Rationale |
|---:|---|---:|---:|---:|---:|---:|---|
| 1 | Template-first room creation + hide advanced metadata | 5 | 4 | 4 | 2 | 2.30 | Removes immediate setup friction; preserves power via optional customization; broadly useful across all segments. |
| 2 | Invite flow reorder + assisted prompts | 5 | 4 | 3 | 2 | 2.20 | Directly improves activation bottleneck with low engineering cost; boosts team-size onboarding success. |
| 3 | 4-step first-run wizard hardening (create/join→room→invite→thread/call) | 5 | 5 | 3 | 3 | 1.53 | Biggest TTFV driver; unlocks pragmatic team adoption while keeping trust primitives in place. |
| 4 | Admin advanced settings collapsed by default (RBAC-gated) | 4 | 4 | 5 | 3 | 1.47 | Reduces member confusion while reinforcing governance differentiation for admins. |
| 5 | Legacy deep-link resolver with context banners | 4 | 3 | 4 | 2 | 1.85 | High friction reduction for existing power users; low migration risk and preserves trust workflows. |
| 6 | Day-7 lifecycle admin nudges (governance-lite prompts) | 3 | 5 | 4 | 2 | 1.85 | Expands operational fit from starter to governance without day-0 overload. |
| 7 | Role-conditioned nav shell cleanup | 4 | 4 | 4 | 3 | 1.33 | Strong simplification gain and discoverability clarity for both members and admins. |
| 8 | Onboarding funnel telemetry completeness (step-level) | 3 | 4 | 4 | 2 | 1.65 | Enables evidence-based tuning and gate discipline; medium direct user impact but critical leverage. |
| 9 | Go/no-go dashboard auto-alerting (KPI-01..07) | 2 | 4 | 4 | 2 | 1.30 | Operational guardrail that protects rollout quality and prevents silent regressions. |
| 10 | Governance workflow template pack (urgent/budget/membership) | 3 | 5 | 5 | 3 | 1.43 | Improves Governance tier adoption and reinforces differentiation through usable governance primitives. |
| 11 | Attestation fast-path for common approvals | 3 | 4 | 5 | 3 | 1.33 | Reduces governance latency while preserving trust guarantees. |
| 12 | Settings search zero-result helper + guided recovery | 3 | 3 | 3 | 2 | 1.35 | Moderately reduces confusion tickets and accelerates self-service recovery. |
| 13 | Admin discoverability banner experiments | 2 | 4 | 4 | 2 | 1.20 | Helps advanced-module adoption with low effort; especially valuable in Starter→Governance expansion. |
| 14 | Support triage taxonomy + top-5 issue routing loop | 3 | 4 | 3 | 3 | 1.03 | Converts support pain into repeatable product fixes; moderate effort. |
| 15 | Cross-surface onboarding parity fixes (web/desktop/mobile contract) | 3 | 4 | 4 | 5 | 0.80 | Important for consistency and expansion, but effort-heavy for this cycle. |
| 16 | Federation settings progressive entry (Day-30 eligible admins) | 1 | 4 | 5 | 3 | 0.97 | Strategic differentiation critical, but limited immediate friction reduction. |
| 17 | Policy simulation MVP (admin preview) | 1 | 4 | 5 | 5 | 0.58 | High strategic value, but lower short-term ROI per effort for current sprint horizon. |
| 18 | Sovereignty onboarding workshop kit productization | 1 | 3 | 5 | 5 | 0.50 | Expands top-tier fit; low immediate impact on core TTFV and activation. |
| 19 | Advanced key-management UX polish | 1 | 3 | 5 | 5 | 0.50 | Retains differentiation but should follow stabilization of activation and governance latency. |
| 20 | Pricing/packaging model experimentation | 1 | 3 | 4 | 5 | 0.44 | Useful later for GTM optimization; not a near-term friction reducer. |

---

## 2-week cut line (next sprint)

### Above cut line (commit now)
1. Template-first room creation + hide advanced metadata
2. Invite flow reorder + assisted prompts
3. 4-step first-run wizard hardening
4. Admin advanced settings collapsed by default (RBAC-gated)
5. Legacy deep-link resolver with context banners
6. Day-7 lifecycle admin nudges
7. Role-conditioned nav shell cleanup
8. Onboarding funnel telemetry completeness

### Just below cut line (prepare, not commit)
9. Go/no-go dashboard auto-alerting
10. Governance workflow template pack
11. Attestation fast-path for common approvals
12. Settings search zero-result helper

### Deferred (explicit scope cuts for this sprint)
- Cross-surface parity full pass (limit to critical parity bugs only)
- Federation progressive entry enhancements beyond baseline gating
- Policy simulation MVP
- Sovereignty onboarding kit productization
- Advanced key-management UX polish
- Pricing/packaging experiments

---

## Why this cut line is optimal now
- Maximizes **friction removed per effort** on the first-value path.
- Still advances **operational fit** via lifecycle nudges and governance discoverability.
- Preserves **strategic differentiation** by keeping governance/federation capabilities intact, while sequencing visibility rather than forcing complexity in week-0 UX.
