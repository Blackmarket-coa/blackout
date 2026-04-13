# Launch Smoke Suite

## Scope
This suite defines launch-blocking smoke coverage for:
- auth login/recovery
- room and DM messaging
- media upload
- moderation action
- basic governance path
- call flow with TURN

## Environment & Data Preconditions
- Staging environment is deployed from the release candidate build.
- Matrix homeserver stack is available with TURN configured and reachable.
- At least 4 seeded users exist:
  - `smoke_owner` (room admin / governance proposer)
  - `smoke_member_a`
  - `smoke_member_b`
  - `smoke_moderator` (moderation privileges)
- Seeded artifacts:
  - One room for messaging and moderation (`#smoke-launch`).
  - DM capability enabled between `smoke_member_a` and `smoke_member_b`.
  - Governance-enabled room/space where proposal and vote events are allowed.
- Media bucket and MXC serving path are writable/readable.
- Test accounts can receive password recovery email or equivalent recovery token in test harness.

## Pass/Fail Criteria (Launch Gate)

### Overall Suite Pass Criteria
- 100% of **release-blocker** smoke cases pass.
- No open defects mapped to Sev-1 or Sev-2 in scoped flows.
- Automated smoke run is green on release branch and staging rerun.
- Manual checks have captured timestamped evidence (run log + screenshots/video where applicable).

### Overall Suite Fail Criteria
Release is blocked if **any** of the following occur:
- Any release-blocker test fails.
- A release-blocker test is unexecutable due to product defect or infra issue without approved waiver.
- A Sev-1/Sev-2 defect is discovered during smoke execution.

## Release-Blocker Severity Definitions

| Severity | Definition | Launch Decision | Example in this suite |
|---|---|---|---|
| **Sev-1 (Critical Outage / Security)** | Core user path is unusable, data/security trust is broken, or a hard crash/data loss occurs with no workaround. | Immediate no-go. Must be fixed and re-verified before launch. | Login fails for valid users globally; TURN calls cannot connect at all; moderation ban applies to wrong user. |
| **Sev-2 (Major Functional Break)** | Key feature works only partially or unreliably; workaround is high-friction or unacceptable for launch expectations. | No-go unless explicit risk acceptance by release authority. | DM messages intermittently dropped; media upload succeeds but attachments fail to render for recipients. |
| **Sev-3 (Moderate Issue)** | Non-critical behavior defect with acceptable workaround; does not break launch-critical journey completion. | Go possible with documented known issue and follow-up commitment. | Recovery email has minor copy issue but reset flow completes. |
| **Sev-4 (Minor/Cosmetic)** | Cosmetic, low-impact issue with no meaningful user journey risk. | Does not block launch. | Small layout misalignment in governance vote result panel. |

## Smoke Test Cases

> IDs prefixed with `LS-` (Launch Smoke). Marked as **A** (Automated), **M** (Manual), or **A+M** (both required).

### 1) Auth Login / Recovery

| ID | Type | Scenario | Steps (condensed) | Expected Result | Blocker? |
|---|---|---|---|---|---|
| LS-AUTH-01 | A+M | Valid login | Open app, login as `smoke_member_a` with valid credentials. | Redirect to authenticated landing; user session established; no auth error toast. | Yes |
| LS-AUTH-02 | A+M | Invalid password handling | Attempt login with known user and wrong password once. | Login denied with user-safe error; no crash; no session created. | Yes |
| LS-AUTH-03 | A+M | Password recovery request | Trigger "forgot password" for `smoke_member_a`. | Recovery email/token issued; success confirmation shown without account enumeration leakage. | Yes |
| LS-AUTH-04 | M | Recovery completion | Use recovery link/token, set new password, login with new password. | Password reset completes; old password invalidated; new password works. | Yes |
| LS-AUTH-05 | A | Session continuity after refresh | Login then hard-refresh app route. | Session persists (or expected re-auth prompt), app remains usable. | Yes |

### 2) Room + DM Messaging

| ID | Type | Scenario | Steps (condensed) | Expected Result | Blocker? |
|---|---|---|---|---|---|
| LS-MSG-01 | A+M | Room message send/receive | `smoke_member_a` sends text in `#smoke-launch`, `smoke_member_b` observes. | Message appears in sender timeline and recipient timeline in-order. | Yes |
| LS-MSG-02 | A+M | DM message send/receive | Start DM from `smoke_member_a` to `smoke_member_b`, send message. | DM thread created (if absent), message visible bi-directionally. | Yes |
| LS-MSG-03 | A | Mention + unread indicator | Mention `@smoke_member_b` in room. | Recipient gets mention/unread badge and can jump to message. | No |
| LS-MSG-04 | M | Offline/reconnect delivery | Receiver disconnects temporarily, sender posts messages, receiver reconnects. | Backlog syncs without message loss/duplication. | Yes |

### 3) Media Upload

| ID | Type | Scenario | Steps (condensed) | Expected Result | Blocker? |
|---|---|---|---|---|---|
| LS-MEDIA-01 | A+M | Upload image to room | Upload PNG/JPEG in `#smoke-launch`. | Upload succeeds; thumbnail/preview renders; recipients can open media. | Yes |
| LS-MEDIA-02 | A+M | Upload file to DM | Upload non-image file (e.g., PDF/TXT) in DM. | Attachment appears with filename/size; recipient can download/open. | Yes |
| LS-MEDIA-03 | A | File size/type guardrails | Attempt disallowed size/type upload. | User gets clear validation error; no broken timeline event. | No |
| LS-MEDIA-04 | M | Retry/resume UX on transient failure | Interrupt network during upload and restore. | Client shows retry/failure state; successful retry produces exactly one sent media event. | Yes |

### 4) Moderation Action

| ID | Type | Scenario | Steps (condensed) | Expected Result | Blocker? |
|---|---|---|---|---|---|
| LS-MOD-01 | A+M | Moderator removes abusive message | `smoke_moderator` redacts/removes target message in room. | Message is redacted for participants per policy; moderation event recorded. | Yes |
| LS-MOD-02 | M | Ban user from room | Moderator bans `smoke_member_b` from `#smoke-launch`. | Banned user cannot send/rejoin while ban active. | Yes |
| LS-MOD-03 | A | Permission boundary | Non-moderator attempts moderation action. | Action denied; no moderation side-effect applied. | Yes |

### 5) Basic Governance Path

| ID | Type | Scenario | Steps (condensed) | Expected Result | Blocker? |
|---|---|---|---|---|---|
| LS-GOV-01 | A+M | Create governance proposal | `smoke_owner` opens governance UI and submits proposal. | Proposal event persists and is visible to eligible voters. | Yes |
| LS-GOV-02 | A+M | Cast vote and tally visibility | `smoke_member_a` votes on proposal. | Vote accepted once; tally/status updates as designed. | Yes |
| LS-GOV-03 | M | Proposal state transition | Advance proposal to closed/finalized state using configured rule/time shortcut. | Final status displayed correctly and immutable per rules. | Yes |

### 6) Call Flow with TURN

| ID | Type | Scenario | Steps (condensed) | Expected Result | Blocker? |
|---|---|---|---|---|---|
| LS-CALL-01 | A+M | 1:1 call setup via TURN | Place call between `smoke_member_a` and `smoke_member_b` on restricted network profile requiring relay. | Call connects successfully using TURN relay candidate; bi-directional audio established. | Yes |
| LS-CALL-02 | M | Mid-call stability | Maintain call for 3+ minutes with packet jitter simulation. | Call remains connected; acceptable audio continuity; no forced disconnect. | Yes |
| LS-CALL-03 | A | Mute/unmute signaling | Toggle mute from caller side. | Remote mute state updates and media behavior matches UI state. | No |
| LS-CALL-04 | M | Disconnect/rejoin behavior | Drop one participant network and recover. | Rejoin/renegotiation succeeds within acceptable timeout window. | Yes |

## Automated Execution Set (CI/Staging)
Prioritize these IDs in a runnable automated smoke job:
- Auth: LS-AUTH-01, LS-AUTH-02, LS-AUTH-03, LS-AUTH-05
- Messaging: LS-MSG-01, LS-MSG-02, LS-MSG-03
- Media: LS-MEDIA-01, LS-MEDIA-02, LS-MEDIA-03
- Moderation: LS-MOD-01, LS-MOD-03
- Governance: LS-GOV-01, LS-GOV-02
- Calls: LS-CALL-01, LS-CALL-03

### Suggested automation harness split
- API/service-level smoke: auth, moderation permissions, governance event creation/voting.
- Client E2E smoke: login UX, room/DM messaging, media upload render, basic call connect flow.
- Synthetic post-deploy probe: login + send message + upload image + place short TURN call.

## Manual Execution Set (Release Day)
Execute all **M** and **A+M** cases in a staged runbook with evidence capture:
1. Auth recovery completion (LS-AUTH-04).
2. Messaging reconnect behavior (LS-MSG-04).
3. Media transient failure recovery (LS-MEDIA-04).
4. Moderation ban behavior (LS-MOD-02).
5. Governance finalization transition (LS-GOV-03).
6. TURN stability and reconnect checks (LS-CALL-02, LS-CALL-04).

## Exit Report Template
- Build SHA:
- Environment:
- Start/End UTC:
- Executor(s):
- Automated summary: `passed / failed / skipped`
- Manual summary: `passed / failed / blocked`
- Defects by severity: Sev-1 / Sev-2 / Sev-3 / Sev-4
- Waivers approved (if any):
- Final recommendation: **GO / NO-GO**
