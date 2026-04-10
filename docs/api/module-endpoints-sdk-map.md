# Server Feature Module Map (Frontend Domain Parity)

Canonical backend feature modules mirror frontend feature domains:

- `governance`
- `forum`
- `deaddrop`
- `moderation`

Each module is registered in `packages/api/src/modules/index.ts` and mounted beneath `/v1/<module>` (and `/api/<module>` while legacy alias is enabled).

## Governance module

- Routes
  - `POST /v1/governance/proposals`
  - `POST /v1/governance/votes`
  - `GET /v1/governance/proposals/:proposalId`
  - `GET /v1/governance/events`
- Authz
  - read: `governance.read`
  - write: `governance.write`
- Persistence
  - `db.createVote`, `db.castVote`, `db.getVote`, `db.getVoteEntries`
- Domain events
  - `governance.proposal.created`
  - `governance.vote.cast`
- SDK bindings
  - `createGovernanceActions().createProposal()` → `POST /v1/governance/proposals`
  - `createGovernanceActions().castVote()` → `POST /v1/governance/votes`
  - `createClientQueries().getGovernanceProposal()` → `GET /v1/governance/proposals/:proposalId`
  - `createClientQueries().getGovernanceEvents()` → `GET /v1/governance/events`

## Forum module

- Routes
  - `POST /v1/forum/posts`
  - `GET /v1/forum/posts?communityId=<id>`
  - `GET /v1/forum/events`
- Authz
  - read: `forum.read`
  - write: `forum.write`
- Persistence
  - `db.createForumPost`, `db.listForumPosts`
- Domain events
  - `forum.post.created`
- SDK bindings
  - `createForumActions().createPost()` → `POST /v1/forum/posts`
  - `createClientQueries().listForumPosts()` → `GET /v1/forum/posts`
  - `createClientQueries().getForumEvents()` → `GET /v1/forum/events`

## Deaddrop module

- Routes
  - `POST /v1/deaddrop`
  - `POST /v1/deaddrop/open`
  - `GET /v1/deaddrop/events`
- Authz
  - read: `deaddrop.read`
  - write: `deaddrop.write`
- Persistence
  - `db.createDeadDrop`, `db.openDeadDrop`
- Domain events
  - `deaddrop.created`
  - `deaddrop.opened`
- SDK bindings
  - `createDeadDropActions().createDeadDrop()` → `POST /v1/deaddrop`
  - `createDeadDropActions().openDeadDrop()` → `POST /v1/deaddrop/open`
  - `createClientQueries().getDeadDropEvents()` → `GET /v1/deaddrop/events`

## Moderation module

- Routes
  - `POST /v1/moderation/actions`
  - `GET /v1/moderation/actions?communityId=<id>`
  - `GET /v1/moderation/events`
- Authz
  - read: `moderation.read`
  - write: `moderation.write`
- Persistence
  - `db.createModerationAction`, `db.listModerationActions`
- Domain events
  - `moderation.action.taken`
- SDK bindings
  - `createModerationActions().takeAction()` → `POST /v1/moderation/actions`
  - `createClientQueries().listModerationActions()` → `GET /v1/moderation/actions`
  - `createClientQueries().getModerationEvents()` → `GET /v1/moderation/events`
