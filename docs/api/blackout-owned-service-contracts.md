# Blackout-Owned Service Contracts (Backend Platform)

Status: draft v0.1  
Audience: backend platform, frontend SDK, security/reliability  
Transport boundary: **These contracts define Blackout-owned business APIs only**. Matrix room-state/event transport remains external and is treated as an integration dependency.

---

## 1) Design goals and boundaries

- Typed, stable contracts consumable from `@blackout/sdk` and generated client types.
- Explicit role/capability authorization per operation.
- Critical-action auditability with immutable audit records and correlation IDs.
- Clear separation of:
  - **Business actions** (community lifecycle, moderation, marketplace dispatch, automations), vs.
  - **Matrix concerns** (room state, event send/receive, federation internals).

### Shared envelope and typing conventions

All HTTP APIs are mounted under `/v1/platform/*` and use:

- `Authorization: Bearer <access_token>`
- `X-Request-Id: <uuid>` (optional from client; server generates if absent)
- `X-Idempotency-Key: <opaque>` (required for mutating endpoints marked idempotent)

Response envelope:

```ts
export type ApiSuccess<T> = {
  ok: true;
  requestId: string;
  data: T;
};

export type ApiError = {
  ok: false;
  requestId: string;
  error: {
    code:
      | 'UNAUTHORIZED'
      | 'FORBIDDEN'
      | 'VALIDATION_ERROR'
      | 'NOT_FOUND'
      | 'CONFLICT'
      | 'RATE_LIMITED'
      | 'ABUSE_BLOCKED'
      | 'INTERNAL_ERROR';
    message: string;
    details?: Record<string, unknown>;
  };
};
```

### Core identity and authorization primitives

```ts
export type ActorContext = {
  actorId: string;
  tenantId: string;
  sessionId: string;
  roles: Role[];
  capabilities: Capability[];
};

export type Role =
  | 'owner'
  | 'admin'
  | 'moderator'
  | 'operator'
  | 'automation'
  | 'member'
  | 'seller'
  | 'dispatcher';

export type Capability =
  | 'community:read'
  | 'community:write'
  | 'community:members:manage'
  | 'policy:map:write'
  | 'moderation:case:read'
  | 'moderation:case:write'
  | 'moderation:execute'
  | 'automation:trigger'
  | 'automation:manage'
  | 'voice:session:manage'
  | 'marketplace:listing:write'
  | 'marketplace:dispatch:manage'
  | 'audit:read';
```

---

## 2) Endpoint map (service-oriented)

## Community service

- `POST /v1/platform/community.communities`
- `PATCH /v1/platform/community.communities/{communityId}`
- `GET /v1/platform/community.communities/{communityId}`
- `POST /v1/platform/community.memberships/{communityId}:upsert`
- `POST /v1/platform/community.memberships/{communityId}:remove`
- `GET /v1/platform/community.memberships/{communityId}`

## Role/policy mapper

- `PUT /v1/platform/policy.role-bindings/{communityId}`
- `GET /v1/platform/policy.role-bindings/{communityId}`
- `PUT /v1/platform/policy.capability-overrides/{communityId}`
- `GET /v1/platform/policy.capability-overrides/{communityId}`
- `POST /v1/platform/policy.simulate-access`

## Moderation workflows

- `POST /v1/platform/moderation.cases`
- `GET /v1/platform/moderation.cases/{caseId}`
- `POST /v1/platform/moderation.cases/{caseId}:assign`
- `POST /v1/platform/moderation.cases/{caseId}:resolve`
- `POST /v1/platform/moderation.actions`
- `GET /v1/platform/moderation.actions?communityId={communityId}`

## Automation gateway

- `POST /v1/platform/automation.workflows`
- `PATCH /v1/platform/automation.workflows/{workflowId}`
- `POST /v1/platform/automation.workflows/{workflowId}:test`
- `POST /v1/platform/automation.triggers/{triggerType}`
- `GET /v1/platform/automation.executions/{executionId}`

## Optional voice session coordination

- `POST /v1/platform/voice.sessions`
- `POST /v1/platform/voice.sessions/{sessionId}:invite`
- `POST /v1/platform/voice.sessions/{sessionId}:handoff`
- `POST /v1/platform/voice.sessions/{sessionId}:terminate`
- `GET /v1/platform/voice.sessions/{sessionId}`

## Marketplace / dispatch (scaffold)

- `POST /v1/platform/marketplace.listings`
- `PATCH /v1/platform/marketplace.listings/{listingId}`
- `POST /v1/platform/dispatch.orders`
- `POST /v1/platform/dispatch.orders/{orderId}:allocate`
- `POST /v1/platform/dispatch.orders/{orderId}:status`
- `GET /v1/platform/dispatch.orders/{orderId}`

---

## 3) Request / response schemas

> JSON-schema-equivalent TypeScript contracts for frontend SDK generation.

## Community service schemas

```ts
export type Community = {
  id: string;
  tenantId: string;
  slug: string;
  name: string;
  description?: string;
  visibility: 'private' | 'invite_only' | 'public';
  createdAt: string;
  updatedAt: string;
};

export type CreateCommunityRequest = {
  slug: string;
  name: string;
  description?: string;
  visibility: 'private' | 'invite_only' | 'public';
};

export type UpsertMembershipRequest = {
  principalId: string;
  role: Role;
  expiresAt?: string;
  reason?: string;
};

export type MembershipRecord = {
  communityId: string;
  principalId: string;
  role: Role;
  status: 'active' | 'suspended' | 'revoked';
  grantedBy: string;
  grantedAt: string;
  expiresAt?: string;
};
```

Authorization:
- create/update community: `community:write`
- membership manage: `community:members:manage`

Audit events:
- `community.created`
- `community.updated`
- `community.membership.upserted`
- `community.membership.removed`

## Role/policy mapper schemas

```ts
export type RoleBinding = {
  role: Role;
  capabilities: Capability[];
};

export type PutRoleBindingsRequest = {
  bindings: RoleBinding[];
  etag?: string;
};

export type CapabilityOverride = {
  principalId: string;
  allow: Capability[];
  deny: Capability[];
  expiresAt?: string;
};

export type SimulateAccessRequest = {
  communityId: string;
  principalId: string;
  action: Capability;
  resource?: { type: string; id?: string };
};

export type SimulateAccessResponse = {
  allowed: boolean;
  matchedRules: string[];
  deniedBy?: string;
};
```

Authorization:
- write bindings/overrides: `policy:map:write`
- simulate access: `policy:map:write` or `audit:read`

Audit events:
- `policy.role_bindings.updated`
- `policy.capability_overrides.updated`

## Moderation workflow schemas

```ts
export type ModerationCase = {
  id: string;
  communityId: string;
  subject: { kind: 'user' | 'content' | 'listing'; id: string };
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'open' | 'triaged' | 'actioned' | 'resolved' | 'dismissed';
  createdBy: string;
  assignedTo?: string;
  createdAt: string;
  updatedAt: string;
};

export type CreateModerationCaseRequest = {
  communityId: string;
  subject: { kind: 'user' | 'content' | 'listing'; id: string };
  reasonCode: string;
  narrative?: string;
  evidenceRefs?: string[];
  priority?: 'normal' | 'urgent';
};

export type ExecuteModerationActionRequest = {
  caseId: string;
  action:
    | { type: 'warn'; principalId: string }
    | { type: 'mute'; principalId: string; durationSec: number }
    | { type: 'suspend'; principalId: string; durationSec?: number }
    | { type: 'remove_content'; contentId: string }
    | { type: 'freeze_listing'; listingId: string };
  rationale: string;
};
```

Authorization:
- case read/write: `moderation:case:read` / `moderation:case:write`
- irreversible or user-impacting action execution: `moderation:execute`

Audit events:
- `moderation.case.created`
- `moderation.case.assigned`
- `moderation.action.executed`
- `moderation.case.resolved`

## Automation gateway schemas

```ts
export type AutomationWorkflow = {
  id: string;
  tenantId: string;
  name: string;
  enabled: boolean;
  trigger: { type: string; filter?: Record<string, unknown> };
  steps: Array<
    | { kind: 'http_call'; endpointRef: string; timeoutMs?: number }
    | { kind: 'moderation_action'; template: Record<string, unknown> }
    | { kind: 'policy_override'; template: Record<string, unknown> }
    | { kind: 'dispatch_update'; template: Record<string, unknown> }
  >;
  createdAt: string;
  updatedAt: string;
};

export type TriggerAutomationRequest = {
  eventId: string;
  payload: Record<string, unknown>;
  dryRun?: boolean;
};

export type AutomationExecution = {
  id: string;
  workflowId: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'blocked';
  startedAt: string;
  finishedAt?: string;
  failureReason?: string;
};
```

Authorization:
- workflow create/update: `automation:manage`
- trigger execution: `automation:trigger`

Audit events:
- `automation.workflow.created`
- `automation.workflow.updated`
- `automation.execution.started`
- `automation.execution.finished`
- `automation.execution.blocked`

## Voice session coordination schemas (optional)

```ts
export type VoiceSession = {
  id: string;
  communityId: string;
  roomKey: string;
  state: 'scheduled' | 'active' | 'handoff' | 'ended';
  hostId: string;
  participantCount: number;
  startedAt?: string;
  endedAt?: string;
};

export type CreateVoiceSessionRequest = {
  communityId: string;
  roomKey: string;
  scheduledFor?: string;
  metadata?: Record<string, unknown>;
};

export type VoiceHandoffRequest = {
  newHostId: string;
  reason?: string;
};
```

Authorization:
- session management: `voice:session:manage`

Audit events:
- `voice.session.created`
- `voice.session.invited`
- `voice.session.handoff`
- `voice.session.terminated`

## Marketplace / dispatch schemas (scaffold)

```ts
export type Listing = {
  id: string;
  sellerId: string;
  communityId: string;
  title: string;
  status: 'draft' | 'active' | 'frozen' | 'archived';
  price: { amount: number; currency: string };
  createdAt: string;
  updatedAt: string;
};

export type DispatchOrder = {
  id: string;
  listingId: string;
  buyerId: string;
  state:
    | 'pending_verification'
    | 'awaiting_allocation'
    | 'allocated'
    | 'in_transit'
    | 'delivered'
    | 'cancelled';
  assignedDispatcherId?: string;
  createdAt: string;
  updatedAt: string;
};

export type AllocateDispatchRequest = {
  dispatcherId: string;
  etaMinutes?: number;
  note?: string;
};
```

Authorization:
- listing write: `marketplace:listing:write`
- dispatch state/allocation: `marketplace:dispatch:manage`

Audit events:
- `marketplace.listing.created`
- `marketplace.listing.updated`
- `dispatch.order.created`
- `dispatch.order.allocated`
- `dispatch.order.status_changed`

---

## 4) SDK method map (`@blackout/sdk`)

```ts
export interface BlackoutPlatformSdk {
  // community
  createCommunity(input: CreateCommunityRequest): Promise<ApiSuccess<Community>>;
  updateCommunity(communityId: string, patch: Partial<CreateCommunityRequest>): Promise<ApiSuccess<Community>>;
  getCommunity(communityId: string): Promise<ApiSuccess<Community>>;
  upsertMembership(communityId: string, input: UpsertMembershipRequest): Promise<ApiSuccess<MembershipRecord>>;
  removeMembership(communityId: string, principalId: string, reason?: string): Promise<ApiSuccess<{ removed: true }>>;

  // policy mapper
  putRoleBindings(communityId: string, input: PutRoleBindingsRequest): Promise<ApiSuccess<{ version: string }>>;
  getRoleBindings(communityId: string): Promise<ApiSuccess<{ bindings: RoleBinding[]; version: string }>>;
  putCapabilityOverrides(
    communityId: string,
    input: { overrides: CapabilityOverride[]; etag?: string },
  ): Promise<ApiSuccess<{ version: string }>>;
  getCapabilityOverrides(communityId: string): Promise<ApiSuccess<{ overrides: CapabilityOverride[]; version: string }>>;
  simulateAccess(input: SimulateAccessRequest): Promise<ApiSuccess<SimulateAccessResponse>>;

  // moderation
  createModerationCase(input: CreateModerationCaseRequest): Promise<ApiSuccess<ModerationCase>>;
  getModerationCase(caseId: string): Promise<ApiSuccess<ModerationCase>>;
  assignModerationCase(caseId: string, assigneeId: string): Promise<ApiSuccess<ModerationCase>>;
  executeModerationAction(input: ExecuteModerationActionRequest): Promise<ApiSuccess<{ actionId: string; status: 'accepted' }>>;
  resolveModerationCase(caseId: string, resolution: string): Promise<ApiSuccess<ModerationCase>>;

  // automation
  createWorkflow(input: Omit<AutomationWorkflow, 'id' | 'createdAt' | 'updatedAt'>): Promise<ApiSuccess<AutomationWorkflow>>;
  updateWorkflow(workflowId: string, patch: Partial<AutomationWorkflow>): Promise<ApiSuccess<AutomationWorkflow>>;
  testWorkflow(workflowId: string, input: TriggerAutomationRequest): Promise<ApiSuccess<AutomationExecution>>;
  triggerAutomation(triggerType: string, input: TriggerAutomationRequest): Promise<ApiSuccess<AutomationExecution>>;
  getAutomationExecution(executionId: string): Promise<ApiSuccess<AutomationExecution>>;

  // voice (optional)
  createVoiceSession(input: CreateVoiceSessionRequest): Promise<ApiSuccess<VoiceSession>>;
  inviteVoiceParticipants(sessionId: string, participantIds: string[]): Promise<ApiSuccess<{ invited: number }>>;
  handoffVoiceSession(sessionId: string, input: VoiceHandoffRequest): Promise<ApiSuccess<VoiceSession>>;
  terminateVoiceSession(sessionId: string, reason?: string): Promise<ApiSuccess<VoiceSession>>;
  getVoiceSession(sessionId: string): Promise<ApiSuccess<VoiceSession>>;

  // marketplace / dispatch scaffold
  createListing(input: Omit<Listing, 'id' | 'createdAt' | 'updatedAt' | 'status'>): Promise<ApiSuccess<Listing>>;
  updateListing(listingId: string, patch: Partial<Listing>): Promise<ApiSuccess<Listing>>;
  createDispatchOrder(input: { listingId: string; buyerId: string }): Promise<ApiSuccess<DispatchOrder>>;
  allocateDispatch(orderId: string, input: AllocateDispatchRequest): Promise<ApiSuccess<DispatchOrder>>;
  updateDispatchStatus(orderId: string, state: DispatchOrder['state'], note?: string): Promise<ApiSuccess<DispatchOrder>>;
  getDispatchOrder(orderId: string): Promise<ApiSuccess<DispatchOrder>>;
}
```

---

## 5) Audit logging contract (critical actions)

For critical endpoints (policy changes, moderation execution, automation updates/triggers, dispatch allocation), emit a durable audit record:

```ts
export type AuditRecord = {
  id: string;
  occurredAt: string;
  requestId: string;
  actor: { actorId: string; roles: Role[] };
  action: string;
  resource: { type: string; id: string; communityId?: string };
  outcome: 'success' | 'denied' | 'failed';
  reasonCode?: string;
  delta?: Record<string, unknown>;
  sourceIpHash?: string;
  userAgentHash?: string;
};
```

Controls:
- Append-only storage with tamper-evidence (hash chain or signed batches).
- PII minimization with irreversible hashing for IP/UA.
- Retention tiering by jurisdiction/tenant policy.
- Read access gated by `audit:read` and break-glass policy.

---

## 6) Threat and abuse controls checklist

- [ ] AuthN hardening: short-lived access tokens, sender-constrained refresh, session binding.
- [ ] AuthZ default-deny: every route declares required capabilities.
- [ ] Step-up auth for sensitive actions (`moderation:execute`, policy rewrites, dispatch allocation override).
- [ ] Idempotency keys for all mutation endpoints susceptible to retries.
- [ ] Rate limits per actor + tenant + IP bucket (including adaptive throttling).
- [ ] Abuse heuristics: burst case creation, policy churn spikes, automation trigger storms.
- [ ] Automation guardrails: allowlisted actions, per-workflow execution quotas, dead-letter queue.
- [ ] Moderation safety: dual-control for critical sanctions, reversible windows where possible.
- [ ] Payload validation: strict schemas, max body size, recursive depth limits.
- [ ] Input provenance tags for user-generated evidence and external webhook sources.
- [ ] Audit integrity: immutable log pipeline, periodic verification jobs, alert on gaps.
- [ ] Secure observability: redact secrets/PII in traces and logs.
- [ ] Incident hooks: SIEM export, anomaly alerts, and automated lockout playbooks.
- [ ] Supply-chain controls for automation connectors (signed connector manifests).
- [ ] Tenant isolation checks in every data access path (no cross-tenant joins without explicit policy).

---

## 7) Matrix separation contract

The above APIs **must not** leak Matrix room-state/event internals. Integration pattern:

- Platform services expose domain-level entities (`ModerationCase`, `DispatchOrder`, `VoiceSession`).
- A dedicated integration adapter translates domain events to/from Matrix transport events.
- Any Matrix-specific identifiers are stored as opaque foreign references (e.g., `matrixRef?: string`) and never required by SDK callers.
- Failures in Matrix transport should degrade to retriable integration status, not corrupt platform domain state.

This keeps frontend SDK usage stable even if Matrix transport implementation changes.
